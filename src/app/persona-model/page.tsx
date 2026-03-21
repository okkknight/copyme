"use client";

import { ClientOnly } from "@/components/client-only";
import { Panel, Pill, PrimaryButton, SectionTitle } from "@/components/ui";
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
  const resetMockState = useCopymeStore((state) => state.resetMockState);
  const styleRules = rules.filter((rule) => rule.layer === "style" && rule.status === "accepted");
  const decisionRules = rules.filter((rule) => rule.layer === "decision" && rule.status === "accepted");
  const valueRules = rules.filter((rule) => rule.layer === "value" && rule.status === "accepted");
  const boundaryRules = rules.filter((rule) => rule.layer === "boundary" && rule.status === "accepted");

  return (
    <div className="space-y-6">
      <SectionTitle
        kicker="Model"
        title="Persona Model"
        subtitle="A structured, versioned and traceable teacher persona model split into style, decision, value, and boundary layers."
        right={<PrimaryButton onClick={resetMockState}>Reset Mock State</PrimaryButton>}
      />

      <Panel title="Model Summary" subtitle="Current version snapshot and traceability metrics">
        <div className="grid gap-4 lg:grid-cols-4">
          <SummaryMetric label="Version" value={personaModel.version} />
          <SummaryMetric label="Updated At" value={personaModel.updatedAt.slice(0, 19).replace("T", " ")} />
          <SummaryMetric label="Rules" value={String(personaModel.acceptedRuleIds.length)} />
          <SummaryMetric label="Source Sessions" value={String(personaModel.sourceSessionIds.length)} />
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <LayerPanel title="Style Layer" count={styleRules.length} rules={styleRules} allRules={rules} />
        <LayerPanel title="Decision Layer" count={decisionRules.length} rules={decisionRules} allRules={rules} />
        <LayerPanel title="Value Layer" count={valueRules.length} rules={valueRules} allRules={rules} />
        <LayerPanel title="Boundary Layer" count={boundaryRules.length} rules={boundaryRules} allRules={rules} />
      </div>
    </div>
  );
}

function PersonaModelSkeleton() {
  return (
    <div className="space-y-6">
      <SectionTitle
        kicker="Model"
        title="Persona Model"
        subtitle="Loading persona model..."
        right={<Pill tone="accent">Hydrating</Pill>}
      />
      <Panel title="Workspace" subtitle="Waiting for client state to mount">
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
  count,
  rules
}: {
  title: string;
  count: number;
  rules: Array<{ id: string; text: string; layer: string; confidence: number; sourceSessionIds: string[]; status: string }>;
  allRules: Array<{ id: string; status: string }>;
}) {
  return (
    <Panel title={title} subtitle={`Traceable rules in this layer (${count})`}>
      <div className="space-y-3">
        {rules.map((rule) => (
          <div key={rule.id} className="rounded-2xl border border-line bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <Pill tone="accent">{rule.layer}</Pill>
              <Pill>{rule.status}</Pill>
            </div>
            <p className="mt-3 text-sm leading-6 text-text">{rule.text}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill>{Math.round(rule.confidence * 100)}%</Pill>
              <Pill tone="warn">{rule.status}</Pill>
            </div>
            <div className="mt-3 text-xs text-muted">Source sessions: {rule.sourceSessionIds.join(", ")}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
