export const WRITEBACK_THRESHOLDS = {
  nearPerfectOverall: 95,
  nearPerfectDecision: 95,
  nearPerfectBoundary: 95,
  nearPerfectPriority: 90,
  styleOnlyFloor: 90,
  lowSeverityGuard: "low" as const,
  magnitudeRange: {
    min: 20,
    max: 40
  },
  magnitudeDefaults: {
    strengthen: 24,
    weaken: 26,
    adjust_priority: 32,
    adjust_boundary: 30,
    adjust_style: 22
  },
  regressionImprovementFloor: 0.5
} as const;
