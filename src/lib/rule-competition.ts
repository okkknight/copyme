import {
  clampCompetitionScore,
  CORRECTION_PRESSURE_WEIGHTS,
  CONTRADICTION_SEVERITY_WEIGHTS,
  CONTRADICTION_TYPE_WEIGHTS,
  RULE_COMPETITION_THRESHOLDS,
  RULE_FALSIFICATION_THRESHOLDS
} from "@/lib/falsification-thresholds";
import type {
  AppState,
  PersonaRule,
  RuleAggregateStats,
  RuleCompetitionStats,
  RuleContradiction,
  RuleContradictionSeverity,
  RuleContradictionType,
  ReviewSignal,
  ReviewSignalApplication,
  RuleLifecycleState,
  Session,
  SessionRuleJudgment,
  TeachingActionTag
} from "@/lib/types";
import { inferTeachingActions } from "@/lib/mock-engine";

function nowIso() {
  return new Date().toISOString();
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function daysBetween(left: string, right: string) {
  const leftMs = new Date(left).getTime();
  const rightMs = new Date(right).getTime();
  if (Number.isNaN(leftMs) || Number.isNaN(rightMs)) return 0;
  return Math.abs(leftMs - rightMs) / (1000 * 60 * 60 * 24);
}

function compactText(value: string) {
  return value.toLowerCase().replace(/['"]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function includesAny(text: string, patterns: string[]) {
  return patterns.some((pattern) => text.includes(pattern));
}

function countTeacherActions(session: Session, actions: TeachingActionTag[]) {
  return session.transcript.filter((turn) => turn.speaker === "teacher").reduce((count, turn) => count + (turn.teachingActions?.some((action) => actions.includes(action)) ? 1 : 0), 0);
}

function findTeacherTurnIds(session: Session, actions: TeachingActionTag[]) {
  return session.transcript
    .filter((turn) => turn.speaker === "teacher")
    .filter((turn) => (turn.teachingActions?.length ? turn.teachingActions : inferTeachingActions(turn.text)).some((action) => actions.includes(action)))
    .map((turn) => turn.id);
}

function matchingSourceSession(state: Pick<AppState, "sessions" | "proxyReviewCases">, reviewSignal: ReviewSignal) {
  const reviewCase = state.proxyReviewCases.find((item) => item.id === reviewSignal.reviewCaseId);
  if (!reviewCase) return state.sessions[0];

  return (
    state.sessions.find(
      (session) =>
        (session.createdFromTemplateId === reviewCase.studentTemplateId || session.studentTemplateId === reviewCase.studentTemplateId) &&
        session.scenario === reviewCase.scenario &&
        session.status !== "draft"
    ) ?? state.sessions[0]
  );
}

function patternProfile(rule: PersonaRule): {
  supportActions: TeachingActionTag[];
  oppositionActions: TeachingActionTag[];
  contradictionType: RuleContradictionType;
  contradictionLabel: string;
} {
  const text = compactText(rule.text);

  if (includesAny(text, ["meaning before grammar", "preserves meaning", "protects student face", "continued speaking"])) {
    return {
      supportActions: ["meaning_first", "reassure"],
      oppositionActions: ["grammar_first", "correct", "push_precision"],
      contradictionType: "behavior_conflict",
      contradictionLabel: "meaning-before-grammar"
    };
  }

  if (includesAny(text, ["reassurance", "reassure", "face", "calm"])) {
    return {
      supportActions: ["reassure", "meaning_first"],
      oppositionActions: ["grammar_first", "correct", "pressure"],
      contradictionType: "style_mismatch",
      contradictionLabel: "reassurance-before-correction"
    };
  }

  if (includesAny(text, ["retry", "another attempt", "one more attempt"])) {
    return {
      supportActions: ["retry", "narrow_scope"],
      oppositionActions: ["example_first", "grammar_first", "correct"],
      contradictionType: "decision_mismatch",
      contradictionLabel: "retry-before-explanation"
    };
  }

  if (includesAny(text, ["diagnose", "confidence", "anxiety", "blocker"])) {
    return {
      supportActions: ["diagnose"],
      oppositionActions: ["correct", "grammar_first", "push_precision"],
      contradictionType: "decision_mismatch",
      contradictionLabel: "diagnose-before-correcting"
    };
  }

  if (includesAny(text, ["example", "concrete", "specific", "precision", "reason and one consequence"])) {
    return {
      supportActions: ["example_first", "push_precision"],
      oppositionActions: ["reassure", "meaning_first"],
      contradictionType: "decision_mismatch",
      contradictionLabel: "precision-or-example"
    };
  }

  return {
    supportActions: ["meaning_first", "push_precision"],
    oppositionActions: ["correct", "grammar_first"],
    contradictionType: "behavior_conflict",
    contradictionLabel: "generic"
  };
}

function collectRuleRelatedSessions(state: Pick<AppState, "sessions" | "sessionRuleJudgments" | "ruleEvidences">, ruleId: string, fallbackSourceSessions: string[]) {
  const judgmentSessions = state.sessionRuleJudgments.filter((judgment) => judgment.ruleId === ruleId).map((judgment) => judgment.sessionId);
  const evidenceSessions = state.ruleEvidences.filter((evidence) => evidence.ruleId === ruleId).map((evidence) => evidence.sessionId);
  return unique([...fallbackSourceSessions, ...judgmentSessions, ...evidenceSessions]);
}

function buildSessionBehaviorContradiction(rule: PersonaRule, state: Pick<AppState, "sessions" | "sessionRuleJudgments" | "ruleEvidences" | "reviewSignals" | "reviewSignalApplications">) {
  const profile = patternProfile(rule);
  const relatedSessionIds = collectRuleRelatedSessions(state, rule.id, rule.sourceSessionIds);
  const sessions = state.sessions.filter((session) => relatedSessionIds.includes(session.id));
  let supportHits = 0;
  let oppositionHits = 0;
  const oppositionTurnIds: string[] = [];
  const supportTurnIds: string[] = [];

  for (const session of sessions) {
    const supportCount = countTeacherActions(session, profile.supportActions);
    const oppositionCount = countTeacherActions(session, profile.oppositionActions);
    supportHits += supportCount;
    oppositionHits += oppositionCount;

    if (oppositionCount > supportCount) {
      oppositionTurnIds.push(...findTeacherTurnIds(session, profile.oppositionActions));
    }
    if (supportCount > 0) {
      supportTurnIds.push(...findTeacherTurnIds(session, profile.supportActions));
    }
  }

  const challengeCount = state.sessionRuleJudgments.filter((judgment) => judgment.ruleId === rule.id && judgment.status === "rejected").length;
  const scoreGap = oppositionHits - supportHits;
  if (scoreGap < 2 && challengeCount < RULE_FALSIFICATION_THRESHOLDS.repeatedChallengeCount) {
    return null;
  }

  const severity: RuleContradictionSeverity =
    scoreGap >= 4 || challengeCount >= RULE_FALSIFICATION_THRESHOLDS.repeatedChallengeCount + 1 ? "high" : scoreGap >= 2 ? "medium" : "low";

  return {
    id: `contradiction-${rule.id}-behavior-${profile.contradictionLabel}`,
    ruleId: rule.id,
    sourceType: "session_judgment" as const,
    sourceId: relatedSessionIds[0] ?? rule.id,
    contradictionType: profile.contradictionType,
    severity,
    summary: `Observed opposition to ${rule.text} across ${relatedSessionIds.length} session(s); support hits ${supportHits}, opposition hits ${oppositionHits}.`,
    relatedSessionId: relatedSessionIds[0],
    relatedTurnIds: unique(oppositionTurnIds.slice(0, 6).length ? oppositionTurnIds.slice(0, 6) : supportTurnIds.slice(0, 4)),
    createdAt: nowIso()
  } satisfies RuleContradiction;
}

function buildReviewContradictions(
  rule: PersonaRule,
  state: Pick<AppState, "sessions" | "proxyReviewCases" | "reviewSignals" | "reviewSignalApplications" | "ruleEvidences">,
  reviewSignalApplications: ReviewSignalApplication[]
) {
  const applications = reviewSignalApplications.filter((application) => application.appliedToRuleIds.includes(rule.id));
  const contradictions: RuleContradiction[] = [];

  for (const application of applications) {
    const signal = state.reviewSignals.find((item) => item.id === application.reviewSignalId);
    if (!signal) continue;

    const reviewCase = state.proxyReviewCases.find((item) => item.id === signal.reviewCaseId);
    const selectedLabel = reviewCase?.selectedLabel;
    const sourceSession = matchingSourceSession(state, signal);
    const isHardBoundary = signal.targetLayer === "boundary" && (selectedLabel === "not_like_me" || selectedLabel === "totally_off");
    const contradictionType: RuleContradictionType =
      signal.targetLayer === "boundary"
        ? "boundary_violation"
        : signal.targetLayer === "decision"
          ? "decision_mismatch"
          : "style_mismatch";
    const severity: RuleContradictionSeverity = isHardBoundary || application.didForceDowngrade ? "high" : application.action === "challenge_existing_rule" ? "medium" : "low";
    const evidenceIds = new Set(application.createdEvidenceIds);
    const relatedTurnIds = unique(
      state.ruleEvidences
        .filter((evidence) => evidenceIds.has(evidence.id) || evidence.reviewSignalId === signal.id || evidence.reviewSignalApplicationId === application.id)
        .flatMap((evidence) => evidence.turnIds)
    );

    contradictions.push({
      id: `contradiction-${rule.id}-review-${signal.id}`,
      ruleId: rule.id,
      sourceType: "review_signal",
      sourceId: signal.id,
      contradictionType,
      severity,
      summary: `${signal.signalType} on ${signal.targetLayer} applied to ${rule.text}; ${selectedLabel ?? "unlabeled"} review case suggests forced correction.`,
      relatedSessionId: sourceSession.id,
      relatedTurnIds,
      createdAt: application.createdAt
    });
  }

  return contradictions;
}

function dedupeContradictions(contradictions: RuleContradiction[]) {
  const seen = new Set<string>();
  return contradictions.filter((contradiction) => {
    if (seen.has(contradiction.id)) return false;
    seen.add(contradiction.id);
    return true;
  });
}

export function deriveContradictionsFromEvidenceAndSignals(
  state: Pick<AppState, "sessions" | "sessionRuleJudgments" | "ruleEvidences" | "reviewSignals" | "reviewSignalApplications" | "rules" | "proxyReviewCases">
) {
  const contradictions: RuleContradiction[] = [];

  for (const rule of state.rules) {
    const sessionContradiction = buildSessionBehaviorContradiction(rule, state);
    if (sessionContradiction) {
      contradictions.push(sessionContradiction);
    }
    contradictions.push(...buildReviewContradictions(rule, state, state.reviewSignalApplications));
  }

  return dedupeContradictions(contradictions);
}

export function buildRuleCompetitionStats(
  rule: PersonaRule,
  aggregateStats: RuleAggregateStats | undefined,
  contradictions: RuleContradiction[],
  reviewSignals: ReviewSignal[] = [],
  reviewSignalApplications: ReviewSignalApplication[] = []
): RuleCompetitionStats {
  const supportCount = aggregateStats?.supportCount ?? 0;
  const challengeCount = aggregateStats?.challengeCount ?? 0;
  const observedCount = aggregateStats?.observedCount ?? 0;
  const sourceSessionCount = aggregateStats?.sourceSessionCount ?? rule.sourceSessionIds.length;
  const relevantContradictions = contradictions.filter((item) => item.ruleId === rule.id);
  const relevantApplications = reviewSignalApplications.filter((item) => item.appliedToRuleIds.includes(rule.id));

  const supportWeight = supportCount * 1.8 + sourceSessionCount * 1.3 + observedCount * 0.35 + Math.max(sourceSessionCount - 1, 0) * 0.55;
  const challengeWeight = challengeCount * 2 + Math.max(challengeCount - 1, 0) * 0.45;

  const contradictionScore = relevantContradictions.reduce((sum, contradiction, index) => {
    const ageDays = relevantContradictions.length ? daysBetween(contradiction.createdAt, relevantContradictions[0].createdAt) : 0;
    const recencyMultiplier = clamp(1 - Math.min(ageDays, 6) * 0.05, 0.75, 1);
    return sum + CONTRADICTION_SEVERITY_WEIGHTS[contradiction.severity] * CONTRADICTION_TYPE_WEIGHTS[contradiction.contradictionType] * recencyMultiplier + index * 0.02;
  }, 0);

  const correctionPressure = relevantApplications.reduce((sum, application) => {
    const signal = reviewSignals.find((item) => item.id === application.reviewSignalId);
    const layer = signal?.targetLayer ?? rule.layer;
    const weight = CORRECTION_PRESSURE_WEIGHTS[layer];
    const forceBonus = application.didForceDowngrade ? RULE_COMPETITION_THRESHOLDS.boundaryForceCorrectionPressure : 0;
    return sum + weight + forceBonus;
  }, 0);

  const netScore = supportWeight - challengeWeight - contradictionScore - correctionPressure;
  const confidenceScore = clampCompetitionScore(
    (aggregateStats?.currentConfidence ?? rule.confidence) * 100 + supportWeight * 3 - challengeWeight * 5 - contradictionScore * 8 - correctionPressure * 4
  );
  const survivabilityScore = clampCompetitionScore(18 + netScore * 10 + sourceSessionCount * 6 + confidenceScore * 0.18 - contradictionScore * 7 - correctionPressure * 4);

  return {
    ruleId: rule.id,
    supportWeight,
    challengeWeight,
    netScore,
    contradictionScore,
    correctionPressure,
    confidenceScore,
    survivabilityScore
  };
}

function contradictionPressureScore(competitionStats: RuleCompetitionStats, contradictions: RuleContradiction[]) {
  const contradictionCount = contradictions.filter((item) => item.ruleId === competitionStats.ruleId).length;
  return competitionStats.contradictionScore + contradictionCount * 0.25;
}

export function evaluateGlobalRuleLifecycle(
  rule: PersonaRule,
  aggregateStats?: RuleAggregateStats | null,
  competitionStats?: RuleCompetitionStats | null,
  contradictions: RuleContradiction[] = []
): RuleLifecycleState {
  if (!aggregateStats && !competitionStats) return rule.status;

  const supportCount = aggregateStats?.supportCount ?? 0;
  const challengeCount = aggregateStats?.challengeCount ?? 0;
  const sourceSessionCount = aggregateStats?.sourceSessionCount ?? rule.sourceSessionIds.length;
  const currentConfidence = competitionStats?.confidenceScore ?? ((aggregateStats?.currentConfidence ?? rule.confidence) * 100);
  const stabilityScore = aggregateStats?.stabilityScore ?? 0;
  const netScore = competitionStats?.netScore ?? 0;
  const survivabilityScore = competitionStats?.survivabilityScore ?? 0;
  const contradictionScore = contradictionPressureScore(competitionStats ?? { ruleId: rule.id, supportWeight: 0, challengeWeight: 0, netScore: 0, contradictionScore: 0, correctionPressure: 0, confidenceScore: 0, survivabilityScore: 0 }, contradictions);
  const correctionPressure = competitionStats?.correctionPressure ?? 0;
  const hasHighSeverityContradiction = contradictions.some((item) => item.ruleId === rule.id && item.severity === "high");
  const mediumContradictions = contradictions.filter((item) => item.ruleId === rule.id && item.severity === "medium").length;
  const highContradictionCount = contradictions.filter((item) => item.ruleId === rule.id && item.severity === "high").length;

  if (hasHighSeverityContradiction || contradictionScore >= RULE_COMPETITION_THRESHOLDS.invalidationContradictionScore || survivabilityScore <= RULE_COMPETITION_THRESHOLDS.invalidatedMinSurvivability) {
    return "invalidated";
  }

  if (highContradictionCount >= RULE_FALSIFICATION_THRESHOLDS.highSeverityContradictionCount || contradictionScore >= RULE_COMPETITION_THRESHOLDS.contradictedContradictionScore) {
    return "contradicted";
  }

  if (challengeCount >= RULE_FALSIFICATION_THRESHOLDS.repeatedChallengeCount + 1 && netScore <= RULE_COMPETITION_THRESHOLDS.invalidatedMaxNetScore) {
    return "rejected";
  }

  if (challengeCount >= RULE_FALSIFICATION_THRESHOLDS.repeatedChallengeCount || correctionPressure >= RULE_COMPETITION_THRESHOLDS.downgradeContradictionScore) {
    return "challenged";
  }

  if (survivabilityScore <= RULE_COMPETITION_THRESHOLDS.challengedMinSurvivability || netScore <= RULE_COMPETITION_THRESHOLDS.challengedMaxNetScore) {
    return "challenged";
  }

  if (
    supportCount >= 4 &&
    sourceSessionCount >= 3 &&
    survivabilityScore >= RULE_COMPETITION_THRESHOLDS.stableMinSurvivability &&
    netScore >= RULE_COMPETITION_THRESHOLDS.stableMinNetScore &&
    contradictionScore <= 0.8 &&
    correctionPressure <= 1
  ) {
    return "stable";
  }

  if (
    supportCount >= 3 &&
    sourceSessionCount >= 2 &&
    currentConfidence >= 76 &&
    survivabilityScore >= RULE_COMPETITION_THRESHOLDS.acceptedMinSurvivability &&
    netScore >= RULE_COMPETITION_THRESHOLDS.acceptedMinNetScore &&
    contradictionScore <= 1.2 &&
    correctionPressure <= 1.4
  ) {
    return "accepted";
  }

  if (supportCount >= 2 && sourceSessionCount >= 1) {
    return "emerging";
  }

  if (supportCount >= 1 || mediumContradictions > 0) {
    return "candidate";
  }

  return challengeCount > 0 ? "challenged" : rule.status;
}

export function explainWhyRuleChanged(
  rule: PersonaRule,
  aggregateStats?: RuleAggregateStats | null,
  competitionStats?: RuleCompetitionStats | null,
  contradictions: RuleContradiction[] = []
) {
  const relevantContradictions = contradictions.filter((item) => item.ruleId === rule.id);
  const summaryParts = [
    `lifecycle=${rule.status}`,
    `support=${aggregateStats?.supportCount ?? 0}`,
    `challenge=${aggregateStats?.challengeCount ?? 0}`,
    `contradictions=${relevantContradictions.length}`,
    `pressure=${competitionStats?.correctionPressure.toFixed(2) ?? "0.00"}`,
    `net=${competitionStats?.netScore.toFixed(2) ?? "0.00"}`
  ];

  let explanation = "Rule remains in its current lifecycle.";
  if (rule.status === "invalidated") {
    explanation = "High-severity contradictions or sustained correction pressure pushed the rule out of the persona model.";
  } else if (rule.status === "contradicted") {
    explanation = "Competing evidence and contradictions overwhelmed the rule's support chain.";
  } else if (rule.status === "deprecated") {
    explanation = "Survivability dropped and support no longer offsets challenge and correction pressure.";
  } else if (rule.status === "challenged") {
    explanation = "Challenge weight or correction pressure is now competing with the rule's support.";
  } else if (rule.status === "stable") {
    explanation = "Multi-session support and low contradiction pressure keep the rule stable.";
  } else if (rule.status === "accepted") {
    explanation = "The rule has enough support to stay accepted, but it still needs monitoring.";
  }

  return {
    ruleId: rule.id,
    summary: explanation,
    details: summaryParts.join(" · "),
    contradictions: relevantContradictions.map((item) => item.summary)
  };
}
