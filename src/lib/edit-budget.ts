import { REACTION_CAP_THRESHOLDS } from "@/lib/reaction-cap-thresholds";
import type { ReactionBand, ReactionEditBudget, SegmentPriority } from "@/lib/types";

function parseSegmentOrder(segmentId: string) {
  const match = segmentId.match(/(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function sortEditableSegments(segmentPriorities: SegmentPriority[]) {
  return [...segmentPriorities].sort((left, right) => {
    const priorityDelta = right.editPriority - left.editPriority;
    if (priorityDelta !== 0) return priorityDelta;
    const preserveDelta = left.preservePriority - right.preservePriority;
    if (preserveDelta !== 0) return preserveDelta;
    return parseSegmentOrder(left.segmentId) - parseSegmentOrder(right.segmentId);
  });
}

function pickCluster(segmentPriorities: SegmentPriority[]) {
  if (!segmentPriorities.length) return [];
  const sorted = [...segmentPriorities].sort((left, right) => parseSegmentOrder(left.segmentId) - parseSegmentOrder(right.segmentId));
  const leader = [...segmentPriorities].sort((left, right) => right.editPriority - left.editPriority)[0];
  if (!leader) return [];
  const leaderIndex = sorted.findIndex((segment) => segment.segmentId === leader.segmentId);
  const cluster: SegmentPriority[] = [];
  for (const offset of [-1, 0, 1]) {
    const candidate = sorted[leaderIndex + offset];
    if (!candidate) continue;
    if (candidate.editPriority >= candidate.preservePriority || Math.abs(candidate.editPriority - leader.editPriority) <= 12) {
      cluster.push(candidate);
    }
  }
  if (!cluster.length) cluster.push(leader);
  return cluster;
}

export function computeEditBudget({
  reactionBand,
  segmentPriorities
}: {
  reactionBand: ReactionBand;
  segmentPriorities: SegmentPriority[];
}): ReactionEditBudget {
  if (!segmentPriorities.length || reactionBand === "skip") {
    return {
      maxEdits: 0,
      editableSegments: []
    };
  }

  const sorted = sortEditableSegments(segmentPriorities);
  const total = segmentPriorities.length;
  const topCandidates = sorted.filter((segment) => segment.editPriority >= segment.preservePriority || segment.editPriority >= 58);
  const filteredBySafety = sorted.filter((segment) => segment.preservePriority <= 80 || reactionBand === "full_correction");

  if (reactionBand === "guarded_targeted") {
    return {
      maxEdits: 1,
      editableSegments: filteredBySafety.slice(0, 1).map((segment) => segment.segmentId)
    };
  }

  if (reactionBand === "partial_targeted") {
    const maxEdits = Math.max(1, Math.ceil(total * 0.3));
    return {
      maxEdits,
      editableSegments: filteredBySafety.slice(0, maxEdits).map((segment) => segment.segmentId)
    };
  }

  if (reactionBand === "cluster_targeted") {
    const cluster = pickCluster(segmentPriorities).filter((segment) => segment.preservePriority <= REACTION_CAP_THRESHOLDS.preservePriority);
    return {
      maxEdits: Math.max(1, cluster.length || Math.ceil(total * 0.35)),
      editableSegments: (cluster.length ? cluster : topCandidates.slice(0, Math.max(1, Math.ceil(total * 0.35)))).map((segment) => segment.segmentId)
    };
  }

  if (reactionBand === "bounded_full") {
    const maxEdits = Math.max(1, Math.floor(total * REACTION_CAP_THRESHOLDS.boundedFullPreserveRatio));
    return {
      maxEdits,
      editableSegments: filteredBySafety.slice(0, maxEdits).map((segment) => segment.segmentId)
    };
  }

  return {
    maxEdits: Math.max(1, total),
    editableSegments: sorted.map((segment) => segment.segmentId)
  };
}
