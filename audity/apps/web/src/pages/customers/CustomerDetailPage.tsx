import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApi } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { useCustomerContext } from "../../components/CustomerContextProvider";
import { MultiCombobox, PageSkeleton, Slideover, useConfirm, useToast, type ComboOption } from "../../components/ui";
import type { Assessment, AssessmentScope, Customer } from "./types";

type FrameworkOption = { id: string; name: string; shortName: string | null };
type ShareTarget = { id: string; name: string | null; email: string; role: string; status: string };
type AssessmentTemplate = {
  key: string;
  name: string;
  type: string;
  audience: string;
  language: string;
  status: string;
  scope: AssessmentScope;
};

function csv(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function toCsv(value: string[] | undefined): string {
  return (value ?? []).join(", ");
}

const workflow = [
  ["Setup", false],
  ["Scope", false],
  ["Questions", false],
  ["Findings", false],
  ["Risk", false],
  ["Report", false]
] as const;

const statusLabels: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  imported: "Imported",
  completed: "Completed",
  archived: "Archived"
};

function statusLabel(value: string | null | undefined) {
  return statusLabels[String(value ?? "")] ?? String(value ?? "-");
}

export function CustomerDetailPage() {
  const { id } = useParams();
  const api = useApi();
  const { user } = useAuth();
  const { setCustomerLabel, setAssessmentId: setActiveAssessmentId } = useCustomerContext();
  const canCreateAssessment = Boolean(user?.permissions.includes("assessment.create"));
  const canEditAssessment = Boolean(user?.permissions.includes("assessment.edit"));
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [frameworks, setFrameworks] = useState<FrameworkOption[]>([]);
  const [templates, setTemplates] = useState<AssessmentTemplate[]>([]);
  const [shareTargets, setShareTargets] = useState<ShareTarget[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareSearch, setShareSearch] = useState("");
  const [shareUserId, setShareUserId] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [scopeFrameworkIds, setScopeFrameworkIds] = useState<string[]>([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState("");
  const [assessmentForm, setAssessmentForm] = useState({
    templateKey: "iso27001_readiness",
    type: "Full Security Maturity Assessment",
    audience: "Management + Technical Team",
    frameworkId: "",
    language: "en",
    targetDate: "",
    status: "draft"
  });
  const [scopeForm, setScopeForm] = useState({
    inScopeSystems: "",
    outOfScope: "",
    businessProcesses: "",
    regulatoryContext: "",
    assumptions: "",
    limitations: "",
    criticality: "Medium"
  });
  const [error, setError] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveSubmitting, setArchiveSubmitting] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const selectedAssessment = assessments.find((assessment) => assessment.id === selectedAssessmentId);
  const currentUserId = user?.id ?? user?.sub;
  const canManageAccess = Boolean(customer && (user?.role === "Instance Admin" || user?.role === "Tenant Admin" || customer.createdByUserId === currentUserId));
  const canArchive = Boolean(user?.permissions?.includes("customer.archive"));
  const isArchived = Boolean(customer?.archivedAt);

  async function load() {
    if (!id) return;
    const [customerPayload, assessmentPayload, frameworkPayload, templatePayload] = await Promise.all([
      api<{ customer: Customer }>(`/api/customers/${id}`),
      api<{ assessments: Assessment[] }>(`/api/customers/${id}/assessments`),
      api<{ frameworks: FrameworkOption[] }>("/api/frameworks"),
      api<{ templates: AssessmentTemplate[] }>("/api/assessment-templates")
    ]);
    setCustomer(customerPayload.customer);
    setFrameworks(frameworkPayload.frameworks);
    setTemplates(templatePayload.templates);
    const selected = customerPayload.customer.selectedFrameworks?.map((framework) => framework.id) ?? [];
    setScopeFrameworkIds(selected);
    if (!assessmentForm.frameworkId && selected[0]) {
      setAssessmentForm((current) => ({ ...current, frameworkId: selected[0] }));
    }
    setCustomerLabel(customerPayload.customer.name);
    setAssessments(assessmentPayload.assessments);
    const current = assessmentPayload.assessments[0];
    if (current) {
      setSelectedAssessmentId(current.id);
      loadScopeIntoForm(current.scope);
    }
  }

  function applyTemplate(templateKey: string) {
    const template = templates.find((item) => item.key === templateKey);
    setAssessmentForm((current) => ({
      ...current,
      templateKey,
      type: template?.type ?? current.type,
      audience: template?.audience ?? current.audience,
      language: template?.language ?? current.language,
      status: template?.status ?? current.status
    }));
    if (template?.scope) {
      loadScopeIntoForm(template.scope);
    }
  }

  function loadScopeIntoForm(scope: AssessmentScope) {
    setScopeForm({
      inScopeSystems: toCsv(scope?.inScopeSystems),
      outOfScope: toCsv(scope?.outOfScope),
      businessProcesses: toCsv(scope?.businessProcesses),
      regulatoryContext: scope?.regulatoryContext ?? "",
      assumptions: scope?.assumptions ?? "",
      limitations: scope?.limitations ?? "",
      criticality: scope?.criticality ?? "Medium"
    });
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Load failed"));
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      if (cancelled) return;
      void api<{ users: ShareTarget[] }>(`/api/users/share-targets?search=${encodeURIComponent(shareSearch)}`)
        .then((payload) => {
          if (cancelled) return;
          setShareTargets(payload.users);
          if (!shareUserId && payload.users[0]) setShareUserId(payload.users[0].id);
        })
        .catch(() => undefined);
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [shareSearch]);

  useEffect(() => {
    if (selectedAssessment) {
      loadScopeIntoForm(selectedAssessment.scope);
    }
    if (selectedAssessmentId) {
      window.localStorage.setItem("audity_last_assessment_id", selectedAssessmentId);
      setActiveAssessmentId(selectedAssessmentId);
    } else {
      setActiveAssessmentId("");
    }
  }, [selectedAssessmentId, setActiveAssessmentId]);

  async function createAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const payload = await api<{ assessment: Assessment }>(`/api/customers/${id}/assessments`, {
        method: "POST",
        body: JSON.stringify(assessmentForm)
      });
      await load();
      setSelectedAssessmentId(payload.assessment.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create assessment failed");
    }
  }

  async function shareCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await api(`/api/customers/${id}/share`, {
        method: "POST",
        body: JSON.stringify({ userId: shareUserId, message: shareMessage || undefined })
      });
      setShareMessage("");
      setShareOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Share failed");
    }
  }

  async function saveFrameworkScope() {
    setError("");
    try {
      const payload = await api<{ customer: Customer }>(`/api/customers/${id}/frameworks`, {
        method: "PATCH",
        body: JSON.stringify({ frameworkIds: scopeFrameworkIds })
      });
      setCustomer(payload.customer);
      if (!assessmentForm.frameworkId && scopeFrameworkIds[0]) {
        setAssessmentForm({ ...assessmentForm, frameworkId: scopeFrameworkIds[0] });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save framework scope failed");
    }
  }

  async function saveScope(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAssessmentId) return;
    setError("");
    try {
      await api(`/api/assessments/${selectedAssessmentId}/scope`, {
        method: "PUT",
        body: JSON.stringify({
          inScopeSystems: csv(scopeForm.inScopeSystems),
          outOfScope: csv(scopeForm.outOfScope),
          businessProcesses: csv(scopeForm.businessProcesses),
          regulatoryContext: scopeForm.regulatoryContext,
          assumptions: scopeForm.assumptions,
          limitations: scopeForm.limitations,
          criticality: scopeForm.criticality
        })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save scope failed");
    }
  }

  if (!customer) {
    return (
      <>
        <div className="audity-page-header">
          <p className="audity-page-kicker">Customer Detail</p>
          <h1 className="audity-page-title">Loading customer…</h1>
        </div>
        <PageSkeleton cards={2} showTable />
      </>
    );
  }

  return (
    <>
          <div className="audity-page-header flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="audity-page-kicker">Customer Detail</p>
              <h1 className="audity-page-title">{customer.name}</h1>
              <p className="audity-page-copy">{customer.industry} · {customer.businessCriticality}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              {isArchived ? (
                <div className="rounded-audity border border-audity-warning/40 bg-audity-warning/10 px-3 py-2 text-xs text-audity-warning">
                  <div className="font-semibold">Archived customer (read-only)</div>
                  <div className="mt-0.5">
                    on {customer.archivedAt ? new Date(customer.archivedAt).toLocaleString() : "—"}
                  </div>
                  {customer.archiveReason ? (
                    <div className="mt-0.5 italic">Reason: {customer.archiveReason}</div>
                  ) : null}
                </div>
              ) : null}
              {!isArchived && canArchive ? (
                <button
                  className="audity-btn-secondary text-xs"
                  onClick={() => {
                    setArchiveReason("");
                    setArchiveOpen(true);
                  }}
                >
                  Archive customer
                </button>
              ) : null}
              {isArchived ? (
                <button
                  className="audity-btn-secondary text-xs"
                  onClick={() => navigate("/customers/archive")}
                >
                  Request restore
                </button>
              ) : null}
            </div>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            {workflow.map(([label, locked], index) => (
              <div
                key={label}
                className={`rounded-audity border px-3 py-2 text-xs font-semibold ${
                  locked
                    ? "border-audity-border bg-audity-panel text-audity-muted"
                    : index === 1
                      ? "border-audity-primary bg-audity-primaryActive text-white"
                      : "border-audity-borderStrong bg-audity-panel text-audity-secondary"
                }`}
              >
                {label}{locked ? " · locked" : ""}
              </div>
            ))}
          </div>
          {error ? <div className="mb-4 rounded-audity border border-audity-error bg-audity-error/10 px-3 py-2 text-sm text-audity-error">{error}</div> : null}
          <div className="grid min-w-0 gap-3 2xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-3">
              <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <h2 className="text-lg font-semibold">Access</h2>
                    <p className="mt-2 text-sm text-audity-secondary">
                      Created by: {customer?.createdByName ?? "-"} {customer?.createdByEmail ? `<${customer.createdByEmail}>` : ""}
                    </p>
                    <p className="mt-2 text-sm text-audity-secondary">
                      Shared with: {customer?.sharedWith?.map((share) => share.name ?? share.email).join(", ") || "Not shared"}
                    </p>
                  </div>
                  {canManageAccess ? (
                    <div className="flex justify-end">
                      <button className="audity-btn-primary" onClick={() => setShareOpen(true)}>
                        Share Customer
                      </button>
                    </div>
                  ) : null}
                </div>
              </section>
              <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Framework Scope</h2>
                    <p className="mt-2 text-sm text-audity-secondary">
                      {customer?.selectedFrameworks?.map((framework) => framework.shortName ?? framework.name).join(", ") || "No framework selected. Please select at least one framework to generate the question catalog."}
                    </p>
                  </div>
                  {canManageAccess ? <button className="audity-btn-primary" onClick={() => void saveFrameworkScope()}>Save scope</button> : null}
                </div>
                {canManageAccess ? (
                  <div className="mt-3">
                    <MultiCombobox
                      options={frameworks.map((framework): ComboOption => ({
                        value: framework.id,
                        label: framework.shortName ?? framework.name,
                        hint: framework.shortName ? framework.name : undefined
                      }))}
                      value={scopeFrameworkIds}
                      onChange={setScopeFrameworkIds}
                      placeholder="Add frameworks…"
                      ariaLabel="Framework scope"
                      emptyText="No frameworks available"
                    />
                  </div>
                ) : null}
              </section>
              <section className="min-w-0 overflow-x-auto rounded-audity border border-audity-border bg-audity-panel">
                <div className="border-b border-audity-border px-4 py-3">
                  <h2 className="text-lg font-semibold">Assessments</h2>
                </div>
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-audity-tableHeader text-xs uppercase text-audity-muted">
                    <tr>
                      <th className="border-b border-audity-border px-3 py-3 text-left">Type</th>
                      <th className="border-b border-audity-border px-3 py-3 text-left">Audience</th>
                      <th className="border-b border-audity-border px-3 py-3 text-left">Framework</th>
                      <th className="border-b border-audity-border px-3 py-3 text-left">Status</th>
                      <th className="border-b border-audity-border px-3 py-3 text-left">Questions</th>
                      <th className="border-b border-audity-border px-3 py-3 text-left">Risk</th>
                      <th className="border-b border-audity-border px-3 py-3 text-left">Report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assessments.map((assessment) => (
                      <tr
                        key={assessment.id}
                        className={`cursor-pointer border-b border-audity-border last:border-0 ${assessment.id === selectedAssessmentId ? "bg-audity-primaryActive/30" : ""}`}
                        onClick={() => setSelectedAssessmentId(assessment.id)}
                      >
                        <td className="px-3 py-3 font-semibold text-audity-primary">{assessment.type}</td>
                        <td className="px-3 py-3 text-audity-secondary">{assessment.audience}</td>
                        <td className="px-3 py-3 text-audity-secondary">{assessment.framework}</td>
                        <td className="px-3 py-3 text-audity-secondary">{statusLabel(assessment.status)}</td>
                        <td className="px-3 py-3">
                          <Link
                            className="rounded-audity border border-audity-borderStrong px-2 py-1 text-xs font-semibold text-audity-primary hover:border-audity-primary"
                            to={`/assessments/${assessment.id}/questions`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            Open
                          </Link>
                        </td>
                        <td className="px-3 py-3">
                          <Link
                            className="rounded-audity border border-audity-borderStrong px-2 py-1 text-xs font-semibold text-audity-primary hover:border-audity-primary"
                            to={`/assessments/${assessment.id}/workflow`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            Open
                          </Link>
                        </td>
                        <td className="px-3 py-3">
                          <Link
                            className="rounded-audity border border-audity-borderStrong px-2 py-1 text-xs font-semibold text-audity-primary hover:border-audity-primary"
                            to={`/assessments/${assessment.id}/assets`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                    {!assessments.length ? (
                      <tr><td className="px-3 py-8 text-center text-audity-muted" colSpan={7}>No assessments to show</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </section>
              <form onSubmit={saveScope} className="rounded-audity border border-audity-border bg-audity-panel p-4">
                <h2 className="mb-4 text-lg font-semibold">Scope & Context</h2>
                {[
                  ["inScopeSystems", "In-scope systems"],
                  ["outOfScope", "Out-of-scope"],
                  ["businessProcesses", "Business processes"],
                  ["regulatoryContext", "Regulatory context"],
                  ["assumptions", "Assumptions"],
                  ["limitations", "Limitations"],
                  ["criticality", "Criticality"]
                ].map(([key, label]) => (
                  <label key={key} className="mb-3 block text-xs font-medium text-audity-secondary">
                    {label}
                    <textarea
                      className="mt-2 min-h-20 w-full rounded-audity border border-audity-border bg-audity-page px-3 py-2 text-sm normal-case text-audity-text outline-none focus:border-audity-primary"
                      value={scopeForm[key as keyof typeof scopeForm]}
                      onChange={(event) => setScopeForm({ ...scopeForm, [key]: event.target.value })}
                    />
                  </label>
                ))}
                {canEditAssessment ? (
                  <button className="audity-btn-primary" disabled={!selectedAssessmentId}>Save scope</button>
                ) : null}
              </form>
            </div>
            {canCreateAssessment ? (
            <form onSubmit={createAssessment} className="rounded-audity border border-audity-border bg-audity-panel p-4">
              <h2 className="mb-4 text-lg font-semibold">Create assessment</h2>
              <label className="mb-3 block text-xs font-medium text-audity-secondary">
                Template
                <select className="mt-2 audity-input" value={assessmentForm.templateKey} onChange={(event) => applyTemplate(event.target.value)}>
                  {templates.map((template) => <option key={template.key} value={template.key}>{template.name}</option>)}
                </select>
              </label>
              {[
                ["type", "Type"],
                ["audience", "Audience"],
                ["language", "Language"],
                ["targetDate", "Target date"],
                ["status", "Status"]
              ].map(([key, label]) => (
                <label key={key} className="mb-3 block text-xs font-medium text-audity-secondary">
                  {label}
                  <input
                    className="mt-2 audity-input"
                    type={key === "targetDate" ? "date" : "text"}
                    value={assessmentForm[key as keyof typeof assessmentForm]}
                    onChange={(event) => setAssessmentForm({ ...assessmentForm, [key]: event.target.value })}
                  />
                </label>
              ))}
              <label className="mb-3 block text-xs font-medium text-audity-secondary">
                Framework
                <select className="mt-2 audity-input" value={assessmentForm.frameworkId} onChange={(event) => setAssessmentForm({ ...assessmentForm, frameworkId: event.target.value })}>
                  {(customer?.selectedFrameworks ?? []).map((framework) => <option key={framework.id} value={framework.id}>{framework.shortName ?? framework.name}</option>)}
                </select>
              </label>
              {!customer?.selectedFrameworks?.length ? <p className="mb-3 text-sm text-audity-muted">No framework selected. Add a framework scope before creating assessments.</p> : null}
              <button className="audity-btn-primary">Create assessment</button>
            </form>
            ) : null}
          </div>
          {shareOpen ? (
            <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4">
              <form className="w-full max-w-lg rounded-audity border border-audity-border bg-audity-panel p-5 shadow-2xl" onSubmit={shareCustomer}>
                <div className="mb-4 border-b border-audity-border pb-3">
                  <h2 className="text-lg font-semibold">Share Customer</h2>
                </div>
                <label className="mb-3 block text-xs font-medium text-audity-secondary">
                  Search active users
                  <input className="mt-2 audity-input" value={shareSearch} onChange={(event) => setShareSearch(event.target.value)} />
                </label>
                <label className="mb-3 block text-xs font-medium text-audity-secondary">
                  User
                  <select className="mt-2 audity-input" value={shareUserId} onChange={(event) => setShareUserId(event.target.value)}>
                    {shareTargets.map((target) => <option key={target.id} value={target.id}>{target.name ?? target.email} · {target.email}</option>)}
                  </select>
                </label>
                <label className="mb-4 block text-xs font-medium text-audity-secondary">
                  Invitation message
                  <textarea className="mt-2 min-h-24 w-full rounded-audity border border-audity-border bg-audity-page px-3 py-2 text-sm normal-case text-audity-text outline-none focus:border-audity-primary" placeholder="Optional message, for example: Please review the evidence section and check the open findings." value={shareMessage} onChange={(event) => setShareMessage(event.target.value)} />
                </label>
                <div className="flex justify-end gap-2">
                  <button className="audity-btn-secondary" type="button" onClick={() => setShareOpen(false)}>
                    Cancel
                  </button>
                  <button className="audity-btn-primary" disabled={!shareUserId}>
                    Share
                  </button>
                </div>
              </form>
            </div>
          ) : null}
          <Slideover
            title={`Archive customer: ${customer?.name ?? ""}`}
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
                onClick={async () => {
                  if (!customer) return;
                  const ok = await confirm({
                    title: `Archive ${customer.name}?`,
                    body:
                      "This will move evidence + reports to the archive volume and lock the customer as read-only.",
                    confirmLabel: "Archive",
                    cancelLabel: "Cancel",
                    destructive: true
                  });
                  if (!ok) return;
                  setArchiveSubmitting(true);
                  try {
                    await api(`/api/customers/${customer.id}/archive`, {
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
                }}
              >
                {archiveSubmitting ? "Archiving…" : "Archive"}
              </button>
            </div>
          </Slideover>
    </>
  );
}
