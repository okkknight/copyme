import { REACTION_CAP_THRESHOLDS } from "@/lib/reaction-cap-thresholds";
import type { CalibratedConflictSignal, ReactionControlDecision, SegmentPriority } from "@/lib/types";

type SignalLike = CalibratedConflictSignal;

function bandRank(band: ReactionControlDecision["band"]) {
  return {
    skip: 0,
    guarded_targeted: 1,
    partial_targeted: 2,
    cluster_targeted: 3,
    bounded_full: 4,
    full_correction: 5
  }[band];
}

function stricterBand(left: ReactionControlDecision["band"], right: ReactionControlDecision["band"]) {
  return bandRank(left) >= bandRank(right) ? left : right;
}

function countEditableSignals(signals: SignalLike[]) {
  return signals.filter((signal) => signal.scope !== "global").length;
}

function countHighDecisionBoundary(signals: SignalLike[]) {
  return signals.filter((signal) => (signal.category === "decision" || signal.category === "boundary") && signal.severity === "high").length;
}

export function applyReactionCap({
  reactionDecision,
  calibratedSignals,
  segmentPriorities,
  similarity
}: {
  reactionDecision: ReactionControlDecision;
  calibratedSignals: SignalLike[];
  segmentPriorities: SegmentPriority[];
  similarity?: number;
}): ReactionControlDecision {
  let band = reactionDecision.band;
  let capped = reactionDecision.capped;
  let capReason = reactionDecision.capReason;

  const wrongReasoningHigh = calibratedSignals.find(
    (signal) => signal.signalType === "high_similarity_wrong_reasoning" && signal.severity === "high" && signal.finalScore >= REACTION_CAP_THRESHOLDS.highSimilarity
  );
  const localCluster = calibratedSignals.some((signal) => signal.scope === "local_cluster");
  const preserveHeavy = segmentPriorities.some((segment) => segment.preservePriority > REACTION_CAP_THRESHOLDS.preservePriority);
  const editableSegments = segmentPriorities.filter((segment) => segment.editPriority >= segment.preservePriority).length;
  const editableRatio = segmentPriorities.length ? editableSegments / segmentPriorities.length : 0;
  const highDecisionBoundary = countHighDecisionBoundary(calibratedSignals);
  const editableSignals = countEditableSignals(calibratedSignals);

  if (wrongReasoningHigh && similarity !== undefined && similarity >= REACTION_CAP_THRESHOLDS.highSimilarity && band === "full_correction") {
    band = "bounded_full";
    capped = true;
    capReason = `High-similarity wrong reasoning was capped from full correction to bounded full because similarity stayed at ${similarity.toFixed(0)}.`;
  }

  if (localCluster) {
    if (band === "full_correction") {
      band = "cluster_targeted";
      capped = true;
      capReason = `Local cluster conflict was capped to cluster-targeted routing to keep the rewrite localized.`;
    }
  }

  if (preserveHeavy && band === "full_correction") {
    band = "bounded_full";
    capped = true;
    capReason = `High preserve pressure prevented a full rewrite.`;
  }

  if (editableRatio < REACTION_CAP_THRESHOLDS.minimumEditableRatioForFullCorrection && band === "full_correction") {
    band = editableSignals > 0 ? "bounded_full" : "partial_targeted";
    capped = true;
    capReason = `Editable coverage was too small (${Math.round(editableRatio * 100)}%), so the reaction was capped.`;
  }

  if (highDecisionBoundary >= 2 && band === "bounded_full" && similarity !== undefined && similarity >= REACTION_CAP_THRESHOLDS.highSimilarity) {
    band = "cluster_targeted";
    capped = true;
    capReason = `Decision and boundary pressure remained high, so the bounded full reaction was narrowed to cluster-targeted.`;
  }

  return {
    ...reactionDecision,
    band,
    capped,
    capReason
  };
}

export function explainWhyFullCorrectionWasBlockedByCap({
  reactionDecision,
  calibratedSignals,
  segmentPriorities,
  similarity
}: {
  reactionDecision: ReactionControlDecision;
  calibratedSignals: SignalLike[];
  segmentPriorities: SegmentPriority[];
  similarity?: number;
}) {
  const capped = applyReactionCap({
    reactionDecision,
    calibratedSignals,
    segmentPriorities,
    similarity
  });
  if (capped.band === "full_correction") return "Full correction was allowed.";
  return capped.capReason ?? "Full correction was blocked by reaction cap.";
}

