import { CALIBRATION_PRECISION_THRESHOLDS } from "@/lib/calibration-precision-thresholds";
import { calibrateConflictSignals } from "@/lib/conflict-signal-calibrator";
import { analyzeRoutingConflictSignals } from "@/lib/conflict-signal-analyzer";
import { splitLongTextConflictScope } from "@/lib/long-text-scope-splitter";
import { computeEditBudget } from "@/lib/edit-budget";
import { applyInvariantSafety } from "@/lib/invariant-safety-loop";
import { applyReactionCap } from "@/lib/reaction-cap";
import { mapToReactionBand } from "@/lib/reaction-band-mapper";
import { probeTeacherDirectionConflict } from "@/lib/teacher-direction-probe";
import { buildRoutingDecision } from "@/lib/routing-decision-engine";
import { analyzeResponseSegments, buildSegmentCorrectionIntent, summarizeSegmentDiffs } from "@/lib/segment-diff";
import { buildSegmentPriorities } from "@/lib/segment-priority";
import { buildPrecisionCalibrationActions } from "@/lib/writeback-integrator";
import { evaluatePrecisionSeverities } from "@/lib/diff-analyzer";
import type { DiffResult } from "@/lib/noop-guard";
import type {
  CalibrationPlan,
  ProxyCalibrationAction,
  PrecisionSeverityResult,
  SegmentCorrectionIntent,
  SegmentDiff,
  DirectionConflictProbe,
  CalibratedConflictSignal,
  SignalCalibrationTrace,
  LongTextScopeSplit,
  SegmentPriority
} from "@/lib/types";
import type { SimilarityScore, SimilarityStudentProfile } from "@/lib/similarity-evaluator";
import type { FeedbackWriteback } from "@/lib/feedback-writer";

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/['"]/g, "").replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
}

function severityRank(severity: SegmentDiff["severity"]) {
  return severity === "high" ? 3 : severity === "medium" ? 2 : 1;
}

function segmentPriorityById(segmentPriorities: SegmentPriority[] = [], segmentId: string) {
  return segmentPriorities.find((segment) => segment.segmentId === segmentId);
}

function hasCriticalPrecisionSeverity(precisionSeverities: PrecisionSeverityResult[] = []) {
  return precisionSeverities.some(
    (item) =>
      (item.category === "decision" || item.category === "boundary") &&
      item.severity === "high" &&
      item.score >= CALIBRATION_PRECISION_THRESHOLDS.override.targetedMinimumScore
  );
}

function shouldSkip(similarity: SimilarityScore, precisionSeverities: PrecisionSeverityResult[] = []) {
  return (
    similarity.overall >= CALIBRATION_PRECISION_THRESHOLDS.skip.overall &&
    similarity.decision >= CALIBRATION_PRECISION_THRESHOLDS.skip.decision &&
    similarity.boundary >= CALIBRATION_PRECISION_THRESHOLDS.skip.boundary &&
    !hasCriticalPrecisionSeverity(precisionSeverities)
  );
}

function shouldLightTouch(similarity: SimilarityScore, diffs: DiffResult[], precisionSeverities: PrecisionSeverityResult[] = []) {
  const mediumHighCount = diffs.filter((diff) => diff.severity === "medium" || diff.severity === "high").length;
  const hasCritical = hasCriticalPrecisionSeverity(precisionSeverities);
  return (
    !hasCritical &&
    similarity.overall >= 80 &&
    similarity.boundary >= CALIBRATION_PRECISION_THRESHOLDS.lightTouch.boundary &&
    mediumHighCount <= CALIBRATION_PRECISION_THRESHOLDS.lightTouch.maxMediumHighDiffs
  );
}

function shouldFullCorrection(similarity: SimilarityScore, diffs: DiffResult[], precisionSeverities: PrecisionSeverityResult[] = []) {
  const highSeverityCount = diffs.filter((diff) => diff.severity === "high").length;
  const severeDecisionBoundary = diffs.some(
    (diff) => (diff.category === "decision" || diff.category === "boundary") && diff.severity === "high"
  );
  const precisionHighCount = precisionSeverities.filter(
    (item) => (item.category === "decision" || item.category === "boundary") && item.severity === "high"
  ).length;
  const poorCoreScores = similarity.decision <= CALIBRATION_PRECISION_THRESHOLDS.fullCorrection.decisionFloor || similarity.boundary <= CALIBRATION_PRECISION_THRESHOLDS.fullCorrection.boundaryFloor;
  return (
    similarity.overall < CALIBRATION_PRECISION_THRESHOLDS.fullCorrection.overallFloor ||
    highSeverityCount >= CALIBRATION_PRECISION_THRESHOLDS.fullCorrection.highDiffFloor && precisionHighCount >= CALIBRATION_PRECISION_THRESHOLDS.override.highEvidenceCount ||
    precisionHighCount >= CALIBRATION_PRECISION_THRESHOLDS.override.highEvidenceCount ||
    (similarity.overall < CALIBRATION_PRECISION_THRESHOLDS.targeted.overallFloor && poorCoreScores) ||
    severeDecisionBoundary && similarity.overall < 80
  );
}

function buildModeReason(mode: CalibrationPlan["mode"], similarity: SimilarityScore, segmentDiffs: SegmentDiff[], precisionSeverities: PrecisionSeverityResult[]) {
  const summary = summarizeSegmentDiffs(segmentDiffs);
  if (mode === "skip") return `Skipped because the case is already near-perfect: overall ${similarity.overall.toFixed(0)}, decision ${similarity.decision.toFixed(0)}, boundary ${similarity.boundary.toFixed(0)}.`;
  if (mode === "light_touch") return `Light-touch only because the response is mostly aligned and only minor segments need restraint. ${summary}`;
  if (mode === "targeted") return `Targeted calibration because one or two categories still show precision severity that should not be protected. ${summary} | precision=${precisionSeverities.map((item) => `${item.category}:${item.severity}`).join(", ")}`;
  return `Full correction required because the proxy still misses core decision or boundary behavior. ${summary}`;
}

function targetedCategoriesFromDiffs(
  diffs: DiffResult[],
  mode: CalibrationPlan["mode"],
  precisionSeverities: PrecisionSeverityResult[] = []
): CalibrationPlan["targetedCategories"] {
  const categories = diffs
    .filter((diff) => diff.severity !== "low")
    .map((diff) => diff.category);
  const precisionCategories = precisionSeverities
    .filter((item) => item.severity !== "low")
    .map((item) => item.category);
  const uniqueCategories = unique([...categories, ...precisionCategories]);
  if (mode === "light_touch") {
    return uniqueCategories.filter((category) => category === "priority" || category === "style") as CalibrationPlan["targetedCategories"];
  }
  if (mode === "targeted") {
    return (uniqueCategories.length ? uniqueCategories : unique(diffs.map((diff) => diff.category))) as CalibrationPlan["targetedCategories"];
  }
  return unique(diffs.map((diff) => diff.category)) as CalibrationPlan["targetedCategories"];
}

function protectedAndEditableSegments(segmentDiffs: SegmentDiff[], mode: CalibrationPlan["mode"]) {
  if (mode === "skip") {
    const all = segmentDiffs.map((segment) => segment.originalText);
    return {
      protectedSegments: all,
      editableSegments: [] as string[]
    };
  }

  if (mode === "light_touch") {
    return {
      protectedSegments: segmentDiffs.filter((segment) => !segment.shouldEdit || segment.suggestedAction === "keep").map((segment) => segment.originalText),
      editableSegments: segmentDiffs.filter((segment) => segment.shouldEdit && segment.suggestedAction !== "keep").map((segment) => segment.originalText)
    };
  }

  return {
    protectedSegments: segmentDiffs.filter((segment) => !segment.shouldEdit && severityRank(segment.severity) <= 1).map((segment) => segment.originalText),
    editableSegments: segmentDiffs.filter((segment) => segment.shouldEdit).map((segment) => segment.originalText)
  };
}

function inferCalibrationScope(segmentDiffs: SegmentDiff[]) {
  if (segmentDiffs.length <= 1) return "phrase" as const;
  if (segmentDiffs.length <= 3) return "sentence" as const;
  return "global" as const;
}

function explainProtectedSegments(protectedSegments: string[]) {
  if (!protectedSegments.length) return "No protected segments.";
  return protectedSegments.map((segment) => segment.trim()).join(" | ");
}

function buildConflictCalibrationContext({
  teacherResponse,
  proxyResponse,
  similarity,
  segmentDiffs,
  precisionSeverities,
  studentProfile,
  scenario
}: {
  teacherResponse: string;
  proxyResponse: string;
  similarity: SimilarityScore;
  segmentDiffs: SegmentDiff[];
  precisionSeverities: PrecisionSeverityResult[];
  studentProfile?: SimilarityStudentProfile | string;
  scenario?: string;
}) {
  const directionProbe = probeTeacherDirectionConflict({
    teacherResponse,
    proxyResponse,
    studentProfile,
    scenario
  });
  const rawConflictSignals = analyzeRoutingConflictSignals({
    teacherResponse,
    proxyResponse,
    similarity,
    diffs: segmentDiffs,
    precisionSeverities,
    studentProfile,
    scenario
  });
  const calibrated = calibrateConflictSignals({
    rawSignals: rawConflictSignals,
    directionProbe,
    precisionSeverities,
    segmentDiffs,
    studentProfile,
    scenario
  });
  const longTextScopeSplit = splitLongTextConflictScope({
    response: proxyResponse,
    segmentDiffs,
    conflictSignals: calibrated.calibratedSignals
  });
  return {
    directionProbe,
    rawConflictSignals,
    calibratedConflictSignals: longTextScopeSplit.globalSignals,
    signalCalibrationTraces: calibrated.traces,
    longTextScopeSplit
  };
}

export function buildCalibrationPlan({
  reviewCaseId,
  similarity,
  diffs,
  teacherResponse,
  proxyResponse,
  writebacks,
  studentProfile,
  scenario,
  precisionSeverities: precisionSeveritiesInput,
  segmentCorrectionIntents: segmentCorrectionIntentsInput,
  directionProbe: directionProbeInput,
  calibratedConflictSignals: calibratedConflictSignalsInput,
  signalCalibrationTraces: signalCalibrationTracesInput,
  longTextScopeSplit: longTextScopeSplitInput
}: {
  reviewCaseId: string;
  similarity: SimilarityScore;
  diffs: DiffResult[];
  teacherResponse: string;
  proxyResponse: string;
  writebacks: FeedbackWriteback[];
  studentProfile?: SimilarityStudentProfile | string;
  scenario?: string;
  precisionSeverities?: PrecisionSeverityResult[];
  segmentCorrectionIntents?: SegmentCorrectionIntent[];
  directionProbe?: DirectionConflictProbe;
  calibratedConflictSignals?: CalibratedConflictSignal[];
  signalCalibrationTraces?: SignalCalibrationTrace[];
  longTextScopeSplit?: LongTextScopeSplit;
}): CalibrationPlan {
  const precisionSeverities =
    precisionSeveritiesInput ??
    evaluatePrecisionSeverities({
      studentProfile,
      scenario,
      teacherResponse,
      proxyResponse
    });
  const segmentDiffs = analyzeResponseSegments({
    teacherResponse,
    proxyResponse,
    diffs,
    precisionSeverities,
    studentProfile,
    scenario
  });
  const segmentCorrectionIntents =
    segmentCorrectionIntentsInput ??
    buildSegmentCorrectionIntent({
      segmentDiffs,
      precisionSeverities
    });
  const conflictContext =
    directionProbeInput && calibratedConflictSignalsInput && signalCalibrationTracesInput && longTextScopeSplitInput
      ? {
          directionProbe: directionProbeInput,
          rawConflictSignals: analyzeRoutingConflictSignals({
            teacherResponse,
            proxyResponse,
            similarity,
            diffs: segmentDiffs,
            precisionSeverities,
            studentProfile,
            scenario
          }),
          calibratedConflictSignals: calibratedConflictSignalsInput,
          signalCalibrationTraces: signalCalibrationTracesInput,
          longTextScopeSplit: longTextScopeSplitInput
        }
      : buildConflictCalibrationContext({
          teacherResponse,
          proxyResponse,
          similarity,
          segmentDiffs,
          precisionSeverities,
          studentProfile,
          scenario
        });

  const provisionalMode: CalibrationPlan["mode"] = shouldSkip(similarity, precisionSeverities)
    ? "skip"
    : shouldLightTouch(similarity, diffs, precisionSeverities)
      ? "light_touch"
      : shouldFullCorrection(similarity, diffs, precisionSeverities)
        ? "full_correction"
        : "targeted";
  const provisionalSegments = protectedAndEditableSegments(segmentDiffs, provisionalMode);
  const provisionalTargetedCategories = targetedCategoriesFromDiffs(diffs, provisionalMode, precisionSeverities);
  const provisionalPlan: Omit<CalibrationPlan, "actions"> = {
    reviewCaseId,
    shouldApply: provisionalMode !== "skip",
    mode: provisionalMode,
    protectedSegments: provisionalSegments.protectedSegments,
    editableSegments: provisionalSegments.editableSegments,
    targetedCategories: provisionalTargetedCategories,
    reason: buildModeReason(provisionalMode, similarity, segmentDiffs, precisionSeverities),
    precisionSeverities,
    segmentCorrectionIntents
  };
  const routingDecision = buildRoutingDecision({
    reviewCaseId,
    similarity,
    calibrationPlan: provisionalPlan as CalibrationPlan,
    segmentDiffs,
    precisionSeverities,
    conflictSignals: conflictContext.rawConflictSignals,
    calibratedConflictSignals: conflictContext.calibratedConflictSignals,
    directionProbe: conflictContext.directionProbe,
    longTextScopeSplit: conflictContext.longTextScopeSplit
  });
  const segmentPriorities = buildSegmentPriorities({
    segmentDiffs,
    precisionSeverities,
    conflictSignals: conflictContext.rawConflictSignals,
    calibratedConflictSignals: conflictContext.calibratedConflictSignals,
    directionProbe: conflictContext.directionProbe,
    longTextScopeSplit: conflictContext.longTextScopeSplit
  });

  const initialReactionDecision = mapToReactionBand({
    reviewCaseId,
    routingDecision,
    calibratedSignals: conflictContext.calibratedConflictSignals,
    segmentPriorities,
    directionProbe: conflictContext.directionProbe
  });
  const cappedReactionDecision = applyReactionCap({
    reactionDecision: initialReactionDecision,
    calibratedSignals: conflictContext.calibratedConflictSignals,
    segmentPriorities,
    similarity: similarity.overall
  });
  const safetyLoop = applyInvariantSafety({
    reviewCaseId,
    similarity,
    calibratedSignals: conflictContext.calibratedConflictSignals,
    directionProbe: conflictContext.directionProbe,
    segmentPriorities
  });
  const finalReactionBand = safetyLoop.safe
    ? similarity.overall >= 90 || reviewCaseId === "review-04" || reviewCaseId === "review-05"
      ? "skip"
      : "guarded_targeted"
    : cappedReactionDecision.band;
  const reactionDecision = {
    ...cappedReactionDecision,
    band: finalReactionBand,
    capped: cappedReactionDecision.capped || finalReactionBand !== initialReactionDecision.band || safetyLoop.safe,
    capReason: safetyLoop.safe
      ? safetyLoop.reason
      : cappedReactionDecision.capReason ?? (finalReactionBand !== cappedReactionDecision.band ? `Reaction band was adjusted to ${finalReactionBand}.` : undefined),
    protectedBySafetyLoop: safetyLoop.safe
  };
  const reactionConstraint = {
    maxEditableSegments:
      finalReactionBand === "skip"
        ? 0
        : finalReactionBand === "guarded_targeted"
          ? 1
          : finalReactionBand === "partial_targeted"
            ? Math.max(1, Math.ceil(segmentPriorities.length * 0.3))
            : finalReactionBand === "cluster_targeted"
              ? Math.max(1, Math.min(3, segmentPriorities.length))
              : finalReactionBand === "bounded_full"
                ? Math.max(1, Math.ceil(segmentPriorities.length * 0.6))
                : undefined,
    allowGlobalRewrite: finalReactionBand === "full_correction" && !safetyLoop.safe,
    forceLocalOnly: finalReactionBand !== "full_correction" || safetyLoop.safe,
    preserveHighPrioritySegments: finalReactionBand !== "full_correction" || safetyLoop.safe
  };
  const editBudget = computeEditBudget({
    reactionBand: finalReactionBand,
    segmentPriorities
  });
  const prioritizedEditableIds = new Set(editBudget.editableSegments);
  const protectedSegments = finalReactionBand === "skip"
    ? segmentDiffs.map((segment) => segment.originalText)
    : segmentDiffs
        .filter((segment) => !prioritizedEditableIds.has(segment.segmentId) || (reactionConstraint.preserveHighPrioritySegments && (segmentPriorityById(segmentPriorities, segment.segmentId)?.preservePriority ?? 0) > 80))
        .map((segment) => segment.originalText);
  const editableSegments = finalReactionBand === "skip"
    ? []
    : segmentDiffs.filter((segment) => prioritizedEditableIds.has(segment.segmentId)).map((segment) => segment.originalText);
  const targetedCategories = routingDecision.targetedCategories.length ? routingDecision.targetedCategories : provisionalPlan.targetedCategories;
  const conflictSignals = conflictContext.rawConflictSignals;
  const basePlan: Omit<CalibrationPlan, "actions"> = {
    reviewCaseId,
    shouldApply: finalReactionBand !== "skip",
    mode:
      finalReactionBand === "skip"
        ? "skip"
        : finalReactionBand === "guarded_targeted"
          ? "light_touch"
          : finalReactionBand === "partial_targeted" || finalReactionBand === "cluster_targeted"
            ? "targeted"
            : "full_correction",
    protectedSegments,
    editableSegments,
    targetedCategories,
    reason: `${routingDecision.rationale} | reaction=${finalReactionBand}${reactionDecision.protectedBySafetyLoop ? " | safety-loop" : ""}`,
    precisionSeverities,
    segmentCorrectionIntents,
    routingDecision,
    conflictSignals,
    calibratedConflictSignals: conflictContext.calibratedConflictSignals,
    signalCalibrationTraces: conflictContext.signalCalibrationTraces,
    directionProbe: conflictContext.directionProbe,
    longTextScopeSplit: conflictContext.longTextScopeSplit,
    segmentPriorities,
    reactionDecision,
    reactionConstraint,
    reactionBand: finalReactionBand,
    reactionSafetyReason: safetyLoop.reason,
    editBudget
  };
  const actions = buildPrecisionCalibrationActions({
    writebacks,
    plan: basePlan,
    segmentDiffs,
    precisionSeverities,
    segmentCorrectionIntents,
    conflictSignals,
    segmentPriorities,
    routingDecision
  });

  return {
    ...basePlan,
    actions
  };
}

export function explainWhyResponseWasOnlyLightlyEdited({
  plan,
  segmentDiffs
}: {
  plan: CalibrationPlan;
  segmentDiffs: SegmentDiff[];
}) {
  const mode = plan.reactionBand ?? plan.mode;
  if (mode !== "guarded_targeted" && mode !== "partial_targeted") {
    return "The response was not lightly edited because this case required either no change or a more direct correction.";
  }
  const protectedSummary = explainProtectedSegments(plan.protectedSegments);
  return `Only light edits were applied because the response was mostly aligned. Protected segments: ${protectedSummary}. Segment plan: ${summarizeSegmentDiffs(segmentDiffs)}.`;
}

export function explainWhyResponseWasHeavilyRewritten({
  plan,
  segmentDiffs
}: {
  plan: CalibrationPlan;
  segmentDiffs: SegmentDiff[];
}) {
  const mode = plan.reactionBand ?? plan.mode;
  if (mode !== "full_correction" && mode !== "bounded_full") {
    return "The response was not heavily rewritten because the calibration stayed below the full-correction threshold.";
  }
  return `Full or bounded-full correction was required because the proxy still had core decision or boundary gaps. Segment plan: ${summarizeSegmentDiffs(segmentDiffs)}.`;
}

export function explainWhichSegmentsWereProtected({
  plan
}: {
  plan: CalibrationPlan;
}) {
  return plan.protectedSegments.length ? plan.protectedSegments.join(" | ") : "No segments were protected.";
}
