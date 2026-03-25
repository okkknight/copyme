"use client";

import { ClientOnly } from "@/components/client-only";
import { Panel, Pill, PrimaryButton, SectionTitle } from "@/components/ui";
import { useMemo } from "react";
import type { HypothesisRule, PersonaRule } from "@/lib/types";
import { useCopymeStore } from "@/store/use-copyme-store";

export default function PersonaModelPage() {
  return (
    <ClientOnly fallback={<PersonaModelSkeleton />}>
      <PersonaModelPageContent />
    </ClientOnly>
  );
}

function PersonaModelPageContent() {
  const personaModel = useCopymeStore((state) => state.personaModel);
  const rules = useCopymeStore((state) => state.rules);
  const hypothesisRules = useCopymeStore((state) => state.hypothesisRules);
  const ruleCompetitionGroups = useCopymeStore((state) => state.ruleCompetitionGroups);
  const ruleReplacementRecords = useCopymeStore((state) => state.ruleReplacementRecords);
  const ruleAggregateStats = useCopymeStore((state) => state.ruleAggregateStats);
  const ruleCompetitionStats = useCopymeStore((state) => state.ruleCompetitionStats);
  const ruleTemporalStats = useCopymeStore((state) => state.ruleTemporalStats);
  const ruleEcologyStats = useCopymeStore((state) => state.ruleEcologyStats);
  const competitionGroupEcology = useCopymeStore((state) => state.competitionGroupEcology);
  const ruleDecayRecords = useCopymeStore((state) => state.ruleDecayRecords);
  const resetMockState = useCopymeStore((state) => state.resetMockState);
  const acceptedRules = useMemo(() => rules.filter((rule) => rule.status === "accepted" || rule.status === "stable"), [rules]);
  const atRiskRules = useMemo(() => rules.filter((rule) => ["challenged", "contradicted", "deprecated", "invalidated"].includes(rule.status)), [rules]);
  const activeExplanations = useMemo(
    () =>
      personaModel.activeRuleIds
        .map((id) => rules.find((rule) => rule.id === id) ?? hypothesisRules.find((hypothesis) => hypothesis.id === id))
        .filter((item): item is PersonaRule | HypothesisRule => Boolean(item)),
    [hypothesisRules, personaModel.activeRuleIds, rules]
  );
  const emergingHypotheses = useMemo(
    () => hypothesisRules.filter((hypothesis) => hypothesis.status !== "rejected" && hypothesis.status !== "replaced"),
    [hypothesisRules]
  );
  const styleRules = useMemo(() => acceptedRules.filter((rule) => rule.layer === "style"), [acceptedRules]);
  const decisionRules = useMemo(() => acceptedRules.filter((rule) => rule.layer === "decision"), [acceptedRules]);
  const valueRules = useMemo(() => acceptedRules.filter((rule) => rule.layer === "value"), [acceptedRules]);
  const boundaryRules = useMemo(() => acceptedRules.filter((rule) => rule.layer === "boundary"), [acceptedRules]);
  const statsByRule = useMemo(() => new Map(ruleAggregateStats.map((stats) => [stats.ruleId, stats])), [ruleAggregateStats]);
  const competitionByRule = useMemo(() => new Map(ruleCompetitionStats.map((stats) => [stats.ruleId, stats])), [ruleCompetitionStats]);
  const temporalByRule = useMemo(() => new Map(ruleTemporalStats.map((stats) => [stats.ruleId, stats])), [ruleTemporalStats]);
  const ecologyByRule = useMemo(() => new Map(ruleEcologyStats.map((stats) => [stats.ruleId, stats])), [ruleEcologyStats]);
  const ecologyGroupById = useMemo(() => new Map(competitionGroupEcology.map((item) => [item.competitionGroupId, item])), [competitionGroupEcology]);
  const competitionGroupsByStatus = useMemo(
    () => ({
      open: ruleCompetitionGroups.filter((group) => group.status === "open"),
      contested: ruleCompetitionGroups.filter((group) => group.status === "contested"),
      settled: ruleCompetitionGroups.filter((group) => group.status === "settled")
    }),
    [ruleCompetitionGroups]
  );

  return (
    <div className="space-y-6">
      <SectionTitle
        kicker="模型"
        title="Persona Model"
        subtitle="结构化、版本化、可追溯的 teacher persona rules。此页仅展示已接受的 global rules。"
        right={<PrimaryButton onClick={resetMockState}>重置 Mock State</PrimaryButton>}
      />

      <Panel title="Model Summary" subtitle="当前版本快照与 traceability metrics">
        <div className="grid gap-4 lg:grid-cols-8">
          <SummaryMetric label="Version" value={personaModel.version} />
          <SummaryMetric label="Updated At" value={personaModel.updatedAt.slice(0, 19).replace("T", " ")} />
          <SummaryMetric label="Accepted Rules" value={String(personaModel.acceptedRuleIds.length)} />
          <SummaryMetric label="Source Sessions" value={String(personaModel.sourceSessionIds.length)} />
          <SummaryMetric label="Review Signals" value={String(personaModel.reviewSignalAppliedCount)} />
          <SummaryMetric label="At Risk Rules" value={String(atRiskRules.length)} />
          <SummaryMetric label="Active Explanations" value={String(personaModel.activeRuleIds.length)} />
          <SummaryMetric label="Competition Groups" value={String(personaModel.competitionGroupIds.length)} />
        </div>
      </Panel>

      <Panel title="Ecology Summary" subtitle="哪些 explanations 仍然站稳、摇摆或正在 fading out">
        <div className="grid gap-4 lg:grid-cols-6">
          <SummaryMetric label="Dominant" value={String(personaModel.dominantRuleIds.length)} />
          <SummaryMetric label="Fragile" value={String(personaModel.fragileRuleIds.length)} />
          <SummaryMetric label="Contested" value={String(personaModel.contestedRuleIds.length)} />
          <SummaryMetric label="Fading" value={String(personaModel.fadingRuleIds.length)} />
          <SummaryMetric label="Group Ecology" value={String(personaModel.competitionGroupEcologyIds.length)} />
          <SummaryMetric label="Decay Records" value={String(ruleDecayRecords.length)} />
        </div>
      </Panel>

      <Panel title="Current Best Explanations" subtitle="Active explanation 可以是 accepted rule，也可以是 winning hypothesis">
        <div className="space-y-3">
          {activeExplanations.length ? (
            activeExplanations.map((item) => {
              const ecology = ecologyByRule.get(item.id);
              const groupEcology = "competitionGroupId" in item && item.competitionGroupId ? ecologyGroupById.get(item.competitionGroupId) : undefined;
              return (
                <div key={item.id} className="rounded-2xl border border-line bg-black/20 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone="accent">{item.layer}</Pill>
                    {"topicKey" in item ? <Pill>{item.topicKey ?? "topic"}</Pill> : null}
                    <Pill>{item.status}</Pill>
                    {"sourceType" in item ? <Pill tone="warn">{item.sourceType}</Pill> : null}
                    {ecology ? <Pill tone={ecologyTone(ecology.ecologyStatus)}>{ecology.ecologyStatus}</Pill> : null}
                    {groupEcology ? <Pill tone={groupEcologyTone(groupEcology.stabilityClass)}>{groupEcology.stabilityClass}</Pill> : null}
                    {ecology?.isIncumbent ? <Pill tone="good">incumbent</Pill> : null}
                    {ecology?.isCurrentLeader ? <Pill tone="accent">leader</Pill> : null}
                    {groupEcology ? <Pill>{layeredMemorySummary(groupEcology.layeredPressureMemory)}</Pill> : null}
                    {groupEcology ? <Pill>{`Rec ${(groupEcology.recoveryProgress * 100).toFixed(0)}%`}</Pill> : null}
                    {groupEcology ? <Pill>{`Mode ${groupEcology.recoveryMode}`}</Pill> : null}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-text">{item.text}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {ecologyByRule.get(item.id) ? (
                      <>
                        <Pill>{`Dom ${(ecologyByRule.get(item.id)?.dominanceSpan ?? 0).toFixed(0)}`}</Pill>
                        <Pill>{`Pressure ${(ecologyByRule.get(item.id)?.effectivePressure ?? 0).toFixed(1)}`}</Pill>
                        <Pill>{`Res ${(ecologyByRule.get(item.id)?.resilienceScore ?? 0).toFixed(1)}`}</Pill>
                        <Pill>{`Risk ${(ecologyByRule.get(item.id)?.replacementRisk ?? 0).toFixed(1)}`}</Pill>
                        <Pill>{`Lock ${("competitionGroupId" in item && item.competitionGroupId ? ecologyGroupById.get(item.competitionGroupId)?.lockStatus : undefined) ?? "unlocked"}`}</Pill>
                        {groupEcology ? <Pill>{layeredMemorySummary(groupEcology.layeredPressureMemory)}</Pill> : null}
                        {groupEcology ? <Pill>{`Rec ${(groupEcology.recoveryProgress * 100).toFixed(0)}%`}</Pill> : null}
                        {groupEcology ? <Pill>{`Mode ${groupEcology.recoveryMode}`}</Pill> : null}
                      </>
                    ) : null}
                  </div>
                  <div className="mt-3 text-xs text-muted">
                    {"competitionGroupId" in item && item.competitionGroupId ? `Competition group ${item.competitionGroupId}` : "Active explanation selected by competition."}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-line bg-black/20 p-4 text-sm text-muted">暂无 active explanations。</div>
          )}
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <LayerPanel title="Style Layer" rules={styleRules} statsByRule={statsByRule} />
        <LayerPanel title="Decision Layer" rules={decisionRules} statsByRule={statsByRule} />
        <LayerPanel title="Value Layer" rules={valueRules} statsByRule={statsByRule} />
        <LayerPanel title="Boundary Layer" rules={boundaryRules} statsByRule={statsByRule} />
      </div>

      <Panel title="Emerging Hypotheses" subtitle="由 contradictions、review signals 和 session patterns 产生的新 explanations">
        <div className="space-y-3">
          {emergingHypotheses.length ? (
            emergingHypotheses.map((hypothesis) => {
              const leading = ruleCompetitionGroups.some((group) => group.activeRuleId === hypothesis.id);
              const temporal = temporalByRule.get(hypothesis.id);
              const ecology = ecologyByRule.get(hypothesis.id);
              const groupEcology = hypothesis.competitionGroupId ? ecologyGroupById.get(hypothesis.competitionGroupId) : undefined;
              return (
                <div key={hypothesis.id} className="rounded-2xl border border-line bg-black/20 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone="accent">{hypothesis.layer}</Pill>
                    <Pill>{hypothesis.topicKey}</Pill>
                    <Pill>{hypothesis.status}</Pill>
                    <Pill tone={leading ? "good" : "warn"}>{leading ? "leading" : "testing"}</Pill>
                    <Pill tone="warn">{hypothesis.sourceType}</Pill>
                    {ecology ? <Pill tone={ecologyTone(ecology.ecologyStatus)}>{ecology.ecologyStatus}</Pill> : null}
                    {groupEcology ? <Pill tone={groupEcologyTone(groupEcology.stabilityClass)}>{groupEcology.stabilityClass}</Pill> : null}
                    {temporal ? <Pill tone={temporal.trend === "rising" ? "good" : temporal.trend === "fading" ? "bad" : temporal.trend === "volatile" ? "warn" : "default"}>{temporal.trend}</Pill> : null}
                    {ecology?.isIncumbent ? <Pill tone="good">incumbent</Pill> : null}
                    {ecology?.isCurrentLeader ? <Pill tone="accent">leader</Pill> : null}
                    {groupEcology ? <Pill>{layeredMemorySummary(groupEcology.layeredPressureMemory)}</Pill> : null}
                    {groupEcology ? <Pill>{`Rec ${(groupEcology.recoveryProgress * 100).toFixed(0)}%`}</Pill> : null}
                    {groupEcology ? <Pill>{`Mode ${groupEcology.recoveryMode}`}</Pill> : null}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-text">{hypothesis.text}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Pill>{Math.round(hypothesis.confidence * 100)}%</Pill>
                    <Pill>{`Parents ${hypothesis.parentRuleIds.length}`}</Pill>
                    <Pill>{`Competitors ${hypothesis.competingRuleIds.length}`}</Pill>
                    <Pill>{`Sessions ${hypothesis.sourceSessionIds.join(", ") || "none"}`}</Pill>
                    {temporal ? <Pill>{`Momentum ${temporal.momentumScore.toFixed(1)}`}</Pill> : null}
                    {temporal ? <Pill>{`Win ${(temporal.recentWinRate * 100).toFixed(0)}%`}</Pill> : null}
                    {temporal ? <Pill>{`Vol ${temporal.volatilityScore.toFixed(1)}`}</Pill> : null}
                    {ecology ? <Pill>{`Dom ${ecology.dominanceSpan}`}</Pill> : null}
                    {ecology ? <Pill>{`Pressure ${ecology.effectivePressure.toFixed(1)}`}</Pill> : null}
                    {ecology ? <Pill>{`Res ${ecology.resilienceScore.toFixed(1)}`}</Pill> : null}
                    {ecology ? <Pill>{`Risk ${ecology.replacementRisk.toFixed(1)}`}</Pill> : null}
                    {ecology ? <Pill>{`Penalty ${ecology.stabilityPenalty.toFixed(1)}`}</Pill> : null}
                    {ecology ? <Pill>{layeredMemorySummary(ecology.layeredPressureImpact)}</Pill> : null}
                    {groupEcology ? <Pill>{`Lock ${groupEcology.lockStatus}`}</Pill> : null}
                  </div>
                  <div className="mt-2 text-xs text-muted">{hypothesis.rationale}</div>
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-line bg-black/20 p-4 text-sm text-muted">暂无 emerging hypotheses。</div>
          )}
        </div>
      </Panel>

      <Panel title="Competition Groups" subtitle="在同一 topic 上竞争的 rules 与 hypotheses">
        <div className="space-y-3">
          {ruleCompetitionGroups.length ? (
            ruleCompetitionGroups.map((group) => (
              <div key={group.id} className="rounded-2xl border border-line bg-black/20 p-4">
                {(() => {
                  const ecology = ecologyGroupById.get(group.id);
                  return (
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone="accent">{group.layer}</Pill>
                  <Pill>{group.topicKey}</Pill>
                  <Pill>{group.status}</Pill>
                  {group.activeRuleId ? <Pill tone="good">Active {group.activeRuleId}</Pill> : null}
                  {group.settled ? <Pill tone="good">settled</Pill> : <Pill tone="warn">contested</Pill>}
                  {ecology ? <Pill tone={groupEcologyTone(ecology.stabilityClass)}>{ecology.stabilityClass}</Pill> : null}
                  {ecology?.incumbentRuleId ? <Pill tone="good">Incumbent {ecology.incumbentRuleId}</Pill> : null}
                  {ecology?.currentLeaderRuleId ? <Pill tone="accent">Leader {ecology.currentLeaderRuleId}</Pill> : null}
                  {ecology ? <Pill>{layeredMemorySummary(ecology.layeredPressureMemory)}</Pill> : null}
                  {ecology ? <Pill>{`Rec ${(ecology.recoveryProgress * 100).toFixed(0)}%`}</Pill> : null}
                  {ecology ? <Pill>{`Mode ${ecology.recoveryMode}`}</Pill> : null}
                </div>
                  );
                })()}
                <div className="mt-3 text-sm text-text">{group.ruleIds.length} competing explanations</div>
                {ecologyGroupById.get(group.id) ? (
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <Pill>{`Risk ${ecologyGroupById.get(group.id)?.replacementRisk.toFixed(1)}`}</Pill>
                    <Pill>{`Contest ${ecologyGroupById.get(group.id)?.contestIntensity.toFixed(1)}`}</Pill>
                    <Pill>{`Dominance ${ecologyGroupById.get(group.id)?.dominanceSpan}`}</Pill>
                    <Pill>{`Challengers ${ecologyGroupById.get(group.id)?.challengerRuleIds.length}`}</Pill>
                    <Pill>{`Pressure ${ecologyGroupById.get(group.id)?.effectivePressure.toFixed(1)}`}</Pill>
                    <Pill>{`Res ${ecologyGroupById.get(group.id)?.resistanceScore.toFixed(1)}`}</Pill>
                    <Pill>{`Turnover ${ecologyGroupById.get(group.id)?.turnoverCounter}`}</Pill>
                    <Pill>{`Lock ${ecologyGroupById.get(group.id)?.lockStatus}`}</Pill>
                    <Pill>{`Mode ${ecologyGroupById.get(group.id)?.recoveryMode ?? "stabilized"}`}</Pill>
                  </div>
                ) : null}
                <div className="mt-2 text-xs text-muted">
                  Members:{" "}
                  {group.ruleIds
                    .map((id) => rules.find((rule) => rule.id === id)?.text ?? hypothesisRules.find((hypothesis) => hypothesis.id === id)?.text ?? id)
                    .join(" | ")}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-line bg-black/20 p-4 text-sm text-muted">暂无 competition groups。</div>
          )}
        </div>
      </Panel>

      <Panel title="Replacement Records" subtitle="当 hypothesis 明显优于旧 rule 时">
        <div className="space-y-3">
          {ruleReplacementRecords.length ? (
            ruleReplacementRecords.map((record) => (
              <div key={record.id} className="rounded-2xl border border-line bg-black/20 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone="warn">{record.competitionGroupId}</Pill>
                  <Pill>{record.replacedRuleId}</Pill>
                  <Pill tone="good">{record.replacementRuleId}</Pill>
                </div>
                <p className="mt-3 text-sm leading-6 text-text">{record.reason}</p>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-line bg-black/20 p-4 text-sm text-muted">暂无 replacement records。</div>
          )}
        </div>
      </Panel>

      <Panel title="Accepted Rule Index" subtitle="所有已接受的 global rules 及其 traceability metadata">
        <div className="grid gap-3">
          {acceptedRules.map((rule) => (
            <div key={rule.id} className="rounded-2xl border border-line bg-black/20 p-4">
              {(() => {
                const temporal = temporalByRule.get(rule.id);
                const ecology = ecologyByRule.get(rule.id);
                const groupEcology = rule.competitionGroupId ? ecologyGroupById.get(rule.competitionGroupId) : undefined;
                return (
                  <>
                    {temporal ? (
                      <div className="mb-3 flex flex-wrap gap-2 text-xs">
                        <Pill tone={temporal.trend === "rising" ? "good" : temporal.trend === "fading" ? "bad" : temporal.trend === "volatile" ? "warn" : "default"}>{temporal.trend}</Pill>
                        <Pill>{`Momentum ${temporal.momentumScore.toFixed(1)}`}</Pill>
                        <Pill>{`Win ${(temporal.recentWinRate * 100).toFixed(0)}%`}</Pill>
                        <Pill>{`Failure ${(temporal.recentFailureRate * 100).toFixed(0)}%`}</Pill>
                        <Pill>{`Volatility ${temporal.volatilityScore.toFixed(1)}`}</Pill>
                        <Pill>{`Decay ${temporal.decayAdjustedScore.toFixed(1)}`}</Pill>
                        {ecology ? <Pill tone={ecologyTone(ecology.ecologyStatus)}>{ecology.ecologyStatus}</Pill> : null}
                        {ecology ? <Pill>{`Dom ${ecology.dominanceSpan}`}</Pill> : null}
                        {ecology ? <Pill>{`Pressure ${ecology.effectivePressure.toFixed(1)}`}</Pill> : null}
                        {ecology ? <Pill>{`Res ${ecology.resilienceScore.toFixed(1)}`}</Pill> : null}
                        {ecology ? <Pill>{`Risk ${ecology.replacementRisk.toFixed(1)}`}</Pill> : null}
                        {groupEcology ? <Pill tone={groupEcologyTone(groupEcology.stabilityClass)}>{groupEcology.stabilityClass}</Pill> : null}
                        {ecology?.isIncumbent ? <Pill tone="good">incumbent</Pill> : null}
                        {ecology?.isCurrentLeader ? <Pill tone="accent">leader</Pill> : null}
                        {ecology ? <Pill>{`Penalty ${ecology.stabilityPenalty.toFixed(1)}`}</Pill> : null}
                        {ecology ? <Pill>{layeredMemorySummary(ecology.layeredPressureImpact)}</Pill> : null}
                        {ecology ? <Pill>{`Mode ${ecology.recoveryMode}`}</Pill> : null}
                        {groupEcology ? <Pill>{`Lock ${groupEcology.lockStatus}`}</Pill> : null}
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone="accent">{rule.layer}</Pill>
                        <Pill>{rule.status}</Pill>
                        {competitionByRule.get(rule.id) ? <Pill tone="good">{`Survival ${Math.round(competitionByRule.get(rule.id)?.survivabilityScore ?? 0)}`}</Pill> : null}
                      </div>
                      <Pill>{Math.round(rule.confidence * 100)}%</Pill>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-text">{rule.text}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Pill tone="good">{`Supported by ${statsByRule.get(rule.id)?.sourceSessionCount ?? rule.sourceSessionIds.length} sessions`}</Pill>
                      {statsByRule.get(rule.id) ? <Pill>{`Stability ${statsByRule.get(rule.id)?.stabilityScore ?? 0}%`}</Pill> : null}
                      {statsByRule.get(rule.id) ? <Pill>{`Support ${statsByRule.get(rule.id)?.supportCount ?? 0}`}</Pill> : null}
                      {statsByRule.get(rule.id) ? <Pill tone="warn">{`Challenge ${statsByRule.get(rule.id)?.challengeCount ?? 0}`}</Pill> : null}
                      {rule.lastObservedInSessionId ? <Pill>Last observed {rule.lastObservedInSessionId}</Pill> : null}
                      {groupEcology ? <Pill>{`Group risk ${groupEcology.replacementRisk.toFixed(1)}`}</Pill> : null}
                      {ecology ? <Pill>{`Penalty ${ecology.stabilityPenalty.toFixed(1)}`}</Pill> : null}
                      {ecology ? <Pill>{layeredMemorySummary(ecology.layeredPressureImpact)}</Pill> : null}
                      {ecology ? <Pill>{`Mode ${ecology.recoveryMode}`}</Pill> : null}
                      {temporalByRule.get(rule.id) ? (
                        <Pill tone={temporalByRule.get(rule.id)?.trend === "rising" ? "good" : temporalByRule.get(rule.id)?.trend === "fading" ? "bad" : temporalByRule.get(rule.id)?.trend === "volatile" ? "warn" : "default"}>
                          {temporalByRule.get(rule.id)?.trend}
                        </Pill>
                      ) : null}
                      {rule.sourceSessionIds.map((sessionId) => (
                        <Pill key={`${rule.id}-${sessionId}`}>{sessionId}</Pill>
                      ))}
                    </div>
                    {competitionByRule.get(rule.id) ? (
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {(() => {
                          const competition = competitionByRule.get(rule.id);
                          return competition ? (
                            <>
                              <Pill>{`Support weight ${competition.supportWeight.toFixed(1)}`}</Pill>
                              <Pill tone="warn">{`Challenge weight ${competition.challengeWeight.toFixed(1)}`}</Pill>
                              <Pill>{`Contradiction ${competition.contradictionScore.toFixed(1)}`}</Pill>
                              <Pill>{`Pressure ${competition.correctionPressure.toFixed(1)}`}</Pill>
                              <Pill tone="good">{`Net ${competition.netScore.toFixed(1)}`}</Pill>
                              {ecology ? <Pill>{`Dominance ${ecology.dominanceSpan}`}</Pill> : null}
                              {ecology ? <Pill>{`Resilience ${ecology.resilienceScore.toFixed(1)}`}</Pill> : null}
                            </>
                          ) : null;
                        })()}
                      </div>
                    ) : null}
                    {temporalByRule.get(rule.id) ? (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        {(() => {
                          const temporal = temporalByRule.get(rule.id);
                          return temporal ? (
                            <>
                              <Pill>{`Momentum ${temporal.momentumScore.toFixed(1)}`}</Pill>
                              <Pill>{`Win ${(temporal.recentWinRate * 100).toFixed(0)}%`}</Pill>
                              <Pill>{`Failure ${(temporal.recentFailureRate * 100).toFixed(0)}%`}</Pill>
                              <Pill>{`Volatility ${temporal.volatilityScore.toFixed(1)}`}</Pill>
                              <Pill>{`Decay ${temporal.decayAdjustedScore.toFixed(1)}`}</Pill>
                            </>
                          ) : null;
                        })()}
                      </div>
                    ) : null}
                    <div className="mt-3 text-xs text-muted">{rule.evidence}</div>
                    {ecology ? <div className="mt-1 text-xs text-muted">Ecology: {ecology.ecologyStatus} · effective pressure {ecology.effectivePressure.toFixed(1)} · decay {ecology.idleDecayScore.toFixed(1)} · {ecology.isIncumbent ? "incumbent" : ecology.isCurrentLeader ? "current leader" : "challenger"}</div> : null}
                  </>
                );
              })()}
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="At Risk Rules" subtitle="可能被挑战、反驳或失效的 lifecycle states">
        <div className="space-y-3">
          {atRiskRules.length ? (
            atRiskRules.map((rule) => {
              const stats = statsByRule.get(rule.id);
              const competition = competitionByRule.get(rule.id);
              const temporal = temporalByRule.get(rule.id);
              const ecology = ecologyByRule.get(rule.id);
              const groupEcology = rule.competitionGroupId ? ecologyGroupById.get(rule.competitionGroupId) : undefined;
              return (
                <div key={rule.id} className="rounded-2xl border border-line bg-black/20 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone="warn">{rule.status}</Pill>
                    <Pill>{rule.layer}</Pill>
                    {competition ? <Pill>{`Net ${competition.netScore.toFixed(1)}`}</Pill> : null}
                    {competition ? <Pill>{`Survival ${Math.round(competition.survivabilityScore)}`}</Pill> : null}
                    {ecology ? <Pill tone={ecologyTone(ecology.ecologyStatus)}>{ecology.ecologyStatus}</Pill> : null}
                    {groupEcology ? <Pill>{groupEcology.stabilityClass}</Pill> : null}
                    {temporal ? <Pill tone={temporal.trend === "fading" ? "bad" : temporal.trend === "volatile" ? "warn" : temporal.trend === "rising" ? "good" : "default"}>{temporal.trend}</Pill> : null}
                    {ecology?.isIncumbent ? <Pill tone="good">incumbent</Pill> : null}
                    {ecology?.isCurrentLeader ? <Pill tone="accent">leader</Pill> : null}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-text">{rule.text}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Pill>{Math.round(competition?.confidenceScore ?? rule.confidence * 100)}%</Pill>
                    <Pill tone="warn">{`Contradiction ${competition?.contradictionScore.toFixed(1) ?? "0.0"}`}</Pill>
                    <Pill>{`Support ${stats?.supportCount ?? 0}`}</Pill>
                    <Pill>{`Challenge ${stats?.challengeCount ?? 0}`}</Pill>
                    {ecology ? <Pill>{`Pressure ${ecology.effectivePressure.toFixed(1)}`}</Pill> : null}
                    {ecology ? <Pill>{`Resilience ${ecology.resilienceScore.toFixed(1)}`}</Pill> : null}
                    {groupEcology ? <Pill>{`Risk ${groupEcology.replacementRisk.toFixed(1)}`}</Pill> : null}
                    {groupEcology ? <Pill>{`Turnover ${groupEcology.turnoverCounter}`}</Pill> : null}
                    {groupEcology ? <Pill>{`Lock ${groupEcology.lockStatus}`}</Pill> : null}
                    {rule.lastObservedInSessionId ? <Pill>Last observed {rule.lastObservedInSessionId}</Pill> : null}
                    {temporal ? <Pill>{`Momentum ${temporal.momentumScore.toFixed(1)}`}</Pill> : null}
                    {temporal ? <Pill>{`Win ${(temporal.recentWinRate * 100).toFixed(0)}%`}</Pill> : null}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-line bg-black/20 p-4 text-sm text-muted">暂无 at-risk rules。</div>
          )}
        </div>
      </Panel>
    </div>
  );
}

function PersonaModelSkeleton() {
  return (
    <div className="space-y-6">
      <SectionTitle
        kicker="模型"
        title="Persona Model"
        subtitle="正在加载 persona model..."
        right={<Pill tone="accent">Hydrating</Pill>}
      />
      <Panel title="Workspace" subtitle="等待 client state 挂载">
        <div className="h-[420px] rounded-2xl border border-dashed border-line bg-black/20" />
      </Panel>
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-black/20 p-4">
      <div className="text-[11px] uppercase tracking-[0.24em] text-muted">{label}</div>
      <div className="mt-2 text-lg font-semibold">{value}</div>
    </div>
  );
}

function LayerPanel({
  title,
  rules,
  statsByRule
}: {
  title: string;
  rules: Array<{
    id: string;
    text: string;
    layer: string;
    confidence: number;
    sourceSessionIds: string[];
    status: string;
    lastObservedInSessionId?: string;
  }>;
  statsByRule: Map<string, { supportCount: number; challengeCount: number; sourceSessionCount: number; stabilityScore: number; currentConfidence: number }>;
}) {
  return (
    <Panel title={title} subtitle={`Accepted global rules in this layer (${rules.length})`}>
      <div className="space-y-3">
        {rules.map((rule) => (
          <div key={rule.id} className="rounded-2xl border border-line bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="accent">{rule.layer}</Pill>
                <Pill>{rule.status}</Pill>
              </div>
              <Pill>{Math.round((statsByRule.get(rule.id)?.currentConfidence ?? rule.confidence) * 100)}%</Pill>
            </div>
            <p className="mt-3 text-sm leading-6 text-text">{rule.text}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill>{Math.round((statsByRule.get(rule.id)?.currentConfidence ?? rule.confidence) * 100)}%</Pill>
              <Pill tone="good">{`Supported by ${statsByRule.get(rule.id)?.sourceSessionCount ?? rule.sourceSessionIds.length} sessions`}</Pill>
              {statsByRule.get(rule.id) ? <Pill>{`Stability ${statsByRule.get(rule.id)?.stabilityScore ?? 0}%`}</Pill> : null}
              {rule.lastObservedInSessionId ? <Pill>Last observed {rule.lastObservedInSessionId}</Pill> : null}
              {statsByRule.get(rule.id) ? (
                <Pill>{`Support ${statsByRule.get(rule.id)?.supportCount ?? 0} / Challenge ${statsByRule.get(rule.id)?.challengeCount ?? 0}`}</Pill>
              ) : null}
            </div>
            <div className="mt-3 text-xs text-muted">Source sessions: {rule.sourceSessionIds.join(", ")}</div>
            {statsByRule.get(rule.id) ? <div className="mt-2 text-xs text-muted">Lifecycle is driven by support/challenge evidence and can still shift.</div> : null}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function layeredMemorySummary(
  memory?: {
    challengerPressure: number;
    contradictionShock: number;
    reviewShock: number;
    turnoverStress: number;
  }
) {
  if (!memory) return "Mem 0 / 0 / 0 / 0";
  return `Mem ${Math.round(memory.reviewShock)} / ${Math.round(memory.contradictionShock)} / ${Math.round(memory.challengerPressure)} / ${Math.round(memory.turnoverStress)}`;
}

function ecologyTone(status: "dominant" | "fragile" | "contested" | "fading") {
  if (status === "dominant") return "good" as const;
  if (status === "fragile") return "warn" as const;
  if (status === "fading") return "bad" as const;
  return "accent" as const;
}

function groupEcologyTone(status: "stable" | "pressured" | "contested" | "turnover") {
  if (status === "stable") return "good" as const;
  if (status === "pressured") return "warn" as const;
  if (status === "turnover") return "bad" as const;
  return "accent" as const;
}
