import {
  STABILIZATION_BINDING_WEIGHTS,
  STABILIZATION_GROUP_THRESHOLDS,
  STABILIZATION_LOCK_THRESHOLDS,
  STABILIZATION_RESISTANCE_WEIGHTS,
  STABILIZATION_TURNOVER_THRESHOLDS
} from "@/lib/stabilization-thresholds";
import { CONSOLIDATION_THRESHOLDS } from "@/lib/consolidation-thresholds";
import { computeContestDampening } from "@/lib/contest-dampening";
import { computeStabilityInertia } from "@/lib/dominance-consolidation";
import { aggregateLayeredPressureMemory } from "@/lib/layered-memory";
import { computePressureMemoryBoost } from "@/lib/pressure-memory";
import {
  applyCooldownToResistance,
  computeRecoveryProgress,
  computeRecoveryState
} from "@/lib/cooldown-kernel";
import type {
  CompetitionGroupEcology,
  CompetitionGroupEcologyClass,
  CompetitionGroupEcologyLockStatus,
  RuleAggregateStats,
  RuleCompetitionGroup,
  RuleEcologyStats,
  RuleTemporalStats,
  LayeredPressureMemory,
  RecoveryMode
} from "@/lib/types";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeMomentumScore(momentumScore: number) {
  return clamp(momentumScore / 10, 0, 10);
}

function normalizeLayeredMemory(value?: number | LayeredPressureMemory) {
  return typeof value === "number" ? undefined : value;
}

function aggregateMemory(value?: number | LayeredPressureMemory) {
  return typeof value === "number" ? value : aggregateLayeredPressureMemory(value);
}

export function computeResistanceScore({
  dominanceSpan,
  resilienceScore,
  sourceSessionDepth,
  recentWinRate
}: {
  dominanceSpan: number;
  resilienceScore: number;
  sourceSessionDepth: number;
  recentWinRate: number;
}) {
  return clamp(
    dominanceSpan * STABILIZATION_RESISTANCE_WEIGHTS.dominanceSpan +
      resilienceScore * STABILIZATION_RESISTANCE_WEIGHTS.resilienceScore +
      sourceSessionDepth * STABILIZATION_RESISTANCE_WEIGHTS.sourceSessionDepth +
      recentWinRate * STABILIZATION_RESISTANCE_WEIGHTS.recentWinRate,
    0,
    100
  );
}

export function computeEffectivePressure({
  rawChallengePressure,
  resistanceScore,
  pressureMemory = 0,
  layeredPressureMemory,
  recoveryMode = "recovering",
  cooldownLevel = 0,
  contestDampening = 0,
  stabilityInertia = 0,
  dominanceConsolidation = 0,
  hardeningScore = 0,
  destabilizationPenalty = 0,
  reviewShock = 0,
  contradictionShock = 0,
  turnoverStress = 0
}: {
  rawChallengePressure: number;
  resistanceScore: number;
  pressureMemory?: number;
  layeredPressureMemory?: LayeredPressureMemory;
  recoveryMode?: RecoveryMode;
  cooldownLevel?: number;
  contestDampening?: number;
  stabilityInertia?: number;
  dominanceConsolidation?: number;
  hardeningScore?: number;
  destabilizationPenalty?: number;
  reviewShock?: number;
  contradictionShock?: number;
  turnoverStress?: number;
}) {
  const memoryBoost = computePressureMemoryBoost(layeredPressureMemory ?? pressureMemory);
  const recoveryMultiplier =
    recoveryMode === "stalled"
      ? 1.22
      : recoveryMode === "slow"
        ? 1.1
        : recoveryMode === "recovering"
          ? 1
          : 0.88;
  const cooldownDrag = cooldownLevel * 0.06;
  const dampeningShield = contestDampening * 0.28 + stabilityInertia * 0.12 + dominanceConsolidation * 0.08 + hardeningScore * 0.04;
  const shockAmplifier = destabilizationPenalty * 0.18 + reviewShock * 0.08 + contradictionShock * 0.06 + turnoverStress * 0.05;
  return clamp(Math.max(0, rawChallengePressure + memoryBoost * recoveryMultiplier + cooldownDrag + shockAmplifier - resistanceScore - dampeningShield), 0, 100);
}

export function computePressureAdjustedResistance({
  baseResistance,
  effectivePressureHint,
  turnoverCounter,
  lockStatus,
  pressureMemory = 0,
  layeredPressureMemory,
  recoveryMode = "recovering",
  cooldownLevel = 0,
  dominanceConsolidation = 0,
  stabilityInertia = 0,
  contestDampening = 0,
  hardeningScore = 0,
  destabilizationPenalty = 0
}: {
  baseResistance: number;
  effectivePressureHint: number;
  turnoverCounter: number;
  lockStatus?: CompetitionGroupEcologyLockStatus;
  pressureMemory?: number;
  layeredPressureMemory?: LayeredPressureMemory;
  recoveryMode?: RecoveryMode;
  cooldownLevel?: number;
  dominanceConsolidation?: number;
  stabilityInertia?: number;
  contestDampening?: number;
  hardeningScore?: number;
  destabilizationPenalty?: number;
}) {
  const pressureDecay =
    Math.max(0, effectivePressureHint - STABILIZATION_LOCK_THRESHOLDS.lockedMaxEffectivePressure) * STABILIZATION_BINDING_WEIGHTS.pressureResistanceDecay +
    computePressureMemoryBoost(layeredPressureMemory ?? pressureMemory) * 0.12;
  const turnoverDecay = turnoverCounter * STABILIZATION_BINDING_WEIGHTS.turnoverResistanceDecay;
  const breakingPenalty = lockStatus === "breaking" ? STABILIZATION_BINDING_WEIGHTS.breakingLockPressureBonus : 0;
  const cooldownPenalty =
    cooldownLevel * 0.18 +
    (recoveryMode === "stalled" ? 7 : recoveryMode === "slow" ? 4 : recoveryMode === "recovering" ? 1.5 : 0);
  const consolidationBoost =
    dominanceConsolidation * 0.18 +
    stabilityInertia * 0.14 +
    contestDampening * 0.08 +
    hardeningScore * 0.1 +
    Math.max(0, 24 - destabilizationPenalty) * 0.03;

  return clamp(baseResistance - pressureDecay - turnoverDecay - breakingPenalty - cooldownPenalty + consolidationBoost, 0, 100);
}

export function computeChallengerMomentum({
  momentumScore,
  lockStatus,
  effectivePressure,
  turnoverCounter,
  pressureMemory = 0,
  layeredPressureMemory,
  recoveryMode = "recovering",
  cooldownLevel = 0,
  contestDampening = 0,
  dominanceConsolidation = 0,
  stabilityInertia = 0,
  hardeningScore = 0,
  destabilizationPenalty = 0,
  incumbentRuleId,
  currentRuleId
}: {
  momentumScore: number;
  lockStatus?: CompetitionGroupEcologyLockStatus;
  effectivePressure: number;
  turnoverCounter: number;
  pressureMemory?: number;
  layeredPressureMemory?: LayeredPressureMemory;
  recoveryMode?: RecoveryMode;
  cooldownLevel?: number;
  contestDampening?: number;
  dominanceConsolidation?: number;
  stabilityInertia?: number;
  hardeningScore?: number;
  destabilizationPenalty?: number;
  incumbentRuleId?: string;
  currentRuleId?: string;
}) {
  if (!currentRuleId || !incumbentRuleId || currentRuleId === incumbentRuleId) {
    return momentumScore;
  }

  let adjusted = momentumScore;

  if (lockStatus === "locked") {
    adjusted -= STABILIZATION_BINDING_WEIGHTS.lockedChallengerMomentumPenalty;
  }

  const layeredBoost = computePressureMemoryBoost(layeredPressureMemory ?? pressureMemory);
  adjusted += layeredBoost * 0.18;
  adjusted += (layeredPressureMemory?.reviewShock ?? 0) * 0.08;
  adjusted += (layeredPressureMemory?.contradictionShock ?? 0) * 0.06;
  adjusted += (layeredPressureMemory?.turnoverStress ?? 0) * 0.12;
  adjusted += destabilizationPenalty * 0.18;
  adjusted += Math.max(0, effectivePressure - STABILIZATION_LOCK_THRESHOLDS.incumbentMaxEffectivePressure) * STABILIZATION_BINDING_WEIGHTS.pressureWinBoost;
  adjusted += turnoverCounter * STABILIZATION_BINDING_WEIGHTS.turnoverMomentumBoost;
  adjusted += Math.max(0, cooldownLevel - 12) * 0.08;
  adjusted += recoveryMode === "stalled" ? 3 : recoveryMode === "slow" ? 1.5 : recoveryMode === "recovering" ? 0.5 : 0;
  adjusted -= contestDampening * 0.28 + dominanceConsolidation * 0.1 + stabilityInertia * 0.08 + hardeningScore * 0.06;

  if (lockStatus === "breaking") {
    adjusted += STABILIZATION_BINDING_WEIGHTS.breakingLockPressureBonus;
  }

  return clamp(adjusted, -100, 100);
}

export function computeDominanceLock({
  dominanceSpan,
  effectivePressure,
  turnoverCounter,
  pressureMemory = 0,
  layeredPressureMemory,
  recoveryMode = "recovering",
  cooldownLevel = 0,
  recoveryProgress = 1,
  previousLockStatus,
  dominanceConsolidation = 0,
  stabilityInertia = 0,
  contestDampening = 0,
  hardeningScore = 0,
  reviewShock: explicitReviewShock = 0,
  contradictionShock: explicitContradictionShock = 0,
  turnoverStress: explicitTurnoverStress = 0,
  destabilizationPenalty = 0
  }: {
  dominanceSpan: number;
  effectivePressure: number;
  turnoverCounter: number;
  pressureMemory?: number;
  layeredPressureMemory?: LayeredPressureMemory;
  recoveryMode?: RecoveryMode;
  cooldownLevel?: number;
  recoveryProgress?: number;
  previousLockStatus?: CompetitionGroupEcologyLockStatus;
  dominanceConsolidation?: number;
  stabilityInertia?: number;
  contestDampening?: number;
  hardeningScore?: number;
  reviewShock?: number;
  contradictionShock?: number;
  turnoverStress?: number;
  destabilizationPenalty?: number;
}): CompetitionGroupEcologyLockStatus {
  const layeredAggregate = computePressureMemoryBoost(layeredPressureMemory ?? pressureMemory);
  const reviewShock = layeredPressureMemory?.reviewShock ?? explicitReviewShock;
  const contradictionShock = layeredPressureMemory?.contradictionShock ?? explicitContradictionShock;
  const turnoverStress = layeredPressureMemory?.turnoverStress ?? explicitTurnoverStress;
  const challengerPressure = layeredPressureMemory?.challengerPressure ?? 0;
  const consolidationShield =
    dominanceConsolidation * 0.14 +
    stabilityInertia * 0.12 +
    contestDampening * 0.08 +
    hardeningScore * 0.08 -
    destabilizationPenalty * 0.08;
  const recoveryReady =
    recoveryMode !== "stalled" &&
    recoveryProgress >= 0.7 &&
    effectivePressure <= STABILIZATION_LOCK_THRESHOLDS.lockedMaxEffectivePressure + consolidationShield &&
    turnoverCounter <= STABILIZATION_TURNOVER_THRESHOLDS.pressuredMinCounter &&
    cooldownLevel <= STABILIZATION_TURNOVER_THRESHOLDS.incumbentBreakEffectivePressure + consolidationShield * 0.5 &&
    layeredAggregate <= STABILIZATION_LOCK_THRESHOLDS.lockedDominanceSpan * 7 &&
    reviewShock <= 22 + consolidationShield * 0.35 &&
    contradictionShock <= 28 + consolidationShield * 0.28 &&
    turnoverStress <= 16 + consolidationShield * 0.22 &&
    challengerPressure <= 34;

  if (previousLockStatus === "breaking" && recoveryReady) {
    return "locked";
  }

  if (
    previousLockStatus === "locked" &&
    turnoverCounter < STABILIZATION_TURNOVER_THRESHOLDS.turnoverMinCounter &&
    effectivePressure <= STABILIZATION_LOCK_THRESHOLDS.lockedMaxEffectivePressure + 4 + consolidationShield &&
    cooldownLevel <= STABILIZATION_LOCK_THRESHOLDS.lockedDominanceSpan * 4 + consolidationShield &&
    layeredAggregate <= STABILIZATION_LOCK_THRESHOLDS.lockedDominanceSpan * 8 &&
    recoveryProgress >= 0.66 &&
    recoveryMode !== "stalled" &&
    reviewShock <= 24 + consolidationShield * 0.2 &&
    contradictionShock <= 30 + consolidationShield * 0.2
  ) {
    return "locked";
  }

  if (
    dominanceSpan >= STABILIZATION_LOCK_THRESHOLDS.lockedDominanceSpan &&
    effectivePressure <= STABILIZATION_LOCK_THRESHOLDS.lockedMaxEffectivePressure + consolidationShield * 0.8 &&
    turnoverCounter === 0 &&
    cooldownLevel <= STABILIZATION_LOCK_THRESHOLDS.incumbentDominanceSpan * 6 + consolidationShield &&
    recoveryProgress >= 0.58 &&
    recoveryMode !== "stalled" &&
    reviewShock <= 24 + consolidationShield * 0.18 &&
    contradictionShock <= 30 + consolidationShield * 0.18
  ) {
    return "locked";
  }

  if (
    turnoverCounter >= STABILIZATION_TURNOVER_THRESHOLDS.pressuredMinCounter ||
    previousLockStatus === "breaking" ||
    cooldownLevel >= STABILIZATION_TURNOVER_THRESHOLDS.incumbentBreakEffectivePressure + Math.max(0, 8 - consolidationShield) ||
    layeredAggregate >= STABILIZATION_LOCK_THRESHOLDS.incumbentMaxEffectivePressure ||
    recoveryMode === "stalled" ||
    turnoverStress >= 20 ||
    reviewShock >= 30 + Math.max(0, 6 - consolidationShield) ||
    contradictionShock >= 34 + Math.max(0, 5 - consolidationShield)
  ) {
    return "breaking";
  }

  return "unlocked";
}

export function determineIncumbent({
  group,
  previousEcology,
  currentLeaderRuleId,
  ecologyByRuleId,
  temporalByRuleId,
  aggregateByRuleId,
  challengerRuleIds,
  rawChallengePressure
}: {
  group: RuleCompetitionGroup;
  previousEcology?: CompetitionGroupEcology;
  currentLeaderRuleId?: string;
  ecologyByRuleId: Map<string, RuleEcologyStats>;
  temporalByRuleId: Map<string, RuleTemporalStats>;
  aggregateByRuleId: Map<string, RuleAggregateStats>;
  challengerRuleIds: string[];
  rawChallengePressure: number;
}) {
  const previousIncumbent =
    previousEcology?.incumbentRuleId && group.ruleIds.includes(previousEcology.incumbentRuleId)
      ? previousEcology.incumbentRuleId
      : undefined;
  const leaderId = currentLeaderRuleId ?? previousEcology?.currentLeaderRuleId ?? group.activeRuleId;
  const leaderEcology = leaderId ? ecologyByRuleId.get(leaderId) : undefined;
  const leaderTemporal = leaderId ? temporalByRuleId.get(leaderId) : undefined;
  const leaderSourceDepth = leaderId ? aggregateByRuleId.get(leaderId)?.sourceSessionCount ?? 1 : 1;
  const leaderPressureMemory = previousEcology?.layeredPressureMemory ?? previousEcology?.pressureMemory ?? 0;
  const leaderCooldownLevel = previousEcology?.cooldownLevel ?? 0;
  const leaderRecoveryState = computeRecoveryState({
    cooldownLevel: leaderCooldownLevel,
    layeredPressureMemory: previousEcology?.layeredPressureMemory
  });
  const previousConsolidation = previousEcology?.dominanceConsolidation ?? 0;
  const previousInertia = previousEcology?.stabilityInertia ?? 0;
  const previousContestDampening = previousEcology?.contestDampening ?? 0;
  const previousRecoveryProgress = computeRecoveryProgress(previousEcology?.cooldownLevel ?? 0, previousEcology?.layeredPressureMemory);
  const leaderStabilityInertia = computeStabilityInertia({
    recoveryMode: leaderRecoveryState.recoveryMode,
    recoveryProgress: previousRecoveryProgress,
    dominanceConsolidation: previousConsolidation,
    recentConflictLevel: rawChallengePressure,
    layeredPressureMemory: previousEcology?.layeredPressureMemory,
    pressureMemory: previousEcology?.pressureMemory ?? 0
  });
  const leaderContestDampening = computeContestDampening({
    groupStabilized: previousEcology?.stabilityClass === "stable" || leaderRecoveryState.recoveryMode === "stabilized",
    dominanceConsolidation: previousConsolidation,
    stabilityInertia: leaderStabilityInertia,
    pressureMemory: previousEcology?.pressureMemory ?? 0,
    layeredPressureMemory: previousEcology?.layeredPressureMemory,
    recoveryMode: leaderRecoveryState.recoveryMode,
    recoveryProgress: previousRecoveryProgress,
    recentWinnerContinuity: previousEcology?.currentLeaderRuleId === leaderId ? Math.max(0, previousConsolidation / 8) : 0,
    recentConflictLevel: rawChallengePressure + (previousEcology?.turnoverCounter ?? 0) * 2.5,
    reviewShock: previousEcology?.layeredPressureMemory?.reviewShock ?? 0,
    contradictionShock: previousEcology?.layeredPressureMemory?.contradictionShock ?? 0,
    turnoverStress: previousEcology?.layeredPressureMemory?.turnoverStress ?? 0,
    challengerPressure: previousEcology?.layeredPressureMemory?.challengerPressure ?? 0
  });
  const leaderBaseResistance = leaderId
    ? computeResistanceScore({
        dominanceSpan: leaderEcology?.dominanceSpan ?? 0,
        resilienceScore: leaderEcology?.resilienceScore ?? 0,
        sourceSessionDepth: leaderSourceDepth,
        recentWinRate: leaderTemporal?.recentWinRate ?? 0
      })
    : 0;
  const leaderPreliminaryPressure = computeEffectivePressure({
    rawChallengePressure,
    resistanceScore: leaderBaseResistance,
    pressureMemory: aggregateMemory(leaderPressureMemory),
    layeredPressureMemory: normalizeLayeredMemory(leaderPressureMemory),
    recoveryMode: leaderRecoveryState.recoveryMode,
    cooldownLevel: leaderCooldownLevel,
    contestDampening: leaderContestDampening,
    stabilityInertia: leaderStabilityInertia,
    dominanceConsolidation: previousConsolidation,
    hardeningScore: leaderEcology?.hardeningScore ?? 0,
    destabilizationPenalty: leaderEcology?.destabilizationPenalty ?? 0,
    reviewShock: previousEcology?.layeredPressureMemory?.reviewShock ?? 0,
    contradictionShock: previousEcology?.layeredPressureMemory?.contradictionShock ?? 0,
    turnoverStress: previousEcology?.layeredPressureMemory?.turnoverStress ?? 0
  });
  const leaderResistance = computePressureAdjustedResistance({
    baseResistance: leaderBaseResistance,
    effectivePressureHint: leaderPreliminaryPressure,
    turnoverCounter: previousEcology?.turnoverCounter ?? 0,
    lockStatus: previousEcology?.lockStatus,
    pressureMemory: aggregateMemory(leaderPressureMemory),
    layeredPressureMemory: normalizeLayeredMemory(leaderPressureMemory),
    recoveryMode: leaderRecoveryState.recoveryMode,
    cooldownLevel: leaderCooldownLevel,
    dominanceConsolidation: previousConsolidation,
    stabilityInertia: leaderStabilityInertia,
    contestDampening: leaderContestDampening,
    hardeningScore: leaderEcology?.hardeningScore ?? 0,
    destabilizationPenalty: leaderEcology?.destabilizationPenalty ?? 0
  });
  const leaderEffectivePressure = computeEffectivePressure({
    rawChallengePressure,
    resistanceScore: leaderResistance,
    pressureMemory: aggregateMemory(leaderPressureMemory),
    layeredPressureMemory: normalizeLayeredMemory(leaderPressureMemory),
    recoveryMode: leaderRecoveryState.recoveryMode,
    cooldownLevel: leaderCooldownLevel,
    contestDampening: leaderContestDampening,
    stabilityInertia: leaderStabilityInertia,
    dominanceConsolidation: previousConsolidation,
    hardeningScore: leaderEcology?.hardeningScore ?? 0,
    destabilizationPenalty: leaderEcology?.destabilizationPenalty ?? 0,
    reviewShock: previousEcology?.layeredPressureMemory?.reviewShock ?? 0,
    contradictionShock: previousEcology?.layeredPressureMemory?.contradictionShock ?? 0,
    turnoverStress: previousEcology?.layeredPressureMemory?.turnoverStress ?? 0
  });

  let incumbentRuleId = previousIncumbent;

  if (!incumbentRuleId && leaderId) {
    if (
      (leaderEcology?.dominanceSpan ?? 0) + previousConsolidation * 0.06 >= STABILIZATION_LOCK_THRESHOLDS.incumbentDominanceSpan &&
      leaderEffectivePressure <= STABILIZATION_LOCK_THRESHOLDS.incumbentMaxEffectivePressure - leaderContestDampening * 0.08
    ) {
      incumbentRuleId = leaderId;
    }
  }

  let turnoverCounter = incumbentRuleId && previousEcology?.incumbentRuleId === incumbentRuleId ? previousEcology.turnoverCounter : 0;

  const incumbentEcology = incumbentRuleId ? ecologyByRuleId.get(incumbentRuleId) : undefined;
  const incumbentTemporal = incumbentRuleId ? temporalByRuleId.get(incumbentRuleId) : undefined;
  const incumbentSourceDepth = incumbentRuleId ? aggregateByRuleId.get(incumbentRuleId)?.sourceSessionCount ?? 1 : 1;
  const incumbentPressureMemory = previousEcology?.layeredPressureMemory ?? previousEcology?.pressureMemory ?? 0;
  const incumbentCooldownLevel = previousEcology?.cooldownLevel ?? 0;
  const incumbentRecoveryState = computeRecoveryState({
    cooldownLevel: incumbentCooldownLevel,
    layeredPressureMemory: previousEcology?.layeredPressureMemory
  });
  const incumbentStabilityInertia = computeStabilityInertia({
    recoveryMode: previousEcology?.recoveryMode ?? incumbentRecoveryState.recoveryMode,
    recoveryProgress: previousRecoveryProgress,
    dominanceConsolidation: previousConsolidation,
    recentConflictLevel: rawChallengePressure + (previousEcology?.turnoverCounter ?? 0) * 2,
    layeredPressureMemory: previousEcology?.layeredPressureMemory,
    pressureMemory: previousEcology?.pressureMemory ?? 0
  });
  const incumbentContestDampening = computeContestDampening({
    groupStabilized: previousEcology?.stabilityClass === "stable" || previousEcology?.recoveryMode === "stabilized",
    dominanceConsolidation: previousConsolidation,
    stabilityInertia: incumbentStabilityInertia,
    pressureMemory: previousEcology?.pressureMemory ?? 0,
    layeredPressureMemory: previousEcology?.layeredPressureMemory,
    recoveryMode: previousEcology?.recoveryMode ?? incumbentRecoveryState.recoveryMode,
    recoveryProgress: previousRecoveryProgress,
    recentWinnerContinuity: previousEcology?.incumbentRuleId === incumbentRuleId ? Math.max(0, previousConsolidation / 8) : 0,
    recentConflictLevel: rawChallengePressure + (previousEcology?.turnoverCounter ?? 0) * 2.5,
    reviewShock: previousEcology?.layeredPressureMemory?.reviewShock ?? 0,
    contradictionShock: previousEcology?.layeredPressureMemory?.contradictionShock ?? 0,
    turnoverStress: previousEcology?.layeredPressureMemory?.turnoverStress ?? 0,
    challengerPressure: previousEcology?.layeredPressureMemory?.challengerPressure ?? 0
  });
  const baseResistanceScore = incumbentRuleId
    ? computeResistanceScore({
        dominanceSpan: incumbentEcology?.dominanceSpan ?? 0,
        resilienceScore: incumbentEcology?.resilienceScore ?? 0,
        sourceSessionDepth: incumbentSourceDepth,
        recentWinRate: incumbentTemporal?.recentWinRate ?? 0
      })
    : leaderResistance;
  const preliminaryEffectivePressure = computeEffectivePressure({
    rawChallengePressure,
    resistanceScore: baseResistanceScore,
    pressureMemory: aggregateMemory(incumbentPressureMemory),
    layeredPressureMemory: normalizeLayeredMemory(incumbentPressureMemory),
    recoveryMode: incumbentRecoveryState.recoveryMode,
    cooldownLevel: incumbentCooldownLevel,
    contestDampening: incumbentContestDampening,
    stabilityInertia: incumbentStabilityInertia,
    dominanceConsolidation: previousConsolidation,
    hardeningScore: incumbentEcology?.hardeningScore ?? 0,
    destabilizationPenalty: incumbentEcology?.destabilizationPenalty ?? 0,
    reviewShock: previousEcology?.layeredPressureMemory?.reviewShock ?? 0,
    contradictionShock: previousEcology?.layeredPressureMemory?.contradictionShock ?? 0,
    turnoverStress: previousEcology?.layeredPressureMemory?.turnoverStress ?? 0
  });
  const resistanceScore = computePressureAdjustedResistance({
    baseResistance: baseResistanceScore,
    effectivePressureHint: preliminaryEffectivePressure,
    turnoverCounter,
    lockStatus: previousEcology?.lockStatus,
    pressureMemory: aggregateMemory(incumbentPressureMemory),
    layeredPressureMemory: normalizeLayeredMemory(incumbentPressureMemory),
    recoveryMode: incumbentRecoveryState.recoveryMode,
    cooldownLevel: incumbentCooldownLevel,
    dominanceConsolidation: previousConsolidation,
    stabilityInertia: incumbentStabilityInertia,
    contestDampening: incumbentContestDampening,
    hardeningScore: incumbentEcology?.hardeningScore ?? 0,
    destabilizationPenalty: incumbentEcology?.destabilizationPenalty ?? 0
  });
  const effectivePressure = computeEffectivePressure({
    rawChallengePressure,
    resistanceScore,
    pressureMemory: aggregateMemory(incumbentPressureMemory),
    layeredPressureMemory: normalizeLayeredMemory(incumbentPressureMemory),
    recoveryMode: incumbentRecoveryState.recoveryMode,
    cooldownLevel: incumbentCooldownLevel,
    contestDampening: incumbentContestDampening,
    stabilityInertia: incumbentStabilityInertia,
    dominanceConsolidation: previousConsolidation,
    hardeningScore: incumbentEcology?.hardeningScore ?? 0,
    destabilizationPenalty: incumbentEcology?.destabilizationPenalty ?? 0,
    reviewShock: previousEcology?.layeredPressureMemory?.reviewShock ?? 0,
    contradictionShock: previousEcology?.layeredPressureMemory?.contradictionShock ?? 0,
    turnoverStress: previousEcology?.layeredPressureMemory?.turnoverStress ?? 0
  });

  const adjustedLeaderMomentum = leaderId
    ? computeChallengerMomentum({
        momentumScore: leaderTemporal?.momentumScore ?? 0,
        lockStatus: previousEcology?.lockStatus,
        effectivePressure,
        turnoverCounter,
        pressureMemory: aggregateMemory(previousEcology?.layeredPressureMemory ?? previousEcology?.pressureMemory ?? 0),
        layeredPressureMemory: normalizeLayeredMemory(previousEcology?.layeredPressureMemory ?? previousEcology?.pressureMemory ?? 0),
        recoveryMode: previousEcology?.recoveryMode ?? incumbentRecoveryState.recoveryMode,
        cooldownLevel: previousEcology?.cooldownLevel ?? 0,
        contestDampening: incumbentContestDampening,
        dominanceConsolidation: previousConsolidation,
        stabilityInertia: incumbentStabilityInertia,
        hardeningScore: incumbentEcology?.hardeningScore ?? 0,
        destabilizationPenalty: incumbentEcology?.destabilizationPenalty ?? 0,
        incumbentRuleId,
        currentRuleId: leaderId
      })
    : 0;

  const lockStatus = computeDominanceLock({
    dominanceSpan: incumbentEcology?.dominanceSpan ?? leaderEcology?.dominanceSpan ?? 0,
    effectivePressure,
    turnoverCounter,
    pressureMemory: aggregateMemory(previousEcology?.layeredPressureMemory ?? previousEcology?.pressureMemory ?? 0),
    layeredPressureMemory: normalizeLayeredMemory(previousEcology?.layeredPressureMemory ?? previousEcology?.pressureMemory ?? 0),
    recoveryMode: previousEcology?.recoveryMode ?? incumbentRecoveryState.recoveryMode,
    cooldownLevel: previousEcology?.cooldownLevel ?? 0,
    recoveryProgress: computeRecoveryProgress(previousEcology?.cooldownLevel ?? 0, previousEcology?.layeredPressureMemory),
    previousLockStatus: previousEcology?.lockStatus,
    dominanceConsolidation: previousConsolidation,
    stabilityInertia: previousInertia,
    contestDampening: previousContestDampening,
    hardeningScore: incumbentEcology?.hardeningScore ?? 0,
    reviewShock: previousEcology?.layeredPressureMemory?.reviewShock ?? 0,
    contradictionShock: previousEcology?.layeredPressureMemory?.contradictionShock ?? 0,
    turnoverStress: previousEcology?.layeredPressureMemory?.turnoverStress ?? 0,
    destabilizationPenalty: incumbentEcology?.destabilizationPenalty ?? 0
  });

  if (incumbentRuleId && leaderId && leaderId !== incumbentRuleId) {
    const normalizedMomentum = normalizeMomentumScore(adjustedLeaderMomentum);
    const lockedThreshold =
      STABILIZATION_TURNOVER_THRESHOLDS.minimumChallengerMomentum +
      (previousEcology?.lockStatus === "locked" ? STABILIZATION_BINDING_WEIGHTS.lockedTurnoverDampening : 0) -
      previousConsolidation * 0.01 -
      previousInertia * 0.008 -
      previousContestDampening * 0.006;
    const increment =
      normalizedMomentum >= lockedThreshold
        ? previousEcology?.lockStatus === "locked"
          ? Math.max(0.12, STABILIZATION_BINDING_WEIGHTS.lockedTurnoverDampening - previousConsolidation * 0.005 - previousInertia * 0.004)
          : Math.max(0.2, 1 + Math.min(0.5, turnoverCounter * 0.15) - previousConsolidation * 0.01 - previousContestDampening * 0.005)
        : 0;
    turnoverCounter += increment;
  } else if (leaderId && leaderId === incumbentRuleId) {
    turnoverCounter = Math.max(0, turnoverCounter - (previousConsolidation >= CONSOLIDATION_THRESHOLDS.dominantConsolidation ? 0.4 : 1));
  } else if (!incumbentRuleId) {
    turnoverCounter = 0;
  }

  const stabilizedLockStatus = computeDominanceLock({
    dominanceSpan: incumbentEcology?.dominanceSpan ?? leaderEcology?.dominanceSpan ?? 0,
    effectivePressure,
    turnoverCounter,
    pressureMemory: aggregateMemory(previousEcology?.layeredPressureMemory ?? previousEcology?.pressureMemory ?? 0),
    layeredPressureMemory: normalizeLayeredMemory(previousEcology?.layeredPressureMemory ?? previousEcology?.pressureMemory ?? 0),
    recoveryMode: previousEcology?.recoveryMode ?? incumbentRecoveryState.recoveryMode,
    cooldownLevel: previousEcology?.cooldownLevel ?? 0,
    recoveryProgress: computeRecoveryProgress(previousEcology?.cooldownLevel ?? 0, previousEcology?.layeredPressureMemory),
    previousLockStatus: previousEcology?.lockStatus,
    dominanceConsolidation: previousConsolidation,
    stabilityInertia: previousInertia,
    contestDampening: previousContestDampening,
    hardeningScore: incumbentEcology?.hardeningScore ?? 0,
    reviewShock: previousEcology?.layeredPressureMemory?.reviewShock ?? 0,
    contradictionShock: previousEcology?.layeredPressureMemory?.contradictionShock ?? 0,
    turnoverStress: previousEcology?.layeredPressureMemory?.turnoverStress ?? 0,
    destabilizationPenalty: incumbentEcology?.destabilizationPenalty ?? 0
  });

  return {
    incumbentRuleId,
    currentLeaderRuleId: leaderId,
    challengerRuleIds,
    turnoverCounter,
    lockStatus: stabilizedLockStatus,
    resistanceScore,
    effectivePressure
  };
}

export function classifyGroupStability({
  incumbentRuleId,
  currentLeaderRuleId,
  effectivePressure,
  replacementRisk,
  contestIntensity,
  lockStatus,
  turnoverCounter = 0,
  pressureMemory = 0,
  layeredPressureMemory,
  dominanceConsolidation = 0,
  stabilityInertia = 0,
  contestDampening = 0,
  hardeningScore = 0,
  destabilizationPenalty = 0,
  recoveryMode = "recovering",
  cooldownLevel = 0,
  recoveryProgress = 1
}: {
  incumbentRuleId?: string;
  currentLeaderRuleId?: string;
  effectivePressure: number;
  replacementRisk: number;
  contestIntensity: number;
  lockStatus: CompetitionGroupEcologyLockStatus;
  turnoverCounter?: number;
  pressureMemory?: number;
  layeredPressureMemory?: LayeredPressureMemory;
  dominanceConsolidation?: number;
  stabilityInertia?: number;
  contestDampening?: number;
  hardeningScore?: number;
  destabilizationPenalty?: number;
  recoveryMode?: RecoveryMode;
  cooldownLevel?: number;
  recoveryProgress?: number;
}): CompetitionGroupEcologyClass {
  const layeredAggregate = computePressureMemoryBoost(layeredPressureMemory ?? pressureMemory);
  const reviewShock = layeredPressureMemory?.reviewShock ?? 0;
  const contradictionShock = layeredPressureMemory?.contradictionShock ?? 0;
  const turnoverStress = layeredPressureMemory?.turnoverStress ?? 0;
  const challengerPressure = layeredPressureMemory?.challengerPressure ?? 0;
  const stabilized = recoveryMode === "stabilized";
  const consolidationShield = dominanceConsolidation * 0.14 + stabilityInertia * 0.16 + contestDampening * 0.18 + hardeningScore * 0.08 - destabilizationPenalty * 0.06;
  const effectiveContest = Math.max(0, contestIntensity - consolidationShield * 1.2 - contestDampening * 0.3);
  const effectiveChallenge = Math.max(0, effectivePressure - consolidationShield * 0.85 - stabilityInertia * 0.12);
  const recoveredEnough = recoveryMode === "stabilized" || (recoveryMode === "recovering" && recoveryProgress >= 0.72 && stabilityInertia >= 22);

  if (
    incumbentRuleId &&
    currentLeaderRuleId &&
    currentLeaderRuleId !== incumbentRuleId &&
    (replacementRisk >= STABILIZATION_GROUP_THRESHOLDS.turnoverMinReplacementRisk ||
      lockStatus === "breaking" ||
      turnoverCounter >= STABILIZATION_TURNOVER_THRESHOLDS.turnoverMinCounter ||
      turnoverStress >= 18 ||
      destabilizationPenalty >= 32)
  ) {
    return "turnover";
  }

  if (
    !incumbentRuleId ||
    (effectiveContest >= STABILIZATION_GROUP_THRESHOLDS.contestedMinContestIntensity &&
      contestDampening < STABILIZATION_GROUP_THRESHOLDS.stableMaxReplacementRisk) ||
    challengerPressure >= STABILIZATION_GROUP_THRESHOLDS.contestedMinContestIntensity * 0.65
  ) {
    return "contested";
  }

  const residualPressure =
    layeredAggregate >= STABILIZATION_GROUP_THRESHOLDS.pressuredMaxReplacementRisk * 0.32 ||
    pressureMemory >= STABILIZATION_GROUP_THRESHOLDS.pressuredMaxReplacementRisk * 0.35 ||
    reviewShock >= 18 ||
    contradictionShock >= 18 ||
    cooldownLevel >= STABILIZATION_GROUP_THRESHOLDS.pressuredMaxReplacementRisk * 0.55 ||
    destabilizationPenalty >= 24;
  const recoveryLag = recoveryProgress < 0.72 && cooldownLevel > 0 && recoveryMode !== "stabilized";

  if (
    effectiveChallenge >= STABILIZATION_LOCK_THRESHOLDS.incumbentMaxEffectivePressure ||
    replacementRisk >= STABILIZATION_GROUP_THRESHOLDS.pressuredMaxReplacementRisk ||
    residualPressure ||
    recoveryLag ||
    recoveryMode === "slow" ||
    (contestDampening < 12 && effectiveContest >= STABILIZATION_GROUP_THRESHOLDS.contestedMinContestIntensity * 0.8)
  ) {
    return "pressured";
  }

  if (
    lockStatus === "breaking" ||
    recoveryMode === "stalled" ||
    (!recoveredEnough && contestIntensity >= STABILIZATION_GROUP_THRESHOLDS.contestedMinContestIntensity * 0.7)
  ) {
    return "turnover";
  }

  return stabilized || recoveredEnough ? "stable" : "stable";
}

export function explainWhyRuleStillHolds({
  ruleId,
  dominanceSpan,
  lockStatus,
  effectivePressure,
  resistanceScore,
  challengerCount
}: {
  ruleId: string;
  dominanceSpan: number;
  lockStatus: CompetitionGroupEcologyLockStatus;
  effectivePressure: number;
  resistanceScore: number;
  challengerCount: number;
}) {
  return {
    ruleId,
    summary:
      lockStatus === "locked"
        ? "This rule still holds because it has built a dominance lock and its resistance still offsets challenger pressure."
        : "This rule still holds because challengers have not yet sustained enough effective pressure to break incumbency.",
    details: [
      `dominanceSpan=${dominanceSpan}`,
      `lock=${lockStatus}`,
      `effectivePressure=${effectivePressure.toFixed(1)}`,
      `resistance=${resistanceScore.toFixed(1)}`,
      `challengers=${challengerCount}`
    ].join(" · ")
  };
}

export function explainWhyRuleIsBeingReplaced({
  ruleId,
  turnoverCounter,
  effectivePressure,
  challengerRuleIds,
  lockStatus
}: {
  ruleId: string;
  turnoverCounter: number;
  effectivePressure: number;
  challengerRuleIds: string[];
  lockStatus: CompetitionGroupEcologyLockStatus;
}) {
  return {
    ruleId,
    summary:
      lockStatus === "breaking"
        ? "This rule is being replaced because challengers have sustained pressure long enough to break the incumbent lock."
        : "This rule is under replacement pressure because challengers are repeatedly outcompeting it.",
    details: [
      `turnoverCounter=${turnoverCounter}`,
      `effectivePressure=${effectivePressure.toFixed(1)}`,
      `lock=${lockStatus}`,
      `challengers=${challengerRuleIds.join(",") || "none"}`
    ].join(" · ")
  };
}
