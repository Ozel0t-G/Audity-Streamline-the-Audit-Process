import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useApi } from "../../api/client";
import { CustomerDetailsPanel } from "./CustomerDetailsPanel";
import { useAuth } from "../../auth/AuthProvider";
import { useCustomerContext } from "../../components/CustomerContextProvider";
import { EmptyState, PageSkeleton, Slideover, useConfirm, useToast } from "../../components/ui";

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
            title={isFieldworkOrFindings ? "Fieldwork ⇄ Findings run in parallel" : undefined}
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
            {action.overdueBy}d overdue
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
        title="No active audit selected"
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
        <p className="audity-page-kicker text-audity-primary">Onboarding · Step 1 of 3</p>
        <button className="text-xs text-audity-muted hover:text-audity-secondary" onClick={onDismiss}>
          Remind me later
        </button>
      </div>
      <h2 className="audity-page-title text-xl">Create the first audit</h2>
      <p className="audity-page-copy mt-2 text-sm">
        Pick a framework and an audit template — the cockpit will fill itself with Plan, Fieldwork
        and Report phases as you go.
      </p>
      <ol className="mt-4 space-y-2 text-sm text-audity-secondary">
        <li>1 · Create audit (template, framework, deadline)</li>
        <li className="opacity-60">2 · Complete the plan (kickoff date, owner)</li>
        <li className="opacity-60">3 · Define scope items</li>
      </ol>
      <div className="mt-4 flex gap-2">
        <button className="audity-btn-primary" onClick={onCreateAudit}>
          + Create audit
        </button>
        <Link to={`/customers/${customerId}/plan`} className="audity-btn-secondary">
          Jump to Plan & Scope
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
      // Open the audit directly in the unified tab view (Plan & Scope is the
      // entry tab); from there every audit area incl. the Risk Register is one
      // click away. The selected audit is shown by the "Active audit" badge.
      to={`/customers/${customerId}/plan?audit=${audit.id}`}
      className={`audity-card-interactive block p-3 ${
        audit.stuck.stuck ? "border-audity-warning" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-audity-text">{audit.type}</h3>
          <p className="mt-0.5 text-xs text-audity-muted">
            {audit.framework ?? "No framework"} · {audit.audience ?? "—"}
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
          Readiness {audit.readinessScore}% / target {audit.readinessTarget}%
        </span>
        <span>{target ? `Due ${target}` : `Updated ${updatedAgoDays}d ago`}</span>
      </div>
      {audit.stuck.stuck ? (
        <p className="mt-2 text-[11px] text-audity-warning">
          Stagnant for {audit.stuck.days} days (threshold {audit.stuck.threshold}d) — stuck detection
          triggered
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
      toast.success(`${audit.type} activated`);
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
        toast.error(error?.message ?? "Activation failed");
      }
    } finally {
      setPromoting(null);
    }
  }

  return (
    <section className="audity-card border-audity-warning p-4">
      <h2 className="text-base font-semibold text-audity-warning">
        Imported (read-mostly · {audits.length})
      </h2>
      <p className="mt-1 text-xs text-audity-muted">
        Imported audits can be promoted to active status after the plan is complete.
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
                    {audit.framework ?? "No framework"} · {audit.audience ?? "—"}
                  </p>
                </div>
                <button
                  className="audity-btn-primary text-xs"
                  onClick={() => void promote(audit)}
                  disabled={promoting === audit.id}
                >
                  {promoting === audit.id ? "Activating…" : "Resume audit"}
                </button>
              </div>
              {failures ? (
                <div className="mt-3 rounded-audity border border-audity-error/40 bg-audity-error/10 p-2 text-xs text-audity-error">
                  <strong>Activation gate failed:</strong>
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
                      → Complete the plan
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
  const [searchParams] = useSearchParams();
  const api = useApi();
  const { user } = useAuth();
  const { setCustomerLabel } = useCustomerContext();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<CockpitPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveSubmitting, setArchiveSubmitting] = useState(false);

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

  // Only the latest load() may write state: the route `id` changing (or a
  // post-mutation reload racing the effect) must not let a slower earlier
  // response overwrite newer data. Mirrors the `let cancelled` guard used
  // elsewhere in the app.
  const loadSeqRef = useRef(0);
  async function load() {
    if (!id) return;
    const requestId = ++loadSeqRef.current;
    setLoading(true);
    try {
      const payload = await api<CockpitPayload>(`/api/customers/${id}/cockpit`);
      if (loadSeqRef.current !== requestId) return;
      setData(payload);
      setCustomerLabel(payload.customer.name);
      setError("");
    } catch (err) {
      if (loadSeqRef.current !== requestId) return;
      setError(err instanceof Error ? err.message : "Could not load cockpit");
    } finally {
      if (loadSeqRef.current === requestId) setLoading(false);
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
      toast.error(err instanceof Error ? err.message : "Could not dismiss onboarding");
    }
  }

  if (loading || !data) {
    return (
      <>
        <div className="audity-page-header">
          <p className="audity-page-kicker">Customer Audit Center</p>
          <h1 className="audity-page-title">Loading cockpit…</h1>
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
  const canArchive = !isArchived && Boolean(user?.permissions?.includes("customer.archive"));

  async function submitArchive() {
    if (!id || !data) return;
    const ok = await confirm({
      title: `Archive ${data.customer.name}?`,
      body: "This will move evidence + reports to the archive volume and lock the customer as read-only.",
      confirmLabel: "Archive",
      cancelLabel: "Cancel",
      destructive: true
    });
    if (!ok) return;
    setArchiveSubmitting(true);
    try {
      await api(`/api/customers/${id}/archive`, {
        method: "POST",
        body: JSON.stringify({ reason: archiveReason })
      });
      toast.success("Customer archived. Evidence has moved to the archive volume.");
      setArchiveOpen(false);
      navigate("/customers");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Archive failed");
    } finally {
      setArchiveSubmitting(false);
    }
  }

  return (
    <>
      <div className="audity-page-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="audity-page-kicker">Customer Audit Center</p>
          <h1 className="audity-page-title">{data.customer.name}</h1>
          <p className="audity-page-copy">
            {data.customer.industry ?? "—"} · Criticality {data.customer.businessCriticality ?? "—"}
            {data.meta.totalReadiness > 0
              ? ` · avg readiness ${data.meta.totalReadiness}%`
              : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 text-right">
          {isArchived ? (
            <div className="rounded-audity border border-audity-warning/40 bg-audity-warning/10 px-3 py-2 text-xs text-audity-warning">
              <div className="font-semibold">Archived customer (read-only)</div>
              {data.customer.archiveReason ? (
                <div className="mt-0.5 italic">Reason: {data.customer.archiveReason}</div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {canCreateAudit ? (
                <button className="audity-btn-primary" onClick={() => setCreateOpen(true)}>
                  + New audit
                </button>
              ) : null}
              <Link to="/inbox" className="audity-btn-secondary">
                Inbox
              </Link>
              {canArchive ? (
                <button
                  className="audity-btn-secondary text-xs"
                  onClick={() => {
                    setArchiveReason("");
                    setArchiveOpen(true);
                  }}
                  title="Archive this customer"
                >
                  Archive customer
                </button>
              ) : null}
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

      <CustomerDetailsPanel customerId={id!} canEdit={canEdit} />

      {/* Executive Summary */}
      <section className="audity-card mb-4 p-4">
        <p className="audity-page-kicker">Executive Summary</p>
        <p className="mt-1 text-sm text-audity-secondary">{data.meta.executiveSummary}</p>
        {selectedAudit ? (
          <div className="mt-3">
            <PhaseBar active={selectedAudit.phase} />
            <p className="mt-2 text-xs text-audity-muted">
              Current phase: <strong>{selectedAudit.phase}</strong> · Fieldwork and Findings run in parallel.
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
                <h2 className="text-base font-semibold text-audity-text">Active audits</h2>
                <span className="text-xs text-audity-muted">
                  {data.audits.active.length} active
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
                <h2 className="text-base font-semibold text-audity-text">Next actions</h2>
                <span className="text-xs text-audity-muted">
                  Role view: <strong>{data.meta.role}</strong>
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
                Stuck ({data.stuck.length})
              </h2>
              <p className="mt-1 text-xs text-audity-muted">
                Active audits without movement above the configured threshold.
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
                        {entry.daysWithoutMovement} days
                        {entry.threshold ? ` / ${entry.threshold}d limit` : ""}
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
            <h2 className="mb-3 text-base font-semibold text-audity-text">Workstation</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <WorkstationTile
                to={`/customers/${id}/plan${selectedAudit ? `?audit=${selectedAudit.id}` : ""}`}
                label="Plan & Scope"
                hint="Timeline, owner, scope items"
                disabled={!selectedAudit}
              />
              <WorkstationTile
                to={`/customers/${id}/controls${selectedAudit ? `?audit=${selectedAudit.id}` : ""}`}
                label="Controls & Evidence"
                hint="Scoring, mapping, sampling"
                disabled={!selectedAudit}
              />
              <WorkstationTile
                to={`/customers/${id}/findings${selectedAudit ? `?audit=${selectedAudit.id}` : ""}`}
                label="Findings"
                hint="Lifecycle, remediation, re-test"
                disabled={!selectedAudit}
              />
              <WorkstationTile
                to={`/customers/${id}/report${selectedAudit ? `?audit=${selectedAudit.id}` : ""}`}
                label="Report & Sign-off"
                hint="SoA, pack export, signatures"
                disabled={!selectedAudit}
              />
            </div>
          </section>

          {/* Draft / Completed */}
          {(data.audits.draft.length || data.audits.completed.length) ? (
            <section className="audity-card p-4">
              <h2 className="mb-3 text-base font-semibold text-audity-text">Other audits</h2>
              <div className="space-y-3">
                {data.audits.draft.length ? (
                  <div>
                    <p className="audity-page-kicker">In preparation</p>
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
                    <p className="audity-page-kicker">Completed</p>
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
              title="No audit yet"
              description="Create the first audit for this customer to start the cockpit."
              action={
                canCreateAudit ? (
                  <button className="audity-btn-primary" onClick={() => setCreateOpen(true)}>
                    + New audit
                  </button>
                ) : null
              }
            />
          ) : null}
        </div>

        {/* Side column */}
        <aside className="space-y-4">
          <section className="audity-card p-4">
            <h2 className="text-base font-semibold text-audity-text">Team & access</h2>
            <p className="mt-2 text-sm text-audity-secondary">
              Owner: {data.team.owner ?? "—"}
            </p>
            <p className="mt-2 text-sm text-audity-secondary">
              Shared with:{" "}
              {data.team.shareTargets.length
                ? data.team.shareTargets.map((t) => t.name ?? t.email).join(", ")
                : "Nobody"}
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
                <li className="text-audity-muted">No activity.</li>
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

      <Slideover
        title={`Archive customer: ${data.customer.name}`}
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
      >
        <p className="mb-3 text-sm text-audity-secondary">
          Archiving locks this customer as read-only. Evidence and report blobs move to the
          archive volume and become unavailable until an Instance Admin approves a restore.
        </p>
        <label className="mb-2 block text-xs font-medium text-audity-secondary">
          Reason for archive
        </label>
        <textarea
          className="audity-input min-h-[7rem]"
          value={archiveReason}
          onChange={(event) => setArchiveReason(event.target.value)}
          minLength={3}
          maxLength={500}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="audity-btn-secondary"
            type="button"
            onClick={() => setArchiveOpen(false)}
          >
            Cancel
          </button>
          <button
            className="audity-btn-primary"
            type="button"
            disabled={archiveSubmitting || archiveReason.trim().length < 3}
            onClick={() => void submitArchive()}
          >
            {archiveSubmitting ? "Archiving…" : "Archive"}
          </button>
        </div>
      </Slideover>
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
    templateKey: "",
    type: "",
    audience: "",
    frameworkId: "",
    language: "en",
    targetDate: "",
    status: "draft"
  });
  const [dateUnknown, setDateUnknown] = useState(false);
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
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function applyTemplate(key: string) {
    if (!key) {
      setForm({
        ...form,
        templateKey: "",
        type: form.type,
        audience: form.audience,
        language: form.language
      });
      return;
    }
    const tpl = templates.find((t) => t.key === key);
    setForm({
      ...form,
      templateKey: key,
      type: tpl?.type ?? form.type,
      audience: tpl?.audience ?? form.audience,
      language: tpl?.language ?? form.language
    });
  }

  async function submit() {
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        templateKey: form.templateKey || undefined,
        type: form.type || "Audit",
        audience: form.audience || undefined,
        frameworkId: form.frameworkId || undefined,
        language: form.language,
        status: form.status
      };
      if (!dateUnknown && form.targetDate) {
        payload.targetDate = form.targetDate;
      }
      const result = await api<{ assessment: { id: string } }>(
        `/api/customers/${customerId}/assessments`,
        {
          method: "POST",
          body: JSON.stringify(payload)
        }
      );
      onCreated(result.assessment.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create audit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Slideover title="New audit" open={open} onClose={onClose}>
      <label className="mb-3 block text-xs font-medium text-audity-secondary">
        Template
        <select
          className="audity-input mt-2"
          value={form.templateKey}
          onChange={(event) => applyTemplate(event.target.value)}
        >
          <option value="">— None (free start) —</option>
          {templates.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-[11px] text-audity-muted">
          Pick a template to pre-fill fields, or start free.
        </span>
      </label>

      <label className="mb-3 block text-xs font-medium text-audity-secondary">
        Type
        <input
          className="audity-input mt-2"
          value={form.type}
          placeholder="e.g. Internal audit, Readiness assessment, Supplier review"
          onChange={(event) => setForm({ ...form, type: event.target.value })}
        />
      </label>

      <label className="mb-3 block text-xs font-medium text-audity-secondary">
        Audience
        <input
          className="audity-input mt-2"
          value={form.audience}
          placeholder="e.g. Management + Security, Board, Regulator"
          onChange={(event) => setForm({ ...form, audience: event.target.value })}
        />
      </label>

      <label className="mb-3 block text-xs font-medium text-audity-secondary">
        Framework
        <select
          className="audity-input mt-2"
          value={form.frameworkId}
          onChange={(event) => setForm({ ...form, frameworkId: event.target.value })}
        >
          <option value="">— None (no framework) —</option>
          {frameworks.map((f) => (
            <option key={f.id} value={f.id}>
              {f.shortName ?? f.name}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-[11px] text-audity-muted">
          Optional. Audits without a framework start with an empty question catalogue.
        </span>
      </label>

      <label className="mb-2 block text-xs font-medium text-audity-secondary">
        Target date
        <input
          type="date"
          className="audity-input mt-2"
          value={form.targetDate}
          disabled={dateUnknown}
          onChange={(event) => setForm({ ...form, targetDate: event.target.value })}
        />
      </label>
      <label className="mb-3 flex items-center gap-2 text-xs text-audity-secondary">
        <input
          type="checkbox"
          checked={dateUnknown}
          onChange={(event) => {
            setDateUnknown(event.target.checked);
            if (event.target.checked) {
              setForm({ ...form, targetDate: "" });
            }
          }}
        />
        Date not yet known — continue without a deadline
      </label>

      <div className="mt-4 flex justify-end gap-2">
        <button className="audity-btn-secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </button>
        <button
          className="audity-btn-primary"
          onClick={() => void submit()}
          disabled={submitting}
        >
          {submitting ? "Creating…" : "Create audit"}
        </button>
      </div>
    </Slideover>
  );
}
