import { inspectSimilarity, type SimilarityScore, type SimilarityStudentProfile } from "@/lib/similarity-evaluator";
import type { PrecisionSeverityResult, RoutingConflictSignal, SegmentDiff } from "@/lib/types";
import { ROUTING_CONFLICT_THRESHOLDS } from "@/lib/routing-conflict-thresholds";

function normalizeText(value: string) {
  return value.toLowerCase().replace(/['"]/g, "").replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
}

function splitIntoSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/g)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function countCategories(segmentDiffs: SegmentDiff[]) {
  return new Set(segmentDiffs.map((segment) => segment.category)).size;
}

function countSeverity(segmentDiffs: SegmentDiff[], severity: SegmentDiff["severity"]) {
  return segmentDiffs.filter((segment) => segment.severity === severity).length;
}

function studentFlags(studentProfile?: SimilarityStudentProfile | string, scenario?: string) {
  const profile = normalizeText(
    typeof studentProfile === "string"
      ? studentProfile
      : [studentProfile?.name, studentProfile?.defaultAttitude, studentProfile?.defaultEmotion, studentProfile?.defaultConfidence]
          .filter(Boolean)
          .join(" ")
  );
  const scenarioText = normalizeText(scenario ?? "");
  return {
    anxious: profile.includes("anxious") || profile.includes("shy") || profile.includes("low confidence") || profile.includes("self conscious"),
    frozen: profile.includes("frozen") || profile.includes("hesitant") || profile.includes("quiet"),
    resistant: profile.includes("resistant") || profile.includes("argumentative"),
    interview: scenarioText.includes("interview"),
    story: scenarioText.includes("story"),
    debate: scenarioText.includes("debate") || scenarioText.includes("opinion")
  };
}

function scoreToSeverity(score: number): RoutingConflictSignal["severity"] {
  if (score >= ROUTING_CONFLICT_THRESHOLDS.guardOverride.high) return "high";
  if (score >= ROUTING_CONFLICT_THRESHOLDS.guardOverride.medium) return "medium";
  return "low";
}

function teacherDirectionScore(analysis: ReturnType<typeof inspectSimilarity>) {
  const teacher = analysis.teacherSignals;
  const proxy = analysis.proxySignals;
  const decisionGap = Math.abs(teacher.reassurance + teacher.diagnosis + teacher.example + teacher.retry - (proxy.reassurance + proxy.diagnosis + proxy.example + proxy.retry));
  const priorityGap = Math.abs(teacher.meaning + teacher.boundaryProtect + teacher.agency - (proxy.meaning + proxy.precision + proxy.boundaryProtect));
  return Math.min(100, Math.round((decisionGap + priorityGap) * 32));
}

export function analyzeRoutingConflictSignals({
  teacherResponse,
  proxyResponse,
  similarity,
  diffs,
  precisionSeverities,
  studentProfile,
  scenario
}: {
  teacherResponse: string;
  proxyResponse: string;
  similarity: SimilarityScore;
  diffs: SegmentDiff[];
  precisionSeverities: PrecisionSeverityResult[];
  studentProfile?: SimilarityStudentProfile | string;
  scenario?: string;
}): RoutingConflictSignal[] {
  const signals: RoutingConflictSignal[] = [];
  const analysis = inspectSimilarity({
    teacherResponse,
    proxyResponse,
    studentProfile,
    scenario
  });
  const teacher = analysis.teacherSignals;
  const proxy = analysis.proxySignals;
  const flags = studentFlags(studentProfile, scenario);
  const segmentDiffs = diffs as SegmentDiff[];
  const hasHighBoundary = precisionSeverities.some((item) => item.category === "boundary" && item.severity === "high");
  const hasHighDecision = precisionSeverities.some((item) => item.category === "decision" && item.severity === "high");
  const sentenceCount = splitIntoSentences(proxyResponse).length;
  const uniqueCategories = countCategories(segmentDiffs);
  const highCount = countSeverity(segmentDiffs, "high");
  const mediumCount = countSeverity(segmentDiffs, "medium");
  const mixedContent = segmentDiffs.some((segment) => segment.shouldEdit) && segmentDiffs.some((segment) => !segment.shouldEdit);
  const teacherDirectionConflict =
    (teacher.decisionMode !== proxy.decisionMode && teacher.reassurance + teacher.diagnosis + teacher.example + teacher.retry > proxy.pressure + proxy.correction + proxy.release + 0.15) ||
    (teacher.priorityMode !== proxy.priorityMode && teacher.meaning + teacher.boundaryProtect + teacher.agency > proxy.precision + proxy.boundaryProtect + 0.12);
  const teacherDirectionScoreValue = Math.min(100, Math.round((teacherDirectionScore(analysis) + (teacherDirectionConflict ? 24 : 0) + (hasHighDecision ? 8 : 0) + (hasHighBoundary ? 8 : 0)) / 2));

  if (teacherDirectionScoreValue >= 48) {
    const score = Math.min(100, teacherDirectionScoreValue);
    if (score >= 35) {
      signals.push({
        signalType: "teacher_direction_conflict",
        category: teacher.priorityMode.includes("meaning") || teacher.priorityMode.includes("boundary") ? "priority" : "decision",
        severity: scoreToSeverity(score),
        score,
        explanation:
          teacherDirectionConflict || hasHighDecision || hasHighBoundary
            ? "The teacher's direction prioritizes a different instructional move than the proxy, so surface similarity should not block routing."
            : "The teacher and proxy are directionally close, so routing should not be escalated on direction alone."
      });
    }
  }

  const mixedContentScore = Math.min(
    100,
    Math.round(
      (mixedContent ? 34 : 0) +
        (segmentDiffs.length >= 2 ? 12 : 0) +
        (segmentDiffs.some((segment) => segment.severity !== "low") ? 12 : 0) +
        (highCount > 0 && mediumCount > 0 ? 18 : 0) +
        (uniqueCategories >= 2 ? 18 : 0) +
        (segmentDiffs.some((segment) => segment.category === "boundary" || segment.category === "decision") ? 10 : 0)
    )
  );
  if (mixedContentScore >= ROUTING_CONFLICT_THRESHOLDS.mixedConflict.medium) {
    signals.push({
      signalType: "mixed_content_conflict",
      category: highCount >= mediumCount ? (segmentDiffs.find((segment) => segment.category === "boundary") ? "boundary" : "decision") : "priority",
      severity: scoreToSeverity(mixedContentScore),
      score: mixedContentScore,
      explanation:
        "The proxy mixes correct and incorrect content, so routing must preserve aligned segments while isolating the conflicting ones."
    });
  }

  const wrongReasoningScore = Math.min(
    100,
    Math.round(
      (similarity.overall >= 80 ? 24 : 0) +
        (similarity.reasoningMatch <= 72 ? 20 : 0) +
        (similarity.decision >= 85 && (hasHighDecision || hasHighBoundary) ? 24 : 0) +
        (teacher.decisionMode !== proxy.decisionMode ? 16 : 0) +
        (teacher.priorityMode !== proxy.priorityMode ? 12 : 0)
    )
  );
  if (wrongReasoningScore >= ROUTING_CONFLICT_THRESHOLDS.guardOverride.medium) {
    signals.push({
      signalType: "high_similarity_wrong_reasoning",
      category: hasHighBoundary ? "boundary" : "decision",
      severity: scoreToSeverity(wrongReasoningScore),
      score: wrongReasoningScore,
      explanation:
        "Similarity is high enough to look safe, but the teacher's reasoning direction and the proxy's reasoning direction still conflict."
    });
  }

  const adversarialPolitenessScore = Math.min(
    100,
    Math.round(
      (similarity.style >= 75 ? 18 : 0) +
        (similarity.overall >= 78 ? 12 : 0) +
        ((hasHighBoundary || hasHighDecision) ? 26 : 0) +
        (proxy.warmth + proxy.boundaryProtect > proxy.boundaryHarsh + proxy.directness ? 16 : 0) +
        (teacher.boundaryMode !== proxy.boundaryMode ? 12 : 0)
    )
  );
  if (adversarialPolitenessScore >= ROUTING_CONFLICT_THRESHOLDS.adversarialPoliteness.medium) {
    signals.push({
      signalType: "adversarial_politeness_mask",
      category: hasHighBoundary ? "boundary" : "style",
      severity: scoreToSeverity(adversarialPolitenessScore),
      score: adversarialPolitenessScore,
      explanation:
        "The response sounds polite or natural on the surface, but its boundary or decision direction is still wrong, so style should not mask correction."
    });
  }

  const longTextScore = Math.min(
    100,
    Math.round(
      (sentenceCount >= ROUTING_CONFLICT_THRESHOLDS.longText.multiIntentSentenceFloor ? 22 : 0) +
        (uniqueCategories >= ROUTING_CONFLICT_THRESHOLDS.longText.multiIntentCategoryFloor ? 18 : 0) +
        (segmentDiffs.length >= 3 ? 18 : 0) +
        (mixedContent ? 12 : 0) +
        (highCount >= 2 ? 12 : 0) +
        (mediumCount >= 2 ? 8 : 0)
    )
  );
  if (longTextScore >= ROUTING_CONFLICT_THRESHOLDS.longText.medium) {
    signals.push({
      signalType: "long_text_multi_intent_conflict",
      category: uniqueCategories >= 3 ? "decision" : "priority",
      severity: scoreToSeverity(longTextScore),
      score: longTextScore,
      explanation:
        "The response is long enough to contain multiple conflicting intents, so routing must avoid uniform skip/protect/rewrite behavior."
    });
  }

  const studentStateScore = Math.min(
    100,
    Math.round(
      ((flags.anxious || flags.frozen || flags.resistant) ? 22 : 0) +
        (flags.interview ? 10 : 0) +
        ((hasHighBoundary || hasHighDecision) ? 22 : 0) +
        (similarity.priority <= 80 ? 10 : 0) +
        (similarity.boundary <= 85 ? 8 : 0)
    )
  );
  if (studentStateScore >= ROUTING_CONFLICT_THRESHOLDS.studentState.medium) {
    signals.push({
      signalType: "student_state_priority_conflict",
      category: hasHighBoundary ? "boundary" : "priority",
      severity: scoreToSeverity(studentStateScore),
      score: studentStateScore,
      explanation:
        "The student state needs a different priority order than the proxy response is using, so the routing must account for safety and pacing."
    });
  }

  return signals.sort((left, right) => right.score - left.score);
}

export function explainWhyGuardWasOverridden(signalSet: RoutingConflictSignal[]) {
  const top = signalSet.filter((signal) => signal.severity === "high").slice(0, 2);
  if (!top.length) return "Guard was not overridden.";
  return `Guard was overridden because ${top.map((signal) => `${signal.signalType} (${signal.category}:${signal.severity})`).join(" and ")} demanded routing beyond similarity-only gating.`;
}

export function explainWhyMixedCaseWasTargeted(signalSet: RoutingConflictSignal[]) {
  const mixed = signalSet.find((signal) => signal.signalType === "mixed_content_conflict");
  if (!mixed) return "The case was not mixed enough to require targeted routing.";
  return `Mixed content required targeted routing because the response contained both aligned and conflicting segments (${mixed.category}:${mixed.severity}).`;
}

export function explainWhyHighSimilarityStillNeededCorrection(signalSet: RoutingConflictSignal[]) {
  const reason = signalSet.find((signal) => signal.signalType === "high_similarity_wrong_reasoning" || signal.signalType === "adversarial_politeness_mask");
  if (!reason) return "High similarity did not require additional correction.";
  return `High similarity still needed correction because ${reason.signalType} kept the teacher direction or boundary wrong despite the surface score.`;
}
