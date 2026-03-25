export const ECOLOGY_RECENT_WINDOW = 6;

export const ECOLOGY_DOMINANCE_THRESHOLDS = {
  minimumDominanceSpan: 3,
  strongDominanceSpan: 5,
  dominantMinResilience: 72,
  dominantMaxChallengePressure: 28,
  dominantMaxIdleDecay: 32
} as const;

export const ECOLOGY_CHALLENGE_THRESHOLDS = {
  fragileMinChallengePressure: 28,
  contestedMinChallengePressure: 45,
  highChallengePressure: 62,
  nearMissConfidenceGap: 9
} as const;

export const ECOLOGY_DECAY_THRESHOLDS = {
  fadingIdleDecayScore: 45,
  collapsingIdleDecayScore: 68,
  repeatedIdleRounds: 3,
  repeatedLossRounds: 2
} as const;

export const ECOLOGY_REPLACEMENT_RISK_THRESHOLDS = {
  fragileRisk: 42,
  contestedRisk: 58,
  collapsingRisk: 76
} as const;

export const ECOLOGY_RESILIENCE_THRESHOLDS = {
  stableMinResilience: 66,
  fragileMinResilience: 42,
  fadingMaxResilience: 38
} as const;

