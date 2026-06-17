import { ReactNode } from "react";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

const SEV_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info"
};

const SEV_CLASSES: Record<Severity, string> = {
  critical: "border-audity-error bg-audity-error/15 text-audity-error",
  high: "border-audity-warning bg-audity-warning/20 text-audity-warning",
  medium: "border-audity-warning bg-audity-warning/10 text-audity-warning",
  low: "border-audity-borderStrong bg-audity-panelAlt text-audity-secondary",
  info: "border-audity-primary bg-audity-primary/10 text-audity-primary"
};

const SEV_ICONS: Record<Severity, ReactNode> = {
  critical: (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2L1 21h22L12 2zm0 6l8 14H4l8-14zm-1 4v5h2v-5h-2zm0 6v2h2v-2h-2z" />
    </svg>
  ),
  high: (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  ),
  medium: (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12" y2="16" />
    </svg>
  ),
  low: (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  ),
  info: (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <circle cx="12" cy="8" r="0.5" />
    </svg>
  )
};

function normalize(input: string | Severity | null | undefined): Severity {
  if (!input) return "info";
  const key = input.toString().toLowerCase();
  if (key.startsWith("crit")) return "critical";
  if (key.startsWith("high")) return "high";
  if (key.startsWith("med")) return "medium";
  if (key.startsWith("low")) return "low";
  return "info";
}

type SeverityBadgeProps = {
  level: string | Severity | null | undefined;
  label?: string;
  className?: string;
};

export function SeverityBadge({ level, label, className = "" }: SeverityBadgeProps) {
  const severity = normalize(level);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-audity border px-2 py-0.5 text-xs font-semibold ${SEV_CLASSES[severity]} ${className}`}
      aria-label={`Severity ${SEV_LABEL[severity]}`}
    >
      <span className="shrink-0">{SEV_ICONS[severity]}</span>
      <span>{label ?? SEV_LABEL[severity]}</span>
    </span>
  );
}
