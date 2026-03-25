import {
  CONTEST_DAMPENING_THRESHOLDS,
  CONTEST_DAMPENING_WEIGHTS
} from "@/lib/consolidation-thresholds";
import { aggregateLayeredPressureMemory, describeLayeredPressureMemory } from "@/lib/layered-memory";
import type { LayeredPressureMemory, RecoveryMode } from "@/lib/types";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function memoryLoad(layeredPressureMemory?: LayeredPressureMemory, pressureMemory = 0) {
  return layeredPressureMemory ? aggregateLayeredPressureMemory(layeredPressureMemory) : pressureMemory;
}

export function computeContestDampening({
  groupStabilized,
  dominanceConsolidation,
  stabilityInertia,
  pressureMemory = 0,
  layeredPressureMemory,
  recoveryMode,
  recoveryProgress,
  recentWinnerContinuity,
  recentConflictLevel,
  reviewShock = 0,
  contradictionShock = 0,
  turnoverStress = 0,
  challengerPressure = 0
}: {
  groupStabilized: boolean;
  dominanceConsolidation: number;
  stabilityInertia: number;
  pressureMemory?: number;
  layeredPressureMemory?: LayeredPressureMemory;
  recoveryMode: RecoveryMode;
  recoveryProgress: number;
  recentWinnerContinuity: number;
  recentConflictLevel: number;
  reviewShock?: number;
  contradictionShock?: number;
  turnoverStress?: number;
  challengerPressure?: number;
}) {
  const memory = memoryLoad(layeredPressureMemory, pressureMemory);
  const modeBoost =
    recoveryMode === "stabilized"
      ? CONTEST_DAMPENING_THRESHOLDS.stableBase
      : recoveryMode === "recovering"
        ? CONTEST_DAMPENING_THRESHOLDS.recoveringBase
        : 0;
  const continuityBoost = Math.min(recentWinnerContinuity, CONTEST_DAMPENING_THRESHOLDS.continuityWindow) * CONTEST_DAMPENING_WEIGHTS.recentWinnerContinuity;
  const foundation =
    (groupStabilized ? 6 : 0) +
    dominanceConsolidation * CONTEST_DAMPENING_WEIGHTS.dominanceConsolidation +
    stabilityInertia * CONTEST_DAMPENING_WEIGHTS.stabilityInertia +
    recoveryProgress * CONTEST_DAMPENING_WEIGHTS.recoveryProgress +
    continuityBoost +
    modeBoost +
    Math.max(0, CONTEST_DAMPENING_THRESHOLDS.pressuredCeiling - memory) * CONTEST_DAMPENING_WEIGHTS.lowMemoryBonus +
    Math.max(0, 26 - memory) * CONTEST_DAMPENING_WEIGHTS.lowCooldownBonus;
  const pressureDrag =
    reviewShock * CONTEST_DAMPENING_WEIGHTS.reviewShockPenalty +
    contradictionShock * CONTEST_DAMPENING_WEIGHTS.contradictionShockPenalty +
    turnoverStress * CONTEST_DAMPENING_WEIGHTS.turnoverStressPenalty +
    challengerPressure * CONTEST_DAMPENING_WEIGHTS.challengerPressurePenalty +
    recentConflictLevel * CONTEST_DAMPENING_WEIGHTS.recentConflictPenalty;
  return clamp(foundation - pressureDrag, 0, CONTEST_DAMPENING_THRESHOLDS.maxDampening);
}

export function applyContestDampening(value: number, contestDampening: number, factor = 0.18) {
  return clamp(value - contestDampening * factor, 0, 100);
}

export function explainContestDampening({
  contestDampening,
  dominanceConsolidation,
  stabilityInertia,
  layeredPressureMemory,
  recoveryMode
}: {
  contestDampening: number;
  dominanceConsolidation: number;
  stabilityInertia: number;
  layeredPressureMemory?: LayeredPressureMemory;
  recoveryMode: RecoveryMode;
}) {
  const layeredDetail = describeLayeredPressureMemory(layeredPressureMemory);
  return {
    summary:
      contestDampening >= CONTEST_DAMPENING_THRESHOLDS.maxDampening * 0.7
        ? "Contest pressure is being strongly dampened, so light challengers should not reopen contest."
        : contestDampening >= CONTEST_DAMPENING_THRESHOLDS.maxDampening * 0.4
          ? "Contest pressure is partially dampened, but strong shocks can still re-open the group."
          : "Contest dampening is low, so challenger pressure will surface quickly.",
    details: [
      `dampening=${contestDampening.toFixed(1)}`,
      `consolidation=${dominanceConsolidation.toFixed(1)}`,
      `inertia=${stabilityInertia.toFixed(1)}`,
      `mode=${recoveryMode}`,
      `memory=${layeredDetail.summary}`
    ].join(" · ")
  };
}
