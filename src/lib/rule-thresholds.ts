export const RULE_LEARNING_THRESHOLDS = {
  candidateSupportCount: 1,
  emergingSupportCount: 2,
  emergingSourceSessionCount: 1,
  acceptedSupportCount: 3,
  acceptedSourceSessionCount: 2,
  acceptedConfidence: 0.76,
  acceptedMaxChallengeCount: 1,
  stableSupportCount: 4,
  stableSourceSessionCount: 3,
  stableConfidence: 0.82,
  stableStabilityScore: 72,
  challengedChallengeCount: 2,
  deprecatedChallengeCount: 3,
  rejectedChallengeCount: 4,
  lowConfidenceForDeprecated: 0.4,
  lowConfidenceForRejected: 0.28
} as const;

export const RULE_LEARNING_WEIGHTS = {
  supportConfidence: 0.045,
  challengeConfidence: 0.06,
  observedConfidence: 0.02,
  reviewCorrectionConfidence: 0.03,
  sourceSessionBonus: 0.015,
  supportStability: 14,
  challengeStability: 16,
  reviewCorrectionStability: 3,
  sourceSessionStability: 7
} as const;

export const RULE_CONFIDENCE_LIMITS = {
  min: 0.05,
  max: 0.99
} as const;

export function clampConfidence(value: number) {
  return Math.max(RULE_CONFIDENCE_LIMITS.min, Math.min(RULE_CONFIDENCE_LIMITS.max, value));
}
