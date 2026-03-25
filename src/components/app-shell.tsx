"use client";

import { useEffect } from "react";
import { SidebarLink } from "@/components/ui";
import { useCopymeStore } from "@/store/use-copyme-store";

const nav = [
  { href: "/", label: "Dashboard 总览", detail: "总览 / 快速开始" },
  { href: "/training-studio", label: "Training Studio 训练台", detail: "实时学生模拟" },
  { href: "/sessions", label: "Sessions 记录", detail: "历史 / 规则提取" },
  { href: "/persona-model", label: "Persona Model 人格模型", detail: "版本化规则层" },
  { href: "/proxy-review", label: "Proxy Review 对照", detail: "对比你与 proxy" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void useCopymeStore.getState().hydrateProjectFile();
  }, []);

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(61,132,255,0.18),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(15,172,136,0.10),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_22%)]" />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-grid bg-[size:36px_36px] opacity-[0.06]" />
      <div className="grid min-h-screen grid-cols-[280px_minmax(0,1fr)]">
        <aside className="sticky top-0 flex h-screen flex-col border-r border-line bg-black/20 px-4 py-4 backdrop-blur">
          <div className="rounded-2xl border border-line bg-panel/80 p-4 shadow-panel">
            <div className="text-[11px] uppercase tracking-[0.32em] text-muted">Persona Training Workbench</div>
            <div className="mt-2 text-lg font-semibold leading-6">Teacher Persona Lab 教师人格实验台</div>
            <p className="mt-2 text-xs leading-5 text-muted">
              桌面式控制台，用于捕捉决策模式、提取规则，并检查 proxy 偏移。
            </p>
          </div>
          <div className="mt-4 space-y-2">
            {nav.map((item) => (
              <SidebarLink key={item.href} {...item} />
            ))}
          </div>
          <div className="mt-auto rounded-2xl border border-line bg-panel/80 p-4 text-xs leading-5 text-muted shadow-panel">
            <div className="text-[11px] uppercase tracking-[0.3em] text-text">Control Notes</div>
            <p className="mt-2">
              仅限 MVP。优先使用 mock data。所有决策都必须能追溯到 sessions。
            </p>
          </div>
        </aside>
        <main className="min-w-0 p-6">
          <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
