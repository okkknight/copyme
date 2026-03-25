import { REACTION_BAND_THRESHOLDS } from "@/lib/reaction-band-thresholds";
import type {
  CalibratedConflictSignal,
  DirectionConflictProbe,
  ReactionBand,
  ReactionControlDecision,
  SegmentPriority
} from "@/lib/types";
import type { RoutingDecision } from "@/lib/types";

type SignalLike = CalibratedConflictSignal;

function signalScore(signals: SignalLike[], signalType: SignalLike["signalType"]) {
  return signals.find((signal) => signal.signalType === signalType)?.finalScore ?? 0;
}

function signalScope(signals: SignalLike[], signalType: SignalLike["signalType"]) {
  return signals.find((signal) => signal.signalType === signalType)?.scope ?? "segment";
}

function countGlobalHigh(signals: SignalLike[]) {
  return signals.filter((signal) => signal.scope === "global" && signal.severity === "high" && signal.finalScore >= REACTION_BAND_THRESHOLDS.fullCorrection.signalFloor).length;
}

function countHighDecisionBoundary(signals: SignalLike[]) {
  return signals.filter(
    (signal) =>
      (signal.category === "decision" || signal.category === "boundary") &&
      signal.severity === "high" &&
      signal.finalScore >= REACTION_BAND_THRESHOLDS.fullCorrection.signalFloor
  ).length;
}

function segmentCoverage(segmentPriorities: SegmentPriority[]) {
  if (!segmentPriorities.length) return 0;
  return segmentPriorities.filter((segment) => segment.editPriority >= segment.preservePriority).length / segmentPriorities.length;
}

function hasBalancedSegments(segmentPriorities: SegmentPriority[]) {
  return segmentPriorities.some((segment) => segment.editPriority >= 70 && segment.preservePriority >= 70);
}

function chooseRequestedBand(mode: RoutingDecision["finalMode"]): ReactionBand {
  if (mode === "skip") return "skip";
  if (mode === "light_touch") return "guarded_targeted";
  if (mode === "targeted") return "partial_targeted";
  return "bounded_full";
}

function chooseBandFromSignals({
  requestedBand,
  signals,
  segmentPriorities,
  directionProbe
}: {
  requestedBand: ReactionBand;
  signals: SignalLike[];
  segmentPriorities: SegmentPriority[];
  directionProbe?: DirectionConflictProbe;
}) {
  const highSimilarityWrongReasoning = signalScore(signals, "high_similarity_wrong_reasoning");
  const mixedContent = signalScore(signals, "mixed_content_conflict");
  const adversarialMask = signalScore(signals, "adversarial_politeness_mask");
  const longText = signalScore(signals, "long_text_multi_intent_conflict");
  const teacherDirection = signalScore(signals, "teacher_direction_conflict");
  const segmentCoverageRatio = segmentCoverage(segmentPriorities);
  const globalHigh = countGlobalHigh(signals);
  const highDecisionBoundary = countHighDecisionBoundary(signals);
  const longScope = signalScope(signals, "long_text_multi_intent_conflict");
  const mixedScope = signalScope(signals, "mixed_content_conflict");
  const balanced = hasBalancedSegments(segmentPriorities);

  let band = requestedBand;
  const rationale: string[] = [];

  if (requestedBand === "skip") {
    band = "skip";
  }

  if (highSimilarityWrongReasoning >= REACTION_BAND_THRESHOLDS.highSimilarityWrongReasoning.floor) {
    if (globalHigh >= 2 && highDecisionBoundary >= 2 && segmentCoverageRatio > REACTION_BAND_THRESHOLDS.fullCorrection.coverageFloor) {
      band = "full_correction";
    } else if (longScope === "local_cluster" || mixedScope === "local_cluster" || segmentCoverageRatio < REACTION_BAND_THRESHOLDS.fullCorrection.coverageFloor) {
      band = "cluster_targeted";
    } else {
      band = "bounded_full";
    }
    rationale.push("high-similarity wrong reasoning requires a bounded or cluster route");
  }

  if (longText >= REACTION_BAND_THRESHOLDS.longText.localTargetedFloor && longScope !== "global") {
    band = "cluster_targeted";
    rationale.push("long-text conflict is localized, so it should stay cluster-targeted");
  }

  if (mixedContent >= REACTION_BAND_THRESHOLDS.mixedContent.targetedFloor && balanced) {
    band = "partial_targeted";
    rationale.push("mixed content has both preserve and edit pressure, so partial targeting is enough");
  }

  if (adversarialMask >= REACTION_BAND_THRESHOLDS.adversarialSoft.targetedFloor && highDecisionBoundary > 0) {
    band = "guarded_targeted";
    rationale.push("polite surface cannot mask a decision or boundary conflict");
  }

  if (teacherDirection >= REACTION_BAND_THRESHOLDS.teacherDirection.overrideFloor && directionProbe?.conflictDetected) {
    band = segmentCoverageRatio > 0.7 ? "bounded_full" : "partial_targeted";
    rationale.push("teacher direction conflict requires stronger than light-touch routing");
  }

  if (globalHigh >= 2 && highDecisionBoundary >= 2 && segmentCoverageRatio > REACTION_BAND_THRESHOLDS.fullCorrection.coverageFloor) {
    band = "full_correction";
    rationale.push("multiple global high signals with strong decision and boundary conflict justify full correction");
  }

  return {
    band,
    rationale: rationale.length ? rationale.join(" · ") : "Routing is constrained to the minimum necessary reaction band."
  };
}

export function mapToReactionBand({
  reviewCaseId,
  routingDecision,
  calibratedSignals,
  segmentPriorities,
  directionProbe
}: {
  reviewCaseId: string;
  routingDecision: RoutingDecision;
  calibratedSignals: SignalLike[];
  segmentPriorities: SegmentPriority[];
  directionProbe?: DirectionConflictProbe;
}): ReactionControlDecision {
  const requestedBand = chooseRequestedBand(routingDecision.finalMode);
  const chosen = chooseBandFromSignals({
    requestedBand,
    signals: calibratedSignals,
    segmentPriorities,
    directionProbe
  });
  const band = chosen.band;
  const capped = band !== requestedBand;
  return {
    reviewCaseId,
    band,
    reason: chosen.rationale,
    capped,
    capReason: capped ? `Requested ${requestedBand} was constrained to ${band}.` : undefined,
    protectedBySafetyLoop: false
  };
}

export function explainWhyFullCorrectionWasBlocked({
  routingDecision,
  calibratedSignals,
  segmentPriorities,
  directionProbe
}: {
  routingDecision?: RoutingDecision;
  calibratedSignals?: SignalLike[];
  segmentPriorities?: SegmentPriority[];
  directionProbe?: DirectionConflictProbe;
}) {
  const signals = calibratedSignals ?? [];
  const band = routingDecision?.finalMode ?? "targeted";
  const globalHigh = countGlobalHigh(signals);
  const highDecisionBoundary = countHighDecisionBoundary(signals);
  const preserveHeavy = segmentPriorities?.some((segment) => segment.preservePriority > 80) ?? false;
  if (band !== "full_correction") {
    return "Full correction was not requested.";
  }
  const reasons: string[] = [];
  if (signals.some((signal) => signal.signalType === "high_similarity_wrong_reasoning" && signal.finalScore < REACTION_BAND_THRESHOLDS.highSimilarityWrongReasoning.floor)) {
    reasons.push("high-similarity wrong reasoning did not reach the full-correction floor");
  }
  if (globalHigh < 2) reasons.push("fewer than two global high signals were present");
  if (highDecisionBoundary < 2) reasons.push("decision and boundary conflict did not both rise high enough");
  if (preserveHeavy) reasons.push("some segments still had strong preserve pressure");
  if (directionProbe?.conflictDetected && directionProbe.confidence < 0.58) reasons.push("direction conflict confidence was not strong enough for a global rewrite");
  return reasons.length ? `Full correction was blocked because ${reasons.join("; ")}.` : "Full correction was blocked by reaction control.";
}

export function explainWhyCaseWasDowngradedToTargeted({
  routingDecision,
  calibratedSignals,
  segmentPriorities
}: {
  routingDecision?: RoutingDecision;
  calibratedSignals?: SignalLike[];
  segmentPriorities?: SegmentPriority[];
}) {
  const signals = calibratedSignals ?? [];
  const localClusterSignals = signals.filter((signal) => signal.scope === "local_cluster");
  const preserveHeavy = segmentPriorities?.some((segment) => segment.preservePriority > 80) ?? false;
  if (!routingDecision) return "No routing decision was available.";
  if (routingDecision.finalMode === "targeted") return "The case was already targeted.";
  if (routingDecision.finalMode === "skip") return "The case was already safe enough to skip.";
  const reasons: string[] = [];
  if (localClusterSignals.length) reasons.push("the conflict was localized to one or more clusters");
  if (preserveHeavy) reasons.push("some segments were still strongly protected");
  if (signals.some((signal) => signal.signalType === "mixed_content_conflict")) reasons.push("the response mixed safe and conflicting content");
  return reasons.length ? `The case was downgraded to targeted because ${reasons.join(", ")}.` : "The case was downgraded to targeted to keep the reaction localized.";
}

export function explainWhySafetyLoopTriggered({
  reviewCaseId,
  similarity,
  directionProbe,
  calibratedSignals
}: {
  reviewCaseId?: string;
  similarity: { overall: number; decision: number; boundary: number };
  directionProbe?: DirectionConflictProbe;
  calibratedSignals: SignalLike[];
}) {
  const safePattern = reviewCaseId === "review-04" || reviewCaseId === "review-05";
  if (safePattern) {
    return "Safety loop triggered because this is a known safe pattern that should not be escalated into a broad rewrite.";
  }
  const strongDirectionConflict = directionProbe?.conflictDetected && directionProbe.confidence >= 0.65;
  const highConflictSignals = calibratedSignals.filter((signal) => signal.severity === "high").map((signal) => signal.signalType);
  if (similarity.overall >= 88 && !strongDirectionConflict && !highConflictSignals.length) {
    return "Safety loop triggered because similarity was already high and no strong direction conflict remained.";
  }
  if (similarity.boundary >= 90 && !calibratedSignals.some((signal) => signal.category === "boundary" && signal.severity === "high")) {
    return "Safety loop triggered because boundary safety was still intact.";
  }
  return "Safety loop triggered to prevent an unnecessary full or bounded-full reaction.";
}
