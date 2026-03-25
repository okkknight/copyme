import { aggregateLayeredPressureMemory, describeLayeredPressureMemory, layeredMemoryStage } from "@/lib/layered-memory";
import { CONSOLIDATION_THRESHOLDS } from "@/lib/consolidation-thresholds";
import {
  LAYERED_MEMORY_THRESHOLDS,
  NONLINEAR_RECOVERY_THRESHOLDS,
  MEMORY_PENALTY_THRESHOLDS
} from "@/lib/memory-thresholds";
import { computePressureMemoryBoost } from "@/lib/pressure-memory";
import type { CompetitionGroupEcologyLockStatus, LayeredPressureMemory, RecoveryMode } from "@/lib/types";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0: number, edge1: number, x: number) {
  if (edge0 === edge1) return x >= edge1 ? 1 : 0;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function aggregateLoad({
  pressureMemory,
  layeredPressureMemory
}: {
  pressureMemory?: number;
  layeredPressureMemory?: LayeredPressureMemory;
}) {
  if (layeredPressureMemory) {
    return aggregateLayeredPressureMemory(layeredPressureMemory);
  }
  return pressureMemory ?? 0;
}

export function classifyRecoveryMode({
  cooldownLevel,
  pressureMemory,
  layeredPressureMemory
}: {
  cooldownLevel: number;
  pressureMemory?: number;
  layeredPressureMemory?: LayeredPressureMemory;
}): RecoveryMode {
  const layeredLoad = aggregateLoad({ pressureMemory, layeredPressureMemory });
  const layeredStage = layeredPressureMemory ? layeredMemoryStage(layeredPressureMemory) : "low";
  const memoryBias =
    layeredPressureMemory && layeredStage === "severe"
      ? NONLINEAR_RECOVERY_THRESHOLDS.reviewShockDrag * 7
      : layeredPressureMemory && layeredStage === "high"
        ? NONLINEAR_RECOVERY_THRESHOLDS.reviewShockDrag * 4
        : layeredPressureMemory && layeredStage === "medium"
          ? NONLINEAR_RECOVERY_THRESHOLDS.reviewShockDrag * 2
          : 0;
  const effectiveCooldown = clamp(cooldownLevel * 0.74 + layeredLoad * 0.22 + memoryBias, 0, 100);

  if (
    effectiveCooldown >= NONLINEAR_RECOVERY_THRESHOLDS.stalledCooldownLevel ||
    (layeredPressureMemory?.reviewShock ?? 0) >= MEMORY_PENALTY_THRESHOLDS.severeMemory * 0.45 ||
    (layeredPressureMemory?.turnoverStress ?? 0) >= MEMORY_PENALTY_THRESHOLDS.highMemory
  ) {
    return "stalled";
  }

  if (
    effectiveCooldown >= NONLINEAR_RECOVERY_THRESHOLDS.slowCooldownLevel ||
    (layeredPressureMemory?.reviewShock ?? 0) >= MEMORY_PENALTY_THRESHOLDS.highMemory * 0.55 ||
    (layeredPressureMemory?.contradictionShock ?? 0) >= MEMORY_PENALTY_THRESHOLDS.highMemory * 0.6
  ) {
    return "slow";
  }

  if (
    effectiveCooldown >= NONLINEAR_RECOVERY_THRESHOLDS.recoveringCooldownLevel ||
    layeredLoad >= MEMORY_PENALTY_THRESHOLDS.mediumMemory
  ) {
    return "recovering";
  }

  return "stabilized";
}

export function computeRecoveryState({
  cooldownLevel,
  pressureMemory,
  layeredPressureMemory
}: {
  cooldownLevel: number;
  pressureMemory?: number;
  layeredPressureMemory?: LayeredPressureMemory;
}) {
  const recoveryMode = classifyRecoveryMode({ cooldownLevel, pressureMemory, layeredPressureMemory });
  const layeredLoad = aggregateLoad({ pressureMemory, layeredPressureMemory });
  const layeredDetail = describeLayeredPressureMemory(layeredPressureMemory);
  const layeredShockDrag =
    (layeredPressureMemory?.reviewShock ?? 0) * NONLINEAR_RECOVERY_THRESHOLDS.reviewRecoveryDelay +
    (layeredPressureMemory?.contradictionShock ?? 0) * NONLINEAR_RECOVERY_THRESHOLDS.contradictionRecoveryDelay +
    (layeredPressureMemory?.challengerPressure ?? 0) * NONLINEAR_RECOVERY_THRESHOLDS.challengerRecoveryDelay +
    (layeredPressureMemory?.turnoverStress ?? 0) * NONLINEAR_RECOVERY_THRESHOLDS.turnoverRecoveryDelay;
  const effectiveCooldown = clamp(cooldownLevel * 0.78 + layeredLoad * 0.18 + layeredShockDrag * 0.08, 0, 100);
  const recoverySignal = clamp(1 - effectiveCooldown / 100, 0, 1);

  const recoveryProgress =
    recoveryMode === "stalled"
      ? clamp(smoothstep(0.05, 0.32, recoverySignal) * NONLINEAR_RECOVERY_THRESHOLDS.stalledRecoveryCap, 0, NONLINEAR_RECOVERY_THRESHOLDS.stalledRecoveryCap)
      : recoveryMode === "slow"
        ? clamp(
            NONLINEAR_RECOVERY_THRESHOLDS.stalledRecoveryCap +
              smoothstep(0.18, 0.56, recoverySignal) * (NONLINEAR_RECOVERY_THRESHOLDS.slowRecoveryCap - NONLINEAR_RECOVERY_THRESHOLDS.stalledRecoveryCap),
            NONLINEAR_RECOVERY_THRESHOLDS.stalledRecoveryCap,
            NONLINEAR_RECOVERY_THRESHOLDS.slowRecoveryCap
          )
        : recoveryMode === "recovering"
          ? clamp(
              NONLINEAR_RECOVERY_THRESHOLDS.slowRecoveryCap +
                smoothstep(0.42, 0.8, recoverySignal) * (NONLINEAR_RECOVERY_THRESHOLDS.recoveringRecoveryCap - NONLINEAR_RECOVERY_THRESHOLDS.slowRecoveryCap),
              NONLINEAR_RECOVERY_THRESHOLDS.slowRecoveryCap,
              NONLINEAR_RECOVERY_THRESHOLDS.recoveringRecoveryCap
            )
          : clamp(
              NONLINEAR_RECOVERY_THRESHOLDS.recoveringRecoveryCap +
                smoothstep(0.68, 1, recoverySignal) * (NONLINEAR_RECOVERY_THRESHOLDS.stabilizedRecoveryCap - NONLINEAR_RECOVERY_THRESHOLDS.recoveringRecoveryCap),
              NONLINEAR_RECOVERY_THRESHOLDS.recoveringRecoveryCap,
              NONLINEAR_RECOVERY_THRESHOLDS.stabilizedRecoveryCap
            );

  return {
    recoveryMode,
    recoveryProgress,
    effectiveCooldown,
    layeredLoad,
    layeredDetail
  };
}

export function computeRecoveryProgress(cooldownLevel: number, layeredPressureMemory?: LayeredPressureMemory) {
  return computeRecoveryState({ cooldownLevel, layeredPressureMemory }).recoveryProgress;
}

export function updateCooldownLevel({
  previousCooldown,
  pressureMemory,
  layeredPressureMemory,
  turnoverCounter,
  lockStatus,
  challengerBecameLeader,
  contradictionShock,
  reviewShock
}: {
  previousCooldown: number;
  pressureMemory?: number;
  layeredPressureMemory?: LayeredPressureMemory;
  turnoverCounter: number;
  lockStatus?: CompetitionGroupEcologyLockStatus;
  challengerBecameLeader: boolean;
  contradictionShock: number;
  reviewShock: number;
}) {
  const layeredLoad = aggregateLoad({ pressureMemory, layeredPressureMemory });
  const stage = classifyRecoveryMode({ cooldownLevel: previousCooldown, pressureMemory: layeredLoad, layeredPressureMemory });
  const stageCarry =
    stage === "stalled"
      ? 0.96
      : stage === "slow"
        ? 0.92
        : stage === "recovering"
          ? 0.84
          : 0.72;
  const stageDecay =
    stage === "stalled"
      ? 0.985
      : stage === "slow"
        ? 0.94
        : stage === "recovering"
          ? 0.82
          : 0.72;
  const layeredShock =
    (layeredPressureMemory?.challengerPressure ?? 0) * LAYERED_MEMORY_THRESHOLDS.challenger.weight +
    (layeredPressureMemory?.contradictionShock ?? 0) * LAYERED_MEMORY_THRESHOLDS.contradiction.weight +
    (layeredPressureMemory?.reviewShock ?? 0) * LAYERED_MEMORY_THRESHOLDS.review.weight +
    (layeredPressureMemory?.turnoverStress ?? 0) * LAYERED_MEMORY_THRESHOLDS.turnover.weight;

  const eventShock =
    turnoverCounter * NONLINEAR_RECOVERY_THRESHOLDS.turnoverShockDrag +
    (lockStatus === "breaking" ? NONLINEAR_RECOVERY_THRESHOLDS.turnoverShockDrag * 1.2 : 0) +
    (challengerBecameLeader ? NONLINEAR_RECOVERY_THRESHOLDS.challengerShockDrag * 3 : 0) +
    contradictionShock * NONLINEAR_RECOVERY_THRESHOLDS.contradictionShockDrag +
    reviewShock * NONLINEAR_RECOVERY_THRESHOLDS.reviewShockDrag +
    layeredShock * 0.75 +
    Math.max(0, layeredLoad - MEMORY_PENALTY_THRESHOLDS.lowMemory) * 0.12;

  const hasShock = eventShock > 0 || lockStatus === "breaking" || challengerBecameLeader;
  const shock = hasShock ? eventShock + 8 : 0;
  const next = hasShock ? previousCooldown * stageCarry + shock : previousCooldown * stageDecay - layeredLoad * 0.04;
  return clamp(next, 0, 100);
}

export function applyCooldownToResistance(
  baseResistance: number,
  cooldownLevel: number,
  pressureMemory: number | LayeredPressureMemory,
  recoveryMode: RecoveryMode = "recovering",
  dominanceConsolidation = 0,
  stabilityInertia = 0,
  contestDampening = 0
) {
  const cooldownPenalty = cooldownLevel * 0.22;
  const memoryPenalty = computePressureMemoryBoost(pressureMemory) * 0.22;
  const modePenalty =
    recoveryMode === "stalled"
      ? 8
      : recoveryMode === "slow"
        ? 4
        : recoveryMode === "recovering"
          ? 1.5
          : 0;
  const consolidationBoost =
    dominanceConsolidation * 0.18 +
    stabilityInertia * 0.12 +
    contestDampening * 0.08 +
    Math.max(0, dominanceConsolidation - CONSOLIDATION_THRESHOLDS.stableConsolidation) * 0.04;
  return Math.max(0, Math.min(100, baseResistance - cooldownPenalty - memoryPenalty - modePenalty + consolidationBoost));
}

export function applyCooldownToReplacementRisk(
  baseRisk: number,
  cooldownLevel: number,
  pressureMemory: number | LayeredPressureMemory,
  recoveryMode: RecoveryMode = "recovering",
  dominanceConsolidation = 0,
  stabilityInertia = 0,
  contestDampening = 0
) {
  const memoryBoost = computePressureMemoryBoost(pressureMemory);
  const modeBoost =
    recoveryMode === "stalled"
      ? 12
      : recoveryMode === "slow"
        ? 8
        : recoveryMode === "recovering"
          ? 3
          : 0;
  const consolidationShield = dominanceConsolidation * 0.22 + stabilityInertia * 0.14 + contestDampening * 0.1;
  return clamp(baseRisk + cooldownLevel * 0.28 + memoryBoost * 0.18 + modeBoost - consolidationShield, 0, 100);
}

export function classifyRecoveryState(cooldownLevel: number, layeredPressureMemory?: LayeredPressureMemory) {
  return classifyRecoveryMode({ cooldownLevel, layeredPressureMemory });
}

export function explainWhyRuleHasNotRecovered({
  ruleId,
  pressureMemory,
  layeredPressureMemory,
  cooldownLevel,
  recoveryProgress,
  recoveryMode,
  recentPressureSources,
  lastPressureAt
}: {
  ruleId: string;
  pressureMemory: number;
  layeredPressureMemory?: LayeredPressureMemory;
  cooldownLevel: number;
  recoveryProgress: number;
  recoveryMode: RecoveryMode;
  recentPressureSources: string[];
  lastPressureAt?: string;
}) {
  const layeredDetail = describeLayeredPressureMemory(layeredPressureMemory);
  return {
    ruleId,
    summary:
      recoveryMode === "stalled" || recoveryProgress < NONLINEAR_RECOVERY_THRESHOLDS.stalledRecoveryCap
        ? "Recovery is stalled because layered pressure memory is still carrying recent conflict."
        : "Recovery is delayed because one or more shock sources are still active.",
    details: [
      `pressureMemory=${pressureMemory.toFixed(1)}`,
      `layered=${layeredDetail.summary}`,
      `cooldownLevel=${cooldownLevel.toFixed(1)}`,
      `recoveryProgress=${Math.round(recoveryProgress * 100)}%`,
      `recoveryMode=${recoveryMode}`,
      `sources=${recentPressureSources.join(",") || "none"}`,
      `lastPressureAt=${lastPressureAt ?? "unknown"}`
    ].join(" · ")
  };
}

export function explainWhyRuleRecoveredSlowly({
  ruleId,
  layeredPressureMemory,
  cooldownLevel,
  recoveryProgress,
  recoveryMode,
  lastRecoveryAt,
  lastBreakAt
}: {
  ruleId: string;
  layeredPressureMemory?: LayeredPressureMemory;
  cooldownLevel: number;
  recoveryProgress: number;
  recoveryMode: RecoveryMode;
  lastRecoveryAt?: string;
  lastBreakAt?: string;
}) {
  const layeredDetail = describeLayeredPressureMemory(layeredPressureMemory);
  const dominantShock =
    (layeredPressureMemory?.reviewShock ?? 0) >= (layeredPressureMemory?.contradictionShock ?? 0) &&
    (layeredPressureMemory?.reviewShock ?? 0) >= (layeredPressureMemory?.turnoverStress ?? 0)
      ? "review"
      : (layeredPressureMemory?.contradictionShock ?? 0) >= (layeredPressureMemory?.turnoverStress ?? 0)
        ? "contradiction"
        : "turnover";

  return {
    ruleId,
    summary:
      recoveryMode === "recovering" || recoveryMode === "stabilized"
        ? `Recovery is proceeding slowly because ${dominantShock} shock is still lingering in layered memory.`
        : "Recovery has not finished because the system is still carrying layered conflict memory.",
    details: [
      `layered=${layeredDetail.summary}`,
      `cooldownLevel=${cooldownLevel.toFixed(1)}`,
      `recoveryProgress=${Math.round(recoveryProgress * 100)}%`,
      `recoveryMode=${recoveryMode}`,
      `lastRecoveryAt=${lastRecoveryAt ?? "unknown"}`,
      `lastBreakAt=${lastBreakAt ?? "unknown"}`
    ].join(" · ")
  };
}

export function explainWhyRuleIsStillPressured({
  ruleId,
  pressureMemory,
  layeredPressureMemory,
  cooldownLevel,
  recoveryProgress,
  recoveryMode,
  recentPressureSources,
  lastPressureAt
}: {
  ruleId: string;
  pressureMemory: number;
  layeredPressureMemory?: LayeredPressureMemory;
  cooldownLevel: number;
  recoveryProgress: number;
  recoveryMode: RecoveryMode;
  recentPressureSources: string[];
  lastPressureAt?: string;
}) {
  return explainWhyRuleHasNotRecovered({
    ruleId,
    pressureMemory,
    layeredPressureMemory,
    cooldownLevel,
    recoveryProgress,
    recoveryMode,
    recentPressureSources,
    lastPressureAt
  });
}

export function explainWhyRuleRecovered({
  ruleId,
  cooldownLevel,
  recoveryProgress,
  layeredPressureMemory,
  recoveryMode,
  lastRecoveryAt,
  lastBreakAt
}: {
  ruleId: string;
  cooldownLevel: number;
  recoveryProgress: number;
  layeredPressureMemory?: LayeredPressureMemory;
  recoveryMode: RecoveryMode;
  lastRecoveryAt?: string;
  lastBreakAt?: string;
}) {
  return explainWhyRuleRecoveredSlowly({
    ruleId,
    layeredPressureMemory,
    cooldownLevel,
    recoveryProgress,
    recoveryMode,
    lastRecoveryAt,
    lastBreakAt
  });
}
