export { clampCompetitionScore, RULE_COMPETITION_THRESHOLDS } from "@/lib/falsification-thresholds";

export const HYPOTHESIS_EVOLUTION_THRESHOLDS = {
  minimumSupportConfidence: 0.62,
  testingConfidence: 0.7,
  emergingConfidence: 0.78,
  acceptedConfidence: 0.88,
  minimumSourceSessionCount: 1,
  emergingSourceSessionCount: 2,
  acceptedSourceSessionCount: 3,
  minimumEvidenceTurnCount: 2
} as const;

export const RULE_REPLACEMENT_THRESHOLDS = {
  replacementConfidenceGap: 12,
  replacementSurvivabilityThreshold: 60,
  replacementSupportLead: 8,
  replacementMinGroupMembers: 2,
  replacementContradictionPressure: 1.2
} as const;

export const RULE_COMPETITION_GROUP_THRESHOLDS = {
  settledConfidenceGap: 14,
  contestedConfidenceGap: 7,
  minimumCompetitiveMembers: 2
} as const;

export const HYPOTHESIS_SCORE_WEIGHTS = {
  supportPerSession: 12,
  evidenceTurn: 2,
  parentRulePenalty: 6,
  contradictionBonus: 10,
  reviewSignalBonus: 12,
  sessionPatternBonus: 8,
  highSeverityBonus: 6
} as const;
