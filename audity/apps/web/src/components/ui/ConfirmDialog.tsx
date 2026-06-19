import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type ConfirmOptions = {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type PendingConfirm = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending((previous) => {
        // If another confirm is still open, cancel it so the caller's promise
        // resolves rather than leaking forever.
        previous?.resolve(false);
        return { ...options, resolve };
      });
    });
  }, []);

  const resolve = useCallback(
    (value: boolean) => {
      if (!pending) return;
      pending.resolve(value);
      setPending(null);
    },
    [pending]
  );

  useEffect(() => {
    if (!pending) return;
    confirmButtonRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        resolve(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [pending, resolve]);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending ? (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="audity-confirm-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) resolve(false);
          }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-audity border border-audity-border bg-audity-panel shadow-2xl">
            <div className="border-b border-audity-border px-4 py-3">
              <h2 id="audity-confirm-title" className="text-sm font-semibold text-audity-text">
                {pending.title}
              </h2>
            </div>
            {pending.body ? (
              <div className="px-4 py-3 text-sm text-audity-secondary">{pending.body}</div>
            ) : null}
            <div className="flex justify-end gap-2 border-t border-audity-border bg-audity-panelAlt px-4 py-3">
              <button
                type="button"
                className="audity-btn-secondary px-3"
                onClick={() => resolve(false)}
              >
                {pending.cancelLabel ?? "Cancel"}
              </button>
              <button
                ref={confirmButtonRef}
                type="button"
                className={
                  pending.destructive
                    ? "h-8 rounded-audity bg-audity-error px-3 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    : "audity-btn-primary px-3"
                }
                onClick={() => resolve(true)}
              >
                {pending.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return context;
}
