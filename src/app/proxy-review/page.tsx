"use client";

import { useMemo, useState } from "react";
import { ClientOnly } from "@/components/client-only";
import { Panel, Pill, PrimaryButton, SecondaryButton, SectionTitle, Select, Textarea } from "@/components/ui";
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
  const sessions = useCopymeStore((state) => state.sessions);
  const personaModel = useCopymeStore((state) => state.personaModel);
  const proxyReviewFeedbackDraft = useCopymeStore((state) => state.proxyReviewFeedbackDraft);
  const setProxyReviewFeedbackDraft = useCopymeStore((state) => state.setProxyReviewFeedbackDraft);
  const selectProxyReviewCase = useCopymeStore((state) => state.selectProxyReviewCase);
  const selectReviewLabel = useCopymeStore((state) => state.selectReviewLabel);
  const writeReviewFeedbackBack = useCopymeStore((state) => state.writeReviewFeedbackBack);
  const resetMockState = useCopymeStore((state) => state.resetMockState);

  const reviewCase = useMemo(
    () => proxyReviewCases.find((item) => item.id === selectedCaseId) ?? proxyReviewCases[0],
    [proxyReviewCases, selectedCaseId]
  );
  const [modelVersion, setModelVersion] = useState(reviewCase?.modelVersion ?? personaModel.version);
  const [studentTemplateId, setStudentTemplateId] = useState(reviewCase?.studentTemplateId ?? "");
  const [scenario, setScenario] = useState(reviewCase?.scenario ?? "interview");

  const reviewHistory = useMemo(
    () => ({
      status: reviewCase?.reviewStatus ?? "new",
      label: reviewCase?.selectedLabel ?? "none",
      writtenBack: Boolean(reviewCase?.writtenBackRuleIds?.length),
      updatedAt: reviewCase?.updatedAt ?? reviewCase?.createdAt ?? ""
    }),
    [reviewCase]
  );

  function runReview() {
    const nextCase =
      proxyReviewCases.find((item) => item.modelVersion === modelVersion && item.studentTemplateId === studentTemplateId && item.scenario === scenario) ??
      proxyReviewCases[(proxyReviewCases.findIndex((item) => item.id === reviewCase?.id) + 1) % proxyReviewCases.length];
    if (!nextCase) return;
    setModelVersion(nextCase.modelVersion);
    setStudentTemplateId(nextCase.studentTemplateId);
    setScenario(nextCase.scenario);
    selectProxyReviewCase(nextCase.id);
  }

  function writeBack() {
    if (!reviewCase) return;
    writeReviewFeedbackBack(reviewCase.id);
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        kicker="Proxy Lab"
        title="Proxy Review"
        subtitle="Compare your response against the AI proxy and label where the proxy is close, different, or completely off."
      />

      <Panel title="Review Controls" subtitle="Select the model version, learner template, and scenario before running the comparison">
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_auto]">
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
              <option value="daily talk">Daily talk</option>
              <option value="interview">Interview</option>
              <option value="opinion">Opinion</option>
              <option value="storytelling">Storytelling</option>
              <option value="debate">Debate</option>
            </Select>
          </Field>
          <div className="flex items-end">
            <PrimaryButton onClick={runReview} className="w-full">
              Run Review
            </PrimaryButton>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-black/20 p-3 text-xs leading-5 text-muted">
          <span>Review selections and feedback notes are saved in the shared store.</span>
          <SecondaryButton onClick={resetMockState}>Reset Mock State</SecondaryButton>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr_320px]">
        <Panel title="Your Response" subtitle="Human teacher baseline">
          <ResponseCard title="Prompt" text={reviewCase?.prompt ?? "No review case selected."} />
          <ResponseCard title="Response" text={reviewCase?.yourResponse ?? ""} />
        </Panel>

        <Panel title="Proxy Response" subtitle="AI proxy output for the same case">
          <ResponseCard title="Prompt" text={reviewCase?.prompt ?? "No review case selected."} />
          <ResponseCard title="Response" text={reviewCase?.proxyResponse ?? ""} />
        </Panel>

        <Panel title="Difference Labels" subtitle="Mark the nature of the mismatch">
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

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Review Notes" subtitle="Summary and suggested corrections">
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
            <Textarea
              value={proxyReviewFeedbackDraft}
              onChange={(event) => setProxyReviewFeedbackDraft(event.target.value)}
              className="min-h-[120px]"
              placeholder="Write feedback back into the training loop..."
            />
            <div className="flex flex-wrap gap-3">
              <PrimaryButton onClick={writeBack}>Write Feedback Back</PrimaryButton>
              <SecondaryButton onClick={() => setProxyReviewFeedbackDraft(reviewCase?.note ?? "Ready to review current proxy behavior.")}>Reset Note</SecondaryButton>
            </div>
            <div className="text-xs text-muted">
              {reviewCase?.reviewStatus === "written_back"
                ? "Feedback has been written back and rule corrections have been added."
                : "Feedback is waiting to be written back."}
            </div>
          </div>
        </Panel>

        <Panel title="Case Context" subtitle="Selected model and template context">
          <div className="space-y-3">
            <InfoRow label="Model Version" value={reviewCase?.modelVersion ?? modelVersion} />
            <InfoRow label="Student Template" value={reviewCase?.studentTemplateName ?? studentTemplateId} />
            <InfoRow label="Scenario" value={reviewCase?.scenario ?? scenario} />
            <InfoRow label="Selected Session Count" value={String(sessions.length)} />
            <div className="rounded-2xl border border-line bg-black/20 p-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-muted">Proxy State</div>
              <p className="mt-2 text-sm leading-6 text-text">
                The proxy review lab is designed to reveal where the model is too soft, too direct, too generic, or ignores decision boundaries.
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-black/20 p-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-muted">Review History</div>
              <div className="mt-3 space-y-2 text-sm">
                <div>status: {reviewHistory.status}</div>
                <div>label: {reviewHistory.label}</div>
                <div>written back: {reviewHistory.writtenBack ? "yes" : "no"}</div>
                <div>updated: {reviewHistory.updatedAt ? reviewHistory.updatedAt.slice(0, 19).replace("T", " ") : "-"}</div>
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
        subtitle="Loading comparison workspace..."
        right={<Pill tone="accent">Hydrating</Pill>}
      />
      <Panel title="Workspace" subtitle="Waiting for client state to mount">
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
