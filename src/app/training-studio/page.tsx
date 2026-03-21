"use client";

import { useMemo, useState } from "react";
import { ClientOnly } from "@/components/client-only";
import { Panel, Pill, PrimaryButton, SecondaryButton, SectionTitle, Select, Textarea } from "@/components/ui";
import { extractSessionInsights } from "@/lib/extractor";
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
  const rules = useCopymeStore((state) => state.rules);
  const sessions = useCopymeStore((state) => state.sessions);
  const selectedStudentTemplateId = useCopymeStore((state) => state.selectedStudentTemplateId ?? state.studentTemplates[0]?.id);
  const draft = useCopymeStore((state) => state.trainingDraft);
  const setTrainingDraft = useCopymeStore((state) => state.setTrainingDraft);
  const selectStudentTemplate = useCopymeStore((state) => state.selectStudentTemplate);
  const startSession = useCopymeStore((state) => state.startSession);
  const appendTeacherTurn = useCopymeStore((state) => state.appendTeacherTurn);
  const completeSession = useCopymeStore((state) => state.completeSession);
  const selectSession = useCopymeStore((state) => state.selectSession);
  const resetMockState = useCopymeStore((state) => state.resetMockState);
  const acceptRule = useCopymeStore((state) => state.acceptRule);
  const rejectRule = useCopymeStore((state) => state.rejectRule);

  const activeSessionId = useCopymeStore((state) => state.activeSessionId);
  const selectedSessionId = useCopymeStore((state) => state.selectedSessionId);
  const activeSession = useMemo(() => sessions.find((item) => item.id === activeSessionId), [activeSessionId, sessions]);
  const selectedSession = useMemo(() => sessions.find((item) => item.id === selectedSessionId), [selectedSessionId, sessions]);
  const currentSession = activeSession ?? selectedSession ?? sessions[0];
  const sessionProfile = useMemo(
    () => studentTemplates.find((item) => item.id === currentSession?.studentProfileId) ?? studentTemplates[0],
    [currentSession?.studentProfileId, studentTemplates]
  );
  const controlProfile = useMemo(
    () => studentTemplates.find((item) => item.id === selectedStudentTemplateId) ?? studentTemplates[0],
    [selectedStudentTemplateId, studentTemplates]
  );
  const [focusTurnId, setFocusTurnId] = useState<string | undefined>(currentSession?.transcript[0]?.id);
  const [saveMessage, setSaveMessage] = useState("Ready");

  const extractorResult = useMemo(() => {
    if (!currentSession || !sessionProfile) return null;
    return extractSessionInsights(currentSession, sessionProfile, rules);
  }, [currentSession, rules, sessionProfile]);

  const candidateRules = useMemo(() => {
    if (!extractorResult) return [];
    return extractorResult.candidateRuleIds
      .map((ruleId) => rules.find((rule) => rule.id === ruleId))
      .filter(Boolean);
  }, [extractorResult, rules]);

  const studentSummary = useMemo(
    () => [
      `Level: ${sessionProfile.level}`,
      `Attitude: ${sessionProfile.attitude}`,
      `Confidence: ${sessionProfile.confidence}`,
      `Emotion: ${sessionProfile.emotion}`,
      `Error: ${sessionProfile.errorPattern}`,
      `Goal: ${sessionProfile.scenarioGoal}`
    ],
    [sessionProfile]
  );

  const sessionTurns = currentSession?.transcript ?? [];

  function handleTemplateChange(templateId: string) {
    selectStudentTemplate(templateId);
    setSaveMessage(`Selected template: ${studentTemplates.find((item) => item.id === templateId)?.name ?? templateId}`);
  }

  function handleStartSession() {
    startSession(selectedStudentTemplateId);
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
    const ruleId = candidateRules[0]?.id ?? currentSession?.candidateRuleIds[0];
    if (!ruleId || !currentSession) return;
    acceptRule(ruleId, currentSession.id);
    setSaveMessage(`Accepted ${ruleId}`);
  }

  function handleMarkNotLikeMe() {
    const ruleId = candidateRules[0]?.id ?? currentSession?.candidateRuleIds[0];
    if (!ruleId || !currentSession) return;
    rejectRule(ruleId, currentSession.id);
    setSaveMessage(`Rejected ${ruleId}`);
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        kicker="Core Workspace"
        title="Training Studio"
        subtitle="Desktop experiment console for live teacher-student interaction, persona observation, and session timeline inspection."
        right={<Pill tone="good">{currentSession?.status ?? "no session"}</Pill>}
      />

      <Panel className="border-accent/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-muted">Current Student Summary</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {studentSummary.map((item) => (
                <Pill key={item}>{item}</Pill>
              ))}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-[0.28em] text-muted">Current Round</div>
            <div className="mt-2 text-2xl font-semibold">Round {currentSession?.roundCount ?? 0}</div>
            <div className="mt-1 text-xs text-muted">{saveMessage}</div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <Panel title="Student Control Panel" subtitle="Parameterize the simulated learner" className="h-full">
          <div className="space-y-4">
            <ControlField label="Student Template">
              <Select value={selectedStudentTemplateId} onChange={(event) => handleTemplateChange(event.target.value)}>
                {studentTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </Select>
            </ControlField>
            <ControlField label="English Level">
              <Select value={controlProfile.level} onChange={() => undefined}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </Select>
            </ControlField>
            <ControlField label="Attitude">
              <Select value={controlProfile.attitude} onChange={() => undefined}>
                <option value="shy">Shy</option>
                <option value="smart-but-lazy">Smart but lazy</option>
                <option value="anxious">Anxious</option>
                <option value="argumentative">Argumentative</option>
              </Select>
            </ControlField>
            <ControlField label="Confidence">
              <Select value={controlProfile.confidence} onChange={() => undefined}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </Select>
            </ControlField>
            <ControlField label="Emotion">
              <Select value={controlProfile.emotion} onChange={() => undefined}>
                <option value="calm">Calm</option>
                <option value="anxious">Anxious</option>
                <option value="resistant">Resistant</option>
                <option value="self-conscious">Self-conscious</option>
                <option value="confident">Confident</option>
              </Select>
            </ControlField>
            <ControlField label="Error Pattern">
              <Select value={controlProfile.errorPattern} onChange={() => undefined}>
                <option value="grammar">Grammar</option>
                <option value="pronunciation">Pronunciation</option>
                <option value="vocabulary">Vocabulary</option>
                <option value="meaning">Meaning</option>
                <option value="organization">Organization</option>
              </Select>
            </ControlField>
            <ControlField label="Scenario Goal">
              <Select value={controlProfile.scenarioGoal} onChange={() => undefined}>
                <option value="daily talk">Daily talk</option>
                <option value="interview">Interview</option>
                <option value="opinion">Opinion</option>
                <option value="storytelling">Storytelling</option>
                <option value="debate">Debate</option>
              </Select>
            </ControlField>
            <div className="grid grid-cols-2 gap-3">
              <PrimaryButton onClick={handleStartSession}>Start Session</PrimaryButton>
              <SecondaryButton onClick={handleResetStudent}>Reset Student</SecondaryButton>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SecondaryButton onClick={handleCompleteSession}>Complete Session</SecondaryButton>
              <SecondaryButton onClick={handleResetMockState}>Reset Mock State</SecondaryButton>
            </div>
            <SecondaryButton onClick={() => setSaveMessage(`Saved local template snapshot for ${controlProfile.name}`)} className="w-full">
              Save as Template
            </SecondaryButton>
            <div className="rounded-xl border border-line bg-black/25 p-3 text-xs leading-5 text-muted">{controlProfile.summary}</div>
          </div>
        </Panel>

        <Panel title="Live Conversation Area" subtitle="Text-based interaction stream with turn tracking and simulated replies" className="h-full">
          <div className="flex h-full min-h-[760px] flex-col">
            <div className="rounded-2xl border border-line bg-black/20 p-4">
              <div className="text-[11px] uppercase tracking-[0.28em] text-muted">Student Snapshot</div>
              <div className="mt-2 text-sm leading-6 text-text">{sessionProfile.summary}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Pill tone="accent">{sessionProfile.accentNote}</Pill>
                <Pill tone="warn">{sessionProfile.failureMode}</Pill>
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
                  Voice input disabled
                </button>
              </div>
              <Textarea
                value={draft}
                onChange={(event) => setTrainingDraft(event.target.value)}
                placeholder="Type the teacher response you want to test..."
                className="mt-3 min-h-[96px]"
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-xs text-muted">Tip: use direct correction, reassurance, or challenge to see the simulated student react.</div>
                <PrimaryButton onClick={handleSendMessage}>Send</PrimaryButton>
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Persona Observation Panel" subtitle="Temporary notes and candidate rule extraction" className="h-full">
          <div className="space-y-4">
            <ObservationBlock
              title="Detected Teaching Behaviors"
              items={extractorResult?.detectedTeachingBehaviors.length ? extractorResult.detectedTeachingBehaviors : ["Waiting for teacher input"]}
            />
            <ObservationBlock
              title="Temporary Style Notes"
              items={extractorResult?.temporaryStyleNotes.length ? extractorResult.temporaryStyleNotes : ["No style notes yet"]}
            />
            <ObservationBlock
              title="Temporary Decision Notes"
              items={extractorResult?.temporaryDecisionNotes.length ? extractorResult.temporaryDecisionNotes : ["No decision notes yet"]}
            />
            <ObservationBlock
              title="Candidate Persona Rules"
              items={
                candidateRules.length
                  ? candidateRules.map((rule) => `${rule?.text ?? "Pending rule"} (${rule?.status ?? "candidate"})`)
                  : ["No candidate rules extracted yet"]
              }
            />
            <div className="grid grid-cols-2 gap-3">
              <SecondaryButton className="w-full" onClick={handleMarkLikeMe}>
                Mark This As Like Me
              </SecondaryButton>
              <SecondaryButton className="w-full" onClick={handleMarkNotLikeMe}>
                Mark This As Not Like Me
              </SecondaryButton>
            </div>
            <div className="rounded-2xl border border-line bg-black/20 p-4 text-xs leading-5 text-muted">
              {extractorResult?.candidateRuleIds.length
                ? `Extractor surfaced ${extractorResult.candidateRuleIds.length} candidate rule(s) from the current session.`
                : "Training state is saved locally in your browser. Refreshing the page will restore this session."}
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Session Timeline" subtitle="Click a node to jump to the matching turn in the stream">
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
        kicker="Core Workspace"
        title="Training Studio"
        subtitle="Loading simulated session workspace..."
        right={<Pill tone="accent">Hydrating</Pill>}
      />
      <Panel title="Workspace" subtitle="Waiting for client state to mount">
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
        {items.map((item) => (
          <div key={item} className="rounded-xl border border-line/70 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-muted">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
