import type { DirectionConflictProbe, ReactionBand } from "@/lib/types";

const LOW_RISK_BANDS = new Set<ReactionBand>(["guarded_targeted", "partial_targeted", "cluster_targeted"]);

export function shouldApplyMicroEdit({
  reactionBand,
  similarity,
  directionProbe,
  safetyTriggered
}: {
  reactionBand: ReactionBand;
  similarity: number;
  directionProbe?: DirectionConflictProbe;
  safetyTriggered: boolean;
}): boolean {
  if (safetyTriggered) return false;
  if (reactionBand === "skip") return false;
  if (!LOW_RISK_BANDS.has(reactionBand)) return false;
  if (similarity < 60) return false;
  if (similarity < 65) return false;
  if (directionProbe?.conflictDetected && directionProbe.confidence >= 0.92) return false;
  return true;
}
