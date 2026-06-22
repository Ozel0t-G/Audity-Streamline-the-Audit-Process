import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useParams, useSearchParams } from "react-router-dom";
import { useApi } from "../../../api/client";

type CustomerLight = { id: string; name: string; archivedAt: string | null };
type AuditLight = {
  id: string;
  type: string;
  framework: string | null;
  status: string;
  phase: string;
  archivedAt: string | null;
};

const PHASE_TABS = [
  { key: "plan", label: "Plan & Scope" },
  { key: "controls", label: "Controls & Evidence" },
  { key: "findings", label: "Findings" },
  { key: "report", label: "Report & Sign-off" }
] as const;

export function PhaseLayout({
  active,
  title,
  description,
  aiHint,
  children
}: {
  active: (typeof PHASE_TABS)[number]["key"];
  title: string;
  description?: string;
  aiHint?: string;
  children: ReactNode;
}) {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const api = useApi();
  const auditFromUrl = searchParams.get("audit") ?? "";
  const [customer, setCustomer] = useState<CustomerLight | null>(null);
  const [audits, setAudits] = useState<AuditLight[]>([]);
  const [selectedAudit, setSelectedAudit] = useState(auditFromUrl);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    void api<{ customer: CustomerLight }>(`/api/customers/${id}`).then((res) =>
      setCustomer(res.customer)
    );
    void api<{
      audits: {
        active: AuditLight[];
        draft: AuditLight[];
        imported: AuditLight[];
        completed: AuditLight[];
      };
    }>(`/api/customers/${id}/cockpit`)
      .then((cockpit) => {
        const merged = [
          ...cockpit.audits.active,
          ...cockpit.audits.draft,
          ...cockpit.audits.imported,
          ...cockpit.audits.completed
        ];
        setAudits(merged);
        if (!selectedAudit && merged[0]) {
          setSelectedAudit(merged[0].id);
          const next = new URLSearchParams(searchParams);
          next.set("audit", merged[0].id);
          setSearchParams(next, { replace: true });
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function switchAudit(value: string) {
    setSelectedAudit(value);
    const next = new URLSearchParams(searchParams);
    if (value) next.set("audit", value);
    else next.delete("audit");
    setSearchParams(next, { replace: true });
  }

  const isReadOnly = Boolean(customer?.archivedAt);

  return (
    <div className="space-y-4">
      <div className="audity-page-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="audity-page-kicker">
            <Link to={`/customers/${id}`} className="hover:underline">
              {customer?.name ?? "…"}
            </Link>{" "}
            · {title}
          </p>
          <h1 className="audity-page-title">{title}</h1>
          {description ? <p className="audity-page-copy">{description}</p> : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          <Link to={`/customers/${id}`} className="audity-btn-secondary text-xs">
            ← Back to cockpit
          </Link>
          {audits.length > 1 ? (
            <select
              className="audity-input min-w-[220px] text-xs"
              value={selectedAudit}
              onChange={(event) => switchAudit(event.target.value)}
            >
              {audits.map((audit) => (
                <option key={audit.id} value={audit.id}>
                  {audit.type} · {audit.status}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      {isReadOnly ? (
        <div className="rounded-audity border border-audity-warning/40 bg-audity-warning/10 px-3 py-2 text-xs text-audity-warning">
          Read-only · archived customer
        </div>
      ) : null}

      <nav className="flex flex-wrap gap-1 border-b border-audity-border">
        {PHASE_TABS.map((tab) => (
          <NavLink
            key={tab.key}
            to={`/customers/${id}/${tab.key}${selectedAudit ? `?audit=${selectedAudit}` : ""}`}
            className={({ isActive }) =>
              `rounded-t-audity px-3 py-2 text-sm font-semibold ${
                isActive || tab.key === active
                  ? "bg-audity-primary text-white"
                  : "text-audity-secondary hover:bg-audity-panel hover:text-audity-text"
              }`
            }
            end
          >
            {tab.label}
          </NavLink>
        ))}
        <div className="ml-auto">
          <button
            className="rounded-t-audity px-3 py-2 text-sm font-semibold text-audity-secondary hover:bg-audity-panel"
            onClick={() => setAiOpen((v) => !v)}
          >
            AI Assist {aiOpen ? "▸" : "◂"}
          </button>
        </div>
      </nav>

      <div className={`grid gap-4 ${aiOpen ? "xl:grid-cols-[1fr_320px]" : ""}`}>
        <div className="min-w-0">{children}</div>
        {aiOpen ? (
          <aside className="audity-card h-fit p-4">
            <h2 className="text-sm font-semibold text-audity-text">AI Assist · {title}</h2>
            <p className="mt-1 text-xs text-audity-muted">
              {aiHint ?? "Context-aware suggestions for this phase."}
            </p>
            <ul className="mt-3 space-y-2 text-xs text-audity-secondary">
              <li>· Score suggestion from evidence (Controls phase)</li>
              <li>· Severity suggestion from impact / likelihood (Findings)</li>
              <li>· Regenerate executive summary (Report)</li>
            </ul>
            <p className="mt-3 text-[11px] text-audity-muted">
              AI calls run async in the worker, idempotency-cached for 1h.
            </p>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
