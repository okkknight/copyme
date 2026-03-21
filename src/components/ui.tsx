"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function SectionTitle({
  kicker,
  title,
  subtitle,
  right
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        {kicker ? <div className="text-[11px] uppercase tracking-[0.28em] text-muted">{kicker}</div> : null}
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-text">{title}</h2>
        {subtitle ? <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">{subtitle}</p> : null}
      </div>
      {right ? <div>{right}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  subtitle,
  children,
  className,
  action
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={cn("rounded-2xl border border-line bg-panel/90 shadow-panel backdrop-blur", className)}>
      {(title || subtitle || action) && (
        <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-4">
          <div>
            {title ? <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-text">{title}</h3> : null}
            {subtitle ? <p className="mt-1 text-xs leading-5 text-muted">{subtitle}</p> : null}
          </div>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Pill({
  children,
  tone = "default"
}: {
  children: ReactNode;
  tone?: "default" | "good" | "warn" | "bad" | "accent";
}) {
  const toneClass =
    tone === "good"
      ? "border-good/30 bg-good/10 text-good"
      : tone === "warn"
        ? "border-warn/30 bg-warn/10 text-warn"
        : tone === "bad"
          ? "border-bad/30 bg-bad/10 text-bad"
          : tone === "accent"
            ? "border-accent/30 bg-accent/10 text-accent"
            : "border-line bg-white/5 text-text";

  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium", toneClass)}>{children}</span>;
}

export function PrimaryButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center rounded-xl border border-accent/30 bg-accent/12 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/18 disabled:cursor-not-allowed disabled:opacity-40",
        className
      )}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center rounded-xl border border-line bg-white/5 px-4 py-2 text-sm font-medium text-text transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-40",
        className
      )}
    >
      {children}
    </button>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-xl border border-line bg-black/30 px-3 py-2 text-sm text-text outline-none transition placeholder:text-muted/70 focus:border-accent/50",
        className
      )}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full rounded-xl border border-line bg-black/30 px-3 py-2 text-sm text-text outline-none transition placeholder:text-muted/70 focus:border-accent/50",
        className
      )}
    />
  );
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "w-full rounded-xl border border-line bg-black/30 px-3 py-2 text-sm text-text outline-none transition focus:border-accent/50",
        className
      )}
    />
  );
}

export function SidebarLink({ href, label, detail }: { href: string; label: string; detail?: string }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={cn(
        "block w-full rounded-xl border px-3 py-3 text-left transition",
        active
          ? "border-accent/30 bg-accent/12 text-text"
          : "border-transparent bg-white/[0.03] text-muted hover:border-line hover:bg-white/[0.05] hover:text-text"
      )}
    >
      <div className="text-sm font-medium">{label}</div>
      {detail ? <div className="mt-1 text-[11px] leading-4 text-muted">{detail}</div> : null}
    </Link>
  );
}
