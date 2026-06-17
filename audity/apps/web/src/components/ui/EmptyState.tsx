import { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  size?: "sm" | "md";
};

export function EmptyState({
  title,
  description,
  icon,
  action,
  className = "",
  size = "md"
}: EmptyStateProps) {
  const padding = size === "sm" ? "px-4 py-6" : "px-6 py-10";
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-audity border border-dashed border-audity-border bg-audity-panel/40 text-center ${padding} ${className}`}
      role="status"
    >
      {icon ? (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-audity-panelAlt text-audity-secondary" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <h3 className="text-sm font-semibold text-audity-text">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-md text-xs text-audity-secondary">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
