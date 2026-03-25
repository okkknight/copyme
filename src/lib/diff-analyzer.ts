import { inspectSimilarity, type SimilarityContext, type SimilarityAnalysis } from "@/lib/similarity-evaluator";
import { SEVERITY_PRECISION_THRESHOLDS } from "@/lib/severity-precision-thresholds";
import type { PrecisionSeverityResult, SeverityEvidence } from "@/lib/types";

export type SimilarityDiff = {
  category: "decision" | "priority" | "style" | "boundary";
  severity: "low" | "medium" | "high";
  reason: "student_model_error" | "rule_missing" | "rule_conflict" | "rule_weight_issue" | "generation_style_shift";
  explanation: string;
};

type CategoryState = {
  score: number;
  teacher: string;
  proxy: string;
  severity: SimilarityDiff["severity"];
  reason: SimilarityDiff["reason"];
  explanation: string;
  precisionSeverity: PrecisionSeverityResult;
};

function normalizeText(value: string) {
  return value.toLowerCase().replace(/['"]/g, "").replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
}

function textHasAny(text: string, phrases: string[]) {
  const normalized = normalizeText(text);
  return phrases.some((phrase) => normalized.includes(normalizeText(phrase)));
}

function studentModelSignals(input: SimilarityContext) {
  const profileText = typeof input.studentProfile === "string" ? input.studentProfile : [input.studentProfile?.name, input.studentProfile?.defaultLevel, input.studentProfile?.defaultAttitude, input.studentProfile?.defaultConfidence, input.studentProfile?.defaultEmotion, input.studentProfile?.defaultErrorPattern]
    .filter(Boolean)
    .join(" ");
  const profile = normalizeText(profileText);
  const scenario = normalizeText(String(input.scenario ?? ""));
  return {
    anxious: profile.includes("anxious") || profile.includes("shy") || profile.includes("low confidence") || profile.includes("self conscious"),
    shy: profile.includes("shy") || profile.includes("quiet") || profile.includes("reserved"),
    argumentative: profile.includes("argumentative") || profile.includes("smart but lazy") || profile.includes("high confidence"),
    interview: scenario.includes("interview"),
    debate: scenario.includes("debate") || scenario.includes("opinion"),
    storytelling: scenario.includes("story"),
    daily: scenario.includes("daily")
  };
}

function categoryThreshold(category: SimilarityDiff["category"]) {
  return SEVERITY_PRECISION_THRESHOLDS.category[category];
}

function addEvidence(evidence: SeverityEvidence[], item: SeverityEvidence) {
  evidence.push(item);
}

function buildEvidenceText(parts: string[]) {
  return parts.filter(Boolean).join(" ");
}

function collectPrecisionEvidence(category: SimilarityDiff["category"], input: SimilarityContext, analysis: SimilarityAnalysis) {
  const teacher = analysis.teacherSignals;
  const proxy = analysis.proxySignals;
  const studentFlags = studentModelSignals(input);
  const evidence: SeverityEvidence[] = [];
  const teacherText = normalizeText(teacher.text);
  const proxyText = normalizeText(proxy.text);
  const teacherProtect = teacher.boundaryProtect + teacher.warmth;
  const proxyHarsh = proxy.boundaryHarsh + proxy.pressure + proxy.correction;
  const teacherDecisionSupport = teacher.reassurance + teacher.diagnosis + teacher.example + teacher.retry + teacher.agency;
  const proxyDecisionPressure = proxy.pressure + proxy.correction + proxy.release;
  const teacherMeaningPriority = teacher.meaning + teacher.boundaryProtect + teacher.agency;
  const proxyPrecisionPriority = proxy.precision + proxy.correction + proxy.pressure;
  const teacherWarmStyle = teacher.warmth + teacher.hedging;
  const proxySharpStyle = proxy.directness + proxy.boundaryHarsh;

  if (category === "boundary") {
    if (teacherProtect > proxy.boundaryProtect + 0.08 && proxyHarsh > teacher.boundaryHarsh + 0.08) {
      addEvidence(evidence, {
        category,
        evidenceType: "teacher_boundary_conflict",
        weight: SEVERITY_PRECISION_THRESHOLDS.evidenceWeights.teacher_boundary_conflict,
        explanation: "The teacher protects face and safety more clearly than the proxy, while the proxy pushes harsher correction."
      });
    }
    if (/(in front of everyone|public|everyone|humiliate|embarrass|shame|obviously)/.test(proxyText) && (teacherProtect > 0.25 || studentFlags.anxious || studentFlags.interview)) {
      addEvidence(evidence, {
        category,
        evidenceType: "public_humiliation_signal",
        weight: SEVERITY_PRECISION_THRESHOLDS.evidenceWeights.public_humiliation_signal,
        explanation: "The proxy exposes the student publicly or uses humiliation-like language in a context where the teacher is face-saving."
      });
    }
    if ((proxyHarsh > 0.32 || proxy.correction + proxy.pressure > 0.38) && teacherProtect > 0.24) {
      addEvidence(evidence, {
        category,
        evidenceType: "direct_correction_before_safety",
        weight: SEVERITY_PRECISION_THRESHOLDS.evidenceWeights.direct_correction_before_safety,
        explanation: "The proxy corrects directly before establishing safety or face-saving, unlike the teacher."
      });
    }
    if (teacherText.includes("face") || teacherText.includes("safe") || teacherText.includes("privately") || teacherText.includes("supportive")) {
      const proxyViolatesFace = proxyText.includes("wrong") || proxyText.includes("should know") || proxyText.includes("in front of everyone") || proxyText.includes("public");
      if (proxyViolatesFace) {
        addEvidence(evidence, {
          category,
          evidenceType: "face_saving_violation",
          weight: SEVERITY_PRECISION_THRESHOLDS.evidenceWeights.face_saving_violation,
          explanation: "The teacher explicitly keeps the correction face-saving, but the proxy crosses that boundary."
        });
      }
    }
    if ((studentFlags.anxious || studentFlags.shy || studentFlags.interview) && proxyHarsh > 0.3) {
      addEvidence(evidence, {
        category,
        evidenceType: "student_state_mismatch",
        weight: SEVERITY_PRECISION_THRESHOLDS.evidenceWeights.student_state_mismatch,
        explanation: "The student state calls for safety, but the proxy response stays too harsh or public."
      });
    }
  } else if (category === "decision") {
    if (teacher.decisionMode !== proxy.decisionMode && teacherDecisionSupport > proxyDecisionPressure + 0.08) {
      addEvidence(evidence, {
        category,
        evidenceType: "teacher_decision_conflict",
        weight: SEVERITY_PRECISION_THRESHOLDS.evidenceWeights.teacher_decision_conflict,
        explanation: "The teacher's decision path centers reassurance, diagnosis, example, or retry, while the proxy moves toward correction or release."
      });
    }
    if (teacher.priorityMode !== proxy.priorityMode && teacherMeaningPriority > proxyPrecisionPriority + 0.06) {
      addEvidence(evidence, {
        category,
        evidenceType: "priority_order_conflict",
        weight: SEVERITY_PRECISION_THRESHOLDS.evidenceWeights.priority_order_conflict,
        explanation: "The teacher protects meaning, agency, or face first, but the proxy orders the response around precision too early."
      });
    }
    if (
      (teacherText.includes("main idea") || teacherText.includes("meaning") || teacherText.includes("keep speaking") || teacherText.includes("diagnose") || teacherText.includes("don't worry")) &&
      (proxyText.includes("correct") || proxyText.includes("wrong") || proxyText.includes("move on") || proxyText.includes("you should know") || proxyText.includes("must"))
    ) {
      addEvidence(evidence, {
        category,
        evidenceType: "meaning_first_violation",
        weight: SEVERITY_PRECISION_THRESHOLDS.evidenceWeights.meaning_first_violation,
        explanation: "The teacher keeps meaning or student expression first, but the proxy violates that order by jumping into correction or pressure."
      });
    }
    if ((studentFlags.anxious || studentFlags.shy || studentFlags.interview) && proxyDecisionPressure > 0.33) {
      addEvidence(evidence, {
        category,
        evidenceType: "student_state_mismatch",
        weight: SEVERITY_PRECISION_THRESHOLDS.evidenceWeights.student_state_mismatch,
        explanation: "The student needs reassurance or pacing, but the proxy applies pressure or correction first."
      });
    }
  } else if (category === "priority") {
    if (teacher.priorityMode !== proxy.priorityMode && teacherMeaningPriority > proxyPrecisionPriority + 0.06) {
      addEvidence(evidence, {
        category,
        evidenceType: "priority_order_conflict",
        weight: SEVERITY_PRECISION_THRESHOLDS.evidenceWeights.priority_order_conflict - 2,
        explanation: "The teacher prioritizes meaning or face before precision, but the proxy inverts the order."
      });
    }
    if (
      (teacherText.includes("main idea") || teacherText.includes("meaning")) &&
      (proxyText.includes("grammar") || proxyText.includes("precision") || proxyText.includes("correct"))
    ) {
      addEvidence(evidence, {
        category,
        evidenceType: "meaning_first_violation",
        weight: SEVERITY_PRECISION_THRESHOLDS.evidenceWeights.meaning_first_violation - 2,
        explanation: "The teacher stays meaning-first, but the proxy escalates precision too early."
      });
    }
    if ((studentFlags.anxious || studentFlags.shy) && proxyPrecisionPriority > teacherMeaningPriority + 0.08) {
      addEvidence(evidence, {
        category,
        evidenceType: "student_state_mismatch",
        weight: SEVERITY_PRECISION_THRESHOLDS.evidenceWeights.student_state_mismatch - 4,
        explanation: "The student needs softer pacing, but the proxy leans too hard into precision."
      });
    }
  } else if (category === "style") {
    if (teacher.styleMode !== proxy.styleMode && teacherWarmStyle > proxySharpStyle + 0.06) {
      addEvidence(evidence, {
        category,
        evidenceType: "student_state_mismatch",
        weight: 10,
        explanation: "The teacher stays warmer or more hedged, while the proxy becomes sharper."
      });
    }
  }

  return evidence;
}

function summarizePrecisionSeverity(category: SimilarityDiff["category"], score: number): PrecisionSeverityResult["severity"] {
  const thresholds = categoryThreshold(category);
  if (score >= thresholds.high) return "high";
  if (score >= thresholds.medium) return "medium";
  return "low";
}

export function evaluatePrecisionSeverity(input: SimilarityContext & { category: SimilarityDiff["category"] }): PrecisionSeverityResult {
  const analysis = inspectSimilarity(input);
  const teacherText = normalizeText(input.teacherResponse);
  const proxyText = normalizeText(input.proxyResponse);
  if (teacherText && teacherText === proxyText) {
    return {
      category: input.category,
      score: 0,
      severity: "low",
      evidence: []
    };
  }
  const evidence = collectPrecisionEvidence(input.category, input, analysis);
  const baseGap = 100 - analysis.dimensionScores[input.category];
  const evidenceScore = evidence.reduce((sum, item) => sum + item.weight, 0);
  const score = Math.max(baseGap, evidenceScore, input.category === "decision" || input.category === "boundary" ? evidenceScore + 6 : evidenceScore);
  return {
    category: input.category,
    score: Math.min(100, Math.round(score)),
    severity: summarizePrecisionSeverity(input.category, Math.min(100, Math.round(score))),
    evidence
  };
}

export function evaluatePrecisionSeverities(input: SimilarityContext) {
  return (["decision", "priority", "style", "boundary"] as const).map((category) =>
    evaluatePrecisionSeverity({
      ...input,
      category
    })
  );
}

function modeSeverity(teacherMode: string, proxyMode: string, sameFamily: boolean) {
  if (teacherMode === proxyMode) return "low";
  if (sameFamily) return "medium";
  return "high";
}

function sameFamily(category: SimilarityDiff["category"], teacherMode: string, proxyMode: string) {
  if (category === "decision") {
    return (
      (teacherMode.includes("reassurance") && proxyMode.includes("diagnosis")) ||
      (teacherMode.includes("diagnosis") && proxyMode.includes("reassurance")) ||
      (teacherMode.includes("example") && proxyMode.includes("retry")) ||
      (teacherMode.includes("retry") && proxyMode.includes("example")) ||
      (teacherMode.includes("pressure") && proxyMode.includes("correction")) ||
      (teacherMode.includes("correction") && proxyMode.includes("pressure"))
    );
  }
  if (category === "priority") {
    return (
      (teacherMode.includes("meaning") && proxyMode.includes("precision")) ||
      (teacherMode.includes("precision") && proxyMode.includes("meaning")) ||
      (teacherMode.includes("agency") && proxyMode.includes("boundary")) ||
      (teacherMode.includes("boundary") && proxyMode.includes("agency"))
    );
  }
  if (category === "style") {
    return (teacherMode.includes("warm") && proxyMode.includes("direct")) || (teacherMode.includes("direct") && proxyMode.includes("warm")) || (teacherMode.includes("hedged") && proxyMode.includes("terse"));
  }
  return (teacherMode.includes("face") && proxyMode.includes("harsh")) || (teacherMode.includes("harsh") && proxyMode.includes("face")) || (teacherMode.includes("respect") && proxyMode.includes("direct"));
}

function chooseReason(category: SimilarityDiff["category"], input: SimilarityContext, analysis: SimilarityAnalysis) {
  const studentFlags = studentModelSignals(input);
  const teacher = analysis.teacherSignals;
  const proxy = analysis.proxySignals;

  const strongConflict =
    (category === "decision" && teacher.decisionMode !== proxy.decisionMode && (teacher.correction + teacher.pressure + teacher.reassurance + teacher.diagnosis + teacher.example + teacher.retry > 0.45)) ||
    (category === "priority" && teacher.priorityMode !== proxy.priorityMode && (teacher.meaning + teacher.precision + teacher.boundaryProtect + teacher.agency > 0.4)) ||
    (category === "style" && teacher.styleMode !== proxy.styleMode && (teacher.warmth + teacher.directness + teacher.hedging > 0.35)) ||
    (category === "boundary" && teacher.boundaryMode !== proxy.boundaryMode && (teacher.boundaryProtect + teacher.boundaryHarsh > 0.35));

  const proxyOmitsTeacherSignal =
    (category === "decision" && teacher.decisionMode !== proxy.decisionMode && !textHasAny(proxy.text, ["don't worry", "good start", "diagnose", "give me", "example", "try again", "move on", "keep speaking"])) ||
    (category === "priority" && teacher.priorityMode !== proxy.priorityMode && !textHasAny(proxy.text, ["meaning", "grammar", "precision", "next step", "one more"])) ||
    (category === "style" && teacher.styleMode !== proxy.styleMode && !textHasAny(proxy.text, ["good", "nice", "warm", "direct", "short", "maybe"])) ||
    (category === "boundary" && teacher.boundaryMode !== proxy.boundaryMode && !textHasAny(proxy.text, ["face", "safe", "respect", "supportive", "public"]));

  if (studentFlags.anxious && (category === "boundary" || category === "style")) return "student_model_error";
  if (studentFlags.argumentative && (category === "decision" || category === "priority") && proxy.decisionMode.includes("reassurance")) return "student_model_error";
  if (strongConflict) return "rule_conflict";
  if (proxyOmitsTeacherSignal) return "rule_missing";
  if (category === "style" && analysis.dimensionScores.decision >= 72 && analysis.dimensionScores.priority >= 72) return "generation_style_shift";
  return "rule_weight_issue";
}

function buildCategoryState(category: SimilarityDiff["category"], input: SimilarityContext, analysis: SimilarityAnalysis): CategoryState {
  const score = analysis.dimensionScores[category === "decision" ? "decision" : category === "priority" ? "priority" : category === "style" ? "style" : "boundary"];
  const precisionSeverity = evaluatePrecisionSeverity({
    ...input,
    category
  });
  const teacherMode =
    category === "decision"
      ? analysis.teacherSignals.decisionMode
      : category === "priority"
        ? analysis.teacherSignals.priorityMode
        : category === "style"
          ? analysis.teacherSignals.styleMode
          : analysis.teacherSignals.boundaryMode;
  const proxyMode =
    category === "decision"
      ? analysis.proxySignals.decisionMode
      : category === "priority"
        ? analysis.proxySignals.priorityMode
        : category === "style"
          ? analysis.proxySignals.styleMode
          : analysis.proxySignals.boundaryMode;

  const gap = 100 - score;
  const heuristicSeverity: SimilarityDiff["severity"] = gap >= 45 || modeSeverity(teacherMode, proxyMode, sameFamily(category, teacherMode, proxyMode)) === "high"
    ? "high"
    : gap >= 25
      ? "medium"
      : "low";
  const severity: SimilarityDiff["severity"] = category === "decision" || category === "boundary" ? precisionSeverity.severity : heuristicSeverity;

  const reason = chooseReason(category, input, analysis);

  const contextLine =
    category === "decision"
      ? `Decision mismatch: teacher ${teacherMode.replaceAll("_", " ")} while proxy ${proxyMode.replaceAll("_", " ")}.`
      : category === "priority"
        ? `Priority mismatch: teacher ${teacherMode.replaceAll("_", " ")} while proxy ${proxyMode.replaceAll("_", " ")}.`
        : category === "style"
          ? `Style mismatch: teacher ${teacherMode.replaceAll("_", " ")} while proxy ${proxyMode.replaceAll("_", " ")}.`
          : `Boundary mismatch: teacher ${teacherMode.replaceAll("_", " ")} while proxy ${proxyMode.replaceAll("_", " ")}.`;

  const explanation =
    category === "decision"
      ? `${contextLine} The teacher keeps the student speaking or diagnoses before correcting, but the proxy jumps earlier or releases too soon.`
      : category === "priority"
        ? `${contextLine} The teacher protects the most important layer first, while the proxy spends weight on the wrong priority.`
        : category === "style"
          ? `${contextLine} The teacher stays more collaborative or supportive, while the proxy shifts tone and delivery.`
          : `${contextLine} The teacher preserves face and avoids public-style correction, while the proxy crosses the boundary too directly.`;

  return {
    score,
    teacher: teacherMode,
    proxy: proxyMode,
    severity,
    reason,
    explanation,
    precisionSeverity
  };
}

export function analyzeSimilarityDiff(input: SimilarityContext): SimilarityDiff[] {
  const analysis = inspectSimilarity(input);
  const categories: SimilarityDiff["category"][] = ["decision", "priority", "style", "boundary"];
  const states = categories.map((category) => ({
    category,
    ...buildCategoryState(category, input, analysis)
  }));

  const ordered = states.sort((left, right) => {
    const severityRank = (value: SimilarityDiff["severity"]) => (value === "high" ? 2 : value === "medium" ? 1 : 0);
    const leftRank = severityRank(left.severity) * 100 + (100 - left.score);
    const rightRank = severityRank(right.severity) * 100 + (100 - right.score);
    return rightRank - leftRank;
  });

  const picked = ordered.filter((item) => item.severity !== "low" || item.score < 88).slice(0, 5);
  while (picked.length < 2 && ordered.length > picked.length) {
    const candidate = ordered[picked.length];
    if (candidate && !picked.some((item) => item.category === candidate.category)) picked.push(candidate);
  }

  return picked.slice(0, 5).map((item) => ({
    category: item.category,
    severity: item.severity,
    reason: item.reason,
    explanation: item.explanation
  }));
}
