import {
  buildCompetitionCandidateScores,
  buildCompetitionGroupAudit as buildCompetitionGroupAuditInternal
} from "@/lib/rule-competition-groups";
import {
  selectCompetitionRoundRecords,
  selectCompetitionGroupEcology,
  selectRuleCompetitionGroups,
  selectReviewSignalApplications,
  selectHypothesisRuleById,
  selectHypothesisRules,
  selectRuleAggregateStats,
  selectRuleCompetitionStats,
  selectRuleContradictions,
  selectRuleEvidenceByRule,
  selectRuleDecayRecords,
  selectRuleEcologyStats,
  selectRulePerformanceRecords,
  selectRuleTemporalStats,
  selectRuleReplacementRecords,
  selectRuleById
} from "@/lib/selectors";
import type { AppState, HypothesisRule, PersonaRule, RecoveryMode, RuleLifecycleState, RuleReplacementRecord } from "@/lib/types";
import { explainWhyRuleChanged as explainCompetitionChange } from "@/lib/rule-competition";
import { buildRuleCompetitionGroups } from "@/lib/rule-competition-groups";
import { explainWhyHypothesisWon as explainHypothesisReplacement } from "@/lib/rule-replacement";
import { explainWhyRuleIsCurrentlyBest as explainTemporalBest, explainWhyRuleIsFading as explainTemporalFade } from "@/lib/rule-temporal";
import {
  explainWhyRuleIsDominant,
  explainWhyRuleIsFragile,
  explainWhyRuleIsStillDominant,
  explainWhyRuleWasDestabilized
} from "@/lib/rule-ecology";
import { explainWhyRuleIsBeingReplaced, explainWhyRuleStillHolds } from "@/lib/stabilization-kernel";
import { explainWhyRuleIsStillPressured, explainWhyRuleRecovered, explainWhyRuleHasNotRecovered, explainWhyRuleRecoveredSlowly } from "@/lib/cooldown-kernel";
import { explainContestDampening } from "@/lib/contest-dampening";
import { explainDominanceConsolidation } from "@/lib/dominance-consolidation";
import { describeLayeredPressureMemory } from "@/lib/layered-memory";

export type RuleAuditTrail = {
  ruleId: string;
  ruleText: string;
  lifecycle: RuleLifecycleState;
  verdictSummary: string;
  currentVerdictSummary: string;
  supportEvidences: ReturnType<typeof selectRuleEvidenceByRule>;
  challengeEvidences: ReturnType<typeof selectRuleEvidenceByRule>;
  reviewSignals: Array<{ id: string; signalType: string; targetLayer: string; description: string; status: string; createdAt: string }>;
  reviewSignalApplications: ReturnType<typeof selectReviewSignalApplications>;
  contradictions: ReturnType<typeof selectRuleContradictions>;
  sourceSessions: string[];
  latestConfidence: number;
  stabilityScore: number;
  aggregateStats?: ReturnType<typeof selectRuleAggregateStats>;
  competitionStats?: ReturnType<typeof selectRuleCompetitionStats>;
  latestSupportEvidence?: ReturnType<typeof selectRuleEvidenceByRule>[number];
  latestChallengeEvidence?: ReturnType<typeof selectRuleEvidenceByRule>[number];
  competitionGroup?: ReturnType<typeof buildCompetitionGroupAudit>;
  replacementRecords: RuleReplacementRecord[];
  relatedHypotheses: HypothesisRule[];
  competingRules: Array<{ id: string; text: string; status: string; kind: "rule" | "hypothesis" }>;
  temporalStats?: ReturnType<typeof selectRuleTemporalStats>;
  performanceRecords: ReturnType<typeof selectRulePerformanceRecords>;
  competitionRounds: ReturnType<typeof selectCompetitionRoundRecords>;
  ecologyStats?: ReturnType<typeof selectRuleEcologyStats>;
  decayRecords: ReturnType<typeof selectRuleDecayRecords>;
  competitionGroupEcology?: ReturnType<typeof selectCompetitionGroupEcology>;
  pressureMemory?: number;
  cooldownLevel?: number;
  recoveryProgress?: number;
  layeredMemoryBreakdown?: ReturnType<typeof describeLayeredPressureMemory>;
  recoveryMode?: RecoveryMode;
  stabilityPenalty?: number;
  dominanceConsolidation?: number;
  dominanceStrength?: number;
  contestDampening?: number;
  stabilityInertia?: number;
  hardeningScore?: number;
  destabilizationPenalty?: number;
  pressureVerdict: ReturnType<typeof explainWhyRuleIsStillPressured>;
  recoveryVerdict: ReturnType<typeof explainWhyRuleRecovered>;
  memoryPressureVerdict: ReturnType<typeof explainWhyRuleHasNotRecovered>;
  slowRecoveryVerdict: ReturnType<typeof explainWhyRuleRecoveredSlowly>;
  temporalVerdict: {
    currentBest: ReturnType<typeof explainWhyRuleIsCurrentlyBest>;
    fading: ReturnType<typeof explainWhyRuleIsFading>;
  };
  ecologyVerdict: {
    dominant: ReturnType<typeof explainWhyRuleIsDominant>;
    fragile: ReturnType<typeof explainWhyRuleIsFragile>;
    stillDominant: ReturnType<typeof explainWhyRuleIsStillDominant>;
    destabilized: ReturnType<typeof explainWhyRuleWasDestabilized>;
    consolidation: ReturnType<typeof explainDominanceConsolidation>;
    dampening: ReturnType<typeof explainContestDampening>;
    stillHolds: ReturnType<typeof explainWhyRuleStillHolds>;
    beingReplaced: ReturnType<typeof explainWhyRuleIsBeingReplaced>;
  };
};

export function buildRuleAuditTrail(
  state: Pick<
    AppState,
    | "rules"
    | "hypothesisRules"
    | "ruleCompetitionGroups"
    | "ruleReplacementRecords"
    | "ruleEvidences"
    | "ruleAggregateStats"
    | "ruleCompetitionStats"
    | "ruleContradictions"
    | "reviewSignals"
    | "reviewSignalApplications"
    | "sessions"
    | "ruleTemporalStats"
    | "rulePerformanceRecords"
    | "competitionRoundRecords"
    | "ruleEcologyStats"
    | "competitionGroupEcology"
    | "ruleDecayRecords"
  >,
  ruleId: string
): RuleAuditTrail | undefined {
  const rule = selectRuleById(state, ruleId);
  if (!rule) return undefined;

  const evidences = selectRuleEvidenceByRule(state, ruleId);
  const supportEvidences = evidences.filter((evidence) => evidence.evidenceType === "support");
  const challengeEvidences = evidences.filter((evidence) => evidence.evidenceType === "challenge");
  const reviewSignalApplications = selectReviewSignalApplications(state).filter((application) => application.appliedToRuleIds.includes(ruleId));
  const reviewSignals = state.reviewSignals.filter((signal) => reviewSignalApplications.some((application) => application.reviewSignalId === signal.id));
  const aggregateStats = selectRuleAggregateStats(state, ruleId);
  const competitionStats = selectRuleCompetitionStats(state, ruleId);
  const temporalStats = selectRuleTemporalStats(state, ruleId);
  const performanceRecords = selectRulePerformanceRecords(state, ruleId);
  const competitionRounds = selectCompetitionRoundRecords(state, rule.competitionGroupId);
  const contradictions = selectRuleContradictions(state, ruleId);
  const verdict = explainCompetitionChange(rule, aggregateStats, competitionStats, contradictions);
  const temporalVerdict = {
    currentBest: explainTemporalBest(ruleId, temporalStats, competitionRounds, state.ruleCompetitionGroups),
    fading: explainTemporalFade(ruleId, temporalStats, competitionRounds)
  };
  const ecologyStats = selectRuleEcologyStats(state, ruleId);
  const competitionGroupEcology = selectCompetitionGroupEcology(state, rule.competitionGroupId);
  const decayRecords = selectRuleDecayRecords(state, ruleId);
  const groupEcology = competitionGroupEcology.find((item) => item.competitionGroupId === rule.competitionGroupId);
  const pressureMemory = groupEcology?.pressureMemory ?? ecologyStats?.inheritedPressure ?? 0;
  const cooldownLevel = groupEcology?.cooldownLevel ?? ecologyStats?.cooldownPenalty ?? 0;
  const recoveryProgress = groupEcology?.recoveryProgress ?? (ecologyStats?.recoveryScore ?? 100) / 100;
  const recoveryMode = groupEcology?.recoveryMode ?? ecologyStats?.recoveryMode ?? "stabilized";
  const layeredMemoryBreakdown = describeLayeredPressureMemory(groupEcology?.layeredPressureMemory ?? ecologyStats?.layeredPressureImpact);
  const stabilityPenalty = groupEcology?.layeredPressureMemory
    ? layeredMemoryBreakdown.total * 0.3 +
      cooldownLevel * 0.24 +
      (recoveryMode === "stalled" ? 18 : recoveryMode === "slow" ? 10 : recoveryMode === "recovering" ? 4 : 0)
    : ecologyStats?.stabilityPenalty ?? 0;
  const dominanceConsolidation = groupEcology?.dominanceConsolidation ?? ecologyStats?.dominanceStrength ?? ecologyStats?.hardeningScore ?? 0;
  const dominanceStrength = ecologyStats?.dominanceStrength ?? 0;
  const contestDampening = groupEcology?.contestDampening ?? Math.max(0, 18 - (groupEcology?.replacementRisk ?? ecologyStats?.replacementRisk ?? 0) * 0.18);
  const stabilityInertia = groupEcology?.stabilityInertia ?? ecologyStats?.hardeningScore ?? 0;
  const hardeningScore = ecologyStats?.hardeningScore ?? 0;
  const destabilizationPenalty = ecologyStats?.destabilizationPenalty ?? 0;
  const recentPressureSources = Array.from(
    new Set([
      ...state.ruleContradictions.filter((item) => item.ruleId === ruleId).map((item) => item.sourceId),
      ...reviewSignals.map((signal) => signal.id)
    ])
  );
  const ecologyVerdict = {
    dominant: explainWhyRuleIsDominant(ruleId, ecologyStats, groupEcology),
    fragile: explainWhyRuleIsFragile(ruleId, ecologyStats, groupEcology),
    stillDominant: explainWhyRuleIsStillDominant(ruleId, ecologyStats, groupEcology),
    destabilized: explainWhyRuleWasDestabilized(ruleId, ecologyStats, groupEcology),
    consolidation: explainDominanceConsolidation({
      dominanceConsolidation,
      dominanceStrength,
      hardeningScore,
      stabilityInertia,
      layeredPressureMemory: groupEcology?.layeredPressureMemory
    }),
    dampening: explainContestDampening({
      contestDampening,
      dominanceConsolidation,
      stabilityInertia,
      layeredPressureMemory: groupEcology?.layeredPressureMemory,
      recoveryMode
    }),
    stillHolds: explainWhyRuleStillHolds({
      ruleId,
      dominanceSpan: ecologyStats?.dominanceSpan ?? 0,
      lockStatus: groupEcology?.lockStatus ?? "unlocked",
      effectivePressure: ecologyStats?.effectivePressure ?? 0,
      resistanceScore: ecologyStats?.resistanceScore ?? 0,
      challengerCount: ecologyStats?.challengerCount ?? 0
    }),
    beingReplaced: explainWhyRuleIsBeingReplaced({
      ruleId,
      turnoverCounter: groupEcology?.turnoverCounter ?? 0,
      effectivePressure: ecologyStats?.effectivePressure ?? 0,
      challengerRuleIds: groupEcology?.challengerRuleIds ?? [],
      lockStatus: groupEcology?.lockStatus ?? "unlocked"
    })
  };
  const pressureVerdict = explainWhyRuleIsStillPressured({
    ruleId,
    pressureMemory,
    cooldownLevel,
    recoveryProgress,
    recoveryMode,
    recentPressureSources,
    lastPressureAt: groupEcology?.lastPressureAt
  });
  const recoveryVerdict = explainWhyRuleRecovered({
    ruleId,
    cooldownLevel,
    recoveryProgress,
    recoveryMode,
    lastRecoveryAt: groupEcology?.lastRecoveryAt,
    lastBreakAt: groupEcology?.lastBreakAt
  });
  const memoryPressureVerdict = explainWhyRuleHasNotRecovered({
    ruleId,
    pressureMemory,
    layeredPressureMemory: groupEcology?.layeredPressureMemory ?? ecologyStats?.layeredPressureImpact,
    cooldownLevel,
    recoveryProgress,
    recoveryMode,
    recentPressureSources,
    lastPressureAt: groupEcology?.lastPressureAt
  });
  const slowRecoveryVerdict = explainWhyRuleRecoveredSlowly({
    ruleId,
    layeredPressureMemory: groupEcology?.layeredPressureMemory ?? ecologyStats?.layeredPressureImpact,
    cooldownLevel,
    recoveryProgress,
    recoveryMode,
    lastRecoveryAt: groupEcology?.lastRecoveryAt,
    lastBreakAt: groupEcology?.lastBreakAt
  });
  const replacementRecords = selectRuleReplacementRecords(state, ruleId);
  const relatedHypotheses = state.hypothesisRules.filter(
    (hypothesis) => hypothesis.parentRuleIds.includes(ruleId) || hypothesis.competingRuleIds.includes(ruleId) || hypothesis.replacedByRuleId === ruleId
  );
  const competitionGroup = rule.competitionGroupId
    ? buildCompetitionGroupAuditInternal({
        group: state.ruleCompetitionGroups.find((group) => group.id === rule.competitionGroupId) ?? {
          id: rule.competitionGroupId,
          layer: rule.layer,
          topicKey: rule.topicKey ?? rule.layer,
          ruleIds: [rule.id],
          status: "open",
          createdAt: rule.createdAt
        },
        candidateScores: buildCompetitionCandidateScores({
          rules: state.rules,
          hypothesisRules: state.hypothesisRules,
          aggregateStats: state.ruleAggregateStats,
          competitionStats: state.ruleCompetitionStats,
          contradictions: state.ruleContradictions,
          evidences: state.ruleEvidences,
          reviewSignals: state.reviewSignals,
          reviewSignalApplications: state.reviewSignalApplications,
          temporalStats: state.ruleTemporalStats ?? [],
          ecologyStats: state.ruleEcologyStats ?? []
        }),
        rules: state.rules,
        hypothesisRules: state.hypothesisRules
      })
    : undefined;

  return {
    ruleId,
    ruleText: rule.text,
    lifecycle: rule.status,
    verdictSummary: verdict.summary,
    currentVerdictSummary: verdict.summary,
    supportEvidences,
    challengeEvidences,
    reviewSignals,
    reviewSignalApplications,
    contradictions,
    sourceSessions: aggregateStats?.sourceSessionIds ?? rule.sourceSessionIds,
    latestConfidence: aggregateStats?.currentConfidence ?? rule.confidence,
    stabilityScore: aggregateStats?.stabilityScore ?? 0,
    aggregateStats,
    competitionStats,
    latestSupportEvidence: supportEvidences.at(-1),
    latestChallengeEvidence: challengeEvidences.at(-1),
    competitionGroup,
    replacementRecords,
    relatedHypotheses,
    temporalStats,
    performanceRecords,
    competitionRounds,
    ecologyStats,
    decayRecords,
    competitionGroupEcology,
    pressureMemory,
    cooldownLevel,
    recoveryProgress,
    layeredMemoryBreakdown,
    recoveryMode,
    stabilityPenalty,
    dominanceConsolidation,
    dominanceStrength,
    contestDampening,
    stabilityInertia,
    hardeningScore,
    destabilizationPenalty,
    temporalVerdict,
    ecologyVerdict,
    pressureVerdict,
    recoveryVerdict,
    memoryPressureVerdict,
    slowRecoveryVerdict,
    competingRules: competitionGroup
      ? competitionGroup.members.map((member) => ({
          id: member.id,
          text: member.text,
          status: member.kind === "rule" ? member.status : member.status,
          kind: member.kind
        }))
      : []
  };
}

export function explainWhyRuleChanged(state: Pick<AppState, "rules" | "ruleAggregateStats" | "ruleCompetitionStats" | "ruleContradictions">, ruleId: string) {
  const rule = selectRuleById(state, ruleId);
  if (!rule) return undefined;
  const aggregateStats = selectRuleAggregateStats(state, ruleId);
  const competitionStats = selectRuleCompetitionStats(state, ruleId);
  const contradictions = selectRuleContradictions(state, ruleId);
  return explainCompetitionChange(rule, aggregateStats, competitionStats, contradictions);
}

export function explainWhyRuleIsCurrentlyBest(
  state: Pick<AppState, "rules" | "ruleTemporalStats" | "competitionRoundRecords" | "ruleCompetitionGroups">,
  ruleId: string
) {
  return explainTemporalBest(
    ruleId,
    selectRuleTemporalStats(state, ruleId),
    selectCompetitionRoundRecords(state, state.ruleCompetitionGroups.find((group) => group.activeRuleId === ruleId)?.id),
    state.ruleCompetitionGroups
  );
}

export function explainWhyRuleIsFading(
  state: Pick<AppState, "rules" | "ruleTemporalStats" | "competitionRoundRecords">,
  ruleId: string
) {
  return explainTemporalFade(ruleId, selectRuleTemporalStats(state, ruleId), selectCompetitionRoundRecords(state));
}

export function buildCompetitionGroupAudit(
  state: Pick<
    AppState,
    | "rules"
    | "hypothesisRules"
    | "ruleCompetitionGroups"
    | "ruleReplacementRecords"
    | "ruleEvidences"
    | "ruleAggregateStats"
    | "ruleCompetitionStats"
    | "ruleContradictions"
    | "reviewSignals"
    | "reviewSignalApplications"
    | "ruleTemporalStats"
    | "ruleEcologyStats"
  >,
  groupId: string
) {
  const group = selectRuleCompetitionGroups(state).find((item) => item.id === groupId);
  if (!group) return undefined;

  const candidateScores = buildCompetitionCandidateScores({
    rules: state.rules,
    hypothesisRules: state.hypothesisRules,
    aggregateStats: state.ruleAggregateStats,
    competitionStats: state.ruleCompetitionStats,
    contradictions: state.ruleContradictions,
    evidences: state.ruleEvidences,
    reviewSignals: state.reviewSignals,
    reviewSignalApplications: state.reviewSignalApplications,
    temporalStats: state.ruleTemporalStats ?? [],
    ecologyStats: state.ruleEcologyStats ?? []
  });

  return buildCompetitionGroupAuditInternal({
    group,
    candidateScores,
    rules: state.rules,
    hypothesisRules: state.hypothesisRules
  });
}

export function explainWhyHypothesisWon(state: Pick<AppState, "rules" | "hypothesisRules" | "ruleCompetitionGroups" | "ruleReplacementRecords">, hypothesisId: string) {
  return explainHypothesisReplacement({
    hypothesisId,
    hypothesisRules: state.hypothesisRules,
    rules: state.rules,
    ruleCompetitionGroups: state.ruleCompetitionGroups,
    ruleReplacementRecords: state.ruleReplacementRecords
  });
}
