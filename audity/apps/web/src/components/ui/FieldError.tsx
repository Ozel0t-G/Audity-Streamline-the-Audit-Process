import { ReactNode } from "react";

type FieldErrorProps = {
  id?: string;
  children?: ReactNode;
  className?: string;
};

export function FieldError({ id, children, className = "" }: FieldErrorProps) {
  if (!children) return null;
  return (
    <p
      id={id}
      role="alert"
      className={`mt-1 flex items-center gap-1 text-xs text-audity-error ${className}`}
    >
      <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <circle cx="12" cy="16" r="0.5" />
      </svg>
      <span>{children}</span>
    </p>
  );
}

type FieldHintProps = {
  id?: string;
  children: ReactNode;
  className?: string;
};

export function FieldHint({ id, children, className = "" }: FieldHintProps) {
  return (
    <p id={id} className={`mt-1 text-xs text-audity-muted ${className}`}>{children}</p>
  );
}
