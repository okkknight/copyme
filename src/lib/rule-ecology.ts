import { ECOLOGY_CHALLENGE_THRESHOLDS, ECOLOGY_DECAY_THRESHOLDS, ECOLOGY_DOMINANCE_THRESHOLDS, ECOLOGY_REPLACEMENT_RISK_THRESHOLDS, ECOLOGY_RESILIENCE_THRESHOLDS, ECOLOGY_RECENT_WINDOW } from "@/lib/ecology-thresholds";
import { aggregateLayeredPressureMemory, emptyLayeredPressureMemory, updateLayeredPressureMemory } from "@/lib/layered-memory";
import { applyCooldownToResistance, applyCooldownToReplacementRisk, computeRecoveryProgress, computeRecoveryState, updateCooldownLevel } from "@/lib/cooldown-kernel";
import { computeContestDampening, explainContestDampening } from "@/lib/contest-dampening";
import { explainDominanceConsolidation, updateDominanceConsolidation } from "@/lib/dominance-consolidation";
import {
  classifyGroupStability,
  computeEffectivePressure,
  computeDominanceLock,
  computeResistanceScore,
  determineIncumbent
} from "@/lib/stabilization-kernel";
import { selectPersonaModelSummary } from "@/lib/selectors";
import type {
  AppState,
  CompetitionGroupEcology,
  CompetitionRoundRecord,
  HypothesisRule,
  PersonaModel,
  PersonaRule,
  RuleCompetitionGroup,
  RuleAggregateStats,
  RuleDecayRecord,
  RuleEcologyStatus,
  RuleEcologyStats,
  RulePerformanceRecord,
  RuleTemporalStats,
  ReviewSignal,
  ReviewSignalApplication,
  LayeredPressureMemory,
  RecoveryMode
} from "@/lib/types";

function nowIso() {
  return new Date().toISOString();
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function uniqueById<T extends { id: string }>(values: T[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value.id)) return false;
    seen.add(value.id);
    return true;
  });
}

function getTemporal(ruleId: string, temporalStats: RuleTemporalStats[]) {
  return temporalStats.find((stats) => stats.ruleId === ruleId);
}

function trailingStreak(records: RulePerformanceRecord[], outcomes: Array<RulePerformanceRecord["outcome"]>) {
  let streak = 0;
  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (!outcomes.includes(records[index].outcome)) break;
    streak += 1;
  }
  return streak;
}

function trailingIdleCount(records: RulePerformanceRecord[]) {
  let count = 0;
  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (records[index].outcome !== "idle") break;
    count += 1;
  }
  return count;
}

function currentWindow(records: RulePerformanceRecord[], window = ECOLOGY_RECENT_WINDOW) {
  return records.slice(-window);
}

function ecologyStatusForRule({
  dominanceSpan,
  currentWinStreak,
  currentLossStreak,
  challengerCount,
  effectivePressure,
  idleDecayScore,
  resilienceScore,
  activeWinner,
  isIncumbent,
  inheritedPressure,
  layeredPressureImpact,
  recoveryMode,
  cooldownPenalty,
  recoveryScore,
  stabilityPenalty,
  dominanceStrength,
  hardeningScore,
  destabilizationPenalty
}: {
  dominanceSpan: number;
  currentWinStreak: number;
  currentLossStreak: number;
  challengerCount: number;
  effectivePressure: number;
  idleDecayScore: number;
  resilienceScore: number;
  activeWinner: boolean;
  isIncumbent: boolean;
  inheritedPressure: number;
  layeredPressureImpact: LayeredPressureMemory;
  recoveryMode: RecoveryMode;
  cooldownPenalty: number;
  recoveryScore: number;
  stabilityPenalty: number;
  dominanceStrength: number;
  hardeningScore: number;
  destabilizationPenalty: number;
}): RuleEcologyStatus {
  const layeredAggregate = aggregateLayeredPressureMemory(layeredPressureImpact);
  const recoveryLag = recoveryMode === "stalled" || (recoveryMode === "slow" && stabilityPenalty > 16);

  if (
    idleDecayScore >= ECOLOGY_DECAY_THRESHOLDS.fadingIdleDecayScore ||
    currentLossStreak >= ECOLOGY_DECAY_THRESHOLDS.repeatedLossRounds + 1 ||
    (recoveryScore < 32 && cooldownPenalty > 16) ||
    (recoveryMode === "stalled" && layeredAggregate > ECOLOGY_DECAY_THRESHOLDS.fadingIdleDecayScore) ||
    destabilizationPenalty >= ECOLOGY_DECAY_THRESHOLDS.collapsingIdleDecayScore * 0.75
  ) {
    return "fading";
  }

  if (
    (isIncumbent || activeWinner) &&
    dominanceSpan >= ECOLOGY_DOMINANCE_THRESHOLDS.minimumDominanceSpan &&
    effectivePressure < ECOLOGY_DOMINANCE_THRESHOLDS.dominantMaxChallengePressure &&
    resilienceScore + recoveryScore * 0.12 + hardeningScore * 0.18 >= ECOLOGY_RESILIENCE_THRESHOLDS.stableMinResilience &&
    inheritedPressure <= ECOLOGY_DOMINANCE_THRESHOLDS.dominantMaxIdleDecay * 0.8 &&
    cooldownPenalty <= 14 &&
    stabilityPenalty <= 16 &&
    recoveryMode !== "stalled" &&
    dominanceStrength >= ECOLOGY_DOMINANCE_THRESHOLDS.minimumDominanceSpan * 3
  ) {
    return "dominant";
  }

  if (
    challengerCount >= 2 ||
    effectivePressure >= ECOLOGY_CHALLENGE_THRESHOLDS.contestedMinChallengePressure ||
    inheritedPressure >= ECOLOGY_CHALLENGE_THRESHOLDS.contestedMinChallengePressure * 0.5 ||
    layeredAggregate >= ECOLOGY_CHALLENGE_THRESHOLDS.contestedMinChallengePressure * 0.6 ||
    destabilizationPenalty >= 24
  ) {
    return "contested";
  }

  if (
    isIncumbent ||
    activeWinner ||
    currentWinStreak > 0 ||
    effectivePressure >= ECOLOGY_CHALLENGE_THRESHOLDS.fragileMinChallengePressure ||
    inheritedPressure >= ECOLOGY_CHALLENGE_THRESHOLDS.fragileMinChallengePressure * 0.6 ||
    cooldownPenalty >= 10 ||
    stabilityPenalty >= 18 ||
    recoveryLag ||
    hardeningScore < 18
  ) {
    return "fragile";
  }

  return "contested";
}

export function computeChallengePressure(
  group: RuleCompetitionGroup,
  temporalStats: RuleTemporalStats[],
  hypothesisRules: HypothesisRule[],
  competitionRounds: CompetitionRoundRecord[]
) {
  const members = unique(group.ruleIds);
  const activeRuleId = group.activeRuleId ?? members[0];
  const challengers = members.filter((id) => id !== activeRuleId);
  const temporalByRuleId = new Map(temporalStats.map((stats) => [stats.ruleId, stats]));
  const recentRounds = competitionRounds.filter((round) => round.competitionGroupId === group.id).slice(-ECOLOGY_RECENT_WINDOW);
  const recentCloseLosses = recentRounds.filter((round) => round.loserRuleIds.includes(activeRuleId ?? "")).length;
  const activeTemporal = activeRuleId ? temporalByRuleId.get(activeRuleId) : undefined;
  const challengerMomentum = challengers.reduce((sum, challengerId) => {
    const temporal = temporalByRuleId.get(challengerId);
    const hypothesis = hypothesisRules.find((item) => item.id === challengerId);
    const momentum = temporal?.momentumScore ?? 0;
    const winRate = temporal?.recentWinRate ?? 0;
    const hypothesisBonus = hypothesis ? Math.max(hypothesis.confidence * 12, hypothesis.sourceSessionIds.length * 3) : 0;
    return sum + Math.max(0, momentum) * 0.3 + winRate * 12 + hypothesisBonus * 0.15;
  }, 0);
  const closeGap = group.confidenceGap !== undefined ? clamp((ECOLOGY_CHALLENGE_THRESHOLDS.nearMissConfidenceGap - group.confidenceGap) * 2.2, 0, 20) : 0;
  const baseChallengePressure = challengers.length * 9 + recentCloseLosses * 7 + closeGap + (activeTemporal?.trend === "volatile" ? 10 : 0);
  const challengePressure = clamp(baseChallengePressure + challengerMomentum * 0.2 + Math.max(0, (activeTemporal?.recentFailureRate ?? 0) * 20), 0, 100);
  const replacementRisk = clamp(challengePressure * 0.48 + recentCloseLosses * 6 + closeGap * 0.55 + (activeTemporal?.volatilityScore ?? 0) * 0.18, 0, 100);

  return {
    challengerCount: challengers.length,
    challengePressure,
    replacementRisk,
    recentCloseLosses,
    challengerMomentum
  };
}

function buildRuleEcologyForEntity(
  entity: PersonaRule | HypothesisRule,
  state: Pick<
    AppState,
    | "hypothesisRules"
    | "rulePerformanceRecords"
    | "ruleTemporalStats"
    | "competitionRoundRecords"
    | "ruleCompetitionGroups"
    | "competitionGroupEcology"
    | "ruleAggregateStats"
    | "ruleCompetitionStats"
    | "ruleContradictions"
    | "ruleReplacementRecords"
  >
): RuleEcologyStats {
  const relevantRecords = state.rulePerformanceRecords.filter((record) => record.ruleId === entity.id).slice().sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const recent = currentWindow(relevantRecords);
  const temporal = getTemporal(entity.id, state.ruleTemporalStats);
  const competitionStats = state.ruleCompetitionStats.find((stats) => stats.ruleId === entity.id);
  const relatedGroups = state.ruleCompetitionGroups.filter((group) => group.ruleIds.includes(entity.id));
  const relatedGroupEcologies = state.competitionGroupEcology
    .filter((ecology) => relatedGroups.some((group) => group.id === ecology.competitionGroupId))
    .sort((left, right) => right.pressureMemory - left.pressureMemory || right.cooldownLevel - left.cooldownLevel);
  const strongestGroupEcology = relatedGroupEcologies.at(0);
  const activeGroups = relatedGroups.filter((group) => group.activeRuleId === entity.id);
  const activeWinner = activeGroups.length > 0;
  const isIncumbent = relatedGroupEcologies.some((ecology) => ecology.incumbentRuleId === entity.id);
  const currentWinStreak = trailingStreak(relevantRecords, ["win"]);
  const currentLossStreak = trailingStreak(relevantRecords, ["loss"]);
  const recentWinCount = recent.filter((record) => record.outcome === "win").length;
  const recentSupportCount = recent.filter((record) => record.outcome === "support").length;
  const recentIdleCount = trailingIdleCount(relevantRecords) || recent.filter((record) => record.outcome === "idle").length;
  const supportCount = relevantRecords.filter((record) => record.outcome === "win" || record.outcome === "support").length;
  const challengeCount = relevantRecords.filter((record) => record.outcome === "loss" || record.outcome === "challenge").length;
  const challengerCount = relatedGroups.reduce((count, group) => count + Math.max(0, group.ruleIds.length - 1), 0);
  const layeredPressureImpact = strongestGroupEcology?.layeredPressureMemory ?? emptyLayeredPressureMemory();
  const recoveryMode = strongestGroupEcology?.recoveryMode ?? "stabilized";
  const inheritedPressure = strongestGroupEcology?.pressureMemory ?? aggregateLayeredPressureMemory(layeredPressureImpact);
  const cooldownPenalty = strongestGroupEcology?.cooldownLevel ?? 0;
  const recoveryScore = strongestGroupEcology ? strongestGroupEcology.recoveryProgress * 100 : 0;
  const layeredAggregate = aggregateLayeredPressureMemory(layeredPressureImpact);
  const contradictionPressure = state.ruleContradictions.filter((contradiction) => contradiction.ruleId === entity.id).length * 6;
  const replacementPressure = state.ruleReplacementRecords.filter(
    (record) => record.replacedRuleId === entity.id || record.replacementRuleId === entity.id
  ).length * 8;
  const groupPressure = relatedGroups.reduce((sum, group) => {
    const pressure = computeChallengePressure(group, state.ruleTemporalStats, state.hypothesisRules, state.competitionRoundRecords);
    return sum + pressure.challengePressure;
  }, 0);
  const challengePressure = clamp(
    groupPressure / Math.max(relatedGroups.length, 1) +
      contradictionPressure +
      replacementPressure +
      currentLossStreak * 8 +
      challengeCount * 1.2 +
      (competitionStats?.correctionPressure ?? 0) * 7 +
      (competitionStats?.contradictionScore ?? 0) * 4 +
      inheritedPressure * 0.42 +
      cooldownPenalty * 0.12 +
      layeredAggregate * 0.18 +
      layeredPressureImpact.reviewShock * 0.16 +
      layeredPressureImpact.contradictionShock * 0.14 +
      layeredPressureImpact.turnoverStress * 0.18,
    0,
    100
  );
  const dominanceSpan = activeWinner
    ? currentWinStreak + Math.min(Math.max(recentWinCount + recentSupportCount - currentWinStreak, 0), 2)
    : Math.max(0, currentWinStreak - currentLossStreak);
  const idleDecayScore = clamp(
    recentIdleCount * 14 +
      Math.max(0, ECOLOGY_RECENT_WINDOW - recent.filter((record) => record.outcome !== "idle").length) * 4 +
      Math.max(0, 3 - recentWinCount) * 6 +
      Math.max(0, 2 - supportCount) * 4 +
      cooldownPenalty * 0.18 +
      layeredPressureImpact.turnoverStress * 0.12,
    0,
    100
  );
  const stabilityPenalty = clamp(
    layeredAggregate * 0.34 +
      cooldownPenalty * 0.24 +
      (recoveryMode === "stalled" ? 18 : recoveryMode === "slow" ? 10 : recoveryMode === "recovering" ? 4 : 0) +
      layeredPressureImpact.reviewShock * 0.28 +
      layeredPressureImpact.contradictionShock * 0.2 +
      layeredPressureImpact.turnoverStress * 0.22,
    0,
    100
  );
  const dominanceStrength = clamp(
    dominanceSpan * 7 +
      currentWinStreak * 4 +
      recentWinCount * 3 +
      (strongestGroupEcology?.dominanceConsolidation ?? 0) * 0.4 +
      (strongestGroupEcology?.stabilityInertia ?? 0) * 0.18 +
      (strongestGroupEcology?.contestDampening ?? 0) * 0.16 -
      challengePressure * 0.3 -
      layeredAggregate * 0.16 -
      (strongestGroupEcology?.replacementRisk ?? 0) * 0.08,
    0,
    100
  );
  const hardeningScore = clamp(
    (strongestGroupEcology?.dominanceConsolidation ?? dominanceStrength) * 0.55 +
      dominanceSpan * 2.4 +
      currentWinStreak * 2.5 +
      recoveryScore * 0.14 +
      (strongestGroupEcology?.stabilityInertia ?? 0) * 0.22 -
      layeredAggregate * 0.12 -
      challengePressure * 0.2 -
      cooldownPenalty * 0.08,
    0,
    100
  );
  const destabilizationPenalty = clamp(
    challengePressure * 0.22 +
      idleDecayScore * 0.18 +
      layeredPressureImpact.reviewShock * 0.32 +
      layeredPressureImpact.contradictionShock * 0.24 +
      layeredPressureImpact.turnoverStress * 0.24 +
      (strongestGroupEcology?.contestDampening ?? 0) * 0.12 -
      (strongestGroupEcology?.dominanceConsolidation ?? 0) * 0.1 -
      (strongestGroupEcology?.stabilityInertia ?? 0) * 0.08,
    0,
    100
  );
  const resilienceScore = clamp(
    52 +
      dominanceSpan * 8 +
      currentWinStreak * 5 +
      recentSupportCount * 2 -
      challengePressure * 0.55 -
      idleDecayScore * 0.45 -
      currentLossStreak * 9 +
      recoveryScore * 0.18 -
      cooldownPenalty * 0.28 -
      stabilityPenalty * 0.2 -
      destabilizationPenalty * 0.12 +
      hardeningScore * 0.08 +
      (temporal?.trend === "rising" ? 8 : 0) -
      (temporal?.trend === "fading" ? 8 : 0),
    0,
    100
  );
  const ecologyStatus = ecologyStatusForRule({
    dominanceSpan,
    currentWinStreak,
    currentLossStreak,
    challengerCount,
    effectivePressure: challengePressure,
    idleDecayScore,
    resilienceScore,
    activeWinner,
    isIncumbent,
    inheritedPressure,
    layeredPressureImpact,
    recoveryMode,
    cooldownPenalty,
    recoveryScore,
    stabilityPenalty,
    dominanceStrength,
    hardeningScore,
    destabilizationPenalty
  });
  const lastDominantAt = relevantRecords.filter((record) => record.outcome === "win").at(-1)?.createdAt ?? activeGroups.at(-1)?.updatedAt;
  const lastChallengedAt = relevantRecords.filter((record) => record.outcome === "loss" || record.outcome === "challenge").at(-1)?.createdAt;
  const lastDecayedAt = idleDecayScore >= ECOLOGY_DECAY_THRESHOLDS.fadingIdleDecayScore ? relevantRecords.at(-1)?.createdAt ?? temporal?.lastEvaluatedAt : undefined;
  const baseResistance = computeResistanceScore({
    dominanceSpan,
    resilienceScore,
    sourceSessionDepth: state.ruleAggregateStats.find((stats) => stats.ruleId === entity.id)?.sourceSessionCount ?? 1,
    recentWinRate: temporal?.recentWinRate ?? 0
  });
  const resistanceScore = applyCooldownToResistance(
    baseResistance,
    cooldownPenalty,
    layeredPressureImpact,
    recoveryMode,
    strongestGroupEcology?.dominanceConsolidation ?? dominanceStrength,
    strongestGroupEcology?.stabilityInertia ?? hardeningScore * 0.75,
    strongestGroupEcology?.contestDampening ?? 0
  );
  const effectivePressure = computeEffectivePressure({
    rawChallengePressure: challengePressure + stabilityPenalty * 0.22 + destabilizationPenalty * 0.12,
    resistanceScore,
    pressureMemory: inheritedPressure,
    layeredPressureMemory: layeredPressureImpact,
    recoveryMode,
    cooldownLevel: cooldownPenalty,
    contestDampening: strongestGroupEcology?.contestDampening ?? 0,
    stabilityInertia: strongestGroupEcology?.stabilityInertia ?? hardeningScore * 0.5,
    dominanceConsolidation: strongestGroupEcology?.dominanceConsolidation ?? dominanceStrength,
    hardeningScore,
    destabilizationPenalty,
    reviewShock: layeredPressureImpact.reviewShock,
    contradictionShock: layeredPressureImpact.contradictionShock,
    turnoverStress: layeredPressureImpact.turnoverStress
  });
  const replacementRisk = applyCooldownToReplacementRisk(
    clamp(
      challengePressure * 0.42 +
        currentLossStreak * 5 +
        contradictionPressure * 0.4 +
        replacementPressure * 0.35 +
        stabilityPenalty * 0.18 +
        destabilizationPenalty * 0.16,
      0,
      100
    ),
    cooldownPenalty,
    layeredPressureImpact,
    recoveryMode,
    strongestGroupEcology?.dominanceConsolidation ?? dominanceStrength,
    strongestGroupEcology?.stabilityInertia ?? hardeningScore * 0.75,
    strongestGroupEcology?.contestDampening ?? 0
  );

  return {
    ruleId: entity.id,
    dominanceSpan,
    currentWinStreak,
    currentLossStreak,
    challengerCount,
    challengePressure,
    inheritedPressure,
    layeredPressureImpact,
    recoveryMode,
    idleDecayScore,
    cooldownPenalty,
    recoveryScore,
    stabilityPenalty,
    dominanceStrength,
    hardeningScore,
    destabilizationPenalty,
    ecologyStatus,
    resilienceScore,
    isIncumbent,
    isCurrentLeader: activeWinner,
    effectivePressure,
    resistanceScore,
    replacementRisk,
    decayPath: undefined,
    lastDominantAt,
    lastChallengedAt,
    lastDecayedAt
  };
}

function buildLayeredMemoryEventsForGroup({
  group,
  previousEcology,
  activeEcology,
  challengers,
  recentRounds,
  ruleContradictions,
  reviewSignals,
  reviewSignalApplications,
  ruleReplacementRecords
}: {
  group: RuleCompetitionGroup;
  previousEcology?: CompetitionGroupEcology;
  activeEcology?: RuleEcologyStats;
  challengers: string[];
  recentRounds: CompetitionRoundRecord[];
  ruleContradictions: AppState["ruleContradictions"];
  reviewSignals: AppState["reviewSignals"];
  reviewSignalApplications: AppState["reviewSignalApplications"];
  ruleReplacementRecords: AppState["ruleReplacementRecords"];
}) {
  const groupRuleIds = new Set(group.ruleIds);
  const contradictionEvents = ruleContradictions.filter((item) => groupRuleIds.has(item.ruleId));
  const contradictionIntensity = clamp(
    contradictionEvents.reduce((sum, contradiction) => sum + (contradiction.severity === "high" ? 6 : contradiction.severity === "medium" ? 3.5 : 1.8), 0) +
      Math.max(0, recentRounds.filter((round) => round.loserRuleIds.some((id) => groupRuleIds.has(id))).length - 0) * 1.25,
    0,
    40
  );

  const groupReviewApplications = reviewSignalApplications.filter((application) => application.appliedToRuleIds.some((ruleId) => groupRuleIds.has(ruleId)));
  const reviewIntensity = clamp(
    groupReviewApplications.reduce((sum, application) => {
      const signal = reviewSignals.find((item) => item.id === application.reviewSignalId);
      const layerWeight = signal?.targetLayer === "boundary" ? 4.8 : signal?.targetLayer === "decision" ? 3.4 : signal?.targetLayer === "value" ? 2.5 : 1.9;
      const actionWeight = application.didForceDowngrade ? 4.2 : application.action === "challenge_existing_rule" ? 2.6 : application.action === "spawn_candidate_seed" ? 1.8 : 1.2;
      return sum + layerWeight + actionWeight;
    }, 0) +
      ruleReplacementRecords.filter((record) => groupRuleIds.has(record.replacedRuleId) || groupRuleIds.has(record.replacementRuleId)).length * 3.5,
    0,
    45
  );

  const turnoverStress = clamp(
    (previousEcology?.turnoverCounter ?? 0) * 2.8 +
      (previousEcology?.lockStatus === "breaking" ? 8 : 0) +
      (previousEcology?.incumbentRuleId && previousEcology?.currentLeaderRuleId && previousEcology.incumbentRuleId !== previousEcology.currentLeaderRuleId ? 5 : 0) +
      recentRounds.filter((round) => round.winnerRuleId && round.loserRuleIds.length > 0).length * 1.6 +
      ruleReplacementRecords.filter((record) => record.competitionGroupId === group.id).length * 4 +
      Math.max(0, challengers.length - 1) * 2,
    0,
    48
  );

  const challengerPressure = clamp(
    (activeEcology?.challengePressure ?? 0) * 0.36 +
      challengers.length * 4 +
      (activeEcology?.dominanceSpan ?? 0) * 1.2 +
      recentRounds.filter((round) => round.settled).length * 1.6,
    0,
    36
  );

  return updateLayeredPressureMemory(previousEcology?.layeredPressureMemory, [
    { type: "challengerPressure", intensity: challengerPressure },
    { type: "contradictionShock", intensity: contradictionIntensity },
    { type: "reviewShock", intensity: reviewIntensity },
    { type: "turnoverStress", intensity: turnoverStress }
  ]);
}

export function buildRuleEcologyStats(
  state: Pick<
    AppState,
    | "rules"
    | "hypothesisRules"
    | "rulePerformanceRecords"
    | "ruleTemporalStats"
    | "competitionRoundRecords"
    | "ruleCompetitionGroups"
    | "competitionGroupEcology"
    | "ruleAggregateStats"
    | "ruleCompetitionStats"
    | "ruleContradictions"
    | "ruleReplacementRecords"
  >
) {
  const explainers = [...state.rules, ...state.hypothesisRules];
  return explainers
    .map((entity) => buildRuleEcologyForEntity(entity, state))
    .sort((left, right) => left.ruleId.localeCompare(right.ruleId));
}

export function applyIdleDecay({
  ruleId,
  ecologyStats,
  temporalStats,
  competitionRounds,
  competitionGroupId,
  incumbentRuleId,
  challengerRuleId
}: {
  ruleId: string;
  ecologyStats: RuleEcologyStats;
  temporalStats?: RuleTemporalStats;
  competitionRounds: CompetitionRoundRecord[];
  competitionGroupId?: string;
  incumbentRuleId?: string;
  challengerRuleId?: string;
}) {
  const records: RuleDecayRecord[] = [];
  const createdAt = temporalStats?.lastEvaluatedAt ?? ecologyStats.lastDecayedAt ?? nowIso();
  const stalledRecovery = ecologyStats.recoveryMode === "stalled" || ecologyStats.stabilityPenalty >= 38;

  if (ecologyStats.idleDecayScore >= ECOLOGY_DECAY_THRESHOLDS.fadingIdleDecayScore || (stalledRecovery && ecologyStats.idleDecayScore >= ECOLOGY_DECAY_THRESHOLDS.fadingIdleDecayScore - 8)) {
    records.push({
      id: `decay-${ruleId}-idle_decay-${ecologyStats.currentLossStreak}-${Math.round(ecologyStats.idleDecayScore)}`,
      ruleId,
      reason: "idle_decay",
      decayPath: "idle",
      severity: ecologyStats.idleDecayScore >= ECOLOGY_DECAY_THRESHOLDS.collapsingIdleDecayScore ? "high" : ecologyStats.idleDecayScore >= 56 ? "medium" : "low",
      scoreImpact: -Math.round(ecologyStats.idleDecayScore * 0.5),
      competitionGroupId,
      relatedIncumbentRuleId: incumbentRuleId,
      relatedChallengerRuleId: challengerRuleId,
      createdAt
    });
  }

  if (ecologyStats.currentLossStreak >= ECOLOGY_DECAY_THRESHOLDS.repeatedLossRounds || (temporalStats?.recentFailureRate ?? 0) >= 0.5 || ecologyStats.stabilityPenalty >= 30) {
    records.push({
      id: `decay-${ruleId}-momentum_loss-${ecologyStats.currentLossStreak}-${Math.round(ecologyStats.challengePressure)}`,
      ruleId,
      reason: "momentum_loss",
      decayPath: "support_loss",
      severity: ecologyStats.currentLossStreak >= ECOLOGY_DECAY_THRESHOLDS.repeatedLossRounds + 1 ? "high" : "medium",
      scoreImpact: -Math.max(10, Math.round(ecologyStats.challengePressure * 0.35)),
      competitionGroupId,
      relatedIncumbentRuleId: incumbentRuleId,
      relatedChallengerRuleId: challengerRuleId,
      createdAt
    });
  }

  const dominantGroupLoss = competitionRounds.some(
    (round) => round.winnerRuleId && round.loserRuleIds.includes(ruleId) && round.settled && round.scoreSnapshot[ruleId] !== undefined
  );
  if (ecologyStats.dominanceSpan > 0 && ecologyStats.currentWinStreak === 0 && dominantGroupLoss) {
    records.push({
      id: `decay-${ruleId}-dominance_break-${ecologyStats.dominanceSpan}-${Math.round(ecologyStats.challengePressure)}`,
      ruleId,
      reason: "dominance_break",
      decayPath: "displacement",
      severity: ecologyStats.challengePressure >= ECOLOGY_CHALLENGE_THRESHOLDS.highChallengePressure || ecologyStats.recoveryMode === "stalled" ? "high" : "medium",
      scoreImpact: -Math.max(12, Math.round(ecologyStats.challengePressure * 0.4)),
      competitionGroupId,
      relatedIncumbentRuleId: incumbentRuleId,
      relatedChallengerRuleId: challengerRuleId,
      createdAt
    });
  }

  return uniqueById(records);
}

export function buildCompetitionGroupEcology({
  groups,
  ruleEcologyStats,
  ruleTemporalStats,
  competitionRoundRecords,
  ruleAggregateStats,
  previousCompetitionGroupEcology = [],
  ruleContradictions,
  reviewSignals,
  reviewSignalApplications,
  ruleReplacementRecords
}: {
  groups: RuleCompetitionGroup[];
  ruleEcologyStats: RuleEcologyStats[];
  ruleTemporalStats: RuleTemporalStats[];
  competitionRoundRecords: CompetitionRoundRecord[];
  ruleAggregateStats: RuleAggregateStats[];
  previousCompetitionGroupEcology?: CompetitionGroupEcology[];
  ruleContradictions: AppState["ruleContradictions"];
  reviewSignals: AppState["reviewSignals"];
  reviewSignalApplications: AppState["reviewSignalApplications"];
  ruleReplacementRecords: AppState["ruleReplacementRecords"];
}) {
  const ecologyByRuleId = new Map(ruleEcologyStats.map((stats) => [stats.ruleId, stats]));
  const temporalByRuleId = new Map(ruleTemporalStats.map((stats) => [stats.ruleId, stats]));
  const aggregateByRuleId = new Map(ruleAggregateStats.map((stats) => [stats.ruleId, stats]));
  const previousByGroupId = new Map(previousCompetitionGroupEcology.map((item) => [item.competitionGroupId, item]));

  return groups.map<CompetitionGroupEcology>((group) => {
    const currentLeaderRuleId = group.activeRuleId;
    const challengers = group.ruleIds.filter((id) => id !== currentLeaderRuleId);
    const activeEcology = currentLeaderRuleId ? ecologyByRuleId.get(currentLeaderRuleId) : undefined;
    const activeTemporal = currentLeaderRuleId ? temporalByRuleId.get(currentLeaderRuleId) : undefined;
    const challengerEcologies = challengers.map((id) => ecologyByRuleId.get(id)).filter((item): item is RuleEcologyStats => Boolean(item));
    const challengerMomentum = challengerEcologies.filter((item) => item.ecologyStatus === "dominant" || item.ecologyStatus === "contested" || item.challengePressure >= ECOLOGY_CHALLENGE_THRESHOLDS.fragileMinChallengePressure).length;
    const recentRounds = competitionRoundRecords.filter((round) => round.competitionGroupId === group.id).slice(-ECOLOGY_RECENT_WINDOW);
    const recentCloseRounds = recentRounds.filter((round) => round.loserRuleIds.length > 0 && round.settled).length;
    const previousEcology = previousByGroupId.get(group.id);
    const recentWinnerContinuity = currentLeaderRuleId ? recentRounds.filter((round) => round.winnerRuleId === currentLeaderRuleId).length : 0;
    const recentConflictLevel =
      recentCloseRounds +
      Math.max(0, challengers.length - 1) * 1.5 +
      (previousEcology?.turnoverCounter ?? 0) * 2.2 +
      (previousEcology?.recoveryMode === "stalled" ? 5 : previousEcology?.recoveryMode === "slow" ? 2.5 : 0);
    const contestIntensity = clamp(
      (activeEcology?.challengePressure ?? 0) * 0.45 +
      challengers.length * 8 +
        challengerMomentum * 6 +
        recentCloseRounds * 5 +
        Math.max(0, 12 - (group.confidenceGap ?? 12)) * 1.7 +
        (activeTemporal?.trend === "volatile" ? 10 : 0),
      0,
      100
    );
    const layeredPressureMemory = buildLayeredMemoryEventsForGroup({
      group,
      previousEcology,
      activeEcology,
      challengers,
      recentRounds,
      ruleContradictions,
      reviewSignals,
      reviewSignalApplications,
      ruleReplacementRecords
    });
    const pressureMemory = aggregateLayeredPressureMemory(layeredPressureMemory);
    const previousRecoveryState = computeRecoveryState({
      cooldownLevel: previousEcology?.cooldownLevel ?? 0,
      layeredPressureMemory: previousEcology?.layeredPressureMemory
    });
    const previousRecoveryProgress = computeRecoveryProgress(previousEcology?.cooldownLevel ?? 0, previousEcology?.layeredPressureMemory);
    const dominanceConsolidationResult = updateDominanceConsolidation({
      previousConsolidation: previousEcology?.dominanceConsolidation ?? 0,
      dominanceSpan: activeEcology?.dominanceSpan ?? previousEcology?.dominanceSpan ?? 0,
      recentSurvivalCount: recentRounds.filter((round) => round.winnerRuleId === currentLeaderRuleId).length,
      recentIncumbentHolds: recentRounds.filter((round) => round.winnerRuleId === previousEcology?.incumbentRuleId).length,
      recoveryMode: previousRecoveryState.recoveryMode,
      recoveryProgress: previousRecoveryProgress,
      pressureMemory,
      layeredPressureMemory,
      reviewShock: layeredPressureMemory.reviewShock,
      contradictionShock: layeredPressureMemory.contradictionShock,
      turnoverStress: layeredPressureMemory.turnoverStress,
      challengerPressure: layeredPressureMemory.challengerPressure,
      recentConflictLevel,
      lastStabilizedAt: previousEcology?.lastStabilizedAt
    });
    const contestDampening = computeContestDampening({
      groupStabilized:
        (previousEcology?.stabilityClass ?? "contested") === "stable" ||
        previousRecoveryState.recoveryMode === "stabilized" ||
        previousRecoveryProgress >= 0.76,
      dominanceConsolidation: dominanceConsolidationResult.dominanceConsolidation,
      stabilityInertia: dominanceConsolidationResult.stabilityInertia,
      pressureMemory,
      layeredPressureMemory,
      recoveryMode: previousRecoveryState.recoveryMode,
      recoveryProgress: previousRecoveryProgress,
      recentWinnerContinuity,
      recentConflictLevel,
      reviewShock: layeredPressureMemory.reviewShock,
      contradictionShock: layeredPressureMemory.contradictionShock,
      turnoverStress: layeredPressureMemory.turnoverStress,
      challengerPressure: layeredPressureMemory.challengerPressure
    });
    const dampenedContestIntensity = clamp(contestIntensity - contestDampening * 0.22, 0, 100);
    const rawChallengePressure = clamp(
      (activeEcology?.challengePressure ?? 0) +
        challengers.length * 6 +
        challengerMomentum * 5 +
        recentCloseRounds * 4 +
        Math.max(0, 12 - (group.confidenceGap ?? 12)) * 1.5 -
        contestDampening * 0.18,
      0,
      100
    );
    const incumbent = determineIncumbent({
      group,
      previousEcology,
      currentLeaderRuleId,
      ecologyByRuleId,
      temporalByRuleId,
      aggregateByRuleId,
      challengerRuleIds: challengers,
        rawChallengePressure
    });
    const incumbentEcology = incumbent.incumbentRuleId ? ecologyByRuleId.get(incumbent.incumbentRuleId) : undefined;
    const dominanceSpan = incumbentEcology?.dominanceSpan ?? activeEcology?.dominanceSpan ?? 0;
    const challengerBecameLeader = Boolean(incumbent.incumbentRuleId && incumbent.currentLeaderRuleId && incumbent.incumbentRuleId !== incumbent.currentLeaderRuleId);
    const cooldownLevel = updateCooldownLevel({
      previousCooldown: previousEcology?.cooldownLevel ?? 0,
      pressureMemory,
      layeredPressureMemory,
      turnoverCounter: incumbent.turnoverCounter,
      lockStatus: incumbent.lockStatus,
      challengerBecameLeader,
      contradictionShock: Math.round((activeEcology?.challengePressure ?? 0) / 12) + recentCloseRounds,
      reviewShock: Math.round((activeEcology?.replacementRisk ?? 0) / 14)
    });
    const currentRecoveryState = computeRecoveryState({
      cooldownLevel,
      layeredPressureMemory
    });
    const currentRecoveryProgress = computeRecoveryProgress(cooldownLevel, layeredPressureMemory);
    const resistanceScore = applyCooldownToResistance(
      incumbent.resistanceScore,
      cooldownLevel,
      layeredPressureMemory,
      currentRecoveryState.recoveryMode,
      dominanceConsolidationResult.dominanceConsolidation,
      dominanceConsolidationResult.stabilityInertia,
      contestDampening
    );
    const effectivePressure = computeEffectivePressure({
      rawChallengePressure: rawChallengePressure + aggregateLayeredPressureMemory(layeredPressureMemory) * 0.15,
      resistanceScore,
      pressureMemory,
      layeredPressureMemory,
      recoveryMode: currentRecoveryState.recoveryMode,
      cooldownLevel,
      contestDampening,
      stabilityInertia: dominanceConsolidationResult.stabilityInertia,
      dominanceConsolidation: dominanceConsolidationResult.dominanceConsolidation,
      hardeningScore: dominanceConsolidationResult.hardeningScore,
      destabilizationPenalty:
        layeredPressureMemory.reviewShock * 0.18 + layeredPressureMemory.contradictionShock * 0.16 + layeredPressureMemory.turnoverStress * 0.16,
      reviewShock: layeredPressureMemory.reviewShock,
      contradictionShock: layeredPressureMemory.contradictionShock,
      turnoverStress: layeredPressureMemory.turnoverStress
    });
    const finalLockStatus = computeDominanceLock({
      dominanceSpan,
      effectivePressure,
      turnoverCounter: incumbent.turnoverCounter,
      pressureMemory,
      layeredPressureMemory,
      recoveryMode: currentRecoveryState.recoveryMode,
      cooldownLevel,
      recoveryProgress: currentRecoveryProgress,
      previousLockStatus: incumbent.lockStatus,
      dominanceConsolidation: dominanceConsolidationResult.dominanceConsolidation,
      stabilityInertia: dominanceConsolidationResult.stabilityInertia,
      contestDampening,
      hardeningScore: dominanceConsolidationResult.hardeningScore,
      reviewShock: layeredPressureMemory.reviewShock,
      contradictionShock: layeredPressureMemory.contradictionShock,
      turnoverStress: layeredPressureMemory.turnoverStress,
      destabilizationPenalty:
        layeredPressureMemory.reviewShock * 0.12 + layeredPressureMemory.contradictionShock * 0.1 + layeredPressureMemory.turnoverStress * 0.14
    });
    const replacementRisk = clamp(
      effectivePressure * 0.5 +
        dampenedContestIntensity * 0.18 +
        incumbent.turnoverCounter * 14 +
        pressureMemory * 0.14 +
        cooldownLevel * 0.2 +
        layeredPressureMemory.reviewShock * 0.16 +
        layeredPressureMemory.contradictionShock * 0.14 +
        layeredPressureMemory.turnoverStress * 0.18 +
        dominanceConsolidationResult.dominanceConsolidation * 0.08 +
        dominanceConsolidationResult.stabilityInertia * 0.08 -
        contestDampening * 0.15 -
        (finalLockStatus === "breaking" ? 12 : 0) +
        (group.status === "contested" ? 6 : 0),
      0,
      100
    );
    const stabilityClass = classifyGroupStability({
      incumbentRuleId: incumbent.incumbentRuleId,
      currentLeaderRuleId: incumbent.currentLeaderRuleId,
      effectivePressure,
      replacementRisk,
      contestIntensity: dampenedContestIntensity,
      lockStatus: finalLockStatus,
      turnoverCounter: incumbent.turnoverCounter,
      pressureMemory,
      layeredPressureMemory,
      recoveryMode: currentRecoveryState.recoveryMode,
      cooldownLevel,
      recoveryProgress: currentRecoveryProgress,
      dominanceConsolidation: dominanceConsolidationResult.dominanceConsolidation,
      stabilityInertia: dominanceConsolidationResult.stabilityInertia,
      contestDampening,
      hardeningScore: dominanceConsolidationResult.hardeningScore,
      destabilizationPenalty:
        layeredPressureMemory.reviewShock * 0.2 + layeredPressureMemory.contradictionShock * 0.16 + layeredPressureMemory.turnoverStress * 0.16
    });
    const lastPressureAt =
      pressureMemory > aggregateLayeredPressureMemory(previousEcology?.layeredPressureMemory) + 0.8 || incumbent.currentLeaderRuleId !== incumbent.incumbentRuleId
        ? nowIso()
        : previousEcology?.lastPressureAt;
    const lastBreakAt =
      finalLockStatus === "breaking" && previousEcology?.lockStatus !== "breaking" ? nowIso() : previousEcology?.lastBreakAt;
    const lastRecoveryAt =
      currentRecoveryProgress > (previousEcology?.recoveryProgress ?? 0) && cooldownLevel < (previousEcology?.cooldownLevel ?? 100)
        ? nowIso()
        : previousEcology?.lastRecoveryAt;
    const lastStabilizedAt =
      currentRecoveryState.recoveryMode === "stabilized" && previousEcology?.recoveryMode !== "stabilized" ? nowIso() : previousEcology?.lastStabilizedAt;
    const lastContestedAt =
      stabilityClass !== "stable" && previousEcology?.stabilityClass === "stable" ? nowIso() : previousEcology?.lastContestedAt;

    return {
      competitionGroupId: group.id,
      activeRuleId: currentLeaderRuleId,
      incumbentRuleId: incumbent.incumbentRuleId,
      currentLeaderRuleId: incumbent.currentLeaderRuleId,
      challengerRuleIds: incumbent.challengerRuleIds,
      dominanceSpan,
      turnoverCounter: incumbent.turnoverCounter,
      lockStatus: finalLockStatus,
      effectivePressure,
      resistanceScore,
      contestIntensity: dampenedContestIntensity,
      stabilityClass,
      replacementRisk,
      pressureMemory,
      layeredPressureMemory,
      recoveryMode: currentRecoveryState.recoveryMode,
      cooldownLevel,
      recoveryProgress: currentRecoveryProgress,
      stabilityInertia: dominanceConsolidationResult.stabilityInertia,
      dominanceConsolidation: dominanceConsolidationResult.dominanceConsolidation,
      contestDampening,
      lastPressureAt,
      lastBreakAt,
      lastRecoveryAt,
      lastStabilizedAt,
      lastContestedAt,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt ?? nowIso()
    };
  });
}

export type EcologyArtifacts = {
  ruleEcologyStats: RuleEcologyStats[];
  competitionGroupEcology: CompetitionGroupEcology[];
  ruleDecayRecords: RuleDecayRecord[];
  personaModel: PersonaModel;
};

export function buildEcologyArtifacts(
  state: Pick<
    AppState,
    | "rules"
    | "hypothesisRules"
    | "rulePerformanceRecords"
    | "ruleTemporalStats"
    | "competitionRoundRecords"
    | "ruleCompetitionGroups"
    | "ruleAggregateStats"
    | "ruleCompetitionStats"
    | "ruleContradictions"
    | "ruleReplacementRecords"
    | "reviewSignals"
    | "reviewSignalApplications"
    | "sessions"
    | "ruleEcologyStats"
    | "competitionGroupEcology"
    | "ruleDecayRecords"
  >
): EcologyArtifacts {
  const ruleEcologyStats = buildRuleEcologyStats({
    rules: state.rules,
    hypothesisRules: state.hypothesisRules,
    rulePerformanceRecords: state.rulePerformanceRecords,
    ruleTemporalStats: state.ruleTemporalStats,
    competitionRoundRecords: state.competitionRoundRecords,
    ruleCompetitionGroups: state.ruleCompetitionGroups,
    competitionGroupEcology: state.competitionGroupEcology,
    ruleAggregateStats: state.ruleAggregateStats,
    ruleCompetitionStats: state.ruleCompetitionStats,
    ruleContradictions: state.ruleContradictions,
    ruleReplacementRecords: state.ruleReplacementRecords
  });
  const competitionGroupEcology = buildCompetitionGroupEcology({
    groups: state.ruleCompetitionGroups,
    ruleEcologyStats,
    ruleTemporalStats: state.ruleTemporalStats,
    competitionRoundRecords: state.competitionRoundRecords,
    ruleAggregateStats: state.ruleAggregateStats,
    previousCompetitionGroupEcology: state.competitionGroupEcology,
    ruleContradictions: state.ruleContradictions,
    reviewSignals: state.reviewSignals,
    reviewSignalApplications: state.reviewSignalApplications,
    ruleReplacementRecords: state.ruleReplacementRecords
  });
  const competitionEcologyByRuleId = new Map<string, CompetitionGroupEcology>();
  for (const ecology of competitionGroupEcology) {
    for (const ruleId of [ecology.incumbentRuleId, ecology.currentLeaderRuleId, ...ecology.challengerRuleIds].filter((id): id is string => Boolean(id))) {
      competitionEcologyByRuleId.set(ruleId, ecology);
    }
  }
  const enrichedRuleEcologyStats = ruleEcologyStats.map((ecology) => {
    const groupEcology = competitionEcologyByRuleId.get(ecology.ruleId);
    const layeredPressureImpact = groupEcology?.layeredPressureMemory ?? ecology.layeredPressureImpact ?? emptyLayeredPressureMemory();
    const inheritedPressure = groupEcology?.pressureMemory ?? ecology.inheritedPressure ?? aggregateLayeredPressureMemory(layeredPressureImpact);
    const cooldownPenalty = groupEcology?.cooldownLevel ?? ecology.cooldownPenalty ?? 0;
    const recoveryScore = groupEcology ? groupEcology.recoveryProgress * 100 : ecology.recoveryScore ?? 0;
    const recoveryMode = groupEcology?.recoveryMode ?? ecology.recoveryMode ?? "stabilized";
    const dominanceStrength =
      groupEcology
        ? clamp(
            ecology.dominanceStrength * 0.6 +
              (groupEcology.dominanceConsolidation ?? 0) * 0.35 +
              (groupEcology.stabilityInertia ?? 0) * 0.2 +
              (groupEcology.contestDampening ?? 0) * 0.12 -
              (groupEcology.effectivePressure ?? 0) * 0.1,
            0,
            100
          )
        : ecology.dominanceStrength ?? 0;
    const hardeningScore =
      groupEcology
        ? clamp(
            ecology.hardeningScore * 0.55 +
              (groupEcology.dominanceConsolidation ?? 0) * 0.4 +
              (groupEcology.stabilityInertia ?? 0) * 0.2 +
              (groupEcology.contestDampening ?? 0) * 0.14 -
              (groupEcology.effectivePressure ?? 0) * 0.08,
            0,
            100
          )
        : ecology.hardeningScore ?? 0;
    const destabilizationPenalty =
      groupEcology
        ? clamp(
            ecology.destabilizationPenalty * 0.55 +
              layeredPressureImpact.reviewShock * 0.28 +
              layeredPressureImpact.contradictionShock * 0.22 +
              layeredPressureImpact.turnoverStress * 0.2 -
              (groupEcology.contestDampening ?? 0) * 0.12,
            0,
            100
          )
        : ecology.destabilizationPenalty ?? 0;
    const stabilityPenalty =
      groupEcology?.layeredPressureMemory
        ? aggregateLayeredPressureMemory(layeredPressureImpact) * 0.3 +
          cooldownPenalty * 0.24 +
          (recoveryMode === "stalled" ? 18 : recoveryMode === "slow" ? 10 : recoveryMode === "recovering" ? 4 : 0)
        : ecology.stabilityPenalty ?? 0;
    const resistanceScore =
      groupEcology?.resistanceScore ??
      applyCooldownToResistance(
        ecology.resistanceScore,
        cooldownPenalty,
        layeredPressureImpact,
        recoveryMode,
        groupEcology?.dominanceConsolidation ?? dominanceStrength,
        groupEcology?.stabilityInertia ?? hardeningScore * 0.75,
        groupEcology?.contestDampening ?? 0
      );
    const effectivePressure =
      groupEcology?.effectivePressure ??
      computeEffectivePressure({
        rawChallengePressure: ecology.challengePressure + stabilityPenalty * 0.22 + destabilizationPenalty * 0.12,
        resistanceScore,
        pressureMemory: inheritedPressure,
        layeredPressureMemory: layeredPressureImpact,
        recoveryMode,
        cooldownLevel: cooldownPenalty,
        contestDampening: groupEcology?.contestDampening ?? 0,
        stabilityInertia: groupEcology?.stabilityInertia ?? hardeningScore * 0.5,
        dominanceConsolidation: groupEcology?.dominanceConsolidation ?? dominanceStrength,
        hardeningScore,
        destabilizationPenalty,
        reviewShock: layeredPressureImpact.reviewShock,
        contradictionShock: layeredPressureImpact.contradictionShock,
        turnoverStress: layeredPressureImpact.turnoverStress
      });
    const isIncumbent = groupEcology?.incumbentRuleId === ecology.ruleId;
    const isCurrentLeader = groupEcology?.currentLeaderRuleId === ecology.ruleId;
    const replacementRisk =
      groupEcology?.replacementRisk ??
      applyCooldownToReplacementRisk(
        clamp(ecology.replacementRisk + stabilityPenalty * 0.14 + destabilizationPenalty * 0.12, 0, 100),
        cooldownPenalty,
        layeredPressureImpact,
        recoveryMode,
        groupEcology?.dominanceConsolidation ?? dominanceStrength,
        groupEcology?.stabilityInertia ?? hardeningScore * 0.75,
        groupEcology?.contestDampening ?? 0
      );
    const decayPath: RuleEcologyStats["decayPath"] =
      state.ruleReplacementRecords.some((record) => record.replacedRuleId === ecology.ruleId)
        ? "displacement"
        : ecology.idleDecayScore >= ECOLOGY_DECAY_THRESHOLDS.fadingIdleDecayScore
          ? "idle"
          : ecology.currentLossStreak > 0
            ? "support_loss"
            : undefined;

    return {
      ...ecology,
      isIncumbent,
      isCurrentLeader,
      effectivePressure,
      resistanceScore,
      replacementRisk,
      inheritedPressure,
      layeredPressureImpact,
      recoveryMode,
      cooldownPenalty,
      recoveryScore,
      stabilityPenalty,
      dominanceStrength,
      hardeningScore,
      destabilizationPenalty,
      ecologyStatus: ecologyStatusForRule({
        dominanceSpan: ecology.dominanceSpan,
        currentWinStreak: ecology.currentWinStreak,
        currentLossStreak: ecology.currentLossStreak,
        challengerCount: ecology.challengerCount,
        effectivePressure,
        idleDecayScore: ecology.idleDecayScore,
        resilienceScore: ecology.resilienceScore,
        activeWinner: isCurrentLeader,
        isIncumbent,
        inheritedPressure,
        layeredPressureImpact,
        recoveryMode,
        cooldownPenalty,
        recoveryScore,
        stabilityPenalty,
        dominanceStrength,
        hardeningScore,
        destabilizationPenalty
      }),
      decayPath
    };
  });
  const ruleDecayRecords = uniqueById([
    ...(state.ruleDecayRecords ?? []),
    ...enrichedRuleEcologyStats.flatMap((ecology) => {
      const groupEcology = competitionEcologyByRuleId.get(ecology.ruleId);
      return applyIdleDecay({
        ruleId: ecology.ruleId,
        ecologyStats: ecology,
        temporalStats: state.ruleTemporalStats.find((item) => item.ruleId === ecology.ruleId),
        competitionRounds: state.competitionRoundRecords,
        competitionGroupId: groupEcology?.competitionGroupId,
        incumbentRuleId: groupEcology?.incumbentRuleId,
        challengerRuleId:
          groupEcology?.challengerRuleIds.find((id) => id === groupEcology.currentLeaderRuleId && id !== groupEcology.incumbentRuleId) ??
          groupEcology?.challengerRuleIds[0]
      });
    }),
    ...state.ruleReplacementRecords.map((record) => ({
      id: `decay-${record.replacedRuleId}-displacement-${record.replacementRuleId}`,
      ruleId: record.replacedRuleId,
      reason: "dominance_break" as const,
      decayPath: "displacement" as const,
      severity: "high" as const,
      scoreImpact: -24,
      competitionGroupId: record.competitionGroupId,
      relatedIncumbentRuleId: record.replacedRuleId,
      relatedChallengerRuleId: record.replacementRuleId,
      createdAt: record.createdAt
    }))
  ]);

  const dominantRuleIds = enrichedRuleEcologyStats.filter((stats) => stats.ecologyStatus === "dominant").map((stats) => stats.ruleId);
  const fragileRuleIds = enrichedRuleEcologyStats.filter((stats) => stats.ecologyStatus === "fragile").map((stats) => stats.ruleId);
  const contestedRuleIds = enrichedRuleEcologyStats.filter((stats) => stats.ecologyStatus === "contested").map((stats) => stats.ruleId);
  const fadingRuleIds = enrichedRuleEcologyStats.filter((stats) => stats.ecologyStatus === "fading").map((stats) => stats.ruleId);
  const activeRuleIds = unique([
    ...state.rules.filter((rule) => rule.status === "accepted" || rule.status === "stable").map((rule) => rule.id),
    ...state.ruleCompetitionGroups.map((group) => group.activeRuleId).filter((id): id is string => Boolean(id))
  ]);
  const atRiskRuleIds = unique([
    ...state.rules.filter((rule) => ["challenged", "contradicted", "deprecated", "invalidated"].includes(rule.status)).map((rule) => rule.id),
    ...fragileRuleIds,
    ...contestedRuleIds,
    ...fadingRuleIds
  ]);

  const personaModel = selectPersonaModelSummary({
    rules: state.rules,
    sessions: state.sessions,
    reviewSignals: state.reviewSignals,
    reviewSignalApplications: state.reviewSignalApplications,
    hypothesisRules: state.hypothesisRules,
    ruleCompetitionGroups: state.ruleCompetitionGroups,
    ruleReplacementRecords: state.ruleReplacementRecords,
    ruleTemporalStats: state.ruleTemporalStats,
    ruleEcologyStats: enrichedRuleEcologyStats,
    competitionGroupEcology,
    ruleDecayRecords
  });

  return {
    ruleEcologyStats: enrichedRuleEcologyStats,
    competitionGroupEcology,
    ruleDecayRecords,
    personaModel: {
      ...personaModel,
      activeRuleIds,
      atRiskRuleIds,
      dominantRuleIds,
      fragileRuleIds,
      contestedRuleIds,
      fadingRuleIds,
      competitionGroupEcologyIds: competitionGroupEcology.map((item) => item.competitionGroupId),
      ruleDecayRecordIds: ruleDecayRecords.map((item) => item.id)
    }
  };
}

export function explainWhyRuleIsDominant(
  ruleId: string,
  ecologyStats?: RuleEcologyStats | null,
  competitionEcology?: CompetitionGroupEcology | null
) {
  const stats = ecologyStats ?? null;
  return {
    ruleId,
    summary:
      stats?.ecologyStatus === "dominant"
        ? "This explanation is dominant because it has held a sustained win streak with low challenge pressure."
        : "This explanation is not fully dominant, but it still holds the top ecological position in its current group.",
    details: [
      `dominanceSpan=${stats?.dominanceSpan ?? 0}`,
      `currentWinStreak=${stats?.currentWinStreak ?? 0}`,
      `challengePressure=${stats?.challengePressure.toFixed(1) ?? "0.0"}`,
      `resilience=${stats?.resilienceScore.toFixed(1) ?? "0.0"}`,
      `groupStatus=${competitionEcology?.stabilityClass ?? "unknown"}`
    ].join(" · "),
    dominant: stats?.ecologyStatus === "dominant",
    challengePressure: stats?.challengePressure ?? 0,
    resilienceScore: stats?.resilienceScore ?? 0,
    dominanceSpan: stats?.dominanceSpan ?? 0
  };
}

export function explainWhyRuleIsFragile(
  ruleId: string,
  ecologyStats?: RuleEcologyStats | null,
  competitionEcology?: CompetitionGroupEcology | null
) {
  const stats = ecologyStats ?? null;
  return {
    ruleId,
    summary:
      stats?.ecologyStatus === "fragile"
        ? "This explanation is fragile because challenger pressure is building and the lead is no longer secure."
        : "This explanation is still in the model, but its dominance is under pressure.",
    details: [
      `challengerCount=${stats?.challengerCount ?? 0}`,
      `challengePressure=${stats?.challengePressure.toFixed(1) ?? "0.0"}`,
      `idleDecay=${stats?.idleDecayScore.toFixed(1) ?? "0.0"}`,
      `currentLossStreak=${stats?.currentLossStreak ?? 0}`,
      `groupRisk=${competitionEcology?.replacementRisk.toFixed(1) ?? "0.0"}`
    ].join(" · "),
    fragile: stats?.ecologyStatus === "fragile",
    challengePressure: stats?.challengePressure ?? 0,
    idleDecayScore: stats?.idleDecayScore ?? 0,
    replacementRisk: competitionEcology?.replacementRisk ?? 0
  };
}

export function explainWhyRuleIsStillDominant(
  ruleId: string,
  ecologyStats?: RuleEcologyStats | null,
  competitionEcology?: CompetitionGroupEcology | null
) {
  const stats = ecologyStats ?? null;
  const consolidation = competitionEcology
    ? explainDominanceConsolidation({
        dominanceConsolidation: competitionEcology.dominanceConsolidation,
        dominanceStrength: stats?.dominanceStrength ?? 0,
        hardeningScore: stats?.hardeningScore ?? 0,
        stabilityInertia: competitionEcology.stabilityInertia,
        layeredPressureMemory: competitionEcology.layeredPressureMemory
      })
    : undefined;
  const dampening = competitionEcology
    ? explainContestDampening({
        contestDampening: competitionEcology.contestDampening,
        dominanceConsolidation: competitionEcology.dominanceConsolidation,
        stabilityInertia: competitionEcology.stabilityInertia,
        layeredPressureMemory: competitionEcology.layeredPressureMemory,
        recoveryMode: competitionEcology.recoveryMode
      })
    : undefined;

  return {
    ruleId,
    summary:
      stats?.ecologyStatus === "dominant"
        ? "This rule is still dominant because consolidation, inertia, and dampening are protecting the incumbent position."
        : "This rule is still holding because the group has not generated enough sustained pressure to pierce consolidation.",
    details: [
      `dominanceStrength=${stats?.dominanceStrength ?? 0}`,
      `hardening=${stats?.hardeningScore ?? 0}`,
      `consolidation=${competitionEcology?.dominanceConsolidation ?? 0}`,
      `inertia=${competitionEcology?.stabilityInertia ?? 0}`,
      `dampening=${competitionEcology?.contestDampening ?? 0}`,
      `groupStatus=${competitionEcology?.stabilityClass ?? "unknown"}`
    ].join(" · "),
    consolidation,
    dampening
  };
}

export function explainWhyRuleWasDestabilized(
  ruleId: string,
  ecologyStats?: RuleEcologyStats | null,
  competitionEcology?: CompetitionGroupEcology | null
) {
  const layered = competitionEcology?.layeredPressureMemory;
  const destabilizer =
    (layered?.reviewShock ?? 0) >= (layered?.contradictionShock ?? 0) && (layered?.reviewShock ?? 0) >= (layered?.turnoverStress ?? 0)
      ? "review shock"
      : (layered?.contradictionShock ?? 0) >= (layered?.turnoverStress ?? 0)
        ? "contradiction shock"
        : "turnover stress";
  return {
    ruleId,
    summary:
      competitionEcology?.stabilityClass === "turnover" || competitionEcology?.lockStatus === "breaking"
        ? "This rule was destabilized because sustained pressure pierced consolidation and started turnover."
        : "This rule was destabilized because layered shocks overwhelmed its hardening and inertia.",
    details: [
      `destabilizer=${destabilizer}`,
      `destabPenalty=${ecologyStats?.destabilizationPenalty ?? 0}`,
      `consolidation=${competitionEcology?.dominanceConsolidation ?? 0}`,
      `inertia=${competitionEcology?.stabilityInertia ?? 0}`,
      `dampening=${competitionEcology?.contestDampening ?? 0}`,
      `risk=${competitionEcology?.replacementRisk ?? 0}`
    ].join(" · "),
    destabilizationPenalty: ecologyStats?.destabilizationPenalty ?? 0,
    dominanceConsolidation: competitionEcology?.dominanceConsolidation ?? 0,
    stabilityInertia: competitionEcology?.stabilityInertia ?? 0,
    contestDampening: competitionEcology?.contestDampening ?? 0
  };
}
