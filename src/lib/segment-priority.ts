import { ROUTING_CONFLICT_THRESHOLDS } from "@/lib/routing-conflict-thresholds";
import type {
  CalibratedConflictSignal,
  DirectionConflictProbe,
  LongTextScopeSplit,
  PrecisionSeverityResult,
  RoutingConflictSignal,
  SegmentDiff,
  SegmentPriority
} from "@/lib/types";

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

type SignalLike = RoutingConflictSignal | CalibratedConflictSignal;

function signalValue(signal: SignalLike) {
  return "finalScore" in signal ? signal.finalScore : signal.score;
}

function signalScope(signal: SignalLike) {
  return "scope" in signal ? signal.scope : "segment";
}

function highestConflictScore(signals: SignalLike[], categories: Array<"decision" | "priority" | "style" | "boundary">) {
  return signals.filter((signal) => categories.includes(signal.category)).reduce((max, signal) => Math.max(max, signalValue(signal)), 0);
}

export function buildSegmentPriorities({
  segmentDiffs,
  precisionSeverities,
  conflictSignals,
  calibratedConflictSignals,
  directionProbe,
  longTextScopeSplit
}: {
  segmentDiffs: SegmentDiff[];
  precisionSeverities: PrecisionSeverityResult[];
  conflictSignals: RoutingConflictSignal[];
  calibratedConflictSignals?: CalibratedConflictSignal[];
  directionProbe?: DirectionConflictProbe;
  longTextScopeSplit?: LongTextScopeSplit;
}): SegmentPriority[] {
  const precisionByCategory = new Map(precisionSeverities.map((item) => [item.category, item] as const));
  const routedSignals: SignalLike[] = calibratedConflictSignals?.length ? calibratedConflictSignals : conflictSignals;
  const longTextSignal =
    longTextScopeSplit?.globalSignals.find((signal) => signal.signalType === "long_text_multi_intent_conflict") ??
    routedSignals.find((signal) => signal.signalType === "long_text_multi_intent_conflict");
  const longTextLocalClusters = longTextScopeSplit?.localClusterSignals ?? [];

  return segmentDiffs.map((segment, index) => {
    const precision = precisionByCategory.get(segment.category);
    const conflictScore = highestConflictScore(routedSignals, [segment.category]);
    const highCritical = segment.category === "decision" || segment.category === "boundary";
    const positionBias = segmentDiffs.length > 3 ? Math.max(0, 10 - index * 2) : 0;
    const directionMismatchPenalty =
      directionProbe?.conflictDetected && highCritical
        ? directionProbe.confidence >= 0.58
          ? 14
          : 8
        : 0;
    const localClusterBias = longTextSignal && signalScope(longTextSignal) === "local_cluster" && segment.shouldEdit ? 12 : 0;
    const localPreserveBias =
      longTextSignal && signalScope(longTextSignal) === "local_cluster" && !segment.shouldEdit
        ? 14
        : longTextLocalClusters.length && !segment.shouldEdit
          ? 8
          : 0;
    const baseEdit =
      (segment.shouldEdit ? 42 : 18) +
      (segment.suggestedAction === "rewrite" ? 24 : segment.suggestedAction === "reorder" ? 12 : segment.suggestedAction === "soften" ? 8 : 0) +
      (precision?.severity === "high" ? 18 : precision?.severity === "medium" ? 10 : 0) +
      (highCritical ? 8 : 0) +
      (conflictScore >= 70 ? 16 : conflictScore >= 45 ? 10 : 0) +
      positionBias +
      localClusterBias +
      directionMismatchPenalty;
    const basePreserve =
      (segment.shouldEdit ? 24 : 52) +
      (segment.suggestedAction === "keep" ? 20 : segment.suggestedAction === "soften" ? 12 : 0) +
      (precision?.severity === "low" ? 16 : precision?.severity === "medium" ? 8 : 0) +
      (highCritical ? -12 : 8) +
      (conflictScore >= 70 ? -18 : conflictScore >= 45 ? -10 : 0) +
      localPreserveBias -
      directionMismatchPenalty;

    const editPriority = clamp(Math.round(baseEdit));
    const preservePriority = clamp(Math.round(basePreserve));

    return {
      segmentId: segment.segmentId,
      editPriority,
      preservePriority,
      dominantCategory: segment.category,
      reason:
        directionProbe?.conflictDetected && highCritical
          ? `Teacher direction conflict requires editing this ${segment.category} segment even when the text looks natural.`
          : conflictScore >= ROUTING_CONFLICT_THRESHOLDS.mixedConflict.high
            ? `High conflict routing favors editing this ${segment.category} segment.`
          : precision?.severity === "high" && highCritical
            ? `High precision severity demands editing this ${segment.category} segment.`
            : preservePriority >= editPriority
              ? `This segment is safer to preserve than rewrite.`
              : `This segment carries a localized mismatch and should be prioritized for editing.`
    };
  });
}

export function summarizeSegmentPriorities(segmentPriorities: SegmentPriority[]) {
  if (!segmentPriorities.length) return "no segment priorities";
  return segmentPriorities
    .map((segment) => `${segment.segmentId}:${segment.editPriority}/${segment.preservePriority}/${segment.dominantCategory}`)
    .join(" | ");
}
