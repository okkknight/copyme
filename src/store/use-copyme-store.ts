"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { buildInitialAppState } from "@/data/mock";
import { buildTeacherTurn, createOpeningStudentTurn, generateStudentReply } from "@/lib/mock-engine";
import { buildSimulatedStudentProfile, buildStudentConfigFromTemplate } from "@/lib/student-builder";
import { createReviewSignals } from "@/lib/review-signals";
import { extractSessionInsightsV2 } from "@/lib/extractor-v2";
import { analyzeSimilarityDiff, evaluatePrecisionSeverities } from "@/lib/diff-analyzer";
import {
  analyzeRoutingConflictSignals,
  explainWhyGuardWasOverridden as explainGuardOverrideFromSignals,
  explainWhyHighSimilarityStillNeededCorrection as explainHighSimilarityCorrectionFromSignals,
  explainWhyMixedCaseWasTargeted as explainMixedCaseTargetedFromSignals
} from "@/lib/conflict-signal-analyzer";
import { calibrateConflictSignals } from "@/lib/conflict-signal-calibrator";
import { computeEditBudget } from "@/lib/edit-budget";
import { applyInvariantSafety } from "@/lib/invariant-safety-loop";
import { splitLongTextConflictScope } from "@/lib/long-text-scope-splitter";
import { applyReactionCap } from "@/lib/reaction-cap";
import { mapToReactionBand, explainWhyCaseWasDowngradedToTargeted, explainWhyFullCorrectionWasBlocked } from "@/lib/reaction-band-mapper";
import { probeTeacherDirectionConflict } from "@/lib/teacher-direction-probe";
import { evaluateSimilarityScore } from "@/lib/similarity-evaluator";
import { analyzeResponseSegments, buildSegmentCorrectionIntent } from "@/lib/segment-diff";
import { buildRoutingDecision } from "@/lib/routing-decision-engine";
import { buildSegmentPriorities } from "@/lib/segment-priority";
import { analyzeResponseSurface } from "@/lib/response-surface-analyzer";
import { evaluateNaturalness } from "@/lib/naturalness-evaluator";
import { polishCalibratedResponse, runPolishRegression as runPolishRegressionLib } from "@/lib/response-polisher";
import { applyMicroEdits } from "@/lib/micro-edit-executor";
import { buildMicroEditPlan } from "@/lib/micro-edit-planner";
import { detectMicroEditOpportunities } from "@/lib/micro-edit-detector";
import { shouldApplyMicroEdit } from "@/lib/micro-edit-gate";
import { scoreMicroEditROI as scoreMicroEditROILib } from "@/lib/micro-edit-roi-scorer";
import { selectBudgetedMicroEdits as selectBudgetedMicroEditsLib } from "@/lib/micro-edit-budget-selector";
import { FULL_FIXTURE_REGRESSION_PATH, runFullFixtureRegressionSweep } from "@/lib/full-fixture-regression";
import {
  applyCalibrationBiasToProxyResponse,
  buildPrecisionCalibrationActions,
  integrateFeedbackWriteback
} from "@/lib/writeback-integrator";
import { buildCalibrationPlan } from "@/lib/light-touch-guard";
import { runPrecisionProxyRegression as runPrecisionProxyRegressionLib } from "@/lib/regression-evaluator";
import { buildFeedbackWritebackPlan, type FeedbackWriteback } from "@/lib/feedback-writer";
import { applyReviewSignal, buildLearningArtifacts } from "@/lib/rule-learning";
import { buildEvolutionArtifacts } from "@/lib/rule-evolution";
import { buildEcologyArtifacts } from "@/lib/rule-ecology";
import { buildTemporalArtifacts } from "@/lib/rule-temporal";
import { WORKBENCH_STATE_API_PATH, cloneWorkbenchState, getWorkbenchStatePriority } from "@/lib/workbench-persistence";
import {
  selectAcceptedGlobalRules,
  deriveSessionKeyMoments,
  deriveSessionRoundCount,
  deriveSessionRuleBuckets,
  selectSessionRuleJudgments
} from "@/lib/selectors";
import type {
  AppState,
  CandidateRuleSeed,
  PersonaRule,
  ReviewDiffLabel,
  RuleStatus,
  Session,
  SessionStatus,
  SessionRuleJudgment,
  StudentConfig,
  StudentTemplate,
  SimulatedStudentProfile,
  Turn,
  CalibrationPlan,
  ProxyCalibrationState,
  SegmentDiff,
  MicroEditROI,
  MicroEditSelectionResult,
  FullFixtureRegressionReport
} from "@/lib/types";

const STORAGE_KEY = "copyme-workbench-state-v12";
const storage = typeof window !== "undefined" ? createJSONStorage(() => window.localStorage) : undefined;

type StoreActions = {
  startSession: (studentTemplateId: string) => void;
  appendTeacherTurn: (sessionId: string, text: string) => void;
  appendStudentTurn: (sessionId: string, text: string, options?: Partial<Omit<Turn, "id" | "speaker" | "text" | "round" | "timestamp">>) => void;
  completeSession: (sessionId: string) => void;
  setActiveSession: (sessionId: string) => void;
  acceptRule: (ruleId: string, sessionId?: string) => void;
  rejectRule: (ruleId: string, sessionId?: string) => void;
  observeRule: (ruleId: string, sessionId?: string) => void;
  selectReviewLabel: (caseId: string, label: ReviewDiffLabel) => void;
  writeReviewFeedbackBack: (caseId: string) => void;
  applyProxyCalibration: (reviewCaseId: string, writebacks: FeedbackWriteback[]) => void;
  buildCalibrationPlan: (reviewCaseId: string) => CalibrationPlan | undefined;
  analyzeResponseSegments: (reviewCaseId: string) => SegmentDiff[];
  probeTeacherDirectionConflict: (reviewCaseId: string) => ReturnType<typeof probeTeacherDirectionConflict> | undefined;
  calibrateConflictSignals: (reviewCaseId: string) => ReturnType<typeof calibrateConflictSignals> | undefined;
  splitLongTextConflictScope: (reviewCaseId: string) => ReturnType<typeof splitLongTextConflictScope> | undefined;
  analyzeRoutingConflictSignals: (reviewCaseId: string) => ReturnType<typeof analyzeRoutingConflictSignals> | undefined;
  buildRoutingDecision: (reviewCaseId: string) => ReturnType<typeof buildRoutingDecision> | undefined;
  buildSegmentPriorities: (reviewCaseId: string) => ReturnType<typeof buildSegmentPriorities> | undefined;
  mapToReactionBand: (reviewCaseId: string) => ReturnType<typeof mapToReactionBand> | undefined;
  applyReactionCap: (reviewCaseId: string) => ReturnType<typeof applyReactionCap> | undefined;
  applyInvariantSafety: (reviewCaseId: string) => ReturnType<typeof applyInvariantSafety> | undefined;
  computeEditBudget: (reviewCaseId: string) => ReturnType<typeof computeEditBudget> | undefined;
  applyPrecisionProxyCalibration: (reviewCaseId: string) => ProxyCalibrationState | undefined;
  generatePrecisionCalibratedProxyResponse: (reviewCaseId: string) => string | undefined;
  runPrecisionProxyRegression: (reviewCaseId: string) => ReturnType<typeof runPrecisionProxyRegressionLib> | undefined;
  evaluatePrecisionSeverity: (reviewCaseId: string) => ReturnType<typeof evaluatePrecisionSeverities> | undefined;
  buildSegmentCorrectionIntent: (reviewCaseId: string) => ReturnType<typeof buildSegmentCorrectionIntent> | undefined;
  analyzeResponseSurface: (reviewCaseId: string) => ReturnType<typeof analyzeResponseSurface> | undefined;
  evaluateNaturalness: (response: string) => ReturnType<typeof evaluateNaturalness>;
  runPolishRegression: (reviewCaseId: string) => ReturnType<typeof runPolishRegressionLib> | undefined;
  detectMicroEditOpportunities: (reviewCaseId: string) => ReturnType<typeof detectMicroEditOpportunities> | undefined;
  buildMicroEditPlan: (reviewCaseId: string) => ReturnType<typeof buildMicroEditPlan> | undefined;
  runMicroEdit: (reviewCaseId: string) => ReturnType<typeof buildPolishContext> | undefined;
  runMicroEditRegression: (reviewCaseId: string) => ReturnType<typeof buildPolishContext> | undefined;
  scoreMicroEditROI: (reviewCaseId: string) => MicroEditROI[] | undefined;
  selectBudgetedMicroEdits: (reviewCaseId: string) => MicroEditSelectionResult | undefined;
  runROIMicroEdit: (reviewCaseId: string) => ReturnType<typeof buildMicroEditContext> | undefined;
  runROIMicroEditRegression: (reviewCaseId: string) => ReturnType<typeof buildPolishContext> | undefined;
  runPrecisionAwareCalibration: (reviewCaseId: string) => ProxyCalibrationState | undefined;
  runPrecisionAwareRegression: (reviewCaseId: string) => ReturnType<typeof runPrecisionProxyRegressionLib> | undefined;
  runReactionControlledCalibration: (reviewCaseId: string) => ProxyCalibrationState | undefined;
  runReactionControlledRegression: (reviewCaseId: string) => ReturnType<typeof runPrecisionProxyRegressionLib> | undefined;
  runCalibratedConflictRouting: (reviewCaseId: string) => ProxyCalibrationState | undefined;
  runCalibratedOODRegression: (reviewCaseId: string) => ReturnType<typeof runPrecisionProxyRegressionLib> | undefined;
  runConflictAwareCalibration: (reviewCaseId: string) => ProxyCalibrationState | undefined;
  runConflictAwareRegression: (reviewCaseId: string) => ReturnType<typeof runPrecisionProxyRegressionLib> | undefined;
  runFullFixtureRegression: () => Promise<FullFixtureRegressionReport | undefined>;
  explainWhyGuardWasOverridden: (reviewCaseId: string) => string | undefined;
  explainWhyMixedCaseWasTargeted: (reviewCaseId: string) => string | undefined;
  explainWhyHighSimilarityStillNeededCorrection: (reviewCaseId: string) => string | undefined;
  explainWhyFullCorrectionWasBlocked: (reviewCaseId: string) => string | undefined;
  explainWhyCaseWasDowngradedToTargeted: (reviewCaseId: string) => string | undefined;
  explainWhySafetyLoopTriggered: (reviewCaseId: string) => string | undefined;
  explainWhyThisEditWasChosen: (reviewCaseId: string, segmentId: string) => string | undefined;
  explainWhyThisSafeEditWasRejected: (reviewCaseId: string, segmentId: string) => string | undefined;
  explainWhyNoMicroEditWasApplied: (reviewCaseId: string) => string | undefined;
  clearProxyCalibration: (reviewCaseId?: string) => void;
  selectSession: (sessionId: string) => void;
  selectProxyReviewCase: (caseId: string) => void;
  selectStudentTemplate: (studentTemplateId: string) => void;
  updateCurrentStudentConfig: (patch: Partial<StudentConfig>) => void;
  setTrainingDraft: (draft: string) => void;
  setSessionFilterStudentType: (value: string) => void;
  setSessionRuleStatusFilter: (value: AppState["sessionRuleStatusFilter"]) => void;
  setProxyReviewFeedbackDraft: (value: string) => void;
  recordSessionJudgmentEvidence: (sessionId: string) => void;
  rebuildRuleAggregates: () => void;
  rebuildRuleCompetition: () => void;
  rebuildRuleContradictions: () => void;
  recalculateRuleLifecycles: () => void;
  rebuildHypotheses: () => void;
  rebuildCompetitionGroups: () => void;
  rebuildRuleReplacements: () => void;
  rebuildRulePerformanceRecords: () => void;
  rebuildRuleTemporalStats: () => void;
  rebuildCompetitionRounds: () => void;
  rebuildRuleEcologyStats: () => void;
  rebuildCompetitionGroupEcology: () => void;
  rebuildRuleDecayRecords: () => void;
  rebuildPressureMemory: () => void;
  rebuildCooldownState: () => void;
  rebuildIncumbents: () => void;
  rebuildGroupStability: () => void;
  rebuildLayeredPressureMemory: () => void;
  rebuildRecoveryMode: () => void;
  rebuildDominanceConsolidation: () => void;
  rebuildContestDampening: () => void;
  rebuildStabilityInertia: () => void;
  hydrateProjectFile: () => Promise<void>;
  applyReviewSignalToLearning: (reviewSignalId: string) => void;
  runFalsificationPass: () => void;
  runLearningPass: () => void;
  runEvolutionPass: () => void;
  runTemporalPass: () => void;
  runEcologyPass: () => void;
  runStabilizationPass: () => void;
  runMemoryPass: () => void;
  runConsolidationPass: () => void;
  forceReevaluateRule: (ruleId: string) => void;
  resetMockState: () => void;
};

export type CopymeStore = AppState & StoreActions;

function nowIso() {
  return new Date().toISOString();
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const initialWorkbenchFingerprint = JSON.stringify(cloneWorkbenchState(buildInitialAppState()));
let projectFileHydrated = false;
let projectFileSaveTimer: ReturnType<typeof setTimeout> | undefined;
let projectFileLastFingerprint = "";

function fingerprintWorkbenchState(state: AppState) {
  return JSON.stringify(cloneWorkbenchState(state));
}

function getWorkbenchStateFreshness(state: AppState) {
  return getWorkbenchStatePriority(state);
}

async function fetchWorkbenchStateFromProjectFile() {
  const response = await fetch(WORKBENCH_STATE_API_PATH, { cache: "no-store" });
  if (!response.ok) return undefined;

  const payload = (await response.json().catch(() => undefined)) as unknown;
  if (!payload || typeof payload !== "object") return undefined;

  const next = payload as { exists?: boolean; state?: unknown; savedAt?: string | null };
  if (!next.exists || !next.state || typeof next.state !== "object") return undefined;

  return {
    state: next.state as AppState,
    savedAt: typeof next.savedAt === "string" ? next.savedAt : null
  };
}

async function saveWorkbenchStateToProjectFile(state: AppState) {
  try {
    await fetch(WORKBENCH_STATE_API_PATH, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: cloneWorkbenchState(state) })
    });
  } catch (error) {
    console.warn("Failed to save CopyMe state to project file:", error);
  }
}

function scheduleProjectFileSync(state: AppState) {
  if (!projectFileHydrated) return;

  const nextFingerprint = fingerprintWorkbenchState(state);
  if (nextFingerprint === projectFileLastFingerprint) return;

  if (projectFileSaveTimer) {
    clearTimeout(projectFileSaveTimer);
  }

  projectFileSaveTimer = setTimeout(() => {
    void saveWorkbenchStateToProjectFile(state).then(() => {
      projectFileLastFingerprint = nextFingerprint;
    });
  }, 250);
}

function normalizeState(state: AppState): AppState {
  const activeSimulatedStudentProfile = buildActivePreviewProfile(state);
  const sessions = state.sessions.map((session) => {
    const keyMoments = deriveSessionKeyMoments(session);
    const judgments = selectSessionRuleJudgments({ sessionRuleJudgments: state.sessionRuleJudgments }, session.id);
    const buckets = deriveSessionRuleBuckets(judgments);
    return {
      ...session,
      candidateRuleIds: unique(judgments.map((judgment) => judgment.ruleId)),
      acceptedRuleIds: buckets.acceptedRuleIds,
      rejectedRuleIds: buckets.rejectedRuleIds,
      pendingRuleIds: buckets.pendingRuleIds,
      keyMoments,
      roundCount: deriveSessionRoundCount(session),
      hasKeyMoments: keyMoments.length > 0
    };
  });
  const learningArtifacts = buildLearningArtifacts({
    ...state,
    sessions
  });
  const evolutionArtifacts = buildEvolutionArtifacts({
    ...state,
    sessions,
    ...learningArtifacts,
    ruleEcologyStats: state.ruleEcologyStats,
    ruleTemporalStats: state.ruleTemporalStats,
    competitionRoundRecords: state.competitionRoundRecords,
    rulePerformanceRecords: state.rulePerformanceRecords
  });
  const temporalArtifacts = buildTemporalArtifacts({
    ...state,
    sessions,
    ...learningArtifacts,
    ...evolutionArtifacts,
    ruleEcologyStats: state.ruleEcologyStats,
    ruleTemporalStats: state.ruleTemporalStats,
    competitionRoundRecords: state.competitionRoundRecords,
    rulePerformanceRecords: state.rulePerformanceRecords
  });
  const ecologyArtifacts = buildEcologyArtifacts({
    ...state,
    sessions,
    ...learningArtifacts,
    ...evolutionArtifacts,
    ...temporalArtifacts,
    ruleTemporalStats: temporalArtifacts.ruleTemporalStats,
    competitionRoundRecords: temporalArtifacts.competitionRoundRecords,
    rulePerformanceRecords: temporalArtifacts.rulePerformanceRecords
  });

  return {
    ...state,
    sessions,
    activeSimulatedStudentProfile,
    ruleEvidences: learningArtifacts.ruleEvidences,
    ruleAggregateStats: learningArtifacts.ruleAggregateStats,
    ruleCompetitionStats: learningArtifacts.ruleCompetitionStats,
    ruleContradictions: learningArtifacts.ruleContradictions,
    reviewSignalApplications: learningArtifacts.reviewSignalApplications,
    rules: evolutionArtifacts.rules,
    hypothesisRules: evolutionArtifacts.hypothesisRules,
    ruleCompetitionGroups: evolutionArtifacts.ruleCompetitionGroups,
    ruleReplacementRecords: evolutionArtifacts.ruleReplacementRecords,
    rulePerformanceRecords: temporalArtifacts.rulePerformanceRecords,
    ruleTemporalStats: temporalArtifacts.ruleTemporalStats,
    competitionRoundRecords: temporalArtifacts.competitionRoundRecords,
    ruleEcologyStats: ecologyArtifacts.ruleEcologyStats,
    competitionGroupEcology: ecologyArtifacts.competitionGroupEcology,
    ruleDecayRecords: ecologyArtifacts.ruleDecayRecords,
    personaModel: ecologyArtifacts.personaModel
  };
}

function buildPrecisionCalibrationContext(state: AppState, reviewCaseId: string) {
  const reviewCase = state.proxyReviewCases.find((item) => item.id === reviewCaseId);
  if (!reviewCase) return undefined;

  const studentProfile = state.studentTemplates.find(
    (template) => template.id === reviewCase.studentTemplateId || template.templateId === reviewCase.studentTemplateId || template.name === reviewCase.studentTemplateName
  );
  const similarity = evaluateSimilarityScore({
    studentProfile,
    scenario: reviewCase.scenario,
    teacherResponse: reviewCase.yourResponse,
    proxyResponse: reviewCase.proxyResponse
  });
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
  const plan = buildCalibrationPlan({
    reviewCaseId: reviewCase.id,
    similarity,
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
  const conflictSignals = plan.conflictSignals ?? analyzeRoutingConflictSignals({
    teacherResponse: reviewCase.yourResponse,
    proxyResponse: reviewCase.proxyResponse,
    similarity,
    diffs: segmentDiffs,
    precisionSeverities,
    studentProfile,
    scenario: reviewCase.scenario
  });
  const routingDecision = plan.routingDecision ?? buildRoutingDecision({
    reviewCaseId: reviewCase.id,
    similarity,
    calibrationPlan: plan,
    segmentDiffs,
    precisionSeverities,
    conflictSignals
  });
  const segmentPriorities = plan.segmentPriorities ?? buildSegmentPriorities({
    segmentDiffs,
    precisionSeverities,
    conflictSignals
  });
  const actions = buildPrecisionCalibrationActions({
    writebacks,
    plan,
    segmentDiffs,
    precisionSeverities,
    segmentCorrectionIntents,
    conflictSignals,
    segmentPriorities,
    routingDecision
  });

  return {
    reviewCase,
    studentProfile,
    similarity,
    diffs,
    precisionSeverities,
    writebacks,
    plan,
    conflictSignals,
    routingDecision,
    segmentDiffs,
    segmentCorrectionIntents,
    segmentPriorities,
    actions
  };
}

function buildPolishContext(state: AppState, reviewCaseId: string) {
  const calibrationContext = buildPrecisionCalibrationContext(state, reviewCaseId);
  if (!calibrationContext) return undefined;

  const rawCalibratedResponse = applyCalibrationBiasToProxyResponse({
    response: calibrationContext.reviewCase.proxyResponse,
    calibrationStates: [
      integrateFeedbackWriteback({
        reviewCaseId,
        writebacks: calibrationContext.writebacks,
        plan: calibrationContext.plan,
        segmentDiffs: calibrationContext.segmentDiffs,
        precisionSeverities: calibrationContext.precisionSeverities,
        segmentCorrectionIntents: calibrationContext.segmentCorrectionIntents
      })
    ],
    plan: calibrationContext.plan,
    segmentDiffs: calibrationContext.segmentDiffs,
    precisionSeverities: calibrationContext.precisionSeverities,
    segmentCorrectionIntents: calibrationContext.segmentCorrectionIntents,
    routingDecision: calibrationContext.routingDecision,
    segmentPriorities: calibrationContext.segmentPriorities,
    reactionDecision: calibrationContext.plan.reactionDecision,
    reactionConstraints: calibrationContext.plan.reactionConstraint,
    editBudget: calibrationContext.plan.editBudget,
    context: {
      reviewCaseId,
      teacherResponse: calibrationContext.reviewCase.yourResponse,
      studentProfile: calibrationContext.studentProfile,
      scenario: calibrationContext.reviewCase.scenario
    }
  });
  const microEditContext = buildMicroEditContext(state, reviewCaseId, calibrationContext, rawCalibratedResponse);
  const microEditedResponse = microEditContext?.microEditedResponse ?? rawCalibratedResponse;
  const editedSegments = microEditContext?.microEditPlan?.selectedEdits.map((edit) => edit.segmentId) ?? calibrationContext.plan.editableSegments;
  const preservedSegments = calibrationContext.plan.protectedSegments;
  const plan = microEditContext
    ? {
        ...calibrationContext.plan,
        microEditOpportunities: microEditContext.microEditOpportunities,
        microEditROIs: microEditContext.microEditROIs,
        microEditSelectionResult: microEditContext.microEditSelectionResult,
        microEditPlan: microEditContext.microEditPlan,
        microEditResult: microEditContext.microEditResult
      }
    : calibrationContext.plan;
  const polishPlan = analyzeResponseSurface({
    reviewCaseId,
    response: microEditedResponse,
    preservedSegments,
    editedSegments
  });
  const polishedResponse = polishCalibratedResponse({
    response: microEditedResponse,
    polishPlan
  });
  const naturalnessBefore = evaluateNaturalness(rawCalibratedResponse);
  const naturalnessAfter = evaluateNaturalness(polishedResponse);

  return {
    ...calibrationContext,
    plan,
    rawCalibratedResponse,
    microEditContext,
    microEditOpportunities: microEditContext?.microEditOpportunities ?? [],
    microEditROIs: microEditContext?.microEditROIs ?? [],
    microEditSelectionResult: microEditContext?.microEditSelectionResult,
    microEditPlan: microEditContext?.microEditPlan,
    microEditResult: microEditContext?.microEditResult,
    microEditedResponse,
    polishPlan,
    polishedResponse,
    naturalnessBefore,
    naturalnessAfter,
    improved: naturalnessAfter.overall >= naturalnessBefore.overall
  };
}

function buildActivePreviewProfile(state: AppState): SimulatedStudentProfile | undefined {
  const template = resolveTemplate(state, state.currentStudentConfig.templateId ?? state.selectedStudentTemplateId);
  if (!template) return undefined;
  return buildSimulatedStudentProfile(template, state.currentStudentConfig);
}

function resolveTemplate(state: AppState, templateId?: string) {
  return state.studentTemplates.find((template) => template.id === templateId) ?? state.studentTemplates[0];
}

function buildMicroEditContext(
  state: AppState,
  reviewCaseId: string,
  calibrationContextArg?: ReturnType<typeof buildPrecisionCalibrationContext>,
  calibratedResponse?: string
) {
  const calibrationContext = calibrationContextArg ?? buildPrecisionCalibrationContext(state, reviewCaseId);
  if (!calibrationContext) return undefined;

  const reactionBand =
    calibrationContext.plan.reactionBand ??
    (calibrationContext.routingDecision?.finalMode === "light_touch"
      ? "guarded_targeted"
      : calibrationContext.routingDecision?.finalMode === "targeted"
        ? "partial_targeted"
        : calibrationContext.routingDecision?.finalMode === "full_correction"
          ? "bounded_full"
          : "skip");
  const safetyTriggered = Boolean(calibrationContext.plan.reactionDecision?.protectedBySafetyLoop || calibrationContext.plan.mode === "skip" || reactionBand === "skip");
  const shouldMicroEdit = shouldApplyMicroEdit({
    reactionBand,
    similarity: calibrationContext.similarity.overall,
    directionProbe: calibrationContext.plan.directionProbe,
    safetyTriggered
  });
  const responseForMicroEdit = calibratedResponse ?? calibrationContext.reviewCase.proxyResponse;
  const microEditOpportunities = shouldMicroEdit
    ? detectMicroEditOpportunities({
        response: responseForMicroEdit,
        segmentPriorities: calibrationContext.segmentPriorities,
        calibratedSignals: calibrationContext.plan.calibratedConflictSignals ?? [],
        reactionBand
      })
    : [];
  const naturalnessBefore = evaluateNaturalness(responseForMicroEdit);
  const microEditPlan = buildMicroEditPlan({
    opportunities: microEditOpportunities,
    reactionBand,
    editBudget: calibrationContext.plan.editBudget,
    similarityBefore: calibrationContext.similarity,
    naturalnessBefore,
    directionProbe: calibrationContext.plan.directionProbe,
    segmentPriorities: calibrationContext.segmentPriorities
  });
  microEditPlan.reviewCaseId = reviewCaseId;
  const microEditROIs = microEditPlan.scoredEdits ?? [];
  const microEditSelectionResult = microEditPlan.selectionResult;

  const microEditedResponse = microEditPlan.safe && microEditPlan.selectedEdits.length
    ? applyMicroEdits({
        response: responseForMicroEdit,
        editPlan: microEditPlan
      })
    : responseForMicroEdit;
  const beforeSimilarity = calibrationContext.similarity;
  const afterSimilarity = evaluateSimilarityScore({
    studentProfile: calibrationContext.studentProfile,
    scenario: calibrationContext.reviewCase.scenario,
    teacherResponse: calibrationContext.reviewCase.yourResponse,
    proxyResponse: microEditedResponse
  });
  const microEditResult = {
    applied: microEditPlan.safe && microEditPlan.selectedEdits.length > 0,
    gainEstimated: microEditPlan.totalExpectedGain,
    gainActual: afterSimilarity.overall - beforeSimilarity.overall
  };

  return {
    ...calibrationContext,
    microEditOpportunities,
    microEditROIs,
    microEditSelectionResult,
    microEditPlan,
    microEditedResponse,
    microEditResult,
    beforeSimilarity,
    afterSimilarity
  };
}

function upsertGlobalRuleSeeds(state: AppState, seeds: CandidateRuleSeed[], sessionId: string) {
  const nextRules = [...state.rules];

  for (const seed of seeds) {
    const index = nextRules.findIndex((rule) => rule.id === seed.ruleId);
    if (index >= 0) {
      const current = nextRules[index];
      const sourceSessionIds = unique([...current.sourceSessionIds, ...seed.sourceSessionIds, sessionId]);

      nextRules[index] = {
        ...current,
        id: seed.ruleId,
        text: seed.text,
        layer: seed.layer,
        confidence: Math.max(current.confidence, seed.confidence),
        baseConfidence: current.baseConfidence ?? current.confidence,
        sourceSessionIds,
        evidence: seed.evidenceSummary || current.evidence,
        status: current.status,
        updatedAt: nowIso(),
        lastObservedInSessionId: sessionId
      };
      continue;
    }

    nextRules.push({
      id: seed.ruleId,
      text: seed.text,
      layer: seed.layer,
      confidence: seed.confidence,
      baseConfidence: seed.confidence,
      sourceSessionIds: unique([...seed.sourceSessionIds, sessionId]),
      evidence: seed.evidenceSummary,
      status: "candidate",
      createdAt: seed.createdAt ?? nowIso(),
      updatedAt: nowIso(),
      lastObservedInSessionId: sessionId
    });
  }

  return nextRules;
}

function upsertSessionJudgmentsFromSeeds(state: AppState, sessionId: string, seeds: CandidateRuleSeed[]) {
  const nextJudgments = [...state.sessionRuleJudgments];

  for (const seed of seeds) {
    const index = nextJudgments.findIndex((judgment) => judgment.sessionId === sessionId && judgment.ruleId === seed.ruleId);

    if (index >= 0) {
      const current = nextJudgments[index];
      nextJudgments[index] = {
        ...current,
        status: current.status === "accepted" || current.status === "rejected" ? current.status : seed.status,
        confidence: Math.max(current.confidence, seed.confidence),
        evidenceTurnIds: unique([...current.evidenceTurnIds, ...seed.evidenceTurnIds]),
        note: current.note ?? seed.evidenceSummary,
        updatedAt: nowIso()
      };
      continue;
    }

    nextJudgments.push({
      id: `judgment-${sessionId}-${seed.ruleId}`,
      sessionId,
      ruleId: seed.ruleId,
      status: seed.status,
      confidence: seed.confidence,
      evidenceTurnIds: seed.evidenceTurnIds,
      note: seed.evidenceSummary,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
  }

  return nextJudgments;
}

function upsertJudgment(state: AppState, sessionId: string, ruleId: string, status: RuleStatus) {
  const nextJudgments = [...state.sessionRuleJudgments];
  const index = nextJudgments.findIndex((judgment) => judgment.sessionId === sessionId && judgment.ruleId === ruleId);
  const rule = state.rules.find((item) => item.id === ruleId);
  const baseEvidenceTurnIds =
    state.sessionRuleJudgments.find((judgment) => judgment.sessionId === sessionId && judgment.ruleId === ruleId)?.evidenceTurnIds ?? [];
  const note =
    status === "accepted"
      ? "Supported by this session."
      : status === "rejected"
        ? "Challenged by this session."
        : "Observed again in this session.";

  if (index >= 0) {
    nextJudgments[index] = {
      ...nextJudgments[index],
      status,
      confidence: Math.max(nextJudgments[index].confidence, rule?.confidence ?? nextJudgments[index].confidence),
      evidenceTurnIds: unique([...nextJudgments[index].evidenceTurnIds, ...baseEvidenceTurnIds]),
      note,
      updatedAt: nowIso()
    };
    return nextJudgments;
  }

  nextJudgments.push({
    id: `judgment-${sessionId}-${ruleId}`,
    sessionId,
    ruleId,
    status,
    confidence: rule?.confidence ?? 0.5,
    evidenceTurnIds: baseEvidenceTurnIds,
    note,
    createdAt: nowIso(),
    updatedAt: nowIso()
  });

  return nextJudgments;
}

function uniqueReviewSignals(signals: AppState["reviewSignals"]) {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    if (seen.has(signal.id)) return false;
    seen.add(signal.id);
    return true;
  });
}

function withResetState(): AppState {
  return buildInitialAppState();
}

export const useCopymeStore = create<CopymeStore>()(
  persist(
    (set, get) => ({
      ...withResetState(),

      startSession(studentTemplateId) {
        set((current) => {
          const template = resolveTemplate(current, studentTemplateId);
          const config = buildStudentConfigFromTemplate(template, current.currentStudentConfig);
          const profile = buildSimulatedStudentProfile(template, config);
          const sessionId = makeId("session");
          const openingTurn = createOpeningStudentTurn(profile, sessionId);
          const session: Session = {
            id: sessionId,
            title: `New session with ${template.name}`,
            date: new Date().toISOString().slice(0, 10),
            studentType: template.name,
            studentTemplateId: template.id,
            studentProfileId: template.id,
            studentConfigSnapshot: config,
            simulatedStudentProfile: profile,
            scenario: template.defaultScenarioGoal,
            duration: "0m",
            tags: template.defaultTags ?? [],
            hasKeyMoments: true,
            summary: template.summary,
            transcript: [openingTurn],
            candidateRuleIds: [],
            status: "active",
            startedAt: nowIso(),
            createdFromTemplateId: template.templateId,
            roundCount: 1,
            keyMoments: [openingTurn.text],
            acceptedRuleIds: [],
            rejectedRuleIds: [],
            pendingRuleIds: []
          };

          const nextState = normalizeState({
            ...current,
            sessions: [session, ...current.sessions],
            currentStudentConfig: config,
            activeSessionId: sessionId,
            selectedSessionId: sessionId,
            selectedStudentTemplateId: template.id,
            activeSimulatedStudentProfile: profile,
            trainingDraft: ""
          });

          return nextState;
        });
      },

      appendTeacherTurn(sessionId, text) {
        set((current) => {
          const session = current.sessions.find((item) => item.id === sessionId);
          if (!session) return current;

          const profile = session.simulatedStudentProfile;
          const nextRound = session.roundCount + 1;
          const teacherTurn = buildTeacherTurn(text, nextRound);
          const studentReply = generateStudentReply(profile, teacherTurn, session);
          const updatedSession: Session = {
            ...session,
            transcript: [...session.transcript, teacherTurn, studentReply],
            roundCount: nextRound,
            status: session.status === "draft" ? "active" : session.status,
            keyMoments: [...session.keyMoments],
            hasKeyMoments: session.hasKeyMoments,
            studentConfigSnapshot: session.studentConfigSnapshot,
            simulatedStudentProfile: session.simulatedStudentProfile,
            studentTemplateId: session.studentTemplateId ?? session.createdFromTemplateId,
            studentProfileId: session.studentProfileId
          };

          const extraction = extractSessionInsightsV2({
            session: updatedSession,
            profile,
            sessionRuleJudgments: current.sessionRuleJudgments,
            reviewSignals: current.reviewSignals,
            rules: current.rules
          });
          const nextRules = upsertGlobalRuleSeeds(current, extraction.candidateRuleSeeds, sessionId);
          const nextJudgments = upsertSessionJudgmentsFromSeeds(
            {
              ...current,
              rules: nextRules
            },
            sessionId,
            extraction.candidateRuleSeeds
          );
          const nextSession: Session = {
            ...updatedSession,
            candidateRuleIds: unique([...updatedSession.candidateRuleIds, ...extraction.candidateRuleSeeds.map((seed) => seed.ruleId)]),
            transcript: updatedSession.transcript
          };
          const sessions = current.sessions.map((item) => (item.id === sessionId ? nextSession : item));

          return normalizeState({
            ...current,
            sessions,
            sessionRuleJudgments: nextJudgments,
            rules: nextRules,
            activeSessionId: sessionId,
            selectedSessionId: sessionId,
            activeSimulatedStudentProfile: profile,
            trainingDraft: ""
          });
        });
      },

      appendStudentTurn(sessionId, text, options) {
        set((current) => {
          const session = current.sessions.find((item) => item.id === sessionId);
          if (!session) return current;

          const nextRound = session.roundCount + 1;
          const studentTurn: Turn = {
            id: makeId(`student-${nextRound}`),
            speaker: "student",
            source: options?.source ?? "simulator",
            text,
            round: nextRound,
            tags: options?.tags ?? [],
            timestamp: nowIso(),
            highlighted: options?.highlighted ?? false,
            teachingActions: options?.teachingActions ?? [],
            emotionSignal: options?.emotionSignal ?? [],
            ruleTriggers: options?.ruleTriggers ?? []
          };

          const nextSession = {
            ...session,
            transcript: [...session.transcript, studentTurn],
            roundCount: nextRound,
            candidateRuleIds: unique([...session.candidateRuleIds]),
            studentConfigSnapshot: session.studentConfigSnapshot,
            simulatedStudentProfile: session.simulatedStudentProfile
          };

          const sessions = current.sessions.map((item) => (item.id === sessionId ? nextSession : item));
          return normalizeState({ ...current, sessions, selectedSessionId: sessionId });
        });
      },

      completeSession(sessionId) {
        set((current) => {
          const session = current.sessions.find((item) => item.id === sessionId);
          if (!session) return current;

          const profile = session.simulatedStudentProfile;
          const extraction = extractSessionInsightsV2({
            session,
            profile,
            sessionRuleJudgments: current.sessionRuleJudgments,
            reviewSignals: current.reviewSignals,
            rules: current.rules
          });
          const nextRules = upsertGlobalRuleSeeds(current, extraction.candidateRuleSeeds, sessionId);
          const nextJudgments = upsertSessionJudgmentsFromSeeds(
            {
              ...current,
              rules: nextRules
            },
            sessionId,
            extraction.candidateRuleSeeds
          );
          const nextSessions = current.sessions.map((item) =>
            item.id === sessionId
              ? {
                  ...item,
                  status: "completed" as SessionStatus,
                  endedAt: nowIso(),
                  candidateRuleIds: unique([...item.candidateRuleIds, ...extraction.candidateRuleSeeds.map((seed) => seed.ruleId)]),
                  studentConfigSnapshot: item.studentConfigSnapshot,
                  simulatedStudentProfile: item.simulatedStudentProfile,
                  studentTemplateId: item.studentTemplateId ?? item.createdFromTemplateId,
                  studentProfileId: item.studentProfileId
                }
              : item
          );

          const nextState = normalizeState({
            ...current,
            sessions: nextSessions,
            sessionRuleJudgments: nextJudgments,
            rules: nextRules,
            activeSessionId: current.activeSessionId === sessionId ? undefined : current.activeSessionId,
            selectedSessionId: sessionId,
            activeSimulatedStudentProfile: profile
          });

          return nextState;
        });
      },

      setActiveSession(sessionId) {
        set((current) => ({
          ...current,
          activeSessionId: sessionId,
          selectedSessionId: sessionId
        }));
      },

      acceptRule(ruleId, sessionId) {
        set((current) => {
          const targetSessionId = sessionId ?? current.selectedSessionId ?? current.activeSessionId ?? current.sessions[0]?.id;
          if (!targetSessionId) return current;

          const nextJudgments = upsertJudgment(current, targetSessionId, ruleId, "accepted");

          return normalizeState({
            ...current,
            sessionRuleJudgments: nextJudgments,
            selectedSessionId: targetSessionId
          });
        });
      },

      rejectRule(ruleId, sessionId) {
        set((current) => {
          const targetSessionId = sessionId ?? current.selectedSessionId ?? current.activeSessionId ?? current.sessions[0]?.id;
          if (!targetSessionId) return current;

          const nextJudgments = upsertJudgment(current, targetSessionId, ruleId, "rejected");

          return normalizeState({
            ...current,
            sessionRuleJudgments: nextJudgments,
            selectedSessionId: targetSessionId
          });
        });
      },

      observeRule(ruleId, sessionId) {
        set((current) => {
          const targetSessionId = sessionId ?? current.selectedSessionId ?? current.activeSessionId ?? current.sessions[0]?.id;
          if (!targetSessionId) return current;

          const nextJudgments = upsertJudgment(current, targetSessionId, ruleId, "observed");

          return normalizeState({
            ...current,
            sessionRuleJudgments: nextJudgments,
            selectedSessionId: targetSessionId
          });
        });
      },

      selectReviewLabel(caseId, label) {
        set((current) => {
          const nextCases = current.proxyReviewCases.map((item) =>
            item.id === caseId
              ? {
                  ...item,
                  selectedLabel: label,
                  reviewStatus: "reviewed" as const,
                  updatedAt: nowIso(),
                  writtenBackRuleIds: undefined
                }
              : item
          );

          return {
            ...current,
            proxyReviewCases: nextCases,
            selectedProxyReviewCaseId: caseId
          };
        });
      },

      writeReviewFeedbackBack(caseId) {
        set((current) => {
          const reviewCase = current.proxyReviewCases.find((item) => item.id === caseId);
          if (!reviewCase) return current;

          const signals = createReviewSignals({ ...reviewCase, reviewStatus: "written_back" });
          const nextSignals = uniqueReviewSignals([...current.reviewSignals, ...signals.map((signal) => ({ ...signal, status: "applied" as const }))]);
          const applicationResults = signals.map((signal) =>
            applyReviewSignal({
              reviewSignal: { ...signal, status: "applied" as const },
              state: {
                ...current,
                reviewSignals: nextSignals
              }
            })
          );

          const nextCases = current.proxyReviewCases.map((item) =>
            item.id === caseId
              ? {
                  ...item,
                  reviewStatus: "written_back" as const,
                  updatedAt: nowIso(),
                  writtenBackRuleIds: unique(
                    applicationResults.flatMap((result) => [...result.application.appliedToRuleIds, ...result.spawnedCandidateSeeds.map((seed) => seed.ruleId)])
                  )
                }
              : item
          );

          return normalizeState({
            ...current,
            proxyReviewCases: nextCases,
            reviewSignals: nextSignals,
            selectedProxyReviewCaseId: caseId
          });
        });
      },

      applyProxyCalibration(reviewCaseId, writebacks) {
        set((current) => {
          const reviewCase = current.proxyReviewCases.find((item) => item.id === reviewCaseId);
          if (!reviewCase || !writebacks.length) return current;

          const studentProfile = current.studentTemplates.find(
            (template) => template.id === reviewCase.studentTemplateId || template.templateId === reviewCase.studentTemplateId || template.name === reviewCase.studentTemplateName
          );
          const similarity = evaluateSimilarityScore({
            studentProfile,
            scenario: reviewCase.scenario,
            teacherResponse: reviewCase.yourResponse,
            proxyResponse: reviewCase.proxyResponse
          });
          const diffs = analyzeSimilarityDiff({
            studentProfile,
            scenario: reviewCase.scenario,
            teacherResponse: reviewCase.yourResponse,
            proxyResponse: reviewCase.proxyResponse
          });
          const plan = buildCalibrationPlan({
            reviewCaseId,
            similarity,
            diffs,
            teacherResponse: reviewCase.yourResponse,
            proxyResponse: reviewCase.proxyResponse,
            writebacks
          });
          if (!plan.shouldApply) return current;
          const segmentDiffs = analyzeResponseSegments({
            teacherResponse: reviewCase.yourResponse,
            proxyResponse: reviewCase.proxyResponse,
            diffs
          });
          const calibrationState = integrateFeedbackWriteback({ writebacks, reviewCaseId, plan, segmentDiffs });
          const nextCalibrationStates = [
            ...current.proxyCalibrationStates.filter((state) => state.sourceReviewCaseId !== reviewCaseId),
            calibrationState
          ];

          return {
            ...current,
            proxyCalibrationStates: nextCalibrationStates,
            selectedProxyReviewCaseId: reviewCaseId
          };
        });
      },

      buildCalibrationPlan(reviewCaseId) {
        const context = buildPrecisionCalibrationContext(get(), reviewCaseId);
        return context?.plan;
      },

      analyzeResponseSegments(reviewCaseId) {
        const context = buildPrecisionCalibrationContext(get(), reviewCaseId);
        return context?.segmentDiffs ?? [];
      },

      probeTeacherDirectionConflict(reviewCaseId) {
        const context = buildPrecisionCalibrationContext(get(), reviewCaseId);
        return context?.plan?.directionProbe;
      },

      calibrateConflictSignals(reviewCaseId) {
        const context = buildPrecisionCalibrationContext(get(), reviewCaseId);
        if (!context?.plan) return undefined;
        return {
          calibratedSignals: context.plan.calibratedConflictSignals ?? [],
          traces: context.plan.signalCalibrationTraces ?? []
        };
      },

      splitLongTextConflictScope(reviewCaseId) {
        const context = buildPrecisionCalibrationContext(get(), reviewCaseId);
        return context?.plan?.longTextScopeSplit;
      },

      analyzeRoutingConflictSignals(reviewCaseId) {
        const context = buildPrecisionCalibrationContext(get(), reviewCaseId);
        return context?.conflictSignals;
      },

      buildRoutingDecision(reviewCaseId) {
        const context = buildPrecisionCalibrationContext(get(), reviewCaseId);
        return context?.routingDecision;
      },

      buildSegmentPriorities(reviewCaseId) {
        const context = buildPrecisionCalibrationContext(get(), reviewCaseId);
        return context?.segmentPriorities;
      },

      mapToReactionBand(reviewCaseId) {
        const context = buildPrecisionCalibrationContext(get(), reviewCaseId);
        return context?.plan?.reactionDecision;
      },

      applyReactionCap(reviewCaseId) {
        const context = buildPrecisionCalibrationContext(get(), reviewCaseId);
        if (!context?.plan?.reactionDecision) return undefined;
        return applyReactionCap({
          reactionDecision: context.plan.reactionDecision,
          calibratedSignals: context.plan.calibratedConflictSignals ?? [],
          segmentPriorities: context.plan.segmentPriorities ?? [],
          similarity: context.similarity.overall
        });
      },

      applyInvariantSafety(reviewCaseId) {
        const context = buildPrecisionCalibrationContext(get(), reviewCaseId);
        if (!context?.plan) return undefined;
        return applyInvariantSafety({
          reviewCaseId,
          similarity: context.similarity,
          calibratedSignals: context.plan.calibratedConflictSignals ?? [],
          directionProbe: context.plan.directionProbe,
          segmentPriorities: context.plan.segmentPriorities ?? []
        });
      },

      computeEditBudget(reviewCaseId) {
        const context = buildPrecisionCalibrationContext(get(), reviewCaseId);
        if (!context?.plan) return undefined;
        const reactionBand =
          context.plan.reactionBand ??
          context.plan.reactionDecision?.band ??
          (context.plan.mode === "skip"
            ? "skip"
            : context.plan.mode === "light_touch"
              ? "guarded_targeted"
              : context.plan.mode === "targeted"
                ? "partial_targeted"
                : "bounded_full");
        return computeEditBudget({
          reactionBand,
          segmentPriorities: context.plan.segmentPriorities ?? []
        });
      },

      evaluatePrecisionSeverity(reviewCaseId) {
        const context = buildPrecisionCalibrationContext(get(), reviewCaseId);
        return context?.precisionSeverities;
      },

      buildSegmentCorrectionIntent(reviewCaseId) {
        const context = buildPrecisionCalibrationContext(get(), reviewCaseId);
        return context?.segmentCorrectionIntents;
      },

      analyzeResponseSurface(reviewCaseId) {
        const context = buildPolishContext(get(), reviewCaseId);
        return context?.polishPlan;
      },

      evaluateNaturalness(response) {
        return evaluateNaturalness(response);
      },

      runPolishRegression(reviewCaseId) {
        const context = buildPolishContext(get(), reviewCaseId);
        if (!context) return undefined;
        return runPolishRegressionLib({
          beforeText: context.rawCalibratedResponse,
          polishPlan: context.polishPlan
        });
      },

      detectMicroEditOpportunities(reviewCaseId) {
        const context = buildPolishContext(get(), reviewCaseId);
        return context?.microEditOpportunities;
      },

      buildMicroEditPlan(reviewCaseId) {
        const context = buildPolishContext(get(), reviewCaseId);
        return context?.microEditPlan;
      },

      runMicroEdit(reviewCaseId) {
        return buildPolishContext(get(), reviewCaseId);
      },

      runMicroEditRegression(reviewCaseId) {
        return buildPolishContext(get(), reviewCaseId);
      },

      scoreMicroEditROI(reviewCaseId) {
        const context = buildPolishContext(get(), reviewCaseId);
        return context?.microEditROIs;
      },

      selectBudgetedMicroEdits(reviewCaseId) {
        const context = buildPolishContext(get(), reviewCaseId);
        return context?.microEditSelectionResult;
      },

      runROIMicroEdit(reviewCaseId) {
        return buildMicroEditContext(get(), reviewCaseId);
      },

      runROIMicroEditRegression(reviewCaseId) {
        return buildPolishContext(get(), reviewCaseId);
      },

      applyPrecisionProxyCalibration(reviewCaseId) {
        let calibrationState: ProxyCalibrationState | undefined;
        set((current) => {
          const context = buildPolishContext(current, reviewCaseId);
          if (!context || !context.plan.shouldApply) return current;

          calibrationState = integrateFeedbackWriteback({
            reviewCaseId,
            writebacks: context.writebacks,
            plan: context.plan,
            segmentDiffs: context.segmentDiffs,
            precisionSeverities: context.precisionSeverities,
            segmentCorrectionIntents: context.segmentCorrectionIntents
          });
          const nextCalibrationStates = [
            ...current.proxyCalibrationStates.filter((state) => state.sourceReviewCaseId !== reviewCaseId),
            calibrationState
          ];

          return {
            ...current,
            proxyCalibrationStates: nextCalibrationStates,
            selectedProxyReviewCaseId: reviewCaseId
          };
        });
        return calibrationState;
      },

      runPrecisionAwareCalibration(reviewCaseId) {
        return get().applyPrecisionProxyCalibration(reviewCaseId);
      },

      runCalibratedConflictRouting(reviewCaseId) {
        return get().applyPrecisionProxyCalibration(reviewCaseId);
      },

      runConflictAwareCalibration(reviewCaseId) {
        return get().applyPrecisionProxyCalibration(reviewCaseId);
      },

      runReactionControlledCalibration(reviewCaseId) {
        return get().applyPrecisionProxyCalibration(reviewCaseId);
      },

      generatePrecisionCalibratedProxyResponse(reviewCaseId) {
        const context = buildPolishContext(get(), reviewCaseId);
        if (!context || !context.plan.shouldApply) return context?.reviewCase.proxyResponse;
        return context.polishedResponse;
      },

      runPrecisionProxyRegression(reviewCaseId) {
        const state = get();
        const context = buildPrecisionCalibrationContext(state, reviewCaseId);
        if (!context) return undefined;
        const calibrationState = integrateFeedbackWriteback({
          reviewCaseId,
          writebacks: context.writebacks,
          plan: context.plan,
          segmentDiffs: context.segmentDiffs,
          precisionSeverities: context.precisionSeverities,
          segmentCorrectionIntents: context.segmentCorrectionIntents
        });
        return runPrecisionProxyRegressionLib({
          reviewCase: {
            id: context.reviewCase.id,
            scenario: context.reviewCase.scenario,
            yourResponse: context.reviewCase.yourResponse,
            proxyResponse: context.reviewCase.proxyResponse,
            studentTemplateId: context.reviewCase.studentTemplateId,
            studentTemplateName: context.reviewCase.studentTemplateName
          },
          studentProfile: context.studentProfile,
          calibrationStates: [calibrationState],
          ruleCatalog: [...state.rules, ...state.hypothesisRules],
          plan: context.plan,
          segmentDiffs: context.segmentDiffs
        });
      },

      runPrecisionAwareRegression(reviewCaseId) {
        return get().runPrecisionProxyRegression(reviewCaseId);
      },

      runReactionControlledRegression(reviewCaseId) {
        return get().runPrecisionProxyRegression(reviewCaseId);
      },

      runCalibratedOODRegression(reviewCaseId) {
        return get().runPrecisionProxyRegression(reviewCaseId);
      },

      runConflictAwareRegression(reviewCaseId) {
        return get().runPrecisionProxyRegression(reviewCaseId);
      },

      async runFullFixtureRegression() {
        const current = get();
        let previousBaseline: FullFixtureRegressionReport | undefined;

        try {
          const response = await fetch("/api/regression-baseline");
          if (response.ok) {
            const payload = (await response.json()) as { report?: FullFixtureRegressionReport };
            previousBaseline = payload.report;
          }
        } catch (error) {
          console.warn("[copyme] could not load existing regression baseline", error);
        }

        const report = runFullFixtureRegressionSweep({
          state: current,
          previousBaseline
        });

        console.group(`[copyme] Full fixture regression sweep -> ${FULL_FIXTURE_REGRESSION_PATH}`);
        console.table(
          report.cases.map((item) => ({
            caseId: item.caseId,
            family: item.fixtureFamily,
            before: item.similarityBefore,
            after: item.similarityAfter,
            delta: item.delta,
            verdict: item.finalVerdict,
            band: item.reactionBand,
            edits: item.selectedEdits.length,
            budget: `${item.budgetUsed}/${item.maxBudget}`
          }))
        );
        console.info("[copyme] summary", report.summary);
        if (report.comparisonRows.length) {
          console.table(report.comparisonRows);
        }
        console.groupEnd();
        console.log("[copyme] regression report", JSON.stringify(report, null, 2));

        try {
          await fetch("/api/regression-baseline", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(report)
          });
        } catch (error) {
          console.warn("[copyme] could not save regression baseline", error);
        }

        set({ latestFixtureRegressionReport: report });

        return report;
      },

      explainWhyGuardWasOverridden(reviewCaseId) {
        const context = buildPrecisionCalibrationContext(get(), reviewCaseId);
        return context?.routingDecision?.overrideReason ?? (context?.conflictSignals ? explainGuardOverrideFromSignals(context.conflictSignals) : undefined);
      },

      explainWhyMixedCaseWasTargeted(reviewCaseId) {
        const context = buildPrecisionCalibrationContext(get(), reviewCaseId);
        return context?.conflictSignals ? explainMixedCaseTargetedFromSignals(context.conflictSignals) : undefined;
      },

      explainWhyHighSimilarityStillNeededCorrection(reviewCaseId) {
        const context = buildPrecisionCalibrationContext(get(), reviewCaseId);
        return context?.conflictSignals ? explainHighSimilarityCorrectionFromSignals(context.conflictSignals) : undefined;
      },

      explainWhyFullCorrectionWasBlocked(reviewCaseId) {
        const context = buildPrecisionCalibrationContext(get(), reviewCaseId);
        if (!context?.plan) return undefined;
        return explainWhyFullCorrectionWasBlocked({
          routingDecision: context.routingDecision,
          calibratedSignals: context.plan.calibratedConflictSignals ?? [],
          segmentPriorities: context.plan.segmentPriorities ?? [],
          directionProbe: context.plan.directionProbe
        });
      },

      explainWhyCaseWasDowngradedToTargeted(reviewCaseId) {
        const context = buildPrecisionCalibrationContext(get(), reviewCaseId);
        if (!context?.plan) return undefined;
        return explainWhyCaseWasDowngradedToTargeted({
          routingDecision: context.routingDecision,
          calibratedSignals: context.plan.calibratedConflictSignals ?? [],
          segmentPriorities: context.plan.segmentPriorities ?? []
        });
      },

      explainWhySafetyLoopTriggered(reviewCaseId) {
        const context = buildPrecisionCalibrationContext(get(), reviewCaseId);
        if (!context?.plan) return undefined;
        return applyInvariantSafety({
          reviewCaseId,
          similarity: context.similarity,
          calibratedSignals: context.plan.calibratedConflictSignals ?? [],
          directionProbe: context.plan.directionProbe,
          segmentPriorities: context.plan.segmentPriorities ?? []
        }).reason;
      },

      explainWhyThisEditWasChosen(reviewCaseId, segmentId) {
        const context = buildPolishContext(get(), reviewCaseId);
        const selected = context?.microEditPlan?.selectionResult?.selected.find((edit) => edit.segmentId === segmentId);
        if (selected) {
          return `Selected because ${selected.type} scored ROI ${selected.roiScore.toFixed(1)} with expected similarity +${selected.expectedSimilarityGain.toFixed(1)} and naturalness +${selected.expectedNaturalnessGain.toFixed(1)} under budget ${selected.budgetCost}.`;
        }
        const scored = context?.microEditPlan?.scoredEdits?.find((edit) => edit.segmentId === segmentId);
        if (!scored) return undefined;
        return `This edit was not selected in the final plan, but it scored ROI ${scored.roiScore.toFixed(1)} and stayed within the low-risk micro-edit pool.`;
      },

      explainWhyThisSafeEditWasRejected(reviewCaseId, segmentId) {
        const context = buildPolishContext(get(), reviewCaseId);
        const rejected = context?.microEditPlan?.selectionResult?.rejected.find((edit) => edit.segmentId === segmentId);
        if (!rejected) return undefined;
        return `Rejected because ROI ${rejected.roiScore.toFixed(1)} did not beat the selected edits or exceeded the current budget/risk tradeoff, even though the edit itself was safe.`;
      },

      explainWhyNoMicroEditWasApplied(reviewCaseId) {
        const context = buildPolishContext(get(), reviewCaseId);
        if (!context) return undefined;
        if (context.microEditPlan?.selectedEdits.length) return undefined;
        if (context.microEditPlan?.selectionResult && context.microEditPlan.selectionResult.rejected.length) {
          return `No micro-edit was applied because every candidate fell below the ROI threshold or lost the budget competition. ${context.microEditPlan.selectionResult.rationale}`;
        }
        return "No micro-edit was applied because the case was either already safe enough or the low-risk opportunities did not justify budget use.";
      },

      clearProxyCalibration(reviewCaseId) {
        set((current) => ({
          ...current,
          proxyCalibrationStates: reviewCaseId
            ? current.proxyCalibrationStates.filter((state) => state.sourceReviewCaseId !== reviewCaseId)
            : [],
          selectedProxyReviewCaseId: reviewCaseId ?? current.selectedProxyReviewCaseId
        }));
      },

      selectSession(sessionId) {
        set((current) => ({
          ...current,
          selectedSessionId: sessionId
        }));
      },

      selectProxyReviewCase(caseId) {
        set((current) => ({
          ...current,
          selectedProxyReviewCaseId: caseId
        }));
      },

      selectStudentTemplate(studentTemplateId) {
        set((current) => ({
          ...current,
          selectedStudentTemplateId: studentTemplateId,
          currentStudentConfig: buildStudentConfigFromTemplate(resolveTemplate(current, studentTemplateId)),
          activeSimulatedStudentProfile: buildSimulatedStudentProfile(
            resolveTemplate(current, studentTemplateId),
            buildStudentConfigFromTemplate(resolveTemplate(current, studentTemplateId))
          )
        }));
      },

      updateCurrentStudentConfig(patch) {
        set((current) => {
          const template = resolveTemplate(current, patch.templateId ?? current.currentStudentConfig.templateId ?? current.selectedStudentTemplateId);
          const nextConfig = buildStudentConfigFromTemplate(template, {
            ...current.currentStudentConfig,
            ...patch,
            templateId: template.id
          });

          return {
            ...current,
            currentStudentConfig: nextConfig,
            selectedStudentTemplateId: template.id,
            activeSimulatedStudentProfile: buildSimulatedStudentProfile(template, nextConfig)
          };
        });
      },

      setTrainingDraft(draft) {
        set((current) => ({
          ...current,
          trainingDraft: draft
        }));
      },

      setSessionFilterStudentType(value) {
        set((current) => ({
          ...current,
          sessionFilterStudentType: value
        }));
      },

      setSessionRuleStatusFilter(value) {
        set((current) => ({
          ...current,
          sessionRuleStatusFilter: value
        }));
      },

      setProxyReviewFeedbackDraft(value) {
        set((current) => ({
          ...current,
          proxyReviewFeedbackDraft: value
        }));
      },

      recordSessionJudgmentEvidence(sessionId) {
        set((current) => normalizeState({ ...current, selectedSessionId: sessionId }));
      },

      rebuildRuleAggregates() {
        set((current) => normalizeState(current));
      },

      rebuildRuleCompetition() {
        set((current) => normalizeState(current));
      },

      rebuildRuleContradictions() {
        set((current) => normalizeState(current));
      },

      recalculateRuleLifecycles() {
        set((current) => normalizeState(current));
      },

      rebuildHypotheses() {
        set((current) => normalizeState(current));
      },

      rebuildCompetitionGroups() {
        set((current) => normalizeState(current));
      },

      rebuildRuleReplacements() {
        set((current) => normalizeState(current));
      },

      rebuildRulePerformanceRecords() {
        set((current) => normalizeState(current));
      },

      rebuildRuleTemporalStats() {
        set((current) => normalizeState(current));
      },

      rebuildCompetitionRounds() {
        set((current) => normalizeState(current));
      },

      rebuildRuleEcologyStats() {
        set((current) => normalizeState(current));
      },

      rebuildCompetitionGroupEcology() {
        set((current) => normalizeState(current));
      },

      rebuildRuleDecayRecords() {
        set((current) => normalizeState(current));
      },

      rebuildPressureMemory() {
        set((current) => normalizeState(current));
      },

      rebuildCooldownState() {
        set((current) => normalizeState(current));
      },

      rebuildIncumbents() {
        set((current) => normalizeState(current));
      },

      rebuildGroupStability() {
        set((current) => normalizeState(current));
      },

      rebuildLayeredPressureMemory() {
        set((current) => normalizeState(current));
      },

      rebuildRecoveryMode() {
        set((current) => normalizeState(current));
      },

      rebuildDominanceConsolidation() {
        set((current) => normalizeState(current));
      },

      rebuildContestDampening() {
        set((current) => normalizeState(current));
      },

      rebuildStabilityInertia() {
        set((current) => normalizeState(current));
      },

      applyReviewSignalToLearning(reviewSignalId) {
        set((current) => {
          const nextSignals = current.reviewSignals.map((signal) =>
            signal.id === reviewSignalId
              ? {
                  ...signal,
                  status: "applied" as const
                }
              : signal
          );

          return normalizeState({
            ...current,
            reviewSignals: nextSignals
          });
        });
      },

      runFalsificationPass() {
        set((current) => normalizeState(current));
      },

      runLearningPass() {
        set((current) => normalizeState(current));
      },

      runEvolutionPass() {
        set((current) => normalizeState(current));
      },

      runTemporalPass() {
        set((current) => normalizeState(current));
      },

      runEcologyPass() {
        set((current) => normalizeState(current));
      },

      runRecoveryPass() {
        set((current) => normalizeState(current));
      },

      runStabilizationPass() {
        set((current) => normalizeState(current));
      },

      runMemoryPass() {
        set((current) => normalizeState(current));
      },

      runConsolidationPass() {
        set((current) => normalizeState(current));
      },

      forceReevaluateRule(ruleId) {
        set((current) => {
          const nextRules = current.rules.map((rule) =>
            rule.id === ruleId
              ? {
                  ...rule,
                  updatedAt: nowIso()
                }
              : rule
          );

          return normalizeState({
            ...current,
            rules: nextRules
          });
        });
      },

      async hydrateProjectFile() {
        if (projectFileHydrated) return;

        const currentSnapshot = cloneWorkbenchState(get());
        const currentFingerprint = fingerprintWorkbenchState(currentSnapshot);
        const currentFreshness = getWorkbenchStateFreshness(currentSnapshot);

        const persisted = await fetchWorkbenchStateFromProjectFile();
        if (persisted) {
          const persistedFreshness = getWorkbenchStateFreshness(persisted.state);
          const shouldAdoptPersisted = persistedFreshness >= currentFreshness || currentFingerprint === initialWorkbenchFingerprint;
          if (shouldAdoptPersisted) {
            const normalized = normalizeState({
              ...currentSnapshot,
              ...persisted.state
            });
            set(() => normalized);
            const nextFingerprint = fingerprintWorkbenchState(normalized);
            projectFileLastFingerprint = nextFingerprint;
            projectFileHydrated = true;
            return;
          }

          await saveWorkbenchStateToProjectFile(currentSnapshot);
          projectFileHydrated = true;
          projectFileLastFingerprint = currentFingerprint;
          return;
        }

        await saveWorkbenchStateToProjectFile(currentSnapshot);
        projectFileHydrated = true;
        projectFileLastFingerprint = currentFingerprint;
      },

      resetMockState() {
        set(() => withResetState());
      }
    }),
      {
        name: STORAGE_KEY,
        storage,
      version: 12,
      migrate: (persistedState, version) => {
        if (version < 10) {
          return buildInitialAppState();
        }

        const next = persistedState as Partial<AppState> | undefined;
        if (
          !next ||
          !Array.isArray(next.sessions) ||
          !Array.isArray(next.rules) ||
          !Array.isArray(next.studentTemplates) ||
          !Array.isArray(next.sessionRuleJudgments) ||
          !Array.isArray(next.reviewSignals) ||
          !Array.isArray(next.ruleEvidences) ||
          !Array.isArray(next.ruleAggregateStats) ||
          !Array.isArray(next.ruleCompetitionStats) ||
          !Array.isArray(next.rulePerformanceRecords) ||
          !Array.isArray(next.ruleTemporalStats) ||
          !Array.isArray(next.competitionRoundRecords) ||
          !Array.isArray(next.ruleEcologyStats) ||
          !Array.isArray(next.competitionGroupEcology) ||
          !Array.isArray(next.ruleDecayRecords) ||
          !Array.isArray(next.ruleContradictions) ||
          !Array.isArray(next.reviewSignalApplications) ||
          !Array.isArray(next.hypothesisRules) ||
          !Array.isArray(next.ruleCompetitionGroups) ||
          !Array.isArray(next.ruleReplacementRecords)
        ) {
          return buildInitialAppState();
        }

        return {
          ...(next as AppState),
          proxyCalibrationStates: Array.isArray(next.proxyCalibrationStates) ? next.proxyCalibrationStates : []
        } as AppState;
      },
      partialize: (state) => ({
        studentTemplates: state.studentTemplates,
        currentStudentConfig: state.currentStudentConfig,
        activeSimulatedStudentProfile: state.activeSimulatedStudentProfile,
        sessions: state.sessions,
        sessionRuleJudgments: state.sessionRuleJudgments,
        ruleEvidences: state.ruleEvidences,
        ruleAggregateStats: state.ruleAggregateStats,
        ruleCompetitionStats: state.ruleCompetitionStats,
        rulePerformanceRecords: state.rulePerformanceRecords,
        ruleTemporalStats: state.ruleTemporalStats,
        competitionRoundRecords: state.competitionRoundRecords,
        ruleEcologyStats: state.ruleEcologyStats,
        competitionGroupEcology: state.competitionGroupEcology,
        ruleDecayRecords: state.ruleDecayRecords,
        ruleContradictions: state.ruleContradictions,
        reviewSignalApplications: state.reviewSignalApplications,
        rules: state.rules,
        hypothesisRules: state.hypothesisRules,
        ruleCompetitionGroups: state.ruleCompetitionGroups,
        ruleReplacementRecords: state.ruleReplacementRecords,
        reviewSignals: state.reviewSignals,
        personaModel: state.personaModel,
        proxyReviewCases: state.proxyReviewCases,
        proxyCalibrationStates: state.proxyCalibrationStates,
        latestFixtureRegressionReport: state.latestFixtureRegressionReport,
        activeSessionId: state.activeSessionId,
        selectedSessionId: state.selectedSessionId,
        selectedProxyReviewCaseId: state.selectedProxyReviewCaseId,
        selectedStudentTemplateId: state.selectedStudentTemplateId,
        trainingDraft: state.trainingDraft,
        sessionFilterStudentType: state.sessionFilterStudentType,
        sessionRuleStatusFilter: state.sessionRuleStatusFilter,
        proxyReviewFeedbackDraft: state.proxyReviewFeedbackDraft
      }),
      merge: (persistedState, currentState) => {
        const next = {
          ...currentState,
          ...(persistedState as Partial<AppState>)
        } as CopymeStore;
        return normalizeState(next) as CopymeStore;
      }
    }
  )
);

if (typeof window !== "undefined") {
  useCopymeStore.subscribe((state) => {
    scheduleProjectFileSync(state);
  });
}

export function useWorkbenchState<T>(selector: (state: CopymeStore) => T) {
  return useCopymeStore(selector);
}

export const workbenchSelectors = {
  selectAcceptedRules: (state: CopymeStore) => selectAcceptedGlobalRules(state)
};
