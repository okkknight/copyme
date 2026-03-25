import type { PersonaLayer, PersonaRule, Session, SimulatedStudentProfile, Turn } from "@/lib/types";
import { inferTeachingActions } from "@/lib/mock-engine";

export type ExtractedRuleBlueprint = PersonaRule;

export type ExtractorResult = {
  detectedTeachingBehaviors: string[];
  temporaryStyleNotes: string[];
  temporaryDecisionNotes: string[];
  candidateRuleIds: string[];
  candidateBlueprints: ExtractedRuleBlueprint[];
};

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

function nowIso() {
  return new Date().toISOString();
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildBlueprint(layer: PersonaLayer, text: string, confidence: number, sourceSessionId: string, evidence: string): ExtractedRuleBlueprint {
  return {
    id: makeRuleId(layer, text),
    text,
    layer,
    confidence,
    sourceSessionIds: [sourceSessionId],
    evidence,
    status: "candidate",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastObservedInSessionId: sourceSessionId
  };
}

function hasPattern(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function repeatedErrorPattern(turns: Turn[], profile: SimulatedStudentProfile) {
  const studentTurns = turns.filter((turn) => turn.speaker === "student");
  const repeated = studentTurns.filter((turn) => {
    const text = `${turn.text} ${turn.tags?.join(" ")}`.toLowerCase();
    return text.includes(profile.config.errorPattern) || text.includes("mistake") || text.includes("wrong") || text.includes("freeze");
  });
  return repeated.length >= 2;
}

function analyzeTeacherTurns(turns: Turn[], profile: SimulatedStudentProfile) {
  const detectedTeachingBehaviors = new Set<string>();
  const temporaryStyleNotes = new Set<string>();
  const temporaryDecisionNotes = new Set<string>();
  const blueprints: ExtractedRuleBlueprint[] = [];

  for (const turn of turns.filter((item) => item.speaker === "teacher")) {
    const text = turn.text.toLowerCase();
    const actions = inferTeachingActions(turn.text);

    if (hasPattern(text, [/(core idea|main idea|meaning first|focus on the message)/])) {
      detectedTeachingBehaviors.add("Meaning before grammar");
      temporaryDecisionNotes.add("Routes anxious learners through meaning first before tightening grammar.");
      blueprints.push(
        buildBlueprint(
          "decision",
          "Starts with meaning before grammar when the student is anxious or low confidence.",
          0.93,
          "",
          `Teacher said: ${turn.text}`
        )
      );
    }

    if (hasPattern(text, [/(don't worry|do not worry|take your time|it's okay|its okay)/])) {
      detectedTeachingBehaviors.add("Reassurance first");
      temporaryStyleNotes.add("Uses a calm entry point before correction.");
      blueprints.push(
        buildBlueprint(
          "style",
          "Uses short reassurance first, then narrows toward correction.",
          0.88,
          "",
          `Teacher said: ${turn.text}`
        )
      );
    }

    if (hasPattern(text, [/(one more|try again|say it again|another attempt|retry)/])) {
      detectedTeachingBehaviors.add("Retry before explanation");
      temporaryDecisionNotes.add("Prompts another attempt before giving a direct explanation.");
      blueprints.push(
        buildBlueprint(
          "decision",
          "Prioritizes student agency by asking for one more attempt before revealing the answer.",
          0.9,
          "",
          `Teacher said: ${turn.text}`
        )
      );
    }

    if (hasPattern(text, [/(for example|example|concrete example)/])) {
      detectedTeachingBehaviors.add("Example-first");
      temporaryStyleNotes.add("Prefers concrete examples over abstract explanation.");
      blueprints.push(
        buildBlueprint(
          "style",
          "Prefers examples over abstract explanation when the student is stuck.",
          0.84,
          "",
          `Teacher said: ${turn.text}`
        )
      );
    }

    if (hasPattern(text, [/(why|precision|specific|vague|clarity|finish the point)/])) {
      detectedTeachingBehaviors.add("Push precision");
      temporaryDecisionNotes.add("Pushes for concrete reasoning when the student coasts.");
      blueprints.push(
        buildBlueprint(
          "decision",
          "Escalates intensity only when the student is over-relying on shortcuts.",
          0.8,
          "",
          `Teacher said: ${turn.text}`
        )
      );
    }

    if (actions.includes("grammar_first")) {
      detectedTeachingBehaviors.add("Grammar correction");
      temporaryStyleNotes.add("Moves into correction language when precision is the active goal.");
    }
  }

  if (repeatedErrorPattern(turns, profile)) {
    detectedTeachingBehaviors.add("Strict escalation");
    temporaryDecisionNotes.add("Repeated mistakes trigger tighter control and more precision.");
    blueprints.push(
      buildBlueprint(
        "decision",
        "Becomes stricter after the same mistake appears twice in one session.",
        0.9,
        "",
        "Repeated student errors in a single session."
      )
    );
  }

  return {
    detectedTeachingBehaviors: Array.from(detectedTeachingBehaviors),
    temporaryStyleNotes: Array.from(temporaryStyleNotes),
    temporaryDecisionNotes: Array.from(temporaryDecisionNotes),
    candidateBlueprints: blueprints,
    candidateRuleIds: unique(blueprints.map((rule) => rule.id))
  };
}

export function extractSessionInsights(session: Session, profile: SimulatedStudentProfile, rules: PersonaRule[]): ExtractorResult {
  const transcript = session.transcript;
  const recentTurns = transcript.slice(-8);
  const result = analyzeTeacherTurns(recentTurns, profile);
  const existingById = new Set(rules.map((rule) => rule.id));
  const candidateBlueprints = result.candidateBlueprints.map((blueprint) => ({
    ...blueprint,
    sourceSessionIds: unique([session.id, ...blueprint.sourceSessionIds].filter(Boolean)),
    lastObservedInSessionId: session.id,
    updatedAt: nowIso()
  }));

  const candidateRuleIds = unique([
    ...result.candidateRuleIds.filter((ruleId) => existingById.has(ruleId)),
    ...candidateBlueprints.map((rule) => rule.id)
  ]);

  return {
    detectedTeachingBehaviors: result.detectedTeachingBehaviors,
    temporaryStyleNotes: result.temporaryStyleNotes,
    temporaryDecisionNotes: result.temporaryDecisionNotes,
    candidateRuleIds,
    candidateBlueprints
  };
}
