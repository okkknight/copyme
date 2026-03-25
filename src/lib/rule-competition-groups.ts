import {
  RULE_COMPETITION_GROUP_THRESHOLDS
} from "@/lib/evolution-thresholds";
import {
  clampCompetitionScore,
  RULE_COMPETITION_THRESHOLDS
} from "@/lib/falsification-thresholds";
import { COOLDOWN_THRESHOLDS } from "@/lib/recovery-thresholds";
import {
  TEMPORAL_COMPETITION_THRESHOLDS,
  TEMPORAL_TREND_THRESHOLDS
} from "@/lib/temporal-thresholds";
import {
  ECOLOGY_CHALLENGE_THRESHOLDS,
  ECOLOGY_DOMINANCE_THRESHOLDS,
  ECOLOGY_RESILIENCE_THRESHOLDS
} from "@/lib/ecology-thresholds";
import { deriveTopicKeyFromRuleText } from "@/lib/hypothesis-generation";
import { aggregateLayeredPressureMemory, describeLayeredPressureMemory } from "@/lib/layered-memory";
import { applyContestDampening } from "@/lib/contest-dampening";
import { computeChallengerMomentum } from "@/lib/stabilization-kernel";
import { STABILIZATION_BINDING_WEIGHTS, STABILIZATION_TURNOVER_THRESHOLDS } from "@/lib/stabilization-thresholds";
import { computePressureMemoryBoost } from "@/lib/pressure-memory";
import type {
  AppState,
  CompetitionGroupEcology,
  HypothesisRule,
  PersonaLayer,
  PersonaRule,
  RuleAggregateStats,
  RuleCompetitionGroup,
  RuleCompetitionGroupStatus,
  RuleCompetitionStats,
  RuleContradiction,
  RuleEvidence,
  RuleEcologyStats,
  RuleTemporalStats,
  ReviewSignal,
  ReviewSignalApplication
} from "@/lib/types";

export type CompetitionCandidateKind = "rule" | "hypothesis";

export type CompetitionCandidateScore = {
  id: string;
  kind: CompetitionCandidateKind;
  layer: PersonaLayer;
  topicKey: string;
  supportWeight: number;
  challengeWeight: number;
  contradictionScore: number;
  correctionPressure: number;
  netScore: number;
  confidenceScore: number;
  survivabilityScore: number;
  recentWinRate: number;
  recentFailureRate: number;
  momentumScore: number;
  volatilityScore: number;
  decayAdjustedScore: number;
  sourceSessionCount: number;
  rationale: string;
};

function nowIso() {
  return new Date().toISOString();
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function scoreRule(
  rule: PersonaRule,
  aggregateStats?: RuleAggregateStats,
  competitionStats?: RuleCompetitionStats,
  temporalStats?: RuleTemporalStats,
  ecologyStats?: RuleEcologyStats
): CompetitionCandidateScore {
  const topicKey = rule.topicKey ?? deriveTopicKeyFromRuleText(rule.text, rule.layer);
  const supportWeight = competitionStats?.supportWeight ?? (aggregateStats?.supportCount ?? 0) * 1.8 + (aggregateStats?.sourceSessionCount ?? rule.sourceSessionIds.length) * 1.2;
  const challengeWeight = competitionStats?.challengeWeight ?? (aggregateStats?.challengeCount ?? 0) * 2;
  const contradictionScore = competitionStats?.contradictionScore ?? 0;
  const correctionPressure = competitionStats?.correctionPressure ?? 0;
  const recentWinRate = temporalStats?.recentWinRate ?? 0;
  const recentFailureRate = temporalStats?.recentFailureRate ?? 0;
  const momentumScore = temporalStats?.momentumScore ?? 0;
  const volatilityScore = temporalStats?.volatilityScore ?? 0;
  const decayAdjustedScore = temporalStats?.decayAdjustedScore ?? 50;
  const dominanceConsolidation = ecologyStats?.dominanceStrength ?? ecologyStats?.hardeningScore ?? 0;
  const stabilityInertia = ecologyStats?.hardeningScore ?? 0;
  const contestDampening = ecologyStats?.replacementRisk ? Math.max(0, 18 - ecologyStats.replacementRisk * 0.18) : 0;
  const hardeningScore = ecologyStats?.hardeningScore ?? 0;
  const destabilizationPenalty = ecologyStats?.destabilizationPenalty ?? 0;
  const ecologyLift =
    (ecologyStats?.resilienceScore ?? 0) * 0.32 +
    (ecologyStats?.dominanceSpan ?? 0) * 4 +
    (ecologyStats?.currentWinStreak ?? 0) * 2.5 -
    (ecologyStats?.effectivePressure ?? ecologyStats?.challengePressure ?? 0) * 0.22 -
    (ecologyStats?.idleDecayScore ?? 0) * 0.18 +
    (ecologyStats?.resistanceScore ?? 0) * 0.16 -
    (ecologyStats?.replacementRisk ?? 0) * 0.18 +
    dominanceConsolidation * 0.22 +
    stabilityInertia * 0.12 +
    contestDampening * 0.16 +
    hardeningScore * 0.2 -
    destabilizationPenalty * 0.22 +
    (ecologyStats?.ecologyStatus === "dominant"
      ? 8
      : ecologyStats?.ecologyStatus === "fragile"
        ? -2
        : ecologyStats?.ecologyStatus === "contested"
          ? -5
          : -8);
  const temporalLift = recentWinRate * 12 + momentumScore * 0.55 + decayAdjustedScore * 0.16 - recentFailureRate * 10 - volatilityScore * 0.25;
  const netScore = competitionStats?.netScore ?? supportWeight - challengeWeight - contradictionScore - correctionPressure + temporalLift * 0.1 + ecologyLift * 0.08;
  const confidenceScore = competitionStats?.confidenceScore ?? clamp((aggregateStats?.currentConfidence ?? rule.confidence) * 100 + temporalLift * 0.2 + ecologyLift * 0.25, 0, 100);
  const survivabilityScore =
    competitionStats?.survivabilityScore ??
    clampCompetitionScore(18 + netScore * 10 + confidenceScore * 0.2 + decayAdjustedScore * 0.45 + ecologyLift * 0.35 - volatilityScore * 0.25);

  return {
    id: rule.id,
    kind: "rule",
    layer: rule.layer,
    topicKey,
    supportWeight,
    challengeWeight,
    contradictionScore,
    correctionPressure,
    netScore,
    confidenceScore,
    survivabilityScore,
    recentWinRate,
    recentFailureRate,
    momentumScore,
    volatilityScore,
    decayAdjustedScore,
    sourceSessionCount: aggregateStats?.sourceSessionCount ?? rule.sourceSessionIds.length,
    rationale: rule.evidence
  };
}

function scoreHypothesis(
  hypothesis: HypothesisRule,
  contradictions: RuleContradiction[],
  evidences: RuleEvidence[],
  reviewSignals: ReviewSignal[] = [],
  reviewSignalApplications: ReviewSignalApplication[] = [],
  temporalStats: RuleTemporalStats[] = [],
  ecologyStats?: RuleEcologyStats
): CompetitionCandidateScore {
  const hypothesisEvidence = evidences.filter((evidence) => evidence.ruleId === hypothesis.id);
  const supportingContradictions = contradictions.filter((item) => hypothesis.sourceIds.includes(item.id) || hypothesis.parentRuleIds.includes(item.ruleId));
  const supportingApplications = reviewSignalApplications.filter((application) => hypothesis.sourceIds.includes(application.reviewSignalId));
  const temporal = temporalStats.find((item) => item.ruleId === hypothesis.id);
  const sourceSessionCount = unique([
    ...hypothesis.sourceSessionIds,
    ...hypothesisEvidence.map((evidence) => evidence.sessionId)
  ]).length;
  const supportWeight =
    hypothesis.confidence * 50 +
    sourceSessionCount * 12 +
    hypothesis.evidenceTurnIds.length * 2 +
    supportingContradictions.length * 6 +
    supportingApplications.length * 5 +
    (temporal?.recentWinRate ?? 0) * 18 +
    (temporal?.momentumScore ?? 0) * 0.35;
  const challengeWeight = hypothesis.parentRuleIds.length * 6 + Math.max(hypothesis.competingRuleIds.length, 0) * 1.8;
  const contradictionScore = supportingContradictions.reduce((sum, contradiction) => {
    const severity = contradiction.severity === "high" ? 2.4 : contradiction.severity === "medium" ? 1.4 : 0.7;
    return sum + severity;
  }, hypothesis.sourceType === "contradiction" ? 1.6 : 0.9);
  const correctionPressure = supportingApplications.reduce((sum, application) => {
    const signal = reviewSignals.find((item) => item.id === application.reviewSignalId);
    const boundaryBonus = signal?.targetLayer === "boundary" ? 2 : signal?.targetLayer === "decision" ? 1.3 : 0.8;
    return sum + boundaryBonus + (application.didForceDowngrade ? 2.5 : 0);
  }, hypothesis.sourceType === "review_signal" ? 6 : 3);
  const recentWinRate = temporal?.recentWinRate ?? 0;
  const recentFailureRate = temporal?.recentFailureRate ?? 0;
  const momentumScore = temporal?.momentumScore ?? 0;
  const volatilityScore = temporal?.volatilityScore ?? 0;
  const decayAdjustedScore = temporal?.decayAdjustedScore ?? 50;
  const dominanceConsolidation = ecologyStats?.dominanceStrength ?? ecologyStats?.hardeningScore ?? 0;
  const stabilityInertia = ecologyStats?.hardeningScore ?? 0;
  const contestDampening = ecologyStats?.replacementRisk ? Math.max(0, 16 - ecologyStats.replacementRisk * 0.16) : 0;
  const hardeningScore = ecologyStats?.hardeningScore ?? 0;
  const destabilizationPenalty = ecologyStats?.destabilizationPenalty ?? 0;
  const ecologyLift =
    (ecologyStats?.resilienceScore ?? 0) * 0.3 +
    (ecologyStats?.dominanceSpan ?? 0) * 3.5 +
    (ecologyStats?.currentWinStreak ?? 0) * 2 -
    (ecologyStats?.effectivePressure ?? ecologyStats?.challengePressure ?? 0) * 0.24 -
    (ecologyStats?.idleDecayScore ?? 0) * 0.16 +
    (ecologyStats?.resistanceScore ?? 0) * 0.14 -
    (ecologyStats?.replacementRisk ?? 0) * 0.16 +
    dominanceConsolidation * 0.2 +
    stabilityInertia * 0.1 +
    contestDampening * 0.14 +
    hardeningScore * 0.18 -
    destabilizationPenalty * 0.2 +
    (ecologyStats?.ecologyStatus === "dominant"
      ? 8
      : ecologyStats?.ecologyStatus === "fragile"
        ? -1
        : ecologyStats?.ecologyStatus === "contested"
          ? -4
          : -7);
  const netScore = supportWeight - challengeWeight - contradictionScore - correctionPressure + decayAdjustedScore * 0.08 + momentumScore * 0.12 + ecologyLift * 0.08;
  const confidenceScore = clampCompetitionScore(
    hypothesis.confidence * 100 + supportWeight * 0.55 - challengeWeight * 0.65 - contradictionScore * 10 + recentWinRate * 14 - recentFailureRate * 9 + momentumScore * 0.18 + ecologyLift * 0.22
  );
  const survivabilityScore = clampCompetitionScore(
    14 + netScore * 1.1 + confidenceScore * 0.28 - contradictionScore * 4 - correctionPressure * 1.5 + decayAdjustedScore * 0.4 + ecologyLift * 0.3 - volatilityScore * 0.25
  );

  return {
    id: hypothesis.id,
    kind: "hypothesis",
    layer: hypothesis.layer,
    topicKey: hypothesis.topicKey,
    supportWeight,
    challengeWeight,
    contradictionScore,
    correctionPressure,
    netScore,
    confidenceScore,
    survivabilityScore,
    recentWinRate,
    recentFailureRate,
    momentumScore,
    volatilityScore,
    decayAdjustedScore,
    sourceSessionCount,
    rationale: hypothesis.rationale
  };
}

export function buildCompetitionCandidateScores({
  rules,
  hypothesisRules,
  aggregateStats,
  competitionStats,
  contradictions,
  evidences,
  reviewSignals,
  reviewSignalApplications,
  temporalStats,
  ecologyStats = []
}: {
  rules: PersonaRule[];
  hypothesisRules: HypothesisRule[];
  aggregateStats: RuleAggregateStats[];
  competitionStats: RuleCompetitionStats[];
  contradictions: RuleContradiction[];
  evidences: RuleEvidence[];
  reviewSignals: ReviewSignal[];
  reviewSignalApplications: ReviewSignalApplication[];
  temporalStats: RuleTemporalStats[];
  ecologyStats?: RuleEcologyStats[];
}) {
  const aggregateByRuleId = new Map(aggregateStats.map((stats) => [stats.ruleId, stats]));
  const competitionByRuleId = new Map(competitionStats.map((stats) => [stats.ruleId, stats]));
  const temporalByRuleId = new Map(temporalStats.map((stats) => [stats.ruleId, stats]));
  const ecologyByRuleId = new Map(ecologyStats.map((stats) => [stats.ruleId, stats]));
  const scores = new Map<string, CompetitionCandidateScore>();

  for (const rule of rules) {
    scores.set(rule.id, scoreRule(rule, aggregateByRuleId.get(rule.id), competitionByRuleId.get(rule.id), temporalByRuleId.get(rule.id), ecologyByRuleId.get(rule.id)));
  }

  for (const hypothesis of hypothesisRules) {
    scores.set(hypothesis.id, scoreHypothesis(hypothesis, contradictions, evidences, reviewSignals, reviewSignalApplications, temporalStats, ecologyByRuleId.get(hypothesis.id)));
  }

  return scores;
}

function computeCandidateCompositeScore({
  candidate,
  temporal,
  ecology,
  groupEcology
}: {
  candidate: CompetitionCandidateScore;
  temporal?: RuleTemporalStats;
  ecology?: RuleEcologyStats;
  groupEcology?: CompetitionGroupEcology;
}) {
  const ecologyScore =
    (ecology?.resilienceScore ?? 0) * 0.35 +
    (ecology?.dominanceSpan ?? 0) * 4 +
    (ecology?.currentWinStreak ?? 0) * 2.5 -
    (ecology?.effectivePressure ?? ecology?.challengePressure ?? 0) * 0.3 -
    (ecology?.idleDecayScore ?? 0) * 0.2 +
    (ecology?.resistanceScore ?? 0) * 0.18 -
    (ecology?.replacementRisk ?? 0) * 0.2 +
    (ecology?.ecologyStatus === "dominant"
      ? 10
      : ecology?.ecologyStatus === "fragile"
        ? -2
      : ecology?.ecologyStatus === "contested"
        ? -5
        : -8);

  const isIncumbent = groupEcology?.incumbentRuleId === candidate.id;
  const layeredPressureMemory = groupEcology?.layeredPressureMemory ?? ecology?.layeredPressureImpact;
  const pressureMemory = groupEcology?.pressureMemory ?? ecology?.inheritedPressure ?? aggregateLayeredPressureMemory(layeredPressureMemory);
  const cooldownLevel = groupEcology?.cooldownLevel ?? ecology?.cooldownPenalty ?? 0;
  const recoveryProgress = groupEcology?.recoveryProgress ?? (ecology?.recoveryScore ?? 100) / 100;
  const recoveryMode = groupEcology?.recoveryMode ?? ecology?.recoveryMode ?? "recovering";
  const dominanceConsolidation = groupEcology?.dominanceConsolidation ?? ecology?.dominanceStrength ?? ecology?.hardeningScore ?? 0;
  const stabilityInertia = groupEcology?.stabilityInertia ?? ecology?.hardeningScore ?? 0;
  const contestDampening = groupEcology?.contestDampening ?? Math.max(0, 18 - (groupEcology?.replacementRisk ?? ecology?.replacementRisk ?? 0) * 0.18);
  const hardeningScore = ecology?.hardeningScore ?? 0;
  const destabilizationPenalty = ecology?.destabilizationPenalty ?? 0;
  const memoryBoost = computePressureMemoryBoost(pressureMemory);
  const layeredDetail = describeLayeredPressureMemory(layeredPressureMemory);
  const boundChallengerMomentum = computeChallengerMomentum({
    momentumScore: candidate.momentumScore,
    lockStatus: groupEcology?.lockStatus,
    effectivePressure: groupEcology?.effectivePressure ?? ecology?.effectivePressure ?? ecology?.challengePressure ?? 0,
    turnoverCounter: groupEcology?.turnoverCounter ?? 0,
    pressureMemory,
    layeredPressureMemory,
    cooldownLevel,
    incumbentRuleId: groupEcology?.incumbentRuleId,
    currentRuleId: candidate.id
  });
  const momentumBinding = boundChallengerMomentum - candidate.momentumScore;
  const layeredShockBias =
    layeredDetail.reviewShock * 0.26 +
    layeredDetail.contradictionShock * 0.22 +
    layeredDetail.turnoverStress * 0.18 +
    layeredDetail.challengerPressure * 0.12;
  const incumbentProtection =
    isIncumbent && groupEcology?.lockStatus === "locked"
      ? STABILIZATION_BINDING_WEIGHTS.lockedReplacementThresholdLift * 1.8 +
        (groupEcology?.dominanceSpan ?? ecology?.dominanceSpan ?? 0) * 2.2 +
        (groupEcology?.resistanceScore ?? ecology?.resistanceScore ?? 0) * 0.14 +
        dominanceConsolidation * 0.32 +
        stabilityInertia * 0.18 +
        contestDampening * 0.18 +
        hardeningScore * 0.14 -
        destabilizationPenalty * 0.1 +
        memoryBoost * 0.3 +
        recoveryProgress * 5 +
        layeredShockBias * 0.2 +
        (recoveryMode === "stalled" ? 4 : recoveryMode === "slow" ? 2 : 0)
      : 0;
  const incumbentPressurePenalty =
    isIncumbent
      ? Math.max(
          0,
          (groupEcology?.effectivePressure ?? ecology?.effectivePressure ?? ecology?.challengePressure ?? 0) -
            contestDampening * 0.18 -
            stabilityInertia * 0.1
        ) *
          0.28 +
        (groupEcology?.turnoverCounter ?? 0) * 5 +
        (groupEcology?.lockStatus === "breaking" ? STABILIZATION_BINDING_WEIGHTS.breakingLockPressureBonus : 0) +
        memoryBoost * 0.22 +
        cooldownLevel * 0.18 +
        layeredShockBias * 0.3 +
        destabilizationPenalty * 0.08
      : 0;
  const challengerPressureBoost =
    !isIncumbent && groupEcology?.incumbentRuleId
      ? Math.max(
          0,
          (groupEcology?.effectivePressure ?? 0) -
            STABILIZATION_TURNOVER_THRESHOLDS.incumbentBreakEffectivePressure -
            contestDampening * 0.14 -
            stabilityInertia * 0.08
        ) *
          0.55 +
        (groupEcology?.turnoverCounter ?? 0) * 3 +
        memoryBoost * 0.28 +
        cooldownLevel * 0.12 +
        Math.max(0, 1 - recoveryProgress) * 8 +
        (layeredDetail.reviewShock * 0.3 + layeredDetail.contradictionShock * 0.2 + layeredDetail.turnoverStress * 0.18) +
        destabilizationPenalty * 0.14 +
        (recoveryMode === "stalled" ? 4 : recoveryMode === "slow" ? 2 : 0)
      : 0;

  return (
    applyContestDampening(candidate.decayAdjustedScore * 0.35 + candidate.survivabilityScore * 0.4, contestDampening, isIncumbent ? 0.08 : 0.14) +
    boundChallengerMomentum * 0.22 +
    candidate.recentWinRate * 14 -
    candidate.volatilityScore * 0.12 +
    ecologyScore * 0.55 +
    momentumBinding * 0.4 +
    incumbentProtection +
    challengerPressureBoost -
    incumbentPressurePenalty +
    (temporal?.trend === "rising" ? 6 : temporal?.trend === "fading" ? -6 : 0) +
    (layeredDetail.reviewShock * 0.12 + layeredDetail.contradictionShock * 0.1 + layeredDetail.turnoverStress * 0.08) -
    (recoveryMode === "stabilized" ? 2 : 0)
  );
}

export function evaluateCompetitionWinner(
  group: RuleCompetitionGroup,
  candidateScores: Map<string, CompetitionCandidateScore>,
  temporalStatsByRuleId: Map<string, RuleTemporalStats> = new Map(),
  ecologyStatsByRuleId: Map<string, RuleEcologyStats> = new Map(),
  groupEcology?: CompetitionGroupEcology
): {
  winnerRuleId?: string;
  loserRuleIds: string[];
  confidenceGap: number;
  settled: boolean;
  winnerKind?: CompetitionCandidateKind;
  winnerScore?: number;
} {
  const ranked = group.ruleIds
    .map((id) => candidateScores.get(id))
    .filter((candidate): candidate is CompetitionCandidateScore => Boolean(candidate))
    .sort((left, right) => {
      const leftScore = computeCandidateCompositeScore({
        candidate: left,
        temporal: temporalStatsByRuleId.get(left.id),
        ecology: ecologyStatsByRuleId.get(left.id),
        groupEcology
      });
      const rightScore = computeCandidateCompositeScore({
        candidate: right,
        temporal: temporalStatsByRuleId.get(right.id),
        ecology: ecologyStatsByRuleId.get(right.id),
        groupEcology
      });
      return rightScore - leftScore || right.survivabilityScore - left.survivabilityScore || right.confidenceScore - left.confidenceScore;
    });

  if (!ranked.length) {
    return { loserRuleIds: [], confidenceGap: 0, settled: false };
  }

  let winner = ranked[0];
  const incumbentCandidate =
    groupEcology?.incumbentRuleId ? ranked.find((candidate) => candidate.id === groupEcology.incumbentRuleId) : undefined;

  if (
    groupEcology?.incumbentRuleId &&
    incumbentCandidate &&
    winner.id !== groupEcology.incumbentRuleId &&
    groupEcology.lockStatus === "locked"
  ) {
    const challengerScore = computeCandidateCompositeScore({
      candidate: winner,
      temporal: temporalStatsByRuleId.get(winner.id),
      ecology: ecologyStatsByRuleId.get(winner.id),
      groupEcology
    });
    const incumbentScore = computeCandidateCompositeScore({
      candidate: incumbentCandidate,
      temporal: temporalStatsByRuleId.get(incumbentCandidate.id),
      ecology: ecologyStatsByRuleId.get(incumbentCandidate.id),
      groupEcology
    });
    const recoveryShield = (groupEcology.recoveryProgress ?? 1) * 6 + (groupEcology.lockStatus === "locked" ? 2 : 0);
    const pressureDrag = computePressureMemoryBoost(groupEcology.pressureMemory ?? 0) * 0.45 + (groupEcology.cooldownLevel ?? 0) * 0.12;
    const consolidationShield =
      (groupEcology.dominanceConsolidation ?? 0) * 0.28 +
      (groupEcology.stabilityInertia ?? 0) * 0.18 +
      (groupEcology.contestDampening ?? 0) * 0.16 +
      (ecologyStatsByRuleId.get(incumbentCandidate.id)?.hardeningScore ?? 0) * 0.12 -
      (ecologyStatsByRuleId.get(incumbentCandidate.id)?.destabilizationPenalty ?? 0) * 0.1;
    const protectionGap =
      STABILIZATION_BINDING_WEIGHTS.lockedReplacementThresholdLift * 2 +
      (groupEcology.dominanceSpan ?? 0) * 1.8 -
      Math.max(0, groupEcology.effectivePressure - STABILIZATION_TURNOVER_THRESHOLDS.incumbentBreakEffectivePressure) * 0.6 -
      groupEcology.turnoverCounter * 2.5 +
      consolidationShield +
      recoveryShield -
      pressureDrag;

    if (challengerScore - incumbentScore < protectionGap) {
      winner = incumbentCandidate;
    }
  }

  const remaining = ranked.filter((candidate) => candidate.id !== winner.id);
  const runnerUp = remaining[0];
  const confidenceGap = winner.confidenceScore - (runnerUp?.confidenceScore ?? 0);
  const layeredPressureMemory = groupEcology?.layeredPressureMemory;
  const layeredAggregate = aggregateLayeredPressureMemory(layeredPressureMemory);
  const recoveryReady =
    (groupEcology?.recoveryProgress ?? 1) >= COOLDOWN_THRESHOLDS.recoveryProgressStable &&
    (groupEcology?.recoveryMode ?? "recovering") !== "stalled" &&
    layeredAggregate <= COOLDOWN_THRESHOLDS.pressuredMin * 1.35;
  const settled =
    ranked.length > 1 &&
    confidenceGap >= RULE_COMPETITION_GROUP_THRESHOLDS.settledConfidenceGap &&
    winner.survivabilityScore >= RULE_COMPETITION_THRESHOLDS.acceptedMinSurvivability &&
    winner.decayAdjustedScore >= TEMPORAL_COMPETITION_THRESHOLDS.settledRecentWinRate * 100 &&
    winner.recentWinRate >= TEMPORAL_COMPETITION_THRESHOLDS.settledRecentWinRate &&
    winner.momentumScore >= TEMPORAL_COMPETITION_THRESHOLDS.settledMomentumScore &&
    winner.volatilityScore <= TEMPORAL_COMPETITION_THRESHOLDS.settledVolatilityScore &&
    (ecologyStatsByRuleId.get(winner.id)?.resilienceScore ?? ECOLOGY_RESILIENCE_THRESHOLDS.stableMinResilience) >= ECOLOGY_RESILIENCE_THRESHOLDS.stableMinResilience &&
    (ecologyStatsByRuleId.get(winner.id)?.effectivePressure ?? ecologyStatsByRuleId.get(winner.id)?.challengePressure ?? 0) <= ECOLOGY_DOMINANCE_THRESHOLDS.dominantMaxChallengePressure &&
    (groupEcology?.recoveryMode ?? "recovering") !== "stalled" &&
    recoveryReady;

  return {
    winnerRuleId: winner.id,
    loserRuleIds: ranked.slice(1).map((candidate) => candidate.id),
    confidenceGap,
    settled,
    winnerKind: winner.kind,
    winnerScore: winner.survivabilityScore
  };
}

export function buildRuleCompetitionGroups({
  rules,
  hypothesisRules,
  aggregateStats,
  competitionStats,
  contradictions,
  evidences,
  reviewSignals,
  reviewSignalApplications,
  temporalStats,
  ecologyStats = [],
  competitionGroupEcology = []
}: {
  rules: PersonaRule[];
  hypothesisRules: HypothesisRule[];
  aggregateStats: RuleAggregateStats[];
  competitionStats: RuleCompetitionStats[];
  contradictions: RuleContradiction[];
  evidences: RuleEvidence[];
  reviewSignals: ReviewSignal[];
  reviewSignalApplications: ReviewSignalApplication[];
  temporalStats: RuleTemporalStats[];
  ecologyStats?: RuleEcologyStats[];
  competitionGroupEcology?: CompetitionGroupEcology[];
}) {
  const candidateScores = buildCompetitionCandidateScores({
    rules,
    hypothesisRules,
    aggregateStats,
    competitionStats,
    contradictions,
    evidences,
    reviewSignals,
    reviewSignalApplications,
    temporalStats,
    ecologyStats
  });
  const temporalByRuleId = new Map(temporalStats.map((stats) => [stats.ruleId, stats]));
  const ecologyByRuleId = new Map(ecologyStats.map((stats) => [stats.ruleId, stats]));
  const groupEcologyById = new Map(competitionGroupEcology.map((stats) => [stats.competitionGroupId, stats]));

  const groupsByKey = new Map<string, RuleCompetitionGroup>();

  for (const rule of rules) {
    const topicKey = rule.topicKey ?? deriveTopicKeyFromRuleText(rule.text, rule.layer);
    const id = `competition-${rule.layer}-${topicKey}`;
    const existing = groupsByKey.get(id) ?? {
      id,
      layer: rule.layer,
      topicKey,
      ruleIds: [],
      status: "open" as RuleCompetitionGroupStatus,
      createdAt: nowIso()
    };
    existing.ruleIds.push(rule.id);
    groupsByKey.set(id, existing);
  }

  for (const hypothesis of hypothesisRules) {
    const id = `competition-${hypothesis.layer}-${hypothesis.topicKey}`;
    const existing = groupsByKey.get(id) ?? {
      id,
      layer: hypothesis.layer,
      topicKey: hypothesis.topicKey,
      ruleIds: [],
      status: "open" as RuleCompetitionGroupStatus,
      createdAt: nowIso()
    };
    existing.ruleIds.push(hypothesis.id);
    groupsByKey.set(id, existing);
  }

  const groups = Array.from(groupsByKey.values()).map((group) => {
    const result = evaluateCompetitionWinner(group, candidateScores, temporalByRuleId, ecologyByRuleId, groupEcologyById.get(group.id));
    const memberCount = group.ruleIds.length;
    let status: RuleCompetitionGroupStatus = "open";
    if (memberCount > 1) {
      status = result.settled ? "settled" : result.confidenceGap >= RULE_COMPETITION_GROUP_THRESHOLDS.contestedConfidenceGap ? "contested" : "open";
    }

    return {
      ...group,
      ruleIds: unique(group.ruleIds),
      activeRuleId: result.winnerRuleId,
      status,
      updatedAt: nowIso(),
      winnerRuleId: result.winnerRuleId,
      confidenceGap: result.confidenceGap,
      settled: result.settled
    } satisfies RuleCompetitionGroup;
  });

  return {
    groups,
    candidateScores
  };
}

export function buildCompetitionGroupAudit({
  group,
  candidateScores,
  rules,
  hypothesisRules
}: {
  group: RuleCompetitionGroup;
  candidateScores: Map<string, CompetitionCandidateScore>;
  rules: PersonaRule[];
  hypothesisRules: HypothesisRule[];
}) {
  const members = group.ruleIds
    .map((id) => candidateScores.get(id))
    .filter((candidate): candidate is CompetitionCandidateScore => Boolean(candidate))
    .sort((left, right) => right.survivabilityScore - left.survivabilityScore);
  const active = members.find((member) => member.id === group.activeRuleId) ?? members[0];
  const winner = active;
  const losers = members.filter((member) => member.id !== winner?.id);
  const getStatus = (member: CompetitionCandidateScore) =>
    member.kind === "rule" ? rules.find((rule) => rule.id === member.id)?.status ?? "candidate" : hypothesisRules.find((hypothesis) => hypothesis.id === member.id)?.status ?? "candidate";

  return {
    groupId: group.id,
    topicKey: group.topicKey,
    layer: group.layer,
    status: group.status,
    settled: Boolean(group.settled),
    members: members.map((member) => ({
      ...member,
      status: getStatus(member),
      text:
        member.kind === "rule"
          ? rules.find((rule) => rule.id === member.id)?.text ?? member.id
          : hypothesisRules.find((hypothesis) => hypothesis.id === member.id)?.text ?? member.id
    })),
    activeRuleId: group.activeRuleId,
    winnerRuleId: group.winnerRuleId,
    winnerRationale: winner?.rationale ?? "No winning explanation yet.",
    loserRationales: losers.map((loser) => loser.rationale),
    confidenceGap: group.confidenceGap ?? 0
  };
}
