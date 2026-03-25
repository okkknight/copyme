import type { EditBudgetPolicy, ReactionBand } from "@/lib/types";

export const MICRO_EDIT_ROI_THRESHOLDS = {
  minimumRoiScore: 0.8,
  riskPenaltyWeights: {
    preservePriority: 0.05,
    reactionBand: 0.5,
    directionConflict: 0.7,
    safetyTriggered: 1.5
  },
  gainWeights: {
    similarity: 0.55,
    naturalness: 0.35,
    risk: 0.5,
    budget: 0.2
  },
  budgets: {
    guarded_targeted: { maxBudget: 1, preferSimilarityGain: true, preferNaturalnessGain: false, maxEdits: 1 },
    partial_targeted: { maxBudget: 2, preferSimilarityGain: true, preferNaturalnessGain: true, maxEdits: 2 },
    cluster_targeted: { maxBudget: 3, preferSimilarityGain: true, preferNaturalnessGain: true, maxEdits: 2 },
    skip: { maxBudget: 0, preferSimilarityGain: false, preferNaturalnessGain: false, maxEdits: 0 },
    bounded_full: { maxBudget: 0, preferSimilarityGain: false, preferNaturalnessGain: false, maxEdits: 0 },
    full_correction: { maxBudget: 0, preferSimilarityGain: false, preferNaturalnessGain: false, maxEdits: 0 }
  } satisfies Record<ReactionBand, EditBudgetPolicy>,
  typeWeights: {
    tone_soften: { similarity: 1.6, naturalness: 4.2, risk: 1.1, budget: 1 },
    boundary_soften: { similarity: 2.8, naturalness: 3.4, risk: 1.6, budget: 1.3 },
    instruction_reorder: { similarity: 5.8, naturalness: 1.8, risk: 2.2, budget: 2 },
    redundancy_cleanup: { similarity: 0.8, naturalness: 4.8, risk: 0.4, budget: 1 },
    clarity_improve: { similarity: 3.4, naturalness: 2.6, risk: 1.2, budget: 1.4 }
  }
} as const;

