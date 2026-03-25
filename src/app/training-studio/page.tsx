"use client";

import { useEffect, useMemo, useState } from "react";
import { ClientOnly } from "@/components/client-only";
import { Panel, Pill, PrimaryButton, SecondaryButton, SectionTitle, Select, Textarea } from "@/components/ui";
import { extractSessionInsightsV2 } from "@/lib/extractor-v2";
import { useCopymeStore } from "@/store/use-copyme-store";

export default function TrainingStudioPage() {
  return (
    <ClientOnly fallback={<TrainingStudioSkeleton />}>
      <TrainingStudioPageContent />
    </ClientOnly>
  );
}

function TrainingStudioPageContent() {
  const studentTemplates = useCopymeStore((state) => state.studentTemplates);
  const currentStudentConfig = useCopymeStore((state) => state.currentStudentConfig);
  const activeSimulatedStudentProfile = useCopymeStore((state) => state.activeSimulatedStudentProfile);
  const rules = useCopymeStore((state) => state.rules);
  const hypothesisRules = useCopymeStore((state) => state.hypothesisRules);
  const ruleCompetitionStats = useCopymeStore((state) => state.ruleCompetitionStats);
  const ruleTemporalStats = useCopymeStore((state) => state.ruleTemporalStats);
  const ruleEcologyStats = useCopymeStore((state) => state.ruleEcologyStats);
  const competitionGroupEcology = useCopymeStore((state) => state.competitionGroupEcology);
  const ruleContradictions = useCopymeStore((state) => state.ruleContradictions);
  const ruleDecayRecords = useCopymeStore((state) => state.ruleDecayRecords);
  const sessions = useCopymeStore((state) => state.sessions);
  const selectedStudentTemplateId = useCopymeStore((state) => state.selectedStudentTemplateId ?? state.studentTemplates[0]?.id);
  const draft = useCopymeStore((state) => state.trainingDraft);
  const setTrainingDraft = useCopymeStore((state) => state.setTrainingDraft);
  const selectStudentTemplate = useCopymeStore((state) => state.selectStudentTemplate);
  const updateCurrentStudentConfig = useCopymeStore((state) => state.updateCurrentStudentConfig);
  const startSession = useCopymeStore((state) => state.startSession);
  const appendTeacherTurn = useCopymeStore((state) => state.appendTeacherTurn);
  const completeSession = useCopymeStore((state) => state.completeSession);
  const selectSession = useCopymeStore((state) => state.selectSession);
  const resetMockState = useCopymeStore((state) => state.resetMockState);
  const acceptRule = useCopymeStore((state) => state.acceptRule);
  const rejectRule = useCopymeStore((state) => state.rejectRule);

  const activeSessionId = useCopymeStore((state) => state.activeSessionId);
  const selectedSessionId = useCopymeStore((state) => state.selectedSessionId);
  const sessionRuleJudgments = useCopymeStore((state) => state.sessionRuleJudgments);
  const reviewSignals = useCopymeStore((state) => state.reviewSignals);
  const activeSession = useMemo(() => sessions.find((item) => item.id === activeSessionId), [activeSessionId, sessions]);
  const selectedSession = useMemo(() => sessions.find((item) => item.id === selectedSessionId), [selectedSessionId, sessions]);
  const currentSession = activeSession ?? selectedSession ?? sessions[0];
  const controlTemplate = useMemo(
    () => studentTemplates.find((item) => item.id === (currentStudentConfig.templateId ?? selectedStudentTemplateId)) ?? studentTemplates[0],
    [currentStudentConfig.templateId, selectedStudentTemplateId, studentTemplates]
  );
  const previewProfile = useMemo(
    () => activeSimulatedStudentProfile ?? currentSession?.simulatedStudentProfile ?? undefined,
    [activeSimulatedStudentProfile, currentSession]
  );
  const liveSessionProfile = useMemo(() => currentSession?.simulatedStudentProfile ?? previewProfile, [currentSession, previewProfile]);
  const [focusTurnId, setFocusTurnId] = useState<string | undefined>(currentSession?.transcript[0]?.id);
  const [saveMessage, setSaveMessage] = useState("Ready");

  const extractorResult = useMemo(() => {
    if (!currentSession || !liveSessionProfile) return null;
    return extractSessionInsightsV2({
      session: currentSession,
      profile: liveSessionProfile,
      sessionRuleJudgments: sessionRuleJudgments.filter((judgment) => judgment.sessionId === currentSession.id),
      reviewSignals,
      rules
    });
  }, [currentSession, reviewSignals, rules, sessionRuleJudgments, liveSessionProfile]);

  const sessionTurns = currentSession?.transcript ?? [];
  const currentJudgments = useMemo(
    () => sessionRuleJudgments.filter((judgment) => judgment.sessionId === currentSession?.id),
    [currentSession?.id, sessionRuleJudgments]
  );
  const currentSessionContradictions = useMemo(
    () => ruleContradictions.filter((contradiction) => contradiction.relatedSessionId === currentSession?.id),
    [currentSession?.id, ruleContradictions]
  );
  const currentSessionDecayRecords = useMemo(
    () =>
      ruleDecayRecords.filter(
        (record) => currentJudgments.some((judgment) => judgment.ruleId === record.ruleId) || currentSession?.candidateRuleIds.includes(record.ruleId)
      ),
    [currentJudgments, currentSession?.candidateRuleIds, ruleDecayRecords]
  );
  const ecologyByRule = useMemo(() => new Map(ruleEcologyStats.map((stats) => [stats.ruleId, stats])), [ruleEcologyStats]);
  const ecologyGroupById = useMemo(() => new Map(competitionGroupEcology.map((item) => [item.competitionGroupId, item])), [competitionGroupEcology]);
  const currentEmergingHypotheses = useMemo(
    () =>
      hypothesisRules.filter(
        (hypothesis) =>
          hypothesis.status !== "rejected" &&
          hypothesis.status !== "replaced" &&
          (hypothesis.sourceSessionIds.includes(currentSession?.id ?? "") ||
            hypothesis.evidenceTurnIds.some((turnId) => sessionTurns.some((turn) => turn.id === turnId)) ||
            hypothesis.competingRuleIds.some((ruleId) => currentJudgments.some((judgment) => judgment.ruleId === ruleId)))
      ),
    [currentJudgments, currentSession?.id, hypothesisRules, sessionTurns]
  );
  const currentRiskRules = useMemo(() => {
    return ruleCompetitionStats
      .map((stats) => {
        const rule = rules.find((item) => item.id === stats.ruleId);
        const ecology = ecologyByRule.get(stats.ruleId);
        const groupEcology = rule?.competitionGroupId ? ecologyGroupById.get(rule.competitionGroupId) : undefined;
        return { stats, rule, ecology, groupEcology };
      })
      .filter(({ rule, stats, ecology, groupEcology }) => {
        if (!rule) return false;
        return (
          rule.status !== "rejected" &&
          (stats.contradictionScore >= 1 ||
            stats.survivabilityScore <= 45 ||
            stats.netScore <= 0.8 ||
            (groupEcology?.replacementRisk ?? 0) >= 45 ||
            (ecology?.effectivePressure ?? ecology?.challengePressure ?? 0) >= 24 ||
            (groupEcology?.stabilityClass ?? "stable") === "pressured")
        );
      })
      .sort((left, right) => (left.groupEcology?.replacementRisk ?? left.stats.survivabilityScore) - (right.groupEcology?.replacementRisk ?? right.stats.survivabilityScore))
      .slice(0, 4);
  }, [ecologyByRule, ecologyGroupById, ruleCompetitionStats, rules]);
  const temporalByRule = useMemo(() => new Map(ruleTemporalStats.map((stats) => [stats.ruleId, stats])), [ruleTemporalStats]);
  const dominantExplanations = useMemo(
    () =>
      [...rules, ...hypothesisRules]
        .filter((item) => {
          const ecology = ecologyByRule.get(item.id);
          return ecology?.ecologyStatus === "dominant" || (ecology?.dominanceSpan ?? 0) >= 3;
        })
        .slice(0, 4),
    [ecologyByRule, hypothesisRules, rules]
  );
  const pressuredWinners = useMemo(
    () =>
      [...rules, ...hypothesisRules]
        .filter((item) => {
          const ecology = ecologyByRule.get(item.id);
          const groupEcology = item.competitionGroupId ? ecologyGroupById.get(item.competitionGroupId) : undefined;
          return (
            (ecology?.isIncumbent || ecology?.isCurrentLeader || groupEcology?.incumbentRuleId === item.id) &&
            ((ecology?.ecologyStatus === "fragile") || groupEcology?.stabilityClass === "pressured" || (ecology?.effectivePressure ?? 0) >= 24)
          );
        })
        .slice(0, 4),
    [ecologyByRule, ecologyGroupById, hypothesisRules, rules]
  );
  const incumbentExplanations = useMemo(
    () =>
      [...rules, ...hypothesisRules]
        .filter((item) => ecologyByRule.get(item.id)?.isIncumbent)
        .slice(0, 4),
    [ecologyByRule, hypothesisRules, rules]
  );
  const risingChallengers = useMemo(
    () =>
      competitionGroupEcology
        .filter((item) => item.stabilityClass === "contested" || item.replacementRisk >= 45)
        .slice(0, 4),
    [competitionGroupEcology]
  );
  const risingExplanations = useMemo(
    () =>
      [...rules, ...hypothesisRules]
        .filter((item) => {
          const temporal = temporalByRule.get(item.id);
          return temporal && (temporal.trend === "rising" || temporal.trend === "stable") && temporal.momentumScore >= 0.6;
        })
        .slice(0, 4),
    [hypothesisRules, rules, temporalByRule]
  );
  const memoryComposition = useMemo(() => {
    const activeGroupEcology = currentRiskRules[0]?.groupEcology ?? competitionGroupEcology.find((item) => item.stabilityClass !== "stable");
    const challengerPressure = currentJudgments.filter((judgment) => judgment.status === "rejected").length * 4 + currentRiskRules.length * 1.5;
    const contradictionShock = currentSessionContradictions.length * 5 + (extractorResult?.temporaryDecisionNotes.length ?? 0) * 0.6;
    const reviewShock = reviewSignals.filter((signal) => signal.status === "applied" && signal.targetLayer !== "style").length * 2.5;
    const turnoverStress = currentSessionDecayRecords.filter((record) => record.decayPath === "displacement").length * 6 + currentSessionDecayRecords.length * 1.5;
    const total = challengerPressure + contradictionShock + reviewShock + turnoverStress;
    const recoveryMode = activeGroupEcology?.recoveryMode ?? "stabilized";
    return {
      total,
      recoveryMode,
      summary: `Chal ${Math.round(challengerPressure)} / Con ${Math.round(contradictionShock)} / Rev ${Math.round(reviewShock)} / Turn ${Math.round(turnoverStress)}`,
      reasons: [
        currentSessionContradictions.length ? `${currentSessionContradictions.length} contradiction shock(s)` : undefined,
        currentSessionDecayRecords.length ? `${currentSessionDecayRecords.length} decay event(s)` : undefined,
        reviewShock > 0 ? "external correction shock" : undefined,
        challengerPressure > 0 ? "challenger pressure residue" : undefined
      ].filter(Boolean) as string[]
    };
  }, [competitionGroupEcology, currentJudgments, currentRiskRules, currentSessionContradictions, currentSessionDecayRecords, extractorResult?.temporaryDecisionNotes.length, reviewSignals]);
  const fadingExplanations = useMemo(
    () =>
      [...rules, ...hypothesisRules]
        .filter((item) => {
          const temporal = temporalByRule.get(item.id);
          return temporal && (temporal.trend === "fading" || temporal.trend === "volatile") && temporal.decayAdjustedScore <= 45;
        })
        .slice(0, 4),
    [hypothesisRules, rules, temporalByRule]
  );
  const contradictionSeeds = useMemo(() => {
    return (extractorResult?.behaviorPatterns ?? [])
      .map((pattern) => ({
        pattern: pattern.label,
        note: pattern.note,
        severity: pattern.strength >= 0.9 ? "high" : pattern.strength >= 0.8 ? "medium" : "low"
      }))
      .slice(0, 4);
  }, [extractorResult?.behaviorPatterns]);

  useEffect(() => {
    setFocusTurnId(currentSession?.transcript[0]?.id);
  }, [currentSession?.id]);

  function handleTemplateChange(templateId: string) {
    selectStudentTemplate(templateId);
    setSaveMessage(`Selected template: ${studentTemplates.find((item) => item.id === templateId)?.name ?? templateId}`);
  }

  function handleStartSession() {
    startSession(currentStudentConfig.templateId ?? selectedStudentTemplateId);
    setSaveMessage("Session started");
  }

  function handleSendMessage() {
    if (!currentSession || !draft.trim()) return;
    appendTeacherTurn(currentSession.id, draft.trim());
    setSaveMessage("Live turn appended");
    setTrainingDraft("");
  }

  function handleCompleteSession() {
    if (!currentSession) return;
    completeSession(currentSession.id);
    setSaveMessage("Session completed");
  }

  function handleResetStudent() {
    const defaultTemplate = studentTemplates[0];
    selectStudentTemplate(defaultTemplate.id);
    setTrainingDraft("");
    setSaveMessage("Student reset to default template");
  }

  function handleResetMockState() {
    resetMockState();
    setSaveMessage("Mock state reset");
  }

  function handleMarkLikeMe() {
    const ruleId = currentJudgments[0]?.ruleId ?? currentSession?.candidateRuleIds[0];
    if (!ruleId || !currentSession) return;
    acceptRule(ruleId, currentSession.id);
    setSaveMessage(`Accepted ${ruleId}`);
  }

  function handleMarkNotLikeMe() {
    const ruleId = currentJudgments[0]?.ruleId ?? currentSession?.candidateRuleIds[0];
    if (!ruleId || !currentSession) return;
    rejectRule(ruleId, currentSession.id);
    setSaveMessage(`Rejected ${ruleId}`);
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        kicker="核心工作区"
        title="Training Studio"
        subtitle="用于实时 teacher-student interaction、persona observation 和 session timeline inspection 的桌面实验控制台。"
        right={<Pill tone="good">{currentSession?.status ?? "无 session"}</Pill>}
      />

      <Panel className="border-accent/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-muted">当前 Student Snapshot</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {[previewProfile?.summary, previewProfile?.responseStyle, previewProfile?.hesitationStyle].filter(Boolean).map((item) => (
                <Pill key={item as string}>{item as string}</Pill>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {previewProfile?.likelyMistakeModes?.map((item) => (
                <Pill key={item}>{item}</Pill>
              ))}
            </div>
            <div className="mt-3 text-xs text-muted">
              Face-saving tendency {Math.round((previewProfile?.faceSavingTendency ?? 0) * 100)}% · challenge tendency{" "}
              {Math.round((previewProfile?.challengeTendency ?? 0) * 100)}%
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-[0.28em] text-muted">当前 Round</div>
            <div className="mt-2 text-2xl font-semibold">Round {currentSession?.roundCount ?? 0}</div>
            <div className="mt-1 text-xs text-muted">{saveMessage}</div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <Panel title="Student Control Panel" subtitle="为 simulated learner 设定参数" className="h-full">
          <div className="space-y-4">
            <ControlField label="Student Template">
              <Select value={currentStudentConfig.templateId ?? selectedStudentTemplateId} onChange={(event) => handleTemplateChange(event.target.value)}>
                {studentTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </Select>
            </ControlField>
            <ControlField label="English Level">
              <Select value={currentStudentConfig.level} onChange={(event) => updateCurrentStudentConfig({ level: event.target.value as typeof currentStudentConfig.level })}>
                <option value="beginner">初级 Beginner</option>
                <option value="intermediate">中级 Intermediate</option>
                <option value="advanced">高级 Advanced</option>
              </Select>
            </ControlField>
            <ControlField label="Attitude">
              <Select
                value={currentStudentConfig.attitude}
                onChange={(event) => updateCurrentStudentConfig({ attitude: event.target.value as typeof currentStudentConfig.attitude })}
              >
                <option value="shy">害羞 Shy</option>
                <option value="smart-but-lazy">聪明但懒 Smart but lazy</option>
                <option value="anxious">焦虑 Anxious</option>
                <option value="argumentative">好辩 Argumentative</option>
              </Select>
            </ControlField>
            <ControlField label="Confidence">
              <Select
                value={currentStudentConfig.confidence}
                onChange={(event) => updateCurrentStudentConfig({ confidence: event.target.value as typeof currentStudentConfig.confidence })}
              >
                <option value="low">低 Low</option>
                <option value="medium">中 Medium</option>
                <option value="high">高 High</option>
              </Select>
            </ControlField>
            <ControlField label="Emotion">
              <Select value={currentStudentConfig.emotion} onChange={(event) => updateCurrentStudentConfig({ emotion: event.target.value as typeof currentStudentConfig.emotion })}>
                <option value="calm">平静 Calm</option>
                <option value="anxious">焦虑 Anxious</option>
                <option value="resistant">抗拒 Resistant</option>
                <option value="self-conscious">不自在 Self-conscious</option>
                <option value="confident">自信 Confident</option>
              </Select>
            </ControlField>
            <ControlField label="Error Pattern">
              <Select
                value={currentStudentConfig.errorPattern}
                onChange={(event) => updateCurrentStudentConfig({ errorPattern: event.target.value as typeof currentStudentConfig.errorPattern })}
              >
                <option value="grammar">Grammar 语法</option>
                <option value="pronunciation">Pronunciation 发音</option>
                <option value="vocabulary">Vocabulary 词汇</option>
                <option value="meaning">Meaning 语义</option>
                <option value="organization">Organization 结构</option>
              </Select>
            </ControlField>
            <ControlField label="Scenario Goal">
              <Select
                value={currentStudentConfig.scenarioGoal}
                onChange={(event) => updateCurrentStudentConfig({ scenarioGoal: event.target.value as typeof currentStudentConfig.scenarioGoal })}
              >
              <option value="daily talk">Daily talk 日常对话</option>
                <option value="interview">Interview 面试</option>
                <option value="opinion">Opinion 观点</option>
                <option value="storytelling">Storytelling 讲故事</option>
                <option value="debate">Debate 辩论</option>
              </Select>
            </ControlField>
            <div className="grid grid-cols-2 gap-3">
            <PrimaryButton onClick={handleStartSession}>开始 Session</PrimaryButton>
              <SecondaryButton onClick={handleResetStudent}>重置 Student</SecondaryButton>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SecondaryButton onClick={handleCompleteSession}>完成 Session</SecondaryButton>
              <SecondaryButton onClick={handleResetMockState}>重置 Mock State</SecondaryButton>
            </div>
            <SecondaryButton onClick={() => setSaveMessage(`已保存 ${controlTemplate.name} 的本地 template snapshot`)} className="w-full">
              保存为 Template
            </SecondaryButton>
            <div className="rounded-xl border border-line bg-black/25 p-3 text-xs leading-5 text-muted">
              {controlTemplate.summary}
            </div>
          </div>
        </Panel>

        <Panel title="Live Conversation Area" subtitle="带 turn tracking 和 simulated replies 的文本交互流" className="h-full">
          <div className="flex h-full min-h-[760px] flex-col">
            <div className="rounded-2xl border border-line bg-black/20 p-4">
              <div className="text-[11px] uppercase tracking-[0.28em] text-muted">Student Snapshot</div>
              <div className="mt-2 text-sm leading-6 text-text">{liveSessionProfile?.summary}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Pill tone="accent">{liveSessionProfile?.responseStyle}</Pill>
                <Pill tone="warn">{liveSessionProfile?.hesitationStyle}</Pill>
              </div>
            </div>

            <div className="mt-4 flex-1 space-y-3 overflow-auto pr-1">
              {sessionTurns.map((turn) => (
                <MessageBubble key={turn.id} turn={turn} focused={turn.id === (focusTurnId ?? sessionTurns[0]?.id)} onClick={() => setFocusTurnId(turn.id)} />
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-line bg-black/25 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] uppercase tracking-[0.24em] text-muted">Teacher Input</div>
                <button disabled className="rounded-full border border-line bg-white/5 px-3 py-1 text-xs text-muted">
                  Voice input 已禁用
                </button>
              </div>
              <Textarea
                value={draft}
                onChange={(event) => setTrainingDraft(event.target.value)}
                placeholder="输入你想测试的 teacher response..."
                className="mt-3 min-h-[96px]"
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-xs text-muted">提示：可以试 direct correction、reassurance 或 challenge，看看 simulated student 如何反应。</div>
                <PrimaryButton onClick={handleSendMessage}>发送</PrimaryButton>
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Persona Observation Panel" subtitle="临时 notes 与 candidate rule extraction" className="h-full">
          <div className="space-y-4">
            <ObservationBlock
              title="Detected Teaching Behaviors"
              items={extractorResult?.detectedTeachingBehaviors.length ? extractorResult.detectedTeachingBehaviors : ["等待 teacher input"]}
            />
            <ObservationBlock
              title="Behavior Patterns"
              items={
                extractorResult?.behaviorPatterns.length
                  ? extractorResult.behaviorPatterns.map((pattern) => `${pattern.label} · ${Math.round(pattern.strength * 100)}%`)
                  : ["暂无 behavior patterns"]
              }
            />
            <ObservationBlock
              title="Session Rule Judgments"
              items={
                currentJudgments.length
                  ? currentJudgments.map((judgment) => {
                      const rule = rules.find((item) => item.id === judgment.ruleId);
                      const globalStatus = rule?.status ?? "missing";
                      return `${rule?.text ?? judgment.ruleId} · session ${judgment.status} · global ${globalStatus}`;
                    })
                  : ["暂无 session judgments"]
              }
            />
            <ObservationBlock
              title="Candidate Rule Seeds"
              items={
                extractorResult?.candidateRuleSeeds.length
                  ? extractorResult.candidateRuleSeeds.map((seed) => `${seed.text} · ${seed.behaviorPatternId}`)
                  : ["暂无 candidate seeds"]
              }
            />
            <ObservationBlock
              title="Current Risk to Existing Rules"
              items={
                currentRiskRules.length
                  ? currentRiskRules.map(({ rule, stats, ecology, groupEcology }) =>
                      `${rule?.text ?? stats.ruleId} · survival ${Math.round(stats.survivabilityScore)} · net ${stats.netScore.toFixed(1)} · pressure ${(ecology?.effectivePressure ?? 0).toFixed(1)} · risk ${(groupEcology?.replacementRisk ?? ecology?.replacementRisk ?? 0).toFixed(1)}`
                    )
                  : ["未检测到高风险 rules"]
              }
            />
            <ObservationBlock
              title="Incumbent Explanations"
              items={
                incumbentExplanations.length
                  ? incumbentExplanations.map((item) => {
                      const ecology = ecologyByRule.get(item.id);
                      const groupEcology = item.competitionGroupId ? ecologyGroupById.get(item.competitionGroupId) : undefined;
                      return `${"topicKey" in item ? item.topicKey : item.layer} · dom ${ecology?.dominanceSpan ?? 0} · lock ${groupEcology?.lockStatus ?? "unlocked"} · pressure ${ecology?.effectivePressure.toFixed(1) ?? "0.0"}`;
                    })
                  : ["暂无 incumbent"]
              }
            />
            <ObservationBlock
              title="Dominant Explanations"
              items={
                dominantExplanations.length
                  ? dominantExplanations.map((item) => {
                      const ecology = ecologyByRule.get(item.id);
                      return `${"topicKey" in item ? item.topicKey : item.layer} · ${ecology?.ecologyStatus ?? "dominant"} · dom ${ecology?.dominanceSpan ?? 0} · res ${ecology?.resilienceScore.toFixed(1) ?? "0.0"}`;
                    })
                  : ["暂无 dominant explanations"]
              }
            />
            <ObservationBlock
              title="Pressured Winners"
              items={
                pressuredWinners.length
                  ? pressuredWinners.map((item) => {
                      const ecology = ecologyByRule.get(item.id);
                      const groupEcology = item.competitionGroupId ? ecologyGroupById.get(item.competitionGroupId) : undefined;
                      return `${"topicKey" in item ? item.topicKey : item.layer} · ${groupEcology?.stabilityClass ?? ecology?.ecologyStatus ?? "pressured"} · risk ${groupEcology?.replacementRisk.toFixed(1) ?? ecology?.replacementRisk.toFixed(1) ?? "0.0"} · lock ${groupEcology?.lockStatus ?? "unlocked"}`;
                    })
                  : ["暂无 pressured winners"]
              }
            />
            <ObservationBlock
              title="Rising Challengers"
              items={
                risingChallengers.length
                  ? risingChallengers.map((groupEcology) => `${groupEcology.competitionGroupId} · ${groupEcology.stabilityClass} · incumbent ${groupEcology.incumbentRuleId ?? "none"} · leader ${groupEcology.currentLeaderRuleId ?? "none"} · risk ${groupEcology.replacementRisk.toFixed(1)}`)
                  : ["暂无 rising challengers"]
              }
            />
            <ObservationBlock
              title="Possible Contradiction Seeds"
              items={
                contradictionSeeds.length
                  ? contradictionSeeds.map((item) => `${item.pattern} · ${item.severity} · ${item.note}`)
                  : ["暂无 contradiction seeds"]
              }
            />
            <ObservationBlock
              title="Emerging Explanations"
              items={
                currentEmergingHypotheses.length
                  ? currentEmergingHypotheses.map((hypothesis) => `${hypothesis.topicKey} · ${hypothesis.status} · ${hypothesis.text}`)
                  : ["暂无 emerging explanations"]
              }
            />
            <ObservationBlock
              title="Rising Explanations"
              items={
                risingExplanations.length
                  ? risingExplanations.map((item) => {
                      const temporal = temporalByRule.get(item.id);
                      return `${"topicKey" in item ? item.topicKey : item.layer} · ${temporal?.trend ?? "stable"} · momentum ${temporal?.momentumScore.toFixed(1) ?? "0.0"}`;
                    })
                  : ["暂无 rising explanations"]
              }
            />
            <ObservationBlock
              title="Memory Composition"
              items={memoryComposition.total > 0 ? [memoryComposition.summary] : ["暂无 residual memory"]}
            />
            <ObservationBlock
              title="Recovery Mode"
              items={[`${memoryComposition.recoveryMode}${memoryComposition.total > 0 ? " · recovering" : " · stable"}`]}
            />
            <ObservationBlock
              title="Delayed Recovery Reasons"
              items={memoryComposition.reasons.length ? memoryComposition.reasons : ["暂无 delayed recovery reasons"]}
            />
            <ObservationBlock
              title="Fading Explanations"
              items={
                fadingExplanations.length
                  ? fadingExplanations.map((item) => {
                      const temporal = temporalByRule.get(item.id);
                      return `${"topicKey" in item ? item.topicKey : item.layer} · ${temporal?.trend ?? "fading"} · decay ${temporal?.decayAdjustedScore.toFixed(1) ?? "0.0"}`;
                    })
                  : ["暂无 fading explanations"]
              }
            />
            <ObservationBlock
              title="Current Contradictions"
              items={
                currentSessionContradictions.length
                  ? currentSessionContradictions.map((item) => `${item.contradictionType} · ${item.severity} · ${item.summary}`)
                  : ["该 session 暂无 contradictions"]
              }
            />
            <ObservationBlock
              title="Decay Events"
              items={
                currentSessionDecayRecords.length
                  ? currentSessionDecayRecords.map((record) => `${record.reason} · ${record.severity} · ${record.scoreImpact.toFixed(1)}`)
                  : ["暂无 decay events"]
              }
            />
            <ObservationBlock
              title="Temporary Decision Notes"
              items={extractorResult?.temporaryDecisionNotes.length ? extractorResult.temporaryDecisionNotes : ["暂无 decision notes"]}
            />
            <div className="grid grid-cols-2 gap-3">
              <SecondaryButton className="w-full" onClick={handleMarkLikeMe}>
                标记为 Like Me
              </SecondaryButton>
              <SecondaryButton className="w-full" onClick={handleMarkNotLikeMe}>
                标记为 Not Like Me
              </SecondaryButton>
            </div>
            <div className="rounded-2xl border border-line bg-black/20 p-4 text-xs leading-5 text-muted">
              {extractorResult?.candidateRuleSeeds.length
                ? `Extractor 从当前 session 中提取了 ${extractorResult.candidateRuleSeeds.length} 个 candidate rule seed(s)。`
                : "Training state 会保存在浏览器本地。刷新页面后可恢复当前 session。"}
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Session Timeline" subtitle="点击节点可跳转到对应 turn">
        <div className="flex flex-wrap gap-2">
          {sessionTurns.map((turn, index) => (
            <button
              key={turn.id}
              onClick={() => setFocusTurnId(turn.id)}
              className={`min-w-[150px] rounded-xl border px-3 py-2 text-left transition ${
                turn.id === focusTurnId ? "border-accent/40 bg-accent/12" : "border-line bg-black/20 hover:bg-white/[0.06]"
              }`}
            >
              <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-muted">
                <span>Turn {index + 1}</span>
                {turn.highlighted ? <span className="text-warn">Key</span> : null}
              </div>
              <div className="mt-1 text-sm font-medium">{turn.speaker}</div>
              <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{turn.text}</div>
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function TrainingStudioSkeleton() {
  return (
    <div className="space-y-6">
      <SectionTitle
        kicker="核心工作区"
        title="Training Studio"
        subtitle="正在加载 simulated session workspace..."
        right={<Pill tone="accent">Hydrating</Pill>}
      />
      <Panel title="Workspace" subtitle="等待 client state 挂载">
        <div className="h-[640px] rounded-2xl border border-dashed border-line bg-black/20" />
      </Panel>
    </div>
  );
}

function ControlField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-muted">{label}</div>
      {children}
    </div>
  );
}

function MessageBubble({ turn, focused, onClick }: { turn: { id: string; speaker: string; text: string; round: number; tags?: string[]; timestamp: string; highlighted?: boolean }; focused: boolean; onClick: () => void }) {
  const isTeacher = turn.speaker === "teacher";
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-2xl border p-4 text-left transition ${
        focused ? "border-accent/40 bg-accent/12" : "border-line bg-black/20 hover:bg-white/[0.05]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Pill tone={isTeacher ? "accent" : "good"}>{isTeacher ? "Teacher" : "Student"}</Pill>
          <span className="text-xs text-muted">Round {turn.round}</span>
        </div>
        <span className="text-[11px] uppercase tracking-[0.24em] text-muted">{turn.timestamp.slice(11, 16)}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-text">{turn.text}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {turn.tags?.map((tag) => (
          <Pill key={tag}>{tag}</Pill>
        ))}
      </div>
    </button>
  );
}

function ObservationBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-line bg-black/20 p-4">
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-3 space-y-2">
        {items.map((item, index) => (
          <div key={`${title}-${index}-${item}`} className="rounded-xl border border-line/70 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-muted">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
