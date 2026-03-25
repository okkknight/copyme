import type {
  CandidateRuleSeed,
  PersonaLayer,
  ProxyReviewCase,
  ReviewDiffLabel,
  ReviewSignal,
  ReviewSignalStatus,
  ReviewSignalType
} from "@/lib/types";

function nowIso() {
  return new Date().toISOString();
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function signalTypeForLabel(label: ReviewDiffLabel): ReviewSignalType {
  if (label === "not_like_me" || label === "totally_off") return "boundary_correction";
  if (label === "style_similar_decision_different") return "decision_correction";
  return "style_correction";
}

function layerForLabel(label: ReviewDiffLabel): PersonaLayer {
  if (label === "not_like_me" || label === "totally_off") return "boundary";
  if (label === "style_similar_decision_different") return "decision";
  return "style";
}

function signalStatusForCase(reviewCase: ProxyReviewCase): ReviewSignalStatus {
  return reviewCase.reviewStatus === "written_back" ? "applied" : "new";
}

function describeSignal(reviewCase: ProxyReviewCase, label: ReviewDiffLabel) {
  switch (label) {
    case "more_like_me":
      return `Proxy is close to the human baseline for ${reviewCase.studentTemplateName}; keep the current decision path and apply only minimal polish.`;
    case "not_like_me":
      return "Proxy drifted too far from the human baseline and needs a boundary correction to preserve the teacher's decision shape.";
    case "style_similar_decision_different":
      return "Proxy kept the overall tone but changed the decision path; keep the calm surface while restoring the human decision pattern.";
    case "decision_similar_style_different":
      return "Proxy preserved the decision path but changed the tone; keep the decision shape while matching the human style layer.";
    case "totally_off":
    default:
      return "Proxy drifted across both tone and decision boundaries and should be corrected before further promotion.";
  }
}

function makeSignalId(reviewCaseId: string, label: ReviewDiffLabel) {
  return `review-signal-${reviewCaseId}-${label}`;
}

export function createReviewSignals(reviewCase: ProxyReviewCase): ReviewSignal[] {
  const label = reviewCase.selectedLabel ?? "not_like_me";
  const signalType = signalTypeForLabel(label);
  const targetLayer = layerForLabel(label);
  const createdAt = nowIso();
  const status = signalStatusForCase(reviewCase);
  const signals: ReviewSignal[] = [
    {
      id: makeSignalId(reviewCase.id, label),
      reviewCaseId: reviewCase.id,
      signalType,
      targetLayer,
      description: describeSignal(reviewCase, label),
      status,
      createdAt
    }
  ];

  if (label === "totally_off") {
    signals.push({
      id: `${makeSignalId(reviewCase.id, label)}-secondary`,
      reviewCaseId: reviewCase.id,
      signalType: "decision_correction",
      targetLayer: "decision",
      description: "After a large drift, preserve the teacher's decision shape before polishing style details.",
      status,
      createdAt
    });
  }

  return uniqueSignals(signals);
}

function uniqueSignals(signals: ReviewSignal[]) {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    if (seen.has(signal.id)) return false;
    seen.add(signal.id);
    return true;
  });
}

export function buildObservedRuleSeedFromSignal(signal: ReviewSignal, sourceSessionId: string): CandidateRuleSeed {
  return {
    id: `seed-${signal.id}`,
    ruleId: `rule-${signal.id}`,
    text: signal.description,
    layer: signal.targetLayer,
    confidence: signal.targetLayer === "boundary" ? 0.82 : signal.targetLayer === "decision" ? 0.78 : 0.74,
    behaviorPatternId: signal.signalType === "boundary_correction" ? "strict_escalation_after_repeated_same_error" : "diagnose_confidence_before_correcting",
    evidenceTurnIds: [],
    evidenceSummary: `Review signal ${signal.signalType} from case ${signal.reviewCaseId}`,
    sourceSessionIds: [sourceSessionId],
    status: "observed",
    createdAt: signal.createdAt,
    updatedAt: signal.createdAt
  };
}
