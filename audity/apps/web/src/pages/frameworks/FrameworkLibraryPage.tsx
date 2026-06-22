import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import type { Framework, FrameworkDomain } from "./types";

type ImportRecord = {
  id: string;
  sourceFilename: string;
  status: string;
  frameworkName: string | null;
  totalControls: number;
  enrichedControls: number;
  errorMessage: string | null;
  createdAt: string;
};

function FrameworkImportPanel() {
  const api = useApi();
  const { csrfToken, accessToken } = useAuth();
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [frameworkKey, setFrameworkKey] = useState("");
  const [frameworkName, setFrameworkName] = useState("");
  const [frameworkVersion, setFrameworkVersion] = useState("1.0");
  const [language, setLanguage] = useState<"de" | "en">("de");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [error, setError] = useState("");

  async function loadImports() {
    try {
      const result = await api<{ imports: ImportRecord[] }>("/api/admin/frameworks/imports");
      setImports(result.imports);
    } catch {
      // user might lack permission — silently hide
      setImports([]);
    }
  }

  useEffect(() => {
    void loadImports();
    const timer = window.setInterval(() => void loadImports(), 4000);
    return () => window.clearInterval(timer);
  }, []);

  function reset() {
    setFrameworkKey("");
    setFrameworkName("");
    setFrameworkVersion("1.0");
    setLanguage("de");
    setCsvFile(null);
    setError("");
  }

  async function downloadTemplate() {
    const response = await fetch("/api/admin/frameworks/csv-template", {
      credentials: "include",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
    });
    if (!response.ok) {
      setError("Template download failed.");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "audity-framework-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csvFile) {
      setError("Please select a CSV file.");
      return;
    }
    setError("");
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("framework_key", frameworkKey);
      formData.append("framework_name", frameworkName);
      formData.append("framework_version", frameworkVersion);
      formData.append("language", language);
      formData.append("file", csvFile);
      const response = await fetch("/api/admin/frameworks/import", {
        method: "POST",
        credentials: "include",
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {})
        },
        body: formData
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? `Upload failed: ${response.status}`);
      }
      reset();
      setUploadOpen(false);
      await loadImports();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const activeImports = imports.filter((entry) => entry.status === "extracting" || entry.status === "enriching");
  const drafts = imports.filter((entry) => entry.status === "review");

  return (
    <section className="audity-card mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="audity-section-title">Framework Import</h2>
          <p className="mt-1 text-xs text-audity-secondary">
            Upload a CSV of a licensed framework.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="audity-btn-secondary audity-btn-sm" onClick={() => void downloadTemplate()}>Download CSV Template</button>
          <button type="button" className="audity-btn-primary audity-btn-sm" onClick={() => setUploadOpen((open) => !open)}>
            {uploadOpen ? "Abbrechen" : "+ Upload CSV"}
          </button>
        </div>
      </div>
      {uploadOpen ? (
        <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={submit}>
          <div>
            <label className="audity-label">Framework key (unique)</label>
            <input className="audity-input" value={frameworkKey} placeholder="iso27001.licensed.2026" onChange={(event) => setFrameworkKey(event.target.value)} required />
          </div>
          <div>
            <label className="audity-label">Framework Name</label>
            <input className="audity-input" value={frameworkName} placeholder="ISO 27001 (licensed)" onChange={(event) => setFrameworkName(event.target.value)} required />
          </div>
          <div>
            <label className="audity-label">Version</label>
            <input className="audity-input" value={frameworkVersion} onChange={(event) => setFrameworkVersion(event.target.value)} required />
          </div>
          <div>
            <label className="audity-label">Language</label>
            <select className="audity-input" value={language} onChange={(event) => setLanguage(event.target.value as "de" | "en")}>
              <option value="de">de</option>
              <option value="en">en</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="audity-label">CSV file</label>
            <input className="audity-input" type="file" accept=".csv,text/csv" onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)} required />
          </div>
          {error ? <div className="sm:col-span-2 rounded-audity border border-audity-error bg-audity-error/10 px-3 py-2 text-sm text-audity-error">{error}</div> : null}
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button type="button" className="audity-btn-ghost audity-btn-sm" onClick={() => { reset(); setUploadOpen(false); }}>Cancel</button>
            <button type="submit" className="audity-btn-primary audity-btn-sm" disabled={uploading}>
              {uploading ? "Uploading…" : "Start upload"}
            </button>
          </div>
        </form>
      ) : null}

      {activeImports.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-audity-muted">In progress</p>
          <div className="mt-2 space-y-2">
            {activeImports.map((entry) => {
              const pct = entry.totalControls === 0 ? 0 : Math.round((entry.enrichedControls / entry.totalControls) * 100);
              return (
                <Link key={entry.id} to={`/admin/frameworks/imports/${entry.id}`} className="block rounded-audity-md border border-audity-border bg-audity-page p-3 hover:border-audity-primary">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">{entry.frameworkName ?? entry.sourceFilename}</span>
                    <span className="text-xs text-audity-muted">{entry.status} · {entry.enrichedControls}/{entry.totalControls}</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-audity-panelAlt">
                    <div className="h-full bg-audity-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      {drafts.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-audity-muted">Drafts ready for review</p>
          <div className="mt-2 space-y-2">
            {drafts.map((entry) => (
              <Link key={entry.id} to={`/admin/frameworks/imports/${entry.id}`} className="flex items-center justify-between gap-3 rounded-audity-md border border-audity-border bg-audity-page p-3 hover:border-audity-primary">
                <span className="text-sm font-semibold">{entry.frameworkName ?? entry.sourceFilename}</span>
                <span className="audity-btn-soft audity-btn-sm">Review →</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function badgeClass(label: string | null) {
  if (label === "Built-in") return "border-audity-success text-audity-success";
  if (label === "Tenant Published") return "border-audity-primary text-audity-primary";
  if (label === "Readiness Workflow Only") return "border-audity-warning text-audity-warning";
  return "border-audity-borderStrong text-audity-secondary";
}

export function FrameworkLibraryPage() {
  const api = useApi();
  const { user } = useAuth();
  const canImportFramework = Boolean(user?.permissions.includes("frameworks.manage"));
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [domains, setDomains] = useState<FrameworkDomain[]>([]);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [controlSearch, setControlSearch] = useState("");
  const [importForm, setImportForm] = useState({
    name: "",
    version: "",
    licenseConfirmed: false,
    publishToTenant: true,
    format: "csv" as "csv" | "yaml",
    yaml: "",
    csv: "domain,code,title,description,question\nGovernance,USR-01,Imported control,Describe the control,How ready is this control?"
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selected = useMemo(
    () => frameworks.find((framework) => framework.id === selectedId) ?? frameworks[0],
    [frameworks, selectedId]
  );
  const filteredFrameworks = useMemo(
    () => frameworks.filter((framework) =>
      `${framework.name} ${framework.shortName ?? ""} ${framework.version ?? ""}`.toLowerCase().includes(catalogSearch.toLowerCase())
    ),
    [frameworks, catalogSearch]
  );
  const filteredDomains = useMemo(
    () => domains
      .map((domain) => ({
        ...domain,
        controls: domain.controls.filter((control) =>
          `${domain.name} ${control.code} ${control.title} ${control.description ?? ""}`.toLowerCase().includes(controlSearch.toLowerCase())
        )
      }))
      .filter((domain) => domain.controls.length || domain.name.toLowerCase().includes(controlSearch.toLowerCase())),
    [domains, controlSearch]
  );

  async function loadFrameworks() {
    const payload = await api<{ frameworks: Framework[] }>("/api/frameworks");
    setFrameworks(payload.frameworks);
    if (!selectedId && payload.frameworks[0]) {
      setSelectedId(payload.frameworks[0].id);
    }
  }

  async function loadControls(frameworkId: string) {
    const payload = await api<{ domains: FrameworkDomain[] }>(`/api/frameworks/${frameworkId}/controls`);
    setDomains(payload.domains);
  }

  useEffect(() => {
    void loadFrameworks().catch((err) => setError(err instanceof Error ? err.message : "Load failed"));
  }, []);

  useEffect(() => {
    const id = selectedId || frameworks[0]?.id;
    if (id) {
      void loadControls(id).catch((err) => setError(err instanceof Error ? err.message : "Load controls failed"));
    }
  }, [selectedId, frameworks]);

  async function importFramework(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    try {
      const payload = await api<{ framework: Framework; publishedCustomerCount: number }>("/api/frameworks/import", {
        method: "POST",
        body: JSON.stringify({
          name: importForm.name,
          version: importForm.version,
          licenseConfirmed: importForm.licenseConfirmed,
          publishToTenant: importForm.publishToTenant,
          csv: importForm.format === "csv" ? importForm.csv : undefined,
          yaml: importForm.format === "yaml" ? importForm.yaml : undefined
        })
      });
      await loadFrameworks();
      setSelectedId(payload.framework.id);
      setSuccess(
        importForm.publishToTenant
          ? `Framework published tenant-wide and added to ${payload.publishedCustomerCount} active customer scopes.`
          : "Framework published to the tenant catalog."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    }
  }

  async function loadCsvFile(file: File | null) {
    if (!file) return;
    const content = await file.text();
    const isYaml = file.name.endsWith(".yaml") || file.name.endsWith(".yml");
    setImportForm((current) => ({
      ...current,
      format: isYaml ? "yaml" : "csv",
      csv: isYaml ? current.csv : content,
      yaml: isYaml ? content : ""
    }));
  }

  function downloadQuestionnaireTemplate() {
    const csv = [
      "domain,code,title,description,question",
      "Governance,GOV-01,Policy ownership,Security policies have assigned owners,How mature is policy ownership?"
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "audity-questionnaire-template.csv";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  return (
    <>
          <div className="audity-page-header">
            <p className="audity-page-kicker">Framework Engine</p>
            <h1 className="audity-page-title">Framework Library</h1>
          </div>
          <FrameworkImportPanel />
          {error ? <div className="mb-4 rounded-audity border border-audity-error bg-audity-error/10 px-3 py-2 text-sm text-audity-error">{error}</div> : null}
          {success ? <div className="mb-4 rounded-audity border border-audity-success bg-audity-success/10 px-3 py-2 text-sm text-audity-success">{success}</div> : null}
          <div className="grid min-w-0 gap-3 xl:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)_300px]">
            <section className="min-w-0 overflow-hidden rounded-audity border border-audity-border bg-audity-panel">
              <div className="border-b border-audity-border px-3 py-2.5">
                <h2 className="text-lg font-semibold">Catalog</h2>
                <input className="mt-3 audity-input" placeholder="Search frameworks" value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} />
              </div>
              <div className="divide-y divide-audity-border">
                {filteredFrameworks.map((framework) => (
                  <button
                    key={framework.id}
                    className={`block w-full px-3 py-2.5 text-left hover:bg-audity-panelAlt ${framework.id === selected?.id ? "bg-audity-primaryActive/25" : ""}`}
                    onClick={() => setSelectedId(framework.id)}
                  >
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-semibold text-audity-text">{framework.shortName ?? framework.name}</p>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-audity-secondary">{framework.name} {framework.version}</p>
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-audity-muted">
                      <span>{framework.controlCount} controls</span>
                      {framework.sourceKind === "user_uploaded" ? (
                        <span className="rounded-audity border border-audity-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-audity-primary">User</span>
                      ) : (
                        <span className="rounded-audity border border-audity-success/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-audity-success">Shipped</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </section>
            <section className="min-w-0 rounded-audity border border-audity-border bg-audity-panel">
              <div className="border-b border-audity-border px-3 py-2.5">
                <h2 className="text-lg font-semibold">{selected?.name ?? "Framework"}</h2>
                <input className="mt-3 audity-input" placeholder="Search controls" value={controlSearch} onChange={(event) => setControlSearch(event.target.value)} />
              </div>
              <div className="space-y-3 p-3">
                {filteredDomains.map((domain) => (
                  <section key={domain.id} className="rounded-audity border border-audity-border bg-audity-page p-3">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">{domain.name}</h3>
                        <p className="mt-1 line-clamp-2 text-xs text-audity-secondary">{domain.description}</p>
                      </div>
                      <span className="text-xs text-audity-muted">{domain.controls.length} controls</span>
                    </div>
                    <div className="space-y-2">
                      {domain.controls.map((control) => (
                        <div key={control.id} className="rounded-audity border border-audity-border bg-audity-panel px-3 py-2">
                          <p className="text-xs font-semibold text-audity-primary">{control.code}</p>
                          <p className="mt-1 text-sm font-semibold leading-5">{control.title}</p>
                          <p className="mt-1 line-clamp-3 text-xs leading-5 text-audity-secondary">{control.description}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </section>
            {canImportFramework ? (
            <form onSubmit={importFramework} className="min-w-0 rounded-audity border border-audity-border bg-audity-panel p-4 xl:col-span-2 2xl:col-span-1">
              <h2 className="mb-4 text-lg font-semibold">Publish Framework</h2>
              <button type="button" className="mb-3 audity-btn-secondary" onClick={downloadQuestionnaireTemplate}>
                Questionnaire CSV Template
              </button>
              <label className="mb-3 block text-xs font-medium text-audity-secondary">
                Name
                <input className="mt-2 audity-input" value={importForm.name} onChange={(event) => setImportForm({ ...importForm, name: event.target.value })} />
              </label>
              <label className="mb-3 block text-xs font-medium text-audity-secondary">
                Version
                <input className="mt-2 audity-input" value={importForm.version} onChange={(event) => setImportForm({ ...importForm, version: event.target.value })} />
              </label>
              <label className="mb-3 block text-xs font-medium text-audity-secondary">
                CSV or YAML file
                <input className="mt-2 block w-full text-sm normal-case text-audity-secondary file:mr-3 file:h-9 file:rounded-audity file:border-0 file:bg-audity-primary file:px-3 file:text-sm file:font-semibold file:text-white" type="file" accept=".csv,.yaml,.yml,text/csv,application/x-yaml,text/yaml" onChange={(event) => void loadCsvFile(event.target.files?.[0] ?? null)} />
              </label>
              <label className="mb-3 block text-xs font-medium text-audity-secondary">
                {importForm.format === "yaml" ? "YAML" : "CSV"}
                <textarea className="mt-2 min-h-40 w-full rounded-audity border border-audity-border bg-audity-page px-3 py-2 font-mono text-xs normal-case text-audity-text outline-none focus:border-audity-primary" value={importForm.format === "yaml" ? importForm.yaml : importForm.csv} onChange={(event) => setImportForm({ ...importForm, [importForm.format]: event.target.value })} />
              </label>
              <label className="mb-4 flex items-start gap-3 text-sm text-audity-secondary">
                <input className="mt-0.5 h-4 w-4 shrink-0" type="checkbox" checked={importForm.publishToTenant} onChange={(event) => setImportForm({ ...importForm, publishToTenant: event.target.checked })} />
                <span>Make this framework available in all active customer scopes.</span>
              </label>
              <label className="mb-4 flex items-start gap-3 text-sm text-audity-secondary">
                <input className="mt-0.5 h-4 w-4 shrink-0" type="checkbox" checked={importForm.licenseConfirmed} onChange={(event) => setImportForm({ ...importForm, licenseConfirmed: event.target.checked })} />
                <span>I confirm that I have the rights or license required to publish and use this framework tenant-wide.</span>
              </label>
              <button className="audity-btn-primary">
                Publish
              </button>
            </form>
            ) : null}
          </div>
    </>
  );
}
