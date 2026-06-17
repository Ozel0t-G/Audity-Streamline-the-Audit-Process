import { ReactNode } from "react";

type Variant = "neutral" | "info" | "success" | "warning" | "error";

const VARIANT: Record<Variant, string> = {
  neutral: "border-audity-borderStrong bg-audity-panelAlt text-audity-secondary",
  info: "border-audity-primary bg-audity-primary/10 text-audity-primary",
  success: "border-audity-success bg-audity-success/10 text-audity-success",
  warning: "border-audity-warning bg-audity-warning/10 text-audity-warning",
  error: "border-audity-error bg-audity-error/10 text-audity-error"
};

type BadgeProps = {
  variant?: Variant;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
};

export function Badge({ variant = "neutral", children, icon, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-audity border px-2 py-0.5 text-xs font-semibold ${VARIANT[variant]} ${className}`}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {children}
    </span>
  );
}
