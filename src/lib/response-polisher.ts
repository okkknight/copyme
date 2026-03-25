import type { ResponsePolishPlan } from "@/lib/types";
import { evaluateNaturalness } from "@/lib/naturalness-evaluator";

function normalizeText(value: string) {
  return value.toLowerCase().replace(/['"]/g, "").replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
}

function splitIntoSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/g)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function dedupeSentences(sentences: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const sentence of sentences) {
    const signature = normalizeText(sentence.replace(/[.!?]+$/g, ""));
    if (!signature) continue;
    if (seen.has(signature)) continue;
    seen.add(signature);
    result.push(sentence);
  }
  return result;
}

function cleanupSurface(text: string) {
  return text
    .replace(/\.\.+/g, ".")
    .replace(/\s+,/g, ",")
    .replace(/\s+\./g, ".")
    .replace(/\s+/g, " ")
    .replace(/\.\s*\./g, ".")
    .trim();
}

function needsTransition(plan?: ResponsePolishPlan) {
  if (!plan?.shouldPolish) return false;
  return plan.issues.includes("transition_gap") || plan.issues.includes("awkward_join");
}

function addSoftTransition(sentences: string[], plan?: ResponsePolishPlan) {
  if (sentences.length < 2) return sentences;
  const result = [...sentences];
  const transitionTargets = new Set((plan?.transitionTargets ?? []).map((target) => target.toSegmentId));
  const connectors = ["Then", "Next", "Also", "So"];
  for (let index = 1; index < result.length; index += 1) {
    const segmentId = `sentence-${index + 1}`;
    if (!transitionTargets.has(segmentId) && index > 1) continue;
    if (!/^(then|next|so|and|because|also|first|after|finally)\b/i.test(result[index])) {
      const connector = connectors[(index - 1) % connectors.length];
      result[index] = `${connector} ${result[index].replace(/^(then|next|so|also)\s+/i, "")}`;
    }
  }
  return result;
}

function softenTone(text: string) {
  return text
    .replace(/\bfocus on the main idea first\b/gi, "Let's keep the main idea first")
    .replace(/\bthat's a good start\b/gi, "That's a good start")
    .replace(/\blet's keep this calm and supportive\b/gi, "Let's keep this calm and supportive")
    .replace(/\bavoid a harsh jump into correction\b/gi, "Let's avoid a harsh jump into correction");
}

export function polishCalibratedResponse({
  response,
  polishPlan
}: {
  response: string;
  polishPlan?: ResponsePolishPlan;
}) {
  if (!polishPlan?.shouldPolish) return response.trim();
  if (polishPlan.editedSegments.length === 0 && polishPlan.preservedSegments.length > 0) {
    return response.trim();
  }
  if (polishPlan.editedSegments.length <= 1) {
    return cleanupSurface(response);
  }

  let text = cleanupSurface(response);
  let sentences = splitIntoSentences(text);
  sentences = dedupeSentences(sentences);

  if (sentences.length > 1 && needsTransition(polishPlan)) {
    sentences = addSoftTransition(sentences, polishPlan);
  }

  text = sentences
    .map((sentence) => cleanupSurface(softenTone(sentence)))
    .filter(Boolean)
    .join(" ");

  text = cleanupSurface(text);
  text = text.replace(/\bthis already\. Correct\b/gi, "this already. Correct");
  text = text.replace(/\.\s*\./g, ".");
  text = text.replace(/\s{2,}/g, " ");
  return text.trim();
}

export function runPolishRegression({
  beforeText,
  polishPlan
}: {
  beforeText: string;
  polishPlan?: ResponsePolishPlan;
}) {
  const afterText = polishCalibratedResponse({
    response: beforeText,
    polishPlan
  });
  const naturalnessBefore = evaluateNaturalness(beforeText);
  const naturalnessAfter = evaluateNaturalness(afterText);

  return {
    beforeText,
    afterText,
    naturalnessBefore,
    naturalnessAfter,
    improved: naturalnessAfter.overall >= naturalnessBefore.overall
  };
}
