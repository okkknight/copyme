import { CONFLICT_SIGNAL_CALIBRATION_THRESHOLDS } from "@/lib/conflict-signal-calibration-thresholds";
import type { CalibratedConflictSignal, DirectionConflictProbe, PrecisionSeverityResult, RoutingConflictSignal, SegmentDiff, SignalCalibrationTrace } from "@/lib/types";
import type { SimilarityStudentProfile } from "@/lib/similarity-evaluator";

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/['"]/g, "").replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
}

function splitIntoSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/g)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function studentFlags(studentProfile?: SimilarityStudentProfile | string, scenario?: string) {
  const profileText =
    typeof studentProfile === "string"
      ? studentProfile
      : [studentProfile?.name, studentProfile?.defaultAttitude, studentProfile?.defaultEmotion, studentProfile?.defaultConfidence]
          .filter(Boolean)
          .join(" ");
  const profile = normalizeText(profileText);
  const scenarioText = normalizeText(scenario ?? "");
  return {
    anxious: profile.includes("anxious") || profile.includes("shy") || profile.includes("low confidence") || profile.includes("self conscious"),
    frozen: profile.includes("frozen") || profile.includes("hesitant") || profile.includes("quiet"),
    resistant: profile.includes("resistant") || profile.includes("argumentative"),
    interview: scenarioText.includes("interview"),
    debate: scenarioText.includes("debate") || scenarioText.includes("opinion")
  };
}

function severityFromScore(score: number): CalibratedConflictSignal["severity"] {
  if (score >= 72) return "high";
  if (score >= 48) return "medium";
  return "low";
}

function scopeFromSegmentDiffs(segmentDiffs: SegmentDiff[], signalType: CalibratedConflictSignal["signalType"]) {
  if (!segmentDiffs.length) return "segment" as const;
  const editable = segmentDiffs.filter((segment) => segment.shouldEdit);
  const clusteredEditable = editable.length > 1 && editable.some((segment, index) => editable.some((other, otherIndex) => Math.abs(otherIndex - index) <= 1));
  const coverage = editable.length / Math.max(1, segmentDiffs.length);
  if (signalType === "long_text_multi_intent_conflict") {
    if (coverage >= CONFLICT_SIGNAL_CALIBRATION_THRESHOLDS.scopeSplit.globalCoverageFloor || editable.length >= CONFLICT_SIGNAL_CALIBRATION_THRESHOLDS.scopeSplit.globalSegmentFloor) {
      return "global" as const;
    }
    if (clusteredEditable || editable.length >= CONFLICT_SIGNAL_CALIBRATION_THRESHOLDS.scopeSplit.localClusterSegmentFloor) {
      return "local_cluster" as const;
    }
  }
  if (signalType === "mixed_content_conflict") {
    if (coverage >= CONFLICT_SIGNAL_CALIBRATION_THRESHOLDS.scopeSplit.globalCoverageFloor) return "global" as const;
    if (clusteredEditable || editable.length >= CONFLICT_SIGNAL_CALIBRATION_THRESHOLDS.scopeSplit.localClusterSegmentFloor) return "local_cluster" as const;
  }
  return editable.length >= 2 ? "local_cluster" : "segment";
}

function evidenceForSignal(signalType: RoutingConflictSignal["signalType"], directionProbe?: DirectionConflictProbe, precisionSeverities: PrecisionSeverityResult[] = [], segmentDiffs: SegmentDiff[] = []) {
  const evidence: string[] = [];
  const highDecisionBoundary = precisionSeverities.filter((item) => (item.category === "decision" || item.category === "boundary") && item.severity === "high");
  if (directionProbe?.conflictDetected) {
    evidence.push(`direction:${directionProbe.teacherCoreDirection}->${directionProbe.proxyCoreDirection}`);
  }
  if (highDecisionBoundary.length) {
    evidence.push(...highDecisionBoundary.map((item) => `${item.category}:${item.severity}:${item.score}`));
  }
  if (segmentDiffs.some((segment) => segment.shouldEdit)) {
    evidence.push(`editSegments:${segmentDiffs.filter((segment) => segment.shouldEdit).map((segment) => segment.segmentId).join(",")}`);
  }
  if (signalType === "mixed_content_conflict" || signalType === "long_text_multi_intent_conflict") {
    evidence.push(`segments:${segmentDiffs.length}`);
  }
  return evidence;
}

function boostScore(base: number, boosts: Array<[string, number]>, penalties: Array<[string, number]> = []) {
  const boostAmount = boosts.reduce((sum, [, amount]) => sum + amount, 0);
  const penaltyAmount = penalties.reduce((sum, [, amount]) => sum + amount, 0);
  return {
    score: clamp(Math.round(base + boostAmount - penaltyAmount)),
    boostedBy: boosts.map(([label]) => label),
    reducedBy: penalties.map(([label]) => label)
  };
}

function calibrateSingleSignal({
  signal,
  directionProbe,
  precisionSeverities,
  segmentDiffs,
  studentProfile,
  scenario
}: {
  signal: RoutingConflictSignal;
  directionProbe?: DirectionConflictProbe;
  precisionSeverities?: PrecisionSeverityResult[];
  segmentDiffs: SegmentDiff[];
  studentProfile?: SimilarityStudentProfile | string;
  scenario?: string;
}) {
  const flags = studentFlags(studentProfile, scenario);
  const evidence = evidenceForSignal(signal.signalType, directionProbe, precisionSeverities, segmentDiffs);
  let recallScore = signal.score;
  let calibrationScore = signal.score;
  const boosts: Array<[string, number]> = [];
  const penalties: Array<[string, number]> = [];

  const decisionBoundaryHigh = precisionSeverities?.some((item) => (item.category === "decision" || item.category === "boundary") && item.severity === "high") ?? false;
  const localizedSegments = segmentDiffs.filter((segment) => segment.shouldEdit).length > 0 && segmentDiffs.filter((segment) => !segment.shouldEdit).length > 0;
  const clusterCount = new Set(segmentDiffs.map((segment) => segment.category)).size;
  const highSeveritySegments = segmentDiffs.filter((segment) => segment.severity === "high").length;

  switch (signal.signalType) {
    case "teacher_direction_conflict": {
      if (directionProbe?.conflictDetected) {
        boosts.push(["direction_probe", CONFLICT_SIGNAL_CALIBRATION_THRESHOLDS.calibrationWeights.directionProbeBoost]);
        boosts.push(["direction_probe_confidence", Math.round(directionProbe.confidence * 10)]);
      } else {
        penalties.push(["direction_probe_absent", 10]);
      }
      if (decisionBoundaryHigh) boosts.push(["precision_high", CONFLICT_SIGNAL_CALIBRATION_THRESHOLDS.calibrationWeights.precisionHighBoost]);
      recallScore = signal.score + (directionProbe?.conflictDetected ? 24 : 0) + (decisionBoundaryHigh ? 10 : 0);
      calibrationScore = signal.score + (directionProbe?.conflictDetected ? 18 : 0) + (clusterCount >= 2 ? 6 : 0);
      break;
    }
    case "high_similarity_wrong_reasoning": {
      if (directionProbe?.conflictDetected) {
        boosts.push(["direction_probe", CONFLICT_SIGNAL_CALIBRATION_THRESHOLDS.calibrationWeights.directionProbeBoost]);
        boosts.push(["high_similarity_surface", 10]);
      }
      if (decisionBoundaryHigh) boosts.push(["precision_high", CONFLICT_SIGNAL_CALIBRATION_THRESHOLDS.calibrationWeights.precisionHighBoost]);
      if (flags.anxious || flags.frozen || flags.resistant) boosts.push(["student_state", CONFLICT_SIGNAL_CALIBRATION_THRESHOLDS.calibrationWeights.studentStateBoost]);
      recallScore = signal.score + (directionProbe?.conflictDetected ? 30 : 0) + (decisionBoundaryHigh ? 12 : 0);
      calibrationScore = signal.score + (directionProbe?.conflictDetected ? 22 : 0) + (localizedSegments ? 8 : 0);
      break;
    }
    case "mixed_content_conflict": {
      if (localizedSegments) {
        boosts.push(["localized_segments", CONFLICT_SIGNAL_CALIBRATION_THRESHOLDS.calibrationWeights.mixedClusterBoost]);
        penalties.push(["global_overreach", 14]);
      }
      if (highSeveritySegments >= 2) boosts.push(["high_segments", 10]);
      recallScore = signal.score + (localizedSegments ? 8 : 0) + (highSeveritySegments ? 8 : 0);
      calibrationScore = signal.score + (localizedSegments ? 12 : 0) - (segmentDiffs.length >= 5 ? 6 : 0);
      break;
    }
    case "adversarial_politeness_mask": {
      if (directionProbe?.conflictDetected) boosts.push(["direction_probe", 10]);
      if (decisionBoundaryHigh) boosts.push(["boundary_precision", CONFLICT_SIGNAL_CALIBRATION_THRESHOLDS.calibrationWeights.precisionHighBoost]);
      if (flags.anxious || flags.interview) boosts.push(["student_state", 6]);
      recallScore = signal.score + (directionProbe?.conflictDetected ? 14 : 0) + (decisionBoundaryHigh ? 10 : 0);
      calibrationScore = signal.score + (decisionBoundaryHigh ? 14 : 0) + (directionProbe?.conflictDetected ? 8 : 0);
      break;
    }
    case "long_text_multi_intent_conflict": {
      if (segmentDiffs.length >= 4) boosts.push(["long_text", CONFLICT_SIGNAL_CALIBRATION_THRESHOLDS.calibrationWeights.longTextGlobalBoost]);
      if (localizedSegments && segmentDiffs.length <= 4) {
        penalties.push(["local_cluster", CONFLICT_SIGNAL_CALIBRATION_THRESHOLDS.calibrationWeights.longTextLocalPenalty]);
      }
      if (decisionBoundaryHigh) boosts.push(["precision_high", 8]);
      recallScore = signal.score + (segmentDiffs.length >= 4 ? 10 : 0) + (clusterCount >= 3 ? 8 : 0);
      calibrationScore = signal.score + (segmentDiffs.length >= 4 ? 12 : 0) - (localizedSegments ? 8 : 0);
      break;
    }
    case "student_state_priority_conflict": {
      if (flags.anxious || flags.frozen || flags.resistant) boosts.push(["student_state", CONFLICT_SIGNAL_CALIBRATION_THRESHOLDS.calibrationWeights.studentStateBoost]);
      if (directionProbe?.conflictDetected) boosts.push(["direction_probe", 8]);
      if (decisionBoundaryHigh) boosts.push(["precision_high", 6]);
      recallScore = signal.score + ((flags.anxious || flags.frozen || flags.resistant) ? 14 : 0) + (decisionBoundaryHigh ? 6 : 0);
      calibrationScore = signal.score + ((flags.anxious || flags.frozen || flags.resistant) ? 12 : 0) + (directionProbe?.conflictDetected ? 6 : 0);
      break;
    }
  }

  const recallClamped = clamp(Math.round(recallScore));
  const calibrationClamped = clamp(Math.round(calibrationScore + boosts.reduce((sum, [, amount]) => sum + amount, 0) - penalties.reduce((sum, [, amount]) => sum + amount, 0)));
  const finalScore = clamp(
    Math.round(
      signal.score * 0.34 +
        recallClamped * 0.36 +
        calibrationClamped * 0.3 +
        (directionProbe?.conflictDetected ? 4 : 0) +
        (signal.signalType === "long_text_multi_intent_conflict" && segmentDiffs.length >= 4 ? 4 : 0)
    )
  );

  const resolvedScope =
    signal.signalType === "long_text_multi_intent_conflict" || signal.signalType === "mixed_content_conflict"
      ? scopeFromSegmentDiffs(segmentDiffs, signal.signalType)
      : directionProbe?.conflictDetected && signal.signalType === "high_similarity_wrong_reasoning"
        ? segmentDiffs.length > 3
          ? "local_cluster"
          : "segment"
        : signal.signalType === "adversarial_politeness_mask" && (flags.anxious || flags.interview)
          ? "segment"
          : "segment";

  const severity = severityFromScore(finalScore);

  return {
    calibratedSignal: {
      signalType: signal.signalType,
      category: signal.category,
      recallScore: recallClamped,
      calibrationScore: calibrationClamped,
      finalScore,
      severity,
      scope: resolvedScope,
      explanation: signal.explanation,
      evidence: evidence.length ? evidence : [signal.explanation]
    } satisfies CalibratedConflictSignal,
    trace: {
      signalType: signal.signalType,
      rawScore: signal.score,
      boostedBy: boosts.map(([label]) => label),
      reducedBy: penalties.map(([label]) => label),
      finalScore,
      rationale:
        signal.signalType === "high_similarity_wrong_reasoning" && directionProbe?.conflictDetected
          ? "Direction probe confirmed a teacher-direction conflict, so the signal was boosted to prevent a false skip."
          : signal.signalType === "long_text_multi_intent_conflict" && resolvedScope === "local_cluster"
            ? "The conflict is localized to a cluster, so the signal was calibrated down from global full-correction pressure."
            : signal.signalType === "mixed_content_conflict" && resolvedScope !== "global"
              ? "The response contains both safe and conflicting content, so the signal remains targeted instead of global."
              : signal.signalType === "adversarial_politeness_mask"
                ? "Polite wording did not mask the underlying direction conflict."
                : signal.signalType === "student_state_priority_conflict"
                  ? "The student state increased the need for a different priority order."
                  : "The raw conflict signal was reweighted to better match direction and precision evidence."
    } satisfies SignalCalibrationTrace
  };
}

function synthesizeMissingSignals({
  rawSignals,
  directionProbe,
  precisionSeverities,
  segmentDiffs
}: {
  rawSignals: RoutingConflictSignal[];
  directionProbe?: DirectionConflictProbe;
  precisionSeverities: PrecisionSeverityResult[];
  segmentDiffs: SegmentDiff[];
}) {
  const synthesized: RoutingConflictSignal[] = [];
  const hasHighDecisionBoundary = precisionSeverities.some((item) => (item.category === "decision" || item.category === "boundary") && item.severity === "high");
  const hasWrongReasoning = rawSignals.some((signal) => signal.signalType === "high_similarity_wrong_reasoning");
  if (directionProbe?.conflictDetected) {
    synthesized.push({
      signalType: "teacher_direction_conflict",
      category: directionProbe.teacherCoreDirection.includes("face") || directionProbe.teacherCoreDirection.includes("boundary") ? "boundary" : "decision",
      severity: directionProbe.confidence >= CONFLICT_SIGNAL_CALIBRATION_THRESHOLDS.directionConflict.confidenceFloor ? "high" : "medium",
      score: Math.round(directionProbe.confidence * 100),
      explanation: directionProbe.explanation
    });
  }
  if (directionProbe?.conflictDetected && !hasWrongReasoning) {
    synthesized.push({
      signalType: "high_similarity_wrong_reasoning",
      category: precisionSeverities.find((item) => item.category === "boundary" && item.severity === "high") ? "boundary" : "decision",
      severity: "high",
      score: Math.min(
        100,
        Math.round(
          62 +
            (directionProbe.confidence >= CONFLICT_SIGNAL_CALIBRATION_THRESHOLDS.directionConflict.confidenceFloor ? 10 : 6) +
            (hasHighDecisionBoundary ? 8 : 0) +
            Math.min(10, segmentDiffs.filter((segment) => segment.shouldEdit).length * 3)
        )
      ),
      explanation:
        "High surface similarity still hides a teacher-direction conflict, so the response should not be skipped on similarity alone."
    });
  }
  return synthesized;
}

export function calibrateConflictSignals({
  rawSignals,
  directionProbe,
  precisionSeverities = [],
  segmentDiffs = [],
  studentProfile,
  scenario
}: {
  rawSignals: RoutingConflictSignal[];
  directionProbe?: DirectionConflictProbe;
  precisionSeverities?: PrecisionSeverityResult[];
  segmentDiffs?: SegmentDiff[];
  studentProfile?: SimilarityStudentProfile | string;
  scenario?: string;
}): {
  calibratedSignals: CalibratedConflictSignal[];
  traces: SignalCalibrationTrace[];
} {
  const enrichedSignals = [...rawSignals];
  for (const synthesized of synthesizeMissingSignals({ rawSignals, directionProbe, precisionSeverities, segmentDiffs })) {
    if (!enrichedSignals.some((signal) => signal.signalType === synthesized.signalType)) {
      enrichedSignals.push(synthesized);
    }
  }

  const calibrated = enrichedSignals.map((signal) =>
    calibrateSingleSignal({
      signal,
      directionProbe,
      precisionSeverities,
      segmentDiffs,
      studentProfile,
      scenario
    })
  );

  return {
    calibratedSignals: calibrated.map((item) => item.calibratedSignal),
    traces: calibrated.map((item) => item.trace)
  };
}
