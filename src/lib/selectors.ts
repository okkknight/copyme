import type {
  AppState,
  PersonaLayer,
  PersonaModel,
  PersonaRule,
  ProxyReviewCase,
  RuleStatus,
  Session
} from "@/lib/types";

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function selectAcceptedRules(state: Pick<AppState, "rules">) {
  return state.rules.filter((rule) => rule.status === "accepted");
}

export function selectRulesByLayer(state: Pick<AppState, "rules">, layer: PersonaLayer, status: RuleStatus = "accepted") {
  return state.rules.filter((rule) => rule.layer === layer && rule.status === status);
}

export function selectRuleById(state: Pick<AppState, "rules">, ruleId: string) {
  return state.rules.find((rule) => rule.id === ruleId);
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

export function selectSessionRuleObjects(state: Pick<AppState, "rules">, session: Session) {
  return session.candidateRuleIds
    .map((ruleId) => state.rules.find((rule) => rule.id === ruleId))
    .filter((rule): rule is PersonaRule => Boolean(rule));
}

export function deriveSessionRuleBuckets(session: Session, rules: PersonaRule[]) {
  const acceptedRuleIds = session.candidateRuleIds.filter((ruleId) => rules.find((rule) => rule.id === ruleId && rule.status === "accepted"));
  const rejectedRuleIds = session.candidateRuleIds.filter((ruleId) => rules.find((rule) => rule.id === ruleId && rule.status === "rejected"));
  const pendingRuleIds = session.candidateRuleIds.filter((ruleId) =>
    rules.find((rule) => rule.id === ruleId && (rule.status === "candidate" || rule.status === "observed"))
  );

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

export function computePersonaModelSummary(state: Pick<AppState, "rules" | "sessions">): PersonaModel {
  const acceptedRules = selectAcceptedRules(state);
  const sourceSessionIds = unique(acceptedRules.flatMap((rule) => rule.sourceSessionIds));
  const styleRuleIds = acceptedRules.filter((rule) => rule.layer === "style").map((rule) => rule.id);
  const decisionRuleIds = acceptedRules.filter((rule) => rule.layer === "decision").map((rule) => rule.id);
  const valueRuleIds = acceptedRules.filter((rule) => rule.layer === "value").map((rule) => rule.id);
  const boundaryRuleIds = acceptedRules.filter((rule) => rule.layer === "boundary").map((rule) => rule.id);
  const maturity = Math.min(100, 20 + acceptedRules.length * 6 + sourceSessionIds.length * 4);
  const latestRuleTimestamp = acceptedRules
    .map((rule) => rule.updatedAt ?? rule.createdAt)
    .sort()
    .at(-1);
  const latestSessionTimestamp = state.sessions
    .map((session) => session.endedAt ?? session.startedAt)
    .sort()
    .at(-1);

  return {
    version: acceptedRules.length >= 8 ? "v0.4" : acceptedRules.length >= 5 ? "v0.3" : "v0.2",
    updatedAt: latestRuleTimestamp ?? latestSessionTimestamp ?? "2026-03-21T00:00:00+08:00",
    maturity,
    sourceSessionIds,
    acceptedRuleIds: acceptedRules.map((rule) => rule.id),
    styleRuleIds,
    decisionRuleIds,
    valueRuleIds,
    boundaryRuleIds
  };
}

export function selectPersonaModelSummary(state: Pick<AppState, "rules" | "sessions">) {
  return computePersonaModelSummary(state);
}

export function selectReviewCaseById(state: Pick<AppState, "proxyReviewCases">, caseId?: string) {
  if (!caseId) return undefined;
  return state.proxyReviewCases.find((reviewCase) => reviewCase.id === caseId);
}
