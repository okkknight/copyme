import { MICRO_EDIT_ROI_THRESHOLDS } from "@/lib/micro-edit-roi-thresholds";
import { scoreMicroEditROI } from "@/lib/micro-edit-roi-scorer";
import { selectBudgetedMicroEdits } from "@/lib/micro-edit-budget-selector";
import type {
  DirectionConflictProbe,
  EditBudgetPolicy,
  MicroEditOpportunity,
  MicroEditPlan,
  MicroEditSelectionResult,
  MicroEditROI,
  NaturalnessScore,
  ReactionBand,
  SegmentPriority
} from "@/lib/types";
import type { SimilarityScore } from "@/lib/similarity-evaluator";

function policyForReactionBand(reactionBand: ReactionBand): EditBudgetPolicy {
  return MICRO_EDIT_ROI_THRESHOLDS.budgets[reactionBand];
}

function defaultSelection(reactionBand: ReactionBand): MicroEditSelectionResult {
  return {
    selected: [],
    rejected: [],
    totalExpectedSimilarityGain: 0,
    totalExpectedNaturalnessGain: 0,
    budgetUsed: 0,
    rationale: reactionBand === "skip" ? "Micro-edit is disabled for skip." : "Micro-edit is disabled for heavy correction bands."
  };
}

function asOpportunity(edit: MicroEditROI): MicroEditOpportunity {
  return {
    segmentId: edit.segmentId,
    type: edit.type,
    expectedGain: Math.max(1, Math.round(edit.expectedSimilarityGain)),
    riskLevel: edit.riskPenalty > 3 ? "medium" : "low",
    reason: edit.rationale
  };
}

export function buildMicroEditPlan({
  opportunities,
  reactionBand,
  editBudget,
  similarityBefore,
  naturalnessBefore,
  directionProbe,
  segmentPriorities
}: {
  opportunities: MicroEditOpportunity[];
  reactionBand: ReactionBand;
  editBudget?: { maxEdits: number; editableSegments: string[] };
  similarityBefore?: SimilarityScore;
  naturalnessBefore?: NaturalnessScore;
  directionProbe?: DirectionConflictProbe;
  segmentPriorities?: SegmentPriority[];
}): MicroEditPlan {
  if (reactionBand === "skip" || reactionBand === "full_correction" || reactionBand === "bounded_full") {
    return {
      reviewCaseId: "",
      selectedEdits: [],
      totalExpectedGain: 0,
      safe: false,
      scoredEdits: [],
      selectionResult: defaultSelection(reactionBand),
      editBudgetPolicy: policyForReactionBand(reactionBand)
    };
  }

  const policy = policyForReactionBand(reactionBand);
  const effectivePolicy: EditBudgetPolicy = {
    ...policy,
    maxEdits: Math.max(0, Math.min(policy.maxEdits, editBudget?.maxEdits ?? policy.maxEdits)),
    maxBudget: Math.max(0, policy.maxBudget)
  };
  const scoredEdits = scoreMicroEditROI({
    opportunities,
    reactionBand,
    similarityBefore: similarityBefore ?? {
      overall: 0,
      decision: 0,
      priority: 0,
      style: 0,
      boundary: 0,
      reasoningMatch: 0,
      explain: ""
    },
    naturalnessBefore: naturalnessBefore ?? { fluency: 0, coherence: 0, redundancy: 0, toneNaturalness: 0, overall: 0 },
    directionProbe,
    segmentPriorities: segmentPriorities ?? []
  });
  const allowedSegments = new Set(editBudget?.editableSegments ?? []);
  const eligibleScoredEdits = scoredEdits.filter((edit) => !allowedSegments.size || allowedSegments.has(edit.segmentId));
  const finalScoredEdits = eligibleScoredEdits.length || !allowedSegments.size ? eligibleScoredEdits : scoredEdits;
  const selectionResult = selectBudgetedMicroEdits({
    scoredEdits: finalScoredEdits,
    policy: effectivePolicy
  });
  const selectedEdits = selectionResult.selected.map(asOpportunity);
  const totalExpectedGain = selectionResult.totalExpectedSimilarityGain;

  return {
    reviewCaseId: "",
    selectedEdits,
    totalExpectedGain,
    safe: selectedEdits.length > 0 && selectedEdits.every((opportunity) => opportunity.riskLevel === "low"),
    scoredEdits: finalScoredEdits,
    selectionResult,
    editBudgetPolicy: effectivePolicy
  };
}
