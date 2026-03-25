import type { MicroEditPlan, MicroEditOpportunity } from "@/lib/types";

function normalizeText(value: string) {
  return value.toLowerCase().replace(/['"]/g, "").replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
}

function splitIntoSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/g)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function cleanSurface(text: string) {
  return text
    .replace(/\.\.+/g, ".")
    .replace(/\s+,/g, ",")
    .replace(/\s+\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function replacePhrases(text: string, replacements: Array<[RegExp, string]>) {
  return replacements.reduce((output, [pattern, replacement]) => output.replace(pattern, replacement), text);
}

function softenTone(text: string) {
  return replacePhrases(text, [
    [/\byour grammar is wrong\b/gi, "that's not quite there yet"],
    [/\bthat's wrong\b/gi, "that's not quite there yet"],
    [/\byou should know this already\b/gi, "let's work through this together"],
    [/\bmaybe we can\b/gi, "let's"],
    [/\bdon't waste time\b/gi, "let's stay focused"],
    [/\bhurry up\b/gi, "let's take it step by step"],
    [/\bobviously\b/gi, "let's look at"],
    [/\bneed to\b/gi, "let's"],
    [/\bmust\b/gi, "let's"]
  ]);
}

function softenBoundary(text: string) {
  return replacePhrases(text, [
    [/\bcorrect it now\b/gi, "correct it"],
    [/\bfix it now\b/gi, "fix it"],
    [/\bin front of everyone\b/gi, "privately"],
    [/\bmove on\b/gi, "keep the student speaking and make the correction face-saving"],
    [/\bpublicly\b/gi, "privately"],
    [/\bunless you want to say more\b/gi, ""],
    [/\bbut your answer is wrong\b/gi, ""],
    [/\bnow\b/gi, ""]
  ]);
}

function improveClarity(text: string) {
  return replacePhrases(text, [
    [/\bthen maybe\b/gi, "maybe"],
    [/\bmaybe maybe\b/gi, "maybe"],
    [/\bjust just\b/gi, "just"],
    [/\bkind of\b/gi, ""],
    [/\ba bit\b/gi, "slightly"],
    [/\breally really\b/gi, "really"],
    [/\bplease answer with a full sentence and correct grammar\b/gi, "let's try that again in one full sentence, and then we can make it better"],
    [/\bplease answer with a full sentence\b/gi, "let's try that again in one full sentence"],
    [/\bsay it again in one full sentence\b/gi, "let's try that again in one full sentence"],
    [/\bcorrect grammar\b/gi, "keep the wording clear"],
    [/\bkeep the main idea first\b/gi, "keep the main idea clear first"],
    [/\bcorrect the grammar before you continue\b/gi, "Give one concrete example before we correct the wording"],
    [/\bcorrect the wording now so the answer is precise\b/gi, "we can correct the wording after we understand the blocker"],
    [/\bthe meaning is unclear, so fix the grammar now\b/gi, "let's stay with the meaning first and refine the wording together"]
  ]);
}

function reorderInstructionPhrases(text: string) {
  return replacePhrases(text, [
    [/\bstart with grammar first, then maybe the example\b/gi, "start with one concrete example, then refine the wording"],
    [/\bcorrect the grammar before you continue\b/gi, "Give one concrete example before we correct the wording"],
    [/\bcorrect the wording now so the answer is precise\b/gi, "We can correct the wording after we understand the blocker"],
    [/\blet's move on\b/gi, "let's stay with one concrete example first"],
    [/\bmove on\b/gi, "stay with one concrete example first"],
    [/\bkeep the meaning first\b/gi, "keep the meaning first"],
    [/\bmaybe we can move on unless you want to say more\b/gi, "let's keep the student speaking and make the correction face-saving"]
  ]);
}

function dedupeSentences(sentences: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const sentence of sentences) {
    const signature = normalizeText(sentence.replace(/[.!?]+$/g, ""));
    if (!signature) continue;
    if (seen.has(signature)) continue;
    seen.add(signature);
    unique.push(sentence);
  }
  return unique;
}

function classifySentence(sentence: string) {
  const lowered = normalizeText(sentence);
  if (/(good start|nice start|don't worry|together|calm|supportive|gentle|let's|keep speaking|face saving)/i.test(lowered)) return "support";
  if (/(correct|fix|grammar|meaning|example|main idea|retry|pressure|diagnose|should|must|need to)/i.test(lowered)) return "instruction";
  return "other";
}

function reorderSentences(sentences: string[]) {
  const grouped = sentences.map((sentence, index) => ({ sentence, index, group: classifySentence(sentence) }));
  const support = grouped.filter((item) => item.group === "support");
  const instruction = grouped.filter((item) => item.group === "instruction");
  const other = grouped.filter((item) => item.group === "other");
  const rank = (group: string) => (group === "support" ? 0 : group === "instruction" ? 1 : 2);
  return [...support, ...instruction, ...other]
    .sort((left, right) => {
      const groupDelta = rank(left.group) - rank(right.group);
      if (groupDelta !== 0) return groupDelta;
      return left.index - right.index;
    })
    .map((item) => item.sentence);
}

function applyOpportunity(sentence: string, opportunity: MicroEditOpportunity) {
  let output = sentence;
  switch (opportunity.type) {
    case "tone_soften":
      output = softenTone(output);
      break;
    case "boundary_soften":
      output = softenBoundary(output);
      break;
    case "clarity_improve":
      output = improveClarity(output);
      break;
    case "redundancy_cleanup":
      output = cleanSurface(output);
      break;
    case "instruction_reorder":
      output = reorderInstructionPhrases(output);
      break;
  }
  return cleanSurface(output);
}

export function applyMicroEdits({
  response,
  editPlan
}: {
  response: string;
  editPlan: MicroEditPlan;
}): string {
  if (!editPlan.safe || !editPlan.selectedEdits.length) return response.trim();

  const sentences = splitIntoSentences(response);
  const selectedById = new Map(editPlan.selectedEdits.map((edit) => [edit.segmentId, edit] as const));
  const typeRank = (value: MicroEditOpportunity["type"]) => {
    if (value === "instruction_reorder") return 4;
    if (value === "boundary_soften") return 3;
    if (value === "tone_soften") return 2;
    if (value === "clarity_improve") return 1;
    return 0;
  };
  const selectedSorted = [...editPlan.selectedEdits].sort((left, right) => {
    const typeDelta = typeRank(right.type) - typeRank(left.type);
    if (typeDelta !== 0) return typeDelta;
    return right.expectedGain - left.expectedGain;
  });
  const selectedSet = new Set(selectedSorted.map((edit) => edit.segmentId));
  let nextSentences = sentences.map((sentence, index) => {
    const opportunity = selectedById.get(`sentence-${index + 1}`);
    return opportunity ? applyOpportunity(sentence, opportunity) : cleanSurface(sentence);
  });

  const selectedTypes = new Set(selectedSorted.map((edit) => edit.type));
  if (selectedTypes.has("boundary_soften") || selectedTypes.has("tone_soften")) {
    nextSentences = nextSentences.filter((sentence) => {
      const normalized = normalizeText(sentence);
      const harshCluster = /(but your answer is wrong|your answer is wrong|correct it now|in front of everyone|you should know this already)/i;
      if (!harshCluster.test(normalized)) return true;
      return false;
    });
  }

  if (editPlan.selectedEdits.some((edit) => edit.type === "instruction_reorder")) {
    nextSentences = reorderSentences(nextSentences);
  }

  nextSentences = dedupeSentences(nextSentences);
  return cleanSurface(
    nextSentences
      .map((sentence) => sentence.replace(/\s{2,}/g, " ").trim())
      .filter(Boolean)
      .join(" ")
  );
}
