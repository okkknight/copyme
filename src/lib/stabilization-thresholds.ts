export const STABILIZATION_LOCK_THRESHOLDS = {
  incumbentDominanceSpan: 3,
  lockedDominanceSpan: 5,
  lockedMaxEffectivePressure: 18,
  incumbentMaxEffectivePressure: 26
} as const;

export const STABILIZATION_TURNOVER_THRESHOLDS = {
  pressuredMinCounter: 1,
  turnoverMinCounter: 2,
  displacementCounter: 3,
  incumbentBreakEffectivePressure: 22,
  minimumChallengerMomentum: 0.55
} as const;

export const STABILIZATION_RESISTANCE_WEIGHTS = {
  dominanceSpan: 3.4,
  resilienceScore: 0.38,
  sourceSessionDepth: 4.8,
  recentWinRate: 18
} as const;

export const STABILIZATION_GROUP_THRESHOLDS = {
  stableMaxReplacementRisk: 28,
  pressuredMaxReplacementRisk: 52,
  contestedMinContestIntensity: 46,
  turnoverMinReplacementRisk: 58
} as const;

export const STABILIZATION_BINDING_WEIGHTS = {
  lockedChallengerMomentumPenalty: 5,
  lockedReplacementThresholdLift: 4,
  lockedTurnoverDampening: 0.5,
  pressureResistanceDecay: 0.42,
  pressureWinBoost: 0.18,
  turnoverMomentumBoost: 2.6,
  turnoverResistanceDecay: 4.2,
  breakingLockPressureBonus: 6
} as const;
