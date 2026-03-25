import { aggregateLayeredPressureMemory, describeLayeredPressureMemory } from "@/lib/layered-memory";
import {
  CONSOLIDATION_THRESHOLDS,
  CONSOLIDATION_WEIGHTS
} from "@/lib/consolidation-thresholds";
import type { LayeredPressureMemory, RecoveryMode } from "@/lib/types";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function shockLoad(layeredPressureMemory?: LayeredPressureMemory) {
  return layeredPressureMemory ? aggregateLayeredPressureMemory(layeredPressureMemory) : 0;
}

export function computeStabilityInertia({
  recoveryMode,
  recoveryProgress,
  dominanceConsolidation,
  recentConflictLevel,
  layeredPressureMemory,
  pressureMemory = 0
}: {
  recoveryMode: RecoveryMode;
  recoveryProgress: number;
  dominanceConsolidation: number;
  recentConflictLevel: number;
  layeredPressureMemory?: LayeredPressureMemory;
  pressureMemory?: number;
}) {
  const layeredLoad = Math.max(pressureMemory, shockLoad(layeredPressureMemory));
  const memoryStagePenalty =
    layeredLoad >= CONSOLIDATION_THRESHOLDS.hardenedConsolidation
      ? 12
      : layeredLoad >= CONSOLIDATION_THRESHOLDS.dominantConsolidation
        ? 7
        : layeredLoad >= CONSOLIDATION_THRESHOLDS.stableConsolidation
          ? 3
          : 0;
  const recoveryBoost =
    recoveryMode === "stabilized"
      ? 18
      : recoveryMode === "recovering"
        ? 10
        : recoveryMode === "slow"
          ? 4
          : 0;
  const consolidationBoost = dominanceConsolidation * 0.32;
  const inertia = clamp(
    recoveryBoost +
      recoveryProgress * 18 +
      consolidationBoost -
      recentConflictLevel * 0.22 -
      layeredLoad * 0.1 -
      memoryStagePenalty,
    0,
    100
  );
  return inertia;
}

export function updateDominanceConsolidation({
  previousConsolidation = 0,
  dominanceSpan,
  recentSurvivalCount,
  recentIncumbentHolds,
  recoveryMode,
  recoveryProgress,
  pressureMemory = 0,
  layeredPressureMemory,
  reviewShock = 0,
  contradictionShock = 0,
  turnoverStress = 0,
  challengerPressure = 0,
  recentConflictLevel = 0,
  lastStabilizedAt
}: {
  previousConsolidation?: number;
  dominanceSpan: number;
  recentSurvivalCount: number;
  recentIncumbentHolds: number;
  recoveryMode: RecoveryMode;
  recoveryProgress: number;
  pressureMemory?: number;
  layeredPressureMemory?: LayeredPressureMemory;
  reviewShock?: number;
  contradictionShock?: number;
  turnoverStress?: number;
  challengerPressure?: number;
  recentConflictLevel?: number;
  lastStabilizedAt?: string;
}) {
  const layeredLoad = shockLoad(layeredPressureMemory);
  const lowShockBonus =
    reviewShock <= CONSOLIDATION_THRESHOLDS.reviewPierceThreshold * 0.5 &&
    contradictionShock <= CONSOLIDATION_THRESHOLDS.contradictionPierceThreshold * 0.5 &&
    turnoverStress <= CONSOLIDATION_THRESHOLDS.challengerPierceThreshold * 0.5
      ? CONSOLIDATION_WEIGHTS.lowShockBonus
      : 0;
  const modeBoost =
    recoveryMode === "stabilized"
      ? CONSOLIDATION_WEIGHTS.stabilizedModeBonus
      : recoveryMode === "recovering"
        ? CONSOLIDATION_WEIGHTS.recoveringModeBonus
        : 0;
  const consolidationGrowth =
    dominanceSpan * CONSOLIDATION_WEIGHTS.dominanceSpan +
    recentSurvivalCount * CONSOLIDATION_WEIGHTS.recentSurvivalCount +
    recentIncumbentHolds * CONSOLIDATION_WEIGHTS.recentIncumbentHolds +
    recoveryProgress * CONSOLIDATION_WEIGHTS.recoveryProgress +
    lowShockBonus +
    modeBoost -
    Math.max(0, pressureMemory - 12) * CONSOLIDATION_WEIGHTS.pressurePenalty -
    reviewShock * CONSOLIDATION_WEIGHTS.reviewShockPenalty -
    contradictionShock * CONSOLIDATION_WEIGHTS.contradictionShockPenalty -
    turnoverStress * CONSOLIDATION_WEIGHTS.turnoverStressPenalty -
    challengerPressure * CONSOLIDATION_WEIGHTS.challengerPressurePenalty -
    recentConflictLevel * CONSOLIDATION_WEIGHTS.recentConflictPenalty -
    layeredLoad * 0.12;
  const dominanceConsolidation = clamp(previousConsolidation * 0.9 + consolidationGrowth, 0, 100);
  const dominanceStrength = clamp(
    dominanceConsolidation * 0.6 +
      dominanceSpan * 4.5 +
      recentIncumbentHolds * 3.2 +
      recoveryProgress * 10 -
      layeredLoad * 0.18 -
      reviewShock * 0.16 -
      contradictionShock * 0.14,
    0,
    100
  );
  const hardeningScore = clamp(
    dominanceConsolidation * 0.5 +
      dominanceStrength * 0.28 +
      (recoveryMode === "stabilized" ? 14 : recoveryMode === "recovering" ? 6 : 0) +
      lowShockBonus * 0.6 +
      (lastStabilizedAt ? 6 : 0) -
      layeredLoad * 0.08,
    0,
    100
  );
  const stabilityInertia = computeStabilityInertia({
    recoveryMode,
    recoveryProgress,
    dominanceConsolidation,
    recentConflictLevel,
    layeredPressureMemory,
    pressureMemory
  });

  return {
    dominanceConsolidation,
    dominanceStrength,
    hardeningScore,
    stabilityInertia
  };
}

export function explainDominanceConsolidation({
  dominanceConsolidation,
  dominanceStrength,
  hardeningScore,
  stabilityInertia,
  layeredPressureMemory
}: {
  dominanceConsolidation: number;
  dominanceStrength: number;
  hardeningScore: number;
  stabilityInertia: number;
  layeredPressureMemory?: LayeredPressureMemory;
}) {
  const layeredDetail = describeLayeredPressureMemory(layeredPressureMemory);
  return {
    summary:
      dominanceConsolidation >= CONSOLIDATION_THRESHOLDS.hardenedConsolidation
        ? "The incumbent has consolidated enough that fresh contests need sustained pressure to matter."
        : dominanceConsolidation >= CONSOLIDATION_THRESHOLDS.dominantConsolidation
          ? "The incumbent has begun to harden, but still needs support to stay insulated."
          : "The explanation is still consolidating and can be moved by sustained challenge.",
    details: [
      `consolidation=${dominanceConsolidation.toFixed(1)}`,
      `strength=${dominanceStrength.toFixed(1)}`,
      `hardening=${hardeningScore.toFixed(1)}`,
      `inertia=${stabilityInertia.toFixed(1)}`,
      `memory=${layeredDetail.summary}`
    ].join(" · ")
  };
}
