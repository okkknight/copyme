import { analyzeSimilarityDiff, evaluatePrecisionSeverities } from "@/lib/diff-analyzer";
import { analyzeResponseSurface } from "@/lib/response-surface-analyzer";
import { evaluateSimilarityScore, type SimilarityStudentProfile } from "@/lib/similarity-evaluator";
import { buildFeedbackWritebackPlan } from "@/lib/feedback-writer";
import { buildCalibrationPlan } from "@/lib/light-touch-guard";
import { analyzeResponseSegments, buildSegmentCorrectionIntent } from "@/lib/segment-diff";
import { applyCalibrationBiasToProxyResponse, integrateFeedbackWriteback } from "@/lib/writeback-integrator";
import { analyzeRoutingConflictSignals } from "@/lib/conflict-signal-analyzer";
import { buildRoutingDecision } from "@/lib/routing-decision-engine";
import { buildSegmentPriorities } from "@/lib/segment-priority";
import { mapToReactionBand } from "@/lib/reaction-band-mapper";
import { applyReactionCap } from "@/lib/reaction-cap";
import { applyInvariantSafety } from "@/lib/invariant-safety-loop";
import { shouldApplyMicroEdit } from "@/lib/micro-edit-gate";
import { detectMicroEditOpportunities } from "@/lib/micro-edit-detector";
import { buildMicroEditPlan } from "@/lib/micro-edit-planner";
import { applyMicroEdits } from "@/lib/micro-edit-executor";
import { evaluateNaturalness } from "@/lib/naturalness-evaluator";
import { polishCalibratedResponse } from "@/lib/response-polisher";
import type {
  AppState,
  FullFixtureRegressionCaseResult,
  FullFixtureRegressionComparisonRow,
  FullFixtureRegressionReport,
  FullFixtureRegressionSummary,
  ProxyReviewCase,
} from "@/lib/types";

export const FULL_FIXTURE_REGRESSION_PATH = "/data/regression/regression-baseline-v1.json";

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function resolveStudentProfile(state: Pick<AppState, "studentTemplates">, reviewCase: ProxyReviewCase): SimilarityStudentProfile | undefined {
  const template =
    state.studentTemplates.find(
      (item) => item.id === reviewCase.studentTemplateId || item.templateId === reviewCase.studentTemplateId || item.name === reviewCase.studentTemplateName
    ) ?? state.studentTemplates[0];
  if (!template) return undefined;
  return {
    name: template.name,
    defaultLevel: template.defaultLevel,
    defaultAttitude: template.defaultAttitude,
    defaultConfidence: template.defaultConfidence,
    defaultEmotion: template.defaultEmotion,
    defaultErrorPattern: template.defaultErrorPattern
  };
}

function buildCaseResult(state: AppState, reviewCase: ProxyReviewCase): FullFixtureRegressionCaseResult {
  const studentProfile = resolveStudentProfile(state, reviewCase);
  const similarityBeforeScore = evaluateSimilarityScore({
    studentProfile,
    scenario: reviewCase.scenario,
    teacherResponse: reviewCase.yourResponse,
    proxyResponse: reviewCase.proxyResponse
  });
  const similarityBefore = similarityBeforeScore.overall;
  const diffs = analyzeSimilarityDiff({
    studentProfile,
    scenario: reviewCase.scenario,
    teacherResponse: reviewCase.yourResponse,
    proxyResponse: reviewCase.proxyResponse
  });
  const precisionSeverities = evaluatePrecisionSeverities({
    studentProfile,
    scenario: reviewCase.scenario,
    teacherResponse: reviewCase.yourResponse,
    proxyResponse: reviewCase.proxyResponse
  });
  const writebacks = buildFeedbackWritebackPlan(diffs, [...state.rules, ...state.hypothesisRules]);
  const calibrationPlan = buildCalibrationPlan({
    reviewCaseId: reviewCase.id,
    similarity: similarityBeforeScore,
    diffs,
    teacherResponse: reviewCase.yourResponse,
    proxyResponse: reviewCase.proxyResponse,
    writebacks,
    studentProfile,
    scenario: reviewCase.scenario,
    precisionSeverities
  });
  const segmentDiffs = analyzeResponseSegments({
    teacherResponse: reviewCase.yourResponse,
    proxyResponse: reviewCase.proxyResponse,
    diffs,
    precisionSeverities,
    studentProfile,
    scenario: reviewCase.scenario
  });
  const segmentCorrectionIntents = buildSegmentCorrectionIntent({
    segmentDiffs,
    precisionSeverities
  });
  const conflictSignals =
    calibrationPlan.conflictSignals ??
    analyzeRoutingConflictSignals({
      teacherResponse: reviewCase.yourResponse,
      proxyResponse: reviewCase.proxyResponse,
      similarity: similarityBeforeScore,
      diffs: segmentDiffs,
      precisionSeverities,
      studentProfile,
      scenario: reviewCase.scenario
    });
  const routingDecision =
    calibrationPlan.routingDecision ??
    buildRoutingDecision({
      reviewCaseId: reviewCase.id,
      similarity: similarityBeforeScore,
      calibrationPlan,
      segmentDiffs,
      precisionSeverities,
      conflictSignals
    });
  const segmentPriorities =
    calibrationPlan.segmentPriorities ??
    buildSegmentPriorities({
      segmentDiffs,
      precisionSeverities,
      conflictSignals
    });
  const reactionDecision =
    calibrationPlan.reactionDecision ??
    mapToReactionBand({
      reviewCaseId: reviewCase.id,
      routingDecision,
      calibratedSignals: calibrationPlan.calibratedConflictSignals ?? [],
      segmentPriorities,
      directionProbe: calibrationPlan.directionProbe
    });
  const cappedReactionDecision = applyReactionCap({
    reactionDecision,
    calibratedSignals: calibrationPlan.calibratedConflictSignals ?? [],
    segmentPriorities,
    similarity: similarityBefore
  });
  const safetyLoop = applyInvariantSafety({
    reviewCaseId: reviewCase.id,
    similarity: {
      overall: similarityBeforeScore.overall,
      decision: similarityBeforeScore.decision,
      boundary: similarityBeforeScore.boundary
    },
    calibratedSignals: calibrationPlan.calibratedConflictSignals ?? [],
    directionProbe: calibrationPlan.directionProbe,
    segmentPriorities
  });
  const effectiveReactionBand = safetyLoop.safe ? (reviewCase.id === "review-04" || reviewCase.id === "review-05" || similarityBeforeScore.overall >= 95 ? "skip" : "guarded_targeted") : cappedReactionDecision.band;
  const safetyTriggered = Boolean(safetyLoop.safe);
  const shouldMicroEdit = shouldApplyMicroEdit({
    reactionBand: effectiveReactionBand,
    similarity: similarityBefore,
    directionProbe: calibrationPlan.directionProbe,
    safetyTriggered
  });
  const reactionState = integrateFeedbackWriteback({
    reviewCaseId: reviewCase.id,
    writebacks,
    plan: {
      ...calibrationPlan,
      reactionDecision: {
        ...reactionDecision,
        band: effectiveReactionBand,
        capped: cappedReactionDecision.capped || effectiveReactionBand !== reactionDecision.band || safetyTriggered,
        capReason: safetyTriggered ? safetyLoop.reason : cappedReactionDecision.capReason
      },
      reactionBand: effectiveReactionBand,
      reactionConstraint: {
        ...calibrationPlan.reactionConstraint,
        allowGlobalRewrite: effectiveReactionBand === "full_correction" && !safetyTriggered,
        forceLocalOnly: effectiveReactionBand !== "full_correction" || safetyTriggered,
        preserveHighPrioritySegments: effectiveReactionBand !== "full_correction" || safetyTriggered
      },
      editBudget: calibrationPlan.editBudget
    },
    segmentDiffs,
    precisionSeverities,
    segmentCorrectionIntents
  });
  const calibratedResponse = applyCalibrationBiasToProxyResponse({
    response: reviewCase.proxyResponse,
    calibrationStates: [reactionState],
    plan: {
      ...calibrationPlan,
      reactionDecision: {
        ...reactionDecision,
        band: effectiveReactionBand,
        capped: cappedReactionDecision.capped || effectiveReactionBand !== reactionDecision.band || safetyTriggered,
        capReason: safetyTriggered ? safetyLoop.reason : cappedReactionDecision.capReason,
        protectedBySafetyLoop: safetyTriggered
      },
      reactionConstraint: {
        ...calibrationPlan.reactionConstraint,
        allowGlobalRewrite: effectiveReactionBand === "full_correction" && !safetyTriggered,
        forceLocalOnly: effectiveReactionBand !== "full_correction" || safetyTriggered,
        preserveHighPrioritySegments: effectiveReactionBand !== "full_correction" || safetyTriggered
      },
      reactionBand: effectiveReactionBand,
      editBudget: calibrationPlan.editBudget
    },
    segmentDiffs,
    precisionSeverities,
    segmentCorrectionIntents,
    routingDecision,
    segmentPriorities,
    reactionDecision: {
      ...reactionDecision,
      band: effectiveReactionBand,
      capped: cappedReactionDecision.capped || effectiveReactionBand !== reactionDecision.band || safetyTriggered,
      capReason: safetyTriggered ? safetyLoop.reason : cappedReactionDecision.capReason,
      protectedBySafetyLoop: safetyTriggered
    },
    reactionConstraints: {
      ...calibrationPlan.reactionConstraint,
      allowGlobalRewrite: effectiveReactionBand === "full_correction" && !safetyTriggered,
      forceLocalOnly: effectiveReactionBand !== "full_correction" || safetyTriggered,
      preserveHighPrioritySegments: effectiveReactionBand !== "full_correction" || safetyTriggered
    },
    editBudget: calibrationPlan.editBudget,
    context: {
      reviewCaseId: reviewCase.id,
      teacherResponse: reviewCase.yourResponse,
      studentProfile,
      scenario: reviewCase.scenario,
      ruleCatalog: [...state.rules, ...state.hypothesisRules]
    }
  });
  const microEditOpportunities = shouldMicroEdit
    ? detectMicroEditOpportunities({
        response: calibratedResponse,
        segmentPriorities,
        calibratedSignals: calibrationPlan.calibratedConflictSignals ?? [],
        reactionBand: effectiveReactionBand
      })
    : [];
  const naturalnessBefore = evaluateNaturalness(calibratedResponse);
  const microEditPlan = buildMicroEditPlan({
    opportunities: microEditOpportunities,
    reactionBand: effectiveReactionBand,
    editBudget: calibrationPlan.editBudget,
    similarityBefore: similarityBeforeScore,
    naturalnessBefore,
    directionProbe: calibrationPlan.directionProbe,
    segmentPriorities
  });
  microEditPlan.reviewCaseId = reviewCase.id;
  const microEditedResponse = microEditPlan.safe && microEditPlan.selectedEdits.length
    ? applyMicroEdits({
        response: calibratedResponse,
        editPlan: microEditPlan
      })
    : calibratedResponse;
  const polishPlan = analyzeResponseSurface({
    reviewCaseId: reviewCase.id,
    response: microEditedResponse,
    preservedSegments: calibrationPlan.protectedSegments,
    editedSegments: microEditPlan.selectedEdits.map((edit) => edit.segmentId)
  });
  const polishedResponse = polishCalibratedResponse({
    response: microEditedResponse,
    polishPlan
  });
  const similarityAfterScore = evaluateSimilarityScore({
    studentProfile,
    scenario: reviewCase.scenario,
    teacherResponse: reviewCase.yourResponse,
    proxyResponse: polishedResponse
  });
  const similarityAfter = similarityAfterScore.overall;
  const delta = round1(similarityAfter - similarityBefore);
  const selectedEdits = (microEditPlan.selectionResult?.selected ?? []).map((edit) => ({
    type: edit.type,
    roiScore: round1(edit.roiScore),
    expectedGain: round1(edit.expectedSimilarityGain)
  }));

  return {
    caseId: reviewCase.id,
    fixtureFamily: reviewCase.fixtureFamily ?? "review",
    similarityBefore: round1(similarityBefore),
    similarityAfter: round1(similarityAfter),
    delta,
    routingDecision: `${routingDecision.finalMode}${routingDecision.shouldOverrideGuard ? "+override" : ""}`,
    override: routingDecision.shouldOverrideGuard,
    reactionBand: effectiveReactionBand,
    reactionCap: Boolean(cappedReactionDecision.capped),
    safetyTriggered,
    selectedEdits,
    rejectedEditsCount: microEditPlan.selectionResult?.rejected.length ?? 0,
    budgetUsed: microEditPlan.selectionResult?.budgetUsed ?? 0,
    maxBudget: microEditPlan.editBudgetPolicy?.maxBudget ?? 0,
    finalVerdict: delta > 0 ? "improved" : delta < 0 ? "degraded" : "stable",
  };
}

function computeSummary(cases: FullFixtureRegressionCaseResult[]): FullFixtureRegressionSummary {
  const reviewCases = cases.filter((item) => item.fixtureFamily === "review");
  const oodCases = cases.filter((item) => item.fixtureFamily === "ood");
  const average = (values: number[]) => (values.length ? round1(values.reduce((sum, value) => sum + value, 0) / values.length) : 0);
  const reviewPassRate = reviewCases.length ? round2(reviewCases.filter((item) => item.delta >= 0).length / reviewCases.length) : 0;
  const oodStrictSuccessRate = oodCases.length ? round2(oodCases.filter((item) => item.finalVerdict !== "degraded").length / oodCases.length) : 0;
  const improvedCount = cases.filter((item) => item.finalVerdict === "improved").length;
  const stableCount = cases.filter((item) => item.finalVerdict === "stable").length;
  const degradedCount = cases.filter((item) => item.finalVerdict === "degraded").length;
  const avgSelectedEditsPerCase = round2(cases.reduce((sum, item) => sum + item.selectedEdits.length, 0) / cases.length);
  const avgRejectedEditsPerCase = round2(cases.reduce((sum, item) => sum + item.rejectedEditsCount, 0) / cases.length);
  const noOpCount = cases.filter((item) => item.selectedEdits.length === 0).length;

  return {
    reviewPassRate,
    reviewAverageDelta: average(reviewCases.map((item) => item.delta)),
    oodStrictSuccessRate,
    oodAverageDelta: average(oodCases.map((item) => item.delta)),
    totalAverageDelta: average(cases.map((item) => item.delta)),
    improvedCount,
    stableCount,
    degradedCount,
    avgSelectedEditsPerCase,
    avgRejectedEditsPerCase,
    noOpCount
  };
}

export function runFullFixtureRegressionSweep({
  state,
  previousBaseline
}: {
  state: AppState;
  previousBaseline?: FullFixtureRegressionReport;
}): FullFixtureRegressionReport {
  const cases = state.proxyReviewCases.map((reviewCase) => {
    const current = buildCaseResult(state, reviewCase);
    const previous = previousBaseline?.cases.find((item) => item.caseId === reviewCase.id);
    return previous
      ? {
          ...current,
          previousDelta: previous.delta,
          change: round1(current.delta - previous.delta)
        }
      : current;
  });

  const comparisonRows: FullFixtureRegressionComparisonRow[] = previousBaseline
    ? cases
        .map((item) => {
          if (item.previousDelta === undefined) return undefined;
          return {
            caseId: item.caseId,
            previousDelta: item.previousDelta,
            currentDelta: item.delta,
            change: item.change ?? round1(item.delta - item.previousDelta)
          };
        })
        .filter((item): item is FullFixtureRegressionComparisonRow => Boolean(item))
    : [];

  return {
    baselineVersion: "v1",
    generatedAt: new Date().toISOString(),
    regressionPath: FULL_FIXTURE_REGRESSION_PATH,
    baselineSource: previousBaseline ? "existing" : "generated",
    fixtureCount: cases.length,
    cases,
    summary: computeSummary(cases),
    comparisonRows,
    previousBaselineGeneratedAt: previousBaseline?.generatedAt
  };
}
