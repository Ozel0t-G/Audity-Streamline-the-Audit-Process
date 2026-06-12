import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApi } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
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

  const selectedAssessment = assessments.find((assessment) => assessment.id === selectedAssessmentId);
  const currentUserId = user?.id ?? user?.sub;
  const canManageAccess = Boolean(customer && (user?.role === "Instance Admin" || user?.role === "Tenant Admin" || customer.createdByUserId === currentUserId));

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
    window.localStorage.setItem("audity_current_customer_label", customerPayload.customer.name);
    window.dispatchEvent(new CustomEvent("audity-customer-context", { detail: customerPayload.customer.name }));
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
    void api<{ users: ShareTarget[] }>(`/api/users/share-targets?search=${encodeURIComponent(shareSearch)}`)
      .then((payload) => {
        setShareTargets(payload.users);
        if (!shareUserId && payload.users[0]) setShareUserId(payload.users[0].id);
      })
      .catch(() => undefined);
  }, [shareSearch]);

  useEffect(() => {
    if (selectedAssessment) {
      loadScopeIntoForm(selectedAssessment.scope);
    }
    if (selectedAssessmentId) {
      window.localStorage.setItem("audity_last_assessment_id", selectedAssessmentId);
      window.dispatchEvent(new CustomEvent("audity-assessment-context", { detail: selectedAssessmentId }));
    }
  }, [selectedAssessmentId]);

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

  return (
    <>
          <div className="mb-5 border-b border-audity-border pb-4">
            <p className="text-xs font-semibold uppercase text-audity-primary">Customer Detail</p>
            <h1 className="mt-1 text-2xl font-semibold">{customer?.name ?? "Customer"}</h1>
            <p className="mt-2 text-sm text-audity-secondary">{customer?.industry} · {customer?.businessCriticality}</p>
          </div>
          <div className="mb-5 flex flex-wrap gap-2">
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
          {error ? <div className="mb-4 rounded-audity border border-[#FF4B00] bg-[#2A1C17] px-3 py-2 text-sm text-[#FFB199]">{error}</div> : null}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="space-y-4">
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
                      <button className="h-9 rounded-audity bg-audity-primary px-3 text-sm font-semibold text-white hover:bg-audity-primaryHover" onClick={() => setShareOpen(true)}>
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
                  {canManageAccess ? <button className="h-9 rounded-audity bg-audity-primary px-3 text-sm font-semibold text-white hover:bg-audity-primaryHover" onClick={() => void saveFrameworkScope()}>Save scope</button> : null}
                </div>
                {canManageAccess ? (
                  <select multiple className="mt-3 min-h-36 w-full rounded-audity border border-audity-border bg-audity-page px-2 py-2 text-sm text-audity-text outline-none focus:border-audity-primary" value={scopeFrameworkIds} onChange={(event) => setScopeFrameworkIds(Array.from(event.target.selectedOptions).map((option) => option.value))}>
                    {frameworks.map((framework) => <option key={framework.id} value={framework.id}>{framework.shortName ?? framework.name}</option>)}
                  </select>
                ) : null}
              </section>
              <section className="overflow-hidden rounded-audity border border-audity-border bg-audity-panel">
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
                  <label key={key} className="mb-3 block text-xs font-semibold uppercase text-audity-secondary">
                    {label}
                    <textarea
                      className="mt-2 min-h-20 w-full rounded-audity border border-audity-border bg-audity-page px-3 py-2 text-sm normal-case text-audity-text outline-none focus:border-audity-primary"
                      value={scopeForm[key as keyof typeof scopeForm]}
                      onChange={(event) => setScopeForm({ ...scopeForm, [key]: event.target.value })}
                    />
                  </label>
                ))}
                {canEditAssessment ? (
                  <button className="h-9 rounded-audity bg-audity-primary px-3 text-sm font-semibold text-white hover:bg-audity-primaryHover" disabled={!selectedAssessmentId}>Save scope</button>
                ) : null}
              </form>
            </div>
            {canCreateAssessment ? (
            <form onSubmit={createAssessment} className="rounded-audity border border-audity-border bg-audity-panel p-4">
              <h2 className="mb-4 text-lg font-semibold">Create assessment</h2>
              <label className="mb-3 block text-xs font-semibold uppercase text-audity-secondary">
                Template
                <select className="mt-2 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-2 text-sm normal-case text-audity-text outline-none focus:border-audity-primary" value={assessmentForm.templateKey} onChange={(event) => applyTemplate(event.target.value)}>
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
                <label key={key} className="mb-3 block text-xs font-semibold uppercase text-audity-secondary">
                  {label}
                  <input
                    className="mt-2 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm normal-case text-audity-text outline-none focus:border-audity-primary"
                    type={key === "targetDate" ? "date" : "text"}
                    value={assessmentForm[key as keyof typeof assessmentForm]}
                    onChange={(event) => setAssessmentForm({ ...assessmentForm, [key]: event.target.value })}
                  />
                </label>
              ))}
              <label className="mb-3 block text-xs font-semibold uppercase text-audity-secondary">
                Framework
                <select className="mt-2 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-2 text-sm normal-case text-audity-text outline-none focus:border-audity-primary" value={assessmentForm.frameworkId} onChange={(event) => setAssessmentForm({ ...assessmentForm, frameworkId: event.target.value })}>
                  {(customer?.selectedFrameworks ?? []).map((framework) => <option key={framework.id} value={framework.id}>{framework.shortName ?? framework.name}</option>)}
                </select>
              </label>
              {!customer?.selectedFrameworks?.length ? <p className="mb-3 text-sm text-audity-muted">No framework selected. Add a framework scope before creating assessments.</p> : null}
              <button className="h-9 rounded-audity bg-audity-primary px-3 text-sm font-semibold text-white hover:bg-audity-primaryHover">Create assessment</button>
            </form>
            ) : null}
          </div>
          {shareOpen ? (
            <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4">
              <form className="w-full max-w-lg rounded-audity border border-audity-border bg-audity-panel p-5 shadow-2xl" onSubmit={shareCustomer}>
                <div className="mb-4 border-b border-audity-border pb-3">
                  <h2 className="text-lg font-semibold">Share Customer</h2>
                </div>
                <label className="mb-3 block text-xs font-semibold uppercase text-audity-secondary">
                  Search active users
                  <input className="mt-2 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm normal-case text-audity-text outline-none focus:border-audity-primary" value={shareSearch} onChange={(event) => setShareSearch(event.target.value)} />
                </label>
                <label className="mb-3 block text-xs font-semibold uppercase text-audity-secondary">
                  User
                  <select className="mt-2 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-2 text-sm normal-case text-audity-text outline-none focus:border-audity-primary" value={shareUserId} onChange={(event) => setShareUserId(event.target.value)}>
                    {shareTargets.map((target) => <option key={target.id} value={target.id}>{target.name ?? target.email} · {target.email}</option>)}
                  </select>
                </label>
                <label className="mb-4 block text-xs font-semibold uppercase text-audity-secondary">
                  Invitation message
                  <textarea className="mt-2 min-h-24 w-full rounded-audity border border-audity-border bg-audity-page px-3 py-2 text-sm normal-case text-audity-text outline-none focus:border-audity-primary" placeholder="Optional message, for example: Please review the evidence section and check the open findings." value={shareMessage} onChange={(event) => setShareMessage(event.target.value)} />
                </label>
                <div className="flex justify-end gap-2">
                  <button className="h-9 rounded-audity border border-audity-borderStrong bg-audity-panelAlt px-3 text-sm text-audity-text hover:border-audity-primary" type="button" onClick={() => setShareOpen(false)}>
                    Cancel
                  </button>
                  <button className="h-9 rounded-audity bg-audity-primary px-3 text-sm font-semibold text-white hover:bg-audity-primaryHover" disabled={!shareUserId}>
                    Share
                  </button>
                </div>
              </form>
            </div>
          ) : null}
    </>
  );
}
