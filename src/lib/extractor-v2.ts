import type {
  BehaviorPatternId,
  CandidateRuleSeed,
  ExtractorV2Result,
  PersonaLayer,
  PersonaRule,
  ReviewSignal,
  Session,
  SessionRuleJudgment,
  SimulatedStudentProfile,
  TeachingActionTag,
  Turn
} from "@/lib/types";
import { inferTeachingActions } from "@/lib/mock-engine";

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

function makeRuleId(layer: PersonaLayer, text: string) {
  return `rule-${layer}-${slugify(text)}`;
}

function ruleStatusForSeed(rules: PersonaRule[] | undefined, ruleId: string) {
  const existing = rules?.find((rule) => rule.id === ruleId);
  if (existing?.status === "accepted" || existing?.status === "stable") return "observed" as const;
  if (existing?.status === "rejected") return "candidate" as const;
  return "candidate" as const;
}

function teacherActions(turn: Turn): TeachingActionTag[] {
  return turn.teachingActions?.length ? turn.teachingActions : inferTeachingActions(turn.text);
}

function studentErrorTurnIds(turns: Turn[], profile: SimulatedStudentProfile) {
  return turns
    .filter((turn) => turn.speaker === "student")
    .filter((turn) => {
      const text = `${turn.text} ${(turn.tags ?? []).join(" ")} ${(turn.ruleTriggers ?? []).join(" ")}`.toLowerCase();
      return (
        text.includes(profile.config.errorPattern) ||
        text.includes("mistake") ||
        text.includes("wrong") ||
        text.includes("freeze") ||
        text.includes("hesitation") ||
        text.includes("short") ||
        text.includes("half")
      );
    });
}

function buildSeed(params: {
  layer: PersonaLayer;
  text: string;
  confidence: number;
  behaviorPatternId: BehaviorPatternId;
  evidenceTurns: Turn[];
  note: string;
  session: Session;
  rules?: PersonaRule[];
  reviewSignals?: ReviewSignal[];
}) {
  const evidenceTurnIds = params.evidenceTurns.map((turn) => turn.id);
  const ruleId = makeRuleId(params.layer, params.text);
  const reviewBoost =
    params.reviewSignals?.filter((signal) => signal.status === "applied" && signal.targetLayer === params.layer).length ?? 0;
  const confidence = Math.min(0.98, params.confidence + reviewBoost * 0.02);
  return {
    id: ruleId,
    ruleId,
    text: params.text,
    layer: params.layer,
    confidence,
    behaviorPatternId: params.behaviorPatternId,
    evidenceTurnIds,
    evidenceSummary: params.note,
    sourceSessionIds: [params.session.id],
    status: ruleStatusForSeed(params.rules, ruleId),
    createdAt: nowIso(),
    updatedAt: nowIso()
  } satisfies CandidateRuleSeed;
}

function detectReassuranceBeforeCorrection(session: Session, profile: SimulatedStudentProfile, rules?: PersonaRule[], reviewSignals?: ReviewSignal[]) {
  const teacherTurns = session.transcript.filter((turn) => turn.speaker === "teacher");
  const reassureTurnIndex = teacherTurns.findIndex((turn) => teacherActions(turn).includes("reassure"));
  const correctionTurnIndex = teacherTurns.findIndex((turn, index) => index > reassureTurnIndex && (teacherActions(turn).includes("grammar_first") || teacherActions(turn).includes("correct") || teacherActions(turn).includes("push_precision")));

  if (reassureTurnIndex < 0 || correctionTurnIndex < 0) return null;

  const evidenceTurns = [teacherTurns[reassureTurnIndex], teacherTurns[correctionTurnIndex]].filter(Boolean);
  return buildSeed({
    layer: "style",
    text: "Uses reassurance before moving into correction.",
    confidence: profile.config.emotion === "anxious" ? 0.94 : 0.88,
    behaviorPatternId: "reassurance_before_correction",
    evidenceTurns,
    note: "Teacher establishes safety first, then narrows into correction.",
    session,
    rules,
    reviewSignals
  });
}

function detectRetryBeforeExplanation(session: Session, profile: SimulatedStudentProfile, rules?: PersonaRule[], reviewSignals?: ReviewSignal[]) {
  const teacherTurns = session.transcript.filter((turn) => turn.speaker === "teacher");
  const retryTurnIndex = teacherTurns.findIndex((turn) => teacherActions(turn).includes("retry"));
  const explanationTurnIndex = teacherTurns.findIndex(
    (turn, index) => index > retryTurnIndex && (teacherActions(turn).includes("example_first") || teacherActions(turn).includes("meaning_first") || teacherActions(turn).includes("push_precision") || teacherActions(turn).includes("grammar_first"))
  );

  if (retryTurnIndex < 0 || explanationTurnIndex < 0) return null;

  const evidenceTurns = [teacherTurns[retryTurnIndex], teacherTurns[explanationTurnIndex]].filter(Boolean);
  return buildSeed({
    layer: "decision",
    text: "Requests another attempt before explaining the answer.",
    confidence: profile.config.attitude === "smart-but-lazy" ? 0.91 : 0.88,
    behaviorPatternId: "retry_before_explanation",
    evidenceTurns,
    note: "Teacher asks for a retry first, then reveals the explanation or correction path.",
    session,
    rules,
    reviewSignals
  });
}

function detectMeaningBeforeGrammar(session: Session, profile: SimulatedStudentProfile, rules?: PersonaRule[], reviewSignals?: ReviewSignal[]) {
  const teacherTurns = session.transcript.filter((turn) => turn.speaker === "teacher");
  const meaningTurnIndex = teacherTurns.findIndex((turn) => teacherActions(turn).includes("meaning_first"));
  const grammarTurnIndex = teacherTurns.findIndex((turn, index) => index > meaningTurnIndex && (teacherActions(turn).includes("grammar_first") || teacherActions(turn).includes("correct")));
  const studentTurns = studentErrorTurnIds(session.transcript, profile);

  if (meaningTurnIndex < 0 || grammarTurnIndex < 0 || studentTurns.length === 0) return null;

  const evidenceTurns = [studentTurns[0], teacherTurns[meaningTurnIndex], teacherTurns[grammarTurnIndex]].filter(Boolean);
  return buildSeed({
    layer: "decision",
    text: "Keeps meaning intact before tightening grammar.",
    confidence: profile.config.emotion === "anxious" || profile.config.confidence === "low" ? 0.95 : 0.89,
    behaviorPatternId: "meaning_before_grammar",
    evidenceTurns,
    note: "Teacher protects the student's meaning first, then moves into grammatical refinement.",
    session,
    rules,
    reviewSignals
  });
}

function detectStrictEscalationAfterRepeatedSameError(session: Session, profile: SimulatedStudentProfile, rules?: PersonaRule[], reviewSignals?: ReviewSignal[]) {
  const studentTurns = studentErrorTurnIds(session.transcript, profile);
  if (studentTurns.length < 2) return null;

  const teacherTurns = session.transcript.filter((turn) => turn.speaker === "teacher");
  const softTurnIndex = teacherTurns.findIndex((turn) => teacherActions(turn).includes("reassure") || teacherActions(turn).includes("meaning_first"));
  const strictTurnIndex = teacherTurns.findIndex((turn, index) => index > softTurnIndex && (teacherActions(turn).includes("pressure") || teacherActions(turn).includes("push_precision") || teacherActions(turn).includes("grammar_first")));

  if (softTurnIndex < 0 || strictTurnIndex < 0) return null;

  const evidenceTurns = [studentTurns[0], studentTurns[1], teacherTurns[softTurnIndex], teacherTurns[strictTurnIndex]].filter(Boolean);
  return buildSeed({
    layer: "decision",
    text: "Becomes stricter after the same mistake repeats in the session.",
    confidence: 0.9,
    behaviorPatternId: "strict_escalation_after_repeated_same_error",
    evidenceTurns,
    note: "Repeated error patterns lead the teacher from gentler guidance into stricter precision control.",
    session,
    rules,
    reviewSignals
  });
}

function detectDiagnoseConfidenceBeforeCorrecting(session: Session, profile: SimulatedStudentProfile, rules?: PersonaRule[], reviewSignals?: ReviewSignal[]) {
  const teacherTurns = session.transcript.filter((turn) => turn.speaker === "teacher");
  const diagnoseTurnIndex = teacherTurns.findIndex((turn) => teacherActions(turn).includes("diagnose"));
  const correctionTurnIndex = teacherTurns.findIndex((turn, index) => index > diagnoseTurnIndex && (teacherActions(turn).includes("correct") || teacherActions(turn).includes("grammar_first") || teacherActions(turn).includes("push_precision")));

  if (diagnoseTurnIndex < 0 || correctionTurnIndex < 0) return null;

  const evidenceTurns = [teacherTurns[diagnoseTurnIndex], teacherTurns[correctionTurnIndex]].filter(Boolean);
  return buildSeed({
    layer: "decision",
    text: "Checks whether confidence or anxiety is the real blocker before correcting.",
    confidence: profile.config.emotion === "anxious" ? 0.95 : 0.9,
    behaviorPatternId: "diagnose_confidence_before_correcting",
    evidenceTurns,
    note: "Teacher diagnoses the student's blockage before entering correction mode.",
    session,
    rules,
    reviewSignals
  });
}

export function extractSessionInsightsV2({
  session,
  profile,
  sessionRuleJudgments,
  reviewSignals,
  rules
}: {
  session: Session;
  profile: SimulatedStudentProfile;
  sessionRuleJudgments?: SessionRuleJudgment[];
  reviewSignals?: ReviewSignal[];
  rules?: PersonaRule[];
}): ExtractorV2Result {
  const detectedTeachingBehaviors = new Set<string>();
  const temporaryStyleNotes = new Set<string>();
  const temporaryDecisionNotes = new Set<string>();
  const behaviorPatterns: ExtractorV2Result["behaviorPatterns"] = [];
  const candidateRuleSeeds: CandidateRuleSeed[] = [];
  const evidenceMapping: Record<string, string[]> = {};

  const patterns = [
    detectReassuranceBeforeCorrection(session, profile, rules, reviewSignals),
    detectRetryBeforeExplanation(session, profile, rules, reviewSignals),
    detectMeaningBeforeGrammar(session, profile, rules, reviewSignals),
    detectStrictEscalationAfterRepeatedSameError(session, profile, rules, reviewSignals),
    detectDiagnoseConfidenceBeforeCorrecting(session, profile, rules, reviewSignals)
  ].filter(Boolean) as CandidateRuleSeed[];

  for (const seed of patterns) {
    candidateRuleSeeds.push(seed);
    evidenceMapping[seed.behaviorPatternId] = seed.evidenceTurnIds;
    behaviorPatterns.push({
      patternId: seed.behaviorPatternId,
      label:
        seed.behaviorPatternId === "reassurance_before_correction"
          ? "Reassurance before correction"
          : seed.behaviorPatternId === "retry_before_explanation"
            ? "Retry before explanation"
            : seed.behaviorPatternId === "meaning_before_grammar"
              ? "Meaning before grammar"
              : seed.behaviorPatternId === "strict_escalation_after_repeated_same_error"
                ? "Strict escalation after repeated same error"
                : "Diagnose confidence before correcting",
      note: seed.evidenceSummary,
      evidenceTurnIds: seed.evidenceTurnIds,
      strength: seed.confidence
    });
  }

  for (const pattern of behaviorPatterns) {
    detectedTeachingBehaviors.add(pattern.label);
    if (pattern.patternId === "reassurance_before_correction") {
      temporaryStyleNotes.add("Teacher starts with safety and then narrows into correction.");
    }
    if (pattern.patternId === "retry_before_explanation") {
      temporaryDecisionNotes.add("Teacher asks for another attempt before explaining.");
    }
    if (pattern.patternId === "meaning_before_grammar") {
      temporaryDecisionNotes.add("Teacher preserves meaning before grammar tightening.");
    }
    if (pattern.patternId === "strict_escalation_after_repeated_same_error") {
      temporaryDecisionNotes.add("Repeated same-error evidence pushes the teacher into stricter control.");
    }
    if (pattern.patternId === "diagnose_confidence_before_correcting") {
      temporaryDecisionNotes.add("Teacher diagnoses confidence or anxiety before correcting.");
    }
  }

  if (sessionRuleJudgments?.some((judgment) => judgment.status === "accepted")) {
    temporaryStyleNotes.add("This session already supports an accepted global rule.");
  }
  if (reviewSignals?.some((signal) => signal.status === "applied")) {
    temporaryDecisionNotes.add("Review signals reinforce the correction path in this session.");
  }

  return {
    detectedTeachingBehaviors: Array.from(detectedTeachingBehaviors),
    behaviorPatterns,
    temporaryStyleNotes: Array.from(temporaryStyleNotes),
    temporaryDecisionNotes: Array.from(temporaryDecisionNotes),
    candidateRuleSeeds,
    evidenceMapping
  };
}
