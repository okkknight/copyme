"use client";

import { useEffect, useMemo, useState } from "react";
import { ClientOnly } from "@/components/client-only";
import { Panel, Pill, PrimaryButton, SecondaryButton, SectionTitle, Select, Textarea } from "@/components/ui";
import { analyzeSimilarityDiff } from "@/lib/diff-analyzer";
import { analyzeResponseSegments } from "@/lib/segment-diff";
import { buildCalibrationPlan, explainWhichSegmentsWereProtected, explainWhyResponseWasHeavilyRewritten, explainWhyResponseWasOnlyLightlyEdited } from "@/lib/light-touch-guard";
import { buildFeedbackWritebackPlan } from "@/lib/feedback-writer";
import { evaluateWritebackDecision, explainWhyWritebackWasSkipped } from "@/lib/noop-guard";
import { evaluateSimilarityScore } from "@/lib/similarity-evaluator";
import { useCopymeStore } from "@/store/use-copyme-store";

export default function ProxyReviewPage() {
  return (
    <ClientOnly fallback={<ProxyReviewSkeleton />}>
      <ProxyReviewPageContent />
    </ClientOnly>
  );
}

function ProxyReviewPageContent() {
  const proxyReviewCases = useCopymeStore((state) => state.proxyReviewCases);
  const selectedCaseId = useCopymeStore((state) => state.selectedProxyReviewCaseId);
  const studentTemplates = useCopymeStore((state) => state.studentTemplates);
  const rules = useCopymeStore((state) => state.rules);
  const hypothesisRules = useCopymeStore((state) => state.hypothesisRules);
  const ruleReplacementRecords = useCopymeStore((state) => state.ruleReplacementRecords);
  const rulePerformanceRecords = useCopymeStore((state) => state.rulePerformanceRecords);
  const ruleTemporalStats = useCopymeStore((state) => state.ruleTemporalStats);
  const ruleEcologyStats = useCopymeStore((state) => state.ruleEcologyStats);
  const competitionGroupEcology = useCopymeStore((state) => state.competitionGroupEcology);
  const ruleDecayRecords = useCopymeStore((state) => state.ruleDecayRecords);
  const sessions = useCopymeStore((state) => state.sessions);
  const personaModel = useCopymeStore((state) => state.personaModel);
  const reviewSignalsAll = useCopymeStore((state) => state.reviewSignals);
  const reviewSignalApplicationsAll = useCopymeStore((state) => state.reviewSignalApplications);
  const ruleContradictions = useCopymeStore((state) => state.ruleContradictions);
  const proxyReviewFeedbackDraft = useCopymeStore((state) => state.proxyReviewFeedbackDraft);
  const latestFixtureRegressionReport = useCopymeStore((state) => state.latestFixtureRegressionReport);
  const setProxyReviewFeedbackDraft = useCopymeStore((state) => state.setProxyReviewFeedbackDraft);
  const selectProxyReviewCase = useCopymeStore((state) => state.selectProxyReviewCase);
  const selectReviewLabel = useCopymeStore((state) => state.selectReviewLabel);
  const writeReviewFeedbackBack = useCopymeStore((state) => state.writeReviewFeedbackBack);
  const evaluatePrecisionSeverity = useCopymeStore((state) => state.evaluatePrecisionSeverity);
  const buildSegmentCorrectionIntent = useCopymeStore((state) => state.buildSegmentCorrectionIntent);
  const analyzeResponseSurface = useCopymeStore((state) => state.analyzeResponseSurface);
  const runPolishRegression = useCopymeStore((state) => state.runPolishRegression);
  const buildMicroEditPlan = useCopymeStore((state) => state.buildMicroEditPlan);
  const scoreMicroEditROI = useCopymeStore((state) => state.scoreMicroEditROI);
  const selectBudgetedMicroEdits = useCopymeStore((state) => state.selectBudgetedMicroEdits);
  const runROIMicroEdit = useCopymeStore((state) => state.runROIMicroEdit);
  const runROIMicroEditRegression = useCopymeStore((state) => state.runROIMicroEditRegression);
  const runConflictAwareCalibration = useCopymeStore((state) => state.runConflictAwareCalibration);
  const runConflictAwareRegression = useCopymeStore((state) => state.runConflictAwareRegression);
  const runFullFixtureRegression = useCopymeStore((state) => state.runFullFixtureRegression);
  const analyzeRoutingConflictSignals = useCopymeStore((state) => state.analyzeRoutingConflictSignals);
  const buildRoutingDecision = useCopymeStore((state) => state.buildRoutingDecision);
  const buildSegmentPriorities = useCopymeStore((state) => state.buildSegmentPriorities);
  const mapToReactionBand = useCopymeStore((state) => state.mapToReactionBand);
  const applyReactionCap = useCopymeStore((state) => state.applyReactionCap);
  const applyInvariantSafety = useCopymeStore((state) => state.applyInvariantSafety);
  const computeEditBudget = useCopymeStore((state) => state.computeEditBudget);
  const explainWhyGuardWasOverridden = useCopymeStore((state) => state.explainWhyGuardWasOverridden);
  const explainWhyMixedCaseWasTargeted = useCopymeStore((state) => state.explainWhyMixedCaseWasTargeted);
  const explainWhyHighSimilarityStillNeededCorrection = useCopymeStore((state) => state.explainWhyHighSimilarityStillNeededCorrection);
  const explainWhyFullCorrectionWasBlocked = useCopymeStore((state) => state.explainWhyFullCorrectionWasBlocked);
  const explainWhyCaseWasDowngradedToTargeted = useCopymeStore((state) => state.explainWhyCaseWasDowngradedToTargeted);
  const explainWhySafetyLoopTriggered = useCopymeStore((state) => state.explainWhySafetyLoopTriggered);
  const explainWhyThisEditWasChosen = useCopymeStore((state) => state.explainWhyThisEditWasChosen);
  const explainWhyThisSafeEditWasRejected = useCopymeStore((state) => state.explainWhyThisSafeEditWasRejected);
  const explainWhyNoMicroEditWasApplied = useCopymeStore((state) => state.explainWhyNoMicroEditWasApplied);
  const clearProxyCalibration = useCopymeStore((state) => state.clearProxyCalibration);
  const resetMockState = useCopymeStore((state) => state.resetMockState);

  const reviewCase = useMemo(
    () => proxyReviewCases.find((item) => item.id === selectedCaseId) ?? proxyReviewCases[0],
    [proxyReviewCases, selectedCaseId]
  );
  const studentProfile = useMemo(
    () => studentTemplates.find((template) => template.id === reviewCase?.studentTemplateId || template.templateId === reviewCase?.studentTemplateId || template.name === reviewCase?.studentTemplateName),
    [reviewCase?.studentTemplateId, reviewCase?.studentTemplateName, studentTemplates]
  );
  const reviewCaseId = reviewCase?.id;
  const [selectedFixtureId, setSelectedFixtureId] = useState(selectedCaseId ?? proxyReviewCases[0]?.id ?? "");
  const reviewSignals = useMemo(
    () => reviewSignalsAll.filter((signal) => signal.reviewCaseId === reviewCaseId),
    [reviewCaseId, reviewSignalsAll]
  );
  const reviewSignalApplications = useMemo(
    () => reviewSignalApplicationsAll.filter((application) => reviewSignals.some((signal) => signal.id === application.reviewSignalId)),
    [reviewSignalApplicationsAll, reviewSignals]
  );
  const temporalByRule = useMemo(() => new Map(ruleTemporalStats.map((stats) => [stats.ruleId, stats])), [ruleTemporalStats]);
  const ecologyByRule = useMemo(() => new Map(ruleEcologyStats.map((stats) => [stats.ruleId, stats])), [ruleEcologyStats]);
  const ecologyByGroupId = useMemo(() => new Map(competitionGroupEcology.map((item) => [item.competitionGroupId, item])), [competitionGroupEcology]);
  const reviewPerformanceRecords = useMemo(
    () => rulePerformanceRecords.filter((record) => reviewSignalApplications.some((application) => application.appliedToRuleIds.includes(record.ruleId))),
    [reviewSignalApplications, rulePerformanceRecords]
  );
  const generatedContradictions = useMemo(
    () =>
      ruleContradictions.filter(
        (contradiction) =>
          contradiction.sourceType === "review_signal" && reviewSignalApplications.some((application) => application.createdContradictionIds?.includes(contradiction.id))
      ),
    [reviewSignalApplications, ruleContradictions]
  );
  const spawnedHypotheses = useMemo(
    () =>
      hypothesisRules.filter(
        (hypothesis) => hypothesis.sourceType === "review_signal" && hypothesis.sourceIds.some((id) => id === reviewCase?.id || reviewSignals.some((signal) => signal.id === id))
      ),
    [hypothesisRules, reviewCase?.id, reviewSignals]
  );
  const replacementRecords = useMemo(
    () =>
      ruleReplacementRecords.filter(
        (record) =>
          spawnedHypotheses.some((hypothesis) => hypothesis.id === record.replacementRuleId || hypothesis.replacedByRuleId === record.replacedRuleId) ||
          reviewSignalApplications.some((application) => application.appliedToRuleIds.includes(record.replacedRuleId))
      ),
    [reviewSignalApplications, ruleReplacementRecords, spawnedHypotheses]
  );
  const [modelVersion, setModelVersion] = useState(reviewCase?.modelVersion ?? personaModel.version);
  const [studentTemplateId, setStudentTemplateId] = useState(reviewCase?.studentTemplateId ?? "");
  const [scenario, setScenario] = useState(reviewCase?.scenario ?? "interview");
  const [isRunningFullRegression, setIsRunningFullRegression] = useState(false);

  const reviewHistory = useMemo(
    () => ({
      status: reviewCase?.reviewStatus ?? "new",
      label: reviewCase?.selectedLabel ?? "none",
      writtenBack: Boolean(reviewCase?.writtenBackRuleIds?.length),
      updatedAt: reviewCase?.updatedAt ?? reviewCase?.createdAt ?? ""
    }),
    [reviewCase]
  );
  const forcedDowngrade = reviewSignalApplications.some((application) => application.didForceDowngrade);
  const reviewMemorySummary = useMemo(() => {
    const items: string[] = [];
    const reviewShock = reviewSignalApplications.filter((application) => {
      const signal = reviewSignals.find((item) => item.id === application.reviewSignalId);
      return signal?.targetLayer === "boundary" || signal?.targetLayer === "decision";
    }).length;
    const contradictionShock = generatedContradictions.length;
    const turnoverStress = replacementRecords.length;
    if (reviewShock) items.push(`review shock ${reviewShock}`);
    if (contradictionShock) items.push(`contradiction shock ${contradictionShock}`);
    if (turnoverStress) items.push(`turnover stress ${turnoverStress}`);
    if (forcedDowngrade) items.push("forced downgrade");
    return items.length ? items : ["no residual shock"];
  }, [forcedDowngrade, generatedContradictions.length, reviewSignalApplications, reviewSignals, replacementRecords.length]);
  const affectedRules = useMemo(
    () =>
      Array.from(
        new Set(
          reviewSignalApplications.flatMap((application) =>
            application.appliedToRuleIds.map((ruleId) => rules.find((rule) => rule.id === ruleId)?.text ?? ruleId)
          )
        )
      ),
    [reviewSignalApplications, rules]
  );
  const ecologyEffects = useMemo(
    () => {
      return reviewSignalApplications.flatMap((application) =>
        application.appliedToRuleIds.map((ruleId) => {
          const rule = rules.find((item) => item.id === ruleId);
          const ecology = ecologyByRule.get(ruleId);
          const groupEcology = rule?.competitionGroupId ? ecologyByGroupId.get(rule.competitionGroupId) : undefined;
          return {
            ruleId,
            ruleText: rule?.text ?? ruleId,
            ecology,
            groupEcology,
            application
          };
        })
      );
    },
    [ecologyByGroupId, ecologyByRule, reviewSignalApplications, rules]
  );
  const similarityScore = useMemo(
    () =>
      reviewCase
        ? evaluateSimilarityScore({
            studentProfile,
            scenario: reviewCase.scenario,
            teacherResponse: reviewCase.yourResponse,
            proxyResponse: reviewCase.proxyResponse
          })
        : undefined,
    [reviewCase, studentProfile]
  );
  const similarityDiffs = useMemo(
    () =>
      reviewCase
        ? analyzeSimilarityDiff({
            studentProfile,
            scenario: reviewCase.scenario,
            teacherResponse: reviewCase.yourResponse,
            proxyResponse: reviewCase.proxyResponse
          })
        : [],
    [reviewCase, studentProfile]
  );
  const precisionSeverities = useMemo(
    () => (reviewCase ? evaluatePrecisionSeverity(reviewCase.id) ?? [] : []),
    [evaluatePrecisionSeverity, reviewCase]
  );
  const segmentCorrectionIntents = useMemo(
    () => (reviewCase ? buildSegmentCorrectionIntent(reviewCase.id) ?? [] : []),
    [buildSegmentCorrectionIntent, reviewCase]
  );
  const precisionSeverityByCategory = useMemo(
    () => new Map(precisionSeverities.map((item) => [item.category, item] as const)),
    [precisionSeverities]
  );
  const segmentIntentById = useMemo(
    () => new Map(segmentCorrectionIntents.map((item) => [item.segmentId, item] as const)),
    [segmentCorrectionIntents]
  );
  const conflictSignals = useMemo(
    () => (reviewCase ? analyzeRoutingConflictSignals(reviewCase.id) ?? [] : []),
    [analyzeRoutingConflictSignals, reviewCase]
  );
  const routingDecision = useMemo(
    () => (reviewCase ? buildRoutingDecision(reviewCase.id) : undefined),
    [buildRoutingDecision, reviewCase]
  );
  const segmentPriorities = useMemo(
    () => (reviewCase ? buildSegmentPriorities(reviewCase.id) ?? [] : []),
    [buildSegmentPriorities, reviewCase]
  );
  const segmentPriorityById = useMemo(
    () => new Map(segmentPriorities.map((item) => [item.segmentId, item] as const)),
    [segmentPriorities]
  );
  const guardOverrideExplanation = useMemo(
    () => (reviewCase ? explainWhyGuardWasOverridden(reviewCase.id) : undefined),
    [explainWhyGuardWasOverridden, reviewCase]
  );
  const mixedCaseTargetedExplanation = useMemo(
    () => (reviewCase ? explainWhyMixedCaseWasTargeted(reviewCase.id) : undefined),
    [explainWhyMixedCaseWasTargeted, reviewCase]
  );
  const highSimilarityCorrectionExplanation = useMemo(
    () => (reviewCase ? explainWhyHighSimilarityStillNeededCorrection(reviewCase.id) : undefined),
    [explainWhyHighSimilarityStillNeededCorrection, reviewCase]
  );
  const reactionBandDecision = useMemo(() => (reviewCase ? mapToReactionBand(reviewCase.id) : undefined), [mapToReactionBand, reviewCase]);
  const reactionCapDecision = useMemo(() => (reviewCase ? applyReactionCap(reviewCase.id) : undefined), [applyReactionCap, reviewCase]);
  const reactionSafetyLoop = useMemo(() => (reviewCase ? applyInvariantSafety(reviewCase.id) : undefined), [applyInvariantSafety, reviewCase]);
  const editBudget = useMemo(() => (reviewCase ? computeEditBudget(reviewCase.id) : undefined), [computeEditBudget, reviewCase]);
  const fullCorrectionBlockedExplanation = useMemo(
    () => (reviewCase ? explainWhyFullCorrectionWasBlocked(reviewCase.id) : undefined),
    [explainWhyFullCorrectionWasBlocked, reviewCase]
  );
  const downgradedTargetedExplanation = useMemo(
    () => (reviewCase ? explainWhyCaseWasDowngradedToTargeted(reviewCase.id) : undefined),
    [explainWhyCaseWasDowngradedToTargeted, reviewCase]
  );
  const safetyLoopExplanation = useMemo(
    () => (reviewCase ? explainWhySafetyLoopTriggered(reviewCase.id) : undefined),
    [explainWhySafetyLoopTriggered, reviewCase]
  );
  const segmentDiffs = useMemo(
    () =>
      reviewCase
        ? analyzeResponseSegments({
            teacherResponse: reviewCase.yourResponse,
            proxyResponse: reviewCase.proxyResponse,
            diffs: similarityDiffs,
            precisionSeverities,
            studentProfile,
            scenario: reviewCase.scenario
          })
        : [],
    [precisionSeverities, reviewCase, similarityDiffs, studentProfile]
  );
  const feedbackWritebacks = useMemo(() => buildFeedbackWritebackPlan(similarityDiffs, [...rules, ...hypothesisRules]), [hypothesisRules, rules, similarityDiffs]);
  const calibrationPlan = useMemo(
    () =>
      reviewCase && similarityScore
        ? buildCalibrationPlan({
            reviewCaseId: reviewCase.id,
            similarity: similarityScore,
            diffs: similarityDiffs,
            teacherResponse: reviewCase.yourResponse,
            proxyResponse: reviewCase.proxyResponse,
            writebacks: feedbackWritebacks,
            studentProfile,
            scenario: reviewCase.scenario,
            precisionSeverities,
            segmentCorrectionIntents
          })
        : undefined,
    [feedbackWritebacks, precisionSeverities, reviewCase, segmentCorrectionIntents, similarityDiffs, similarityScore, studentProfile]
  );
  const writebackDecision = useMemo(
    () => (similarityScore ? evaluateWritebackDecision({ similarity: similarityScore, diffs: similarityDiffs }) : undefined),
    [similarityDiffs, similarityScore]
  );
  const precisionRegressionResult = useMemo(
    () =>
      reviewCase
        ? runConflictAwareRegression(reviewCase.id)
        : undefined,
    [reviewCase, runConflictAwareRegression]
  );
  const polishPlan = useMemo(() => (reviewCase ? analyzeResponseSurface(reviewCase.id) : undefined), [analyzeResponseSurface, reviewCase]);
  const polishRegression = useMemo(() => (reviewCase ? runPolishRegression(reviewCase.id) : undefined), [reviewCase, runPolishRegression]);
  const microEditPlan = useMemo(() => (reviewCase ? buildMicroEditPlan(reviewCase.id) : undefined), [buildMicroEditPlan, reviewCase]);
  const roiScoredEdits = useMemo(
    () => (reviewCase ? scoreMicroEditROI(reviewCase.id) ?? [] : []),
    [reviewCase, scoreMicroEditROI]
  );
  const roiSelection = useMemo(
    () => (reviewCase ? selectBudgetedMicroEdits(reviewCase.id) : undefined),
    [reviewCase, selectBudgetedMicroEdits]
  );
  const roiMicroEditContext = useMemo(
    () => (reviewCase ? runROIMicroEdit(reviewCase.id) : undefined),
    [reviewCase, runROIMicroEdit]
  );
  const roiMicroEditRegression = useMemo(
    () => (reviewCase ? runROIMicroEditRegression(reviewCase.id) : undefined),
    [reviewCase, runROIMicroEditRegression]
  );
  const directionProbe = calibrationPlan?.directionProbe;
  const calibratedConflictSignals = calibrationPlan?.calibratedConflictSignals ?? [];
  const signalCalibrationTraces = calibrationPlan?.signalCalibrationTraces ?? [];
  const longTextScopeSplit = calibrationPlan?.longTextScopeSplit;
  const precisionOverrideNote = useMemo(() => {
    const critical = precisionSeverities.filter(
      (item) => (item.category === "decision" || item.category === "boundary") && item.severity === "high"
    );
    if (!critical.length && !routingDecision?.shouldOverrideGuard) return null;
    const guardOverride = routingDecision?.shouldOverrideGuard ? routingDecision.overrideReason ?? "Routing override active due to conflict signals." : "";
    const precisionNote = critical.length ? `Precision override active for ${critical.map((item) => `${item.category}:${item.severity}`).join(", ")}.` : "";
    return [guardOverride, precisionNote].filter(Boolean).join(" ");
  }, [precisionSeverities, routingDecision]);

  useEffect(() => {
    if (!reviewCase) return;
    setSelectedFixtureId(reviewCase.id);
    setModelVersion(reviewCase.modelVersion);
    setStudentTemplateId(reviewCase.studentTemplateId);
    setScenario(reviewCase.scenario);
  }, [reviewCase?.id, reviewCase?.modelVersion, reviewCase?.scenario, reviewCase?.studentTemplateId]);

  function runReview() {
    const nextCase =
      proxyReviewCases.find((item) => item.id === selectedFixtureId) ??
      proxyReviewCases.find((item) => item.modelVersion === modelVersion && item.studentTemplateId === studentTemplateId && item.scenario === scenario) ??
      proxyReviewCases[(proxyReviewCases.findIndex((item) => item.id === reviewCase?.id) + 1) % proxyReviewCases.length];
    if (!nextCase) return;
    setSelectedFixtureId(nextCase.id);
    setModelVersion(nextCase.modelVersion);
    setStudentTemplateId(nextCase.studentTemplateId);
    setScenario(nextCase.scenario);
    selectProxyReviewCase(nextCase.id);
  }

  async function runFullRegression() {
    if (isRunningFullRegression) return;
    setIsRunningFullRegression(true);
    try {
      await runFullFixtureRegression();
    } finally {
      setIsRunningFullRegression(false);
    }
  }

  function writeBack() {
    if (!reviewCase) return;
    runConflictAwareCalibration(reviewCase.id);
    writeReviewFeedbackBack(reviewCase.id);
  }

  function clearCalibration() {
    if (!reviewCase) return;
    clearProxyCalibration(reviewCase.id);
  }

  function toneForScore(score: number): "good" | "warn" | "bad" | "accent" | "default" {
    if (score >= 82) return "good";
    if (score >= 66) return "accent";
    if (score >= 48) return "warn";
    if (score >= 30) return "bad";
    return "default";
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        kicker="Proxy Lab"
        title="Proxy Review"
        subtitle="将你的 response 与 AI proxy 对比，标记 mismatch，并回写 correction signal。"
      />

      <Panel title="Review Controls" subtitle="在运行对比前先选择 model version、learner template 和 scenario">
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          <Field label="Proxy Fixture">
            <Select
              value={selectedFixtureId || reviewCase?.id || ""}
              onChange={(event) => {
                const nextCase = proxyReviewCases.find((item) => item.id === event.target.value);
                if (!nextCase) return;
                setSelectedFixtureId(nextCase.id);
                setModelVersion(nextCase.modelVersion);
                setStudentTemplateId(nextCase.studentTemplateId);
                setScenario(nextCase.scenario);
                selectProxyReviewCase(nextCase.id);
              }}
            >
              {proxyReviewCases.map((item) => (
                <option key={item.id} value={item.id}>
                  {(item.fixtureFamily === "ood" ? "OOD" : "Review") + " · " + item.id + " · " + (item.riskType ?? "general") + " · " + item.studentTemplateName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Persona Model Version">
            <Select value={modelVersion} onChange={(event) => setModelVersion(event.target.value)}>
              <option value={personaModel.version}>{personaModel.version}</option>
              <option value="v0.2">v0.2</option>
              <option value="v0.1">v0.1</option>
            </Select>
          </Field>
          <Field label="Student Template">
            <Select value={studentTemplateId} onChange={(event) => setStudentTemplateId(event.target.value)}>
              {Array.from(new Set(proxyReviewCases.map((item) => item.studentTemplateId))).map((templateId) => (
                <option key={templateId} value={templateId}>
                  {templateId.replace("template-", "").replace(/-/g, " ")}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Scenario">
            <Select value={scenario} onChange={(event) => setScenario(event.target.value as typeof scenario)}>
              <option value="daily talk">Daily talk 日常对话</option>
              <option value="interview">Interview 面试</option>
              <option value="opinion">Opinion 观点</option>
              <option value="storytelling">Storytelling 讲故事</option>
              <option value="debate">Debate 辩论</option>
            </Select>
          </Field>
          <div className="flex items-end">
            <PrimaryButton onClick={runReview} className="w-full">
              运行 Review
            </PrimaryButton>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-black/20 p-3 text-xs leading-5 text-muted">
          <span>Review selections 和 feedback notes 会保存在 shared store 中。</span>
          <SecondaryButton onClick={resetMockState}>重置 Mock State</SecondaryButton>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
          <SecondaryButton onClick={runFullRegression} disabled={isRunningFullRegression}>
            {isRunningFullRegression ? "正在运行 Full Regression..." : "运行 Full Regression"}
          </SecondaryButton>
        </div>
      </Panel>

      {latestFixtureRegressionReport ? (
        <Panel
          title="Regression Baseline"
          subtitle={`Baseline ${latestFixtureRegressionReport.baselineVersion} · ${latestFixtureRegressionReport.fixtureCount} fixtures`}
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <InfoRow label="Total Average Delta" value={latestFixtureRegressionReport.summary.totalAverageDelta.toFixed(1)} />
            <InfoRow label="OOD Success Rate" value={`${Math.round(latestFixtureRegressionReport.summary.oodStrictSuccessRate * 100)}%`} />
            <InfoRow label="No-op Count" value={String(latestFixtureRegressionReport.summary.noOpCount)} />
            <InfoRow label="Review Pass Rate" value={`${Math.round(latestFixtureRegressionReport.summary.reviewPassRate * 100)}%`} />
          </div>
          <div className="mt-3 text-xs leading-5 text-muted">
            Baseline path: <span className="text-text">{latestFixtureRegressionReport.regressionPath}</span>
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr_320px]">
        <Panel title="Your Response" subtitle="Human teacher baseline">
          <ResponseCard title="Prompt" text={reviewCase?.prompt ?? "No review case selected."} />
          <ResponseCard title="Response" text={reviewCase?.yourResponse ?? ""} />
        </Panel>

        <Panel title="Proxy Response" subtitle="同一 case 的 AI proxy 输出">
          <ResponseCard title="Prompt" text={reviewCase?.prompt ?? "No review case selected."} />
          <ResponseCard title="Response" text={reviewCase?.proxyResponse ?? ""} />
        </Panel>

        <Panel title="Difference Labels" subtitle="标记 mismatch 的类型">
          <div className="space-y-3">
            {reviewCase?.diffLabels.map((label) => {
              const active = reviewCase?.selectedLabel === label;
              return (
                <button
                  key={label}
                  onClick={() => reviewCase && selectReviewLabel(reviewCase.id, label)}
                  className={`w-full rounded-2xl border px-3 py-3 text-left text-sm transition ${
                    active ? "border-accent/40 bg-accent/12" : "border-line bg-black/20 hover:bg-white/[0.05]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Panel title="Similarity Score" subtitle="Decision 权重最高；分数越高表示 proxy 越接近 teacher">
          {similarityScore ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={toneForScore(similarityScore.overall)}>Overall {similarityScore.overall.toFixed(0)}</Pill>
                <Pill tone={toneForScore(similarityScore.decision)}>Decision {similarityScore.decision.toFixed(0)}</Pill>
                <Pill tone={toneForScore(similarityScore.priority)}>Priority {similarityScore.priority.toFixed(0)}</Pill>
                <Pill tone={toneForScore(similarityScore.style)}>Style {similarityScore.style.toFixed(0)}</Pill>
                <Pill tone={toneForScore(similarityScore.boundary)}>Boundary {similarityScore.boundary.toFixed(0)}</Pill>
                <Pill tone={toneForScore(similarityScore.reasoningMatch)}>Reasoning {similarityScore.reasoningMatch.toFixed(0)}</Pill>
              </div>
              <div className="rounded-2xl border border-line bg-black/20 p-4 text-sm leading-6 text-text">{similarityScore.explain}</div>
            </div>
          ) : (
            <div className="text-sm text-muted">暂无 comparison 可用。</div>
          )}
        </Panel>

        <Panel title="Diff Analysis" subtitle="为什么不像我，以及下一次 write-back 应该瞄准什么">
          <div className="space-y-3">
            {similarityDiffs.length ? (
              similarityDiffs.map((diff) => {
                const writeback = feedbackWritebacks.find((item) => item.reason.includes(diff.category)) ?? feedbackWritebacks[0];
                const precision = precisionSeverityByCategory.get(diff.category);
                return (
                  <div key={`${diff.category}-${diff.reason}`} className="rounded-2xl border border-line bg-black/20 p-4 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={diff.severity === "high" ? "bad" : diff.severity === "medium" ? "warn" : "accent"}>{diff.category}</Pill>
                      <Pill>{diff.severity}</Pill>
                      <Pill>{diff.reason}</Pill>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-text">{diff.explanation}</p>
                    {precision ? (
                      <div className="mt-3 rounded-xl border border-line/70 bg-white/[0.03] p-3 text-xs text-muted">
                        <div className="flex flex-wrap items-center gap-2">
                          <Pill tone={precision.severity === "high" ? "bad" : precision.severity === "medium" ? "warn" : "accent"}>{`precision ${precision.severity}`}</Pill>
                          <Pill>{`score ${precision.score}`}</Pill>
                          <Pill>{`evidence ${precision.evidence.length}`}</Pill>
                        </div>
                        {precision.evidence.length ? (
                          <div className="mt-2 space-y-1 leading-5 text-text">
                            {precision.evidence.map((item) => (
                              <div key={item.evidenceType}>{item.explanation}</div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {writeback ? (
                      <div className="mt-3 rounded-xl border border-line/70 bg-white/[0.03] p-3 text-xs text-muted">
                        <div className="flex flex-wrap items-center gap-2">
                          <Pill tone="accent">{writeback.action}</Pill>
                          <Pill>{writeback.targetRuleIds.length ? writeback.targetRuleIds.join(", ") : "create-new-rule"}</Pill>
                        </div>
                        <div className="mt-2 leading-5 text-text">{writeback.expectedImpact}</div>
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-sm text-muted">暂无 diffs。</div>
            )}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Panel title="Conflict Signals" subtitle="Routing 应该看 conflict，而不只是 similarity">
          <div className="space-y-3">
            {conflictSignals.length ? (
              conflictSignals.map((signal) => (
                <div key={`${signal.signalType}-${signal.score}-${signal.category}`} className="rounded-2xl border border-line bg-black/20 p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={signal.severity === "high" ? "bad" : signal.severity === "medium" ? "warn" : "accent"}>{signal.signalType}</Pill>
                    <Pill>{signal.category}</Pill>
                    <Pill>{signal.severity}</Pill>
                    <Pill>{`score ${signal.score}`}</Pill>
                  </div>
                  <div className="mt-2 leading-6 text-text">{signal.explanation}</div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-sm text-muted">暂无 conflict signals。</div>
            )}
          </div>
          <div className="mt-4 rounded-xl border border-line/70 bg-white/[0.03] p-3 text-xs text-muted">
            <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-muted">Routing Decision</div>
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="accent">{routingDecision?.finalMode ?? calibrationPlan?.mode ?? "unknown"}</Pill>
              <Pill>{routingDecision?.shouldOverrideGuard ? "override" : "no override"}</Pill>
            </div>
            <div className="mt-2 leading-6 text-text">{routingDecision?.rationale ?? precisionOverrideNote ?? "No routing decision yet."}</div>
            {guardOverrideExplanation ? <div className="mt-2 leading-6 text-muted">{guardOverrideExplanation}</div> : null}
            {mixedCaseTargetedExplanation ? <div className="mt-2 leading-6 text-muted">{mixedCaseTargetedExplanation}</div> : null}
            {highSimilarityCorrectionExplanation ? <div className="mt-2 leading-6 text-muted">{highSimilarityCorrectionExplanation}</div> : null}
            {routingDecision?.overrideReason ? <div className="mt-2 leading-6 text-amber-200">{routingDecision.overrideReason}</div> : null}
          </div>
          {precisionOverrideNote ? <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-6 text-amber-100">{precisionOverrideNote}</div> : null}
        </Panel>

        <Panel title="Segment Priorities" subtitle="Edit priority and preserve priority are used to route mixed cases">
          <div className="space-y-2">
            {segmentDiffs.length ? (
              segmentDiffs.map((segment) => {
                const priority = segmentPriorityById.get(segment.segmentId);
                const intent = segmentIntentById.get(segment.segmentId);
                return (
                  <div key={segment.segmentId} className="rounded-2xl border border-line bg-black/20 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={segment.severity === "high" ? "bad" : segment.severity === "medium" ? "warn" : "accent"}>{segment.segmentId}</Pill>
                      <Pill>{segment.category}</Pill>
                      <Pill>{intent?.correctionIntent ?? "protect"}</Pill>
                    </div>
                    <div className="mt-2 text-xs text-muted">
                      edit {priority?.editPriority ?? 0} · preserve {priority?.preservePriority ?? 0}
                    </div>
                    <div className="mt-2 leading-6 text-text">{priority?.reason ?? segment.suggestedAction}</div>
                  </div>
                );
              })
            ) : (
                    <div className="rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-sm text-muted">暂无 segment priorities。</div>
            )}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Review Notes" subtitle="Summary、signals 和 suggested corrections">
          <div className="space-y-4">
            <div className="rounded-2xl border border-line bg-black/20 p-4 text-sm leading-6 text-text">{reviewCase?.note ?? "No note available."}</div>
            <div>
                <div className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-text">Suggested Correction Points</div>
              <div className="space-y-2">
                {reviewCase?.correctionPoints.map((point) => (
                  <div key={point} className="rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-sm text-muted">
                    {point}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-text">Teacher Direction Probe</div>
              <div className="rounded-xl border border-line bg-black/20 px-3 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={directionProbe?.conflictDetected ? "bad" : "good"}>{directionProbe?.teacherCoreDirection ?? "unknown"}</Pill>
                  <Pill>{directionProbe?.proxyCoreDirection ?? "unknown"}</Pill>
                  <Pill>{directionProbe?.conflictDetected ? "conflict" : "aligned"}</Pill>
                  <Pill>{`confidence ${directionProbe?.confidence ?? 0}`}</Pill>
                </div>
                <div className="mt-2 leading-6 text-text">{directionProbe?.explanation ?? "暂无 direction probe。"}</div>
              </div>
            </div>
            <div>
              <div className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-text">Calibrated Conflict Signals</div>
              <div className="space-y-2">
                {calibratedConflictSignals.length ? (
                  calibratedConflictSignals.map((signal) => (
                    <div key={`${signal.signalType}-${signal.finalScore}-${signal.category}`} className="rounded-xl border border-line bg-black/20 px-3 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone={signal.severity === "high" ? "bad" : signal.severity === "medium" ? "warn" : "accent"}>{signal.signalType}</Pill>
                        <Pill>{signal.category}</Pill>
                        <Pill>{signal.scope}</Pill>
                        <Pill>{`recall ${signal.recallScore}`}</Pill>
                        <Pill>{`cal ${signal.calibrationScore}`}</Pill>
                        <Pill>{`final ${signal.finalScore}`}</Pill>
                      </div>
                      <div className="mt-2 leading-6 text-text">{signal.explanation}</div>
                      {signal.evidence.length ? <div className="mt-1 text-xs leading-5 text-muted">{signal.evidence.join(" · ")}</div> : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-sm text-muted">暂无 calibrated signals。</div>
                )}
              </div>
            </div>
            <div>
              <div className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-text">Signal Calibration Trace</div>
              <div className="space-y-2">
                {signalCalibrationTraces.length ? (
                  signalCalibrationTraces.map((trace) => (
                    <div key={`${trace.signalType}-${trace.finalScore}`} className="rounded-xl border border-line bg-black/20 px-3 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone="accent">{trace.signalType}</Pill>
                        <Pill>{`raw ${trace.rawScore}`}</Pill>
                        <Pill>{`final ${trace.finalScore}`}</Pill>
                      </div>
                      <div className="mt-2 leading-6 text-text">{trace.rationale}</div>
                      <div className="mt-1 text-xs leading-5 text-muted">
                        boosted: {trace.boostedBy.length ? trace.boostedBy.join(", ") : "none"} · reduced: {trace.reducedBy.length ? trace.reducedBy.join(", ") : "none"}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-sm text-muted">暂无 calibration traces。</div>
                )}
              </div>
            </div>
            <div>
              <div className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-text">Long-Text Scope Split</div>
              <div className="rounded-xl border border-line bg-black/20 px-3 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone="accent">{`global ${longTextScopeSplit?.globalSignals.length ?? 0}`}</Pill>
                  <Pill>{`clusters ${longTextScopeSplit?.localClusterSignals.length ?? 0}`}</Pill>
                </div>
                <div className="mt-2 space-y-2">
                  {longTextScopeSplit?.localClusterSignals.length ? (
                    longTextScopeSplit.localClusterSignals.map((cluster) => (
                      <div key={cluster.clusterId} className="rounded-lg border border-line/60 bg-white/[0.03] px-3 py-2 text-xs text-muted">
                        <div className="flex flex-wrap items-center gap-2">
                          <Pill>{cluster.clusterId}</Pill>
                          <Pill>{cluster.dominantSignal}</Pill>
                          <Pill>{`strength ${cluster.strength}`}</Pill>
                        </div>
                        <div className="mt-1 leading-5 text-text">{cluster.segmentIds.join(" | ")}</div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-sm text-muted">暂无 local clusters。</div>
                  )}
                </div>
              </div>
            </div>
            <div>
              <div className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-text">Generated Review Signals</div>
              <div className="space-y-2">
                {reviewSignals.length ? (
                  reviewSignals.map((signal) => (
                    <div key={signal.id} className="rounded-xl border border-line bg-black/20 px-3 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone="accent">{signal.signalType}</Pill>
                        <Pill>{signal.targetLayer}</Pill>
                        <Pill>{signal.status}</Pill>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-text">{signal.description}</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-sm text-muted">暂无 review signals。</div>
                )}
              </div>
            </div>
            <div>
              <div className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-text">Signal Applications</div>
              <div className="space-y-2">
                {reviewSignalApplications.length ? (
                  reviewSignalApplications.map((application) => {
                    const createdEvidenceKinds = application.createdEvidenceIds.length ? (application.action === "support_existing_rule" ? "support" : application.action === "challenge_existing_rule" ? "challenge" : "review_correction") : "no_effect";
                    return (
                      <div key={application.id} className="rounded-xl border border-line bg-black/20 px-3 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone="accent">{application.action}</Pill>
                        <Pill>{createdEvidenceKinds}</Pill>
                        <Pill>{application.reviewSignalId}</Pill>
                        {application.didForceDowngrade ? <Pill tone="warn">forced</Pill> : null}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-text">{application.note}</p>
                        <div className="mt-2 text-xs text-muted">
                          Affected rules:{" "}
                          {application.appliedToRuleIds.length
                            ? application.appliedToRuleIds
                                .map((ruleId) => rules.find((rule) => rule.id === ruleId)?.text ?? ruleId)
                                .join(" | ")
                            : "none"}
                        </div>
                        <div className="mt-1 text-xs text-muted">
                          Created evidence: {application.createdEvidenceIds.length ? application.createdEvidenceIds.join(", ") : "none"}
                        </div>
                        {application.createdContradictionIds?.length ? (
                          <div className="mt-1 text-xs text-muted">Created contradictions: {application.createdContradictionIds.join(", ")}</div>
                        ) : null}
                        {application.spawnedCandidateRuleIds?.length ? (
                          <div className="mt-1 text-xs text-muted">Spawned candidates: {application.spawnedCandidateRuleIds.join(", ")}</div>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-sm text-muted">暂无 signal applications。</div>
                )}
              </div>
            </div>
            <div>
              <div className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-text">Generated Contradictions</div>
              <div className="space-y-2">
                {generatedContradictions.length ? (
                  generatedContradictions.map((contradiction) => (
                    <div key={contradiction.id} className="rounded-xl border border-line bg-black/20 px-3 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone="warn">{contradiction.severity}</Pill>
                        <Pill>{contradiction.contradictionType}</Pill>
                        <Pill>{contradiction.sourceType}</Pill>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-text">{contradiction.summary}</p>
                      <div className="mt-1 text-xs text-muted">Related turns: {contradiction.relatedTurnIds?.length ? contradiction.relatedTurnIds.join(", ") : "none"}</div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-sm text-muted">暂无 contradiction records。</div>
                )}
              </div>
            </div>
            <div>
              <div className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-text">Spawned Hypotheses</div>
              <div className="space-y-2">
                {spawnedHypotheses.length ? (
                  spawnedHypotheses.map((hypothesis) => {
                    const replacement = ruleReplacementRecords.find((record) => record.replacementRuleId === hypothesis.id);
                    return (
                      <div key={hypothesis.id} className="rounded-xl border border-line bg-black/20 px-3 py-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                        <Pill tone="accent">{hypothesis.status}</Pill>
                        <Pill>{hypothesis.topicKey}</Pill>
                        <Pill>{hypothesis.layer}</Pill>
                        {replacement ? <Pill tone="good">replaced</Pill> : null}
                        {replacement ? <Pill>{`replaces ${replacement.replacedRuleId}`}</Pill> : null}
                      </div>
                        <p className="mt-2 text-sm leading-6 text-text">{hypothesis.text}</p>
                        <div className="mt-1 text-xs text-muted">Parents: {hypothesis.parentRuleIds.length ? hypothesis.parentRuleIds.join(", ") : "none"}</div>
                        <div className="mt-1 text-xs text-muted">Source session(s): {hypothesis.sourceSessionIds.length ? hypothesis.sourceSessionIds.join(", ") : "none"}</div>
                        {replacement ? <div className="mt-1 text-xs text-muted">Replacement: {replacement.replacedRuleId}</div> : null}
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-sm text-muted">暂无 spawned hypotheses。</div>
                )}
              </div>
            </div>
            <div>
              <div className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-text">Replacement Records</div>
              <div className="space-y-2">
                {replacementRecords.length ? (
                  replacementRecords.map((record) => (
                    <div key={record.id} className="rounded-xl border border-line bg-black/20 px-3 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone="warn">{record.replacedRuleId}</Pill>
                        <Pill tone="good">{record.replacementRuleId}</Pill>
                        <Pill>{record.competitionGroupId}</Pill>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-text">{record.reason}</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-sm text-muted">暂无 replacement records。</div>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-black/20 p-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-muted">Calibration Feedback Loop</div>
              <div className="mt-3 space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={writebackDecision?.shouldWriteBack ? "good" : "warn"}>{writebackDecision?.shouldWriteBack ? "applied" : "skipped"}</Pill>
                  <Pill>{writebackDecision?.reason ?? "unknown"}</Pill>
                  <Pill tone={precisionRegressionResult?.guarded ? "warn" : "good"}>{precisionRegressionResult?.guarded ? "guarded" : "live"}</Pill>
                  <Pill tone="accent">{calibrationPlan?.mode ?? "unknown"}</Pill>
                  {precisionRegressionResult ? <Pill>{`Δ ${precisionRegressionResult.delta.toFixed(1)}`}</Pill> : null}
                </div>
                <div className="rounded-xl border border-line/70 bg-white/[0.03] p-3 text-xs text-muted">
                  <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-muted">Writeback Decision</div>
                  <div className="leading-6 text-text">
                    {writebackDecision ? explainWhyWritebackWasSkipped(writebackDecision, similarityScore!, similarityDiffs) : "No decision yet."}
                  </div>
                  {writebackDecision?.blockedCategories?.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {writebackDecision.blockedCategories.map((category) => (
                        <Pill key={category}>{category}</Pill>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="rounded-xl border border-line/70 bg-white/[0.03] p-3 text-xs text-muted">
                  <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-muted">Calibration Mode</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={calibrationPlan?.mode === "skip" ? "warn" : calibrationPlan?.mode === "light_touch" ? "good" : "accent"}>{calibrationPlan?.mode ?? "unknown"}</Pill>
                    <Pill>{`protected ${calibrationPlan?.protectedSegments.length ?? 0}`}</Pill>
                    <Pill>{`editable ${calibrationPlan?.editableSegments.length ?? 0}`}</Pill>
                    <Pill>{`targets ${(calibrationPlan?.targetedCategories ?? []).join(", ") || "none"}`}</Pill>
                  </div>
                  <div className="mt-2 leading-6 text-text">
                    {calibrationPlan?.reason ?? "No calibration plan."}
                  </div>
                  {precisionOverrideNote ? <div className="mt-2 leading-6 text-amber-200">{precisionOverrideNote}</div> : null}
                </div>
                <div className="rounded-xl border border-line/70 bg-white/[0.03] p-3 text-xs text-muted">
                  <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-muted">Reaction Band</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={reactionBandDecision?.band === "skip" ? "warn" : reactionBandDecision?.band === "full_correction" ? "bad" : "accent"}>{reactionBandDecision?.band ?? "unknown"}</Pill>
                    <Pill>{reactionCapDecision?.capped ? "capped" : "uncapped"}</Pill>
                    <Pill>{reactionBandDecision?.protectedBySafetyLoop ? "safety-loop" : "no safety-loop"}</Pill>
                    <Pill>{`editable ${editBudget?.maxEdits ?? calibrationPlan?.editBudget?.maxEdits ?? 0}`}</Pill>
                  </div>
                  <div className="mt-2 leading-6 text-text">{reactionBandDecision?.reason ?? "No reaction band decision."}</div>
                  {reactionCapDecision?.capReason ? <div className="mt-2 leading-6 text-amber-200">{reactionCapDecision.capReason}</div> : null}
                  {reactionSafetyLoop?.reason ? <div className="mt-2 leading-6 text-muted">{reactionSafetyLoop.reason}</div> : null}
                  {fullCorrectionBlockedExplanation ? <div className="mt-2 leading-6 text-muted">{fullCorrectionBlockedExplanation}</div> : null}
                  {downgradedTargetedExplanation ? <div className="mt-2 leading-6 text-muted">{downgradedTargetedExplanation}</div> : null}
                  {safetyLoopExplanation ? <div className="mt-2 leading-6 text-muted">{safetyLoopExplanation}</div> : null}
                </div>
                <div className="rounded-xl border border-line/70 bg-white/[0.03] p-3 text-xs text-muted">
                  <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-muted">Precision Severity</div>
                  <div className="space-y-2">
                    {precisionSeverities.length ? (
                      precisionSeverities.map((item) => (
                        <div key={item.category} className="rounded-lg border border-line/60 bg-black/20 px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Pill tone={item.severity === "high" ? "bad" : item.severity === "medium" ? "warn" : "accent"}>{item.category}</Pill>
                            <Pill>{item.severity}</Pill>
                            <Pill>{`score ${item.score}`}</Pill>
                            <Pill>{`evidence ${item.evidence.length}`}</Pill>
                          </div>
                          {item.evidence.length ? (
                            <div className="mt-2 space-y-1 leading-5 text-text">
                              {item.evidence.map((evidence) => (
                                <div key={evidence.evidenceType}>{evidence.explanation}</div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-sm text-muted">暂无 precision severity。</div>
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-line/70 bg-white/[0.03] p-3 text-xs text-muted">
                  <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-muted">Protected vs Editable</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone="good">{`Protected ${calibrationPlan?.protectedSegments.length ?? 0}`}</Pill>
                    <Pill tone="accent">{`Editable ${calibrationPlan?.editableSegments.length ?? 0}`}</Pill>
                    {calibrationPlan?.mode === "skip" ? <Pill tone="warn">全部受保护</Pill> : null}
                  </div>
                  <div className="mt-2 leading-6 text-text">
                    {calibrationPlan?.protectedSegments.length ? calibrationPlan.protectedSegments.join(" | ") : "No protected segments."}
                  </div>
                </div>
                <div className="rounded-xl border border-line/70 bg-white/[0.03] p-3 text-xs text-muted">
                  <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-muted">Segment Edit Preview</div>
                  <div className="space-y-2">
                    {segmentDiffs.length ? (
                      segmentDiffs.map((segment) => (
                        <div key={segment.segmentId} className="rounded-lg border border-line/60 bg-black/20 px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Pill>{segment.segmentId}</Pill>
                            <Pill tone={segment.suggestedAction === "rewrite" ? "warn" : segment.suggestedAction === "keep" ? "good" : "accent"}>{segment.suggestedAction}</Pill>
                            <Pill>{segment.category}</Pill>
                            <Pill>{segment.severity}</Pill>
                            {segmentIntentById.get(segment.segmentId) ? (
                              <Pill tone="accent">{segmentIntentById.get(segment.segmentId)?.correctionIntent}</Pill>
                            ) : null}
                          </div>
                          <div className="mt-2 leading-6 text-text">{segment.originalText}</div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-sm text-muted">暂无 segment plan。</div>
                    )}
                  </div>
                </div>
                {precisionRegressionResult ? (
                  <div className="rounded-xl border border-line/70 bg-white/[0.03] p-3 text-xs text-muted">
                    <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-muted">Precision Regression</div>
                    <div className="flex flex-wrap gap-2">
                      <Pill tone={toneForScore(precisionRegressionResult.beforeScore.overall)}>Before {precisionRegressionResult.beforeScore.overall.toFixed(0)}</Pill>
                      <Pill tone={toneForScore(precisionRegressionResult.afterScore.overall)}>After {precisionRegressionResult.afterScore.overall.toFixed(0)}</Pill>
                      <Pill>{`Δ ${precisionRegressionResult.delta.toFixed(1)}`}</Pill>
                      <Pill>{precisionRegressionResult.calibrationMode}</Pill>
                      <Pill>{`protected ${precisionRegressionResult.protectedSegmentCount}`}</Pill>
                      <Pill>{`edited ${precisionRegressionResult.editedSegmentCount}`}</Pill>
                    </div>
                    <div className="mt-2 leading-6 text-text">{precisionRegressionResult.explanation}</div>
                    <div className="mt-2 leading-6 text-muted">{precisionRegressionResult.afterResponse}</div>
                  </div>
                ) : null}
                <div className="rounded-xl border border-line/70 bg-white/[0.03] p-3 text-xs text-muted">
                  <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-muted">Guarded Case</div>
                  <div className="leading-6 text-text">
                    {calibrationPlan?.mode === "skip"
                      ? "Skipped due to near-perfect / light-touch guard."
                      : calibrationPlan?.mode === "light_touch"
                        ? explainWhyResponseWasOnlyLightlyEdited({ plan: calibrationPlan, segmentDiffs })
                        : calibrationPlan?.mode === "full_correction"
                          ? explainWhyResponseWasHeavilyRewritten({ plan: calibrationPlan, segmentDiffs })
                          : "Calibration is targeted; protected segments remain intact."}
                  </div>
                  <div className="mt-2 leading-6 text-muted">{calibrationPlan ? explainWhichSegmentsWereProtected({ plan: calibrationPlan }) : "No protected segment summary."}</div>
                </div>
                <div className="rounded-xl border border-line/70 bg-white/[0.03] p-3 text-xs text-muted">
                  <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-muted">Naturalness Score</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={toneForScore(polishRegression?.naturalnessBefore.overall ?? 0)}>Before {polishRegression?.naturalnessBefore.overall ?? 0}</Pill>
                    <Pill tone={toneForScore(polishRegression?.naturalnessAfter.overall ?? 0)}>After {polishRegression?.naturalnessAfter.overall ?? 0}</Pill>
                    <Pill>{`Δ ${polishRegression ? (polishRegression.naturalnessAfter.overall - polishRegression.naturalnessBefore.overall).toFixed(0) : "0"}`}</Pill>
                      <Pill tone={polishPlan?.shouldPolish ? "good" : "warn"}>{polishPlan?.shouldPolish ? "已 polish" : "无需 polish"}</Pill>
                  </div>
                  <div className="mt-2 rounded-lg border border-line/60 bg-black/20 px-3 py-2 text-[11px] leading-5 text-text">
                    fluency {polishRegression?.naturalnessBefore.fluency ?? 0} → {polishRegression?.naturalnessAfter.fluency ?? 0} · coherence {polishRegression?.naturalnessBefore.coherence ?? 0} → {polishRegression?.naturalnessAfter.coherence ?? 0} · redundancy {polishRegression?.naturalnessBefore.redundancy ?? 0} → {polishRegression?.naturalnessAfter.redundancy ?? 0} · tone {polishRegression?.naturalnessBefore.toneNaturalness ?? 0} → {polishRegression?.naturalnessAfter.toneNaturalness ?? 0}
                  </div>
                </div>
                <div className="rounded-xl border border-line/70 bg-white/[0.03] p-3 text-xs text-muted">
                  <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-muted">Polish Issues</div>
                  <div className="flex flex-wrap gap-2">
                    {polishPlan?.issues?.length ? (
                      polishPlan.issues.map((issue) => (
                        <Pill key={issue} tone="accent">
                          {issue}
                        </Pill>
                      ))
                    ) : (
                      <Pill tone="good">clean</Pill>
                    )}
                  </div>
                  <div className="mt-2 leading-6 text-text">{polishPlan?.shouldPolish ? "Surface polish 已修剪标点、重复短语和 awkward joins，但没有改变 decision meaning。" : "这个 case 不需要 surface polish。"}</div>
                </div>
                <div className="rounded-xl border border-line/70 bg-white/[0.03] p-3 text-xs text-muted">
                  <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-muted">Polish Applied</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={polishPlan?.shouldPolish ? "good" : "warn"}>{polishPlan?.shouldPolish ? "yes" : "no"}</Pill>
                    <Pill>{`protected ${polishPlan?.preservedSegments.length ?? 0}`}</Pill>
                    <Pill>{`edited ${polishPlan?.editedSegments.length ?? 0}`}</Pill>
                  </div>
                  {polishRegression ? (
                    <div className="mt-2 space-y-2">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted">raw calibrated</div>
                      <div className="rounded-lg border border-line/60 bg-black/20 px-3 py-2 leading-6 text-text">{polishRegression.beforeText}</div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted">polished final</div>
                      <div className="rounded-lg border border-line/60 bg-black/20 px-3 py-2 leading-6 text-text">{polishRegression.afterText}</div>
                    </div>
                  ) : null}
                </div>
                <div className="rounded-xl border border-line/70 bg-white/[0.03] p-3 text-xs text-muted">
                  <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-muted">ROI Scored Edits</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={microEditPlan?.safe ? "good" : "warn"}>{microEditPlan?.safe ? "safe" : "blocked"}</Pill>
                    <Pill>{`candidates ${roiScoredEdits.length}`}</Pill>
                    <Pill>{`selected ${roiSelection?.selected.length ?? microEditPlan?.selectedEdits.length ?? 0}`}</Pill>
                    <Pill>{`rejected ${roiSelection?.rejected.length ?? 0}`}</Pill>
                    <Pill>{`budget ${roiSelection?.budgetUsed ?? 0}/${microEditPlan?.editBudgetPolicy?.maxBudget ?? 0}`}</Pill>
                  </div>
                  <div className="mt-2 space-y-2">
                    {roiScoredEdits.length ? (
                      roiScoredEdits.map((edit) => {
                        const selected = roiSelection?.selected.some((item) => item.segmentId === edit.segmentId && item.type === edit.type);
                        return (
                          <div key={`${edit.segmentId}-${edit.type}`} className="rounded-lg border border-line/60 bg-black/20 px-3 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Pill tone={selected ? "good" : edit.roiScore <= 0 ? "warn" : "accent"}>{edit.type}</Pill>
                              <Pill>{edit.segmentId}</Pill>
                              <Pill>{`sim +${edit.expectedSimilarityGain.toFixed(1)}`}</Pill>
                              <Pill>{`nat +${edit.expectedNaturalnessGain.toFixed(1)}`}</Pill>
                              <Pill>{`risk ${edit.riskPenalty.toFixed(1)}`}</Pill>
                              <Pill>{`cost ${edit.budgetCost.toFixed(1)}`}</Pill>
                              <Pill>{`roi ${edit.roiScore.toFixed(1)}`}</Pill>
                              <Pill>{selected ? "selected" : "rejected"}</Pill>
                            </div>
                            <div className="mt-2 leading-6 text-text">{edit.rationale}</div>
                            <div className="mt-1 text-[11px] leading-5 text-muted">
                              {selected
                                ? explainWhyThisEditWasChosen(reviewCase?.id ?? "", edit.segmentId)
                                : explainWhyThisSafeEditWasRejected(reviewCase?.id ?? "", edit.segmentId) ?? "Rejected by ROI budget selector."}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-lg border border-line/60 bg-black/20 px-3 py-2 leading-6 text-text">未检测到值得做的 ROI micro-edit。</div>
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-line/70 bg-white/[0.03] p-3 text-xs text-muted">
                  <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-muted">Selected vs Rejected</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={roiSelection?.selected.length ? "good" : "warn"}>{`selected ${roiSelection?.selected.length ?? 0}`}</Pill>
                    <Pill>{`rejected ${roiSelection?.rejected.length ?? 0}`}</Pill>
                    <Pill>{`budget used ${roiSelection?.budgetUsed ?? 0}`}</Pill>
                  </div>
                  <div className="mt-2 leading-6 text-text">
                    {roiSelection?.selected.length
                      ? roiSelection.selected.map((edit) => `${edit.type}@${edit.segmentId}`).join(" | ")
                      : explainWhyNoMicroEditWasApplied(reviewCase?.id ?? "") ?? "No micro edits selected for this case."}
                  </div>
                  {roiSelection?.rejected.length ? (
                    <div className="mt-2 text-[11px] leading-5 text-muted">
                      Rejected: {roiSelection.rejected.map((edit) => `${edit.type}@${edit.segmentId} (roi ${edit.roiScore.toFixed(1)})`).join(" | ")}
                    </div>
                  ) : null}
                </div>
                <div className="rounded-xl border border-line/70 bg-white/[0.03] p-3 text-xs text-muted">
                  <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-muted">Applied Edits</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={roiMicroEditContext?.microEditResult?.applied ? "good" : "warn"}>{roiMicroEditContext?.microEditResult?.applied ? "applied" : "not applied"}</Pill>
                    <Pill>{`estimated +${roiMicroEditContext?.microEditResult?.gainEstimated ?? 0}`}</Pill>
                    <Pill>{`actual ${roiMicroEditContext?.microEditResult?.gainActual?.toFixed(1) ?? "0.0"}`}</Pill>
                  </div>
                  <div className="mt-2 leading-6 text-text">{roiMicroEditContext?.microEditedResponse ?? "No micro-edit response available."}</div>
                  {roiMicroEditRegression ? (
                    <div className="mt-2 rounded-lg border border-line/60 bg-black/20 px-3 py-2 leading-6 text-text">
                      Before: {roiMicroEditRegression.rawCalibratedResponse ?? "n/a"} · After: {roiMicroEditRegression.microEditedResponse ?? "n/a"}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <Textarea
              value={proxyReviewFeedbackDraft}
              onChange={(event) => setProxyReviewFeedbackDraft(event.target.value)}
              className="min-h-[120px]"
              placeholder="Write feedback back into the training loop..."
            />
            <div className="flex flex-wrap gap-3">
              <PrimaryButton onClick={writeBack}>回写 Feedback</PrimaryButton>
              <SecondaryButton onClick={clearCalibration}>清除 Calibration</SecondaryButton>
              <SecondaryButton onClick={() => setProxyReviewFeedbackDraft(reviewCase?.note ?? "Ready to review current proxy behavior.")}>重置 Note</SecondaryButton>
            </div>
            <div className="text-xs text-muted">
              {reviewCase?.reviewStatus === "written_back"
                ? "Feedback has been written back, review signals have been applied, and calibration state is persisted when the guard allows it."
                : "Feedback is waiting to be written back."}
            </div>
          </div>
        </Panel>

        <Panel title="Case Context" subtitle="已选 model 与 template 的上下文">
          <div className="space-y-3">
            <InfoRow label="Model Version" value={reviewCase?.modelVersion ?? modelVersion} />
            <InfoRow label="Student Template" value={reviewCase?.studentTemplateName ?? studentTemplateId} />
            <InfoRow label="Scenario" value={reviewCase?.scenario ?? scenario} />
            <InfoRow label="Fixture Family" value={reviewCase?.fixtureFamily ?? "review"} />
            <InfoRow label="Risk Type" value={reviewCase?.riskType ?? "n/a"} />
            <InfoRow label="Expected Direction" value={reviewCase?.expectedTeacherDirection ?? "n/a"} />
            <InfoRow label="Failure" value={reviewCase?.shortFailureDescription ?? "n/a"} />
            <InfoRow label="Student Profile" value={studentProfile ? [studentProfile.name, studentProfile.defaultAttitude, studentProfile.defaultConfidence, studentProfile.defaultEmotion].filter(Boolean).join(" · ") : "unknown"} />
            <InfoRow label="Selected Session Count" value={String(sessions.length)} />
            <InfoRow label="Forced Downgrade" value={forcedDowngrade ? "yes" : "no"} />
            <InfoRow label="Residual Pressure" value={reviewMemorySummary.join(" · ")} />
            <InfoRow label="Contradictions" value={String(generatedContradictions.length)} />
            <InfoRow label="Spawned Hypotheses" value={String(spawnedHypotheses.length)} />
            <InfoRow label="Replacement Records" value={String(replacementRecords.length)} />
            <InfoRow label="Affected Rules" value={affectedRules.length ? String(affectedRules.length) : "0"} />
            <InfoRow label="Decay Records" value={String(ruleDecayRecords.length)} />
            <div className="rounded-2xl border border-line bg-black/20 p-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-muted">Review History</div>
              <div className="mt-3 space-y-2 text-sm">
                <div>status: {reviewHistory.status}</div>
                <div>label: {reviewHistory.label}</div>
                <div>written back: {reviewHistory.writtenBack ? "yes" : "no"}</div>
                <div>updated: {reviewHistory.updatedAt ? reviewHistory.updatedAt.slice(0, 19).replace("T", " ") : "-"}</div>
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-black/20 p-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-muted">Proxy State</div>
              <p className="mt-2 text-sm leading-6 text-text">
                The proxy review lab is designed to reveal where the model is too soft, too direct, too generic, or ignores decision boundaries.
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-black/20 p-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-muted">Temporal Effects</div>
              <div className="mt-3 space-y-2">
                {reviewPerformanceRecords.length ? (
                  reviewPerformanceRecords.slice(0, 6).map((record) => {
                    const temporal = temporalByRule.get(record.ruleId);
                    const rule = rules.find((item) => item.id === record.ruleId);
                    return (
                      <div key={record.id} className="rounded-xl border border-line/70 bg-white/[0.03] px-3 py-2 text-xs text-muted">
                        <div className="flex flex-wrap items-center gap-2">
                          <Pill tone={record.outcome === "win" ? "good" : record.outcome === "loss" ? "bad" : record.outcome === "challenge" ? "warn" : "default"}>
                            {record.outcome}
                          </Pill>
                          <Pill>{rule?.layer ?? "layer"}</Pill>
                          {temporal ? <Pill>{temporal.trend}</Pill> : null}
                        </div>
                        <div className="mt-1 text-text">{rule?.text ?? record.ruleId}</div>
                        <div className="mt-1">
                          momentum {temporal ? temporal.momentumScore.toFixed(1) : "0.0"} · recent win {temporal ? `${Math.round(temporal.recentWinRate * 100)}%` : "0%"}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-xs text-muted">暂无 temporal effects。</div>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-black/20 p-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-muted">Ecology Effects</div>
              <div className="mt-3 space-y-2">
                {ecologyEffects.length ? (
                  ecologyEffects.map((effect) => (
                    <div key={`${effect.application.id}-${effect.ruleId}`} className="rounded-xl border border-line/70 bg-white/[0.03] px-3 py-2 text-xs text-muted">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone={effect.application.didForceDowngrade ? "warn" : "accent"}>{effect.application.didForceDowngrade ? "forced" : "signal"}</Pill>
                        <Pill>{effect.ecology?.ecologyStatus ?? "ecology"}</Pill>
                        {effect.groupEcology ? <Pill>{effect.groupEcology.stabilityClass}</Pill> : null}
                        {effect.groupEcology ? <Pill>{`Risk ${effect.groupEcology.replacementRisk.toFixed(1)}`}</Pill> : null}
                        {effect.ecology?.isIncumbent ? <Pill tone="good">incumbent</Pill> : null}
                        {effect.ecology?.isCurrentLeader ? <Pill tone="accent">leader</Pill> : null}
                        {effect.groupEcology ? <Pill>{`Mem ${Math.round(effect.groupEcology.pressureMemory)}`}</Pill> : null}
                        {effect.groupEcology ? <Pill>{`Mode ${effect.groupEcology.recoveryMode}`}</Pill> : null}
                      </div>
                      <div className="mt-1 text-text">{effect.ruleText}</div>
                      <div className="mt-1">
                        effective pressure {effect.ecology?.effectivePressure.toFixed(1) ?? "0.0"} · resistance {effect.ecology?.resistanceScore.toFixed(1) ?? "0.0"} · dominance {effect.ecology?.dominanceSpan ?? 0} · risk {effect.ecology?.replacementRisk.toFixed(1) ?? "0.0"}
                      </div>
                      {effect.groupEcology ? (
                        <>
                          <div className="mt-1">
                            incumbent {effect.groupEcology.incumbentRuleId ?? "none"} · leader {effect.groupEcology.currentLeaderRuleId ?? "none"} · turnover {effect.groupEcology.turnoverCounter} · lock {effect.groupEcology.lockStatus}
                          </div>
                          <div className="mt-1">
                            recovery {effect.groupEcology.recoveryMode} · progress {(effect.groupEcology.recoveryProgress * 100).toFixed(0)}% · residual pressure {effect.groupEcology.pressureMemory.toFixed(1)}
                          </div>
                        </>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-muted">暂无 ecology effects。</div>
                )}
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ProxyReviewSkeleton() {
  return (
    <div className="space-y-6">
      <SectionTitle
        kicker="Proxy Lab"
        title="Proxy Review"
        subtitle="正在加载 comparison workspace..."
        right={<Pill tone="accent">Hydrating</Pill>}
      />
      <Panel title="Workspace" subtitle="等待 client state 挂载">
        <div className="h-[520px] rounded-2xl border border-dashed border-line bg-black/20" />
      </Panel>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-muted">{label}</div>
      {children}
    </div>
  );
}

function ResponseCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="mb-4 rounded-2xl border border-line bg-black/20 p-4">
      <div className="text-[11px] uppercase tracking-[0.24em] text-muted">{title}</div>
      <p className="mt-3 text-sm leading-6 text-text">{text}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-black/20 p-4">
      <div className="text-[11px] uppercase tracking-[0.24em] text-muted">{label}</div>
      <div className="mt-2 text-sm font-medium text-text">{value}</div>
    </div>
  );
}
