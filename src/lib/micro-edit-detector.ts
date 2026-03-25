import type { CalibratedConflictSignal, MicroEditOpportunity, ReactionBand, SegmentPriority } from "@/lib/types";

function normalizeText(value: string) {
  return value.toLowerCase().replace(/['"]/g, "").replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
}

function splitIntoSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/g)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function sentenceId(index: number) {
  return `sentence-${index + 1}`;
}

function priorityForSegment(segmentPriorities: SegmentPriority[], id: string) {
  return segmentPriorities.find((segment) => segment.segmentId === id);
}

function isLowRiskSegment(segmentPriority?: SegmentPriority) {
  if (!segmentPriority) return true;
  return (
    segmentPriority.preservePriority >= segmentPriority.editPriority ||
    segmentPriority.preservePriority >= 60 ||
    segmentPriority.editPriority <= 70
  );
}

function hasSevereBoundaryConflict(calibratedSignals: CalibratedConflictSignal[]) {
  return calibratedSignals.some(
    (signal) =>
      signal.category === "boundary" &&
      signal.severity === "high" &&
      signal.finalScore >= 72 &&
      signal.signalType !== "adversarial_politeness_mask"
  );
}

function pickGain(base: number, bonus = 0) {
  return Math.max(1, Math.min(10, base + bonus));
}

function containsAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function sentenceCategory(sentence: string) {
  const lowered = normalizeText(sentence);
  if (containsAny(lowered, [/(wrong|should know|must|hurry up|need to|fix it now|correct it now|now\b)/i])) return "boundary";
  if (containsAny(lowered, [/(main idea|meaning|example|first|priority|grammar|precision|focus on)/i])) return "priority";
  if (containsAny(lowered, [/(correct|fix|retry|push precision|diagnose|pressured|pressure)/i])) return "decision";
  return "style";
}

export function detectMicroEditOpportunities({
  response,
  segmentPriorities,
  calibratedSignals,
  reactionBand
}: {
  response: string;
  segmentPriorities: SegmentPriority[];
  calibratedSignals: CalibratedConflictSignal[];
  reactionBand: ReactionBand;
}): MicroEditOpportunity[] {
  const allowConflictSensitiveMicroEdit = containsAny(normalizeText(response), [
    /(please answer with a full sentence|say it again in one full sentence|correct grammar|please try again|let's try that again|let's move on|move on\b|wrap up|we're done|that's enough|stop here|end here)/i
  ]);
  if (reactionBand === "skip" || reactionBand === "full_correction" || reactionBand === "bounded_full") return [];
  if (hasSevereBoundaryConflict(calibratedSignals) && !allowConflictSensitiveMicroEdit) return [];

  const sentences = splitIntoSentences(response);
  const opportunities: MicroEditOpportunity[] = [];
  const seen = new Set<string>();
  const redundantSignatureSet = new Set<string>();
  const highSimilarityWrongReasoning = calibratedSignals.some(
    (signal) => signal.signalType === "high_similarity_wrong_reasoning" && signal.finalScore >= 80
  );
  const adversarialPolitenessMask = calibratedSignals.some(
    (signal) => signal.signalType === "adversarial_politeness_mask" && signal.finalScore >= 70
  );
  const teacherDirectionConflict = calibratedSignals.some(
    (signal) => signal.signalType === "teacher_direction_conflict" && signal.finalScore >= 80
  );
  const mixedPriorityConflict = calibratedSignals.some(
    (signal) => signal.signalType === "mixed_content_conflict" && signal.finalScore >= 66
  );
  const directionSensitiveMicroEdit = highSimilarityWrongReasoning || adversarialPolitenessMask || teacherDirectionConflict;

  const addOpportunity = (opportunity: MicroEditOpportunity) => {
    const key = `${opportunity.segmentId}:${opportunity.type}`;
    if (seen.has(key)) return;
    seen.add(key);
    opportunities.push(opportunity);
  };

  sentences.forEach((sentence, index) => {
    const id = sentenceId(index);
    const lower = normalizeText(sentence);
    const priority = priorityForSegment(segmentPriorities, id);
    if (!isLowRiskSegment(priority)) return;

    const harsh = containsAny(lower, [/(wrong|should know|obviously|hurry up|must|need to|don't waste time|in front of everyone|public|embarrass|shame)/i]);
    const supportive = containsAny(lower, [/(good start|nice start|don't worry|together|calm|supportive|gentle|let's)/i]);
    const urgent = containsAny(lower, [/(now\b|must|need to|hurry up|correct it now|fix it now|move on\b|press on)/i]);
    const releaseTooEarly = containsAny(lower, [/(let's move on|move on\b|wrap up|we're done|that's enough|stop here|end here)/i]);
    const directRetryPrompt = containsAny(lower, [/(please answer with a full sentence|say it again in one full sentence|correct grammar|please try again|let's try that again)/i]);
    const clarityGap =
      sentence.length > 35 ||
      containsAny(lower, [/(then maybe|maybe maybe|just just|kind of|a bit|really really|then then|let's keep this calm and supportive)/i]);
    const orderConflict =
      index === 0 &&
      containsAny(lower, [/(correct|fix|grammar|pressure|must|need to|wrong)/i]) &&
      sentences.some((later, laterIndex) => laterIndex > index && containsAny(normalizeText(later), [/(good start|calm|supportive|together|keep speaking|don't worry|first|meaning)/i]));

    if (harsh && !containsAny(lower, [/(public|embarrass|shame|humiliate)/i])) {
      addOpportunity({
        segmentId: id,
        type: "tone_soften",
        expectedGain: pickGain(3, supportive ? 1 : 0),
        riskLevel: "low",
        reason: "The sentence is a little direct or harsh, but it can be softened without changing the decision."
      });
    }

    if (urgent && !containsAny(lower, [/(public|embarrass|shame|humiliate)/i])) {
      addOpportunity({
        segmentId: id,
        type: "boundary_soften",
        expectedGain: pickGain(3, harsh ? 1 : 0),
        riskLevel: "low",
        reason: "The sentence carries mild urgency that can be turned into a softer suggestion."
      });
    }

    if (orderConflict || (index > 0 && containsAny(lower, [/(grammar|meaning|example|main idea|first|priority)/i]) && sentences.some((earlier, earlierIndex) => earlierIndex < index && containsAny(normalizeText(earlier), [/(correct|fix|pressure|must|need to)/i])))) {
      addOpportunity({
        segmentId: id,
        type: "instruction_reorder",
        expectedGain: pickGain(4, supportive ? 0 : 1),
        riskLevel: "low",
        reason: "The instruction order can be rearranged to sound more teacher-like without changing the underlying decision."
      });
    }

    if (releaseTooEarly && (!hasSevereBoundaryConflict(calibratedSignals) || mixedPriorityConflict || directionSensitiveMicroEdit)) {
      addOpportunity({
        segmentId: id,
        type: "instruction_reorder",
        expectedGain: pickGain(5, supportive ? 1 : 0),
        riskLevel: "low",
        reason: "The response releases the student too early; keeping the task open with a concrete example first is a high-ROI low-risk micro-edit."
      });
    }

    if (clarityGap) {
      addOpportunity({
        segmentId: id,
        type: "clarity_improve",
        expectedGain: pickGain(2, containsAny(lower, [/(then maybe|maybe maybe|just just|kind of)/i]) ? 1 : 0),
        riskLevel: "low",
        reason: "The sentence can be shortened or simplified without changing its meaning."
      });
    }

    if (directRetryPrompt && !hasSevereBoundaryConflict(calibratedSignals)) {
      addOpportunity({
        segmentId: id,
        type: "clarity_improve",
        expectedGain: pickGain(3, supportive ? 1 : 0),
        riskLevel: "low",
        reason: "A direct retry prompt can be softened into a collaborative retry without changing the teaching intent."
      });
    }

    if (directionSensitiveMicroEdit) {
      if (containsAny(lower, [/(correct the grammar before you continue|correct the wording now so the answer is precise|maybe we can move on unless you want to say more|you should know this already|correct it now|fix it now)/i])) {
        addOpportunity({
          segmentId: id,
          type: containsAny(lower, [/(move on|unless you want to say more)/i]) ? "boundary_soften" : "clarity_improve",
          expectedGain: pickGain(4, supportive ? 1 : 0),
          riskLevel: "low",
          reason: "A direction-sensitive phrase can be softened without changing the underlying teaching intent."
        });
      }
    }

    const signature = normalizeText(sentence);
    if (signature && redundantSignatureSet.has(signature) && signature.length > 10) {
      addOpportunity({
        segmentId: id,
        type: "redundancy_cleanup",
        expectedGain: pickGain(2),
        riskLevel: "low",
        reason: "The response repeats a sentence or phrase and can be cleaned up safely."
      });
    }
    if (signature) redundantSignatureSet.add(signature);
  });

  if (!opportunities.length) {
    const duplicatePunctuation = response.includes("..") || response.includes(" ,") || response.includes(". .");
    if (duplicatePunctuation) {
      addOpportunity({
        segmentId: "sentence-1",
        type: "redundancy_cleanup",
        expectedGain: 2,
        riskLevel: "low",
        reason: "There is punctuation noise that can be cleaned up safely."
      });
    }
  }

  return opportunities.sort((left, right) => right.expectedGain - left.expectedGain);
}
