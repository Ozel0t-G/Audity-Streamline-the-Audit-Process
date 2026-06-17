import { ReactNode, useEffect, useRef } from "react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  closeOnBackdrop?: boolean;
};

const SIZE: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl"
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  closeOnBackdrop = true
}: ModalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    containerRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="audity-modal-title"
      onClick={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className={`w-full ${SIZE[size]} overflow-hidden rounded-audity border border-audity-border bg-audity-panel shadow-2xl outline-none`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-audity-border px-4 py-3">
          <div className="min-w-0">
            <h2 id="audity-modal-title" className="text-sm font-semibold text-audity-text">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-xs text-audity-secondary">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="shrink-0 rounded p-1 text-audity-muted hover:bg-audity-panelAlt hover:text-audity-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-audity-primary"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children ? <div className="px-4 py-3 text-sm text-audity-text">{children}</div> : null}
        {footer ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-audity-border bg-audity-panelAlt px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
