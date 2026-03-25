export const CONTRADICTION_SEVERITY_WEIGHTS = {
  low: 0.6,
  medium: 1.4,
  high: 2.8
} as const;

export const CONTRADICTION_TYPE_WEIGHTS = {
  behavior_conflict: 1,
  boundary_violation: 2.1,
  decision_mismatch: 1.35,
  style_mismatch: 0.95
} as const;

export const CORRECTION_PRESSURE_WEIGHTS = {
  style: 0.7,
  decision: 1.1,
  value: 0.85,
  boundary: 1.7
} as const;

export const RULE_COMPETITION_THRESHOLDS = {
  acceptedMinSurvivability: 42,
  stableMinSurvivability: 64,
  challengedMinSurvivability: 28,
  contradictedMinSurvivability: 18,
  invalidatedMinSurvivability: 8,
  acceptedMinNetScore: 1.5,
  stableMinNetScore: 2.7,
  challengedMaxNetScore: 0.6,
  contradictedMaxNetScore: 0.2,
  invalidatedMaxNetScore: -1.4,
  invalidationContradictionScore: 3.2,
  contradictedContradictionScore: 2,
  downgradeContradictionScore: 1.15,
  boundaryForceContradictionScore: 2.1,
  boundaryForceCorrectionPressure: 1.8
} as const;

export const RULE_FALSIFICATION_THRESHOLDS = {
  highSeverityContradictionCount: 1,
  mediumSeverityContradictionCount: 2,
  repeatedChallengeCount: 2,
  repeatedBoundaryViolationCount: 1,
  reviewSignalForceDowngradeCount: 1,
  staleChallengeDays: 7
} as const;

export const RULE_COMPETITION_LIMITS = {
  min: 0,
  max: 100
} as const;

export function clampCompetitionScore(value: number) {
  return Math.max(RULE_COMPETITION_LIMITS.min, Math.min(RULE_COMPETITION_LIMITS.max, value));
}
