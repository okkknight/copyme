import type { NaturalnessScore } from "@/lib/types";

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function splitIntoSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/g)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function countRepeatedSentences(sentences: string[]) {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const sentence of sentences) {
    const signature = normalizeText(sentence.replace(/[.!?]+$/g, ""));
    if (!signature) continue;
    if (seen.has(signature)) duplicates += 1;
    seen.add(signature);
  }
  return duplicates;
}

function containsAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

export function evaluateNaturalness(response: string): NaturalnessScore {
  const text = response ?? "";
  const normalized = normalizeText(text);
  const sentences = splitIntoSentences(text);

  let fluency = 100;
  let coherence = 100;
  let redundancy = 100;
  let toneNaturalness = 100;

  if (text.includes("..")) fluency -= 22;
  if (text.includes(" ,")) fluency -= 12;
  if (text.includes("  ")) fluency -= 10;
  if (text.includes(". .")) fluency -= 12;
  if (/\s+[.!?]/.test(text)) fluency -= 4;

  if (sentences.length > 1 && !containsAny(normalized, [/(then|and|so|first|next|after|finally|because|instead|let's)/i])) {
    coherence -= 20;
  }

  const repeatedSentences = countRepeatedSentences(sentences);
  if (repeatedSentences > 0) {
    redundancy -= Math.min(40, repeatedSentences * 18);
  }

  if (containsAny(normalized, [/(focus on|main idea|meaning|keep the student speaking)/i]) && containsAny(normalized, [/(that's a good start|nice start|don't worry|together|calm|supportive|gentle)/i])) {
    toneNaturalness -= 12;
  }

  if (containsAny(normalized, [/(wrong|should know|in front of everyone|public|humiliate|embarrass|hurry up|must|need to)/i]) && containsAny(normalized, [/(calm|supportive|gentle|together|face-saving)/i])) {
    toneNaturalness -= 10;
  }

  if (sentences.length >= 2 && sentences.some((sentence) => sentence.length < 5)) {
    coherence -= 10;
    fluency -= 5;
  }

  fluency = Math.max(0, Math.min(100, fluency));
  coherence = Math.max(0, Math.min(100, coherence));
  redundancy = Math.max(0, Math.min(100, redundancy));
  toneNaturalness = Math.max(0, Math.min(100, toneNaturalness));

  const overall = Math.round(fluency * 0.33 + coherence * 0.27 + redundancy * 0.16 + toneNaturalness * 0.24);

  return {
    fluency: Math.round(fluency),
    coherence: Math.round(coherence),
    redundancy: Math.round(redundancy),
    toneNaturalness: Math.round(toneNaturalness),
    overall
  };
}

