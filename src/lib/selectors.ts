import type {
  AppState,
  CompetitionRoundRecord,
  CompetitionGroupEcology,
  HypothesisRule,
  PersonaLayer,
  PersonaModel,
  PersonaRule,
  RuleCompetitionGroup,
  ReviewSignalApplication,
  RuleAggregateStats,
  RuleEvidence,
  RulePerformanceRecord,
  RuleDecayRecord,
  RuleEcologyStats,
  RuleReplacementRecord,
  RuleTemporalStats,
  RuleLifecycleState,
  RuleStatus,
  Session,
  SessionRuleJudgment
} from "@/lib/types";

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function isAcceptedLifecycle(status: RuleLifecycleState) {
  return status === "accepted" || status === "stable";
}

export function selectAcceptedGlobalRules(state: Pick<AppState, "rules">) {
  return state.rules.filter((rule) => isAcceptedLifecycle(rule.status));
}

export function selectRulesByLifecycle(state: Pick<AppState, "rules">, lifecycle: RuleLifecycleState) {
  return state.rules.filter((rule) => rule.status === lifecycle);
}

export function selectGlobalRulesByLayer(state: Pick<AppState, "rules">, layer: PersonaLayer, status: RuleLifecycleState = "accepted") {
  return state.rules.filter((rule) => rule.layer === layer && rule.status === status);
}

export function selectRuleById(state: Pick<AppState, "rules">, ruleId: string) {
  return state.rules.find((rule) => rule.id === ruleId);
}

export function selectRuleEvidenceByRule(state: Pick<AppState, "ruleEvidences">, ruleId: string) {
  return state.ruleEvidences.filter((evidence) => evidence.ruleId === ruleId).slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function selectRuleAggregateStats(state: Pick<AppState, "ruleAggregateStats">, ruleId: string) {
  return state.ruleAggregateStats.find((stats) => stats.ruleId === ruleId);
}

export function selectRuleCompetitionStats(state: Pick<AppState, "ruleCompetitionStats">, ruleId: string) {
  return state.ruleCompetitionStats.find((stats) => stats.ruleId === ruleId);
}

export function selectRulePerformanceRecords(state: Pick<AppState, "rulePerformanceRecords">, ruleId?: string) {
  const records = ruleId ? state.rulePerformanceRecords.filter((record) => record.ruleId === ruleId) : state.rulePerformanceRecords;
  return records.slice().sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function selectRuleTemporalStats(state: Pick<AppState, "ruleTemporalStats">, ruleId: string) {
  return state.ruleTemporalStats.find((stats) => stats.ruleId === ruleId);
}

export function selectRuleEcologyStats(state: Pick<AppState, "ruleEcologyStats">, ruleId: string) {
  return state.ruleEcologyStats.find((stats) => stats.ruleId === ruleId);
}

export function selectCompetitionRoundRecords(state: Pick<AppState, "competitionRoundRecords">, groupId?: string) {
  const records = groupId ? state.competitionRoundRecords.filter((record) => record.competitionGroupId === groupId) : state.competitionRoundRecords;
  return records.slice().sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function selectHypothesisRules(state: Pick<AppState, "hypothesisRules">) {
  return state.hypothesisRules.slice().sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function selectHypothesisRuleById(state: Pick<AppState, "hypothesisRules">, hypothesisId: string) {
  return state.hypothesisRules.find((hypothesis) => hypothesis.id === hypothesisId);
}

export function selectRuleCompetitionGroups(state: Pick<AppState, "ruleCompetitionGroups">) {
  return state.ruleCompetitionGroups.slice().sort((left, right) => left.topicKey.localeCompare(right.topicKey));
}

export function selectRuleCompetitionGroupById(state: Pick<AppState, "ruleCompetitionGroups">, groupId: string) {
  return state.ruleCompetitionGroups.find((group) => group.id === groupId);
}

export function selectCompetitionGroupEcology(state: Pick<AppState, "competitionGroupEcology">, groupId?: string) {
  const ecology = groupId ? state.competitionGroupEcology.filter((item) => item.competitionGroupId === groupId) : state.competitionGroupEcology;
  return ecology.slice().sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function selectRuleReplacementRecords(state: Pick<AppState, "ruleReplacementRecords">, ruleId?: string) {
  const records = ruleId
    ? state.ruleReplacementRecords.filter((record) => record.replacedRuleId === ruleId || record.replacementRuleId === ruleId)
    : state.ruleReplacementRecords;
  return records.slice().sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function selectRuleDecayRecords(state: Pick<AppState, "ruleDecayRecords">, ruleId?: string) {
  const records = ruleId ? state.ruleDecayRecords.filter((record) => record.ruleId === ruleId) : state.ruleDecayRecords;
  return records.slice().sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function selectRuleContradictions(state: Pick<AppState, "ruleContradictions">, ruleId: string) {
  return state.ruleContradictions.filter((contradiction) => contradiction.ruleId === ruleId).slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function selectGlobalRuleHealth(state: Pick<AppState, "ruleAggregateStats" | "ruleCompetitionStats" | "rules" | "ruleContradictions" | "ruleEcologyStats">, ruleId: string) {
  const rule = selectRuleById(state, ruleId);
  const stats = selectRuleAggregateStats(state, ruleId);
  const competition = selectRuleCompetitionStats(state, ruleId);
  const contradictions = selectRuleContradictions(state, ruleId);
  const ecology = selectRuleEcologyStats(state, ruleId);
  const support = stats?.supportCount ?? 0;
  const challenge = stats?.challengeCount ?? 0;
  const challengeRatio = support + challenge === 0 ? 0 : challenge / (support + challenge);

  return {
    confidence: competition?.confidenceScore ? competition.confidenceScore / 100 : stats?.currentConfidence ?? rule?.confidence ?? 0,
    stabilityScore: stats?.stabilityScore ?? 0,
    challengeRatio,
    lifecycle: rule?.status ?? "candidate",
    contradictionScore: competition?.contradictionScore ?? 0,
    correctionPressure: competition?.correctionPressure ?? 0,
    survivabilityScore: competition?.survivabilityScore ?? 0,
    contradictionCount: contradictions.length,
    ecologyStatus: ecology?.ecologyStatus ?? "contested",
    dominanceSpan: ecology?.dominanceSpan ?? 0,
    challengePressure: ecology?.challengePressure ?? 0,
    idleDecayScore: ecology?.idleDecayScore ?? 0,
    resilienceScore: ecology?.resilienceScore ?? 0,
    isIncumbent: ecology?.isIncumbent ?? false,
    isCurrentLeader: ecology?.isCurrentLeader ?? false,
    effectivePressure: ecology?.effectivePressure ?? 0,
    resistanceScore: ecology?.resistanceScore ?? 0,
    replacementRisk: ecology?.replacementRisk ?? 0,
    decayPath: ecology?.decayPath,
    pressureMemory: ecology?.inheritedPressure ?? 0,
    cooldownLevel: ecology?.cooldownPenalty ?? 0,
    recoveryProgress: (ecology?.recoveryScore ?? 100) / 100,
    layeredPressureImpact: ecology?.layeredPressureImpact,
    recoveryMode: ecology?.recoveryMode ?? "stabilized",
    stabilityPenalty: ecology?.stabilityPenalty ?? 0
  };
}

export function selectSessionById(state: Pick<AppState, "sessions">, sessionId?: string) {
  if (!sessionId) return undefined;
  return state.sessions.find((session) => session.id === sessionId);
}

export function selectActiveSession(state: Pick<AppState, "sessions" | "activeSessionId">) {
  return selectSessionById(state, state.activeSessionId);
}

export function selectSelectedSession(state: Pick<AppState, "sessions" | "selectedSessionId">) {
  return selectSessionById(state, state.selectedSessionId);
}

export function selectSelectedProxyReviewCase(state: Pick<AppState, "proxyReviewCases" | "selectedProxyReviewCaseId">) {
  if (!state.selectedProxyReviewCaseId) return undefined;
  return state.proxyReviewCases.find((reviewCase) => reviewCase.id === state.selectedProxyReviewCaseId);
}

export function selectProxyCalibrationStates(state: Pick<AppState, "proxyCalibrationStates">, reviewCaseId?: string) {
  const states = reviewCaseId
    ? state.proxyCalibrationStates.filter((calibration) => calibration.sourceReviewCaseId === reviewCaseId)
    : state.proxyCalibrationStates;
  return states.slice().sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function selectSessionRuleJudgments(state: Pick<AppState, "sessionRuleJudgments">, sessionId: string) {
  return state.sessionRuleJudgments
    .filter((judgment) => judgment.sessionId === sessionId)
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function selectSessionRuleObjects(state: Pick<AppState, "rules">, session: Session) {
  return session.candidateRuleIds
    .map((ruleId) => state.rules.find((rule) => rule.id === ruleId))
    .filter((rule): rule is PersonaRule => Boolean(rule));
}

export function selectSessionEvidences(state: Pick<AppState, "ruleEvidences">, sessionId: string) {
  return state.ruleEvidences.filter((evidence) => evidence.sessionId === sessionId).slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function deriveSessionRuleBuckets(judgments: SessionRuleJudgment[]) {
  const acceptedRuleIds = judgments.filter((judgment) => judgment.status === "accepted").map((judgment) => judgment.ruleId);
  const rejectedRuleIds = judgments.filter((judgment) => judgment.status === "rejected").map((judgment) => judgment.ruleId);
  const pendingRuleIds = judgments.filter((judgment) => judgment.status === "candidate" || judgment.status === "observed").map((judgment) => judgment.ruleId);

  return {
    acceptedRuleIds: unique(acceptedRuleIds),
    rejectedRuleIds: unique(rejectedRuleIds),
    pendingRuleIds: unique(pendingRuleIds)
  };
}

export function deriveSessionKeyMoments(session: Session) {
  return unique(
    session.transcript
      .filter((turn) => turn.highlighted)
      .map((turn) => turn.text)
      .concat(session.keyMoments)
  );
}

export function deriveSessionRoundCount(session: Session) {
  const rounds = session.transcript.map((turn) => turn.round);
  return rounds.length ? Math.max(...rounds) : session.roundCount;
}

export function selectReviewSignalsByCase(state: Pick<AppState, "reviewSignals">, caseId: string) {
  return state.reviewSignals.filter((signal) => signal.reviewCaseId === caseId);
}

export function selectReviewSignalApplications(state: Pick<AppState, "reviewSignals" | "reviewSignalApplications">, caseId?: string) {
  if (!caseId) {
    return state.reviewSignalApplications.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  const reviewSignalIds = new Set(state.reviewSignals.filter((signal) => signal.reviewCaseId === caseId).map((signal) => signal.id));
  return state.reviewSignalApplications
    .filter((application) => reviewSignalIds.has(application.reviewSignalId))
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function selectRulesByTemporalTrend(
  state: Pick<AppState, "rules" | "hypothesisRules" | "ruleTemporalStats">,
  trend: "rising" | "stable" | "fading" | "volatile"
) {
  const ids = new Set(state.ruleTemporalStats.filter((stats) => stats.trend === trend).map((stats) => stats.ruleId));
  return [
    ...state.rules.filter((rule) => ids.has(rule.id)),
    ...state.hypothesisRules.filter((hypothesis) => ids.has(hypothesis.id))
  ];
}

type PersonaModelSummaryState = Pick<AppState, "rules" | "sessions" | "reviewSignals" | "reviewSignalApplications"> &
  Partial<Pick<AppState, "hypothesisRules" | "ruleCompetitionGroups" | "ruleReplacementRecords" | "ruleTemporalStats" | "ruleEcologyStats" | "competitionGroupEcology" | "ruleDecayRecords">>;

export function computePersonaModelSummary(state: PersonaModelSummaryState): PersonaModel {
  const acceptedRules = selectAcceptedGlobalRules(state);
  const hypothesisRules = state.hypothesisRules ?? [];
  const competitionGroups = state.ruleCompetitionGroups ?? [];
  const replacementRecords = state.ruleReplacementRecords ?? [];
  const temporalStats = state.ruleTemporalStats ?? [];
  const ecologyStats = state.ruleEcologyStats ?? [];
  const competitionGroupEcology = state.competitionGroupEcology ?? [];
  const ruleDecayRecords = state.ruleDecayRecords ?? [];
  const sourceSessionIds = unique(acceptedRules.flatMap((rule) => rule.sourceSessionIds));
  const styleRuleIds = acceptedRules.filter((rule) => rule.layer === "style").map((rule) => rule.id);
  const decisionRuleIds = acceptedRules.filter((rule) => rule.layer === "decision").map((rule) => rule.id);
  const valueRuleIds = acceptedRules.filter((rule) => rule.layer === "value").map((rule) => rule.id);
  const boundaryRuleIds = acceptedRules.filter((rule) => rule.layer === "boundary").map((rule) => rule.id);
  const appliedReviewSignalCount = state.reviewSignalApplications.length || state.reviewSignals.filter((signal) => signal.status === "applied").length;
  const activeCompetitionRuleIds = competitionGroups
    .map((group) => group.activeRuleId)
    .filter((activeRuleId): activeRuleId is string => Boolean(activeRuleId));
  const activeRuleIds = unique([...acceptedRules.map((rule) => rule.id), ...activeCompetitionRuleIds]);
  const atRiskRuleIds = state.rules.filter((rule) => ["challenged", "contradicted", "deprecated", "invalidated"].includes(rule.status)).map((rule) => rule.id);
  const hypothesisRuleIds = hypothesisRules.filter((hypothesis) => hypothesis.status !== "rejected").map((hypothesis) => hypothesis.id);
  const competitionGroupIds = competitionGroups.map((group) => group.id);
  const replacementRecordIds = replacementRecords.map((record) => record.id);
  const dominantRuleIds = ecologyStats.filter((item) => item.ecologyStatus === "dominant").map((item) => item.ruleId);
  const fragileRuleIds = ecologyStats.filter((item) => item.ecologyStatus === "fragile").map((item) => item.ruleId);
  const contestedRuleIds = ecologyStats.filter((item) => item.ecologyStatus === "contested").map((item) => item.ruleId);
  const fadingRuleIds = ecologyStats.filter((item) => item.ecologyStatus === "fading").map((item) => item.ruleId);
  const ecologyGroupIds = competitionGroupEcology.map((item) => item.competitionGroupId);
  const decayRecordIds = ruleDecayRecords.map((item) => item.id);
  const hypothesisSourceCoverage = unique(hypothesisRules.flatMap((hypothesis) => hypothesis.sourceSessionIds)).length;
  const risingTemporalCount = temporalStats.filter((stats) => stats.trend === "rising").length;
  const fadingTemporalCount = temporalStats.filter((stats) => stats.trend === "fading").length;
  const stableTemporalCount = temporalStats.filter((stats) => stats.trend === "stable").length;
  const dominantEcologyCount = dominantRuleIds.length;
  const fragileEcologyCount = fragileRuleIds.length;
  const contestedEcologyCount = contestedRuleIds.length;
  const fadingEcologyCount = fadingRuleIds.length;
  const maturity = Math.min(
    100,
    14 +
      acceptedRules.length * 5 +
      sourceSessionIds.length * 3 +
      appliedReviewSignalCount * 2 +
      hypothesisSourceCoverage * 1.5 +
      replacementRecords.length * 2 +
      risingTemporalCount * 1.2 -
      fadingTemporalCount * 0.8 +
      stableTemporalCount * 0.5 +
      dominantEcologyCount * 1.4 -
      fragileEcologyCount * 0.6 -
      contestedEcologyCount * 0.7 -
      fadingEcologyCount * 1.1 +
      competitionGroupEcology.filter((item) => item.stabilityClass === "stable").length * 0.8 -
      competitionGroupEcology.filter((item) => item.stabilityClass === "turnover").length * 1.2
  );
  const latestRuleTimestamp = acceptedRules
    .map((rule) => rule.updatedAt ?? rule.createdAt)
    .sort()
    .at(-1);
  const latestSessionTimestamp = state.sessions
    .map((session) => session.endedAt ?? session.startedAt)
    .sort()
    .at(-1);
  const latestReviewSignalTimestamp = state.reviewSignals.map((signal) => signal.createdAt).sort().at(-1);
  const latestApplicationTimestamp = state.reviewSignalApplications.map((application) => application.createdAt).sort().at(-1);

  return {
    version: acceptedRules.length >= 8 ? "v0.4" : acceptedRules.length >= 5 ? "v0.3" : "v0.2",
    updatedAt: latestRuleTimestamp ?? latestApplicationTimestamp ?? latestReviewSignalTimestamp ?? latestSessionTimestamp ?? "2026-03-21T00:00:00+08:00",
    maturity,
    sourceSessionIds,
    acceptedRuleIds: acceptedRules.map((rule) => rule.id),
    styleRuleIds,
    decisionRuleIds,
    valueRuleIds,
    boundaryRuleIds,
    reviewSignalAppliedCount: appliedReviewSignalCount,
    activeRuleIds,
    atRiskRuleIds,
    hypothesisRuleIds,
    competitionGroupIds,
    replacementRecordIds,
    dominantRuleIds,
    fragileRuleIds,
    contestedRuleIds,
    fadingRuleIds,
    competitionGroupEcologyIds: ecologyGroupIds,
    ruleDecayRecordIds: decayRecordIds
  };
}

export function selectPersonaModelSummary(state: PersonaModelSummaryState) {
  return computePersonaModelSummary(state);
}

export function selectReviewCaseById(state: Pick<AppState, "proxyReviewCases">, caseId?: string) {
  if (!caseId) return undefined;
  return state.proxyReviewCases.find((reviewCase) => reviewCase.id === caseId);
}

export function selectHypothesisRulesBySession(state: Pick<AppState, "hypothesisRules">, sessionId: string) {
  return state.hypothesisRules
    .filter((hypothesis) => hypothesis.sourceSessionIds.includes(sessionId))
    .slice()
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function selectRuleReplacementRecordsByGroup(state: Pick<AppState, "ruleReplacementRecords">, groupId: string) {
  return state.ruleReplacementRecords.filter((record) => record.competitionGroupId === groupId).slice().sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}
