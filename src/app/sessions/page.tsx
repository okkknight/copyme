"use client";

import { useMemo, useState } from "react";
import { ClientOnly } from "@/components/client-only";
import { Panel, Pill, PrimaryButton, SecondaryButton, SectionTitle, Select } from "@/components/ui";
import { selectSessionRuleObjects } from "@/lib/selectors";
import type { PersonaRule, Session } from "@/lib/types";
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
  const selectedSessionId = useCopymeStore((state) => state.selectedSessionId);
  const sessionFilterStudentType = useCopymeStore((state) => state.sessionFilterStudentType);
  const sessionRuleStatusFilter = useCopymeStore((state) => state.sessionRuleStatusFilter);
  const setSessionFilterStudentType = useCopymeStore((state) => state.setSessionFilterStudentType);
  const setSessionRuleStatusFilter = useCopymeStore((state) => state.setSessionRuleStatusFilter);
  const selectSession = useCopymeStore((state) => state.selectSession);
  const acceptRule = useCopymeStore((state) => state.acceptRule);
  const rejectRule = useCopymeStore((state) => state.rejectRule);
  const observeRule = useCopymeStore((state) => state.observeRule);

  const [selectedRuleId, setSelectedRuleId] = useState<string | undefined>(undefined);

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

  const visibleRules = useMemo(() => {
    if (!visibleSession) return [];
    const sessionRules = selectSessionRuleObjects({ rules }, visibleSession);
    if (sessionRuleStatusFilter === "all") return sessionRules;
    return sessionRules.filter((rule) => rule.status === sessionRuleStatusFilter);
  }, [rules, sessionRuleStatusFilter, visibleSession]);

  const activeRuleId = selectedRuleId ?? visibleRules[0]?.id;

  function handleAcceptSelected() {
    if (!activeRuleId || !visibleSession) return;
    acceptRule(activeRuleId, visibleSession.id);
  }

  function handleRejectSelected() {
    if (!activeRuleId || !visibleSession) return;
    rejectRule(activeRuleId, visibleSession.id);
  }

  function handleObserveSelected() {
    if (!activeRuleId || !visibleSession) return;
    observeRule(activeRuleId, visibleSession.id);
  }

  function handleAddToPersonaModel() {
    if (!activeRuleId || !visibleSession) return;
    acceptRule(activeRuleId, visibleSession.id);
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        kicker="History"
        title="Sessions"
        subtitle="Browse prior training sessions, inspect transcripts, and promote candidate rules into the persona model."
      />

      <Panel title="Filter Bar" subtitle="Use simple filters for the MVP">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-muted">Student Type</div>
            <Select value={sessionFilterStudentType} onChange={(event) => setSessionFilterStudentType(event.target.value)}>
              <option value="all">All</option>
              <option value="shy beginner">Shy Beginner</option>
              <option value="smart but lazy">Smart But Lazy</option>
              <option value="anxious learner">Anxious Learner</option>
              <option value="argumentative learner">Argumentative Learner</option>
            </Select>
          </div>
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-muted">Rule State</div>
            <Select value={sessionRuleStatusFilter} onChange={(event) => setSessionRuleStatusFilter(event.target.value as typeof sessionRuleStatusFilter)}>
              <option value="all">All</option>
              <option value="candidate">Candidate</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="observed">Observed</option>
            </Select>
          </div>
          <div className="flex items-end">
            <Pill tone="accent">{filteredSessions.length} sessions</Pill>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-line bg-black/20 p-3 text-xs leading-5 text-muted">
          Session filters are persisted locally. The detail panel is driven from the shared store, not a page-local mock.
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[440px_minmax(0,1fr)]">
        <Panel title="Session List" subtitle="Click a card to open details">
          <div className="space-y-3">
            {filteredSessions.map((session) => (
              <button
                key={session.id}
                onClick={() => {
                  selectSession(session.id);
                  setSelectedRuleId(session.candidateRuleIds[0]);
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
                <div className="mt-3 text-xs text-muted">{session.hasKeyMoments ? "Has key moments" : "No key moments flagged"}</div>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Session Detail" subtitle="Summary, transcript, and extracted candidate rules">
          {visibleSession ? (
              <SessionDetail
                session={visibleSession}
                visibleRules={visibleRules}
              selectedRuleId={activeRuleId}
              onSelectRule={setSelectedRuleId}
              onAccept={handleAcceptSelected}
              onReject={handleRejectSelected}
              onObserve={handleObserveSelected}
              onAddToPersonaModel={handleAddToPersonaModel}
            />
          ) : (
            <div className="text-sm text-muted">No session selected.</div>
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
        kicker="History"
        title="Sessions"
        subtitle="Loading session history..."
        right={<Pill tone="accent">Hydrating</Pill>}
      />
      <Panel title="Workspace" subtitle="Waiting for client state to mount">
        <div className="h-[560px] rounded-2xl border border-dashed border-line bg-black/20" />
      </Panel>
    </div>
  );
}

function SessionDetail({
  session,
  visibleRules,
  selectedRuleId,
  onSelectRule,
  onAccept,
  onReject,
  onObserve,
  onAddToPersonaModel
}: {
  session: Session;
  visibleRules: PersonaRule[];
  selectedRuleId?: string;
  onSelectRule: (id: string) => void;
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
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-black/20 p-4">
          <div className="text-[11px] uppercase tracking-[0.24em] text-muted">Session Meta</div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <Meta label="Date" value={session.date || session.startedAt.slice(0, 10)} />
            <Meta label="Duration" value={session.duration || `${session.roundCount} rounds`} />
            <Meta label="Scenario" value={session.scenario} />
            <Meta label="Key Moments" value={session.hasKeyMoments ? "Yes" : "No"} />
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
          <div className="text-sm font-semibold uppercase tracking-[0.24em] text-text">Extracted Candidate Rules</div>
          <div className="space-y-3">
            {visibleRules.map((rule) => (
              <button
                key={rule.id}
                onClick={() => onSelectRule(rule.id)}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  selectedRuleId === rule.id ? "border-accent/40 bg-accent/12" : "border-line bg-black/20 hover:bg-white/[0.05]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <Pill tone="accent">{rule.layer}</Pill>
                  <Pill>{rule.status}</Pill>
                </div>
                <p className="mt-3 text-sm leading-6 text-text">{rule.text}</p>
                <p className="mt-2 text-xs leading-5 text-muted">{rule.evidence}</p>
                <p className="mt-2 text-xs text-muted">Source sessions: {rule.sourceSessionIds.join(", ")}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Pill>{Math.round(rule.confidence * 100)}%</Pill>
                  <Pill tone="warn">{rule.status}</Pill>
                </div>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <PrimaryButton onClick={onAccept}>Accept Rule</PrimaryButton>
            <SecondaryButton onClick={onReject}>Reject Rule</SecondaryButton>
            <SecondaryButton onClick={onObserve}>Observe Later</SecondaryButton>
            <SecondaryButton onClick={onAddToPersonaModel}>Add to Persona Model</SecondaryButton>
          </div>

          <div className="rounded-2xl border border-line bg-black/20 p-4 text-xs leading-5 text-muted">
            Rule operations update the shared store immediately. The persona model page will reflect accepted rule changes right away.
          </div>
        </div>
      </div>
    </div>
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
