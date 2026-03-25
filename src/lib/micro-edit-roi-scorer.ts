import { MICRO_EDIT_ROI_THRESHOLDS } from "@/lib/micro-edit-roi-thresholds";
import type {
  DirectionConflictProbe,
  MicroEditOpportunity,
  MicroEditROI,
  ReactionBand,
  SegmentPriority
} from "@/lib/types";
import type { SimilarityScore } from "@/lib/similarity-evaluator";
import type { NaturalnessScore } from "@/lib/types";

function clamp(value: number, min = 0, max = 10) {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function findSegmentPriority(segmentPriorities: SegmentPriority[], segmentId: string) {
  return segmentPriorities.find((segment) => segment.segmentId === segmentId);
}

function baseGainForType(type: MicroEditOpportunity["type"]) {
  return MICRO_EDIT_ROI_THRESHOLDS.typeWeights[type].similarity;
}

function directionBoost(type: MicroEditOpportunity["type"], directionProbe?: DirectionConflictProbe) {
  if (!directionProbe?.conflictDetected) return 0;
  if (type === "instruction_reorder") return directionProbe.confidence >= 0.7 ? 1.6 : 1.1;
  if (type === "boundary_soften") return directionProbe.confidence >= 0.7 ? 0.9 : 0.5;
  if (type === "clarity_improve") return 0.7;
  return 0.2;
}

function reactionBandBias(reactionBand: ReactionBand, type: MicroEditOpportunity["type"]) {
  if (reactionBand === "guarded_targeted") {
    if (type === "tone_soften" || type === "boundary_soften") return 0.7;
    if (type === "redundancy_cleanup") return 0.4;
  }
  if (reactionBand === "partial_targeted") {
    if (type === "instruction_reorder") return 1.1;
    if (type === "clarity_improve") return 0.8;
    if (type === "boundary_soften") return 0.5;
  }
  if (reactionBand === "cluster_targeted") {
    if (type === "instruction_reorder") return 1.3;
    if (type === "clarity_improve") return 0.9;
  }
  return 0;
}

function similarityContextBoost(similarityBefore: SimilarityScore, type: MicroEditOpportunity["type"]) {
  if (type === "instruction_reorder" && similarityBefore.overall >= 80) return 1.2;
  if (type === "boundary_soften" && similarityBefore.boundary >= 80) return 0.8;
  if (type === "tone_soften" && similarityBefore.style >= 80) return 0.6;
  if (type === "clarity_improve" && similarityBefore.reasoningMatch >= 70) return 0.9;
  if (type === "redundancy_cleanup") return similarityBefore.overall >= 90 ? 0.5 : 0.2;
  return 0.2;
}

function priorityConflictBoost(similarityBefore: SimilarityScore, directionProbe?: DirectionConflictProbe) {
  return Boolean(directionProbe?.conflictDetected && similarityBefore.priority >= 70);
}

function naturalnessContextBoost(naturalnessBefore: NaturalnessScore, type: MicroEditOpportunity["type"]) {
  const naturalnessGap = Math.max(0, 100 - naturalnessBefore.overall);
  if (type === "tone_soften") return Math.min(2.8, 1 + naturalnessGap / 30);
  if (type === "boundary_soften") return Math.min(2.4, 0.8 + naturalnessGap / 36);
  if (type === "instruction_reorder") return Math.min(1.8, 0.6 + naturalnessGap / 45);
  if (type === "redundancy_cleanup") return Math.min(4.0, 1.4 + naturalnessGap / 18);
  if (type === "clarity_improve") return Math.min(2.2, 0.9 + naturalnessGap / 40);
  return 0.5;
}

function riskPenaltyForType(type: MicroEditOpportunity["type"], preservePriority: number, directionProbe?: DirectionConflictProbe) {
  const preservePenalty = preservePriority > 80 ? (preservePriority - 80) / 8 : 0;
  const directionPenalty = directionProbe?.conflictDetected && directionProbe.confidence >= 0.8 ? 0.6 : 0;
  const baseRisk =
    type === "instruction_reorder"
      ? 1.3
      : type === "boundary_soften"
        ? 0.9
        : type === "tone_soften"
          ? 0.7
          : type === "clarity_improve"
            ? 0.8
            : 0.4;
  return clamp(baseRisk + preservePenalty + directionPenalty, 0, 10);
}

function tailRiskInstructionBoost(similarityBefore: SimilarityScore, directionProbe?: DirectionConflictProbe) {
  const mixedPriorityTail = directionProbe?.conflictDetected && similarityBefore.priority >= 70 && similarityBefore.overall < 85;
  const wrongReasoningTail = directionProbe?.conflictDetected && similarityBefore.reasoningMatch >= 78 && similarityBefore.overall >= 76;
  return {
    instruction: (mixedPriorityTail ? 2.8 : 0) + (wrongReasoningTail ? 1.4 : 0),
    boundary: (mixedPriorityTail ? -1.3 : 0) + (wrongReasoningTail ? -0.8 : 0),
    clarity: mixedPriorityTail ? -0.6 : 0
  };
}

function budgetCostForType(type: MicroEditOpportunity["type"]) {
  return MICRO_EDIT_ROI_THRESHOLDS.typeWeights[type].budget;
}

export function scoreMicroEditROI({
  opportunities,
  reactionBand,
  similarityBefore,
  naturalnessBefore,
  directionProbe,
  segmentPriorities
}: {
  opportunities: MicroEditOpportunity[];
  reactionBand: ReactionBand;
  similarityBefore: SimilarityScore;
  naturalnessBefore: NaturalnessScore;
  directionProbe?: DirectionConflictProbe;
  segmentPriorities: SegmentPriority[];
}): MicroEditROI[] {
  const isPriorityConflict = priorityConflictBoost(similarityBefore, directionProbe);
  const isHighSimilarityWrongReasoning = Boolean(directionProbe?.conflictDetected && similarityBefore.overall >= 78);
  const tailBoost = tailRiskInstructionBoost(similarityBefore, directionProbe);
  return opportunities.map((opportunity) => {
    const priority = findSegmentPriority(segmentPriorities, opportunity.segmentId);
    const preservePriority = priority?.preservePriority ?? 50;
    const expectedSimilarityGain = clamp(
      baseGainForType(opportunity.type) +
        similarityContextBoost(similarityBefore, opportunity.type) +
        directionBoost(opportunity.type, directionProbe) +
        reactionBandBias(reactionBand, opportunity.type) +
        (opportunity.type === "instruction_reorder" && similarityBefore.overall >= 75 ? 0.8 : 0) +
        (opportunity.type === "instruction_reorder" ? tailBoost.instruction : 0) +
        (opportunity.type === "clarity_improve" && similarityBefore.reasoningMatch >= 75 ? 0.7 : 0) +
        (opportunity.type === "clarity_improve" && isPriorityConflict ? -1.0 : 0) +
        (opportunity.type === "clarity_improve" ? tailBoost.clarity : 0) +
        (opportunity.type === "boundary_soften" && isPriorityConflict ? 1.2 : 0) +
        (opportunity.type === "boundary_soften" ? tailBoost.boundary : 0) +
        (opportunity.type === "boundary_soften" && isHighSimilarityWrongReasoning ? 0.4 : 0) +
        (opportunity.type === "clarity_improve" && isHighSimilarityWrongReasoning ? -0.6 : 0)
    );
    const expectedNaturalnessGain = clamp(
      naturalnessContextBoost(naturalnessBefore, opportunity.type) +
        (opportunity.type === "tone_soften" ? 0.4 : 0) +
        (opportunity.type === "boundary_soften" ? 0.4 : 0)
    );
    const riskPenalty = clamp(
      riskPenaltyForType(opportunity.type, preservePriority, directionProbe) +
        (reactionBand === "guarded_targeted" ? 0.3 : reactionBand === "partial_targeted" ? 0.1 : 0) +
        (opportunity.type === "clarity_improve" && isPriorityConflict ? 0.5 : 0)
    );
    const budgetCost = budgetCostForType(opportunity.type);
    const roiScore = round1(
      expectedSimilarityGain * MICRO_EDIT_ROI_THRESHOLDS.gainWeights.similarity +
        expectedNaturalnessGain * MICRO_EDIT_ROI_THRESHOLDS.gainWeights.naturalness -
        riskPenalty * MICRO_EDIT_ROI_THRESHOLDS.gainWeights.risk -
        budgetCost * MICRO_EDIT_ROI_THRESHOLDS.gainWeights.budget
    );

    return {
      segmentId: opportunity.segmentId,
      type: opportunity.type,
      expectedSimilarityGain,
      expectedNaturalnessGain,
      riskPenalty,
      budgetCost,
      roiScore,
      rationale:
        opportunity.type === "instruction_reorder" && directionProbe?.conflictDetected
          ? "Instruction order is misaligned with the teacher direction, so this edit has high similarity ROI."
          : opportunity.type === "boundary_soften"
            ? "Boundary pressure can be softened with low risk, improving both similarity and naturalness."
            : opportunity.type === "tone_soften"
              ? "Tone is slightly harsh, so a small softening yields reliable naturalness gain."
              : opportunity.type === "redundancy_cleanup"
                ? "Redundancy can be removed safely for a clean naturalness bump."
                : "The wording is unclear but fixable with a low-risk clarity edit."
    };
  });
}
