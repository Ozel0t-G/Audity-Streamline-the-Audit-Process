import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApi } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { useConfirm, useToast } from "../../components/ui";

const apiBaseUrl = import.meta.env.VITE_AUDITY_API_URL ?? "";

type EvidenceItem = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  notes: string;
  createdAt: string;
};

type Branding = {
  logoObjectKey: string | null;
  logoFileName: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headerText: string;
  footerText: string;
  confidentialityLabel: string;
  watermark: string;
};

type Report = {
  id: string;
  status: string;
  selectedBlocks: string[];
  authorInfo: Record<string, string>;
};

const blocks = [
  "Cover",
  "Executive Summary",
  "Scope",
  "Maturity Overview",
  "Framework Readiness",
  "Top Risks",
  "Detailed Findings",
  "Risk Register",
  "Roadmap",
  "Appendix"
];

export function AssessmentAssetsPage({
  assessmentId,
  embedded = false
}: { assessmentId?: string; embedded?: boolean } = {}) {
  const params = useParams();
  const id = assessmentId ?? params.id;
  const navigate = useNavigate();
  const api = useApi();
  const { accessToken, expireSession, refreshSession, user } = useAuth();
  const loadSeqRef = useRef(0);
  const can = (permission: string) => Boolean(user?.permissions.includes(permission));
  const canUploadEvidence = can("evidence.upload");
  const canDownloadEvidence = can("evidence.download");
  const canManageBranding = can("branding.manage");
  const canExportReport = can("report.export");
  const canSendReport = can("report.send");
  const canImportAssessment = can("assessment.create");
  const [evidenceItems, setEvidenceItems] = useState<EvidenceItem[]>([]);
  const [branding, setBranding] = useState<Branding>({
    logoObjectKey: null,
    logoFileName: null,
    primaryColor: "#008CFF",
    secondaryColor: "#061E3A",
    accentColor: "#2ECC71",
    headerText: "Audity Assessment Report",
    footerText: "Confidential",
    confidentialityLabel: "Confidential",
    watermark: ""
  });
  const [selectedBlocks, setSelectedBlocks] = useState(blocks);
  const [exportFormat, setExportFormat] = useState(window.localStorage.getItem("audity_export_format") ?? "PDF");
  const [authorInfo, setAuthorInfo] = useState({
    name: "Instance Admin",
    role: "Lead Auditor",
    email: "admin@audity.local",
    organization: "Audity",
    date: new Date().toISOString().slice(0, 10)
  });
  const [report, setReport] = useState<Report | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");
  const [job, setJob] = useState<{ id: string; status: string; downloadUrl?: string | null } | null>(null);
  const [emailJob, setEmailJob] = useState<{ id: string; status: string; result?: { smtpResult?: string } | null } | null>(null);
  const [sendForm, setSendForm] = useState({
    recipient: "",
    subject: "Audity secure assessment report",
    message: "",
    includeRiskRegister: true,
    warningAccepted: false
  });
  const [error, setError] = useState("");
  const toast = useToast();
  const confirm = useConfirm();

  const qualityChecks = [
    { label: "At least one report chapter selected", ok: selectedBlocks.length > 0 },
    { label: "Author name is filled", ok: Boolean(authorInfo.name.trim()) },
    { label: "Author email is filled", ok: Boolean(authorInfo.email.trim()) },
    { label: "Evidence uploaded or intentionally left empty", ok: evidenceItems.length >= 0 },
    { label: "Confidentiality label configured", ok: Boolean(branding.confidentialityLabel.trim()) }
  ];

  async function fetchWithFreshAuth(path: string, init: RequestInit = {}) {
    const send = (token: string | null) =>
      fetch(`${apiBaseUrl}${path}`, {
        ...init,
        credentials: "include",
        headers: token ? { ...Object.fromEntries(new Headers(init.headers)), Authorization: `Bearer ${token}` } : init.headers
      });
    let response = await send(accessToken);
    if (response.status === 401) {
      const refreshed = await refreshSession();
      if (refreshed) {
        response = await send(refreshed.accessToken);
      }
    }
    if (response.status === 401) {
      expireSession("Your session expired. Please sign in again.");
      navigate("/login", { replace: true });
    }
    return response;
  }

  async function load() {
    if (!id) return;
    // Guard against stale responses when the route id (or assessmentId prop) changes.
    const requestId = ++loadSeqRef.current;
    const evidencePayload = await api<{ evidenceItems: EvidenceItem[] }>(`/api/assessments/${id}/evidence`);
    if (loadSeqRef.current !== requestId) return;
    setEvidenceItems(evidencePayload.evidenceItems);
    if (canManageBranding) {
      const brandingPayload = await api<{ branding: Branding }>("/api/admin/branding");
      if (loadSeqRef.current !== requestId) return;
      setBranding(brandingPayload.branding);
    }
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Load failed"));
  }, [id]);

  async function uploadEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id) return;
    const form = event.currentTarget;
    const input = form.elements.namedItem("file") as HTMLInputElement;
    if (!input.files?.[0]) return;
    const body = new FormData();
    body.set("file", input.files[0]);
    const notes = form.elements.namedItem("notes") as HTMLInputElement;
    const tag = form.elements.namedItem("tag") as HTMLInputElement;
    const version = form.elements.namedItem("version") as HTMLInputElement;
    const expires = form.elements.namedItem("expires") as HTMLInputElement;
    body.set("notes", [
      tag.value ? `Tag: ${tag.value}` : "",
      version.value ? `Version: ${version.value}` : "",
      expires.value ? `Expires: ${expires.value}` : "",
      notes.value
    ].filter(Boolean).join(" | "));
    await api(`/api/assessments/${id}/evidence`, { method: "POST", body });
    form.reset();
    await load();
  }

  async function downloadEvidence(item: EvidenceItem) {
    if (!id) return;
    const payload = await api<{ downloadUrl: string }>(`/api/assessments/${id}/evidence/${item.id}/download`);
    window.open(payload.downloadUrl, "_blank", "noopener,noreferrer");
  }

  async function deleteEvidence(item: EvidenceItem) {
    if (!id) return;
    const ok = await confirm({
      title: "Delete evidence?",
      body: `"${item.fileName || "This evidence"}" will be permanently removed and unlinked from all controls.`,
      confirmLabel: "Delete",
      destructive: true
    });
    if (!ok) return;
    try {
      await api(`/api/assessments/${id}/evidence/${item.id}`, { method: "DELETE" });
      toast.success("Evidence deleted");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }


  async function createReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id) return;
    const payload = await api<{ report: Report }>(`/api/assessments/${id}/reports`, {
      method: "POST",
      body: JSON.stringify({ selectedBlocks, authorInfo })
    });
    setReport(payload.report);
    setPreviewHtml("");
  }

  async function exportReport() {
    if (!id || !report) return;
    window.localStorage.setItem("audity_export_format", exportFormat);
    const format = exportFormat.toLowerCase() === "excel" ? "xlsx" : "pdf";
    const payload = await api<{ jobId: string }>(`/api/assessments/${id}/reports/${report.id}/export`, {
      method: "POST",
      body: JSON.stringify({ format })
    });
    setJob({ id: payload.jobId, status: "queued" });
  }

  async function pollJob() {
    if (!job) return;
    const payload = await api<{ id: string; status: string; downloadUrl?: string | null }>(`/api/jobs/${job.id}/status`);
    setJob(payload);
  }

  async function sendReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id || !report) return;
    const payload = await api<{ jobId: string; packageDownloadUrl: string }>(
      `/api/assessments/${id}/reports/${report.id}/send`,
      {
        method: "POST",
        body: JSON.stringify(sendForm)
      }
    );
    setEmailJob({ id: payload.jobId, status: "queued" });
    window.open(payload.packageDownloadUrl, "_blank", "noopener,noreferrer");
  }

  async function pollEmailJob() {
    if (!emailJob) return;
    const payload = await api<{ id: string; status: string; result?: { smtpResult?: string } | null }>(
      `/api/email-jobs/${emailJob.id}/status`
    );
    setEmailJob(payload);
  }

  async function exportAssessment() {
    if (!id) return;
    const response = await fetchWithFreshAuth(`/api/assessments/${id}/export`);
    if (response.status === 401) return;
    if (!response.ok) throw new Error(`Export failed: ${response.status}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `audity-assessment-${id}.cisoassess`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem("importFile") as HTMLInputElement;
    if (!input.files?.[0]) return;
    const body = new FormData();
    body.set("file", input.files[0]);
    const payload = await api<{ customerId: string; assessmentId: string }>("/api/assessments/import", {
      method: "POST",
      body
    });
    form.reset();
    navigate(`/customers/${payload.customerId}`);
  }

  async function openPreview() {
    if (!id || !report) return;
    const response = await fetchWithFreshAuth(`/api/assessments/${id}/reports/${report.id}/preview`);
    if (response.status === 401) return;
    if (!response.ok) {
      throw new Error(`Preview failed: ${response.status}`);
    }
    const html = await response.text();
    setPreviewHtml(html);
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <>
          {!embedded ? (
          <div className="audity-page-header">
            <p className="audity-page-kicker">Evidence & Report Builder</p>
            <h1 className="audity-page-title">Assessment Assets</h1>
          </div>
          ) : null}
          {error ? <div className="mb-4 rounded-audity border border-audity-error bg-audity-error/10 px-3 py-2 text-sm text-audity-error">{error}</div> : null}
          <div className="grid min-w-0 gap-3 2xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
              <h2 className="mb-4 text-lg font-semibold">Evidence</h2>
              {canUploadEvidence ? (
              <form className="mb-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-[minmax(180px,1fr)_140px_120px_140px_minmax(180px,1fr)_auto]" onSubmit={(event) => void uploadEvidence(event)}>
                <input name="file" type="file" className="text-sm text-audity-secondary" />
                <input name="tag" className="audity-input" placeholder="Tag" />
                <input name="version" className="audity-input" placeholder="Version" />
                <input name="expires" className="audity-input" type="date" />
                <input name="notes" className="audity-input" placeholder="Evidence notes" />
                <button className="audity-btn-primary">Upload</button>
              </form>
              ) : null}
              <div className="space-y-2">
                {evidenceItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                    <div>
                      <p className="text-sm font-semibold">{item.fileName}</p>
                      <p className="text-xs text-audity-muted">{item.mimeType} · {Math.round(item.fileSize / 1024)} KB</p>
                      <p className="mt-1 text-xs text-audity-muted">Uploaded {new Date(item.createdAt).toLocaleDateString()}</p>
                      {item.notes ? <p className="mt-1 text-xs text-audity-secondary">{item.notes}</p> : null}
                    </div>
                    <div className="flex gap-2">
                      {canDownloadEvidence ? (
                        <button className="audity-btn-secondary px-2 py-1 text-xs" onClick={() => void downloadEvidence(item)}>Download</button>
                      ) : null}
                      {canUploadEvidence ? (
                        <button className="audity-btn-secondary border-audity-error px-2 py-1 text-xs text-audity-error" onClick={() => void deleteEvidence(item)}>Delete</button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
            {/* Branding is admin-managed only — configured under Admin → Branding.
                The report always renders against the current admin branding;
                there is no per-assessment override. */}
          </div>
          <section className="mt-3 rounded-audity border border-audity-border bg-audity-panel p-4">
            <h2 className="mb-4 text-lg font-semibold">Report Builder</h2>
            <form className="grid min-w-0 gap-3 2xl:grid-cols-[minmax(0,1fr)_300px]" onSubmit={(event) => void createReport(event)}>
              <div className="grid gap-2 md:grid-cols-2">
                {blocks.map((block) => (
                  <label key={block} className="flex items-center gap-2 rounded-audity border border-audity-border bg-audity-page px-3 py-2 text-sm text-audity-secondary">
                    <input type="checkbox" checked={selectedBlocks.includes(block)} onChange={(event) => setSelectedBlocks(event.target.checked ? [...selectedBlocks, block] : selectedBlocks.filter((item) => item !== block))} />
                    {block}
                  </label>
                ))}
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-audity-secondary">
                  Export Format
                  <select className="mt-2 audity-input" value={exportFormat} onChange={(event) => setExportFormat(event.target.value)}>
                    <option value="PDF">PDF (read-only)</option>
                    <option value="Excel">Excel (editable .xlsx)</option>
                  </select>
                </label>
                {Object.entries(authorInfo).map(([key, value]) => (
                  <input key={key} className="audity-input" value={value} onChange={(event) => setAuthorInfo({ ...authorInfo, [key]: event.target.value })} />
                ))}
                <div className="rounded-audity border border-audity-border bg-audity-page p-3">
                  <p className="mb-2 text-xs font-medium text-audity-muted">Quality Check</p>
                  <div className="space-y-1">
                    {qualityChecks.map((check) => (
                      <div key={check.label} className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-audity-secondary">{check.label}</span>
                        <span className={check.ok ? "text-audity-success" : "text-audity-warning"}>{check.ok ? "OK" : "Review"}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {canExportReport ? (
                  <button className="audity-btn-primary">Create report</button>
                ) : null}
              </div>
            </form>
            {report ? (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-audity border border-audity-border bg-audity-page p-3">
                <span className="text-sm text-audity-secondary">Report {report.id.slice(0, 8)} · {report.status}</span>
                <button className="audity-btn-secondary" onClick={() => void openPreview()}>Preview</button>
                {canExportReport ? (
                  <button className="audity-btn-primary" onClick={() => void exportReport()}>Export {exportFormat}</button>
                ) : null}
              </div>
            ) : null}
            {previewHtml ? (
              <div className="mt-4 overflow-hidden rounded-audity border border-audity-border bg-white">
                <iframe className="h-[620px] w-full bg-white" srcDoc={previewHtml} title="Report preview" />
              </div>
            ) : null}
            {job ? (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-audity-secondary">
                <span>Job {job.id}: {job.status}</span>
                <button className="audity-btn-secondary px-2 py-1 text-xs" onClick={() => void pollJob()}>Refresh</button>
                {job.downloadUrl ? <a className="text-audity-success" href={job.downloadUrl} target="_blank" rel="noreferrer">Download {exportFormat}</a> : null}
              </div>
            ) : null}
            {report && canSendReport ? (
              <form className="mt-4 rounded-audity border border-audity-border bg-audity-page p-3" onSubmit={(event) => void sendReport(event)}>
                <h3 className="mb-3 text-sm font-semibold">Send secure report package</h3>
                <div className="grid gap-2 md:grid-cols-2">
                  <input className="audity-input bg-audity-panel" placeholder="Recipient email" value={sendForm.recipient} onChange={(event) => setSendForm({ ...sendForm, recipient: event.target.value })} />
                  <input className="audity-input bg-audity-panel" placeholder="Subject" value={sendForm.subject} onChange={(event) => setSendForm({ ...sendForm, subject: event.target.value })} />
                  <textarea className="min-h-20 rounded-audity border border-audity-border bg-audity-panel px-3 py-2 text-sm text-audity-text outline-none focus:border-audity-primary md:col-span-2" placeholder="Message" value={sendForm.message} onChange={(event) => setSendForm({ ...sendForm, message: event.target.value })} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-audity-secondary">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={sendForm.includeRiskRegister} onChange={(event) => setSendForm({ ...sendForm, includeRiskRegister: event.target.checked })} />
                    Include Risk Register CSV
                  </label>
                  <label className="flex items-center gap-2 text-audity-warning">
                    <input type="checkbox" checked={sendForm.warningAccepted} onChange={(event) => setSendForm({ ...sendForm, warningAccepted: event.target.checked })} />
                    I confirm this encrypted package may contain confidential/high-risk data.
                  </label>
                  <button className="audity-btn-primary">Send package</button>
                </div>
                {emailJob ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-audity-secondary">
                    <span>Email job {emailJob.id}: {emailJob.status}</span>
                    <button type="button" className="audity-btn-secondary px-2 py-1 text-xs" onClick={() => void pollEmailJob()}>Refresh</button>
                    {emailJob.result?.smtpResult ? <span className="text-audity-success">{emailJob.result.smtpResult}</span> : null}
                  </div>
                ) : null}
              </form>
            ) : null}
            {(canExportReport || canImportAssessment) ? (
            <section className="mt-4 rounded-audity border border-audity-border bg-audity-page p-3">
              <h3 className="mb-3 text-sm font-semibold">Assessment Import / Export</h3>
              <div className="flex flex-wrap items-center gap-3">
                {canExportReport ? (
                  <button className="audity-btn-secondary" onClick={() => void exportAssessment()}>Export .cisoassess</button>
                ) : null}
                {canImportAssessment ? (
                <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => void importAssessment(event)}>
                  <input name="importFile" type="file" accept=".cisoassess,application/octet-stream" className="text-sm text-audity-secondary" />
                  <button className="audity-btn-primary">Import</button>
                </form>
                ) : null}
              </div>
            </section>
            ) : null}
          </section>
    </>
  );
}
