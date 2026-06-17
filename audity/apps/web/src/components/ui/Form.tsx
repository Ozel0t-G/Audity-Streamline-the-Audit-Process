import { ReactNode, useId } from "react";
import { FieldError, FieldHint } from "./FieldError";
import { HelpHint } from "./WorkflowProgress";

type FormSectionProps = {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function FormSection({ title, description, actions, children, className = "" }: FormSectionProps) {
  return (
    <section className={`audity-card flex flex-col gap-3 ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title ? <h3 className="text-sm font-semibold text-audity-text">{title}</h3> : null}
            {description ? <p className="mt-0.5 text-xs text-audity-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      )}
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

type FormRowProps = {
  columns?: 1 | 2 | 3 | 4;
  children: ReactNode;
  className?: string;
};

const COL_CLASS: Record<NonNullable<FormRowProps["columns"]>, string> = {
  1: "grid grid-cols-1 gap-3",
  2: "grid grid-cols-1 gap-3 md:grid-cols-2",
  3: "grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3",
  4: "grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4"
};

export function FormRow({ columns = 2, children, className = "" }: FormRowProps) {
  return <div className={`${COL_CLASS[columns]} ${className}`}>{children}</div>;
}

export type FormFieldProps = {
  label: ReactNode;
  children: (inputProps: { id: string; "aria-describedby"?: string; "aria-invalid"?: true; "aria-required"?: true }) => ReactNode;
  hint?: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  htmlFor?: string;
  className?: string;
};

export function FormField({ label, children, hint, help, error, required, htmlFor, className = "" }: FormFieldProps) {
  const generated = useId();
  const id = htmlFor ?? generated;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label
        htmlFor={id}
        className={`audity-label flex items-center gap-1 ${required ? "audity-label-required" : ""}`}
      >
        <span>{label}</span>
        {required ? <span className="sr-only"> (required)</span> : null}
        {help ? <HelpHint>{help}</HelpHint> : null}
      </label>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        "aria-required": required ? true : undefined
      })}
      {hint && !error ? <FieldHint id={hintId}>{hint}</FieldHint> : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}
