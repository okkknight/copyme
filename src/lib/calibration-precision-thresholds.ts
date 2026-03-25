export const CALIBRATION_PRECISION_THRESHOLDS = {
  skip: {
    overall: 95,
    decision: 95,
    boundary: 95
  },
  lightTouch: {
    overall: 85,
    decision: 85,
    boundary: 85,
    maxMediumHighDiffs: 2
  },
  targeted: {
    overallFloor: 60,
    decisionFloor: 75,
    boundaryFloor: 75,
    maxHighDiffs: 1
  },
  fullCorrection: {
    overallFloor: 70,
    decisionFloor: 68,
    boundaryFloor: 68,
    highDiffFloor: 2
  },
  override: {
    targetedMinimumScore: 52,
    highEvidenceCount: 2
  },
  segment: {
    protectedSimilarity: 0.88,
    keepSimilarity: 0.8,
    softenSimilarity: 0.68,
    rewriteSimilarity: 0.5
  },
  magnitude: {
    lightTouch: { min: 8, max: 15 },
    targeted: { min: 12, max: 25 },
    fullCorrection: { min: 20, max: 40 }
  }
} as const;
