import { Component, ErrorInfo, ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (this.props.onError) {
      this.props.onError(error, info);
    } else if (typeof console !== "undefined") {
      console.error("Audity ErrorBoundary caught", error, info);
    }
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return <DefaultErrorFallback error={error} onReset={this.reset} />;
  }
}

function DefaultErrorFallback({ error, onReset }: { error: Error; onReset: () => void }) {
  return (
    <div
      role="alert"
      className="audity-card mx-auto my-6 flex max-w-2xl flex-col gap-3 border-audity-error"
    >
      <div className="flex items-center gap-2 text-audity-error">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="13" />
          <line x1="12" y1="16" x2="12" y2="16" />
        </svg>
        <h2 className="text-base font-semibold">Something went wrong</h2>
      </div>
      <p className="text-sm text-audity-secondary">
        This page hit an unexpected error and stopped rendering. Your data is unchanged. You can retry, or reload the page.
      </p>
      <details className="text-xs text-audity-muted">
        <summary className="cursor-pointer">Technical details</summary>
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-audity-panelAlt p-2">{error.message}</pre>
      </details>
      <div className="flex gap-2">
        <button type="button" className="audity-btn-primary" onClick={onReset}>
          Try again
        </button>
        <button
          type="button"
          className="audity-btn-secondary"
          onClick={() => {
            if (typeof window !== "undefined") window.location.reload();
          }}
        >
          Reload page
        </button>
      </div>
    </div>
  );
}
