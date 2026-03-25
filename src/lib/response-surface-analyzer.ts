import type { ResponsePolishPlan } from "@/lib/types";

function normalizeText(value: string) {
  return value.toLowerCase().replace(/['"]/g, "").replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
}

function splitIntoSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/g)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function sentenceSignature(sentence: string) {
  return normalizeText(sentence).replace(/\s+/g, " ").trim();
}

function buildTransitionReason(issues: ResponsePolishPlan["issues"]) {
  if (issues.includes("tone_mismatch")) return "tone mismatch across segments";
  if (issues.includes("awkward_join")) return "awkward join between adjacent segments";
  if (issues.includes("transition_gap")) return "missing transition between sentences";
  return "surface polish needed between adjacent segments";
}

export function analyzeResponseSurface({
  reviewCaseId = "",
  response,
  preservedSegments = [],
  editedSegments = []
}: {
  reviewCaseId?: string;
  response: string;
  preservedSegments?: string[];
  editedSegments?: string[];
}): ResponsePolishPlan {
  const issues: ResponsePolishPlan["issues"] = [];
  const normalized = normalizeText(response);
  const sentences = splitIntoSentences(response);
  const signatures = new Set<string>();
  const duplicateSentences: string[] = [];

  if (response.includes("..") || response.includes(" ,") || response.includes(". .")) {
    issues.push("duplicate_punctuation");
  }

  for (const sentence of sentences) {
    const signature = sentenceSignature(sentence);
    if (signature && signatures.has(signature) && signature.length > 10) {
      duplicateSentences.push(sentence);
    }
    signatures.add(signature);
  }
  if (duplicateSentences.length) {
    issues.push("duplicate_phrase");
  }

  const awkwardJoin = sentences.length >= 2 && sentences.some((sentence) => sentence.length < 5 || /^(then|and|so|but)$/i.test(sentence));
  if (awkwardJoin) {
    issues.push("awkward_join");
  }

  const transitionWords = /(then|and|so|let's|first|next|after|finally|also|because|instead)\b/i;
  if (sentences.length > 1 && !transitionWords.test(response)) {
    issues.push("transition_gap");
  }

  const supportiveSignals = /(good start|nice start|don't worry|together|calm|supportive|gentle|keep speaking|face-saving|we can)/i;
  const harshSignals = /(wrong|obviously|you should know|in front of everyone|public|humiliate|embarrass|hurry up|must|need to|harsh|strict)/i;
  if (supportiveSignals.test(normalized) && harshSignals.test(normalized)) {
    issues.push("tone_mismatch");
  }

  const transitionTargets = sentences.length > 1 && (issues.includes("transition_gap") || issues.includes("awkward_join") || issues.includes("tone_mismatch"))
    ? sentences.slice(1).map((_, index) => ({
        fromSegmentId: `sentence-${index + 1}`,
        toSegmentId: `sentence-${index + 2}`,
        reason: buildTransitionReason(issues)
      }))
    : [];

  const shouldPolish = issues.length > 0;
  return {
    reviewCaseId,
    shouldPolish,
    issues,
    preservedSegments,
    editedSegments,
    transitionTargets
  };
}
