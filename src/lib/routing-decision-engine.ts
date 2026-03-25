import { ROUTING_CONFLICT_THRESHOLDS } from "@/lib/routing-conflict-thresholds";
import { CONFLICT_SIGNAL_CALIBRATION_THRESHOLDS } from "@/lib/conflict-signal-calibration-thresholds";
import type {
  CalibrationPlan,
  CalibratedConflictSignal,
  DirectionConflictProbe,
  LongTextScopeSplit,
  PrecisionSeverityResult,
  RoutingConflictSignal,
  RoutingDecision,
  SegmentDiff
} from "@/lib/types";
import type { SimilarityScore } from "@/lib/similarity-evaluator";

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

type RoutingConflictLike = RoutingConflictSignal | CalibratedConflictSignal;

function topSignals(signalSet: RoutingConflictLike[], count = 2) {
  return [...signalSet].sort((left, right) => signalValue(right) - signalValue(left)).slice(0, count);
}

function signalValue(signal: RoutingConflictLike) {
  return "finalScore" in signal ? signal.finalScore : signal.score;
}

function signalScope(signal: RoutingConflictLike) {
  return "scope" in signal ? signal.scope : "segment";
}

function hasHigh(signalSet: RoutingConflictLike[], signalType: RoutingConflictSignal["signalType"]) {
  return signalSet.some((signal) => signal.signalType === signalType && signal.severity === "high" && signalValue(signal) >= 72);
}

function signalScore(signalSet: RoutingConflictLike[], signalType: RoutingConflictSignal["signalType"]) {
  const found = signalSet.find((signal) => signal.signalType === signalType);
  return found ? signalValue(found) : 0;
}

function conflictCategories(conflictSignals: RoutingConflictLike[]) {
  return Array.from(new Set(conflictSignals.map((signal) => signal.category)));
}

function segmentSummary(segmentDiffs: SegmentDiff[]) {
  const high = segmentDiffs.filter((segment) => segment.severity === "high").length;
  const medium = segmentDiffs.filter((segment) => segment.severity === "medium").length;
  const editable = segmentDiffs.filter((segment) => segment.shouldEdit).length;
  return { high, medium, editable };
}

function pickMode({
  similarity,
  segmentDiffs,
  precisionSeverities,
  conflictSignals,
  calibratedConflictSignals,
  directionProbe,
  longTextScopeSplit,
  calibrationPlan
}: {
  similarity: SimilarityScore;
  segmentDiffs: SegmentDiff[];
  precisionSeverities: PrecisionSeverityResult[];
  conflictSignals: RoutingConflictSignal[];
  calibratedConflictSignals?: CalibratedConflictSignal[];
  directionProbe?: DirectionConflictProbe;
  longTextScopeSplit?: LongTextScopeSplit;
  calibrationPlan?: CalibrationPlan;
}): RoutingDecision["finalMode"] {
  const routedSignals: RoutingConflictLike[] = calibratedConflictSignals?.length ? calibratedConflictSignals : conflictSignals;
  const severe = segmentSummary(segmentDiffs);
  const teacherDirectionConflictScore = signalScore(routedSignals, "teacher_direction_conflict");
  const highSimilarityWrongReasoningScore = signalScore(routedSignals, "high_similarity_wrong_reasoning");
  const adversarialMaskScore = signalScore(routedSignals, "adversarial_politeness_mask");
  const studentStateScore = signalScore(routedSignals, "student_state_priority_conflict");
  const guardOverride =
    (directionProbe?.conflictDetected && directionProbe.confidence >= 0.58) ||
    teacherDirectionConflictScore >= ROUTING_CONFLICT_THRESHOLDS.guardOverride.medium ||
    highSimilarityWrongReasoningScore >= CONFLICT_SIGNAL_CALIBRATION_THRESHOLDS.routing.highSimilarityWrongReasoningFloor ||
    adversarialMaskScore >= ROUTING_CONFLICT_THRESHOLDS.adversarialPoliteness.high ||
    studentStateScore >= ROUTING_CONFLICT_THRESHOLDS.studentState.high;
  const mixedMedium = signalScore(routedSignals, "mixed_content_conflict") >= ROUTING_CONFLICT_THRESHOLDS.mixedConflict.medium;
  const longMedium = signalScore(routedSignals, "long_text_multi_intent_conflict") >= ROUTING_CONFLICT_THRESHOLDS.longText.medium;
  const highDecisionBoundary = precisionSeverities.filter((item) => (item.category === "decision" || item.category === "boundary") && item.severity === "high").length;

  if (similarity.overall >= ROUTING_CONFLICT_THRESHOLDS.guardOverride.highSimilarityFloor && !guardOverride && highDecisionBoundary === 0 && severe.high === 0) {
    return calibrationPlan?.mode === "light_touch" ? "light_touch" : "skip";
  }

  if (guardOverride) {
    const longSignal = longTextScopeSplit?.globalSignals.find((signal) => signal.signalType === "long_text_multi_intent_conflict") ?? routedSignals.find((signal) => signal.signalType === "long_text_multi_intent_conflict");
    const longScope = longSignal ? signalScope(longSignal) : "segment";
    const highClusterCount = longTextScopeSplit?.localClusterSignals.filter((cluster) => cluster.strength >= 60).length ?? 0;
    if (
      highDecisionBoundary >= 2 ||
      severe.high >= 2 ||
      (longSignal && signalValue(longSignal) >= ROUTING_CONFLICT_THRESHOLDS.longText.high && longScope === "global") ||
      (longScope === "global" && highClusterCount >= 2)
    ) {
      return "full_correction";
    }
    return "targeted";
  }

  if (mixedMedium || longMedium) {
    const longSignal = longTextScopeSplit?.globalSignals.find((signal) => signal.signalType === "long_text_multi_intent_conflict") ?? routedSignals.find((signal) => signal.signalType === "long_text_multi_intent_conflict");
    const longScope = longSignal ? signalScope(longSignal) : "segment";
    const hasLocalCluster = (longTextScopeSplit?.localClusterSignals.length ?? 0) > 0 || longScope === "local_cluster";
    if (hasLocalCluster && highDecisionBoundary < 2 && severe.high < 2) return "targeted";
    if (highDecisionBoundary >= 2 || severe.high >= 2) return "full_correction";
    if (longSignal && signalValue(longSignal) >= ROUTING_CONFLICT_THRESHOLDS.longText.high && longScope === "global") return "full_correction";
    return "targeted";
  }

  if (similarity.overall >= 85 && similarity.boundary >= 85 && severe.medium <= 1) {
    return calibrationPlan?.mode === "skip" ? "skip" : "light_touch";
  }

  if (similarity.overall < 70 || severe.high >= 2 || highDecisionBoundary >= 2) {
    return "full_correction";
  }

  return calibrationPlan?.mode === "light_touch" ? "light_touch" : "targeted";
}

function segmentsFromPlan(
  plan: Pick<CalibrationPlan, "protectedSegments" | "editableSegments" | "targetedCategories" | "segmentCorrectionIntents" | "mode">,
  segmentDiffs: SegmentDiff[],
  conflictSignals: RoutingConflictLike[]
) {
  const protectedSet = new Set(plan.protectedSegments);
  const editableSet = new Set(plan.editableSegments);
  const mixed = signalScore(conflictSignals, "mixed_content_conflict") >= ROUTING_CONFLICT_THRESHOLDS.mixedConflict.medium;
  if (plan.mode === "skip") {
    return {
      protectedSegments: segmentDiffs.map((segment) => segment.originalText),
      editableSegments: []
    };
  }

  if (mixed) {
    const preciseProtected = segmentDiffs.filter((segment) => !segment.shouldEdit || segment.suggestedAction === "keep").map((segment) => segment.originalText);
    const preciseEditable = segmentDiffs.filter((segment) => segment.shouldEdit || segment.suggestedAction !== "keep").map((segment) => segment.originalText);
    return {
      protectedSegments: preciseProtected.length ? preciseProtected : [...protectedSet],
      editableSegments: preciseEditable.length ? preciseEditable : [...editableSet]
    };
  }

  return {
    protectedSegments: [...protectedSet],
    editableSegments: [...editableSet]
  };
}

function rationaleForDecision(finalMode: RoutingDecision["finalMode"], conflictSignals: RoutingConflictLike[], segmentDiffs: SegmentDiff[]) {
  const top = topSignals(conflictSignals, 2)
    .map((signal) => `${signal.signalType}:${signal.severity}`)
    .join(", ");
  const summary = segmentSummary(segmentDiffs);
  if (finalMode === "skip") return `Routing stayed skipped because the case is already safe and conflict signals are weak.`;
  if (finalMode === "light_touch") return `Routing stayed light-touch because only minor conflict signals were present (${top || "none"}).`;
  if (finalMode === "targeted") return `Routing targeted the conflicting segments because mixed or directional conflict signals were present (${top || "none"}); segments high=${summary.high}, medium=${summary.medium}, editable=${summary.editable}.`;
  return `Routing escalated to full correction because conflicts were dense or directional, with signals (${top || "none"}) and segment pressure high=${summary.high}.`;
}

function shouldPreserveBoundaryCategory({
  conflictSignals,
  precisionSeverities,
  similarity
}: {
  conflictSignals: RoutingConflictLike[];
  precisionSeverities: PrecisionSeverityResult[];
  similarity: SimilarityScore;
}) {
  const boundaryHigh = precisionSeverities.some((item) => item.category === "boundary" && item.severity === "high");
  if (boundaryHigh) return true;
  const teacherDirectionConflictScore = signalScore(conflictSignals, "teacher_direction_conflict");
  const highSimilarityWrongReasoningScore = signalScore(conflictSignals, "high_similarity_wrong_reasoning");
  const mixedContentScore = signalScore(conflictSignals, "mixed_content_conflict");
  const adversarialMaskScore = signalScore(conflictSignals, "adversarial_politeness_mask");
  if (adversarialMaskScore >= ROUTING_CONFLICT_THRESHOLDS.adversarialPoliteness.high && teacherDirectionConflictScore >= ROUTING_CONFLICT_THRESHOLDS.guardOverride.medium) {
    return true;
  }
  if (highSimilarityWrongReasoningScore >= CONFLICT_SIGNAL_CALIBRATION_THRESHOLDS.routing.highSimilarityWrongReasoningFloor && similarity.overall >= 78) {
    return false;
  }
  if (mixedContentScore >= ROUTING_CONFLICT_THRESHOLDS.mixedConflict.medium && similarity.overall >= 70) {
    return false;
  }
  return false;
}

export function buildRoutingDecision({
  reviewCaseId,
  similarity,
  calibrationPlan,
  segmentDiffs,
  precisionSeverities,
  conflictSignals,
  calibratedConflictSignals,
  directionProbe,
  longTextScopeSplit
}: {
  reviewCaseId: string;
  similarity: SimilarityScore;
  calibrationPlan?: CalibrationPlan;
  segmentDiffs: SegmentDiff[];
  precisionSeverities: PrecisionSeverityResult[];
  conflictSignals: RoutingConflictSignal[];
  calibratedConflictSignals?: CalibratedConflictSignal[];
  directionProbe?: DirectionConflictProbe;
  longTextScopeSplit?: LongTextScopeSplit;
}): RoutingDecision {
  const finalMode = pickMode({
    similarity,
    segmentDiffs,
    precisionSeverities,
    conflictSignals,
    calibratedConflictSignals,
    directionProbe,
    longTextScopeSplit,
    calibrationPlan
  });
  const shouldOverrideGuard =
    (directionProbe?.conflictDetected && directionProbe.confidence >= 0.58) ||
    hasHigh(calibratedConflictSignals ?? conflictSignals, "teacher_direction_conflict") ||
    hasHigh(calibratedConflictSignals ?? conflictSignals, "high_similarity_wrong_reasoning") ||
    hasHigh(calibratedConflictSignals ?? conflictSignals, "adversarial_politeness_mask") ||
    hasHigh(calibratedConflictSignals ?? conflictSignals, "student_state_priority_conflict");
  const overrideReason = shouldOverrideGuard ? explainWhyGuardWasOverridden(calibratedConflictSignals ?? conflictSignals) : undefined;
  const segments = segmentsFromPlan(
    {
      protectedSegments: calibrationPlan?.protectedSegments ?? [],
      editableSegments: calibrationPlan?.editableSegments ?? [],
      targetedCategories: calibrationPlan?.targetedCategories ?? [],
      segmentCorrectionIntents: calibrationPlan?.segmentCorrectionIntents ?? [],
      mode: finalMode
    },
    segmentDiffs,
    calibratedConflictSignals ?? conflictSignals
  );
  const targetedCategories = Array.from(
    new Set(
      [
        ...(calibratedConflictSignals ?? conflictSignals)
          .filter((signal) => signal.severity !== "low")
          .map((signal) => signal.category),
        ...(calibrationPlan?.targetedCategories ?? [])
      ]
    )
  ) as RoutingDecision["targetedCategories"];
  const keepBoundary = shouldPreserveBoundaryCategory({
    conflictSignals: calibratedConflictSignals ?? conflictSignals,
    precisionSeverities,
    similarity
  });
  const refinedTargetedCategories = targetedCategories.filter((category) => (category === "boundary" ? keepBoundary : true)) as RoutingDecision["targetedCategories"];

  return {
    reviewCaseId,
    finalMode,
    shouldOverrideGuard,
    overrideReason,
    protectedSegments: segments.protectedSegments,
    editableSegments: segments.editableSegments,
    targetedCategories: refinedTargetedCategories.length ? refinedTargetedCategories : (["decision", "priority", "style"] as RoutingDecision["targetedCategories"]),
    conflictSignals,
    rationale: rationaleForDecision(finalMode, calibratedConflictSignals ?? conflictSignals, segmentDiffs)
  };
}

export function explainWhyGuardWasOverridden(conflictSignals: RoutingConflictLike[]) {
  const reasons = conflictSignals.filter((signal) => signal.severity === "high").map((signal) => `${signal.signalType}:${signal.category}`);
  if (!reasons.length) return "Guard was not overridden.";
  return `Guard was overridden because high conflict signals were present: ${reasons.join(", ")}.`;
}

export function explainWhyMixedCaseWasTargeted(conflictSignals: RoutingConflictLike[]) {
  const mixed = conflictSignals.find((signal) => signal.signalType === "mixed_content_conflict");
  if (!mixed) return "The case was not mixed enough to require targeted routing.";
  return `The case was targeted because mixed content conflict scored ${signalValue(mixed)} (${mixed.severity}), so some segments had to be protected while others were edited.`;
}

export function explainWhyHighSimilarityStillNeededCorrection(conflictSignals: RoutingConflictLike[]) {
  const reason = conflictSignals.find((signal) => signal.signalType === "high_similarity_wrong_reasoning" || signal.signalType === "adversarial_politeness_mask");
  if (!reason) return "High similarity did not require extra correction.";
  return `High similarity still needed correction because ${reason.signalType} remained at ${reason.severity} severity with score ${signalValue(reason)}.`;
}
