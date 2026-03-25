import { HYPOTHESIS_EVOLUTION_THRESHOLDS, RULE_REPLACEMENT_THRESHOLDS } from "@/lib/evolution-thresholds";
import { CompetitionCandidateScore, buildCompetitionCandidateScores, evaluateCompetitionWinner } from "@/lib/rule-competition-groups";
import { deriveTopicKeyFromRuleText } from "@/lib/hypothesis-generation";
import { aggregateLayeredPressureMemory, describeLayeredPressureMemory } from "@/lib/layered-memory";
import {
  ECOLOGY_CHALLENGE_THRESHOLDS,
  ECOLOGY_DOMINANCE_THRESHOLDS,
  ECOLOGY_REPLACEMENT_RISK_THRESHOLDS
} from "@/lib/ecology-thresholds";
import { COOLDOWN_THRESHOLDS } from "@/lib/recovery-thresholds";
import { STABILIZATION_TURNOVER_THRESHOLDS } from "@/lib/stabilization-thresholds";
import { TEMPORAL_REPLACEMENT_THRESHOLDS } from "@/lib/temporal-thresholds";
import type {
  CompetitionGroupEcology,
  CompetitionRoundRecord,
  HypothesisRule,
  PersonaRule,
  RuleAggregateStats,
  RuleCompetitionGroup,
  RuleCompetitionStats,
  RuleContradiction,
  RuleEcologyStats,
  RuleTemporalStats,
  RuleReplacementRecord,
  ReviewSignal,
  ReviewSignalApplication,
  AppState
} from "@/lib/types";

function nowIso() {
  return new Date().toISOString();
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function uniqueById<T extends { id: string }>(values: T[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value.id)) return false;
    seen.add(value.id);
    return true;
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function evaluateRuleReplacement({
  rules,
  hypothesisRules,
  groups,
  candidateScores,
  contradictions,
  temporalStats,
  competitionRoundRecords,
  ecologyStats,
  competitionGroupEcology
}: {
  rules: PersonaRule[];
  hypothesisRules: HypothesisRule[];
  groups: RuleCompetitionGroup[];
  candidateScores: Map<string, CompetitionCandidateScore>;
  aggregateStats: RuleAggregateStats[];
  competitionStats: RuleCompetitionStats[];
  contradictions: RuleContradiction[];
  reviewSignals: ReviewSignal[];
  reviewSignalApplications: ReviewSignalApplication[];
  temporalStats: RuleTemporalStats[];
  competitionRoundRecords: CompetitionRoundRecord[];
  ecologyStats: RuleEcologyStats[];
  competitionGroupEcology: CompetitionGroupEcology[];
}) {
  const nextRules = [...rules];
  const nextHypotheses = [...hypothesisRules];
  const nextGroups = groups.map((group) => ({ ...group }));
  const replacementRecords: RuleReplacementRecord[] = [];
  const temporalByRuleId = new Map(temporalStats.map((stats) => [stats.ruleId, stats]));
  const ecologyByRuleId = new Map(ecologyStats.map((stats) => [stats.ruleId, stats]));
  const groupEcologyById = new Map(competitionGroupEcology.map((stats) => [stats.competitionGroupId, stats]));

  for (const group of nextGroups) {
    const candidates = group.ruleIds
      .map((id) => candidateScores.get(id))
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
      .sort((left, right) => right.survivabilityScore - left.survivabilityScore || right.confidenceScore - left.confidenceScore);

    if (!candidates.length) continue;

    const winner = candidates[0];
    const runnerUp = candidates[1];
    const winnerRule = nextRules.find((rule) => rule.id === winner.id);
    const winnerHypothesis = nextHypotheses.find((hypothesis) => hypothesis.id === winner.id);
    const bestRuleScore = candidates.find((candidate) => candidate.kind === "rule");
    const bestRule = bestRuleScore ? nextRules.find((rule) => rule.id === bestRuleScore.id) : undefined;
    const bestHypothesis = candidates.find((candidate) => candidate.kind === "hypothesis");
    const confidenceGap = winner.confidenceScore - (bestRuleScore?.confidenceScore ?? runnerUp?.confidenceScore ?? 0);
    const scoreGap = winner.survivabilityScore - (bestRuleScore?.survivabilityScore ?? runnerUp?.survivabilityScore ?? 0);
    const winnerTemporal = temporalByRuleId.get(winner.id);
    const ruleTemporal = bestRule ? temporalByRuleId.get(bestRule.id) : undefined;
    const winnerEcology = ecologyByRuleId.get(winner.id);
    const ruleEcology = bestRule ? ecologyByRuleId.get(bestRule.id) : undefined;
    const groupRounds = competitionRoundRecords.filter((round) => round.competitionGroupId === group.id);
    const winnerRecentWins = groupRounds.filter((round) => round.winnerRuleId === winner.id).length;
    const winnerRecentLosses = groupRounds.filter((round) => round.loserRuleIds.includes(winner.id)).length;
    const ruleRecentWins = bestRule ? groupRounds.filter((round) => round.winnerRuleId === bestRule.id).length : 0;
    const ruleRecentLosses = bestRule ? groupRounds.filter((round) => round.loserRuleIds.includes(bestRule.id)).length : 0;
    const groupEcology = groupEcologyById.get(group.id);
    const incumbentRuleId = groupEcology?.incumbentRuleId ?? bestRule?.id;
    const incumbentRule = incumbentRuleId ? nextRules.find((rule) => rule.id === incumbentRuleId) : bestRule;
    const incumbentTemporal = incumbentRule ? temporalByRuleId.get(incumbentRule.id) : undefined;
    const incumbentEcology = incumbentRule ? ecologyByRuleId.get(incumbentRule.id) : undefined;
    const pressureMemory = groupEcology?.pressureMemory ?? incumbentEcology?.inheritedPressure ?? 0;
    const layeredPressureMemory = groupEcology?.layeredPressureMemory ?? incumbentEcology?.layeredPressureImpact;
    const cooldownLevel = groupEcology?.cooldownLevel ?? incumbentEcology?.cooldownPenalty ?? 0;
    const recoveryProgress = groupEcology?.recoveryProgress ?? (incumbentEcology?.recoveryScore ?? 100) / 100;
    const recoveryMode = groupEcology?.recoveryMode ?? incumbentEcology?.recoveryMode ?? "recovering";
    const dominanceConsolidation = groupEcology?.dominanceConsolidation ?? incumbentEcology?.dominanceStrength ?? 0;
    const stabilityInertia = groupEcology?.stabilityInertia ?? incumbentEcology?.hardeningScore ?? 0;
    const contestDampening = groupEcology?.contestDampening ?? Math.max(0, 18 - (groupEcology?.replacementRisk ?? incumbentEcology?.replacementRisk ?? 0) * 0.18);
    const hardeningScore = incumbentEcology?.hardeningScore ?? 0;
    const destabilizationPenalty = incumbentEcology?.destabilizationPenalty ?? 0;
    const layeredDetail = describeLayeredPressureMemory(layeredPressureMemory);
    const layeredAggregate = aggregateLayeredPressureMemory(layeredPressureMemory);
    const lockLift = groupEcology?.lockStatus === "locked" ? 4 : groupEcology?.lockStatus === "breaking" ? -2 : 0;
    const turnoverEase = Math.max(0, ((groupEcology?.turnoverCounter ?? 0) - STABILIZATION_TURNOVER_THRESHOLDS.pressuredMinCounter) * 0.9);
    const pressureEase = Math.max(0, ((groupEcology?.effectivePressure ?? 0) - STABILIZATION_TURNOVER_THRESHOLDS.incumbentBreakEffectivePressure) * 0.25);
    const memoryEase = Math.max(0, pressureMemory - COOLDOWN_THRESHOLDS.pressuredMin) * 0.12;
    const cooldownEase = Math.max(0, cooldownLevel - COOLDOWN_THRESHOLDS.pressuredMin) * 0.16;
    const recoveryShield = recoveryProgress >= COOLDOWN_THRESHOLDS.recoveryProgressStable ? 3 : recoveryProgress * 2;
    const layeredMemoryEase =
      Math.max(0, layeredDetail.reviewShock - COOLDOWN_THRESHOLDS.pressuredMin * 0.4) * 0.08 +
      Math.max(0, layeredDetail.contradictionShock - COOLDOWN_THRESHOLDS.pressuredMin * 0.5) * 0.06 +
      Math.max(0, layeredDetail.turnoverStress - COOLDOWN_THRESHOLDS.pressuredMin * 0.35) * 0.1;
    const consolidationBarrier =
      dominanceConsolidation * 0.03 +
      stabilityInertia * 0.04 +
      contestDampening * 0.02 +
      hardeningScore * 0.02 -
      destabilizationPenalty * 0.015;
    const adjustedScoreGapThreshold = clamp(
      RULE_REPLACEMENT_THRESHOLDS.replacementConfidenceGap + lockLift + consolidationBarrier - turnoverEase - pressureEase - memoryEase - cooldownEase - layeredMemoryEase + recoveryShield +
        (recoveryMode === "stalled" ? 2 : recoveryMode === "slow" ? 1 : 0),
      6,
      18
    );
    const adjustedRepeatedWinsThreshold = clamp(
      TEMPORAL_REPLACEMENT_THRESHOLDS.repeatedWins +
        (groupEcology?.lockStatus === "locked" ? 1 : 0) -
        ((groupEcology?.turnoverCounter ?? 0) >= STABILIZATION_TURNOVER_THRESHOLDS.turnoverMinCounter ? 1 : 0) -
        (pressureMemory >= COOLDOWN_THRESHOLDS.pressuredMin ? 1 : 0) -
        (cooldownLevel >= COOLDOWN_THRESHOLDS.pressuredMin ? 1 : 0) -
        (layeredAggregate >= COOLDOWN_THRESHOLDS.pressuredMin ? 1 : 0) -
        (dominanceConsolidation >= 42 ? 1 : 0) -
        (stabilityInertia >= 28 ? 1 : 0) -
        (recoveryMode === "recovering" || recoveryMode === "stabilized" ? 1 : 0),
      2,
      5
    );
    const adjustedPressureThreshold = clamp(
      STABILIZATION_TURNOVER_THRESHOLDS.incumbentBreakEffectivePressure +
        (groupEcology?.lockStatus === "locked" ? 4 : 0) -
        turnoverEase * 2 -
        pressureEase -
        memoryEase * 1.5 -
        cooldownEase * 1.5 +
        dominanceConsolidation * 0.03 +
        stabilityInertia * 0.04 +
        contestDampening * 0.02 +
        hardeningScore * 0.02 -
        destabilizationPenalty * 0.02 +
        Math.max(0, 1 - recoveryProgress) * 4 +
        layeredMemoryEase * 0.8 +
        (recoveryMode === "stalled" ? 4 : 0),
      14,
      34
    );
    const shouldReplace =
      Boolean(winnerHypothesis) &&
      Boolean(incumbentRule) &&
      groupEcology?.currentLeaderRuleId === winner.id &&
      groupEcology?.incumbentRuleId !== winner.id &&
      winner.survivabilityScore >= RULE_REPLACEMENT_THRESHOLDS.replacementSurvivabilityThreshold &&
      scoreGap >= adjustedScoreGapThreshold &&
      (winnerTemporal?.recentWinRate ?? winner.recentWinRate) >= TEMPORAL_REPLACEMENT_THRESHOLDS.recentWinRate &&
      (winnerTemporal?.momentumScore ?? winner.momentumScore) >= TEMPORAL_REPLACEMENT_THRESHOLDS.momentumScore &&
      Math.max(winnerRecentWins, winnerTemporal?.winCount ?? 0) >= adjustedRepeatedWinsThreshold &&
      (groupEcology?.turnoverCounter ?? 0) >= STABILIZATION_TURNOVER_THRESHOLDS.displacementCounter &&
      (incumbentTemporal?.recentFailureRate ?? ruleTemporal?.recentFailureRate ?? 0) >= TEMPORAL_REPLACEMENT_THRESHOLDS.recentFailureRate &&
      Math.max(ruleRecentLosses, incumbentTemporal?.lossCount ?? 0) >= adjustedRepeatedWinsThreshold &&
      (winnerEcology?.dominanceSpan ?? 0) >= ECOLOGY_DOMINANCE_THRESHOLDS.minimumDominanceSpan &&
      (winnerEcology?.resilienceScore ?? 0) >= ECOLOGY_DOMINANCE_THRESHOLDS.dominantMinResilience &&
      (winnerEcology?.challengePressure ?? 0) < ECOLOGY_CHALLENGE_THRESHOLDS.highChallengePressure &&
      (groupEcology?.effectivePressure ?? 0) >= adjustedPressureThreshold &&
      (incumbentEcology?.resistanceScore ?? 100) <= (groupEcology?.effectivePressure ?? 0) + 12 - consolidationBarrier &&
      (groupEcology?.replacementRisk ?? 0) >= ECOLOGY_REPLACEMENT_RISK_THRESHOLDS.contestedRisk &&
      pressureMemory >= COOLDOWN_THRESHOLDS.pressuredMin &&
      cooldownLevel >= COOLDOWN_THRESHOLDS.pressuredMin &&
      layeredAggregate >= COOLDOWN_THRESHOLDS.pressuredMin * 0.9 &&
      recoveryMode !== "stalled" &&
      (winnerRecentLosses <= 1);

    if (winnerRule) {
      const topicKey = winnerRule.topicKey ?? deriveTopicKeyFromRuleText(winnerRule.text, winnerRule.layer);
      winnerRule.topicKey = topicKey;
      winnerRule.competitionGroupId = group.id;
      winnerRule.lastObservedInSessionId = winnerRule.lastObservedInSessionId ?? winnerRule.sourceSessionIds.at(-1);
    }

    if (winnerHypothesis) {
      winnerHypothesis.competitionGroupId = group.id;
      winnerHypothesis.topicKey = winnerHypothesis.topicKey;
    }

    if (shouldReplace && winnerHypothesis && incumbentRule) {
      const replacedRule = incumbentRule;
      const winningHypothesis = nextHypotheses.find((item) => item.id === winnerHypothesis.id) ?? hypothesisRules.find((item) => item.id === winnerHypothesis.id);
      const replacedRuleText = replacedRule.text;
      const contradictionPressure = contradictions.filter((item) => item.ruleId === replacedRule.id).reduce((sum, contradiction) => sum + (contradiction.severity === "high" ? 2 : contradiction.severity === "medium" ? 1 : 0.5), 0);
      const replacementRecord: RuleReplacementRecord = {
        id: `replacement-${group.id}-${replacedRule.id}-${winnerHypothesis.id}`,
        replacedRuleId: replacedRule.id,
        replacementRuleId: winnerHypothesis.id,
        competitionGroupId: group.id,
        reason: `Hypothesis ${winningHypothesis?.text ?? winnerHypothesis.id} displaced ${replacedRuleText} in ${group.topicKey} after ${groupEcology?.turnoverCounter ?? 0} pressured rounds, ${Math.max(winnerRecentWins, winnerTemporal?.winCount ?? 0)} recent wins, incumbent effective pressure ${(groupEcology?.effectivePressure ?? 0).toFixed(1)}, layered memory ${layeredDetail.summary}, and recent failure rate ${(incumbentTemporal?.recentFailureRate ?? 0).toFixed(2)}.`,
        createdAt: nowIso()
      };
      replacementRecords.push(replacementRecord);

      const replacementStatus = contradictionPressure >= 2 || (bestRuleScore?.contradictionScore ?? 0) >= 2
        ? "invalidated"
        : "deprecated";
      replacedRule.status = replacementStatus;
      replacedRule.replacedByRuleId = winnerHypothesis.id;
      replacedRule.competitionGroupId = group.id;

      winnerHypothesis.status =
        winnerHypothesis.sourceSessionIds.length >= HYPOTHESIS_EVOLUTION_THRESHOLDS.acceptedSourceSessionCount &&
        winnerHypothesis.confidence >= HYPOTHESIS_EVOLUTION_THRESHOLDS.acceptedConfidence
          ? "accepted"
          : winnerHypothesis.confidence >= HYPOTHESIS_EVOLUTION_THRESHOLDS.emergingConfidence
            ? "emerging"
            : "testing";
      winnerHypothesis.replacedByRuleId = replacedRule.id;
      winnerHypothesis.competingRuleIds = unique([...winnerHypothesis.competingRuleIds, replacedRule.id]);

      group.activeRuleId = winnerHypothesis.id;
      group.status = "settled";
      group.winnerRuleId = winnerHypothesis.id;
      group.confidenceGap = confidenceGap;
      group.settled = true;

      for (const candidate of candidates.filter((candidate) => candidate.kind === "hypothesis" && candidate.id !== winnerHypothesis.id)) {
        const hypothesis = nextHypotheses.find((item) => item.id === candidate.id);
        if (hypothesis && hypothesis.status !== "accepted") {
          hypothesis.status = "rejected";
        }
      }
      continue;
    }

    if (winnerRule) {
      const eligibleRule = winnerRule;
      if (eligibleRule.status === "candidate" || eligibleRule.status === "challenged") {
        eligibleRule.status = scoreGap >= RULE_REPLACEMENT_THRESHOLDS.replacementConfidenceGap ? "accepted" : "emerging";
      }
      eligibleRule.competitionGroupId = group.id;
      group.activeRuleId = eligibleRule.id;
      group.winnerRuleId = eligibleRule.id;
      group.confidenceGap = confidenceGap;
      group.status = candidates.length > 1 && confidenceGap >= RULE_REPLACEMENT_THRESHOLDS.replacementConfidenceGap ? "settled" : candidates.length > 1 ? "contested" : "open";
      group.settled = group.status === "settled";

      for (const candidate of candidates.filter((candidate) => candidate.kind === "hypothesis")) {
        const hypothesis = nextHypotheses.find((item) => item.id === candidate.id);
        if (hypothesis && hypothesis.status === "testing") {
          hypothesis.status = candidate.survivabilityScore >= RULE_REPLACEMENT_THRESHOLDS.replacementSurvivabilityThreshold ? "emerging" : "rejected";
        }
      }
    }
  }

  return {
    rules: uniqueById(nextRules),
    hypothesisRules: uniqueById(nextHypotheses),
    ruleCompetitionGroups: uniqueById(nextGroups),
    ruleReplacementRecords: uniqueById(replacementRecords)
  };
}

export function explainWhyHypothesisWon({
  hypothesisId,
  hypothesisRules,
  rules,
  ruleCompetitionGroups,
  ruleReplacementRecords
}: {
  hypothesisId: string;
  hypothesisRules: HypothesisRule[];
  rules: PersonaRule[];
  ruleCompetitionGroups: RuleCompetitionGroup[];
  ruleReplacementRecords: RuleReplacementRecord[];
}) {
  const hypothesis = hypothesisRules.find((item) => item.id === hypothesisId);
  if (!hypothesis) {
    return {
      hypothesisId,
      summary: "No hypothesis found.",
      details: ""
    };
  }

  const group = ruleCompetitionGroups.find((item) => item.id === hypothesis.competitionGroupId);
  const replacement = ruleReplacementRecords.find((item) => item.replacementRuleId === hypothesisId);
  const parentRules = rules.filter((rule) => hypothesis.parentRuleIds.includes(rule.id));
  const competingRules = rules.filter((rule) => hypothesis.competingRuleIds.includes(rule.id));
  const summary =
    replacement?.reason ??
    `Hypothesis ${hypothesis.text} is currently the strongest explanation for ${group?.topicKey ?? hypothesis.topicKey} because it matches the evidence from ${hypothesis.sourceSessionIds.length} session(s).`;

  return {
    hypothesisId,
    summary,
    details: [
      `group=${group?.id ?? "none"}`,
      `topic=${hypothesis.topicKey}`,
      `parents=${parentRules.map((rule) => rule.id).join(", ") || "none"}`,
      `competitors=${competingRules.map((rule) => rule.id).join(", ") || "none"}`,
      `replacement=${replacement ? replacement.replacedRuleId : "none"}`
    ].join(" · "),
    sourceSessionIds: hypothesis.sourceSessionIds,
    sourceIds: hypothesis.sourceIds,
    rationale: hypothesis.rationale
  };
}
