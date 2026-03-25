"use client";

import { useEffect, useMemo, useState } from "react";
import { ClientOnly } from "@/components/client-only";
import { Panel, Pill, PrimaryButton, SecondaryButton, SectionTitle, Select } from "@/components/ui";
import { selectSessionRuleJudgments } from "@/lib/selectors";
import type {
  PersonaRule,
  RuleAggregateStats,
  RuleContradiction,
  RuleEvidence,
  RuleDecayRecord,
  RuleEcologyStats,
  RulePerformanceRecord,
  RuleTemporalStats,
  Session,
  SessionRuleJudgment
} from "@/lib/types";
import { useCopymeStore } from "@/store/use-copyme-store";

export default function SessionsPage() {
  return (
    <ClientOnly fallback={<SessionsSkeleton />}>
      <SessionsPageContent />
    </ClientOnly>
  );
}

function SessionsPageContent() {
  const sessions = useCopymeStore((state) => state.sessions);
  const rules = useCopymeStore((state) => state.rules);
  const hypothesisRules = useCopymeStore((state) => state.hypothesisRules);
  const ruleCompetitionGroups = useCopymeStore((state) => state.ruleCompetitionGroups);
  const ruleReplacementRecords = useCopymeStore((state) => state.ruleReplacementRecords);
  const sessionRuleJudgments = useCopymeStore((state) => state.sessionRuleJudgments);
  const ruleEvidences = useCopymeStore((state) => state.ruleEvidences);
  const ruleAggregateStats = useCopymeStore((state) => state.ruleAggregateStats);
  const rulePerformanceRecords = useCopymeStore((state) => state.rulePerformanceRecords);
  const ruleTemporalStats = useCopymeStore((state) => state.ruleTemporalStats);
  const ruleEcologyStats = useCopymeStore((state) => state.ruleEcologyStats);
  const competitionGroupEcology = useCopymeStore((state) => state.competitionGroupEcology);
  const ruleDecayRecords = useCopymeStore((state) => state.ruleDecayRecords);
  const ruleContradictions = useCopymeStore((state) => state.ruleContradictions);
  const selectedSessionId = useCopymeStore((state) => state.selectedSessionId);
  const sessionFilterStudentType = useCopymeStore((state) => state.sessionFilterStudentType);
  const sessionRuleStatusFilter = useCopymeStore((state) => state.sessionRuleStatusFilter);
  const setSessionFilterStudentType = useCopymeStore((state) => state.setSessionFilterStudentType);
  const setSessionRuleStatusFilter = useCopymeStore((state) => state.setSessionRuleStatusFilter);
  const selectSession = useCopymeStore((state) => state.selectSession);
  const acceptRule = useCopymeStore((state) => state.acceptRule);
  const rejectRule = useCopymeStore((state) => state.rejectRule);
  const observeRule = useCopymeStore((state) => state.observeRule);

  const [selectedJudgmentId, setSelectedJudgmentId] = useState<string | undefined>(undefined);

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      if (sessionFilterStudentType !== "all" && session.studentType.toLowerCase() !== sessionFilterStudentType) return false;
      return true;
    });
  }, [sessionFilterStudentType, sessions]);

  const visibleSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) ?? filteredSessions[0] ?? sessions[0],
    [filteredSessions, selectedSessionId, sessions]
  );

  const judgments = useMemo(() => {
    if (!visibleSession) return [];
    const sessionJudgments = selectSessionRuleJudgments({ sessionRuleJudgments }, visibleSession.id);
    if (sessionRuleStatusFilter === "all") return sessionJudgments;
    return sessionJudgments.filter((judgment) => judgment.status === sessionRuleStatusFilter);
  }, [sessionRuleJudgments, sessionRuleStatusFilter, visibleSession]);
  const sessionEvidences = useMemo(() => ruleEvidences.filter((evidence) => evidence.sessionId === visibleSession?.id), [ruleEvidences, visibleSession?.id]);
  const sessionPerformanceRecords = useMemo(
    () => rulePerformanceRecords.filter((record) => record.sessionId === visibleSession?.id),
    [rulePerformanceRecords, visibleSession?.id]
  );
  const temporalByRule = useMemo(() => new Map(ruleTemporalStats.map((stats) => [stats.ruleId, stats])), [ruleTemporalStats]);
  const ecologyByRule = useMemo(() => new Map(ruleEcologyStats.map((stats) => [stats.ruleId, stats])), [ruleEcologyStats]);
  const ecologyGroupById = useMemo(() => new Map(competitionGroupEcology.map((item) => [item.competitionGroupId, item])), [competitionGroupEcology]);
  const sessionStats = useMemo(
    () => ruleAggregateStats.filter((stats) => judgments.some((judgment) => judgment.ruleId === stats.ruleId)),
    [judgments, ruleAggregateStats]
  );
  const sessionContradictions = useMemo(
    () =>
      ruleContradictions.filter(
        (contradiction) => contradiction.relatedSessionId === visibleSession?.id || judgments.some((judgment) => judgment.ruleId === contradiction.ruleId)
      ),
    [judgments, ruleContradictions, visibleSession?.id]
  );
  const sessionHypotheses = useMemo(
    () =>
      hypothesisRules.filter(
        (hypothesis) =>
          hypothesis.sourceSessionIds.includes(visibleSession?.id ?? "") || judgments.some((judgment) => hypothesis.parentRuleIds.includes(judgment.ruleId))
      ),
    [hypothesisRules, judgments, visibleSession?.id]
  );
  const sessionCompetitionGroups = useMemo(
    () => ruleCompetitionGroups.filter((group) => group.ruleIds.some((id) => judgments.some((judgment) => judgment.ruleId === id) || sessionHypotheses.some((hypothesis) => hypothesis.id === id))),
    [judgments, ruleCompetitionGroups, sessionHypotheses]
  );
  const sessionReplacementRecords = useMemo(
    () =>
      ruleReplacementRecords.filter(
        (record) =>
          judgments.some((judgment) => judgment.ruleId === record.replacedRuleId || judgment.ruleId === record.replacementRuleId) ||
          sessionHypotheses.some((hypothesis) => hypothesis.id === record.replacementRuleId || hypothesis.replacedByRuleId === record.replacedRuleId)
      ),
    [judgments, ruleReplacementRecords, sessionHypotheses]
  );
  const sessionEcologyStats = useMemo(
    () => judgments.map((judgment) => ecologyByRule.get(judgment.ruleId)).filter((item): item is NonNullable<typeof item> => Boolean(item)),
    [ecologyByRule, judgments]
  );
  const sessionCompetitionEcology = useMemo(
    () =>
      sessionCompetitionGroups
        .map((group) => ecologyGroupById.get(group.id))
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    [ecologyGroupById, sessionCompetitionGroups]
  );
  const sessionDecayRecords = useMemo(
    () =>
      ruleDecayRecords.filter(
        (record) =>
          judgments.some((judgment) => judgment.ruleId === record.ruleId) || sessionHypotheses.some((hypothesis) => hypothesis.id === record.ruleId)
      ),
    [judgments, ruleDecayRecords, sessionHypotheses]
  );
  useEffect(() => {
    if (!visibleSession || judgments.length === 0) {
      if (selectedJudgmentId !== undefined) setSelectedJudgmentId(undefined);
      return;
    }

    const nextJudgmentId = judgments.some((judgment) => judgment.id === selectedJudgmentId) ? selectedJudgmentId : judgments[0]?.id;
    if (nextJudgmentId !== selectedJudgmentId) {
      setSelectedJudgmentId(nextJudgmentId);
    }
  }, [judgments, selectedJudgmentId, visibleSession?.id]);

  const activeJudgment = useMemo(
    () => judgments.find((judgment) => judgment.id === selectedJudgmentId) ?? judgments[0],
    [judgments, selectedJudgmentId]
  );

  function handleAcceptSelected() {
    if (!activeJudgment || !visibleSession) return;
    acceptRule(activeJudgment.ruleId, visibleSession.id);
  }

  function handleRejectSelected() {
    if (!activeJudgment || !visibleSession) return;
    rejectRule(activeJudgment.ruleId, visibleSession.id);
  }

  function handleObserveSelected() {
    if (!activeJudgment || !visibleSession) return;
    observeRule(activeJudgment.ruleId, visibleSession.id);
  }

  function handleAddToPersonaModel() {
    if (!activeJudgment || !visibleSession) return;
    acceptRule(activeJudgment.ruleId, visibleSession.id);
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        kicker="历史"
        title="Sessions"
        subtitle="Browse prior training sessions, inspect transcripts, and evaluate each session's judgment on candidate rules."
      />

      <Panel title="筛选栏" subtitle="MVP 先用简单筛选">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-muted">Student Type</div>
            <Select value={sessionFilterStudentType} onChange={(event) => setSessionFilterStudentType(event.target.value)}>
              <option value="all">全部</option>
              <option value="shy beginner">Shy Beginner 害羞初学者</option>
              <option value="smart but lazy">Smart But Lazy 聪明但懒</option>
              <option value="anxious learner">Anxious Learner 焦虑学习者</option>
              <option value="argumentative learner">Argumentative Learner 好辩学习者</option>
            </Select>
          </div>
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-muted">Rule State</div>
            <Select value={sessionRuleStatusFilter} onChange={(event) => setSessionRuleStatusFilter(event.target.value as typeof sessionRuleStatusFilter)}>
              <option value="all">全部</option>
              <option value="candidate">Candidate 候选</option>
              <option value="accepted">Accepted 已接受</option>
              <option value="rejected">Rejected 已拒绝</option>
              <option value="observed">Observed 已观察</option>
            </Select>
          </div>
          <div className="flex items-end">
            <Pill tone="accent">{filteredSessions.length} sessions</Pill>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-line bg-black/20 p-3 text-xs leading-5 text-muted">
          Session filters are persisted locally. The detail panel now reads from session judgments instead of projecting directly from global rule state.
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[440px_minmax(0,1fr)]">
        <Panel title="Session List" subtitle="点击卡片查看详情">
          <div className="space-y-3">
            {filteredSessions.map((session) => (
              <button
                key={session.id}
                onClick={() => {
                  selectSession(session.id);
                  setSelectedJudgmentId(sessionRuleJudgments.find((judgment) => judgment.sessionId === session.id)?.id);
                }}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  session.id === visibleSession?.id ? "border-accent/40 bg-accent/12" : "border-line bg-black/20 hover:bg-white/[0.05]"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-base font-semibold">{session.title}</div>
                    <div className="mt-1 text-xs text-muted">
                      {session.date || session.startedAt.slice(0, 10)} · {session.studentType} · {session.scenario}
                    </div>
                  </div>
                  <Pill tone={session.status === "active" ? "good" : session.status === "completed" ? "accent" : "default"}>{session.status}</Pill>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {session.tags.map((tag) => (
                    <Pill key={tag}>{tag}</Pill>
                  ))}
                </div>
                <div className="mt-3 text-xs text-muted">
                  {session.hasKeyMoments ? "Has key moments" : "No key moments flagged"} · {session.candidateRuleIds.length} judgment(s)
                </div>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Session Detail" subtitle="Summary、transcript 和 session-specific rule judgments">
          {visibleSession ? (
            <SessionDetail
              session={visibleSession}
              rules={rules}
              judgments={judgments}
              evidences={sessionEvidences}
              performanceRecords={sessionPerformanceRecords}
              aggregateStats={sessionStats}
              temporalByRule={temporalByRule}
              ecologyStats={sessionEcologyStats}
              competitionEcology={sessionCompetitionEcology}
              decayRecords={sessionDecayRecords}
              contradictions={sessionContradictions}
              hypotheses={sessionHypotheses}
              competitionGroups={sessionCompetitionGroups}
              replacementRecords={sessionReplacementRecords}
              activeJudgmentId={activeJudgment?.id}
              onSelectJudgment={setSelectedJudgmentId}
              onAccept={handleAcceptSelected}
              onReject={handleRejectSelected}
              onObserve={handleObserveSelected}
              onAddToPersonaModel={handleAddToPersonaModel}
            />
          ) : (
            <div className="text-sm text-muted">尚未选择 session。</div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function SessionsSkeleton() {
  return (
    <div className="space-y-6">
      <SectionTitle
        kicker="历史"
        title="Sessions"
        subtitle="正在加载 session history..."
        right={<Pill tone="accent">Hydrating</Pill>}
      />
      <Panel title="Workspace" subtitle="等待 client state 挂载">
        <div className="h-[560px] rounded-2xl border border-dashed border-line bg-black/20" />
      </Panel>
    </div>
  );
}

function SessionDetail({
  session,
  rules,
  judgments,
  evidences,
  performanceRecords,
  aggregateStats,
  temporalByRule,
  ecologyStats,
  competitionEcology,
  decayRecords,
  contradictions,
  hypotheses,
  competitionGroups,
  replacementRecords,
  activeJudgmentId,
  onSelectJudgment,
  onAccept,
  onReject,
  onObserve,
  onAddToPersonaModel
}: {
  session: Session;
  rules: PersonaRule[];
  judgments: SessionRuleJudgment[];
  evidences: RuleEvidence[];
  performanceRecords: RulePerformanceRecord[];
  aggregateStats: RuleAggregateStats[];
  temporalByRule: Map<string, RuleTemporalStats>;
  ecologyStats: RuleEcologyStats[];
  competitionEcology: Array<{
    competitionGroupId: string;
    activeRuleId?: string;
    incumbentRuleId?: string;
    currentLeaderRuleId?: string;
    challengerRuleIds: string[];
    dominanceSpan: number;
    turnoverCounter: number;
    lockStatus: "unlocked" | "locked" | "breaking";
    effectivePressure: number;
    resistanceScore: number;
    contestIntensity: number;
    stabilityClass: "stable" | "pressured" | "contested" | "turnover";
    replacementRisk: number;
  }>;
  decayRecords: RuleDecayRecord[];
  contradictions: RuleContradiction[];
  hypotheses: Array<{
    id: string;
    text: string;
    layer: string;
    topicKey: string;
    status: string;
    sourceType: string;
    sourceIds: string[];
    parentRuleIds: string[];
    competingRuleIds: string[];
    confidence: number;
    rationale: string;
    sourceSessionIds: string[];
  }>;
  competitionGroups: Array<{
    id: string;
    topicKey: string;
    layer: string;
    status: string;
    activeRuleId?: string;
    ruleIds: string[];
    settled?: boolean;
  }>;
  replacementRecords: Array<{ id: string; replacedRuleId: string; replacementRuleId: string; competitionGroupId: string; reason: string }>;
  activeJudgmentId?: string;
  onSelectJudgment: (id: string) => void;
  onAccept: () => void;
  onReject: () => void;
  onObserve: () => void;
  onAddToPersonaModel: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-line bg-black/20 p-4">
          <div className="text-[11px] uppercase tracking-[0.24em] text-muted">Session Summary</div>
          <p className="mt-3 text-sm leading-6 text-text">{session.summary}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Pill tone={session.status === "active" ? "good" : "accent"}>{session.status}</Pill>
            <Pill>{session.roundCount} rounds</Pill>
            <Pill>{session.scenario}</Pill>
            <Pill>{judgments.length} judgments</Pill>
            <Pill>{`${hypotheses.length} hypotheses`}</Pill>
          </div>
          <div className="mt-4 rounded-2xl border border-line bg-white/[0.03] p-3 text-xs leading-5 text-muted">
            {contradictions.length
              ? `这个 session 产生了 ${contradictions.length} 条 contradiction record(s)，并已进入 rule competition。`
              : "这个 session 还没有产生 contradiction record。"}
          </div>
          <div className="mt-3 rounded-2xl border border-line bg-black/20 p-3 text-xs leading-5 text-muted">
            <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-muted">Memory Composition</div>
            <div>{judgments.length ? `这个 session 留下了 ${judgments.length} 个 judgment-linked memory mark(s)。` : "暂无 residual memory。"}</div>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-black/20 p-4">
          <div className="text-[11px] uppercase tracking-[0.24em] text-muted">Session Meta</div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <Meta label="日期" value={session.date || session.startedAt.slice(0, 10)} />
            <Meta label="时长" value={session.duration || `${session.roundCount} rounds`} />
            <Meta label="场景" value={session.scenario} />
            <Meta label="Key Moments" value={session.hasKeyMoments ? "Yes" : "No"} />
            <Meta label="Supports Rules" value={String(judgments.filter((judgment) => judgment.status === "accepted").length)} />
            <Meta label="Challenges Rules" value={String(judgments.filter((judgment) => judgment.status === "rejected").length)} />
            <Meta label="Hypotheses" value={String(hypotheses.length)} />
          </div>
          <div className="mt-4 rounded-2xl border border-line bg-white/[0.03] p-3">
            <div className="text-[11px] uppercase tracking-[0.24em] text-muted">Temporal Impact</div>
            <div className="mt-3 space-y-2">
              {performanceRecords.length ? (
                performanceRecords.map((record) => {
                  const temporal = temporalByRule.get(record.ruleId);
                  const rule = rules.find((item) => item.id === record.ruleId);
                  return (
                    <div key={record.id} className="rounded-xl border border-line/70 bg-black/20 px-3 py-2 text-xs text-muted">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone={record.outcome === "win" ? "good" : record.outcome === "loss" ? "bad" : record.outcome === "challenge" ? "warn" : "default"}>
                          {record.outcome}
                        </Pill>
                        <Pill>{rule?.layer ?? "layer"}</Pill>
                        <Pill>{rule?.status ?? record.ruleId}</Pill>
                        {temporal ? <Pill>{temporal.trend}</Pill> : null}
                      </div>
                      <div className="mt-1 text-text">{rule?.text ?? record.ruleId}</div>
                      <div className="mt-1">
                        Δ score {record.scoreDelta.toFixed(1)} · Δ survivability {record.survivabilityDelta.toFixed(1)} · Δ confidence {record.confidenceDelta.toFixed(1)}
                      </div>
                      <div className="mt-1">
                        Recent win {temporal ? `${Math.round(temporal.recentWinRate * 100)}%` : "0%"} · momentum {temporal ? temporal.momentumScore.toFixed(1) : "0.0"}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-xs text-muted">这个 session 还没有 temporal performance records。</div>
              )}
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-line bg-white/[0.03] p-3">
            <div className="text-[11px] uppercase tracking-[0.24em] text-muted">Ecology Impact</div>
            <div className="mt-3 space-y-2">
              {competitionEcology.length ? (
                <div className="rounded-xl border border-line/70 bg-black/20 px-3 py-3 text-xs text-muted">
                  {(() => {
                    const strengthenedIncumbent = competitionEcology.some((group) => group.incumbentRuleId === group.currentLeaderRuleId && group.lockStatus === "locked");
                    const empoweredChallenger = competitionEcology.some((group) => group.currentLeaderRuleId && group.currentLeaderRuleId !== group.incumbentRuleId);
                    const turnoverRiskRaised = competitionEcology.some((group) => group.stabilityClass === "turnover" || group.replacementRisk >= 55);
                    return (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <Pill tone={strengthenedIncumbent ? "good" : "default"}>{strengthenedIncumbent ? "incumbent strengthened" : "incumbent unchanged"}</Pill>
                          <Pill tone={empoweredChallenger ? "warn" : "default"}>{empoweredChallenger ? "challenger empowered" : "challenger contained"}</Pill>
                          <Pill tone={turnoverRiskRaised ? "bad" : "default"}>{turnoverRiskRaised ? "turnover risk up" : "turnover stable"}</Pill>
                        </div>
                      </>
                    );
                  })()}
                </div>
              ) : null}
              {ecologyStats.length ? (
                ecologyStats.map((ecology) => (
                  <div key={ecology.ruleId} className="rounded-xl border border-line/70 bg-black/20 px-3 py-2 text-xs text-muted">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={ecology.ecologyStatus === "dominant" ? "good" : ecology.ecologyStatus === "fragile" ? "warn" : ecology.ecologyStatus === "fading" ? "bad" : "accent"}>
                        {ecology.ecologyStatus}
                      </Pill>
                      {ecology.isIncumbent ? <Pill tone="good">incumbent</Pill> : null}
                      {ecology.isCurrentLeader ? <Pill tone="accent">leader</Pill> : null}
                      <Pill>{`Dom ${ecology.dominanceSpan}`}</Pill>
                      <Pill>{`Pressure ${ecology.effectivePressure.toFixed(1)}`}</Pill>
                      <Pill>{`Resilience ${ecology.resilienceScore.toFixed(1)}`}</Pill>
                      <Pill>{`Risk ${ecology.replacementRisk.toFixed(1)}`}</Pill>
                    </div>
                    <div className="mt-1 text-text">{rules.find((item) => item.id === ecology.ruleId)?.text ?? ecology.ruleId}</div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted">这个 session 还没有改变任何 rule ecology。</div>
              )}
              {competitionEcology.length ? (
                <div className="space-y-2 pt-2">
                  {competitionEcology.map((groupEcology) => (
                    <div key={groupEcology.competitionGroupId} className="rounded-xl border border-line/70 bg-black/20 px-3 py-2 text-xs text-muted">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone={groupEcology.stabilityClass === "stable" ? "good" : groupEcology.stabilityClass === "pressured" ? "warn" : groupEcology.stabilityClass === "contested" ? "accent" : "bad"}>
                          {groupEcology.stabilityClass}
                        </Pill>
                        <Pill>{`Risk ${groupEcology.replacementRisk.toFixed(1)}`}</Pill>
                        <Pill>{`Contest ${groupEcology.contestIntensity.toFixed(1)}`}</Pill>
                        <Pill>{`Pressure ${groupEcology.effectivePressure.toFixed(1)}`}</Pill>
                        <Pill>{`Resistance ${groupEcology.resistanceScore.toFixed(1)}`}</Pill>
                        <Pill>{`Turnover ${groupEcology.turnoverCounter}`}</Pill>
                        <Pill>{`Lock ${groupEcology.lockStatus}`}</Pill>
                      </div>
                      <div className="mt-1 text-text">{groupEcology.competitionGroupId}</div>
                      <div className="mt-1">Incumbent {groupEcology.incumbentRuleId ?? "none"} · leader {groupEcology.currentLeaderRuleId ?? "none"}</div>
                    </div>
                  ))}
                </div>
              ) : null}
              {decayRecords.length ? (
                <div className="space-y-2 pt-2">
                  {decayRecords.map((record) => (
                    <div key={record.id} className="rounded-xl border border-line/70 bg-white/[0.03] px-3 py-2 text-xs text-muted">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone="warn">{record.reason}</Pill>
                        <Pill>{record.decayPath}</Pill>
                        <Pill>{record.severity}</Pill>
                        <Pill>{record.scoreImpact.toFixed(1)}</Pill>
                      </div>
                      <div className="mt-1 text-text">{rules.find((item) => item.id === record.ruleId)?.text ?? record.ruleId}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div>
          <div className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-text">Transcript</div>
          <div className="space-y-3">
            {session.transcript.map((turn) => (
              <div key={turn.id} className="rounded-2xl border border-line bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Pill tone={turn.speaker === "teacher" ? "accent" : "good"}>{turn.speaker}</Pill>
                    <span className="text-xs text-muted">Round {turn.round}</span>
                  </div>
                  {turn.highlighted || session.keyMoments.includes(turn.text) ? <Pill tone="warn">Key moment</Pill> : null}
                </div>
                <p className="mt-3 text-sm leading-6 text-text">{turn.text}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {turn.tags?.map((tag) => (
                    <Pill key={tag}>{tag}</Pill>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-line bg-black/20 p-4">
            <div className="text-[11px] uppercase tracking-[0.24em] text-muted">Contradiction Records</div>
            <div className="mt-3 space-y-2">
              {contradictions.length ? (
                contradictions.map((contradiction) => (
                  <div key={contradiction.id} className="rounded-xl border border-line/70 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-muted">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone="warn">{contradiction.severity}</Pill>
                      <Pill>{contradiction.contradictionType}</Pill>
                      <Pill>{contradiction.sourceType}</Pill>
                    </div>
                    <div className="mt-2">{contradiction.summary}</div>
                    <div className="mt-1">Turns: {contradiction.relatedTurnIds?.length ? contradiction.relatedTurnIds.join(", ") : "none"}</div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted">这个 session 还没有 contradiction record。</div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-black/20 p-4">
            <div className="text-[11px] uppercase tracking-[0.24em] text-muted">Hypothesis Records</div>
            <div className="mt-3 space-y-2">
              {hypotheses.length ? (
                hypotheses.map((hypothesis) => (
                  <div key={hypothesis.id} className="rounded-xl border border-line/70 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-muted">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone="accent">{hypothesis.status}</Pill>
                      <Pill>{hypothesis.topicKey}</Pill>
                      <Pill>{hypothesis.sourceType}</Pill>
                    </div>
                    <div className="mt-2">{hypothesis.text}</div>
                    <div className="mt-1">Parent rules: {hypothesis.parentRuleIds.length ? hypothesis.parentRuleIds.join(", ") : "none"}</div>
                    <div className="mt-1">Source sessions: {hypothesis.sourceSessionIds.length ? hypothesis.sourceSessionIds.join(", ") : "none"}</div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted">这个 session 还没有 hypothesis records。</div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-black/20 p-4">
            <div className="text-[11px] uppercase tracking-[0.24em] text-muted">Competition Groups</div>
            <div className="mt-3 space-y-2">
              {competitionGroups.length ? (
                competitionGroups.map((group) => (
                  <div key={group.id} className="rounded-xl border border-line/70 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-muted">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone="accent">{group.status}</Pill>
                      <Pill>{group.topicKey}</Pill>
                      <Pill>{group.layer}</Pill>
                    </div>
                    <div className="mt-2">Active: {group.activeRuleId ?? "none"}</div>
                    <div className="mt-1">Members: {group.ruleIds.length}</div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted">这个 session 还没有关联的 competition groups。</div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-black/20 p-4">
            <div className="text-[11px] uppercase tracking-[0.24em] text-muted">Replacement Records</div>
            <div className="mt-3 space-y-2">
              {replacementRecords.length ? (
                replacementRecords.map((record) => (
                  <div key={record.id} className="rounded-xl border border-line/70 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-muted">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone="warn">{record.replacedRuleId}</Pill>
                      <Pill tone="good">{record.replacementRuleId}</Pill>
                    </div>
                    <div className="mt-2">{record.reason}</div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted">这个 session 还没有关联的 replacement records。</div>
              )}
            </div>
          </div>

          <div className="text-sm font-semibold uppercase tracking-[0.24em] text-text">Session Rule Judgments</div>
          <div className="space-y-3">
            {judgments.map((judgment) => (
              <RuleJudgmentCard
                key={judgment.id}
                judgment={judgment}
                rule={rules.find((rule) => rule.id === judgment.ruleId)}
                evidences={evidences.filter((item) => item.ruleId === judgment.ruleId)}
                aggregateStats={aggregateStats.find((item) => item.ruleId === judgment.ruleId)}
                contradictions={contradictions.filter((item) => item.ruleId === judgment.ruleId)}
                active={activeJudgmentId === judgment.id}
                onSelect={() => onSelectJudgment(judgment.id)}
              />
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <PrimaryButton onClick={onAccept} disabled={!activeJudgmentId}>
              接受 Rule
            </PrimaryButton>
            <SecondaryButton onClick={onReject} disabled={!activeJudgmentId}>
              拒绝 Rule
            </SecondaryButton>
            <SecondaryButton onClick={onObserve} disabled={!activeJudgmentId}>
              稍后观察
            </SecondaryButton>
            <SecondaryButton onClick={onAddToPersonaModel} disabled={!activeJudgmentId}>
              加入 Persona Model
            </SecondaryButton>
          </div>

          <div className="rounded-2xl border border-line bg-black/20 p-4 text-xs leading-5 text-muted">
            Session judgments 会展示这个 session 如何支持、挑战或重新观察 global persona rules。Accept 会进入 learning protocol，并可能在聚合后提升 global rule。
          </div>
        </div>
      </div>
    </div>
  );
}

function RuleJudgmentCard({
  judgment,
  rule,
  evidences,
  aggregateStats,
  contradictions,
  active,
  onSelect
}: {
  judgment: SessionRuleJudgment;
  rule?: PersonaRule;
  evidences: RuleEvidence[];
  aggregateStats?: RuleAggregateStats;
  contradictions: RuleContradiction[];
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-2xl border p-4 text-left transition ${
        active ? "border-accent/40 bg-accent/12" : "border-line bg-black/20 hover:bg-white/[0.05]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <Pill tone="accent">{judgment.status}</Pill>
        <Pill>{rule?.status ?? "missing global rule"}</Pill>
        {aggregateStats ? <Pill tone="good">{`${aggregateStats.stabilityScore}% stable`}</Pill> : null}
      </div>
      <p className="mt-3 text-sm leading-6 text-text">{rule?.text ?? judgment.ruleId}</p>
      {rule?.evidence ? <p className="mt-2 text-xs leading-5 text-muted">{rule.evidence}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Pill>{Math.round(judgment.confidence * 100)}%</Pill>
        <Pill tone="warn">{rule?.layer ?? "unknown"}</Pill>
        {rule?.lastObservedInSessionId ? <Pill>Last observed {rule.lastObservedInSessionId}</Pill> : null}
        {aggregateStats ? <Pill>{`Support ${aggregateStats.supportCount} / Challenge ${aggregateStats.challengeCount}`}</Pill> : null}
      </div>
      <div className="mt-3 text-xs text-muted">Evidence turns: {judgment.evidenceTurnIds.length ? judgment.evidenceTurnIds.join(", ") : "-"}</div>
      <div className="mt-2 text-xs text-muted">{judgment.note ?? "暂无 session note。"}</div>
      <div className="mt-3 text-[11px] uppercase tracking-[0.22em] text-muted">
        {rule?.sourceSessionIds?.length ? `Supported by ${rule.sourceSessionIds.length} source sessions` : "暂无 source session trace"}
      </div>
      {contradictions.length ? (
        <div className="mt-3 rounded-xl border border-line/70 bg-black/20 p-3">
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted">Contradiction Link</div>
          <div className="mt-2 space-y-2">
            {contradictions.map((contradiction) => (
              <div key={contradiction.id} className="rounded-lg border border-line/60 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-muted">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone="warn">{contradiction.severity}</Pill>
                  <Pill>{contradiction.contradictionType}</Pill>
                </div>
                <div className="mt-1">{contradiction.summary}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-4 rounded-xl border border-line/70 bg-black/20 p-3">
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted">Evidence Chain</div>
        <div className="mt-2 space-y-2">
          {evidences.length ? (
            evidences.map((evidence) => (
              <div key={evidence.id} className="rounded-lg border border-line/60 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-muted">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={evidence.evidenceType === "challenge" ? "warn" : evidence.evidenceType === "review_correction" ? "accent" : "good"}>
                    {evidence.evidenceType}
                  </Pill>
                  <Pill>{`${Math.round(evidence.confidenceContribution * 100)}%`}</Pill>
                  {evidence.judgmentStatus ? <Pill>{evidence.judgmentStatus}</Pill> : null}
                </div>
                <div className="mt-2">{evidence.summary}</div>
                <div className="mt-1">Turns: {evidence.turnIds.length ? evidence.turnIds.join(", ") : "none"}</div>
              </div>
            ))
          ) : (
            <div className="text-xs text-muted">尚未生成 evidence records。</div>
          )}
        </div>
      </div>
    </button>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-white/[0.03] p-3">
      <div className="text-[11px] uppercase tracking-[0.22em] text-muted">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
