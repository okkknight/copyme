import { buildObservedRuleSeedFromSignal } from "@/lib/review-signals";
import {
  buildRuleCompetitionStats,
  deriveContradictionsFromEvidenceAndSignals,
  evaluateGlobalRuleLifecycle as evaluateCompetitionLifecycle
} from "@/lib/rule-competition";
import {
  clampConfidence,
  RULE_LEARNING_THRESHOLDS,
  RULE_LEARNING_WEIGHTS
} from "@/lib/rule-thresholds";
import type {
  AppState,
  CandidateRuleSeed,
  PersonaLayer,
  PersonaModel,
  PersonaRule,
  ReviewSignal,
  ReviewSignalApplication,
  RuleAggregateStats,
  RuleEvidence,
  RuleEvidenceType,
  RuleLifecycleState,
  RuleStatus,
  Session,
  SessionRuleJudgment,
  SimulatedStudentProfile,
  Turn
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

function normalizedTokens(value: string) {
  return new Set(
    value
      .toLowerCase()
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
  );
}

function similarityScore(left: string, right: string) {
  const leftTokens = normalizedTokens(left);
  const rightTokens = normalizedTokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1;
  }
  return shared / Math.max(leftTokens.size, rightTokens.size);
}

function compareIso(a?: string, b?: string) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  return a.localeCompare(b);
}

function judgmentEvidenceType(status: RuleStatus): RuleEvidenceType {
  if (status === "rejected") return "challenge";
  return "support";
}

function judgmentConfidenceContribution(judgment: SessionRuleJudgment) {
  const base = judgment.confidence;
  if (judgment.status === "rejected") return -clamp(base * 0.82, 0.12, 0.9);
  if (judgment.status === "observed") return clamp(base * 0.4, 0.08, 0.35);
  if (judgment.status === "accepted") return clamp(base * 0.96, 0.1, 0.95);
  return clamp(base * 0.62, 0.08, 0.6);
}

function reviewConfidenceContribution(action: ReviewSignalApplication["action"], layer: PersonaLayer) {
  if (action === "challenge_existing_rule") {
    return layer === "boundary" ? -0.1 : -0.08;
  }
  if (action === "support_existing_rule") {
    return layer === "boundary" ? 0.06 : 0.04;
  }
  if (action === "spawn_candidate_seed") {
    return 0.02;
  }
  return 0;
}

function selectRecentTeacherTurns(session: Session, limit = 2) {
  return session.transcript.filter((turn) => turn.speaker === "teacher").slice(-limit);
}

function findMatchingSourceSession(state: Pick<AppState, "sessions" | "proxyReviewCases">, reviewSignal: ReviewSignal) {
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

function selectCandidateRulesForSignal(state: Pick<AppState, "rules">, reviewSignal: ReviewSignal) {
  const sameLayer = state.rules.filter((rule) => rule.layer === reviewSignal.targetLayer);
  const ranked = sameLayer
    .map((rule) => ({
      rule,
      score:
        similarityScore(rule.text, reviewSignal.description) +
        (rule.status === "stable" ? 0.12 : rule.status === "accepted" ? 0.08 : rule.status === "challenged" ? -0.06 : 0) +
        (reviewSignal.signalType === "boundary_correction" && rule.layer === "boundary" ? 0.08 : 0)
    }))
    .sort((left, right) => right.score - left.score);

  return ranked.filter((item) => item.score >= 0.14).slice(0, 2).map((item) => item.rule);
}

function decideReviewAction(reviewSignal: ReviewSignal, matchedRules: PersonaRule[]) {
  const lowered = reviewSignal.description.toLowerCase();
  const isDrift = /(drift|too soft|too direct|not like me|off|generic|boundary)/.test(lowered);
  const isSupportive = /(close|minimal polish|keep|preserve|maintain|already)/.test(lowered);

  if (!matchedRules.length) {
    return "spawn_candidate_seed" as const;
  }

  if (reviewSignal.signalType === "boundary_correction") {
    return isSupportive ? "support_existing_rule" : "challenge_existing_rule";
  }

  if (reviewSignal.signalType === "decision_correction") {
    if (isSupportive) return "support_existing_rule";
    if (isDrift) return "challenge_existing_rule";
    return "challenge_existing_rule";
  }

  if (reviewSignal.signalType === "style_correction") {
    if (isSupportive) return "support_existing_rule";
    return isDrift ? "challenge_existing_rule" : "support_existing_rule";
  }

  return "no_effect";
}

export function buildRuleEvidenceFromJudgment({
  session,
  judgment
}: {
  session: Session;
  judgment: SessionRuleJudgment;
}): RuleEvidence {
  return {
    id: `evidence-judgment-${judgment.id}`,
    ruleId: judgment.ruleId,
    sessionId: session.id,
    judgmentId: judgment.id,
    judgmentStatus: judgment.status,
    turnIds: unique(judgment.evidenceTurnIds),
    evidenceType: judgmentEvidenceType(judgment.status),
    confidenceContribution: judgmentConfidenceContribution(judgment),
    summary: judgment.note ?? `Session ${session.id} judged rule ${judgment.ruleId} as ${judgment.status}.`,
    createdAt: judgment.updatedAt ?? judgment.createdAt
  };
}

function buildReviewEvidence({
  signal,
  application,
  session,
  ruleId
}: {
  signal: ReviewSignal;
  application: ReviewSignalApplication;
  session: Session;
  ruleId: string;
}): RuleEvidence {
  const teacherTurns = selectRecentTeacherTurns(session, 2);
  const turnIds = unique([
    ...teacherTurns.map((turn) => turn.id),
    ...session.keyMoments
      .slice(0, 2)
      .map((_, index) => session.transcript[index]?.id)
      .filter(Boolean)
  ]);

  return {
    id: `evidence-review-${signal.id}-${ruleId}`,
    ruleId,
    sessionId: session.id,
    reviewSignalId: signal.id,
    reviewSignalApplicationId: application.id,
    turnIds,
    evidenceType: application.action === "spawn_candidate_seed" ? "review_correction" : application.action === "support_existing_rule" ? "support" : "challenge",
    confidenceContribution: reviewConfidenceContribution(application.action, signal.targetLayer),
    summary: `${signal.signalType} applied to ${signal.targetLayer} for ${signal.reviewCaseId}: ${signal.description}`,
    createdAt: application.createdAt
  };
}

export function applyReviewSignal({
  reviewSignal,
  state
}: {
  reviewSignal: ReviewSignal;
  state: Pick<AppState, "rules" | "sessions" | "proxyReviewCases" | "reviewSignals">;
}): {
  application: ReviewSignalApplication;
  createdEvidences: RuleEvidence[];
  spawnedCandidateSeeds: CandidateRuleSeed[];
} {
  const sourceSession = findMatchingSourceSession(state, reviewSignal);
  const matchedRules = selectCandidateRulesForSignal(state, reviewSignal);
  const action = reviewSignal.status === "ignored" ? ("no_effect" as const) : decideReviewAction(reviewSignal, matchedRules);
  const reviewCase = state.proxyReviewCases.find((item) => item.id === reviewSignal.reviewCaseId);
  const selectedLabel = reviewCase?.selectedLabel;
  const forceBoundaryCorrection = reviewSignal.signalType === "boundary_correction" && (selectedLabel === "not_like_me" || selectedLabel === "totally_off");
  const createdAt = reviewSignal.createdAt;

  if (action === "no_effect") {
    return {
      application: {
        id: `review-application-${reviewSignal.id}`,
        reviewSignalId: reviewSignal.id,
        appliedToRuleIds: [],
        createdEvidenceIds: [],
        action,
        note: `Review signal ${reviewSignal.id} was not applied to the learning loop.`,
        createdAt,
        didForceDowngrade: false,
        createdContradictionIds: []
      },
      createdEvidences: [],
      spawnedCandidateSeeds: []
    };
  }

  if (action === "spawn_candidate_seed") {
    const spawnedSeed = buildObservedRuleSeedFromSignal(reviewSignal, sourceSession.id);
    const application: ReviewSignalApplication = {
      id: `review-application-${reviewSignal.id}`,
      reviewSignalId: reviewSignal.id,
      appliedToRuleIds: [spawnedSeed.ruleId],
      createdEvidenceIds: [`evidence-review-${reviewSignal.id}-${spawnedSeed.ruleId}`],
      action,
      note: `Review signal ${reviewSignal.id} spawned a candidate seed for ${reviewSignal.targetLayer}.`,
      createdAt,
      spawnedCandidateRuleIds: [spawnedSeed.ruleId],
      didForceDowngrade: forceBoundaryCorrection,
      createdContradictionIds: forceBoundaryCorrection ? [`contradiction-${spawnedSeed.ruleId}-review-${reviewSignal.id}`] : []
    };

    return {
      application,
      createdEvidences: [buildReviewEvidence({ signal: reviewSignal, application, session: sourceSession, ruleId: spawnedSeed.ruleId })],
      spawnedCandidateSeeds: [spawnedSeed]
    };
  }

  const appliedToRuleIds = matchedRules.map((rule) => rule.id);
  const application: ReviewSignalApplication = {
    id: `review-application-${reviewSignal.id}`,
    reviewSignalId: reviewSignal.id,
    appliedToRuleIds,
    createdEvidenceIds: appliedToRuleIds.map((ruleId) => `evidence-review-${reviewSignal.id}-${ruleId}`),
    action,
    note: `${forceBoundaryCorrection ? "Boundary correction" : `Review signal ${reviewSignal.id}`} ${action === "support_existing_rule" ? "supported" : "challenged"} ${appliedToRuleIds.length} existing rule(s) in ${reviewSignal.targetLayer}.`,
    createdAt,
    didForceDowngrade: forceBoundaryCorrection || (action === "challenge_existing_rule" && reviewSignal.targetLayer === "boundary"),
    createdContradictionIds: forceBoundaryCorrection ? appliedToRuleIds.map((ruleId) => `contradiction-${ruleId}-review-${reviewSignal.id}`) : []
  };

  return {
    application,
    createdEvidences: appliedToRuleIds.map((ruleId) => buildReviewEvidence({ signal: reviewSignal, application, session: sourceSession, ruleId })),
    spawnedCandidateSeeds: []
  };
}

export function buildRuleAggregateStats(
  rules: PersonaRule[],
  evidences: RuleEvidence[],
  reviewSignalApplications: ReviewSignalApplication[]
): RuleAggregateStats[] {
  const statsByRule = new Map<string, RuleAggregateStats>();

  for (const rule of rules) {
    statsByRule.set(rule.id, {
      ruleId: rule.id,
      supportCount: 0,
      challengeCount: 0,
      observedCount: 0,
      reviewCorrectionCount: 0,
      sourceSessionCount: 0,
      sourceSessionIds: [],
      currentConfidence: rule.confidence,
      stabilityScore: 0
    });
  }

  for (const evidence of evidences) {
    const existing =
      statsByRule.get(evidence.ruleId) ??
      ({
        ruleId: evidence.ruleId,
        supportCount: 0,
        challengeCount: 0,
        observedCount: 0,
        reviewCorrectionCount: 0,
        sourceSessionCount: 0,
        sourceSessionIds: [],
        currentConfidence: 0.5,
        stabilityScore: 0
      } satisfies RuleAggregateStats);

    if (!statsByRule.has(evidence.ruleId)) {
      statsByRule.set(evidence.ruleId, existing);
    }

    existing.sourceSessionIds = unique([...existing.sourceSessionIds, evidence.sessionId]);
    existing.sourceSessionCount = existing.sourceSessionIds.length;
    existing.latestEvidenceAt = compareIso(existing.latestEvidenceAt, evidence.createdAt) >= 0 ? existing.latestEvidenceAt : evidence.createdAt;

    if (evidence.evidenceType === "support") {
      existing.supportCount += 1;
      existing.lastSupportedAt = compareIso(existing.lastSupportedAt, evidence.createdAt) >= 0 ? existing.lastSupportedAt : evidence.createdAt;
    } else if (evidence.evidenceType === "challenge") {
      existing.challengeCount += 1;
      existing.lastChallengedAt = compareIso(existing.lastChallengedAt, evidence.createdAt) >= 0 ? existing.lastChallengedAt : evidence.createdAt;
    } else {
      existing.reviewCorrectionCount += 1;
    }

    if (evidence.judgmentStatus === "observed") {
      existing.observedCount += 1;
    }
  }

  return Array.from(statsByRule.values()).map((stats) => {
    const baseRule = rules.find((rule) => rule.id === stats.ruleId);
    const baseConfidence = baseRule?.baseConfidence ?? baseRule?.confidence ?? 0.5;
    const evidenceDelta = evidences
      .filter((evidence) => evidence.ruleId === stats.ruleId)
      .reduce((sum, evidence) => sum + evidence.confidenceContribution, 0);
    const sourceSessionBonus = stats.sourceSessionCount * RULE_LEARNING_WEIGHTS.sourceSessionBonus;
    const reviewBump = stats.reviewCorrectionCount * RULE_LEARNING_WEIGHTS.reviewCorrectionConfidence * 0.4;
    const supportBump = stats.supportCount * RULE_LEARNING_WEIGHTS.supportConfidence;
    const observedBump = stats.observedCount * RULE_LEARNING_WEIGHTS.observedConfidence;
    const challengePenalty = stats.challengeCount * RULE_LEARNING_WEIGHTS.challengeConfidence;

    stats.currentConfidence = clampConfidence(
      baseConfidence +
        evidenceDelta +
        supportBump +
        observedBump +
        reviewBump +
        sourceSessionBonus -
        challengePenalty
    );

    const balance = stats.supportCount - stats.challengeCount;
    stats.stabilityScore = clamp(
      0,
      100,
      18 +
        stats.supportCount * RULE_LEARNING_WEIGHTS.supportStability +
        stats.sourceSessionCount * RULE_LEARNING_WEIGHTS.sourceSessionStability +
        Math.max(balance, 0) * 4 -
        stats.challengeCount * RULE_LEARNING_WEIGHTS.challengeStability -
        stats.reviewCorrectionCount * RULE_LEARNING_WEIGHTS.reviewCorrectionStability
    );

    return stats;
  });
}

export function evaluateGlobalRuleLifecycle(rule: PersonaRule, aggregateStats?: RuleAggregateStats | null): RuleLifecycleState {
  if (!aggregateStats) return rule.status;

  const { supportCount, challengeCount, sourceSessionCount, currentConfidence, stabilityScore, reviewCorrectionCount } = aggregateStats;

  if (challengeCount >= RULE_LEARNING_THRESHOLDS.rejectedChallengeCount && supportCount === 0 && currentConfidence <= RULE_LEARNING_THRESHOLDS.lowConfidenceForRejected) {
    return "rejected";
  }

  if (challengeCount >= RULE_LEARNING_THRESHOLDS.deprecatedChallengeCount && currentConfidence <= RULE_LEARNING_THRESHOLDS.lowConfidenceForDeprecated) {
    return "deprecated";
  }

  if (challengeCount >= RULE_LEARNING_THRESHOLDS.challengedChallengeCount && challengeCount > supportCount) {
    return "challenged";
  }

  if (
    supportCount >= RULE_LEARNING_THRESHOLDS.stableSupportCount &&
    sourceSessionCount >= RULE_LEARNING_THRESHOLDS.stableSourceSessionCount &&
    stabilityScore >= RULE_LEARNING_THRESHOLDS.stableStabilityScore &&
    currentConfidence >= RULE_LEARNING_THRESHOLDS.stableConfidence &&
    challengeCount <= 1
  ) {
    return "stable";
  }

  if (
    supportCount >= RULE_LEARNING_THRESHOLDS.acceptedSupportCount &&
    sourceSessionCount >= RULE_LEARNING_THRESHOLDS.acceptedSourceSessionCount &&
    currentConfidence >= RULE_LEARNING_THRESHOLDS.acceptedConfidence &&
    challengeCount <= RULE_LEARNING_THRESHOLDS.acceptedMaxChallengeCount
  ) {
    return "accepted";
  }

  if (supportCount >= RULE_LEARNING_THRESHOLDS.emergingSupportCount && sourceSessionCount >= RULE_LEARNING_THRESHOLDS.emergingSourceSessionCount) {
    return "emerging";
  }

  if (supportCount >= RULE_LEARNING_THRESHOLDS.candidateSupportCount || reviewCorrectionCount > 0) {
    return "candidate";
  }

  return challengeCount > 0 ? "challenged" : rule.status;
}

function uniqueById<T extends { id: string }>(values: T[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value.id)) return false;
    seen.add(value.id);
    return true;
  });
}

function buildLearningRuleEvidence(state: Pick<AppState, "sessions" | "sessionRuleJudgments" | "reviewSignals" | "reviewSignalApplications" | "rules" | "proxyReviewCases">) {
  const judgmentEvidences = state.sessions.flatMap((session) =>
    state.sessionRuleJudgments
      .filter((judgment) => judgment.sessionId === session.id)
      .map((judgment) => buildRuleEvidenceFromJudgment({ session, judgment }))
  );

  const appliedSignals = state.reviewSignals.filter((signal) => signal.status === "applied");
  const reviewApplications = appliedSignals.map((signal) => applyReviewSignal({ reviewSignal: signal, state }).application);
  const applicationById = new Map(reviewApplications.map((application) => [application.reviewSignalId, application]));

  const reviewEvidences = appliedSignals.flatMap((signal) => {
    const application = applicationById.get(signal.id);
    if (!application) return [];
    const result = applyReviewSignal({ reviewSignal: signal, state });
    return result.createdEvidences;
  });

  return {
    ruleEvidences: uniqueById([...judgmentEvidences, ...reviewEvidences]),
    reviewSignalApplications: uniqueById(reviewApplications)
  };
}

function buildNextRules(state: Pick<AppState, "rules" | "sessions" | "sessionRuleJudgments" | "reviewSignals" | "reviewSignalApplications" | "proxyReviewCases">) {
  const learningEvidence = buildLearningRuleEvidence(state);
  const allEvidences = learningEvidence.ruleEvidences;
  const nextRules = [...state.rules];
  const candidateSeedRules = new Map<string, PersonaRule>();

  for (const signal of state.reviewSignals.filter((item) => item.status === "applied")) {
    const result = applyReviewSignal({ reviewSignal: signal, state });
    for (const seed of result.spawnedCandidateSeeds) {
      const existing = nextRules.find((rule) => rule.id === seed.ruleId);
      if (existing) continue;

      candidateSeedRules.set(seed.ruleId, {
        id: seed.ruleId,
        text: seed.text,
        layer: seed.layer,
        confidence: seed.confidence,
        baseConfidence: seed.confidence,
        sourceSessionIds: unique(seed.sourceSessionIds),
        evidence: seed.evidenceSummary,
        status: "candidate",
        createdAt: seed.createdAt,
        updatedAt: seed.updatedAt,
        lastObservedInSessionId: seed.sourceSessionIds[0]
      });
    }
  }

  for (const rule of candidateSeedRules.values()) {
    nextRules.push(rule);
  }

  const contradictions = deriveContradictionsFromEvidenceAndSignals({
    sessions: state.sessions,
    sessionRuleJudgments: state.sessionRuleJudgments,
    ruleEvidences: allEvidences,
    reviewSignals: state.reviewSignals,
    reviewSignalApplications: learningEvidence.reviewSignalApplications,
    rules: nextRules,
    proxyReviewCases: state.proxyReviewCases
  });

  const aggregateStats = buildRuleAggregateStats(nextRules, allEvidences, learningEvidence.reviewSignalApplications);
  const aggregateStatsMap = new Map(aggregateStats.map((stats) => [stats.ruleId, stats]));
  const competitionStats = nextRules.map((rule) =>
    buildRuleCompetitionStats(rule, aggregateStatsMap.get(rule.id), contradictions, state.reviewSignals, learningEvidence.reviewSignalApplications)
  );
  const competitionStatsMap = new Map(competitionStats.map((stats) => [stats.ruleId, stats]));

  const updatedRules = nextRules.map((rule) => {
    const stats = aggregateStatsMap.get(rule.id);
    const competition = competitionStatsMap.get(rule.id);
    if (!stats) {
      return rule;
    }

    const lifecycle = evaluateCompetitionLifecycle(rule, stats, competition, contradictions);
    const latestEvidence = allEvidences
      .filter((evidence) => evidence.ruleId === rule.id)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .at(-1);
    const sourceSessionIds = unique([...rule.sourceSessionIds, ...stats.sourceSessionIds]);
    const evidenceSummary = [
      `Support: ${stats.supportCount}`,
      `Challenge: ${stats.challengeCount}`,
      `Observed: ${stats.observedCount}`,
      `Review corrections: ${stats.reviewCorrectionCount}`,
      `Sessions: ${stats.sourceSessionCount}`
    ].join(" · ");

    return {
      ...rule,
      baseConfidence: rule.baseConfidence ?? rule.confidence,
      sourceSessionIds,
      confidence: competition ? competition.confidenceScore / 100 : stats.currentConfidence,
      evidence: evidenceSummary,
      status: lifecycle,
      updatedAt: latestEvidence?.createdAt ?? rule.updatedAt ?? rule.createdAt,
      lastObservedInSessionId:
        latestEvidence?.sessionId ?? rule.lastObservedInSessionId ?? stats.sourceSessionIds.at(-1) ?? rule.lastObservedInSessionId
    };
  });

  const personaModel: PersonaModel = {
    version: updatedRules.filter((rule) => rule.status === "stable" || rule.status === "accepted").length >= 8 ? "v0.4" : updatedRules.filter((rule) => rule.status === "stable" || rule.status === "accepted").length >= 5 ? "v0.3" : "v0.2",
    updatedAt:
      updatedRules
        .map((rule) => rule.updatedAt ?? rule.createdAt)
        .sort()
        .at(-1) ??
      state.reviewSignals
        .map((signal) => signal.createdAt)
        .sort()
        .at(-1) ??
      state.sessions
        .map((session) => session.endedAt ?? session.startedAt)
        .sort()
        .at(-1) ??
      nowIso(),
    maturity: clamp(
      0,
      100,
      14 +
        updatedRules.filter((rule) => rule.status === "stable" || rule.status === "accepted").length * 5 +
        unique(updatedRules.flatMap((rule) => rule.sourceSessionIds)).length * 3 +
        learningEvidence.reviewSignalApplications.length * 2
    ),
    sourceSessionIds: unique(updatedRules.filter((rule) => rule.status === "stable" || rule.status === "accepted").flatMap((rule) => rule.sourceSessionIds)),
    acceptedRuleIds: updatedRules.filter((rule) => rule.status === "stable" || rule.status === "accepted").map((rule) => rule.id),
    styleRuleIds: updatedRules.filter((rule) => (rule.status === "stable" || rule.status === "accepted") && rule.layer === "style").map((rule) => rule.id),
    decisionRuleIds: updatedRules.filter((rule) => (rule.status === "stable" || rule.status === "accepted") && rule.layer === "decision").map((rule) => rule.id),
    valueRuleIds: updatedRules.filter((rule) => (rule.status === "stable" || rule.status === "accepted") && rule.layer === "value").map((rule) => rule.id),
    boundaryRuleIds: updatedRules.filter((rule) => (rule.status === "stable" || rule.status === "accepted") && rule.layer === "boundary").map((rule) => rule.id),
    reviewSignalAppliedCount: learningEvidence.reviewSignalApplications.length,
    activeRuleIds: updatedRules.filter((rule) => rule.status === "stable" || rule.status === "accepted").map((rule) => rule.id),
    atRiskRuleIds: updatedRules.filter((rule) => ["challenged", "contradicted", "deprecated", "invalidated"].includes(rule.status)).map((rule) => rule.id),
    hypothesisRuleIds: [],
    competitionGroupIds: [],
    replacementRecordIds: [],
    dominantRuleIds: updatedRules.filter((rule) => rule.status === "stable").map((rule) => rule.id),
    fragileRuleIds: updatedRules.filter((rule) => rule.status === "accepted").map((rule) => rule.id),
    contestedRuleIds: updatedRules.filter((rule) => rule.status === "challenged").map((rule) => rule.id),
    fadingRuleIds: updatedRules.filter((rule) => ["deprecated", "invalidated"].includes(rule.status)).map((rule) => rule.id),
    competitionGroupEcologyIds: [],
    ruleDecayRecordIds: []
  };

  return {
    ruleEvidences: allEvidences,
    reviewSignalApplications: learningEvidence.reviewSignalApplications.map((application) => {
      const createdContradictionIds = contradictions
        .filter((contradiction) => contradiction.sourceType === "review_signal" && contradiction.sourceId === application.reviewSignalId)
        .map((contradiction) => contradiction.id);
      return {
        ...application,
        didForceDowngrade: application.didForceDowngrade || createdContradictionIds.some(Boolean),
        createdContradictionIds: unique([...(application.createdContradictionIds ?? []), ...createdContradictionIds])
      };
    }),
    ruleAggregateStats: aggregateStats,
    ruleCompetitionStats: competitionStats,
    ruleContradictions: contradictions,
    rules: updatedRules,
    personaModel
  };
}

export function buildLearningArtifacts(state: Pick<AppState, "sessions" | "sessionRuleJudgments" | "reviewSignals" | "reviewSignalApplications" | "rules" | "proxyReviewCases">) {
  return buildNextRules(state);
}

export function runLearningPass(state: AppState) {
  return buildLearningArtifacts(state);
}

export function recordSessionJudgmentEvidenceForSession(state: AppState, sessionId: string) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) {
    return buildLearningArtifacts(state);
  }

  const nextState = {
    ...state,
    sessionRuleJudgments: state.sessionRuleJudgments.filter((judgment) => judgment.sessionId === sessionId || judgment.sessionId !== sessionId)
  } as AppState;

  return buildLearningArtifacts(nextState);
}
