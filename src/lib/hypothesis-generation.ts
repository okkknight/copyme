import type {
  AppState,
  HypothesisRule,
  HypothesisRuleStatus,
  HypothesisSourceType,
  PersonaLayer,
  PersonaRule,
  ReviewSignal,
  RuleContradiction,
  Session,
  SimulatedStudentProfile
} from "@/lib/types";
import { HYPOTHESIS_EVOLUTION_THRESHOLDS } from "@/lib/evolution-thresholds";
import { extractSessionInsightsV2 } from "@/lib/extractor-v2";

function nowIso() {
  return new Date().toISOString();
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function hashString(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/['"]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function deriveTopicKeyFromRuleText(text: string, layer: PersonaLayer): string {
  const lowered = normalizeText(text);

  if (layer === "boundary") {
    return lowered.includes("face") || lowered.includes("humiliation") || lowered.includes("sarcasm") || lowered.includes("public")
      ? "boundary_face_saving"
      : "boundary_face_saving";
  }

  if (lowered.includes("retry") || lowered.includes("another attempt") || lowered.includes("one more attempt")) {
    return "retry_strategy";
  }

  if (lowered.includes("diagnose") || lowered.includes("confidence") || lowered.includes("anxiety") || lowered.includes("nervous")) {
    return "confidence_diagnosis";
  }

  if (lowered.includes("pressure") || lowered.includes("strict") || lowered.includes("shortcut") || lowered.includes("precision") || lowered.includes("high-stakes")) {
    return "pressure_strategy";
  }

  if (lowered.includes("meaning") || lowered.includes("grammar") || lowered.includes("correction") || lowered.includes("accuracy")) {
    return "correction_order";
  }

  if (layer === "style" && (lowered.includes("reassurance") || lowered.includes("short") || lowered.includes("direct") || lowered.includes("concise"))) {
    return "style_directness";
  }

  if (lowered.includes("agency") || lowered.includes("practice") || lowered.includes("next step")) {
    return "learner_agency";
  }

  return layer === "style" ? "style_directness" : "correction_order";
}

function deriveTopicKeyFromContradiction(contradiction: RuleContradiction, rule?: PersonaRule): string {
  if (contradiction.contradictionType === "boundary_violation") return "boundary_face_saving";
  if (contradiction.contradictionType === "style_mismatch") return "style_directness";
  if (contradiction.contradictionType === "decision_mismatch") {
    const text = normalizeText(rule?.text ?? contradiction.summary);
    if (text.includes("diagnose") || text.includes("confidence") || text.includes("anxiety")) return "confidence_diagnosis";
    if (text.includes("retry") || text.includes("another attempt")) return "retry_strategy";
    if (text.includes("pressure") || text.includes("strict") || text.includes("precision") || text.includes("shortcut")) return "pressure_strategy";
    return "pressure_strategy";
  }
  const text = normalizeText(rule?.text ?? contradiction.summary);
  if (text.includes("meaning") || text.includes("grammar") || text.includes("correction")) return "correction_order";
  if (text.includes("diagnose") || text.includes("confidence") || text.includes("anxiety")) return "confidence_diagnosis";
  return "correction_order";
}

function deriveTopicKeyFromReviewSignal(signal: ReviewSignal) {
  if (signal.targetLayer === "boundary") return "boundary_face_saving";
  if (signal.targetLayer === "style") return "style_directness";
  if (signal.targetLayer === "decision") {
    const lowered = normalizeText(signal.description);
    if (lowered.includes("confidence") || lowered.includes("anxiety") || lowered.includes("nervous")) return "confidence_diagnosis";
    if (lowered.includes("retry") || lowered.includes("another attempt")) return "retry_strategy";
    if (lowered.includes("pressure") || lowered.includes("precision") || lowered.includes("strict")) return "pressure_strategy";
    return "correction_order";
  }
  return "correction_order";
}

function makeHypothesisId(topicKey: string, text: string, sourceIds: string[]) {
  const sortedSources = [...sourceIds].sort();
  return `hypothesis-${topicKey}-${slugify(text)}-${hashString(`${text}:${sortedSources.join("|")}`)}`;
}

function statusForHypothesis({
  sourceType,
  confidence,
  sourceSessionIds,
  evidenceTurnIds
}: {
  sourceType: HypothesisSourceType;
  confidence: number;
  sourceSessionIds: string[];
  evidenceTurnIds: string[];
}): HypothesisRuleStatus {
  if (sourceType === "review_signal") return confidence >= 0.84 ? "testing" : "candidate";
  if (confidence >= HYPOTHESIS_EVOLUTION_THRESHOLDS.acceptedConfidence && sourceSessionIds.length >= HYPOTHESIS_EVOLUTION_THRESHOLDS.acceptedSourceSessionCount) {
    return "accepted";
  }
  if (confidence >= HYPOTHESIS_EVOLUTION_THRESHOLDS.emergingConfidence && sourceSessionIds.length >= HYPOTHESIS_EVOLUTION_THRESHOLDS.emergingSourceSessionCount) {
    return "emerging";
  }
  if (confidence >= HYPOTHESIS_EVOLUTION_THRESHOLDS.testingConfidence && evidenceTurnIds.length >= HYPOTHESIS_EVOLUTION_THRESHOLDS.minimumEvidenceTurnCount) {
    return "testing";
  }
  return "candidate";
}

function createHypothesis(params: {
  layer: PersonaLayer;
  topicKey: string;
  text: string;
  sourceType: HypothesisSourceType;
  sourceIds: string[];
  parentRuleIds: string[];
  competingRuleIds: string[];
  confidence: number;
  rationale: string;
  evidenceTurnIds: string[];
  sourceSessionIds: string[];
}) {
  const id = makeHypothesisId(params.topicKey, params.text, params.sourceIds);
  const status = statusForHypothesis({
    sourceType: params.sourceType,
    confidence: params.confidence,
    sourceSessionIds: params.sourceSessionIds,
    evidenceTurnIds: params.evidenceTurnIds
  });
  const timestamp = nowIso();

  return {
    id,
    text: params.text,
    layer: params.layer,
    topicKey: params.topicKey,
    sourceType: params.sourceType,
    sourceIds: unique(params.sourceIds),
    parentRuleIds: unique(params.parentRuleIds),
    competingRuleIds: unique(params.competingRuleIds),
    status,
    confidence: clamp(params.confidence, 0.2, 0.98),
    createdAt: timestamp,
    updatedAt: timestamp,
    rationale: params.rationale,
    evidenceTurnIds: unique(params.evidenceTurnIds),
    sourceSessionIds: unique(params.sourceSessionIds)
  } satisfies HypothesisRule;
}

function buildCompetingRuleIds(rules: PersonaRule[], topicKey: string, layer: PersonaLayer, excludeRuleIds: string[] = []) {
  return rules.filter((rule) => rule.layer === layer && (rule.topicKey ?? deriveTopicKeyFromRuleText(rule.text, rule.layer)) === topicKey && !excludeRuleIds.includes(rule.id)).map((rule) => rule.id);
}

function contradictionConfidence(contradiction: RuleContradiction) {
  if (contradiction.severity === "high") return 0.92;
  if (contradiction.severity === "medium") return 0.82;
  return 0.74;
}

function buildHypothesesFromContradiction(contradiction: RuleContradiction, rule: PersonaRule | undefined, rules: PersonaRule[]) {
  if (!rule) return [];

  const topicKey = deriveTopicKeyFromContradiction(contradiction, rule);
  const competingRuleIds = buildCompetingRuleIds(rules, topicKey, rule.layer, [rule.id]);
  const sourceSessionIds = unique([contradiction.relatedSessionId ?? rule.lastObservedInSessionId ?? rule.sourceSessionIds[0], ...rule.sourceSessionIds]);
  const evidenceTurnIds = contradiction.relatedTurnIds ?? [];

  if (contradiction.contradictionType === "boundary_violation") {
    return [
      createHypothesis({
        layer: "boundary",
        topicKey,
        text: "Provides concise correction with face-preservation instead of public pushback.",
        sourceType: "contradiction",
        sourceIds: [contradiction.id],
        parentRuleIds: [rule.id],
        competingRuleIds,
        confidence: contradictionConfidence(contradiction),
        rationale: "Boundary contradiction suggests the teacher is protecting the student face while still being direct.",
        evidenceTurnIds,
        sourceSessionIds
      })
    ];
  }

  if (contradiction.contradictionType === "style_mismatch") {
    return [
      createHypothesis({
        layer: rule.layer,
        topicKey,
        text: "Uses short reassurance first, but switches to direct correction when the scenario requires precision.",
        sourceType: "contradiction",
        sourceIds: [contradiction.id],
        parentRuleIds: [rule.id],
        competingRuleIds,
        confidence: contradictionConfidence(contradiction) - 0.02,
        rationale: "Style mismatch suggests the style is situational rather than globally soft.",
        evidenceTurnIds,
        sourceSessionIds
      })
    ];
  }

  if (contradiction.contradictionType === "decision_mismatch") {
    return [
      createHypothesis({
        layer: "decision",
        topicKey,
        text: "Diagnoses confidence before correcting, but only for anxious learners.",
        sourceType: "contradiction",
        sourceIds: [contradiction.id],
        parentRuleIds: [rule.id],
        competingRuleIds,
        confidence: contradictionConfidence(contradiction),
        rationale: "Decision mismatch shows the teacher changes correction order when anxiety is the blocker.",
        evidenceTurnIds,
        sourceSessionIds
      }),
      createHypothesis({
        layer: "decision",
        topicKey,
        text: "Escalates only after repeated shortcut behavior in high-clarity tasks.",
        sourceType: "contradiction",
        sourceIds: [contradiction.id, `${contradiction.id}-alt`],
        parentRuleIds: [rule.id],
        competingRuleIds,
        confidence: contradictionConfidence(contradiction) - 0.04,
        rationale: "Repeated shortcut behavior may require a stricter pressure strategy rather than the default correction order.",
        evidenceTurnIds,
        sourceSessionIds
      })
    ];
  }

  return [
    createHypothesis({
      layer: rule.layer,
      topicKey,
      text: rule.layer === "decision" ? "Chooses correction order based on pressure and student confidence." : "Uses a situational explanation instead of a single global rule.",
      sourceType: "contradiction",
      sourceIds: [contradiction.id],
      parentRuleIds: [rule.id],
      competingRuleIds,
      confidence: contradictionConfidence(contradiction) - 0.03,
      rationale: "Generic contradiction indicates the current explanation may be too coarse.",
      evidenceTurnIds,
      sourceSessionIds
    })
  ];
}

function reviewSignalHypotheses(reviewSignal: ReviewSignal, state: Pick<AppState, "rules" | "sessions" | "reviewSignals" | "reviewSignalApplications" | "proxyReviewCases">) {
  const reviewCase = state.proxyReviewCases.find((item) => item.id === reviewSignal.reviewCaseId);
  const sourceSession = state.sessions.find(
    (session) =>
      (session.createdFromTemplateId === reviewCase?.studentTemplateId || session.studentTemplateId === reviewCase?.studentTemplateId) &&
      session.scenario === reviewCase?.scenario &&
      session.status !== "draft"
  );
  const matchedRule = state.rules.find((rule) => rule.layer === reviewSignal.targetLayer && normalizeText(rule.text).includes(deriveTopicKeyFromReviewSignal(reviewSignal).replace(/_/g, " ")));
  const topicKey = deriveTopicKeyFromReviewSignal(reviewSignal);
  const evidenceTurnIds = sourceSession ? sourceSession.transcript.filter((turn) => turn.speaker === "teacher").slice(-2).map((turn) => turn.id) : [];
  const sourceSessionIds = unique([sourceSession?.id ?? "", ...(matchedRule?.sourceSessionIds ?? [])]);
  const matchedRuleIds = matchedRule ? [matchedRule.id] : [];
  const needsHypothesis =
    reviewSignal.targetLayer === "boundary" ||
    reviewSignal.signalType === "decision_correction" ||
    (reviewSignal.signalType === "style_correction" && reviewCase?.selectedLabel !== "more_like_me");

  if (!needsHypothesis) return [];

  if (reviewSignal.targetLayer === "boundary") {
    return [
      createHypothesis({
        layer: "boundary",
        topicKey,
        text: "Keeps correction concise while preserving the student's face.",
        sourceType: "review_signal",
        sourceIds: [reviewSignal.id, reviewCase?.id ?? "unknown"],
        parentRuleIds: matchedRuleIds,
        competingRuleIds: buildCompetingRuleIds(state.rules, topicKey, "boundary", matchedRuleIds),
        confidence: 0.88,
        rationale: "Boundary review feedback suggests the proxy needs a more explicit face-preserving boundary policy.",
        evidenceTurnIds,
        sourceSessionIds
      })
    ];
  }

  if (reviewSignal.signalType === "decision_correction") {
    return [
      createHypothesis({
        layer: "decision",
        topicKey,
        text: "Keeps the human decision order but adapts the wording for the learner's pressure state.",
        sourceType: "review_signal",
        sourceIds: [reviewSignal.id, reviewCase?.id ?? "unknown"],
        parentRuleIds: matchedRuleIds,
        competingRuleIds: buildCompetingRuleIds(state.rules, topicKey, "decision", matchedRuleIds),
        confidence: 0.84,
        rationale: "Decision correction should refine the order of moves, not just the surface wording.",
        evidenceTurnIds,
        sourceSessionIds
      })
    ];
  }

  return [
    createHypothesis({
      layer: "style",
      topicKey,
      text: "Keeps the correction brief and direct when the scenario is already high precision.",
      sourceType: "review_signal",
      sourceIds: [reviewSignal.id, reviewCase?.id ?? "unknown"],
      parentRuleIds: matchedRuleIds,
      competingRuleIds: buildCompetingRuleIds(state.rules, topicKey, "style", matchedRuleIds),
      confidence: 0.8,
      rationale: "Style correction suggests the current explanation should stay direct but become more scenario-aware.",
      evidenceTurnIds,
      sourceSessionIds
    })
  ];
}

function sessionPatternHypotheses(session: Session, profile: SimulatedStudentProfile, rules: PersonaRule[]) {
  const extraction = extractSessionInsightsV2({
    session,
    profile,
    sessionRuleJudgments: [],
    reviewSignals: [],
    rules
  });

  return extraction.behaviorPatterns
    .filter((pattern) => pattern.strength >= 0.86)
    .map((pattern) => {
      const topicKey =
        pattern.patternId === "reassurance_before_correction"
          ? "style_directness"
          : pattern.patternId === "retry_before_explanation"
            ? "learner_agency"
            : pattern.patternId === "meaning_before_grammar"
              ? "correction_order"
              : pattern.patternId === "strict_escalation_after_repeated_same_error"
                ? "pressure_strategy"
                : "confidence_diagnosis";
      const layer: PersonaLayer =
        pattern.patternId === "reassurance_before_correction" || pattern.patternId === "retry_before_explanation"
          ? pattern.patternId === "retry_before_explanation"
            ? "value"
            : "style"
          : pattern.patternId === "meaning_before_grammar"
            ? "decision"
            : "decision";
      const candidateRuleIds = buildCompetingRuleIds(rules, topicKey, layer);
      const hypothesisText =
        pattern.patternId === "reassurance_before_correction"
          ? "Uses brief reassurance before moving into correction."
          : pattern.patternId === "retry_before_explanation"
            ? "Asks for a retry before introducing the explanation and protects learner agency."
            : pattern.patternId === "meaning_before_grammar"
              ? "Preserves meaning before tightening grammar."
              : pattern.patternId === "strict_escalation_after_repeated_same_error"
                ? "Escalates only after the same mistake repeats in the session."
                : "Diagnoses confidence before correcting.";

      return createHypothesis({
        layer,
        topicKey,
        text: hypothesisText,
        sourceType: "session_pattern",
        sourceIds: [session.id, pattern.patternId],
        parentRuleIds: candidateRuleIds,
        competingRuleIds: candidateRuleIds,
        confidence: pattern.strength,
        rationale: pattern.note,
        evidenceTurnIds: pattern.evidenceTurnIds,
        sourceSessionIds: [session.id]
      });
    });
}

export function generateHypothesesFromContradictions({
  contradictions,
  rules
}: {
  contradictions: RuleContradiction[];
  rules: PersonaRule[];
}) {
  return contradictions.flatMap((contradiction) => {
    const rule = rules.find((item) => item.id === contradiction.ruleId);
    return buildHypothesesFromContradiction(contradiction, rule, rules);
  });
}

export function generateHypothesesFromReviewSignals(
  state: Pick<AppState, "rules" | "sessions" | "reviewSignals" | "reviewSignalApplications" | "proxyReviewCases">
) {
  return state.reviewSignals
    .filter((signal) => signal.status === "applied")
    .flatMap((signal) => reviewSignalHypotheses(signal, state));
}

export function generateHypothesesFromSessionPatterns({
  sessions,
  rules
}: {
  sessions: Session[];
  rules: PersonaRule[];
}) {
  return sessions.flatMap((session) => {
    const profile = session.simulatedStudentProfile;
    return sessionPatternHypotheses(session, profile, rules);
  });
}

export function generateHypotheses({
  contradictions,
  rules,
  sessions,
  reviewSignals,
  reviewSignalApplications,
  proxyReviewCases
}: {
  contradictions: RuleContradiction[];
  rules: PersonaRule[];
  sessions: Session[];
  reviewSignals: ReviewSignal[];
  reviewSignalApplications: AppState["reviewSignalApplications"];
  proxyReviewCases: AppState["proxyReviewCases"];
}) {
  const state = {
    rules,
    sessions,
    reviewSignals,
    reviewSignalApplications,
    proxyReviewCases
  };

  return uniqueById([
    ...generateHypothesesFromContradictions({ contradictions, rules }),
    ...generateHypothesesFromReviewSignals(state),
    ...generateHypothesesFromSessionPatterns({ sessions, rules })
  ]);
}

function uniqueById<T extends { id: string }>(values: T[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value.id)) return false;
    seen.add(value.id);
    return true;
  });
}
