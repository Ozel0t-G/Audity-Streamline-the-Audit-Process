import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApi } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { BrandMark } from "../../components/BrandMark";
import type { Assessment, AssessmentScope, Customer } from "./types";

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
  ["Report", true]
] as const;

export function CustomerDetailPage() {
  const { id } = useParams();
  const api = useApi();
  const { logout } = useAuth();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState("");
  const [assessmentForm, setAssessmentForm] = useState({
    type: "Full Security Maturity Assessment",
    audience: "Management + Technical Team",
    framework: "NIST CSF 2.0",
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

  async function load() {
    if (!id) return;
    const [customerPayload, assessmentPayload] = await Promise.all([
      api<{ customer: Customer }>(`/api/customers/${id}`),
      api<{ assessments: Assessment[] }>(`/api/customers/${id}/assessments`)
    ]);
    setCustomer(customerPayload.customer);
    setAssessments(assessmentPayload.assessments);
    const current = assessmentPayload.assessments[0];
    if (current) {
      setSelectedAssessmentId(current.id);
      loadScopeIntoForm(current.scope);
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
    if (selectedAssessment) {
      loadScopeIntoForm(selectedAssessment.scope);
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
    <main className="min-h-screen bg-audity-app text-audity-text">
      <header className="flex h-12 items-center justify-between border-b border-audity-border bg-audity-topnav px-5">
        <div className="flex items-center gap-3">
          <BrandMark />
          <span className="text-sm font-semibold">Audity</span>
        </div>
        <button className="h-8 rounded-audity border border-audity-borderStrong bg-audity-panel px-3 text-sm text-audity-secondary hover:border-audity-primary hover:text-audity-text" onClick={() => void logout()}>
          Logout
        </button>
      </header>
      <div className="grid min-h-[calc(100vh-48px)] grid-cols-1 lg:grid-cols-[260px_1fr]">
        <aside className="border-r border-audity-border bg-audity-sidebar p-5">
          <p className="mb-3 text-xs font-semibold uppercase text-audity-muted">Workspace</p>
          <Link className="block rounded-audity px-3 py-2 text-sm text-audity-secondary hover:bg-audity-panel" to="/dashboard">Dashboard</Link>
          <Link className="mt-1 block rounded-audity bg-audity-primaryActive px-3 py-2 text-sm font-semibold" to="/customers">Customers</Link>
          <Link className="mt-1 block rounded-audity px-3 py-2 text-sm text-audity-secondary hover:bg-audity-panel" to="/frameworks">Framework Library</Link>
        </aside>
        <section className="bg-audity-page p-5">
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
                        <td className="px-3 py-3 text-audity-secondary">{assessment.status}</td>
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
                      </tr>
                    ))}
                    {!assessments.length ? (
                      <tr><td className="px-3 py-8 text-center text-audity-muted" colSpan={6}>No assessments to show</td></tr>
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
                <button className="h-9 rounded-audity bg-audity-primary px-3 text-sm font-semibold text-white hover:bg-audity-primaryHover" disabled={!selectedAssessmentId}>Save scope</button>
              </form>
            </div>
            <form onSubmit={createAssessment} className="rounded-audity border border-audity-border bg-audity-panel p-4">
              <h2 className="mb-4 text-lg font-semibold">Create assessment</h2>
              {[
                ["type", "Type"],
                ["audience", "Audience"],
                ["framework", "Framework"],
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
              <button className="h-9 rounded-audity bg-audity-primary px-3 text-sm font-semibold text-white hover:bg-audity-primaryHover">Create assessment</button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
