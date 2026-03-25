import { CONFLICT_SIGNAL_CALIBRATION_THRESHOLDS } from "@/lib/conflict-signal-calibration-thresholds";
import type { CalibratedConflictSignal, SegmentDiff } from "@/lib/types";

function normalizedSegmentIds(segmentDiffs: SegmentDiff[]) {
  return segmentDiffs.map((segment, index) => ({
    index,
    segmentId: segment.segmentId,
    shouldEdit: segment.shouldEdit,
    severity: segment.severity,
    category: segment.category
  }));
}

function buildClusters(segmentDiffs: SegmentDiff[]) {
  const indexed = normalizedSegmentIds(segmentDiffs);
  const clusters: Array<{ segmentIds: string[]; strength: number; dominantSignal: string }> = [];
  let current: typeof indexed = [];

  const pushCluster = () => {
    if (!current.length) return;
    const segmentIds = current.map((item) => item.segmentId);
    const strength = Math.round(
      current.reduce((sum, item) => sum + (item.shouldEdit ? 24 : 8) + (item.severity === "high" ? 16 : item.severity === "medium" ? 8 : 0), 0) /
        Math.max(1, current.length)
    );
    const dominantSignal = current.some((item) => item.category === "boundary" || item.category === "decision")
      ? "high_similarity_wrong_reasoning"
      : current.some((item) => item.category === "priority")
        ? "mixed_content_conflict"
        : "long_text_multi_intent_conflict";
    clusters.push({
      segmentIds,
      strength,
      dominantSignal
    });
    current = [];
  };

  for (const item of indexed) {
    if (item.shouldEdit || item.severity !== "low") {
      if (!current.length) {
        current.push(item);
        continue;
      }
      const previous = current[current.length - 1];
      if (item.index === previous.index + 1) {
        current.push(item);
      } else {
        pushCluster();
        current.push(item);
      }
    } else {
      pushCluster();
    }
  }
  pushCluster();
  return clusters;
}

export function splitLongTextConflictScope({
  response: _response,
  segmentDiffs,
  conflictSignals
}: {
  response: string;
  segmentDiffs: SegmentDiff[];
  conflictSignals: CalibratedConflictSignal[];
}): {
  globalSignals: CalibratedConflictSignal[];
  localClusterSignals: Array<{
    clusterId: string;
    segmentIds: string[];
    dominantSignal: string;
    strength: number;
  }>;
} {
  const clusters = buildClusters(segmentDiffs);
  const longSignal = conflictSignals.find((signal) => signal.signalType === "long_text_multi_intent_conflict");
  const coverage = segmentDiffs.filter((segment) => segment.shouldEdit).length / Math.max(1, segmentDiffs.length);
  const clusterCoverage = clusters.reduce((sum, cluster) => sum + cluster.segmentIds.length, 0) / Math.max(1, segmentDiffs.length);
  const strongestCluster = clusters.reduce((best, cluster) => (cluster.strength > best.strength ? cluster : best), clusters[0] ?? { strength: 0, segmentIds: [], dominantSignal: "long_text_multi_intent_conflict" });
  const localClusters =
    longSignal && clusters.length
      ? clusters
          .filter((cluster) => cluster.segmentIds.length >= CONFLICT_SIGNAL_CALIBRATION_THRESHOLDS.scopeSplit.localClusterSegmentFloor || cluster.strength >= 36)
          .map((cluster, index) => ({
          clusterId: `cluster-${index + 1}`,
          segmentIds: cluster.segmentIds,
          dominantSignal: cluster.dominantSignal,
          strength: cluster.strength
        }))
      : [];

  const globalSignals = conflictSignals.map((signal) => {
    if (signal.signalType !== "long_text_multi_intent_conflict") return signal;
    const enoughGlobalCoverage =
      coverage >= CONFLICT_SIGNAL_CALIBRATION_THRESHOLDS.scopeSplit.globalCoverageFloor &&
      clusterCoverage >= 0.7 &&
      strongestCluster.strength >= 58;
    if (enoughGlobalCoverage) {
      return {
        ...signal,
        scope: "global" as const,
        finalScore: Math.min(100, Math.max(signal.finalScore, signal.calibrationScore + 4))
      };
    }
    if (localClusters.length || clusterCoverage <= CONFLICT_SIGNAL_CALIBRATION_THRESHOLDS.scopeSplit.localClusterCoverageCeiling) {
      return {
        ...signal,
        scope: "local_cluster" as const,
        finalScore: Math.max(0, signal.finalScore - 10)
      };
    }
    return {
      ...signal,
      scope: "segment" as const,
      finalScore: Math.max(0, signal.finalScore - 4)
    };
  });

  return {
    globalSignals,
    localClusterSignals: localClusters
  };
}
