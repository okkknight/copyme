import { MICRO_EDIT_ROI_THRESHOLDS } from "@/lib/micro-edit-roi-thresholds";
import type { EditBudgetPolicy, MicroEditROI, MicroEditSelectionResult } from "@/lib/types";

function sortByValue(left: MicroEditROI, right: MicroEditROI) {
  const roiDelta = right.roiScore - left.roiScore;
  if (roiDelta !== 0) return roiDelta;
  const riskDelta = left.riskPenalty - right.riskPenalty;
  if (riskDelta !== 0) return riskDelta;
  const similarityDelta = right.expectedSimilarityGain - left.expectedSimilarityGain;
  if (similarityDelta !== 0) return similarityDelta;
  const naturalnessDelta = right.expectedNaturalnessGain - left.expectedNaturalnessGain;
  if (naturalnessDelta !== 0) return naturalnessDelta;
  return left.segmentId.localeCompare(right.segmentId);
}

export function selectBudgetedMicroEdits({
  scoredEdits,
  policy
}: {
  scoredEdits: MicroEditROI[];
  policy: EditBudgetPolicy;
}): MicroEditSelectionResult {
  const sorted = [...scoredEdits].sort(sortByValue);
  const selected: MicroEditROI[] = [];
  const rejected: MicroEditROI[] = [];
  let budgetUsed = 0;

  for (const edit of sorted) {
    if (edit.roiScore <= MICRO_EDIT_ROI_THRESHOLDS.minimumRoiScore) {
      rejected.push(edit);
      continue;
    }
    if (selected.length >= policy.maxEdits || budgetUsed + edit.budgetCost > policy.maxBudget) {
      rejected.push(edit);
      continue;
    }
    if (policy.preferSimilarityGain && edit.expectedSimilarityGain < 0.5) {
      rejected.push(edit);
      continue;
    }
    if (policy.preferNaturalnessGain && edit.expectedNaturalnessGain < 0.5 && edit.expectedSimilarityGain < 1.5) {
      rejected.push(edit);
      continue;
    }
    if (selected.some((item) => item.segmentId === edit.segmentId)) {
      rejected.push(edit);
      continue;
    }

    selected.push(edit);
    budgetUsed += edit.budgetCost;
  }

  const totalExpectedSimilarityGain = selected.reduce((sum, edit) => sum + edit.expectedSimilarityGain, 0);
  const totalExpectedNaturalnessGain = selected.reduce((sum, edit) => sum + edit.expectedNaturalnessGain, 0);

  return {
    selected,
    rejected,
    totalExpectedSimilarityGain,
    totalExpectedNaturalnessGain,
    budgetUsed,
    rationale:
      selected.length > 0
        ? `Selected the highest-ROI edits within ${policy.maxBudget} budget and ${policy.maxEdits} edit cap.`
        : "No micro-edit met the ROI threshold under the current budget policy."
  };
}

