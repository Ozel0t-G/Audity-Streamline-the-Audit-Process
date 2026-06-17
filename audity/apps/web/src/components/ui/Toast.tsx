import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type ToastVariant = "success" | "error" | "info" | "warning";

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ToastOptions = {
  durationMs?: number;
  action?: ToastAction;
};

type Toast = {
  id: string;
  message: string;
  variant: ToastVariant;
  durationMs: number;
  action?: ToastAction;
};

type ToastContextValue = {
  show: (message: string, variant: ToastVariant, options?: ToastOptions) => void;
  success: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
  warning: (message: string, options?: ToastOptions) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATIONS: Record<ToastVariant, number> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: 0
};

const VARIANT_STYLES: Record<ToastVariant, { border: string; text: string; bg: string; icon: ReactNode }> = {
  success: {
    border: "border-audity-success",
    text: "text-audity-success",
    bg: "bg-audity-success/10",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    )
  },
  error: {
    border: "border-audity-error",
    text: "text-audity-error",
    bg: "bg-audity-error/10",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <circle cx="12" cy="16" r="0.5" />
      </svg>
    )
  },
  warning: {
    border: "border-audity-warning",
    text: "text-audity-warning",
    bg: "bg-audity-warning/10",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    )
  },
  info: {
    border: "border-audity-primary",
    text: "text-audity-primary",
    bg: "bg-audity-primary/10",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="11" x2="12" y2="16" />
        <circle cx="12" cy="8" r="0.5" />
      </svg>
    )
  }
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<string, number>>({});

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current[id];
    if (timer) {
      window.clearTimeout(timer);
      delete timers.current[id];
    }
  }, []);

  const show = useCallback(
    (message: string, variant: ToastVariant, options?: ToastOptions) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const durationMs = options?.durationMs ?? DEFAULT_DURATIONS[variant];
      const toast: Toast = { id, message, variant, durationMs, action: options?.action };
      setToasts((current) => [...current, toast]);
      if (durationMs > 0) {
        timers.current[id] = window.setTimeout(() => dismiss(id), durationMs);
      }
    },
    [dismiss]
  );

  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach((timer) => window.clearTimeout(timer));
      timers.current = {};
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (message, options) => show(message, "success", options),
      error: (message, options) => show(message, "error", options),
      info: (message, options) => show(message, "info", options),
      warning: (message, options) => show(message, "warning", options),
      dismiss
    }),
    [show, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed right-4 top-14 z-[60] flex w-full max-w-sm flex-col gap-2"
        role="region"
        aria-label="Notifications"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const styles = VARIANT_STYLES[toast.variant];
          return (
            <div
              key={toast.id}
              role={toast.variant === "error" ? "alert" : "status"}
              className={`pointer-events-auto flex items-start gap-2 rounded-audity border ${styles.border} ${styles.bg} px-3 py-2 shadow-lg backdrop-blur`}
            >
              <span className={`mt-0.5 shrink-0 ${styles.text}`} aria-hidden="true">
                {styles.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${styles.text}`}>{toast.message}</p>
                {toast.action ? (
                  <button
                    type="button"
                    className={`mt-1 text-xs font-semibold underline-offset-2 hover:underline ${styles.text}`}
                    onClick={() => {
                      toast.action?.onClick();
                      dismiss(toast.id);
                    }}
                  >
                    {toast.action.label}
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                className={`shrink-0 rounded p-0.5 opacity-70 transition hover:opacity-100 ${styles.text}`}
                aria-label="Dismiss notification"
                onClick={() => dismiss(toast.id)}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
