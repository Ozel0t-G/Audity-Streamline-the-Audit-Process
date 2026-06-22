import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../api/client";
import { EmptyState, PageSkeleton, useToast } from "../components/ui";

type InboxAction = {
  id: string;
  kind: string;
  customerId: string;
  customerName: string;
  assessmentId: string;
  assessmentName: string;
  title: string;
  detail: string;
  count: number;
  overdueBy: number | null;
  deepLink: string;
  severity: "info" | "warning" | "critical";
};

type InboxGroup = { customerId: string; customerName: string; actions: InboxAction[] };

type InboxPayload = {
  meta: {
    totalCount: number;
    criticalCount: number;
    warningCount: number;
    pageSize: number;
    returned: number;
    generatedAt: string;
  };
  actions: InboxGroup[];
  pagination: { nextCursor: string | null; hasMore: boolean };
};

const SEVERITY_CLASS: Record<InboxAction["severity"], string> = {
  critical: "border-audity-error bg-audity-error/10 text-audity-error",
  warning: "border-audity-warning bg-audity-warning/10 text-audity-warning",
  info: "border-audity-border bg-audity-page text-audity-secondary"
};

const PAGE_LIMIT = 50;

function mergeGroups(prev: InboxGroup[], next: InboxGroup[]): InboxGroup[] {
  const map = new Map<string, InboxGroup>();
  for (const group of prev) {
    map.set(group.customerId, { ...group, actions: [...group.actions] });
  }
  for (const group of next) {
    const existing = map.get(group.customerId);
    if (existing) {
      const seen = new Set(existing.actions.map((a) => a.id));
      for (const action of group.actions) {
        if (!seen.has(action.id)) existing.actions.push(action);
      }
    } else {
      map.set(group.customerId, { ...group, actions: [...group.actions] });
    }
  }
  return Array.from(map.values());
}

export function InboxPage() {
  const api = useApi();
  const toast = useToast();
  const [meta, setMeta] = useState<InboxPayload["meta"] | null>(null);
  const [groups, setGroups] = useState<InboxGroup[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const fetchPage = useCallback(
    async (resetCursor: boolean, currentCursor: string | null = null) => {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_LIMIT));
      if (overdueOnly) params.set("overdueOnly", "true");
      if (!resetCursor && currentCursor) params.set("cursor", currentCursor);
      try {
        const payload = await api<InboxPayload>(`/api/me/inbox?${params.toString()}`);
        setMeta(payload.meta);
        setHasMore(payload.pagination.hasMore);
        setCursor(payload.pagination.nextCursor);
        if (resetCursor) {
          setGroups(payload.actions);
        } else {
          setGroups((prev) => mergeGroups(prev, payload.actions));
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not load inbox");
      }
    },
    [api, overdueOnly, toast]
  );

  useEffect(() => {
    setLoading(true);
    setGroups([]);
    setCursor(null);
    void fetchPage(true, null).finally(() => setLoading(false));
  }, [overdueOnly, fetchPage]);

  useEffect(() => {
    if (!hasMore || loading || loadingMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setLoadingMore(true);
          void fetchPage(false, cursor).finally(() => setLoadingMore(false));
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, cursor, fetchPage]);

  const visibleGroups = useMemo(
    () => groups.filter((group) => group.actions.length > 0),
    [groups]
  );

  if (loading || !meta) {
    return (
      <>
        <div className="audity-page-header">
          <p className="audity-page-kicker">Daily view</p>
          <h1 className="audity-page-title">Inbox</h1>
        </div>
        <PageSkeleton cards={2} showTable />
      </>
    );
  }

  return (
    <>
      <div className="audity-page-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="audity-page-kicker">Daily view</p>
          <h1 className="audity-page-title">Inbox</h1>
          <p className="audity-page-copy">
            {meta.totalCount} open action(s) · {meta.returned} loaded ·{" "}
            <span className="text-audity-error">{meta.criticalCount} critical</span> ·{" "}
            <span className="text-audity-warning">{meta.warningCount} warning(s)</span>
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-audity-secondary">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(event) => setOverdueOnly(event.target.checked)}
          />
          Overdue only
        </label>
      </div>

      {visibleGroups.length ? (
        <div className="space-y-4">
          {visibleGroups.map((group) => (
            <section key={group.customerId} className="audity-card p-4">
              <header className="mb-3 flex items-baseline justify-between">
                <h2 className="text-base font-semibold text-audity-text">
                  <Link to={`/customers/${group.customerId}`} className="hover:underline">
                    {group.customerName}
                  </Link>
                </h2>
                <span className="text-xs text-audity-muted">{group.actions.length} action(s)</span>
              </header>
              <ul className="grid gap-2 sm:grid-cols-2">
                {group.actions.map((action) => (
                  <li key={action.id}>
                    <Link
                      to={action.deepLink}
                      className={`flex flex-col rounded-audity border px-3 py-2.5 transition hover:shadow-sm ${SEVERITY_CLASS[action.severity]}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold">{action.title}</span>
                        {action.overdueBy ? (
                          <span className="rounded-full bg-audity-error px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                            {action.overdueBy}d
                          </span>
                        ) : null}
                      </div>
                      <span className="mt-1 text-xs opacity-80">{action.detail}</span>
                      <span className="mt-1 text-[11px] uppercase tracking-wide opacity-60">
                        {action.assessmentName}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {hasMore ? (
            <div
              ref={sentinelRef}
              className="rounded-audity border border-dashed border-audity-border bg-audity-panel p-4 text-center text-xs text-audity-muted"
            >
              {loadingMore ? "Loading more actions…" : "Scroll for more"}
            </div>
          ) : (
            <div className="rounded-audity border border-audity-border bg-audity-panel p-3 text-center text-xs text-audity-muted">
              All actions loaded.
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          title={overdueOnly ? "No overdue actions" : "Inbox empty"}
          description={
            overdueOnly
              ? 'Filter "Overdue only" is on. Disable it to see all actions.'
              : "No open actions across your customers right now."
          }
        />
      )}
    </>
  );
}
