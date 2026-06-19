import { ReactNode } from "react";

type StickyActionBarProps = {
  children: ReactNode;
  helper?: ReactNode;
  className?: string;
  align?: "end" | "between";
};

export function StickyActionBar({ children, helper, className = "", align = "end" }: StickyActionBarProps) {
  const justify = align === "between" ? "justify-between" : "justify-end";
  return (
    <div className={`audity-sticky-actions ${justify} ${className}`} role="group" aria-label="Form actions">
      {helper ? <div className="mr-auto text-xs text-audity-muted">{helper}</div> : null}
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
