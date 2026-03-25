export const CONFLICT_SIGNAL_CALIBRATION_THRESHOLDS = {
  directionConflict: {
    overrideRecall: 62,
    overrideCalibration: 66,
    confidenceFloor: 0.58
  },
  signalRecall: {
    highSimilarityWrongReasoning: 64,
    teacherDirectionConflict: 58,
    mixedContentConflict: 50,
    adversarialPolitenessMask: 48,
    longTextMultiIntentConflict: 46,
    studentStatePriorityConflict: 44
  },
  calibrationWeights: {
    directionProbeBoost: 18,
    precisionHighBoost: 14,
    precisionMediumBoost: 8,
    mixedClusterBoost: 12,
    adversarialMaskBoost: 16,
    studentStateBoost: 10,
    longTextLocalPenalty: 18,
    longTextGlobalBoost: 16
  },
  scopeSplit: {
    localClusterSegmentFloor: 2,
    globalSegmentFloor: 4,
    globalCoverageFloor: 0.65,
    localClusterCoverageCeiling: 0.55
  },
  routing: {
    highSimilarityWrongReasoningFloor: 62,
    longTextLocalTargetedFloor: 58,
    longTextGlobalFullFloor: 82,
    adversarialTargetedFloor: 54,
    mixedTargetedFloor: 52
  }
} as const;
