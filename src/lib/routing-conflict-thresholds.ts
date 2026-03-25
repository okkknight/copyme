export const ROUTING_CONFLICT_THRESHOLDS = {
  guardOverride: {
    high: 70,
    medium: 48,
    highSimilarityFloor: 80
  },
  mixedConflict: {
    medium: 44,
    high: 70,
    minSegments: 2
  },
  longText: {
    multiIntentSentenceFloor: 3,
    multiIntentCategoryFloor: 3,
    medium: 42,
    high: 68
  },
  adversarialPoliteness: {
    medium: 46,
    high: 68
  },
  studentState: {
    medium: 40,
    high: 66
  },
  segmentPriority: {
    editHigh: 72,
    editMedium: 54,
    preserveHigh: 74,
    preserveMedium: 52
  }
} as const;
