"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ClientOnly } from "@/components/client-only";
import { Panel, Pill, SecondaryButton, SectionTitle } from "@/components/ui";
import { useCopymeStore } from "@/store/use-copyme-store";

export default function DashboardPage() {
  return (
    <ClientOnly fallback={<DashboardSkeleton />}>
      <DashboardPageContent />
    </ClientOnly>
  );
}

function DashboardPageContent() {
  const personaModel = useCopymeStore((state) => state.personaModel);
  const sessions = useCopymeStore((state) => state.sessions);
  const rules = useCopymeStore((state) => state.rules);
  const studentTemplates = useCopymeStore((state) => state.studentTemplates);
  const resetMockState = useCopymeStore((state) => state.resetMockState);

  const recentSessions = useMemo(
    () => [...sessions].sort((a, b) => (b.startedAt || b.date || "").localeCompare(a.startedAt || a.date || "")).slice(0, 3),
    [sessions]
  );

  const recentRules = useMemo(
    () => [...rules].sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt)).slice(0, 3),
    [rules]
  );

  return (
    <div className="space-y-6">
      <SectionTitle
        kicker="总览"
        title="Persona Training Workbench"
        subtitle="用于训练、观察和回看 teacher persona 复制效果的控制台。"
        right={<Pill tone="accent">有状态 MVP</Pill>}
      />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.95fr]">
        <Panel title="当前 Persona Model" subtitle="版本化的 teacher persona 快照" className="h-full">
          <div className="grid gap-4 md:grid-cols-2">
            <Metric label="版本" value={personaModel.version} />
            <Metric label="成熟度" value={`${personaModel.maturity}/100`} />
            <Metric label="Sessions 总数" value={String(sessions.length)} />
            <Metric label="已接受规则" value={String(personaModel.acceptedRuleIds.length)} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Pill tone="good">Decision-first</Pill>
            <Pill tone="accent">可追溯</Pill>
            <Pill tone="warn">Proxy drift 监测中</Pill>
          </div>
        </Panel>

        <Panel title="快速开始" subtitle="训练流程的快捷入口">
          <div className="flex flex-col gap-3">
            <Link
              href="/training-studio"
              className="inline-flex w-full items-center justify-center rounded-xl border border-accent/30 bg-accent/12 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/18"
            >
              开始新训练
            </Link>
            <Link
              href="/proxy-review"
              className="inline-flex w-full items-center justify-center rounded-xl border border-line bg-white/5 px-4 py-2 text-sm font-medium text-text transition hover:bg-white/8"
            >
              运行 Proxy Review
            </Link>
            <SecondaryButton className="w-full" onClick={resetMockState}>
              重置 Mock State
            </SecondaryButton>
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr_1fr]">
        <Panel title="最近 Sessions" subtitle="最近 3 次训练 session">
          <div className="space-y-3">
            {recentSessions.map((session) => (
              <div key={session.id} className="rounded-xl border border-line bg-black/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{session.title}</div>
                  <Pill tone={session.status === "active" ? "good" : session.status === "completed" ? "accent" : "default"}>{session.status}</Pill>
                </div>
                <div className="mt-1 text-xs text-muted">
                  {session.date || session.startedAt.slice(0, 10)} · {session.studentType} · {session.scenario}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="最近规则更新" subtitle="工作台中最新浮现的 rules">
          <div className="space-y-3">
            {recentRules.map((rule) => (
              <div key={rule.id} className="rounded-xl border border-line bg-black/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium leading-5">{rule.text}</div>
                  <Pill tone="accent">{rule.layer}</Pill>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span>Conf {Math.round(rule.confidence * 100)}%</span>
                  <span>·</span>
                  <span>{rule.status}</span>
                  <span>·</span>
                  <span>{rule.sourceSessionIds.join(", ")}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Student Templates" subtitle="用于训练 session 的快速启动预设">
          <div className="grid gap-3">
            {studentTemplates.map((template) => (
              <div key={template.id} className="rounded-xl border border-line bg-black/20 p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{template.name}</div>
                  <Pill tone="accent">{template.defaultLevel}</Pill>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted">{template.summary}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <SectionTitle
        kicker="Overview"
        title="Persona Training Workbench"
        subtitle="Loading workspace state..."
        right={<Pill tone="accent">Hydrating</Pill>}
      />
      <Panel title="Workspace" subtitle="Waiting for client state to mount">
        <div className="h-32 rounded-2xl border border-dashed border-line bg-black/20" />
      </Panel>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-black/20 p-4">
      <div className="text-[11px] uppercase tracking-[0.24em] text-muted">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}
