import type { SimilarityDiff } from "@/lib/diff-analyzer";
import type { SimilarityScore } from "@/lib/similarity-evaluator";
import { WRITEBACK_THRESHOLDS } from "@/lib/writeback-thresholds";
import type { WritebackDecision } from "@/lib/types";

export type DiffResult = SimilarityDiff;

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function allDiffsLow(diffs: DiffResult[]) {
  return diffs.length > 0 && diffs.every((diff) => diff.severity === WRITEBACK_THRESHOLDS.lowSeverityGuard);
}

function onlyStyleDiffsWithHighCoreScore(similarity: SimilarityScore, diffs: DiffResult[]) {
  if (!diffs.length) return false;
  if (!diffs.every((diff) => diff.category === "style" && diff.severity !== "medium" && diff.severity !== "high")) return false;
  return (
    similarity.decision >= WRITEBACK_THRESHOLDS.styleOnlyFloor &&
    similarity.priority >= WRITEBACK_THRESHOLDS.styleOnlyFloor &&
    similarity.boundary >= WRITEBACK_THRESHOLDS.styleOnlyFloor
  );
}

export function evaluateWritebackDecision({
  similarity,
  diffs
}: {
  similarity: SimilarityScore;
  diffs: DiffResult[];
}): WritebackDecision {
  const nearPerfect =
    similarity.overall >= WRITEBACK_THRESHOLDS.nearPerfectOverall &&
    similarity.decision >= WRITEBACK_THRESHOLDS.nearPerfectDecision &&
    similarity.boundary >= WRITEBACK_THRESHOLDS.nearPerfectBoundary;

  if (nearPerfect) {
    return {
      shouldWriteBack: false,
      reason: "near_perfect_guard",
      blockedCategories: unique(diffs.map((diff) => diff.category))
    };
  }

  if (allDiffsLow(diffs)) {
    return {
      shouldWriteBack: false,
      reason: "low_confidence_diff",
      blockedCategories: unique(diffs.map((diff) => diff.category))
    };
  }

  if (onlyStyleDiffsWithHighCoreScore(similarity, diffs)) {
    return {
      shouldWriteBack: false,
      reason: "low_confidence_diff",
      blockedCategories: ["style"]
    };
  }

  return {
    shouldWriteBack: true,
    reason: "real_correction_needed"
  };
}

export function explainWhyWritebackWasSkipped(decision: WritebackDecision, similarity: SimilarityScore, diffs: DiffResult[]) {
  if (decision.shouldWriteBack) {
    return "Writeback is allowed because the case still shows meaningful divergence from the teacher baseline.";
  }

  if (decision.reason === "near_perfect_guard") {
    return `Skipped because the case is already near-perfect: overall ${similarity.overall.toFixed(0)}, decision ${similarity.decision.toFixed(0)}, boundary ${similarity.boundary.toFixed(0)}.`;
  }

  if (decision.reason === "low_confidence_diff") {
    const categories = decision.blockedCategories?.length ? decision.blockedCategories.join(", ") : unique(diffs.map((diff) => diff.category)).join(", ");
    return `Skipped because the remaining diffs are too weak or style-only (${categories || "none"}). The core decision path is already close enough to avoid churn.`;
  }

  return "Skipped because no meaningful correction signal was detected.";
}
