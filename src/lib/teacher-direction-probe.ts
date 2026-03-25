import { inspectSimilarity, type SimilarityStudentProfile } from "@/lib/similarity-evaluator";
import type { DirectionConflictProbe } from "@/lib/types";

type ProbeInput = {
  teacherResponse: string;
  proxyResponse: string;
  studentProfile?: SimilarityStudentProfile | string;
  scenario?: string;
};

function normalizeText(value: string) {
  return value.toLowerCase().replace(/['"]/g, "").replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
}

function scoreContains(text: string, phrases: string[]) {
  const normalized = normalizeText(text);
  return phrases.reduce((score, phrase) => (normalized.includes(normalizeText(phrase)) ? score + 1 : score), 0);
}

function studentFlags(studentProfile?: SimilarityStudentProfile | string, scenario?: string) {
  const profileText =
    typeof studentProfile === "string"
      ? studentProfile
      : [studentProfile?.name, studentProfile?.defaultAttitude, studentProfile?.defaultEmotion, studentProfile?.defaultConfidence]
          .filter(Boolean)
          .join(" ");
  const profile = normalizeText(profileText);
  const scenarioText = normalizeText(scenario ?? "");
  return {
    anxious: profile.includes("anxious") || profile.includes("shy") || profile.includes("low confidence") || profile.includes("self conscious"),
    frozen: profile.includes("frozen") || profile.includes("hesitant") || profile.includes("quiet"),
    resistant: profile.includes("resistant") || profile.includes("argumentative"),
    interview: scenarioText.includes("interview"),
    debate: scenarioText.includes("debate") || scenarioText.includes("opinion"),
    story: scenarioText.includes("story")
  };
}

function pickTopDirection(entries: Array<[string, number]>) {
  return [...entries].sort((left, right) => right[1] - left[1])[0];
}

function directionScores(text: string, kind: "teacher" | "proxy", flags: ReturnType<typeof studentFlags>) {
  const normalized = normalizeText(text);
  const meaningFirst =
    scoreContains(normalized, ["main idea", "meaning", "keep speaking", "one concrete example", "focus on the main idea", "let's stay with one more concrete step"]) +
    (flags.anxious || flags.frozen ? 1.2 : 0);
  const grammarFirst =
    scoreContains(normalized, ["grammar", "past tense", "correct grammar", "fix the wording", "correct it now", "precision", "be precise"]) +
    (kind === "proxy" && flags.debate ? 0.8 : 0);
  const reassureFirst = scoreContains(normalized, ["don't worry", "good start", "nice start", "calm", "supportive", "together", "keep speaking"]);
  const correctionFirst = scoreContains(normalized, ["correct", "wrong", "fix", "you should know", "must", "need to", "pressure", "push"]);
  const faceSaving = scoreContains(normalized, ["privately", "face", "supportive", "respect", "gentle", "calm", "don't worry", "good start"]);
  const publicDirectness = scoreContains(normalized, ["in front of everyone", "public", "obviously", "shame", "humiliate", "you should know", "harsh"]);
  const diagnoseStateFirst = scoreContains(normalized, ["diagnose", "what's making", "anxiety", "confidence", "blocker", "why", "before correcting", "let's diagnose"]);
  const pushPrecisionFirst = scoreContains(normalized, ["be precise", "correct it now", "must", "need to", "grammar", "precision", "pressure"]);
  const keepSpeaking = scoreContains(normalized, ["keep speaking", "continue", "one more attempt", "stay with", "keep going"]);
  const closeMoveOn = scoreContains(normalized, ["move on", "next", "release", "skip", "let's move on"]);

  const base = [
    ["meaning_first", meaningFirst],
    ["grammar_first", grammarFirst],
    ["reassure_first", reassureFirst],
    ["correction_first", correctionFirst],
    ["face_saving", faceSaving],
    ["public_directness", publicDirectness],
    ["diagnose_state_first", diagnoseStateFirst],
    ["push_precision_first", pushPrecisionFirst],
    ["keep_speaking", keepSpeaking],
    ["close_move_on", closeMoveOn]
  ] as Array<[string, number]>;

  if (flags.interview) {
    base.forEach((entry) => {
      if (entry[0] === "face_saving" || entry[0] === "reassure_first" || entry[0] === "diagnose_state_first" || entry[0] === "keep_speaking") {
        entry[1] += 0.8;
      }
    });
  }

  if (flags.anxious || flags.frozen) {
    base.forEach((entry) => {
      if (entry[0] === "face_saving" || entry[0] === "reassure_first" || entry[0] === "diagnose_state_first" || entry[0] === "keep_speaking") {
        entry[1] += 0.6;
      }
    });
  }

  if (flags.debate || flags.resistant) {
    base.forEach((entry) => {
      if (entry[0] === "push_precision_first" || entry[0] === "grammar_first" || entry[0] === "correction_first") {
        entry[1] += 0.5;
      }
    });
  }

  return base;
}

function scoreMap(text: string, kind: "teacher" | "proxy", flags: ReturnType<typeof studentFlags>) {
  return Object.fromEntries(directionScores(text, kind, flags)) as Record<string, number>;
}

function teacherDirectionFromSignals(text: string, flags: ReturnType<typeof studentFlags>) {
  return pickTopDirection(directionScores(text, "teacher", flags));
}

function proxyDirectionFromSignals(text: string, flags: ReturnType<typeof studentFlags>) {
  return pickTopDirection(directionScores(text, "proxy", flags));
}

function directionConfidence(
  teacher: [string, number],
  proxy: [string, number],
  flags: ReturnType<typeof studentFlags>,
  teacherText: string,
  proxyText: string,
  conflictDetected: boolean
) {
  const teacherScore = teacher[1];
  const proxyScore = proxy[1];
  const teacherSecond = directionScores(teacherText, "teacher", flags).sort((a, b) => b[1] - a[1])[1]?.[1] ?? 0;
  const proxySecond = directionScores(proxyText, "proxy", flags).sort((a, b) => b[1] - a[1])[1]?.[1] ?? 0;
  const gap = Math.max(0, teacherScore - teacherSecond);
  const proxyGap = Math.max(0, proxyScore - proxySecond);
  const base = Math.min(1, 0.42 + gap * 0.12 + proxyGap * 0.1 + (conflictDetected ? 0.2 : 0));
  return Math.max(0.35, Math.min(0.98, base));
}

const CONFLICT_PAIRS = new Set([
  "meaning_first|grammar_first",
  "grammar_first|meaning_first",
  "reassure_first|correction_first",
  "correction_first|reassure_first",
  "face_saving|public_directness",
  "public_directness|face_saving",
  "diagnose_state_first|push_precision_first",
  "push_precision_first|diagnose_state_first",
  "keep_speaking|close_move_on",
  "close_move_on|keep_speaking"
]);

export function probeTeacherDirectionConflict({
  teacherResponse,
  proxyResponse,
  studentProfile,
  scenario
}: ProbeInput): DirectionConflictProbe {
  const flags = studentFlags(studentProfile, scenario);
  const teacherDir = teacherDirectionFromSignals(teacherResponse, flags);
  const proxyDir = proxyDirectionFromSignals(proxyResponse, flags);
  const teacherScores = scoreMap(teacherResponse, "teacher", flags);
  const proxyScores = scoreMap(proxyResponse, "proxy", flags);
  const teacherPair = teacherDir[0];
  const proxyPair = proxyDir[0];
  const pairConflict = teacherPair !== proxyPair && CONFLICT_PAIRS.has(`${teacherPair}|${proxyPair}`);
  const weightedReversal =
    (teacherScores["meaning_first"] > proxyScores["meaning_first"] + 0.12 && proxyScores["grammar_first"] > teacherScores["grammar_first"] + 0.12) ||
    (teacherScores["reassure_first"] > proxyScores["reassure_first"] + 0.12 && proxyScores["correction_first"] > teacherScores["correction_first"] + 0.12) ||
    (teacherScores["face_saving"] > proxyScores["face_saving"] + 0.12 && proxyScores["public_directness"] > teacherScores["public_directness"] + 0.12) ||
    (teacherScores["diagnose_state_first"] > proxyScores["diagnose_state_first"] + 0.12 && proxyScores["push_precision_first"] > teacherScores["push_precision_first"] + 0.12) ||
    (teacherScores["keep_speaking"] > proxyScores["keep_speaking"] + 0.12 && proxyScores["close_move_on"] > teacherScores["close_move_on"] + 0.12);
  const conflictDetected = pairConflict || weightedReversal;
  const confidence = directionConfidence(teacherDir, proxyDir, flags, teacherResponse, proxyResponse, conflictDetected);
  const analysis = inspectSimilarity({
    teacherResponse,
    proxyResponse,
    studentProfile,
    scenario
  });

  return {
    teacherCoreDirection: teacherPair,
    proxyCoreDirection: proxyPair,
    conflictDetected: conflictDetected || (analysis.dimensionScores.decision <= 78 && analysis.dimensionScores.priority <= 80 && teacherPair !== proxyPair),
    confidence: Math.round(confidence * 100) / 100,
    explanation: conflictDetected
      ? weightedReversal && teacherPair === proxyPair
        ? `Teacher and proxy share a surface direction (${teacherPair}), but their directional weights are reversed, so similarity should not block routing.`
        : `Teacher direction ${teacherPair} conflicts with proxy direction ${proxyPair}, so surface similarity should not block routing.`
      : `Teacher direction ${teacherPair} and proxy direction ${proxyPair} are not strongly opposed enough to force an override.`
  };
}
