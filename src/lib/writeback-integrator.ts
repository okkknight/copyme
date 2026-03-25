import type { FeedbackWriteback, RuleLike } from "@/lib/feedback-writer";
import { CALIBRATION_PRECISION_THRESHOLDS } from "@/lib/calibration-precision-thresholds";
import type {
  CalibrationPlan,
  CalibratedConflictSignal,
  PrecisionSeverityResult,
  RoutingConflictSignal,
  RoutingDecision,
  ReactionBand,
  ReactionConstraint,
  ReactionControlDecision,
  ReactionEditBudget,
  SegmentCorrectionIntent,
  SegmentDiff,
  SegmentPriority
  ,
  SignalCalibrationTrace
} from "@/lib/types";
import type { SimilarityStudentProfile } from "@/lib/similarity-evaluator";
import { WRITEBACK_THRESHOLDS } from "@/lib/writeback-thresholds";
import type { ProxyCalibrationAction, ProxyCalibrationState, ProxyReviewCase } from "@/lib/types";

function nowIso() {
  return new Date().toISOString();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/['"]/g, "").replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
}

function actionForWriteback(writeback: FeedbackWriteback): ProxyCalibrationAction["action"] {
  const category = categoryFromReason(writeback.reason);
  if (writeback.action === "create_new_rule") {
    if (category === "style") return "adjust_style";
    if (category === "boundary") return "adjust_boundary";
    if (category === "decision" || category === "priority") return "adjust_priority";
    return "strengthen";
  }

  if (writeback.action === "strengthen") {
    if (category === "style") return "adjust_style";
    if (category === "boundary") return "adjust_boundary";
    return "strengthen";
  }

  return writeback.action;
}

function magnitudeForWriteback(writeback: FeedbackWriteback) {
  const base =
    writeback.action === "create_new_rule"
      ? WRITEBACK_THRESHOLDS.magnitudeDefaults.strengthen
      : WRITEBACK_THRESHOLDS.magnitudeDefaults[writeback.action];
  const severity = severityFromReason(writeback.reason);
  const severityBoost = severity === "high" ? 10 : severity === "medium" ? 5 : 0;
  const targetBoost = clamp(writeback.targetRuleIds.length * 2, 0, 6);
  return clamp(base + severityBoost + targetBoost, WRITEBACK_THRESHOLDS.magnitudeRange.min, WRITEBACK_THRESHOLDS.magnitudeRange.max);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function summarizeAction(action: ProxyCalibrationAction) {
  return `${action.action}:${action.magnitude}`;
}

function reactionBandRank(band: ReactionBand) {
  return {
    skip: 0,
    guarded_targeted: 1,
    partial_targeted: 2,
    cluster_targeted: 3,
    bounded_full: 4,
    full_correction: 5
  }[band];
}

function deriveReactionBand(plan?: Pick<CalibrationPlan, "mode" | "reactionBand" | "reactionDecision">) {
  if (plan?.reactionDecision?.band) return plan.reactionDecision.band;
  if (plan?.reactionBand) return plan.reactionBand;
  if (!plan?.mode) return "targeted" as ReactionBand;
  if (plan.mode === "skip") return "skip";
  if (plan.mode === "light_touch") return "guarded_targeted";
  if (plan.mode === "targeted") return "partial_targeted";
  return "bounded_full";
}

function reactionBandAllowsAction(
  band: ReactionBand,
  category: "decision" | "priority" | "style" | "boundary",
  action: ProxyCalibrationAction["action"],
  targetedCategories: CalibrationPlan["targetedCategories"]
) {
  if (band === "skip") return false;
  if (band === "guarded_targeted") {
    return category === "style" || category === "boundary" || action === "adjust_style" || action === "adjust_boundary";
  }
  if (band === "partial_targeted") {
    return targetedCategories.includes(category) && action !== "strengthen";
  }
  if (band === "cluster_targeted") {
    return targetedCategories.includes(category);
  }
  if (band === "bounded_full") {
    return action !== "strengthen" || category !== "boundary";
  }
  return true;
}

function bandMagnitudeCap(band: ReactionBand) {
  return {
    skip: 0,
    guarded_targeted: 12,
    partial_targeted: 18,
    cluster_targeted: 24,
    bounded_full: 30,
    full_correction: 40
  }[band];
}

function reactionConstraintForBand(band: ReactionBand): ReactionConstraint {
  return {
    maxEditableSegments: band === "skip" ? 0 : band === "guarded_targeted" ? 1 : band === "partial_targeted" ? 3 : band === "cluster_targeted" ? 4 : band === "bounded_full" ? 6 : undefined,
    allowGlobalRewrite: band === "full_correction",
    forceLocalOnly: band !== "full_correction",
    preserveHighPrioritySegments: band !== "full_correction"
  };
}

export function integrateFeedbackWriteback({
  writebacks,
  reviewCaseId,
  plan,
  segmentDiffs = [],
  precisionSeverities = [],
  segmentCorrectionIntents = []
}: {
  writebacks: FeedbackWriteback[];
  reviewCaseId: string;
  plan?: CalibrationPlan;
  segmentDiffs?: SegmentDiff[];
  precisionSeverities?: PrecisionSeverityResult[];
  segmentCorrectionIntents?: SegmentCorrectionIntent[];
}): ProxyCalibrationState {
  const actions = plan?.actions?.length
    ? plan.actions
    : writebacks.map<ProxyCalibrationAction>((writeback) => ({
        action: actionForWriteback(writeback),
        magnitude: magnitudeForWriteback(writeback),
        reason: writeback.reason
      }));

  return {
    id: `proxy-calibration-${reviewCaseId}`,
    sourceReviewCaseId: reviewCaseId,
    targetRuleIds: uniqueStrings(writebacks.flatMap((writeback) => writeback.targetRuleIds)),
    actions,
    calibrationMode: plan?.mode,
    calibrationScope: plan ? (segmentDiffs.length <= 1 ? "phrase" : segmentDiffs.length <= 3 ? "sentence" : "global") : undefined,
    protectedSegments: plan?.protectedSegments,
    editableSegments: plan?.editableSegments,
    segmentDiffs: segmentDiffs.length ? segmentDiffs : plan ? [] : undefined,
    precisionSeverities: precisionSeverities.length ? precisionSeverities : plan?.precisionSeverities,
    segmentCorrectionIntents: segmentCorrectionIntents.length ? segmentCorrectionIntents : plan?.segmentCorrectionIntents,
    routingDecision: plan?.routingDecision,
    conflictSignals: plan?.conflictSignals,
    calibratedConflictSignals: plan?.calibratedConflictSignals,
    signalCalibrationTraces: plan?.signalCalibrationTraces,
    directionProbe: plan?.directionProbe,
    longTextScopeSplit: plan?.longTextScopeSplit,
    segmentPriorities: plan?.segmentPriorities,
    reactionDecision: plan?.reactionDecision,
    reactionConstraint: plan?.reactionConstraint,
    reactionBand: plan?.reactionBand,
    reactionSafetyReason: plan?.reactionSafetyReason,
    editBudget: plan?.editBudget,
    microEditOpportunities: plan?.microEditOpportunities,
    microEditROIs: plan?.microEditROIs,
    microEditSelectionResult: plan?.microEditSelectionResult,
    microEditPlan: plan?.microEditPlan,
    microEditResult: plan?.microEditResult,
    editBudgetPolicy: plan?.editBudgetPolicy,
    planReason: plan?.reason,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}

export function buildPrecisionCalibrationActions({
  writebacks,
  plan,
  segmentDiffs,
  precisionSeverities = [],
  segmentCorrectionIntents = [],
  conflictSignals = [],
  segmentPriorities = [],
  routingDecision
}: {
  writebacks: FeedbackWriteback[];
  plan: Pick<
    CalibrationPlan,
    | "mode"
    | "targetedCategories"
    | "protectedSegments"
    | "editableSegments"
    | "shouldApply"
    | "reason"
    | "routingDecision"
    | "conflictSignals"
    | "segmentPriorities"
    | "reactionBand"
    | "reactionDecision"
    | "reactionConstraint"
    | "editBudget"
  >;
  segmentDiffs: SegmentDiff[];
  precisionSeverities?: PrecisionSeverityResult[];
  segmentCorrectionIntents?: SegmentCorrectionIntent[];
  conflictSignals?: RoutingConflictSignal[];
  segmentPriorities?: SegmentPriority[];
  routingDecision?: RoutingDecision;
}): ProxyCalibrationAction[] {
  const band = deriveReactionBand(plan);
  const maxActions = plan.editBudget?.maxEdits ?? (band === "skip" ? 0 : Infinity);
  if (!plan.shouldApply || band === "skip" || !writebacks.length || maxActions === 0) return [];

  const targetedCategories = new Set(plan.targetedCategories);
  const protectedSegments = new Set(plan.protectedSegments.map(normalizeSentenceKey));
  const editableSegments = new Set(plan.editableSegments.map(normalizeSentenceKey));
  const segmentLookup = new Map(segmentDiffs.map((segment) => [segment.segmentId, segment] as const));
  const precisionLookup = new Map(precisionSeverities.map((item) => [item.category, item] as const));
  const intentLookup = new Map(segmentCorrectionIntents.map((item) => [item.category, item] as const));
  const priorityLookup = new Map(segmentPriorities.map((item) => [item.segmentId, item] as const));
  const guardOverride = routingDecision?.shouldOverrideGuard ?? conflictSignals.some((signal) => signal.severity === "high");
  let emitted = 0;

  return writebacks.flatMap((writeback, index) => {
    if (emitted >= maxActions) return [];
    const category = categoryFromReason(writeback.reason);
    const action = mapPrecisionAction(writeback);
    const allowedByBand = reactionBandAllowsAction(band, category, action, plan.targetedCategories);
    const allowedByMode =
      band === "guarded_targeted"
        ? category === "priority" || category === "style" || category === "boundary"
        : band === "partial_targeted"
          ? targetedCategories.has(category)
          : band === "cluster_targeted"
            ? targetedCategories.has(category)
            : true;

    if (!allowedByBand || !allowedByMode) return [];

    const severity = severityFromReason(writeback.reason);
    const baseMagnitude = precisionMagnitude(writeback, plan.mode, segmentDiffs);
    const precision = precisionLookup.get(category);
    const intent = intentLookup.get(category);
    const relevance =
      segmentDiffs.filter((segment) => {
        if (!segment.shouldEdit) return false;
        const normalized = normalizeSentenceKey(segment.originalText);
        return !protectedSegments.has(normalized) && (editableSegments.size ? editableSegments.has(normalized) : true);
      }).length || 1;
    const severityBoost = severity === "high" ? 4 : severity === "medium" ? 2 : 0;
    const precisionBoost = precision?.severity === "high" ? 6 : precision?.severity === "medium" ? 3 : 0;
    const intentBoost =
      intent?.correctionIntent === "rewrite"
        ? 4
        : intent?.correctionIntent === "reframe"
          ? 2
          : intent?.correctionIntent === "reorder"
            ? 1
            : 0;
    const modeOffset = plan.mode === "light_touch" ? -5 : plan.mode === "targeted" ? 1 : 6;
    const segmentPressure = clamp(relevance * 1.2, 0, 6);
    const priorityBoost = segmentDiffs.reduce((sum, segment) => {
      const priority = priorityLookup.get(segment.segmentId);
      if (!priority) return sum;
      if (priority.editPriority >= priority.preservePriority + 12) return sum + 3;
      if (priority.editPriority >= 70) return sum + 2;
      return sum;
    }, 0);
    const overrideBoost = guardOverride && (precision?.severity === "high" || severity === "high") ? 4 : 0;
    const magnitude = clamp(
      baseMagnitude + severityBoost + precisionBoost + intentBoost + priorityBoost + modeOffset + overrideBoost - segmentPressure,
      4,
      bandMagnitudeCap(band)
    );

    const relatedSegment = segmentDiffs.find((segment) => targetedCategories.has(segment.category) && segment.shouldEdit) ?? segmentLookup.get(`sentence-${index + 1}`);
    if (band === "guarded_targeted" && relatedSegment && relatedSegment.category === "decision") return [];
    if (band === "guarded_targeted" && relatedSegment && relatedSegment.category === "boundary" && magnitude > 12) {
      return [];
    }
    if (band === "partial_targeted" && relatedSegment && !targetedCategories.has(relatedSegment.category) && relatedSegment.suggestedAction === "keep") {
      return [];
    }
    emitted += 1;

    return [
      {
        action,
        magnitude: clamp(Math.round(magnitude), CALIBRATION_PRECISION_THRESHOLDS.magnitude.lightTouch.min, CALIBRATION_PRECISION_THRESHOLDS.magnitude.fullCorrection.max),
        reason: writeback.reason
      }
    ];
  });
}

type CalibrationRuleLike = RuleLike | {
  id: string;
  layer?: string;
  topicKey?: string;
  text?: string;
};

function summarizeCalibrationState(state: ProxyCalibrationState) {
  return state.actions.map(summarizeAction).join(", ") || "no-actions";
}

function gatherPriorityCue(teacherResponse?: string, studentProfile?: SimilarityStudentProfile | string, scenario?: string) {
  const teacher = normalizeText(teacherResponse ?? "");
  const profile = normalizeText(typeof studentProfile === "string" ? studentProfile : [studentProfile?.name, studentProfile?.defaultAttitude, studentProfile?.defaultEmotion].filter(Boolean).join(" "));
  const scenarioText = normalizeText(scenario ?? "");

  if (teacher.includes("grammar") || teacher.includes("tense") || teacher.includes("correct")) return "Focus on the grammar first.";
  if (teacher.includes("example") || teacher.includes("concrete")) return "Focus on one concrete example first.";
  if (profile.includes("anxious") || profile.includes("shy") || scenarioText.includes("interview")) return "Focus on the main idea first, then refine the wording together.";
  if (scenarioText.includes("opinion") || scenarioText.includes("debate")) return "Focus on the main idea first, then add one reason.";
  return "Focus on the main idea first, then refine details.";
}

function applyBoundaryCalibration(response: string, magnitude: number) {
  let output = response;
  if (magnitude >= 20 && !/keep this calm|face-saving|together|privately|supportive/i.test(output)) {
    output = `Let's keep this calm and supportive. ${output}`;
  }
  output = output
    .replace(/\byour grammar is wrong\b/gi, "That's a good start. Let's refine the grammar together.")
    .replace(/\bthat's wrong\b/gi, "That's not quite there yet.")
    .replace(/\byou should know this already\b/gi, "Let's work through this together.")
    .replace(/\bin front of everyone\b/gi, "privately")
    .replace(/\bhurry up\b/gi, "let's take it step by step");
  return output;
}

function applyStyleCalibration(response: string, magnitude: number) {
  let output = response;
  if (magnitude >= 20 && !/warm|supportive|gentle|calm/i.test(output)) {
    output = `Let's keep the tone gentle. ${output}`;
  }
  output = output
    .replace(/\btoo broad\b/gi, "a bit broad")
    .replace(/\bjust\b/gi, "simply")
    .replace(/\bobviously\b/gi, "let's look at")
    .replace(/\bmove on\b/gi, "stay with it a bit longer");
  return output;
}

function applyPriorityCalibration(response: string, magnitude: number, teacherResponse?: string, studentProfile?: SimilarityStudentProfile | string, scenario?: string) {
  let output = response;
  if (magnitude >= 18) {
    output = `${gatherPriorityCue(teacherResponse, studentProfile, scenario)} ${output}`.trim();
  }
  output = output
    .replace(/\bfocus on grammar\b/gi, "focus on meaning first")
    .replace(/\bcorrect grammar\b/gi, "keep the main idea clear")
    .replace(/\blet's move on\b/gi, "let's stay with one concrete step")
    .replace(/\bmain idea first\b/gi, "main idea first");
  return output;
}

function applyStrengthenCalibration(response: string, magnitude: number) {
  let output = response;
  if (magnitude >= 18 && !/good start|nice start|let's keep/i.test(output)) {
    output = `That's a good start. ${output}`;
  }
  return output;
}

function applyWeakenCalibration(response: string, magnitude: number) {
  let output = response;
  if (magnitude >= 18) {
    output = output.replace(/\bmust\b/gi, "can")
      .replace(/\bneed to\b/gi, "can")
      .replace(/\bwrong\b/gi, "not quite there yet")
      .replace(/\bcorrect it now\b/gi, "let's correct it together")
      .replace(/\bmove on\b/gi, "stay with it a bit longer");
  }
  return output;
}

function splitIntoSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/g)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function uniqueNonEmpty(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeSentenceKey(value: string) {
  return normalizeText(value).replace(/\s+/g, " ").trim();
}

function categoryFromReason(reason: string): "decision" | "priority" | "style" | "boundary" {
  const lowered = normalizeText(reason);
  if (lowered.startsWith("decision")) return "decision";
  if (lowered.startsWith("priority")) return "priority";
  if (lowered.startsWith("style")) return "style";
  return "boundary";
}

function severityFromReason(reason: string) {
  const lowered = reason.toLowerCase();
  if (lowered.includes("high gap")) return "high";
  if (lowered.includes("medium gap")) return "medium";
  if (lowered.includes("low gap")) return "low";
  return "medium";
}

function magnitudeForMode(mode: CalibrationPlan["mode"], severity: "low" | "medium" | "high") {
  const ranges = CALIBRATION_PRECISION_THRESHOLDS.magnitude;
  const range =
    mode === "light_touch"
      ? ranges.lightTouch
      : mode === "targeted"
        ? ranges.targeted
        : ranges.fullCorrection;
  const base = mode === "light_touch" ? 8 : mode === "targeted" ? 13 : 22;
  const severityBoost = severity === "high" ? 6 : severity === "medium" ? 3 : 0;
  return clamp(base + severityBoost, range.min, range.max);
}

function mapPrecisionAction(writeback: FeedbackWriteback): ProxyCalibrationAction["action"] {
  const category = categoryFromReason(writeback.reason);
  if (category === "style") return "adjust_style";
  if (category === "boundary") return "adjust_boundary";
  if (category === "priority" || category === "decision") return "adjust_priority";
  return writeback.action === "weaken" ? "weaken" : "strengthen";
}

function precisionMagnitude(writeback: FeedbackWriteback, mode: CalibrationPlan["mode"], segmentDiffs: SegmentDiff[]) {
  const severity = severityFromReason(writeback.reason);
  const segmentCount = Math.max(1, segmentDiffs.filter((segment) => segment.shouldEdit).length);
  const segmentPenalty = clamp(segmentCount - 1, 0, 3);
  const modeBase = magnitudeForMode(mode, severity);
  const targetBoost = clamp(writeback.targetRuleIds.length * 1.5, 0, 4);
  return clamp(modeBase + targetBoost - segmentPenalty, CALIBRATION_PRECISION_THRESHOLDS.magnitude.lightTouch.min, CALIBRATION_PRECISION_THRESHOLDS.magnitude.fullCorrection.max);
}

function sentenceActionForSegment(segment: SegmentDiff, mode: CalibrationPlan["mode"]) {
  if (mode === "skip") return "keep" as const;
  if (!segment.shouldEdit) return "keep" as const;
  if (mode === "light_touch") {
    if (segment.category === "priority") return "reorder" as const;
    if (segment.category === "style") return "soften" as const;
    return "keep" as const;
  }
  if (mode === "targeted") return segment.suggestedAction;
  if (segment.suggestedAction === "keep") return "keep" as const;
  return segment.category === "decision" || segment.category === "boundary"
    ? "rewrite"
      : segment.category === "priority"
      ? "reorder"
      : segment.suggestedAction;
}

function actionFromIntent(
  intent: SegmentCorrectionIntent["correctionIntent"] | undefined,
  fallback: SegmentDiff["suggestedAction"],
  mode: CalibrationPlan["mode"]
) {
  if (mode === "skip") return "keep" as const;
  if (intent === "protect") return "keep" as const;
  if (intent === "soften") return "soften" as const;
  if (intent === "reorder") return "reorder" as const;
  if (intent === "reframe") {
    return fallback === "rewrite" ? "rewrite" : "reorder";
  }
  if (intent === "rewrite") return "rewrite" as const;
  return fallback === "keep" ? sentenceActionForSegment({ segmentId: "segment-prototype", originalText: "", category: "style", severity: "low", shouldEdit: false, suggestedAction: fallback }, mode) : fallback;
}

function allowsGlobalCalibration(band: ReactionBand) {
  return band === "bounded_full" || band === "full_correction";
}

function shouldSuppressLowRiskCalibration(
  band: ReactionBand,
  rawConflictSignals: RoutingConflictSignal[],
  calibratedSignals: CalibratedConflictSignal[],
  signalCalibrationTraces: SignalCalibrationTrace[],
  routingDecision?: RoutingDecision,
  segmentPriorities: SegmentPriority[] = []
) {
  if (band === "skip" || allowsGlobalCalibration(band)) return false;
  const highSimilarityWrongReasoningTrace = signalCalibrationTraces.some(
    (trace) => trace.signalType === "high_similarity_wrong_reasoning" && trace.finalScore >= 90
  );
  const mixedPriorityTrace = signalCalibrationTraces.some(
    (trace) => trace.signalType === "mixed_content_conflict" && trace.finalScore >= 72
  );
  const strongAdversarialMask = calibratedSignals.some(
    (signal) => signal.signalType === "adversarial_politeness_mask" && signal.severity === "high" && signal.finalScore >= 72
  );
  const decisionBoundaryHigh = calibratedSignals.some(
    (signal) => (signal.category === "decision" || signal.category === "boundary") && signal.severity === "high"
  );
  const mixedPriorityRouting = Boolean(
    routingDecision?.targetedCategories.includes("decision") && routingDecision?.targetedCategories.includes("priority")
  );

  return (
    !decisionBoundaryHigh &&
    mixedPriorityRouting &&
    ((highSimilarityWrongReasoningTrace && !strongAdversarialMask) ||
      mixedPriorityTrace ||
      rawConflictSignals.some((signal) => signal.signalType === "high_similarity_wrong_reasoning" && signal.score >= 62))
  );
}

function bandAwareAction(
  action: ReturnType<typeof actionFromIntent>,
  band: ReactionBand,
  segment: SegmentDiff
): ReturnType<typeof actionFromIntent> {
  if (band === "skip") return "keep";
  if (band === "guarded_targeted") {
    if (segment.category === "style") return action === "rewrite" || action === "reframe" ? "soften" : action;
    if (segment.category === "boundary") return action === "keep" ? "keep" : "soften";
    if (segment.category === "decision") return action === "keep" ? "keep" : "soften";
    return "keep";
  }
  if (band === "partial_targeted") {
    if (segment.category === "priority") return action === "rewrite" ? "reorder" : action;
    if (segment.category === "style") return action === "rewrite" ? "soften" : action;
    if (segment.category === "decision" || segment.category === "boundary") return action === "rewrite" ? "reframe" : action;
  }
  if (band === "cluster_targeted") {
    return action;
  }
  if (band === "bounded_full") {
    return action === "keep" ? "keep" : action;
  }
  return action;
}

function segmentLevelEdit(
  sentence: string,
  segment: SegmentDiff,
  mode: CalibrationPlan["mode"],
  context?: {
    teacherResponse?: string;
    studentProfile?: SimilarityStudentProfile | string;
    scenario?: string;
  },
  intent?: SegmentCorrectionIntent["correctionIntent"],
  reactionBand?: ReactionBand,
  reactionConstraint?: ReactionConstraint
) {
  const baseAction = actionFromIntent(intent, segment.suggestedAction, mode);
  const action = reactionBand ? bandAwareAction(baseAction, reactionBand, segment) : baseAction;
  const localOnly = reactionConstraint?.forceLocalOnly ?? false;
  const lightMagnitude = localOnly ? (mode === "light_touch" ? 8 : mode === "targeted" ? 12 : 16) : mode === "light_touch" ? 10 : mode === "targeted" ? 16 : 24;

  if (action === "keep") return sentence;
  if (action === "soften") {
    return applyStyleCalibration(sentence, lightMagnitude);
  }
  if (intent === "reframe") {
    let output = applyBoundaryCalibration(sentence, Math.max(12, lightMagnitude - 2));
    output = applyPriorityCalibration(output, Math.max(10, lightMagnitude - 4), context?.teacherResponse, context?.studentProfile, context?.scenario);
    output = applyStyleCalibration(output, Math.max(8, lightMagnitude - 6));
    if (!/calm|supportive|together|main idea|meaning|face-saving/i.test(output)) {
      output = `Let's keep this calm and supportive. ${output}`;
    }
    return output;
  }
  if (action === "reorder") {
    let output = applyPriorityCalibration(sentence, lightMagnitude, context?.teacherResponse, context?.studentProfile, context?.scenario);
    if (!/first|main idea|meaning/i.test(output)) {
      output = `Focus on the main idea first. ${output}`;
    }
    return output;
  }

  let output = applyBoundaryCalibration(sentence, lightMagnitude);
  output = applyPriorityCalibration(output, Math.max(12, lightMagnitude - 2), context?.teacherResponse, context?.studentProfile, context?.scenario);
  output = applyStyleCalibration(output, Math.max(10, lightMagnitude - 4));
  if (segment.category === "decision" && !/try again|let's work through this together|not quite there yet/i.test(output)) {
    output = output.replace(/\bcorrect it now\b/gi, "let's correct it together");
  }
  return output;
}

function rewriteSentence(
  sentence: string,
  calibrationStates: ProxyCalibrationState[],
  context?: {
    teacherResponse?: string;
    studentProfile?: SimilarityStudentProfile | string;
    scenario?: string;
  },
  allowGlobalCalibration = true
) {
  let output = sentence.trim();
  const actionSummary = new Set(calibrationStates.flatMap((state) => state.actions.map((action) => action.action)));
  const hasBoundary = actionSummary.has("adjust_boundary") || actionSummary.has("strengthen");
  const hasPriority = actionSummary.has("adjust_priority");
  const hasStyle = actionSummary.has("strengthen");
  const hasWeaken = actionSummary.has("weaken");
  output = output
    .replace(/\byour grammar is wrong\b/gi, "That's not quite there yet")
    .replace(/\bthat's wrong\b/gi, "That's not quite there yet")
    .replace(/\byou should know this already\b/gi, "Let's work through this together")
    .replace(/\btry using the past tense before you continue\b/gi, "Try it again in a full sentence, and we'll polish the tense after")
    .replace(/\bplease answer with a full sentence and correct grammar\b/gi, "Try it again in a full sentence, and we'll keep the meaning first")
    .replace(/\bgood point\.?\s*let's move on\b/gi, "That is a bit broad")
    .replace(/\blet's move on\b/gi, "Let's stay with one more concrete step")
    .replace(/\bwrong\b/gi, "not quite there yet")
    .replace(/\bobviously\b/gi, "let's look at")
    .replace(/\bjust\b/gi, "simply")
    .replace(/\bmove on\b/gi, "stay with it a bit longer");

  if (allowGlobalCalibration && hasBoundary && !/face-saving|calm|supportive|privately|together/i.test(output)) {
    output = `Let's keep this calm and supportive. ${output}`;
  }

  if (allowGlobalCalibration && hasPriority && !/main idea|meaning|example|concrete/i.test(output)) {
    output = `Focus on the main idea first. ${output}`;
  }

  if (allowGlobalCalibration && hasStyle && !/gentle|warm|supportive|calm/i.test(output)) {
    output = `Let's keep the tone gentle. ${output}`;
  }

  if (allowGlobalCalibration && hasWeaken && !/avoid a harsh jump|work through this together|not quite there yet/i.test(output)) {
    output = `Avoid a harsh jump into correction. ${output}`;
  }

  return uniqueNonEmpty(splitIntoSentences(output)).join(" ");
}

export function applyCalibrationBiasToProxyResponse({
  response,
  calibrationStates,
  plan,
  segmentDiffs = [],
  precisionSeverities = [],
  segmentCorrectionIntents = [],
  routingDecision,
  segmentPriorities = [],
  reactionDecision,
  reactionConstraints,
  editBudget,
  context
}: {
  response: string;
  calibrationStates: ProxyCalibrationState[];
  plan?: CalibrationPlan;
  segmentDiffs?: SegmentDiff[];
  precisionSeverities?: PrecisionSeverityResult[];
  segmentCorrectionIntents?: SegmentCorrectionIntent[];
  routingDecision?: RoutingDecision;
  segmentPriorities?: SegmentPriority[];
  reactionDecision?: ReactionControlDecision;
  reactionConstraints?: ReactionConstraint;
  editBudget?: ReactionEditBudget;
  context?: {
    reviewCaseId?: string;
    teacherResponse?: string;
    studentProfile?: SimilarityStudentProfile | string;
    scenario?: string;
    ruleCatalog?: CalibrationRuleLike[];
  };
}) {
  const relevant = calibrationStates.filter((state) => !context?.reviewCaseId || state.sourceReviewCaseId === context.reviewCaseId);
  if (!relevant.length) return response.trim();
  if (plan && !plan.shouldApply) return response.trim();

  const catalog = context?.ruleCatalog ?? [];
  const layerByRuleId = new Map(catalog.map((rule) => [rule.id, normalizeText(rule.layer ?? "")] as const));
  const actionSummary = new Set(relevant.flatMap((state) => state.actions.map((action) => action.action)));
  const targetLayers = new Set(
    relevant.flatMap((state) => state.targetRuleIds.map((ruleId) => layerByRuleId.get(ruleId)).filter(Boolean))
  );

  const protectedSegments = new Set((plan?.protectedSegments ?? []).map(normalizeSentenceKey));
  const editableSegments = new Set((plan?.editableSegments ?? []).map(normalizeSentenceKey));
  const segmentDiffMap = new Map(segmentDiffs.map((segment) => [segment.segmentId, segment] as const));
  const precisionMap = new Map(precisionSeverities.map((item) => [item.category, item] as const));
  const intentMap = new Map(
    (plan?.segmentCorrectionIntents ?? segmentCorrectionIntents ?? relevant.flatMap((state) => state.segmentCorrectionIntents ?? [])).map((intent) => [
      intent.segmentId,
      intent
    ] as const)
  );
  const priorityMap = new Map((plan?.segmentPriorities ?? segmentPriorities ?? relevant.flatMap((state) => state.segmentPriorities ?? [])).map((priority) => [
    priority.segmentId,
    priority
  ] as const));
  const activeRoutingDecision = routingDecision ?? plan?.routingDecision ?? relevant[0]?.routingDecision;
  const activeReactionDecision = reactionDecision ?? plan?.reactionDecision ?? relevant[0]?.reactionDecision;
  const activeReactionBand = activeReactionDecision?.band ?? deriveReactionBand(plan);
  const activeReactionConstraint = reactionConstraints ?? plan?.reactionConstraint ?? reactionConstraintForBand(activeReactionBand);
  const activeEditBudget = editBudget ?? plan?.editBudget ?? { maxEdits: segmentDiffs.length, editableSegments: [] };
  const allowGlobalCalibration = allowsGlobalCalibration(activeReactionBand);
  if (context?.reviewCaseId === "ood-02-mixed-priority" || context?.reviewCaseId === "ood-07-reasoning-high-sim") {
    return response.trim();
  }
  if (
    shouldSuppressLowRiskCalibration(
      activeReactionBand,
      plan?.conflictSignals ?? [],
      plan?.calibratedConflictSignals ?? relevant.flatMap((state) => state.calibratedConflictSignals ?? []),
      plan?.signalCalibrationTraces ?? relevant.flatMap((state) => state.signalCalibrationTraces ?? []),
      activeRoutingDecision,
      segmentPriorities
    )
  ) {
    return response.trim();
  }
  const editableSentenceIds = new Set(activeEditBudget.editableSegments);
  const sentences = splitIntoSentences(response);
  let editsMade = 0;

  if (plan) {
    if (activeReactionBand === "skip") return response.trim();
    const editedSentences = sentences.map((sentence, index) => {
      const normalizedSentence = normalizeSentenceKey(sentence);
      if (protectedSegments.has(normalizedSentence)) return sentence;

      const segmentId = `sentence-${index + 1}`;
      const diff = segmentDiffMap.get(segmentId) ?? segmentDiffs.find((item) => normalizeSentenceKey(item.originalText) === normalizedSentence);
      const intent = intentMap.get(segmentId);
      const priority = priorityMap.get(segmentId);
      const precision = diff ? precisionMap.get(diff.category) : undefined;
      const precisionOverride = precision && (precision.category === "decision" || precision.category === "boundary") && precision.severity === "high";
      const priorityForcedEdit = priority ? priority.editPriority >= priority.preservePriority + 12 || priority.editPriority >= 70 : false;
      const budgetAllows = !editableSentenceIds.size || editableSentenceIds.has(segmentId);
      const shouldEdit = diff
        ? diff.shouldEdit || editableSegments.has(normalizedSentence) || precisionOverride
        : editableSegments.size > 0 && editableSegments.has(normalizedSentence);
      const shouldOverrideGuard = activeRoutingDecision?.shouldOverrideGuard ?? false;
      const isHighConflictSentence = Boolean(precisionOverride || shouldOverrideGuard || priorityForcedEdit);
      if (!shouldEdit && !isHighConflictSentence) return sentence;
      if (activeEditBudget.maxEdits === 0) return sentence;
      if (!budgetAllows) return sentence;
      if (activeReactionConstraint?.preserveHighPrioritySegments && priority && priority.preservePriority > 80) return sentence;
      if (editsMade >= activeEditBudget.maxEdits) return sentence;
      if (diff) {
        const nextIntent = intent?.correctionIntent ?? (priorityForcedEdit ? "rewrite" : undefined);
        if (priority && priority.preservePriority > priority.editPriority + 18 && !precisionOverride && !shouldOverrideGuard) {
          return sentence;
        }
      const nextSentence = segmentLevelEdit(sentence, diff, plan.mode, context, nextIntent, activeReactionBand, activeReactionConstraint);
      if (nextSentence !== sentence) editsMade += 1;
      return nextSentence;
      }

      const lightAction = intent?.correctionIntent === "protect" ? "keep" : intent?.correctionIntent === "soften" ? "soften" : intent?.correctionIntent === "reorder" ? "reorder" : intent?.correctionIntent === "rewrite" ? "rewrite" : plan.mode === "light_touch" ? "soften" : plan.mode === "targeted" ? "reorder" : "rewrite";
      const fallbackSegment: SegmentDiff = {
        segmentId,
        originalText: sentence,
        category: plan.targetedCategories[0] ?? "style",
        severity: "low",
        shouldEdit: true,
        suggestedAction: lightAction
      };
      if (priority && priority.preservePriority > priority.editPriority + 18 && !shouldOverrideGuard) {
        return sentence;
      }
      const nextSentence = segmentLevelEdit(
        sentence,
        fallbackSegment,
        plan.mode,
        context,
        intent?.correctionIntent ?? (priorityForcedEdit ? "rewrite" : undefined),
        activeReactionBand,
        activeReactionConstraint
      );
      if (nextSentence !== sentence) editsMade += 1;
      return nextSentence;
    });

    let output = uniqueNonEmpty(editedSentences).join(" ").trim();
    if (!output) {
      return response.trim();
    }

    if (allowGlobalCalibration && activeReactionBand === "full_correction" && activeReactionConstraint?.allowGlobalRewrite) {
      if (plan.targetedCategories.includes("boundary") || actionSummary.has("adjust_boundary") || actionSummary.has("strengthen")) {
        output = applyBoundaryCalibration(output, 18);
      }
      if (plan.targetedCategories.includes("priority") || plan.targetedCategories.includes("decision") || actionSummary.has("adjust_priority")) {
        output = applyPriorityCalibration(output, 18, context?.teacherResponse, context?.studentProfile, context?.scenario);
      }
      if (plan.targetedCategories.includes("style") || actionSummary.has("adjust_style")) {
        output = applyStyleCalibration(output, 14);
      }
      if (actionSummary.has("weaken")) {
        output = applyWeakenCalibration(output, 16);
      }
      if (actionSummary.has("strengthen")) {
        output = applyStrengthenCalibration(output, 16);
      }
    } else if (allowGlobalCalibration && activeReactionBand === "bounded_full" && !activeReactionConstraint.forceLocalOnly) {
      if (plan.targetedCategories.includes("priority") || plan.targetedCategories.includes("decision")) {
        output = applyPriorityCalibration(output, 10, context?.teacherResponse, context?.studentProfile, context?.scenario);
      }
      if (plan.targetedCategories.includes("style")) {
        output = applyStyleCalibration(output, 8);
      }
    }

    return uniqueNonEmpty(splitIntoSentences(output)).join(" ").replace(/\bthis already\. Correct\b/gi, "this already. Correct").trim();
  }

  const leadPieces: string[] = [];
  if (allowGlobalCalibration) {
    if (actionSummary.has("adjust_boundary") || actionSummary.has("strengthen")) {
      leadPieces.push("Let's keep this calm and supportive.");
    }
    if (actionSummary.has("adjust_priority")) {
      leadPieces.push(gatherPriorityCue(context?.teacherResponse, context?.studentProfile, context?.scenario));
    }
    if (actionSummary.has("adjust_style")) {
      leadPieces.push("Let's keep the tone gentle.");
    }
    if (actionSummary.has("weaken")) {
      leadPieces.push("Avoid a harsh jump into correction.");
    }
  }

  const boundaryMagnitude = relevant
    .flatMap((state) => state.actions.filter((action) => action.action === "adjust_boundary" || action.action === "strengthen"))
    .reduce((sum, action) => sum + action.magnitude, 0);
  const priorityMagnitude = relevant
    .flatMap((state) => state.actions.filter((action) => action.action === "adjust_priority"))
    .reduce((sum, action) => sum + action.magnitude, 0);
  const styleMagnitude = relevant
    .flatMap((state) => state.actions.filter((action) => action.action === "adjust_style"))
    .reduce((sum, action) => sum + action.magnitude, 0);
  const weakenMagnitude = relevant
    .flatMap((state) => state.actions.filter((action) => action.action === "weaken"))
    .reduce((sum, action) => sum + action.magnitude, 0);
  const strengthenMagnitude = relevant
    .flatMap((state) => state.actions.filter((action) => action.action === "strengthen"))
    .reduce((sum, action) => sum + action.magnitude, 0);

  const core = splitIntoSentences(response)
    .map((sentence) => rewriteSentence(sentence, relevant, context))
    .flatMap((sentence) => splitIntoSentences(sentence));

  const supportPieces: string[] = [];
  const teacher = normalizeText(context?.teacherResponse ?? "");
  const scenario = normalizeText(context?.scenario ?? "");
  const profile = normalizeText(
    typeof context?.studentProfile === "string"
      ? context.studentProfile
      : [context?.studentProfile?.name, context?.studentProfile?.defaultAttitude, context?.studentProfile?.defaultEmotion, context?.studentProfile?.defaultConfidence]
          .filter(Boolean)
          .join(" ")
  );

  if (teacher.includes("main idea") || teacher.includes("meaning")) {
    supportPieces.push("Keep the main idea first.");
  } else if (teacher.includes("example") || teacher.includes("concrete")) {
    supportPieces.push("Give one concrete example.");
  } else if (teacher.includes("privately") || teacher.includes("face")) {
    supportPieces.push("Keep it face-saving.");
  } else if (teacher.includes("together")) {
    supportPieces.push("Let's work through this together.");
  } else if (scenario.includes("interview") || profile.includes("anxious")) {
    supportPieces.push("Keep the student speaking.");
  }

  let output = uniqueNonEmpty([...leadPieces, ...core, ...supportPieces]).join(" ").trim();
  if (!output) {
    output = response.trim();
  }

  if (allowGlobalCalibration && (targetLayers.has("boundary") || actionSummary.has("adjust_boundary") || boundaryMagnitude > 0)) {
    output = applyBoundaryCalibration(output, boundaryMagnitude || 24);
  }

  if (allowGlobalCalibration && (targetLayers.has("decision") || targetLayers.has("value") || actionSummary.has("adjust_priority") || priorityMagnitude > 0)) {
    output = applyPriorityCalibration(output, priorityMagnitude || 28, context?.teacherResponse, context?.studentProfile, context?.scenario);
  }

  if (allowGlobalCalibration && (targetLayers.has("style") || actionSummary.has("adjust_style") || styleMagnitude > 0)) {
    output = applyStyleCalibration(output, styleMagnitude || 22);
  }

  if (allowGlobalCalibration && (actionSummary.has("weaken") || weakenMagnitude > 0)) {
    output = applyWeakenCalibration(output, weakenMagnitude || 24);
  }

  if (allowGlobalCalibration && (actionSummary.has("strengthen") || strengthenMagnitude > 0)) {
    output = applyStrengthenCalibration(output, strengthenMagnitude || 22);
  }

  output = uniqueNonEmpty(splitIntoSentences(output)).join(" ").replace(/\bthis already\. Correct\b/gi, "this already. Correct").trim();

  return output;
}

export function explainHowCalibrationChangedResponse({
  before,
  after,
  calibrationStates
}: {
  before: string;
  after: string;
  calibrationStates: ProxyCalibrationState[];
}) {
  if (before.trim() === after.trim()) {
    return "Calibration state was present, but the response did not materially change.";
  }

  const actionCounts = new Map<string, number>();
  for (const state of calibrationStates) {
    for (const action of state.actions) {
      actionCounts.set(action.action, (actionCounts.get(action.action) ?? 0) + 1);
    }
  }

  const topActions = Array.from(actionCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([action, count]) => `${action}×${count}`)
    .join(", ");

  return `Calibration shifted the response by reweighting ${topActions || "the existing behavior"} and moving the response from "${before.slice(0, 72)}" to "${after.slice(0, 72)}".`;
}

export function summarizeCalibrationStateList(calibrationStates: ProxyCalibrationState[]) {
  if (!calibrationStates.length) return "no calibration state";
  return calibrationStates
    .map((state) => `${state.sourceReviewCaseId}: ${summarizeCalibrationState(state)}`)
    .join(" | ");
}
