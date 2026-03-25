export const TEMPORAL_RECENT_WINDOW_SIZE = 5;
export const TEMPORAL_WEIGHT_DECAY = 0.78;

export const TEMPORAL_OUTCOME_WEIGHTS = {
  win: 2.2,
  loss: -2.6,
  support: 1.1,
  challenge: -1.4,
  idle: -0.35
} as const;

export const TEMPORAL_TREND_THRESHOLDS = {
  risingRecentWinRate: 0.62,
  risingMomentumScore: 8,
  risingDecayAdjustedScore: 58,
  fadingRecentFailureRate: 0.48,
  fadingMomentumScore: -5,
  fadingDecayAdjustedScore: 38,
  volatileScore: 42
} as const;

export const TEMPORAL_REPLACEMENT_THRESHOLDS = {
  repeatedWins: 3,
  recentWinRate: 0.68,
  momentumScore: 10,
  decayAdjustedScore: 62,
  recentFailureRate: 0.45
} as const;

export const TEMPORAL_COMPETITION_THRESHOLDS = {
  settledRecentWinRate: 0.6,
  settledMomentumScore: 7,
  settledVolatilityScore: 38
} as const;

export const TEMPORAL_IDLE_PENALTY = 0.6;
export const TEMPORAL_VOLATILITY_PENALTY = 0.35;

