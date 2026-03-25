export const REACTION_BAND_THRESHOLDS = {
  highSimilarityWrongReasoning: {
    floor: 72
  },
  longText: {
    localTargetedFloor: 58,
    globalFullFloor: 82
  },
  mixedContent: {
    targetedFloor: 52
  },
  adversarialSoft: {
    targetedFloor: 54
  },
  teacherDirection: {
    overrideFloor: 62
  },
  fullCorrection: {
    signalFloor: 72,
    coverageFloor: 0.7,
    globalHighSignalFloor: 2,
    decisionBoundaryFloor: 2
  }
} as const;
