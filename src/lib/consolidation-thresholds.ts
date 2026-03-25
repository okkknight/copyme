export const CONSOLIDATION_THRESHOLDS = {
  consolidatedDominanceSpan: 5,
  hardenedDominanceSpan: 7,
  stableWinStreak: 3,
  recentHoldWindow: 5,
  stableConsolidation: 24,
  dominantConsolidation: 42,
  hardenedConsolidation: 58,
  stableInertia: 28,
  strongInertia: 46,
  contestDampeningMax: 34,
  reviewPierceThreshold: 30,
  contradictionPierceThreshold: 28,
  challengerPierceThreshold: 32,
  destabilizationPenaltyThreshold: 22
} as const;

export const CONSOLIDATION_WEIGHTS = {
  dominanceSpan: 4.8,
  recentSurvivalCount: 5.6,
  recentIncumbentHolds: 4.4,
  recoveryProgress: 12,
  stabilizedModeBonus: 14,
  recoveringModeBonus: 7,
  lowPressureBonus: 8,
  lowShockBonus: 10,
  pressurePenalty: 0.28,
  reviewShockPenalty: 0.54,
  contradictionShockPenalty: 0.48,
  turnoverStressPenalty: 0.62,
  challengerPressurePenalty: 0.22,
  recentConflictPenalty: 0.3
} as const;

export const CONTEST_DAMPENING_THRESHOLDS = {
  maxDampening: 32,
  stableBase: 10,
  recoveringBase: 6,
  pressuredCeiling: 20,
  strongShockPierce: 26,
  continuityWindow: 4
} as const;

export const CONTEST_DAMPENING_WEIGHTS = {
  dominanceConsolidation: 0.24,
  stabilityInertia: 0.16,
  recoveryProgress: 8,
  recentWinnerContinuity: 4.6,
  lowMemoryBonus: 0.18,
  lowCooldownBonus: 0.14,
  reviewShockPenalty: 0.28,
  contradictionShockPenalty: 0.24,
  turnoverStressPenalty: 0.3,
  challengerPressurePenalty: 0.12,
  recentConflictPenalty: 0.22
} as const;
