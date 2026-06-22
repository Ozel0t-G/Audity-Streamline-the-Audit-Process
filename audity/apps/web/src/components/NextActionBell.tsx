import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../api/client";

type Counts = { totalCount: number; criticalCount: number; warningCount: number };

export function NextActionBell() {
  const api = useApi();
  const [counts, setCounts] = useState<Counts>({ totalCount: 0, criticalCount: 0, warningCount: 0 });

  async function refresh() {
    try {
      const payload = await api<Counts>("/api/me/next-action-count");
      setCounts(payload);
    } catch {
      // Silent — bell is best-effort.
    }
  }

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 120_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tone = counts.criticalCount
    ? "bg-audity-error text-white"
    : counts.warningCount
      ? "bg-audity-warning text-audity-page"
      : counts.totalCount
        ? "bg-audity-primary text-white"
        : "bg-audity-panel text-audity-muted";

  return (
    <Link
      to="/inbox"
      className="relative inline-flex items-center gap-1.5 rounded-audity border border-audity-border px-2.5 py-1.5 text-xs font-semibold text-audity-secondary hover:border-audity-primary hover:text-audity-text"
      aria-label={`Inbox · ${counts.totalCount} offen`}
      title={`${counts.totalCount} offene Aktionen · ${counts.criticalCount} kritisch`}
    >
      <span aria-hidden>🔔</span>
      <span>Inbox</span>
      {counts.totalCount > 0 ? (
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tone}`}>
          {counts.totalCount}
        </span>
      ) : null}
    </Link>
  );
}
