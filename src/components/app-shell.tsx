"use client";

import { SidebarLink } from "@/components/ui";

const nav = [
  { href: "/", label: "Dashboard", detail: "Overview / quick start" },
  { href: "/training-studio", label: "Training Studio", detail: "Live student simulation" },
  { href: "/sessions", label: "Sessions", detail: "History / rule extraction" },
  { href: "/persona-model", label: "Persona Model", detail: "Versioned rule layers" },
  { href: "/proxy-review", label: "Proxy Review", detail: "Compare you vs proxy" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(61,132,255,0.18),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(15,172,136,0.10),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_22%)]" />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-grid bg-[size:36px_36px] opacity-[0.06]" />
      <div className="grid min-h-screen grid-cols-[280px_minmax(0,1fr)]">
        <aside className="sticky top-0 flex h-screen flex-col border-r border-line bg-black/20 px-4 py-4 backdrop-blur">
          <div className="rounded-2xl border border-line bg-panel/80 p-4 shadow-panel">
            <div className="text-[11px] uppercase tracking-[0.32em] text-muted">Persona Training Workbench</div>
            <div className="mt-2 text-lg font-semibold leading-6">Teacher Persona Lab</div>
            <p className="mt-2 text-xs leading-5 text-muted">
              A desktop console for capturing decision patterns, extracting rules, and reviewing proxy drift.
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
              MVP only. Mock data first. Decisions must stay traceable to sessions.
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
