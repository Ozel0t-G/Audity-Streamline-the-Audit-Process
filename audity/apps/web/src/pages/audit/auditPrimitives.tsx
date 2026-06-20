import type { ReactNode } from "react";

export function text(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

export function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function dateValue(value: unknown) {
  return text(value).slice(0, 10);
}

export function readableLabel(value: unknown) {
  return text(value, "-").replace(/_/g, " ");
}

export function toneClass(value: string | null | undefined) {
  if (["critical", "blocked", "rejected", "failed"].includes(String(value))) return "border-audity-error text-audity-error";
  if (["high", "changes_requested", "ready", "ready_for_review", "received", "validated"].includes(String(value))) return "border-audity-warning text-audity-warning";
  if (["approved", "signed", "closed", "passed", "final"].includes(String(value))) return "border-audity-success text-audity-success";
  return "border-audity-borderStrong text-audity-secondary";
}

export function Field({
  label,
  children,
  wide,
  required,
  hint
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
  required?: boolean;
  hint?: ReactNode;
}) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-xs font-medium tracking-wide text-audity-muted">
        {label}
        {required ? <span className="ml-0.5 text-audity-error" aria-hidden="true">*</span> : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-audity-muted">{hint}</span> : null}
    </label>
  );
}

export function Pill({ value }: { value: unknown }) {
  return (
    <span className={`inline-flex rounded-audity border px-2 py-0.5 text-xs font-semibold capitalize ${toneClass(text(value))}`}>
      {readableLabel(value)}
    </span>
  );
}

export function Panel({
  title,
  subtitle,
  action,
  children
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-audity border border-audity-border bg-audity-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-audity-border px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-audity-text">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-audity-muted">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
      <p className="text-xs font-medium text-audity-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-audity-text">{value}</p>
    </div>
  );
}
