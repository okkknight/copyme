import type { DiffResult } from "@/lib/noop-guard";
import { evaluatePrecisionSeverity } from "@/lib/diff-analyzer";
import { CALIBRATION_PRECISION_THRESHOLDS } from "@/lib/calibration-precision-thresholds";
import type { PrecisionSeverityResult, SegmentCorrectionIntent, SegmentDiff } from "@/lib/types";
import type { SimilarityStudentProfile } from "@/lib/similarity-evaluator";

function normalizeText(value: string) {
  return value.toLowerCase().replace(/['"]/g, "").replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
}

function splitIntoSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/g)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function tokenize(text: string) {
  return normalizeText(text)
    .split(/\s+/g)
    .map((token) => token.trim())
    .filter(Boolean);
}

function similarityScore(left: string, right: string) {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (!leftTokens.size || !rightTokens.size) return 0;

  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1;
  }

  return shared / Math.max(leftTokens.size, rightTokens.size, 1);
}

function categoryFromSentence(sentence: string): SegmentDiff["category"] {
  const lowered = normalizeText(sentence);
  if (/(don't worry|good start|nice start|keep speaking|privately|face saving|supportive|together|calm|respect)/.test(lowered)) return "boundary";
  if (/(main idea|meaning|priority|important|first|one concrete|example|grammar|precision|focus on)/.test(lowered)) return "priority";
  if (/(correct|fix|wrong|should|must|need to|try again|retry|pressure|diagnose)/.test(lowered)) return "decision";
  return "style";
}

function caseHasCriticalPrecision(category: SegmentDiff["category"], precisionSeverities?: PrecisionSeverityResult[]) {
  return precisionSeverities?.some((item) => item.category === category && item.severity === "high") ?? false;
}

function resolveSentenceCategory(
  sentence: string,
  precisionSeverities?: PrecisionSeverityResult[]
): SegmentDiff["category"] {
  const lowered = normalizeText(sentence);
  if (caseHasCriticalPrecision("boundary", precisionSeverities) && /(wrong|should know|in front of everyone|public|humiliate|shame|face|harsh|embarrass|privately)/.test(lowered)) {
    return "boundary";
  }
  if (caseHasCriticalPrecision("decision", precisionSeverities) && /(correct|fix|must|should|need to|try again|retry|pressure|diagnose|main idea|meaning)/.test(lowered)) {
    return "decision";
  }
  return categoryFromSentence(sentence);
}

function severityFromDiffs(category: SegmentDiff["category"], diffs: DiffResult[]) {
  const relevant = diffs.filter((diff) => diff.category === category);
  if (!relevant.length) return "low" as const;
  if (relevant.some((diff) => diff.severity === "high")) return "high" as const;
  if (relevant.some((diff) => diff.severity === "medium")) return "medium" as const;
  return "low" as const;
}

function suggestedActionFor(category: SegmentDiff["category"], severity: SegmentDiff["severity"], sentenceSimilarity: number): SegmentDiff["suggestedAction"] {
  if (sentenceSimilarity >= CALIBRATION_PRECISION_THRESHOLDS.segment.protectedSimilarity) return "keep";
  if (category === "decision" || category === "boundary") {
    return severity === "high" ? "rewrite" : sentenceSimilarity >= CALIBRATION_PRECISION_THRESHOLDS.segment.keepSimilarity ? "keep" : "rewrite";
  }
  if (category === "priority") {
    if (severity === "high") return "reorder";
    return sentenceSimilarity >= CALIBRATION_PRECISION_THRESHOLDS.segment.keepSimilarity ? "keep" : "reorder";
  }
  if (severity === "low") return sentenceSimilarity >= CALIBRATION_PRECISION_THRESHOLDS.segment.keepSimilarity ? "keep" : "soften";
  if (severity === "medium") return "soften";
  return sentenceSimilarity >= CALIBRATION_PRECISION_THRESHOLDS.segment.keepSimilarity ? "keep" : "rewrite";
}

function bestTeacherSimilarity(sentence: string, teacherSentences: string[]) {
  return teacherSentences.reduce(
    (best, teacherSentence, index) => {
      const similarity = similarityScore(sentence, teacherSentence) * 0.9 + Math.max(0, 1 - Math.abs(index - teacherSentences.length / 2) * 0.04);
      return similarity > best.score ? { score: similarity, sentence: teacherSentence } : best;
    },
    { score: 0, sentence: "" }
  );
}

function precisionByCategory(precisionSeverities?: PrecisionSeverityResult[]) {
  return new Map((precisionSeverities ?? []).map((item) => [item.category, item] as const));
}

function precisionForCategory(
  category: SegmentDiff["category"],
  precisionSeverities?: PrecisionSeverityResult[],
  teacherResponse?: string,
  proxyResponse?: string,
  studentProfile?: SimilarityStudentProfile | string,
  scenario?: string
) {
  const lookup = precisionByCategory(precisionSeverities);
  const existing = lookup.get(category);
  if (existing) return existing;
  if (!teacherResponse || !proxyResponse) {
    return {
      category,
      severity: "low" as const,
      score: 0,
      evidence: []
    };
  }
  return evaluatePrecisionSeverity({
    teacherResponse,
    proxyResponse,
    scenario: scenario ?? "",
    studentProfile,
    category
  });
}

export function splitResponseSentences(text: string) {
  return splitIntoSentences(text);
}

export function analyzeResponseSegments({
  teacherResponse,
  proxyResponse,
  diffs,
  precisionSeverities,
  studentProfile,
  scenario
}: {
  teacherResponse: string;
  proxyResponse: string;
  diffs: DiffResult[];
  precisionSeverities?: PrecisionSeverityResult[];
  studentProfile?: SimilarityStudentProfile | string;
  scenario?: string;
}): SegmentDiff[] {
  const teacherSentences = splitIntoSentences(teacherResponse);
  const proxySentences = splitIntoSentences(proxyResponse);

  return proxySentences.map((sentence, index) => {
    const bestTeacher = bestTeacherSimilarity(sentence, teacherSentences.length ? teacherSentences : [teacherResponse]);
    const sentenceSimilarity = bestTeacher.score;
    const category = resolveSentenceCategory(sentence, precisionSeverities);
    const precision = precisionForCategory(category, precisionSeverities, teacherResponse, proxyResponse, studentProfile, scenario);
    const diffSeverity = severityFromDiffs(category, diffs);
    const severity = category === "decision" || category === "boundary" ? precision.severity : diffSeverity;
    const dominantDiff = diffs.find((diff) => diff.category === category) ?? diffs[0];
    const criticalPrecision =
      category === "decision" || category === "boundary" ? precision.severity : diffSeverity;
    const shouldProtect =
      sentenceSimilarity >= CALIBRATION_PRECISION_THRESHOLDS.segment.protectedSimilarity &&
      criticalPrecision === "low" &&
      diffSeverity === "low";
    const shouldEdit =
      !shouldProtect ||
      criticalPrecision !== "low" ||
      diffs.some((diff) => diff.category === category && diff.severity !== "low");
    const suggestedAction =
      category === "decision" || category === "boundary"
        ? precision.severity === "high"
          ? "rewrite"
          : precision.severity === "medium"
            ? category === "boundary"
              ? "rewrite"
              : "reorder"
            : suggestedActionFor(category, severity, sentenceSimilarity)
        : suggestedActionFor(category, severity, sentenceSimilarity);
    const indexedCategory =
      precision.severity !== "low" && (category === "decision" || category === "boundary") ? precision.category : dominantDiff?.category ?? category;
    const categoryPriority =
      indexedCategory === "decision"
        ? 3
        : indexedCategory === "boundary"
          ? 3
          : indexedCategory === "priority"
            ? 2
            : 1;

    return {
      segmentId: `sentence-${index + 1}`,
      originalText: sentence,
      category: indexedCategory,
      severity,
      shouldEdit,
      suggestedAction:
        suggestedAction === "keep" && sentenceSimilarity < CALIBRATION_PRECISION_THRESHOLDS.segment.keepSimilarity
          ? categoryPriority >= 2
            ? "reorder"
            : "soften"
          : shouldProtect && (category === "decision" || category === "boundary") && precision.severity === "high"
            ? "rewrite"
            : suggestedAction
    };
  });
}

export function buildSegmentCorrectionIntent({
  segmentDiffs,
  precisionSeverities
}: {
  segmentDiffs: SegmentDiff[];
  precisionSeverities?: PrecisionSeverityResult[];
}): SegmentCorrectionIntent[] {
  const precisionByCategoryMap = precisionByCategory(precisionSeverities);
  return segmentDiffs.map((segment) => {
    const precision = precisionByCategoryMap.get(segment.category);
    const precisionSeverity = precision?.severity ?? segment.severity;
    const critical = segment.category === "decision" || segment.category === "boundary";
    let correctionIntent: SegmentCorrectionIntent["correctionIntent"] = "protect";

    if (!segment.shouldEdit && precisionSeverity === "low") {
      correctionIntent = "protect";
    } else if (segment.category === "style") {
      correctionIntent = precisionSeverity === "high" || segment.severity === "medium" ? "soften" : "protect";
    } else if (segment.category === "priority") {
      correctionIntent = precisionSeverity === "high" ? "reorder" : segment.severity === "low" ? "protect" : "reorder";
    } else if (critical) {
      correctionIntent = precisionSeverity === "high" ? "rewrite" : precisionSeverity === "medium" ? "reframe" : segment.shouldEdit ? "reframe" : "protect";
    } else {
      correctionIntent = segment.shouldEdit ? "reframe" : "protect";
    }

    return {
      segmentId: segment.segmentId,
      category: segment.category,
      correctionIntent,
      reason:
        critical && precisionSeverity === "high"
          ? `High precision severity for ${segment.category} indicates a real boundary or decision conflict, so this segment should be rewritten.`
          : segment.category === "priority" && precisionSeverity !== "low"
            ? `Priority ordering still needs adjustment, so this segment should be reordered.`
            : segment.category === "style" && precisionSeverity !== "low"
              ? `Tone drift is present, so this segment should be softened instead of rewritten.`
              : segment.shouldEdit
                ? `This segment carries a localized mismatch and should be edited with minimal change.`
                : `This segment is already sufficiently aligned and should be protected.`
    };
  });
}

export function summarizeSegmentDiffs(segmentDiffs: SegmentDiff[]) {
  if (!segmentDiffs.length) return "no segment diffs";
  return segmentDiffs
    .map((segment) => `${segment.segmentId}:${segment.category}/${segment.severity}/${segment.suggestedAction}`)
    .join(" | ");
}
