import { buildCompetitionCandidateScores, evaluateCompetitionWinner } from "@/lib/rule-competition-groups";
import {
  TEMPORAL_COMPETITION_THRESHOLDS,
  TEMPORAL_IDLE_PENALTY,
  TEMPORAL_OUTCOME_WEIGHTS,
  TEMPORAL_RECENT_WINDOW_SIZE,
  TEMPORAL_REPLACEMENT_THRESHOLDS,
  TEMPORAL_TREND_THRESHOLDS,
  TEMPORAL_VOLATILITY_PENALTY,
  TEMPORAL_WEIGHT_DECAY
} from "@/lib/temporal-thresholds";
import type {
  AppState,
  CompetitionRoundRecord,
  HypothesisRule,
  PersonaRule,
  RuleCompetitionGroup,
  RuleEcologyStats,
  RulePerformanceOutcome,
  RulePerformanceRecord,
  RuleTemporalStats,
  RuleTemporalTrend
} from "@/lib/types";

function nowIso() {
  return new Date().toISOString();
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function compareIso(left?: string, right?: string) {
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  return left.localeCompare(right);
}

function uniqueById<T extends { id: string }>(values: T[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value.id)) return false;
    seen.add(value.id);
    return true;
  });
}

function sessionIdFromSources(state: Pick<AppState, "sessions">, sessionIds: string[] = []) {
  const sessions = state.sessions.filter((session) => sessionIds.includes(session.id));
  const latest = sessions
    .slice()
    .sort((left, right) => compareIso(right.endedAt ?? right.startedAt, left.endedAt ?? left.startedAt))
    .at(0);
  return latest?.id ?? sessionIds[0] ?? state.sessions[0]?.id ?? "unknown-session";
}

function outcomeDeltas(outcome: RulePerformanceOutcome) {
  switch (outcome) {
    case "win":
      return { scoreDelta: 12, survivabilityDelta: 10, confidenceDelta: 0.08 };
    case "support":
      return { scoreDelta: 7, survivabilityDelta: 6, confidenceDelta: 0.05 };
    case "challenge":
      return { scoreDelta: -7, survivabilityDelta: -6, confidenceDelta: -0.06 };
    case "loss":
      return { scoreDelta: -13, survivabilityDelta: -11, confidenceDelta: -0.09 };
    case "idle":
    default:
      return { scoreDelta: -1.5, survivabilityDelta: -2.5, confidenceDelta: -0.015 };
  }
}

function outcomeForJudgment(status: "candidate" | "accepted" | "rejected" | "observed"): RulePerformanceOutcome {
  if (status === "rejected") return "challenge";
  if (status === "observed") return "support";
  return "support";
}

function outcomeForContradiction(severity: "low" | "medium" | "high") {
  return severity === "high" ? ("loss" as const) : ("challenge" as const);
}

function outcomeForTrend(trend: RuleTemporalTrend): RulePerformanceOutcome {
  if (trend === "rising") return "win";
  if (trend === "fading") return "loss";
  if (trend === "volatile") return "challenge";
  return "idle";
}

function perfId(parts: string[]) {
  return parts.join("::");
}

function buildJudgmentRecords(state: Pick<AppState, "sessions" | "sessionRuleJudgments">) {
  return state.sessionRuleJudgments.map<RulePerformanceRecord>((judgment) => {
    const session = state.sessions.find((item) => item.id === judgment.sessionId);
    const outcome = outcomeForJudgment(judgment.status);
    const deltas = outcomeDeltas(outcome);
    return {
      id: perfId(["judgment", judgment.id]),
      ruleId: judgment.ruleId,
      sessionId: session?.id ?? judgment.sessionId,
      outcome,
      scoreDelta: deltas.scoreDelta * clamp(judgment.confidence, 0.4, 1),
      survivabilityDelta: deltas.survivabilityDelta * clamp(judgment.confidence, 0.4, 1),
      confidenceDelta: deltas.confidenceDelta,
      reason: judgment.note ?? `Session ${judgment.sessionId} marked rule ${judgment.ruleId} as ${judgment.status}.`,
      createdAt: judgment.updatedAt ?? judgment.createdAt
    };
  });
}

function buildContradictionRecords(state: Pick<AppState, "ruleContradictions" | "sessions">) {
  return state.ruleContradictions.map<RulePerformanceRecord>((contradiction) => {
    const sessionId = contradiction.relatedSessionId ?? sessionIdFromSources(state, contradiction.relatedSessionId ? [contradiction.relatedSessionId] : []);
    const outcome = outcomeForContradiction(contradiction.severity);
    const deltas = outcomeDeltas(outcome);
    const severityScale = contradiction.severity === "high" ? 1.25 : contradiction.severity === "medium" ? 1 : 0.72;
    return {
      id: perfId(["contradiction", contradiction.id]),
      ruleId: contradiction.ruleId,
      sessionId,
      outcome,
      scoreDelta: deltas.scoreDelta * severityScale,
      survivabilityDelta: deltas.survivabilityDelta * severityScale,
      confidenceDelta: deltas.confidenceDelta * severityScale,
      reason: contradiction.summary,
      createdAt: contradiction.createdAt
    };
  });
}

function buildCompetitionRoundPerformanceRecords({
  state,
  competitionRoundRecords
}: {
  state: Pick<AppState, "sessions" | "rules" | "hypothesisRules" | "ruleTemporalStats" | "ruleCompetitionGroups" | "competitionGroupEcology">;
  competitionRoundRecords: CompetitionRoundRecord[];
}) {
  const groupEcologyById = new Map((state.competitionGroupEcology ?? []).map((ecology) => [ecology.competitionGroupId, ecology]));
  return competitionRoundRecords.flatMap<RulePerformanceRecord>((round) => {
    const records: RulePerformanceRecord[] = [];
    const winner = round.winnerRuleId;
    const groupEcology = groupEcologyById.get(round.competitionGroupId);
    if (winner) {
      const winnerDeltas = outcomeDeltas("win");
      const incumbentHeldLock =
        groupEcology?.incumbentRuleId === winner && groupEcology.lockStatus === "locked";
      const challengerBreakthrough =
        groupEcology?.incumbentRuleId &&
        groupEcology.incumbentRuleId !== winner &&
        (groupEcology.effectivePressure >= 20 || groupEcology.turnoverCounter >= 1);
      const winnerMultiplier = incumbentHeldLock ? 1.15 : challengerBreakthrough ? 1.2 + groupEcology.turnoverCounter * 0.08 : 1;
      records.push({
        id: perfId(["round-win", round.id, winner]),
        ruleId: winner,
        sessionId: round.sessionId ?? sessionIdFromSources(state, state.ruleCompetitionGroups.find((group) => group.id === round.competitionGroupId)?.ruleIds ?? []),
        competitionGroupId: round.competitionGroupId,
        outcome: "win",
        scoreDelta: winnerDeltas.scoreDelta * winnerMultiplier,
        survivabilityDelta: winnerDeltas.survivabilityDelta * winnerMultiplier,
        confidenceDelta: winnerDeltas.confidenceDelta * winnerMultiplier,
        reason: round.reason,
        createdAt: round.createdAt
      });
    }

    for (const loser of round.loserRuleIds) {
      const loserDeltas = outcomeDeltas("loss");
      const loserIsIncumbent = groupEcology?.incumbentRuleId === loser;
      const challengerPressure =
        groupEcology?.incumbentRuleId &&
        groupEcology.incumbentRuleId !== round.winnerRuleId &&
        loserIsIncumbent
          ? 1.15 + (groupEcology.turnoverCounter ?? 0) * 0.08 + Math.max(0, ((groupEcology.effectivePressure ?? 0) - 18) * 0.01)
          : 1;
      records.push({
        id: perfId(["round-loss", round.id, loser]),
        ruleId: loser,
        sessionId: round.sessionId ?? sessionIdFromSources(state, state.ruleCompetitionGroups.find((group) => group.id === round.competitionGroupId)?.ruleIds ?? []),
        competitionGroupId: round.competitionGroupId,
        outcome: "loss",
        scoreDelta: loserDeltas.scoreDelta * challengerPressure,
        survivabilityDelta: loserDeltas.survivabilityDelta * challengerPressure,
        confidenceDelta: loserDeltas.confidenceDelta * challengerPressure,
        reason: round.reason,
        createdAt: round.createdAt
      });
    }

    return records;
  });
}

function buildReplacementPerformanceRecords(state: Pick<AppState, "ruleReplacementRecords" | "sessions" | "rules" | "hypothesisRules">) {
  return state.ruleReplacementRecords.flatMap<RulePerformanceRecord>((record) => {
    const replacementRule = state.rules.find((rule) => rule.id === record.replacementRuleId) ?? state.hypothesisRules.find((hypothesis) => hypothesis.id === record.replacementRuleId);
    const replacedRule = state.rules.find((rule) => rule.id === record.replacedRuleId) ?? state.hypothesisRules.find((hypothesis) => hypothesis.id === record.replacedRuleId);
    const sessionId = sessionIdFromSources(state, [
      ...(replacementRule?.sourceSessionIds ?? []),
      ...(replacedRule?.sourceSessionIds ?? [])
    ]);

    return [
      {
        id: perfId(["replacement-win", record.id, record.replacementRuleId]),
        ruleId: record.replacementRuleId,
        sessionId,
        competitionGroupId: record.competitionGroupId,
        outcome: "win",
        scoreDelta: 14,
        survivabilityDelta: 12,
        confidenceDelta: 0.09,
        reason: `Replacement record promoted ${record.replacementRuleId} over ${record.replacedRuleId}.`,
        createdAt: record.createdAt
      },
      {
        id: perfId(["replacement-loss", record.id, record.replacedRuleId]),
        ruleId: record.replacedRuleId,
        sessionId,
        competitionGroupId: record.competitionGroupId,
        outcome: "loss",
        scoreDelta: -14,
        survivabilityDelta: -12,
        confidenceDelta: -0.09,
        reason: `Replacement record demoted ${record.replacedRuleId} in favor of ${record.replacementRuleId}.`,
        createdAt: record.createdAt
      }
    ];
  });
}

function buildIdleRecords(state: Pick<AppState, "rules" | "hypothesisRules" | "ruleCompetitionGroups">, activeRuleIds: Set<string>) {
  const currentExplainers = [
    ...state.rules.map((rule) => ({ id: rule.id, kind: "rule" as const })),
    ...state.hypothesisRules.map((hypothesis) => ({ id: hypothesis.id, kind: "hypothesis" as const }))
  ];

  return currentExplainers
    .filter((item) => !activeRuleIds.has(item.id))
    .filter((item) => state.ruleCompetitionGroups.some((group) => group.ruleIds.includes(item.id)))
    .map<RulePerformanceRecord>((item) => {
      const group = state.ruleCompetitionGroups.find((candidate) => candidate.ruleIds.includes(item.id));
      return {
        id: perfId(["idle", group?.id ?? "none", item.id]),
        ruleId: item.id,
        sessionId: "temporal-cycle",
        competitionGroupId: group?.id,
        outcome: "idle",
        scoreDelta: outcomeDeltas("idle").scoreDelta,
        survivabilityDelta: outcomeDeltas("idle").survivabilityDelta,
        confidenceDelta: outcomeDeltas("idle").confidenceDelta,
        reason: `No new evidence or competition movement for ${item.id} in the current cycle.`,
        createdAt: nowIso()
      };
    });
}

function aggregateRecent(records: RulePerformanceRecord[]) {
  return records.slice(-TEMPORAL_RECENT_WINDOW_SIZE);
}

function trendForStats(stats: Omit<RuleTemporalStats, "trend">): RuleTemporalTrend {
  if (
    stats.recentWinRate >= TEMPORAL_TREND_THRESHOLDS.risingRecentWinRate &&
    stats.momentumScore >= TEMPORAL_TREND_THRESHOLDS.risingMomentumScore &&
    stats.decayAdjustedScore >= TEMPORAL_TREND_THRESHOLDS.risingDecayAdjustedScore &&
    stats.volatilityScore < TEMPORAL_TREND_THRESHOLDS.volatileScore
  ) {
    return "rising";
  }

  if (
    stats.recentFailureRate >= TEMPORAL_TREND_THRESHOLDS.fadingRecentFailureRate ||
    stats.momentumScore <= TEMPORAL_TREND_THRESHOLDS.fadingMomentumScore ||
    stats.decayAdjustedScore <= TEMPORAL_TREND_THRESHOLDS.fadingDecayAdjustedScore
  ) {
    return "fading";
  }

  if (stats.volatilityScore >= TEMPORAL_TREND_THRESHOLDS.volatileScore) {
    return "volatile";
  }

  return "stable";
}

function buildStatsForRule(ruleId: string, records: RulePerformanceRecord[]): RuleTemporalStats {
  const ordered = records.slice().sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const recent = aggregateRecent(ordered);
  const supportCount = ordered.filter((record) => record.outcome === "support").length;
  const challengeCount = ordered.filter((record) => record.outcome === "challenge").length;
  const winCount = ordered.filter((record) => record.outcome === "win").length;
  const lossCount = ordered.filter((record) => record.outcome === "loss").length;
  const idleCount = ordered.filter((record) => record.outcome === "idle").length;
  const survivalCount = winCount + supportCount;
  const failureCount = lossCount + challengeCount;

  let weightedNet = 0;
  let volatilitySignals = 0;
  let previousSign = 0;

  recent.forEach((record, index) => {
    const weight = Math.pow(TEMPORAL_WEIGHT_DECAY, recent.length - index - 1);
    const outcomeWeight = TEMPORAL_OUTCOME_WEIGHTS[record.outcome];
    weightedNet += outcomeWeight * weight;
    const sign = Math.sign(outcomeWeight);
    if (previousSign !== 0 && sign !== 0 && sign !== previousSign) {
      volatilitySignals += 1;
    }
    if (sign !== 0) previousSign = sign;
  });

  const recentSupportCount = recent.filter((record) => record.outcome === "support" || record.outcome === "win").length;
  const recentChallengeCount = recent.filter((record) => record.outcome === "challenge" || record.outcome === "loss").length;
  const recentIdleCount = recent.filter((record) => record.outcome === "idle").length;
  const recentActiveCount = Math.max(recent.length - recentIdleCount, 1);
  const recentWinRate = clamp(recentSupportCount / recentActiveCount, 0, 1);
  const recentFailureRate = clamp(recentChallengeCount / recentActiveCount, 0, 1);
  const momentumScore = clamp(weightedNet * 18 + (winCount - lossCount) * 4 - idleCount * TEMPORAL_IDLE_PENALTY * 6, -100, 100);
  const volatilityScore = clamp(
    volatilitySignals * 12 + Math.abs(recentSupportCount - recentChallengeCount) * 2 + recentIdleCount * TEMPORAL_VOLATILITY_PENALTY * 10,
    0,
    100
  );
  const decayAdjustedScore = clamp(
    50 + weightedNet * 10 + supportCount * 1.1 - challengeCount * 1.4 + winCount * 1.8 - lossCount * 2 - idleCount * TEMPORAL_IDLE_PENALTY * 4 - volatilityScore * 0.18,
    0,
    100
  );

  const statsBase = {
    ruleId,
    survivalCount,
    failureCount,
    supportCount,
    challengeCount,
    winCount,
    lossCount,
    idleCount,
    recentWinRate,
    recentFailureRate,
    momentumScore,
    volatilityScore,
    decayAdjustedScore,
    recentWindowSize: recent.length || TEMPORAL_RECENT_WINDOW_SIZE,
    recentSupportCount,
    recentChallengeCount,
    recentIdleCount,
    lastEvaluatedAt: ordered.at(-1)?.createdAt,
    lastWinAt: ordered.filter((record) => record.outcome === "win").at(-1)?.createdAt,
    lastLossAt: ordered.filter((record) => record.outcome === "loss").at(-1)?.createdAt,
    trend: "stable" as RuleTemporalTrend
  };

  return {
    ...statsBase,
    trend: trendForStats(statsBase)
  };
}

export function buildRuleTemporalStats(performanceRecords: RulePerformanceRecord[]) {
  const recordsByRule = new Map<string, RulePerformanceRecord[]>();

  for (const record of performanceRecords) {
    const existing = recordsByRule.get(record.ruleId) ?? [];
    existing.push(record);
    recordsByRule.set(record.ruleId, existing);
  }

  return Array.from(recordsByRule.entries())
    .map(([ruleId, records]) => buildStatsForRule(ruleId, records))
    .sort((left, right) => left.ruleId.localeCompare(right.ruleId));
}

export function buildCompetitionRoundRecords({
  state,
  temporalStats
}: {
  state: Pick<
    AppState,
    | "sessions"
    | "rules"
    | "hypothesisRules"
    | "ruleAggregateStats"
    | "ruleCompetitionStats"
    | "ruleContradictions"
    | "ruleEvidences"
    | "reviewSignals"
    | "reviewSignalApplications"
    | "ruleCompetitionGroups"
    | "ruleTemporalStats"
    | "ruleEcologyStats"
    | "competitionGroupEcology"
  >;
  temporalStats: RuleTemporalStats[];
}) {
  const candidateScores = buildCompetitionCandidateScores({
    rules: state.rules,
    hypothesisRules: state.hypothesisRules,
    aggregateStats: state.ruleAggregateStats,
    competitionStats: state.ruleCompetitionStats,
    contradictions: state.ruleContradictions,
    evidences: state.ruleEvidences,
    reviewSignals: state.reviewSignals,
    reviewSignalApplications: state.reviewSignalApplications,
    temporalStats,
    ecologyStats: state.ruleEcologyStats ?? []
  });

  const temporalByRuleId = new Map(temporalStats.map((stats) => [stats.ruleId, stats]));
  const ecologyByRuleId = new Map((state.ruleEcologyStats ?? []).map((stats) => [stats.ruleId, stats]));
  const groupEcologyById = new Map((state.competitionGroupEcology ?? []).map((ecology) => [ecology.competitionGroupId, ecology]));
  const rounds: CompetitionRoundRecord[] = [];

  for (const group of state.ruleCompetitionGroups) {
    const result = evaluateCompetitionWinner(group, candidateScores, temporalByRuleId, ecologyByRuleId, groupEcologyById.get(group.id));
    const members = group.ruleIds
      .map((id) => candidateScores.get(id))
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
    const latestSessionId = sessionIdFromSources(
      state,
      unique(
        members.flatMap((member) => {
          const rule = state.rules.find((item) => item.id === member.id);
          const hypothesis = state.hypothesisRules.find((item) => item.id === member.id);
          return rule?.sourceSessionIds ?? hypothesis?.sourceSessionIds ?? [];
        })
      )
    );
    const scoreSnapshot: Record<string, number> = {};
    for (const member of members) {
      scoreSnapshot[member.id] = Number(member.survivabilityScore.toFixed(2));
    }

    const id = perfId([
      "competition-round",
      group.id,
      result.winnerRuleId ?? "none",
      result.loserRuleIds.join(",") || "solo",
      Math.round(result.confidenceGap).toString(),
      group.status
    ]);

    rounds.push({
      id,
      competitionGroupId: group.id,
      sessionId: latestSessionId,
      winnerRuleId: result.winnerRuleId,
      loserRuleIds: result.loserRuleIds,
      scoreSnapshot,
      settled: result.settled,
      reason: result.winnerRuleId
        ? `Winner ${result.winnerRuleId} led ${group.topicKey} with ${result.confidenceGap.toFixed(1)} confidence gap and ${result.winnerScore?.toFixed(1) ?? "0.0"} survivability.`
        : `No active winner for ${group.topicKey}.`,
      createdAt: group.updatedAt ?? group.createdAt
    });
  }

  return uniqueById(rounds);
}

export function buildRulePerformanceRecords({
  state,
  competitionRoundRecords
}: {
  state: Pick<
    AppState,
    | "sessions"
    | "sessionRuleJudgments"
    | "ruleContradictions"
    | "ruleReplacementRecords"
    | "rules"
    | "hypothesisRules"
    | "ruleCompetitionGroups"
    | "competitionGroupEcology"
  >;
  competitionRoundRecords: CompetitionRoundRecord[];
  }) {
  const records: RulePerformanceRecord[] = [
    ...buildJudgmentRecords(state),
    ...buildContradictionRecords(state),
    ...buildCompetitionRoundPerformanceRecords({
      state: {
        ...state,
        ruleTemporalStats: [],
        ruleCompetitionGroups: state.ruleCompetitionGroups,
        competitionGroupEcology: state.competitionGroupEcology
      },
      competitionRoundRecords
    }),
    ...buildReplacementPerformanceRecords(state)
  ];

  const activeIds = new Set(records.map((record) => record.ruleId));
  const idleRecords = buildIdleRecords(state, activeIds);
  records.push(...idleRecords);

  return uniqueById(records);
}

export function evaluateHypothesisTemporalLifecycle(
  hypothesis: HypothesisRule,
  temporalStats?: RuleTemporalStats | null,
  competitionRounds: CompetitionRoundRecord[] = [],
  replacementRecords: AppState["ruleReplacementRecords"] = [],
  groups: RuleCompetitionGroup[] = []
) {
  if (!temporalStats) return hypothesis.status;

  const replacedByOther = replacementRecords.some((record) => record.replacedRuleId === hypothesis.id && record.replacementRuleId !== hypothesis.id);
  const hasWinningReplacement = replacementRecords.some((record) => record.replacementRuleId === hypothesis.id);
  const group = groups.find((item) => item.id === hypothesis.competitionGroupId);
  const recentRounds = competitionRounds.filter((round) => round.competitionGroupId === group?.id || round.winnerRuleId === hypothesis.id || round.loserRuleIds.includes(hypothesis.id));
  const recentWins = recentRounds.filter((round) => round.winnerRuleId === hypothesis.id).length;
  const recentLosses = recentRounds.filter((round) => round.loserRuleIds.includes(hypothesis.id)).length;
  const activeLeader = group?.activeRuleId === hypothesis.id;

  if (replacedByOther) {
    return "superseded";
  }

  if (hasWinningReplacement && temporalStats.recentWinRate >= TEMPORAL_REPLACEMENT_THRESHOLDS.recentWinRate) {
    if (temporalStats.trend === "rising" || temporalStats.momentumScore >= TEMPORAL_REPLACEMENT_THRESHOLDS.momentumScore) {
      return "accepted";
    }
  }

  if (
    temporalStats.recentWinRate >= TEMPORAL_TREND_THRESHOLDS.risingRecentWinRate &&
    temporalStats.momentumScore >= TEMPORAL_TREND_THRESHOLDS.risingMomentumScore &&
    temporalStats.decayAdjustedScore >= TEMPORAL_TREND_THRESHOLDS.risingDecayAdjustedScore &&
    recentWins > recentLosses
  ) {
    return hypothesis.status === "candidate" || hypothesis.status === "testing" ? "emerging" : "accepted";
  }

  if (
    temporalStats.recentFailureRate >= TEMPORAL_TREND_THRESHOLDS.fadingRecentFailureRate ||
    temporalStats.momentumScore <= TEMPORAL_TREND_THRESHOLDS.fadingMomentumScore ||
    temporalStats.decayAdjustedScore <= TEMPORAL_TREND_THRESHOLDS.fadingDecayAdjustedScore ||
    (recentLosses >= 2 && recentWins === 0 && !activeLeader)
  ) {
    return temporalStats.trend === "volatile" && temporalStats.volatilityScore >= TEMPORAL_TREND_THRESHOLDS.volatileScore ? "fading" : "fading";
  }

  if (recentWins >= 2 && temporalStats.decayAdjustedScore >= TEMPORAL_REPLACEMENT_THRESHOLDS.decayAdjustedScore) {
    return "emerging";
  }

  if (recentLosses >= 3 && temporalStats.recentFailureRate >= 0.6) {
    return "rejected";
  }

  return activeLeader ? "accepted" : hypothesis.status;
}

export function explainWhyRuleIsCurrentlyBest(
  ruleId: string,
  temporalStats?: RuleTemporalStats | null,
  competitionRounds: CompetitionRoundRecord[] = [],
  groups: RuleCompetitionGroup[] = []
) {
  const stats = temporalStats ?? null;
  const group = groups.find((candidate) => candidate.activeRuleId === ruleId || candidate.ruleIds.includes(ruleId));
  const recentRounds = competitionRounds.filter((round) => round.winnerRuleId === ruleId || round.loserRuleIds.includes(ruleId));
  const recentWins = recentRounds.filter((round) => round.winnerRuleId === ruleId).length;
  const recentLosses = recentRounds.filter((round) => round.loserRuleIds.includes(ruleId)).length;

  return {
    ruleId,
    summary:
      stats?.trend === "rising"
        ? "This explanation is currently best because it is rising in recent competition and holding momentum."
        : stats?.trend === "stable"
          ? "This explanation is currently best because it is stable and has not been undercut by recent losses."
          : "This explanation is currently best because it still leads its competition group, even if the lead is not yet fully stable.",
    details: [
      `group=${group?.id ?? "none"}`,
      `trend=${stats?.trend ?? "unknown"}`,
      `recentWins=${recentWins}`,
      `recentLosses=${recentLosses}`,
      `momentum=${stats?.momentumScore.toFixed(1) ?? "0.0"}`,
      `decay=${stats?.decayAdjustedScore.toFixed(1) ?? "0.0"}`
    ].join(" · "),
    rising: stats?.trend === "rising",
    stable: stats?.trend === "stable",
    fading: stats?.trend === "fading",
    volatile: stats?.trend === "volatile"
  };
}

export function explainWhyRuleIsFading(
  ruleId: string,
  temporalStats?: RuleTemporalStats | null,
  competitionRounds: CompetitionRoundRecord[] = []
) {
  const stats = temporalStats ?? null;
  const decayAdjustedScore = stats?.decayAdjustedScore ?? 0;
  const recentWinRate = stats?.recentWinRate ?? 0;
  const recentFailureRate = stats?.recentFailureRate ?? 0;
  const volatilityScore = stats?.volatilityScore ?? 0;
  const recentRounds = competitionRounds.filter((round) => round.winnerRuleId === ruleId || round.loserRuleIds.includes(ruleId));
  const recentWins = recentRounds.filter((round) => round.winnerRuleId === ruleId).length;
  const recentLosses = recentRounds.filter((round) => round.loserRuleIds.includes(ruleId)).length;

  return {
    ruleId,
    summary:
      stats?.trend === "fading" || decayAdjustedScore <= TEMPORAL_TREND_THRESHOLDS.fadingDecayAdjustedScore
        ? "This explanation is fading because its recent losses and idle periods outweigh the wins that used to protect it."
        : "This explanation is not clearly fading yet, but its recent momentum is weaker than the group leader.",
    details: [
      `trend=${stats?.trend ?? "unknown"}`,
      `recentWins=${recentWins}`,
      `recentLosses=${recentLosses}`,
      `recentWinRate=${recentWinRate.toFixed(2)}`,
      `recentFailureRate=${recentFailureRate.toFixed(2)}`,
      `volatility=${volatilityScore.toFixed(1)}`
    ].join(" · "),
    fading: stats?.trend === "fading",
    volatile: stats?.trend === "volatile",
    momentumScore: stats?.momentumScore ?? 0,
    decayAdjustedScore: stats?.decayAdjustedScore ?? 0
  };
}

export function buildTemporalArtifacts(
  state: Pick<
    AppState,
    | "sessions"
    | "sessionRuleJudgments"
    | "ruleContradictions"
    | "ruleReplacementRecords"
    | "rules"
    | "hypothesisRules"
    | "ruleCompetitionGroups"
    | "ruleAggregateStats"
    | "ruleCompetitionStats"
    | "ruleEvidences"
    | "reviewSignals"
    | "reviewSignalApplications"
    | "rulePerformanceRecords"
    | "ruleTemporalStats"
    | "competitionRoundRecords"
    | "ruleEcologyStats"
    | "competitionGroupEcology"
  >
) {
  const competitionRoundRecords = uniqueById([
    ...state.competitionRoundRecords,
    ...buildCompetitionRoundRecords({ state, temporalStats: state.ruleTemporalStats })
  ]);
  const performanceRecords = uniqueById([
    ...state.rulePerformanceRecords,
    ...buildRulePerformanceRecords({ state, competitionRoundRecords })
  ]);
  const temporalStats = buildRuleTemporalStats(performanceRecords);

  return {
    rulePerformanceRecords: performanceRecords,
    ruleTemporalStats: temporalStats,
    competitionRoundRecords
  };
}
