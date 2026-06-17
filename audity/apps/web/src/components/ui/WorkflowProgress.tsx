import { ReactNode } from "react";

export type WorkflowStep<TKey extends string = string> = {
  key: TKey;
  label: ReactNode;
  status: "done" | "current" | "todo" | "blocked";
  hint?: string;
};

type WorkflowProgressProps<TKey extends string> = {
  steps: WorkflowStep<TKey>[];
  onSelect?: (key: TKey) => void;
  className?: string;
};

const STATUS_DOT: Record<WorkflowStep["status"], string> = {
  done: "bg-audity-success border-audity-success text-white",
  current: "bg-audity-primary border-audity-primary text-white",
  todo: "bg-transparent border-audity-borderStrong text-audity-muted",
  blocked: "bg-audity-panelAlt border-audity-error text-audity-error"
};

const STATUS_LABEL: Record<WorkflowStep["status"], string> = {
  done: "completed",
  current: "current step",
  todo: "not started",
  blocked: "blocked"
};

export function WorkflowProgress<TKey extends string>({
  steps,
  onSelect,
  className = ""
}: WorkflowProgressProps<TKey>) {
  const completed = steps.filter((step) => step.status === "done").length;
  return (
    <nav
      aria-label="Audit workflow progress"
      className={`flex w-full flex-col gap-2 ${className}`}
    >
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-audity-muted">
        <span>Workflow progress</span>
        <span>{completed} / {steps.length} steps complete</span>
      </div>
      <ol className="grid auto-rows-max gap-2 md:flex md:items-center md:gap-1">
        {steps.map((step, index) => {
          const Inner = (
            <span className="flex items-center gap-2">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${STATUS_DOT[step.status]}`}
                aria-hidden="true"
              >
                {step.status === "done" ? (
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : (
                  index + 1
                )}
              </span>
              <span className={`truncate text-xs font-medium ${step.status === "current" ? "text-audity-text" : "text-audity-secondary"}`}>
                {step.label}
              </span>
            </span>
          );
          return (
            <li key={step.key} className="flex min-w-0 items-center gap-1 md:flex-1">
              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(step.key)}
                  title={step.hint}
                  aria-label={`Step ${index + 1}: ${typeof step.label === "string" ? step.label : ""} (${STATUS_LABEL[step.status]})`}
                  aria-current={step.status === "current" ? "step" : undefined}
                  className="flex min-w-0 items-center gap-2 rounded px-1 py-0.5 hover:bg-audity-panelAlt focus-visible:outline focus-visible:outline-2 focus-visible:outline-audity-primary"
                >
                  {Inner}
                </button>
              ) : (
                <span title={step.hint} aria-current={step.status === "current" ? "step" : undefined}>
                  {Inner}
                </span>
              )}
              {index < steps.length - 1 ? (
                <span aria-hidden="true" className="hidden h-px flex-1 bg-audity-border md:block" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function HelpHint({ children }: { children: ReactNode }) {
  return (
    <span className="group relative inline-flex items-center">
      <button
        type="button"
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-audity-borderStrong text-[10px] font-bold text-audity-muted hover:border-audity-primary hover:text-audity-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-audity-primary"
        aria-label="Field help"
      >
        ?
      </button>
      <span className="pointer-events-none absolute left-5 top-1/2 z-30 hidden w-[min(16rem,calc(100vw-2rem))] -translate-y-1/2 rounded-audity border border-audity-border bg-audity-panel p-2 text-xs text-audity-text shadow-lg group-hover:block group-focus-within:block">
        {children}
      </span>
    </span>
  );
}
