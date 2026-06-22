import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useApi } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { useCustomerContext } from "../../components/CustomerContextProvider";
import { EmptyState, PageSkeleton, Slideover, useToast } from "../../components/ui";

type CockpitAction = {
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

type CockpitThresholds = {
  fieldwork: number;
  findings_response: number;
  evidence_request: number;
  remediation: number;
};

type CockpitAudit = {
  id: string;
  type: string;
  audience: string | null;
  framework: string | null;
  status: string;
  phase: "Setup" | "Plan" | "Fieldwork" | "Findings" | "Report" | "Sign-off" | "Closed";
  archivedAt: string | null;
  targetDate: string | null;
  updatedAt: string;
  readinessScore: number;
  readinessTarget: number;
  auditOwner: string | null;
  reviewer: string | null;
  questionCount: number;
  answeredCount: number;
  findingCount: number;
  openFindingCount: number;
  stuck: { stuck: boolean; days: number; threshold: number };
  thresholds: CockpitThresholds;
};

type StuckEntry = {
  assessmentId: string;
  assessmentName: string;
  phase: string;
  daysWithoutMovement: number;
  threshold?: number;
  deepLink: string;
};

type ActivityEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actor: string | null;
  occurredAt: string;
};

type CockpitPayload = {
  customer: {
    id: string;
    name: string;
    industry: string | null;
    businessCriticality: string | null;
    regulatoryContext: string | null;
    archivedAt: string | null;
    archiveReason: string | null;
    createdByName: string | null;
  };
  meta: {
    role: "auditor" | "reviewer" | "admin";
    totalReadiness: number;
    executiveSummary: string;
    showOnboarding: boolean;
  };
  audits: {
    active: CockpitAudit[];
    draft: CockpitAudit[];
    imported: CockpitAudit[];
    completed: CockpitAudit[];
    archived: CockpitAudit[];
    totalCount: number;
  };
  nextActions: CockpitAction[];
  stuck: StuckEntry[];
  team: {
    shareTargets: Array<{ id: string; name: string | null; email: string }>;
    owner: string | null;
  };
  activity: ActivityEntry[];
};

const PHASES: Array<{ key: CockpitAudit["phase"]; label: string }> = [
  { key: "Setup", label: "Setup" },
  { key: "Plan", label: "Plan" },
  { key: "Fieldwork", label: "Fieldwork" },
  { key: "Findings", label: "Findings" },
  { key: "Report", label: "Report" },
  { key: "Sign-off", label: "Sign-off" }
];

function severityClass(severity: CockpitAction["severity"]): string {
  switch (severity) {
    case "critical":
      return "border-audity-error bg-audity-error/10 text-audity-error";
    case "warning":
      return "border-audity-warning bg-audity-warning/10 text-audity-warning";
    default:
      return "border-audity-border bg-audity-page text-audity-secondary";
  }
}

function PhaseBar({ active }: { active: CockpitAudit["phase"] }) {
  const activeIndex = PHASES.findIndex((p) => p.key === active);
  return (
    <div className="flex flex-wrap gap-1.5">
      {PHASES.map((phase, index) => {
        const isPast = index < activeIndex;
        const isCurrent = index === activeIndex;
        const isFieldworkOrFindings = phase.key === "Fieldwork" || phase.key === "Findings";
        const bridgeMark =
          (phase.key === "Fieldwork" || phase.key === "Findings") && active === "Fieldwork";
        return (
          <div
            key={phase.key}
            className={`rounded-audity border px-2.5 py-1 text-xs font-semibold ${
              isCurrent
                ? "border-audity-primary bg-audity-primaryActive text-white"
                : isPast
                  ? "border-audity-success/60 bg-audity-success/10 text-audity-success"
                  : "border-audity-border bg-audity-panel text-audity-muted"
            }`}
            title={isFieldworkOrFindings ? "Fieldwork ⇄ Findings laufen parallel" : undefined}
          >
            {isPast ? "✓ " : ""}{phase.label}
            {bridgeMark && phase.key === "Fieldwork" ? " ⇄" : ""}
          </div>
        );
      })}
    </div>
  );
}

function ActionCard({ action }: { action: CockpitAction }) {
  return (
    <Link
      to={action.deepLink}
      className={`flex flex-col rounded-audity border px-3 py-2.5 transition hover:shadow-sm ${severityClass(
        action.severity
      )}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold">{action.title}</span>
        {action.overdueBy ? (
          <span className="rounded-full bg-audity-error px-2 py-0.5 text-[10px] font-bold uppercase text-white">
            {action.overdueBy}T überfällig
          </span>
        ) : null}
      </div>
      <span className="mt-1 text-xs opacity-80">{action.detail}</span>
      <span className="mt-1 text-[11px] uppercase tracking-wide opacity-60">
        {action.assessmentName}
      </span>
    </Link>
  );
}

function WorkstationTile({
  to,
  label,
  hint,
  disabled
}: {
  to: string;
  label: string;
  hint: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <div
        className="audity-card-muted flex h-28 cursor-not-allowed flex-col justify-between p-3 opacity-60"
        title="Kein aktives Audit ausgewählt"
      >
        <span className="text-sm font-semibold text-audity-muted">{label}</span>
        <span className="text-xs text-audity-muted">{hint}</span>
      </div>
    );
  }
  return (
    <Link to={to} className="audity-card-interactive flex h-28 flex-col justify-between p-3">
      <span className="text-sm font-semibold text-audity-text">{label}</span>
      <span className="text-xs text-audity-secondary">{hint}</span>
    </Link>
  );
}

function OnboardingWizard({
  customerId,
  onDismiss,
  onCreateAudit
}: {
  customerId: string;
  onDismiss: () => void;
  onCreateAudit: () => void;
}) {
  return (
    <section className="audity-card border-audity-primary p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="audity-page-kicker text-audity-primary">Onboarding · Schritt 1 von 3</p>
        <button className="text-xs text-audity-muted hover:text-audity-secondary" onClick={onDismiss}>
          Später erinnern
        </button>
      </div>
      <h2 className="audity-page-title text-xl">Erstes Audit anlegen</h2>
      <p className="audity-page-copy mt-2 text-sm">
        Wähle ein Framework und ein Audit-Template — das Cockpit füllt sich danach automatisch mit
        Plan-, Fieldwork- und Report-Phasen.
      </p>
      <ol className="mt-4 space-y-2 text-sm text-audity-secondary">
        <li>1 · Audit anlegen (Template, Framework, Frist)</li>
        <li className="opacity-60">2 · Plan vervollständigen (Kickoff-Datum, Owner)</li>
        <li className="opacity-60">3 · Scope-Items definieren</li>
      </ol>
      <div className="mt-4 flex gap-2">
        <button className="audity-btn-primary" onClick={onCreateAudit}>
          + Audit anlegen
        </button>
        <Link to={`/customers/${customerId}/plan`} className="audity-btn-secondary">
          Direkt zu Plan & Scope
        </Link>
      </div>
    </section>
  );
}

function AuditCard({ audit, customerId }: { audit: CockpitAudit; customerId: string }) {
  const target = audit.targetDate ? new Date(audit.targetDate).toLocaleDateString() : null;
  const updated = new Date(audit.updatedAt);
  const updatedAgoDays = Math.floor((Date.now() - updated.getTime()) / 86400000);
  return (
    <Link
      to={`/customers/${customerId}?audit=${audit.id}`}
      className={`audity-card-interactive block p-3 ${
        audit.stuck.stuck ? "border-audity-warning" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-audity-text">{audit.type}</h3>
          <p className="mt-0.5 text-xs text-audity-muted">
            {audit.framework ?? "Kein Framework"} · {audit.audience ?? "—"}
          </p>
        </div>
        <span className="rounded-audity border border-audity-borderStrong px-2 py-0.5 text-[10px] font-semibold uppercase text-audity-secondary">
          {audit.phase}
        </span>
      </div>
      <div className="mt-3 h-1.5 w-full rounded-full bg-audity-page">
        <div
          className="h-1.5 rounded-full bg-audity-primary"
          style={{ width: `${Math.min(100, audit.readinessScore)}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-[11px] text-audity-secondary">
        <span>
          Readiness {audit.readinessScore}% / Ziel {audit.readinessTarget}%
        </span>
        <span>{target ? `Frist ${target}` : `Update vor ${updatedAgoDays}T`}</span>
      </div>
      {audit.stuck.stuck ? (
        <p className="mt-2 text-[11px] text-audity-warning">
          Stagniert seit {audit.stuck.days} Tagen (Schwellwert {audit.stuck.threshold}T) — Stuck-Detection ausgelöst
        </p>
      ) : null}
    </Link>
  );
}

function PromoteImportedSection({
  audits,
  customerId,
  onPromoted
}: {
  audits: CockpitAudit[];
  customerId: string;
  onPromoted: () => void;
}) {
  const api = useApi();
  const toast = useToast();
  const [promoting, setPromoting] = useState<string | null>(null);
  const [gateFailures, setGateFailures] = useState<Record<string, Array<{ field: string; message: string }>>>({});

  if (!audits.length) return null;

  async function promote(audit: CockpitAudit) {
    setPromoting(audit.id);
    try {
      await api(`/api/assessments/${audit.id}/promote-to-active`, { method: "POST" });
      toast.success(`${audit.type} aktiviert`);
      setGateFailures((current) => {
        const next = { ...current };
        delete next[audit.id];
        return next;
      });
      onPromoted();
    } catch (err) {
      const error = err as { code?: string; failures?: Array<{ field: string; message: string }>; message?: string };
      if (error?.code === "GATE_FAILED" && error.failures) {
        setGateFailures((current) => ({ ...current, [audit.id]: error.failures! }));
      } else {
        toast.error(error?.message ?? "Aktivierung fehlgeschlagen");
      }
    } finally {
      setPromoting(null);
    }
  }

  return (
    <section className="audity-card border-audity-warning p-4">
      <h2 className="text-base font-semibold text-audity-warning">
        Übernommen (Read-mostly · {audits.length})
      </h2>
      <p className="mt-1 text-xs text-audity-muted">
        Importierte Audits können nach Plan-Vervollständigung in aktiven Status promoted werden.
      </p>
      <ul className="mt-3 space-y-3">
        {audits.map((audit) => {
          const failures = gateFailures[audit.id];
          return (
            <li
              key={audit.id}
              className="rounded-audity border border-audity-border bg-audity-panel p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <strong className="text-audity-text">{audit.type}</strong>
                  <p className="text-xs text-audity-muted">
                    {audit.framework ?? "Kein Framework"} · {audit.audience ?? "—"}
                  </p>
                </div>
                <button
                  className="audity-btn-primary text-xs"
                  onClick={() => void promote(audit)}
                  disabled={promoting === audit.id}
                >
                  {promoting === audit.id ? "Aktivieren …" : "Audit fortsetzen"}
                </button>
              </div>
              {failures ? (
                <div className="mt-3 rounded-audity border border-audity-error/40 bg-audity-error/10 p-2 text-xs text-audity-error">
                  <strong>Aktivierungs-Gate fehlgeschlagen:</strong>
                  <ul className="mt-1 list-disc pl-4">
                    {failures.map((failure, idx) => (
                      <li key={idx}>{failure.message}</li>
                    ))}
                  </ul>
                  <p className="mt-2">
                    <Link
                      className="font-semibold underline"
                      to={`/customers/${customerId}/plan?audit=${audit.id}`}
                    >
                      → Plan vervollständigen
                    </Link>
                  </p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function CustomerAuditCenterPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const api = useApi();
  const { user } = useAuth();
  const { setCustomerLabel } = useCustomerContext();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState<CockpitPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const selectedAuditId = searchParams.get("audit");
  const selectedAudit = useMemo<CockpitAudit | null>(() => {
    if (!data) return null;
    const pool = [
      ...data.audits.active,
      ...data.audits.draft,
      ...data.audits.imported,
      ...data.audits.completed,
      ...data.audits.archived
    ];
    if (selectedAuditId) {
      return pool.find((a) => a.id === selectedAuditId) ?? null;
    }
    return data.audits.active[0] ?? data.audits.draft[0] ?? null;
  }, [data, selectedAuditId]);

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const payload = await api<CockpitPayload>(`/api/customers/${id}/cockpit`);
      setData(payload);
      setCustomerLabel(payload.customer.name);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cockpit konnte nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function dismissOnboarding() {
    if (!id) return;
    try {
      await api(`/api/customers/${id}/cockpit/dismiss-onboarding`, { method: "POST" });
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Konnte Onboarding nicht ausblenden");
    }
  }

  if (loading || !data) {
    return (
      <>
        <div className="audity-page-header">
          <p className="audity-page-kicker">Customer Audit Center</p>
          <h1 className="audity-page-title">Lade Cockpit …</h1>
        </div>
        <PageSkeleton cards={4} showTable />
        {error ? (
          <div className="mt-4 rounded-audity border border-audity-error bg-audity-error/10 px-3 py-2 text-sm text-audity-error">
            {error}
          </div>
        ) : null}
      </>
    );
  }

  const isArchived = Boolean(data.customer.archivedAt);
  const canEdit = !isArchived && Boolean(user?.permissions.includes("assessment.edit"));
  const canCreateAudit = !isArchived && Boolean(user?.permissions.includes("assessment.create"));

  return (
    <>
      <div className="audity-page-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="audity-page-kicker">Customer Audit Center</p>
          <h1 className="audity-page-title">{data.customer.name}</h1>
          <p className="audity-page-copy">
            {data.customer.industry ?? "—"} · Kritikalität {data.customer.businessCriticality ?? "—"}
            {data.meta.totalReadiness > 0
              ? ` · Ø Readiness ${data.meta.totalReadiness}%`
              : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 text-right">
          {isArchived ? (
            <div className="rounded-audity border border-audity-warning/40 bg-audity-warning/10 px-3 py-2 text-xs text-audity-warning">
              <div className="font-semibold">Archivierter Kunde (read-only)</div>
              {data.customer.archiveReason ? (
                <div className="mt-0.5 italic">Grund: {data.customer.archiveReason}</div>
              ) : null}
            </div>
          ) : (
            <div className="flex gap-2">
              {canCreateAudit ? (
                <button className="audity-btn-primary" onClick={() => setCreateOpen(true)}>
                  + Neues Audit
                </button>
              ) : null}
              <Link to="/inbox" className="audity-btn-secondary">
                Inbox
              </Link>
            </div>
          )}
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-audity border border-audity-error bg-audity-error/10 px-3 py-2 text-sm text-audity-error">
          {error}
        </div>
      ) : null}

      {data.meta.showOnboarding ? (
        <div className="mb-4">
          <OnboardingWizard
            customerId={id!}
            onDismiss={() => void dismissOnboarding()}
            onCreateAudit={() => setCreateOpen(true)}
          />
        </div>
      ) : null}

      {/* Executive Summary */}
      <section className="audity-card mb-4 p-4">
        <p className="audity-page-kicker">Executive Summary</p>
        <p className="mt-1 text-sm text-audity-secondary">{data.meta.executiveSummary}</p>
        {selectedAudit ? (
          <div className="mt-3">
            <PhaseBar active={selectedAudit.phase} />
            <p className="mt-2 text-xs text-audity-muted">
              Phase aktuell: <strong>{selectedAudit.phase}</strong> · Fieldwork und Findings laufen parallel.
            </p>
          </div>
        ) : null}
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          {/* Active Audits */}
          {data.audits.active.length ? (
            <section className="audity-card p-4">
              <header className="mb-3 flex items-baseline justify-between">
                <h2 className="text-base font-semibold text-audity-text">Aktive Audits</h2>
                <span className="text-xs text-audity-muted">
                  {data.audits.active.length} aktiv
                </span>
              </header>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {data.audits.active.map((audit) => (
                  <AuditCard key={audit.id} audit={audit} customerId={id!} />
                ))}
              </div>
            </section>
          ) : null}

          {/* Next Actions */}
          {data.nextActions.length ? (
            <section className="audity-card p-4">
              <header className="mb-3 flex items-baseline justify-between">
                <h2 className="text-base font-semibold text-audity-text">Nächste Aktionen</h2>
                <span className="text-xs text-audity-muted">
                  Rollen-Sicht: <strong>{data.meta.role}</strong>
                </span>
              </header>
              <div className="grid gap-2 sm:grid-cols-2">
                {data.nextActions.map((action) => (
                  <ActionCard key={action.id} action={action} />
                ))}
              </div>
            </section>
          ) : null}

          {/* Stuck */}
          {data.stuck.length ? (
            <section className="audity-card border-audity-warning p-4">
              <h2 className="text-base font-semibold text-audity-warning">
                Festgefahren ({data.stuck.length})
              </h2>
              <p className="mt-1 text-xs text-audity-muted">
                Aktive Audits ohne Bewegung über dem konfigurierten Schwellwert.
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {data.stuck.map((entry) => (
                  <li key={entry.assessmentId}>
                    <Link
                      to={entry.deepLink}
                      className="flex items-center justify-between rounded-audity border border-audity-warning/60 bg-audity-warning/5 px-3 py-2 hover:border-audity-warning"
                    >
                      <span>
                        <strong>{entry.assessmentName}</strong> · Phase {entry.phase}
                      </span>
                      <span className="text-xs text-audity-warning">
                        {entry.daysWithoutMovement} Tage
                        {entry.threshold ? ` / ${entry.threshold}T Limit` : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Imported audits with promote option */}
          <PromoteImportedSection
            audits={data.audits.imported}
            customerId={id!}
            onPromoted={() => void load()}
          />


          {/* Workstation tiles */}
          <section className="audity-card p-4">
            <h2 className="mb-3 text-base font-semibold text-audity-text">Werkstatt</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <WorkstationTile
                to={`/customers/${id}/plan${selectedAudit ? `?audit=${selectedAudit.id}` : ""}`}
                label="Plan & Scope"
                hint="Timeline, Owner, Scope-Items"
                disabled={!selectedAudit}
              />
              <WorkstationTile
                to={`/customers/${id}/controls${selectedAudit ? `?audit=${selectedAudit.id}` : ""}`}
                label="Controls & Evidence"
                hint="Scoring, Mapping, Sampling"
                disabled={!selectedAudit}
              />
              <WorkstationTile
                to={`/customers/${id}/findings${selectedAudit ? `?audit=${selectedAudit.id}` : ""}`}
                label="Findings"
                hint="Lifecycle, Remediation, Re-Test"
                disabled={!selectedAudit}
              />
              <WorkstationTile
                to={`/customers/${id}/report${selectedAudit ? `?audit=${selectedAudit.id}` : ""}`}
                label="Report & Sign-off"
                hint="SoA, Pack-Export, Signaturen"
                disabled={!selectedAudit}
              />
            </div>
          </section>

          {/* Draft / Imported / Completed */}
          {(data.audits.draft.length || data.audits.imported.length || data.audits.completed.length) ? (
            <section className="audity-card p-4">
              <h2 className="mb-3 text-base font-semibold text-audity-text">Weitere Audits</h2>
              <div className="space-y-3">
                {data.audits.draft.length ? (
                  <div>
                    <p className="audity-page-kicker">In Vorbereitung</p>
                    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                      {data.audits.draft.map((audit) => (
                        <li key={audit.id}>
                          <AuditCard audit={audit} customerId={id!} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {data.audits.completed.length ? (
                  <div>
                    <p className="audity-page-kicker">Abgeschlossen</p>
                    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                      {data.audits.completed.map((audit) => (
                        <li key={audit.id}>
                          <AuditCard audit={audit} customerId={id!} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {!data.audits.totalCount && !data.meta.showOnboarding ? (
            <EmptyState
              title="Kein Audit vorhanden"
              description="Lege das erste Audit für diesen Kunden an, um das Cockpit zu starten."
              action={
                canCreateAudit ? (
                  <button className="audity-btn-primary" onClick={() => setCreateOpen(true)}>
                    + Neues Audit
                  </button>
                ) : null
              }
            />
          ) : null}
        </div>

        {/* Side column */}
        <aside className="space-y-4">
          <section className="audity-card p-4">
            <h2 className="text-base font-semibold text-audity-text">Team & Zugriff</h2>
            <p className="mt-2 text-sm text-audity-secondary">
              Owner: {data.team.owner ?? "—"}
            </p>
            <p className="mt-2 text-sm text-audity-secondary">
              Geteilt mit:{" "}
              {data.team.shareTargets.length
                ? data.team.shareTargets.map((t) => t.name ?? t.email).join(", ")
                : "Niemandem"}
            </p>
          </section>

          <section className="audity-card p-4">
            <h2 className="text-base font-semibold text-audity-text">
              Activity ({data.activity.length})
            </h2>
            <ul className="mt-2 space-y-2 text-xs">
              {data.activity.length ? (
                data.activity.map((event) => (
                  <li key={event.id} className="border-b border-audity-border pb-2 last:border-0">
                    <div className="font-semibold text-audity-text">{event.action}</div>
                    <div className="text-audity-muted">
                      {event.actor ?? "—"} · {new Date(event.occurredAt).toLocaleString()}
                    </div>
                  </li>
                ))
              ) : (
                <li className="text-audity-muted">Keine Aktivität.</li>
              )}
            </ul>
          </section>
        </aside>
      </div>

      <CreateAuditSlideover
        open={createOpen}
        customerId={id!}
        onClose={() => setCreateOpen(false)}
        onCreated={(assessmentId) => {
          setCreateOpen(false);
          navigate(`/customers/${id}/plan?audit=${assessmentId}`);
        }}
      />
    </>
  );
}

function CreateAuditSlideover({
  open,
  customerId,
  onClose,
  onCreated
}: {
  open: boolean;
  customerId: string;
  onClose: () => void;
  onCreated: (assessmentId: string) => void;
}) {
  const api = useApi();
  const toast = useToast();
  const [templates, setTemplates] = useState<Array<{ key: string; name: string; type: string; audience: string; language: string }>>([]);
  const [frameworks, setFrameworks] = useState<Array<{ id: string; name: string; shortName: string | null }>>([]);
  const [form, setForm] = useState({
    templateKey: "iso27001_readiness",
    type: "Full Security Maturity Assessment",
    audience: "Management + Technical Team",
    frameworkId: "",
    language: "en",
    targetDate: "",
    status: "draft"
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    void Promise.all([
      api<{ templates: typeof templates }>("/api/assessment-templates"),
      api<{ frameworks: typeof frameworks }>("/api/frameworks")
    ])
      .then(([tpl, fw]) => {
        setTemplates(tpl.templates);
        setFrameworks(fw.frameworks);
        if (!form.frameworkId && fw.frameworks[0]) {
          setForm((current) => ({ ...current, frameworkId: fw.frameworks[0].id }));
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit() {
    setSubmitting(true);
    try {
      const result = await api<{ assessment: { id: string } }>(
        `/api/customers/${customerId}/assessments`,
        {
          method: "POST",
          body: JSON.stringify(form)
        }
      );
      onCreated(result.assessment.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Audit konnte nicht angelegt werden");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Slideover title="Neues Audit anlegen" open={open} onClose={onClose}>
      <label className="mb-3 block text-xs font-medium text-audity-secondary">
        Template
        <select
          className="audity-input mt-2"
          value={form.templateKey}
          onChange={(event) => {
            const tpl = templates.find((t) => t.key === event.target.value);
            setForm({
              ...form,
              templateKey: event.target.value,
              type: tpl?.type ?? form.type,
              audience: tpl?.audience ?? form.audience,
              language: tpl?.language ?? form.language
            });
          }}
        >
          {templates.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="mb-3 block text-xs font-medium text-audity-secondary">
        Framework
        <select
          className="audity-input mt-2"
          value={form.frameworkId}
          onChange={(event) => setForm({ ...form, frameworkId: event.target.value })}
        >
          {frameworks.map((f) => (
            <option key={f.id} value={f.id}>
              {f.shortName ?? f.name}
            </option>
          ))}
        </select>
      </label>
      <label className="mb-3 block text-xs font-medium text-audity-secondary">
        Zielfrist
        <input
          type="date"
          className="audity-input mt-2"
          value={form.targetDate}
          onChange={(event) => setForm({ ...form, targetDate: event.target.value })}
        />
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <button className="audity-btn-secondary" onClick={onClose} disabled={submitting}>
          Abbrechen
        </button>
        <button
          className="audity-btn-primary"
          onClick={() => void submit()}
          disabled={submitting || !form.frameworkId}
        >
          {submitting ? "Anlegen …" : "Audit anlegen"}
        </button>
      </div>
    </Slideover>
  );
}
