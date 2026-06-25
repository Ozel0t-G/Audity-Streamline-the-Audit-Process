import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApi } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { DataTable, EmptyState, PageSkeleton, SeverityBadge, useConfirm, useToast, type DataTableColumn } from "../components/ui";

type WorkbenchRecord = {
  id: string;
  kind: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  owner?: string | null;
  customerName?: string | null;
  assessmentType?: string | null;
  dueDate?: string | null;
  visibility: string;
  metadata: Record<string, unknown>;
  updatedAt: string;
};

type WorkbenchOverview = {
  analytics: {
    usage: { customers: number; assessments: number; users: number; activeSessions: number; evidenceItems: number };
    risk: { total: number; critical: number; overdue: number };
    findings: { total: number; open: number };
    connectors: { runs30d: number; errors30d: number };
    workbench: Array<{ kind: string; count: number }>;
  };
  recent: WorkbenchRecord[];
  savedViews: Array<{ id: string; name: string; scope: string; filters: Record<string, unknown>; shared: boolean }>;
  integrations: Array<{ key: string; enabled: boolean; config: Record<string, unknown>; updated_at: string }>;
};

type AdminConfig = {
  templates: Array<Record<string, unknown>>;
  recurring: Array<Record<string, unknown>>;
  approvalGates: Array<Record<string, unknown>>;
  customFields: Array<Record<string, unknown>>;
  statusWorkflows: Array<Record<string, unknown>>;
  retentionPolicies: Array<Record<string, unknown>>;
  legalHolds: Array<Record<string, unknown>>;
  webhooks: Array<Record<string, unknown>>;
  integrations: Array<{ key: string; enabled: boolean; config: Record<string, unknown> }>;
  apiTokens: Array<Record<string, unknown>>;
};

const workbenchKinds = [
  ["evidence_request", "Evidence Requests", "Request and track evidence with owner, due date, status, visibility and SLA context."],
  ["vendor", "Vendor Register", "Manage suppliers, service providers and third-party security reviews."],
  ["asset", "Asset Register", "Track systems, applications, databases, services and criticality."],
  ["policy", "Policy Register", "Versioned policies with owner, review date and evidence links."],
  ["exception", "Exceptions", "Document accepted deviations, approval, expiry and review evidence."],
  ["dependency", "Dependency Map", "Connect systems, processes, vendors and risks in one dependency register."],
  ["control_owner", "Control Owner Matrix", "Map owners to controls, domains, findings and risks."],
  ["sla", "SLA Tracking", "Measure response and remediation deadlines for requests, reviews and findings."],
  ["data_quality", "Data Quality Center", "Find missing owners, due dates, empty plans, untagged evidence and incomplete records."],
  ["approval_task", "Approval Gates", "Operational approvals for reports, risks, exceptions and customer-visible changes."],
  ["external_review", "External Reviews", "Read-only reviewer tasks and temporary external access tracking."],
  ["framework_mapping", "Framework Comparison", "Track crosswalks between frameworks, controls and internal requirements."],
  ["customer_portal_task", "Customer Portal", "Customer-facing tasks, evidence requests, report handoffs and comments."],
  ["security_task", "Security Center", "MFA, session, role, API token, SSO and SCIM hardening tasks."],
  ["health_alert", "System Health Alerts", "Backup, connector, storage and server health alert follow-up."],
  ["license_note", "License / Usage", "Track license, usage and capacity follow-up notes."],
  ["export_job", "Export Center", "Evidence packages, reports, audit logs and CSV export work."],
  ["ai_draft", "AI Drafting", "Draft findings, treatment plans, evidence requests and executive summaries."],
  ["customer_comment", "Customer Comments", "Customer-visible comments separated from internal notes."],
  ["internal_comment", "Internal Comments", "Internal collaboration notes, mentions and review context."]
] as const;

const coverageItems = [
  "Global Search", "Command Palette", "Guided Onboarding", "Assessment Timeline", "Risk Review Workflow",
  "Evidence Request Workflow", "Customer Health Score", "Better Notifications", "Saved Views / Filters",
  "Bulk Actions", "Connector Run History", "Connector Field Validation", "Audit Trail Drawer", "Report Templates",
  "Role Presets", "Customer Portal View", "Framework Comparison", "AI-Assisted Drafting", "Data Quality Center",
  "Keyboard / UX Polish", "Assessment Templates", "Recurring Assessments", "Risk Acceptance Expiry",
  "Evidence Expiry Tracking", "Approval Gates", "Internal vs Customer Comments", "Mentions", "SLA Tracking",
  "Risk Treatment Cost / Effort", "Control Owner Matrix", "Executive Dashboard", "Auditor Workbench",
  "Customer Comparison", "Trend Analysis", "Maturity Heatmap", "Dependency Mapping", "Vendor Register",
  "Asset Register", "Policy Register", "Exception Management", "Custom Fields", "Custom Status Workflows",
  "Advanced Permissions", "Delegated Admins", "Read-only External Reviewer", "Export Center",
  "Evidence Package Export", "Tamper Evidence View", "Data Retention Policies", "Legal Hold", "Webhook System",
  "Public API Tokens", "SCIM Provisioning", "SSO Login", "MFA Enforcement", "Session Management",
  "Security Center", "License / Usage Page", "System Health Alerts", "Backup Restore Wizard", "Manual"
];

function titleForKind(kind: string) {
  return workbenchKinds.find(([id]) => id === kind)?.[1] ?? kind;
}

function asText(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function WorkbenchPage() {
  const api = useApi();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const canAdmin = Boolean(user?.permissions.includes("settings.manage"));
  const canEdit = canAdmin;
  const [tab, setTab] = useState<"work" | "admin" | "analytics" | "coverage">(() => {
    const fromUrl = searchParams.get("tab");
    if (fromUrl === "work" || fromUrl === "admin" || fromUrl === "analytics" || fromUrl === "coverage") {
      return fromUrl;
    }
    return "work";
  });
  const [overview, setOverview] = useState<WorkbenchOverview | null>(null);
  const [records, setRecords] = useState<WorkbenchRecord[]>([]);
  const [adminConfig, setAdminConfig] = useState<AdminConfig | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const toast = useToast();
  const confirm = useConfirm();
  const [newToken, setNewToken] = useState("");
  const [tokenScopes, setTokenScopes] = useState<string[]>([
    "read:customers",
    "read:findings",
    "read:evidence",
    "read:reports"
  ]);
  const [form, setForm] = useState({
    kind: searchParams.get("kind") ?? "evidence_request",
    title: "",
    description: "",
    status: "open",
    priority: "medium",
    owner: "",
    dueDate: "",
    visibility: "internal"
  });
  const [savedViewForm, setSavedViewForm] = useState({ name: "", scope: "workbench" });
  const [adminForm, setAdminForm] = useState({
    name: "",
    description: "",
    entityType: "risk",
    url: "",
    fieldKey: "",
    label: "",
    integrationKey: "sso",
    enabled: false
  });

  async function load() {
    const [overviewPayload, recordsPayload] = await Promise.all([
      api<WorkbenchOverview>("/api/workbench/overview"),
      api<{ records: WorkbenchRecord[] }>(`/api/workbench/records?kind=${encodeURIComponent(form.kind)}`)
    ]);
    setOverview(overviewPayload);
    setRecords(recordsPayload.records);
    if (canAdmin) {
      setAdminConfig(await api<AdminConfig>("/api/admin/productivity/config"));
    }
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Workbench load failed"));
  }, [form.kind]);

  const kindCounts = useMemo(() => new Map(overview?.analytics.workbench.map((item) => [item.kind, item.count]) ?? []), [overview]);

  async function createRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    await api<{ record: WorkbenchRecord }>("/api/workbench/records", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        dueDate: form.dueDate || null,
        metadata: { source: "workbench", feature: titleForKind(form.kind) }
      })
    });
    setForm({ ...form, title: "", description: "", owner: "", dueDate: "" });
    setMessage("Workbench item created.");
    toast.success("Workbench item created");
    await load();
  }

  async function updateRecord(id: string, patch: Partial<WorkbenchRecord>) {
    await api(`/api/workbench/records/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    await load();
  }

  async function deleteRecord(id: string) {
    const ok = await confirm({
      title: "Delete workbench record?",
      body: "The record will be permanently removed. This cannot be undone.",
      confirmLabel: "Delete",
      destructive: true
    });
    if (!ok) return;
    try {
      await api(`/api/workbench/records/${id}`, { method: "DELETE" });
      setSelectedIds((current) => current.filter((item) => item !== id));
      toast.success("Workbench record deleted");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      setError(msg);
      toast.error(msg);
    }
  }

  async function bulkUpdate(status: string, rows?: WorkbenchRecord[]) {
    const ids = rows && rows.length ? rows.map((r) => r.id) : selectedIds;
    if (!ids.length) return;
    const ok = await confirm({
      title: `Apply "${status}" to ${ids.length} record${ids.length === 1 ? "" : "s"}?`,
      body: "The change will be applied to every selected workbench record.",
      confirmLabel: "Apply",
      destructive: status.toLowerCase() === "closed" || status.toLowerCase() === "rejected"
    });
    if (!ok) return;
    const previous = new Map<string, string>();
    for (const record of records) {
      if (ids.includes(record.id)) previous.set(record.id, record.status);
    }
    try {
      await api("/api/workbench/records/bulk", {
        method: "POST",
        body: JSON.stringify({ ids, status })
      });
      setSelectedIds([]);
      toast.success(`Updated ${ids.length} record${ids.length === 1 ? "" : "s"}`, {
        durationMs: 8000,
        action: {
          label: "Undo",
          onClick: () => {
            const groups = new Map<string, string[]>();
            for (const [recordId, previousStatus] of previous) {
              const list = groups.get(previousStatus) ?? [];
              list.push(recordId);
              groups.set(previousStatus, list);
            }
            void (async () => {
              for (const [previousStatus, recordIds] of groups) {
                await api("/api/workbench/records/bulk", {
                  method: "POST",
                  body: JSON.stringify({ ids: recordIds, status: previousStatus })
                });
              }
              await load();
              toast.info(`Reverted ${ids.length} record${ids.length === 1 ? "" : "s"}`);
            })();
          }
        }
      });
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bulk update failed";
      setError(msg);
      toast.error(msg);
    }
  }

  async function saveView(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await api("/api/workbench/saved-views", {
      method: "POST",
      body: JSON.stringify({ name: savedViewForm.name, scope: savedViewForm.scope, filters: { kind: form.kind }, columns: ["title", "status", "owner", "dueDate"], shared: true })
    });
    setSavedViewForm({ ...savedViewForm, name: "" });
    await load();
  }

  async function createAdminItem(kind: string) {
    setError("");
    setMessage("");
    const payloads: Record<string, { path: string; body: unknown }> = {
      template: { path: "/api/admin/productivity/templates", body: { name: adminForm.name, description: adminForm.description || "Assessment template", defaultDueDays: 30 } },
      recurring: { path: "/api/admin/productivity/recurring", body: { name: adminForm.name, cadence: "quarterly", enabled: true } },
      gate: { path: "/api/admin/productivity/approval-gates", body: { name: adminForm.name, entityType: adminForm.entityType, requiredApprovals: 1, enabled: true } },
      field: { path: "/api/admin/productivity/custom-fields", body: { entityType: adminForm.entityType, fieldKey: adminForm.fieldKey || adminForm.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"), label: adminForm.label || adminForm.name, fieldType: "text" } },
      workflow: { path: "/api/admin/productivity/status-workflows", body: { entityType: adminForm.entityType, name: adminForm.name, statuses: ["draft", "review", "approved", "closed"], defaultStatus: "draft" } },
      retention: { path: "/api/admin/productivity/retention-policies", body: { name: adminForm.name, entityType: adminForm.entityType, retentionDays: 365, enabled: true } },
      legalHold: { path: "/api/admin/productivity/legal-holds", body: { reason: adminForm.description || adminForm.name, status: "active" } },
      webhook: { path: "/api/admin/productivity/webhooks", body: { name: adminForm.name, targetUrl: adminForm.url, events: ["assessment.updated"], enabled: true } }
    };
    const item = payloads[kind];
    if (!item) return;
    await api(item.path, { method: "POST", body: JSON.stringify(item.body) });
    setAdminForm({ ...adminForm, name: "", description: "", url: "", fieldKey: "", label: "" });
    setMessage("Admin configuration created.");
    toast.success("Admin configuration created");
    await load();
  }

  async function createApiToken() {
    const payload = await api<{ token: string }>("/api/admin/productivity/api-tokens", {
      method: "POST",
      body: JSON.stringify({ name: adminForm.name || "Automation token", scopes: tokenScopes.length ? tokenScopes : ["read:customers"] })
    });
    setNewToken(payload.token);
    await load();
  }

  async function saveIntegration() {
    await api(`/api/admin/productivity/integration-settings/${adminForm.integrationKey}`, {
      method: "PUT",
      body: JSON.stringify({
        enabled: adminForm.enabled,
        config: {
          issuer: "https://identity.example.com",
          audience: "audity",
          provisioning: adminForm.integrationKey === "scim",
          mfaRequired: adminForm.integrationKey === "mfa_enforcement"
        }
      })
    });
    await load();
  }

  if (!overview) {
    return (
      <>
        <div className="audity-page-header">
          <p className="audity-page-kicker">Operations</p>
          <h1 className="audity-page-title">Workbench</h1>
        </div>
        <PageSkeleton cards={4} showTable />
      </>
    );
  }

  return (
    <>
      <div className="audity-page-header">
        <p className="audity-page-kicker">Operations</p>
        <h1 className="audity-page-title">Workbench</h1>
        <p className="audity-page-copy">Tenant-wide admin center for searches, saved views, evidence requests, registers, approvals, automation, governance and security administration. Changes made here apply globally to this tenant.</p>
      </div>
      {error ? <div className="mb-3 rounded-audity border border-audity-error bg-audity-error/10 px-3 py-2 text-sm text-audity-error">{error}</div> : null}
      {message ? <div className="mb-3 rounded-audity border border-audity-success bg-audity-page px-3 py-2 text-sm text-audity-success">{message}</div> : null}
      <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Workbench sections">
        {([
          ["work", "Workflows & Registers"],
          ["admin", "Automation & Governance"],
          ["analytics", "Analytics"],
          ["coverage", "Feature Coverage"]
        ] as const).map(([item, label]) => (
          <button
            key={item}
            role="tab"
            aria-selected={tab === item}
            className={`h-8 rounded-audity border px-3 text-sm ${tab === item ? "border-audity-primary bg-audity-primaryActive text-audity-text" : "border-audity-borderStrong text-audity-secondary"}`}
            onClick={() => {
              setTab(item);
              setSearchParams({ ...Object.fromEntries(searchParams), tab: item });
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "work" ? (
        <div className="grid min-w-0 gap-3 2xl:grid-cols-[260px_minmax(0,1fr)_300px]">
          <aside className="rounded-audity border border-audity-border bg-audity-panel p-3">
            <h2 className="text-sm font-semibold">Modules</h2>
            <div className="mt-3 space-y-1">
              {workbenchKinds.map(([kind, title]) => (
                <button key={kind} className={`flex w-full items-center justify-between gap-2 rounded-audity px-2 py-1.5 text-left text-sm ${form.kind === kind ? "bg-audity-primaryActive text-audity-text" : "text-audity-secondary hover:bg-audity-panelAlt"}`} onClick={() => {
                  setForm({ ...form, kind });
                  setSearchParams({ kind });
                }}>
                  <span className="truncate">{title}</span>
                  <span className="text-xs text-audity-muted">{kindCounts.get(kind) ?? 0}</span>
                </button>
              ))}
            </div>
          </aside>
          <section className="min-w-0 rounded-audity border border-audity-border bg-audity-panel">
            <div className="border-b border-audity-border px-3 py-2">
              <h2 className="text-base font-semibold">{titleForKind(form.kind)}</h2>
              <p className="mt-1 text-xs text-audity-secondary">{workbenchKinds.find(([kind]) => kind === form.kind)?.[2]}</p>
            </div>
            {canEdit ? (
              <form className="grid gap-2 border-b border-audity-border p-3 lg:grid-cols-[minmax(0,1fr)_130px_130px_120px_auto]" onSubmit={createRecord}>
                <input className="audity-input" placeholder="Title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
                <input className="audity-input" placeholder="Owner" value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })} />
                <input className="audity-input" type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} />
                <select className="audity-input" value={form.visibility} onChange={(event) => setForm({ ...form, visibility: event.target.value })}>
                  <option value="internal">Internal</option>
                  <option value="customer">Customer</option>
                  <option value="public_readonly">Read-only</option>
                </select>
                <button className="audity-btn-primary">Create</button>
                <textarea className="min-h-16 rounded-audity border border-audity-border bg-audity-page px-2.5 py-2 text-sm text-audity-text outline-none focus:border-audity-primary lg:col-span-5" placeholder="Description, acceptance reason, SLA note, mapping detail or expected evidence..." value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
              </form>
            ) : null}
            <div className="p-3">
              <DataTable<WorkbenchRecord>
                storageKey={`workbench-${form.kind}`}
                rows={records}
                getRowId={(record) => record.id}
                selectable
                emptyState={
                  <EmptyState
                    icon={<span className="text-xl">📋</span>}
                    title="No records yet"
                    description="No records have been created in this module. Use the form on the right to add one."
                  />
                }
                bulkActions={[
                  { label: "Bulk review", onRun: (rows) => void bulkUpdate("in_review", rows) },
                  { label: "Bulk close", onRun: (rows) => void bulkUpdate("closed", rows) }
                ]}
                columns={[
                  {
                    key: "title",
                    header: "Record",
                    sortValue: (record) => record.title,
                    cell: (record) => (
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{record.title}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-audity-secondary">{record.description || "No description"}</p>
                        <p className="mt-1 text-xs text-audity-muted">{record.customerName ?? "No customer"} · {record.assessmentType ?? "No assessment"} · {record.visibility}</p>
                      </div>
                    )
                  },
                  {
                    key: "status",
                    header: "Status",
                    width: "150px",
                    sortValue: (record) => record.status,
                    cell: (record) => (
                      <select className="audity-input" value={record.status} onChange={(event) => void updateRecord(record.id, { status: event.target.value } as Partial<WorkbenchRecord>)}>
                        {["open", "in_review", "approved", "in_progress", "blocked", "closed"].map((status) => <option key={status}>{status}</option>)}
                      </select>
                    )
                  },
                  {
                    key: "priority",
                    header: "Priority",
                    width: "140px",
                    sortValue: (record) => ["low", "medium", "high", "critical"].indexOf(record.priority),
                    cell: (record) => (
                      <div className="flex items-center gap-1">
                        <SeverityBadge level={record.priority} />
                        <select className="audity-input ml-1" value={record.priority} onChange={(event) => void updateRecord(record.id, { priority: event.target.value } as Partial<WorkbenchRecord>)} aria-label="Change priority">
                          {["low", "medium", "high", "critical"].map((priority) => <option key={priority}>{priority}</option>)}
                        </select>
                      </div>
                    )
                  },
                  {
                    key: "actions",
                    header: "",
                    width: "100px",
                    align: "right",
                    cell: (record) => (
                      <button className="audity-btn-secondary border-audity-error px-2 py-1 text-xs text-audity-error" onClick={() => void deleteRecord(record.id)}>Delete</button>
                    )
                  }
                ] as DataTableColumn<WorkbenchRecord>[]}
              />
            </div>
          </section>
          <aside className="space-y-3">
            <section className="rounded-audity border border-audity-border bg-audity-panel p-3">
              <h2 className="text-sm font-semibold">Tenant Saved Views</h2>
              <p className="mt-1 text-xs text-audity-muted">Saved views are global for the whole tenant and visible to all admins with Workbench access.</p>
              <form className="mt-3 flex gap-2" onSubmit={saveView}>
                <input className="audity-input" placeholder="View name" value={savedViewForm.name} onChange={(event) => setSavedViewForm({ ...savedViewForm, name: event.target.value })} />
                <button className="audity-btn-secondary">Save</button>
              </form>
              <div className="mt-3 space-y-2">
                {overview?.savedViews.map((view) => (
                  <div key={view.id} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2 text-sm">
                    <p className="font-semibold">{view.name}</p>
                    <p className="text-xs text-audity-muted">{view.scope} · tenant-wide</p>
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-audity border border-audity-border bg-audity-panel p-3">
              <h2 className="text-sm font-semibold">Health Score Inputs</h2>
              <div className="mt-3 grid gap-2 text-sm text-audity-secondary">
                <p>Critical risks: {overview?.analytics.risk.critical ?? 0}</p>
                <p>Overdue risks: {overview?.analytics.risk.overdue ?? 0}</p>
                <p>Open findings: {overview?.analytics.findings.open ?? 0}</p>
                <p>Connector errors 30d: {overview?.analytics.connectors.errors30d ?? 0}</p>
              </div>
            </section>
          </aside>
        </div>
      ) : null}

      {tab === "admin" ? (
        <div className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="rounded-audity border border-audity-border bg-audity-panel p-3">
            <h2 className="text-base font-semibold">Tenant Automation & Governance Settings</h2>
            <p className="mt-1 text-xs text-audity-muted">These settings are global for the tenant and affect all users, customers, assessments and admin workflows where applicable.</p>
            {!canAdmin ? <p className="mt-3 text-sm text-audity-muted">Settings permission required.</p> : (
              <>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <input className="audity-input" placeholder="Name" value={adminForm.name} onChange={(event) => setAdminForm({ ...adminForm, name: event.target.value })} />
                  <input className="audity-input" placeholder="Description / reason" value={adminForm.description} onChange={(event) => setAdminForm({ ...adminForm, description: event.target.value })} />
                  <input className="audity-input" placeholder="Webhook URL" value={adminForm.url} onChange={(event) => setAdminForm({ ...adminForm, url: event.target.value })} />
                  <select className="audity-input" value={adminForm.entityType} onChange={(event) => setAdminForm({ ...adminForm, entityType: event.target.value })}>
                    {["risk", "finding", "report", "evidence", "customer", "assessment", "user"].map((type) => <option key={type}>{type}</option>)}
                  </select>
                  <input className="audity-input" placeholder="Field key" value={adminForm.fieldKey} onChange={(event) => setAdminForm({ ...adminForm, fieldKey: event.target.value })} />
                  <input className="audity-input" placeholder="Field label" value={adminForm.label} onChange={(event) => setAdminForm({ ...adminForm, label: event.target.value })} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    ["template", "Assessment template"],
                    ["recurring", "Recurring assessment"],
                    ["gate", "Approval gate"],
                    ["field", "Custom field"],
                    ["workflow", "Status workflow"],
                    ["retention", "Retention policy"],
                    ["legalHold", "Legal hold"],
                    ["webhook", "Webhook"]
                  ].map(([kind, label]) => <button key={kind} className="audity-btn-secondary" onClick={() => void createAdminItem(kind)}>{label}</button>)}
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-audity border border-audity-border bg-audity-page p-3">
                    <h3 className="text-sm font-semibold">SSO / SCIM / MFA / Delegated Admins</h3>
                    <div className="mt-3 flex gap-2">
                      <select className="audity-input" value={adminForm.integrationKey} onChange={(event) => setAdminForm({ ...adminForm, integrationKey: event.target.value })}>
                        {["sso", "scim", "mfa_enforcement", "delegated_admins", "customer_portal", "webhooks"].map((key) => <option key={key}>{key}</option>)}
                      </select>
                      <label className="flex items-center gap-2 text-sm text-audity-secondary"><input type="checkbox" checked={adminForm.enabled} onChange={(event) => setAdminForm({ ...adminForm, enabled: event.target.checked })} />Enabled</label>
                      <button className="audity-btn-secondary" onClick={() => void saveIntegration()}>Save</button>
                    </div>
                  </div>
                  <div className="rounded-audity border border-audity-border bg-audity-page p-3">
                    <h3 className="text-sm font-semibold">Public API Tokens</h3>
                    <p className="mt-1 text-xs text-audity-muted">Read-only scopes for the public API (GET /api/public/v1/…).</p>
                    <div className="mt-2 grid gap-1">
                      {[
                        { scope: "read:customers", label: "Customers & assessments" },
                        { scope: "read:findings", label: "Findings & risks" },
                        { scope: "read:evidence", label: "Evidence metadata" },
                        { scope: "read:reports", label: "Report metadata" }
                      ].map(({ scope, label }) => (
                        <label key={scope} className="flex items-center gap-2 text-sm text-audity-secondary">
                          <input
                            type="checkbox"
                            checked={tokenScopes.includes(scope)}
                            onChange={(event) =>
                              setTokenScopes((prev) =>
                                event.target.checked ? [...prev, scope] : prev.filter((s) => s !== scope)
                              )
                            }
                          />
                          {label} <span className="font-mono text-xs text-audity-muted">{scope}</span>
                        </label>
                      ))}
                    </div>
                    <button className="mt-3 audity-btn-secondary" disabled={!tokenScopes.length} onClick={() => void createApiToken()}>Create token</button>
                    {newToken ? <p className="mt-2 break-all rounded-audity border border-audity-warning px-2 py-1 font-mono text-xs text-audity-warning">{newToken}</p> : null}
                  </div>
                </div>
              </>
            )}
          </section>
          <aside className="rounded-audity border border-audity-border bg-audity-panel p-3">
            <h2 className="text-sm font-semibold">Configured Objects</h2>
            <div className="mt-3 space-y-3 text-sm">
              {adminConfig ? Object.entries(adminConfig).map(([key, value]) => (
                <details key={key} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                  <summary className="cursor-pointer font-semibold">{key} ({Array.isArray(value) ? value.length : 0})</summary>
                  <div className="mt-2 space-y-1 text-xs text-audity-secondary">
                    {Array.isArray(value) && value.slice(0, 6).map((item, index) => {
                      const row = item as Record<string, unknown>;
                      return <p key={String(row.id ?? row.key ?? index)} className="truncate">{asText(row.name ?? row.key ?? row.entity_type ?? row.id)}</p>;
                    })}
                  </div>
                </details>
              )) : <p className="text-audity-muted">No configuration loaded.</p>}
            </div>
          </aside>
        </div>
      ) : null}

      {tab === "analytics" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Customers", overview?.analytics.usage.customers],
            ["Assessments", overview?.analytics.usage.assessments],
            ["Evidence", overview?.analytics.usage.evidenceItems],
            ["Active Sessions", overview?.analytics.usage.activeSessions],
            ["Total Risks", overview?.analytics.risk.total],
            ["Critical Risks", overview?.analytics.risk.critical],
            ["Open Findings", overview?.analytics.findings.open],
            ["Connector Errors", overview?.analytics.connectors.errors30d]
          ].map(([label, value]) => (
            <section key={label} className="rounded-audity border border-audity-border bg-audity-panel p-3">
              <p className="text-xs font-medium text-audity-muted">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{value ?? 0}</p>
            </section>
          ))}
        </div>
      ) : null}

      {tab === "coverage" ? (
        <section className="rounded-audity border border-audity-border bg-audity-panel p-3">
          <h2 className="text-base font-semibold">Feature Coverage 1-60</h2>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {coverageItems.map((item, index) => (
              <div key={item} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                <p className="text-sm font-semibold">{index + 1}. {item}</p>
                <p className="mt-1 text-xs text-audity-muted">Available through navigation, Workbench, Admin settings, existing assessment pages or Manual.</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
