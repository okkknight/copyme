import { analyzeSimilarityDiff } from "@/lib/diff-analyzer";
import { buildCalibrationPlan } from "@/lib/light-touch-guard";
import { analyzeResponseSegments } from "@/lib/segment-diff";
import { applyCalibrationBiasToProxyResponse, explainHowCalibrationChangedResponse } from "@/lib/writeback-integrator";
import { buildFeedbackWritebackPlan, type RuleLike } from "@/lib/feedback-writer";
import { evaluateSimilarityScore, type SimilarityScore, type SimilarityStudentProfile } from "@/lib/similarity-evaluator";
import { evaluateWritebackDecision } from "@/lib/noop-guard";
import type { CalibrationPlan, PrecisionRegressionResult, ProxyCalibrationState, ProxyReviewCase, SegmentDiff } from "@/lib/types";

export type RegressionResult = {
  beforeScore: SimilarityScore;
  afterScore: SimilarityScore;
  delta: number;
  improved: boolean;
  guarded: boolean;
};

export type RegressionEvaluatorInput = {
  studentProfile?: SimilarityStudentProfile | string;
  scenario?: string;
  teacherResponse: string;
  beforeProxyResponse: string;
  afterProxyResponse: string;
};

export type ProxyRegressionInput = {
  reviewCase: Pick<ProxyReviewCase, "id" | "scenario" | "yourResponse" | "proxyResponse" | "studentTemplateId" | "studentTemplateName">;
  studentProfile?: SimilarityStudentProfile | string;
  calibrationStates?: ProxyCalibrationState[];
  ruleCatalog?: RuleLike[];
};

export type ProxyRegressionResult = RegressionResult & {
  beforeResponse: string;
  afterResponse: string;
  guardedReason?: string;
  explanation: string;
};

export type PrecisionProxyRegressionResult = PrecisionRegressionResult & {
  beforeResponse: string;
  afterResponse: string;
  explanation: string;
  guardedReason?: string;
};

export function evaluateRegression(input: RegressionEvaluatorInput): RegressionResult {
  const beforeScore = evaluateSimilarityScore({
    studentProfile: input.studentProfile,
    scenario: input.scenario,
    teacherResponse: input.teacherResponse,
    proxyResponse: input.beforeProxyResponse
  });
  const afterScore = evaluateSimilarityScore({
    studentProfile: input.studentProfile,
    scenario: input.scenario,
    teacherResponse: input.teacherResponse,
    proxyResponse: input.afterProxyResponse
  });

  return {
    beforeScore,
    afterScore,
    delta: Math.round((afterScore.overall - beforeScore.overall) * 10) / 10,
    improved: afterScore.overall >= beforeScore.overall,
    guarded: false
  };
}

export function runProxyRegression({
  reviewCase,
  studentProfile,
  calibrationStates = [],
  ruleCatalog = []
}: ProxyRegressionInput): ProxyRegressionResult {
  const beforeResponse = reviewCase.proxyResponse;
  const beforeScore = evaluateSimilarityScore({
    studentProfile,
    scenario: reviewCase.scenario,
    teacherResponse: reviewCase.yourResponse,
    proxyResponse: beforeResponse
  });
  const diffs = analyzeSimilarityDiff({
    studentProfile,
    scenario: reviewCase.scenario,
    teacherResponse: reviewCase.yourResponse,
    proxyResponse: beforeResponse
  });
  const guardedDecision = evaluateWritebackDecision({ similarity: beforeScore, diffs });
  const relevantCalibrationStates = calibrationStates.filter((state) => state.sourceReviewCaseId === reviewCase.id);
  const afterResponse =
    guardedDecision.shouldWriteBack && relevantCalibrationStates.length
      ? applyCalibrationBiasToProxyResponse({
          response: beforeResponse,
          calibrationStates: relevantCalibrationStates,
          context: {
            reviewCaseId: reviewCase.id,
            teacherResponse: reviewCase.yourResponse,
            studentProfile,
            scenario: reviewCase.scenario,
            ruleCatalog
          }
        })
      : beforeResponse;
  const afterScore = evaluateSimilarityScore({
    studentProfile,
    scenario: reviewCase.scenario,
    teacherResponse: reviewCase.yourResponse,
    proxyResponse: afterResponse
  });

  return {
    beforeScore,
    afterScore,
    delta: Math.round((afterScore.overall - beforeScore.overall) * 10) / 10,
    improved: afterScore.overall >= beforeScore.overall,
    guarded: !guardedDecision.shouldWriteBack || relevantCalibrationStates.length === 0,
    beforeResponse,
    afterResponse,
    guardedReason: guardedDecision.shouldWriteBack ? undefined : guardedDecision.reason,
    explanation: explainHowCalibrationChangedResponse({
      before: beforeResponse,
      after: afterResponse,
      calibrationStates: relevantCalibrationStates
    })
  };
}

export type PrecisionProxyRegressionInput = {
  reviewCase: Pick<ProxyReviewCase, "id" | "scenario" | "yourResponse" | "proxyResponse" | "studentTemplateId" | "studentTemplateName">;
  studentProfile?: SimilarityStudentProfile | string;
  calibrationStates?: ProxyCalibrationState[];
  ruleCatalog?: RuleLike[];
  plan?: CalibrationPlan;
  segmentDiffs?: SegmentDiff[];
};

export function runPrecisionProxyRegression({
  reviewCase,
  studentProfile,
  calibrationStates = [],
  ruleCatalog = [],
  plan,
  segmentDiffs
}: PrecisionProxyRegressionInput): PrecisionProxyRegressionResult {
  const beforeResponse = reviewCase.proxyResponse;
  const beforeScore = evaluateSimilarityScore({
    studentProfile,
    scenario: reviewCase.scenario,
    teacherResponse: reviewCase.yourResponse,
    proxyResponse: beforeResponse
  });
  const diffs = analyzeSimilarityDiff({
    studentProfile,
    scenario: reviewCase.scenario,
    teacherResponse: reviewCase.yourResponse,
    proxyResponse: beforeResponse
  });
  const normalizedRuleCatalog: RuleLike[] = ruleCatalog.map((rule) => ({
    ...rule,
    text: rule.text ?? rule.topicKey ?? rule.id
  }));
  const feedbackWritebacks = buildFeedbackWritebackPlan(diffs, normalizedRuleCatalog);
  const calibratedPlan =
    plan ??
    buildCalibrationPlan({
      reviewCaseId: reviewCase.id,
      similarity: beforeScore,
      diffs,
      teacherResponse: reviewCase.yourResponse,
      proxyResponse: beforeResponse,
      writebacks: feedbackWritebacks
    });
  const nextSegmentDiffs =
    segmentDiffs ??
    analyzeResponseSegments({
      teacherResponse: reviewCase.yourResponse,
      proxyResponse: beforeResponse,
      diffs
    });
  const relevantCalibrationStates = calibrationStates.filter((state) => state.sourceReviewCaseId === reviewCase.id);
  const afterResponse =
    calibratedPlan.shouldApply && relevantCalibrationStates.length
      ? applyCalibrationBiasToProxyResponse({
          response: beforeResponse,
          calibrationStates: relevantCalibrationStates,
          routingDecision: calibratedPlan.routingDecision,
          segmentPriorities: calibratedPlan.segmentPriorities,
          plan: calibratedPlan,
          segmentDiffs: nextSegmentDiffs,
          context: {
            reviewCaseId: reviewCase.id,
            teacherResponse: reviewCase.yourResponse,
            studentProfile,
            scenario: reviewCase.scenario,
            ruleCatalog: normalizedRuleCatalog
          }
        })
      : beforeResponse;
  const afterScore = evaluateSimilarityScore({
    studentProfile,
    scenario: reviewCase.scenario,
    teacherResponse: reviewCase.yourResponse,
    proxyResponse: afterResponse
  });

  return {
    beforeScore,
    afterScore,
    delta: Math.round((afterScore.overall - beforeScore.overall) * 10) / 10,
    improved: afterScore.overall >= beforeScore.overall,
    guarded: !calibratedPlan.shouldApply || !relevantCalibrationStates.length,
    calibrationMode: calibratedPlan.mode,
    protectedSegmentCount: calibratedPlan.protectedSegments.length,
    editedSegmentCount: calibratedPlan.editableSegments.length,
    beforeResponse,
    afterResponse,
    guardedReason: calibratedPlan.shouldApply ? undefined : calibratedPlan.reason,
    explanation: explainHowCalibrationChangedResponse({
      before: beforeResponse,
      after: afterResponse,
      calibrationStates: relevantCalibrationStates
    })
  };
}
