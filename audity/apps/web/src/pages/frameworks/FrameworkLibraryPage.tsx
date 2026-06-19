import { FormEvent, useEffect, useMemo, useState } from "react";
import { useApi } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import type { Framework, FrameworkDomain } from "./types";

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
          <div className="mb-4 rounded-audity border border-audity-warning bg-audity-warning/10 p-3 text-sm text-audity-secondary">
            {selected?.disclaimer ??
              "Framework catalogs are loaded from YAML files and synced automatically. User-imported or license-restricted frameworks require your own license confirmation."}
          </div>
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
                      <span className={`shrink-0 rounded-audity border px-2 py-1 text-xs font-semibold ${badgeClass(framework.statusLabel)}`}>
                        {framework.statusLabel ?? "User License Required"}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-audity-secondary">{framework.name} {framework.version}</p>
                    <p className="mt-2 text-xs text-audity-muted">{framework.controlCount} controls</p>
                  </button>
                ))}
              </div>
            </section>
            <section className="min-w-0 rounded-audity border border-audity-border bg-audity-panel">
              <div className="border-b border-audity-border px-3 py-2.5">
                <h2 className="text-lg font-semibold">{selected?.name ?? "Framework"}</h2>
                <p className="mt-1 text-sm text-audity-secondary">{selected?.sourceType} · {selected?.licenseStatus}</p>
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
              <label className="mb-3 block text-xs font-semibold uppercase text-audity-secondary">
                Name
                <input className="mt-2 audity-input" value={importForm.name} onChange={(event) => setImportForm({ ...importForm, name: event.target.value })} />
              </label>
              <label className="mb-3 block text-xs font-semibold uppercase text-audity-secondary">
                Version
                <input className="mt-2 audity-input" value={importForm.version} onChange={(event) => setImportForm({ ...importForm, version: event.target.value })} />
              </label>
              <label className="mb-3 block text-xs font-semibold uppercase text-audity-secondary">
                CSV or YAML file
                <input className="mt-2 block w-full text-sm normal-case text-audity-secondary file:mr-3 file:h-9 file:rounded-audity file:border-0 file:bg-audity-primary file:px-3 file:text-sm file:font-semibold file:text-white" type="file" accept=".csv,.yaml,.yml,text/csv,application/x-yaml,text/yaml" onChange={(event) => void loadCsvFile(event.target.files?.[0] ?? null)} />
              </label>
              <label className="mb-3 block text-xs font-semibold uppercase text-audity-secondary">
                {importForm.format === "yaml" ? "YAML" : "CSV"}
                <textarea className="mt-2 min-h-40 w-full rounded-audity border border-audity-border bg-audity-page px-3 py-2 font-mono text-xs normal-case text-audity-text outline-none focus:border-audity-primary" value={importForm.format === "yaml" ? importForm.yaml : importForm.csv} onChange={(event) => setImportForm({ ...importForm, [importForm.format]: event.target.value })} />
              </label>
              <label className="mb-4 flex items-start gap-2 text-sm text-audity-secondary">
                <input className="mt-1" type="checkbox" checked={importForm.publishToTenant} onChange={(event) => setImportForm({ ...importForm, publishToTenant: event.target.checked })} />
                <span>Make this framework available in all active customer scopes.</span>
              </label>
              <label className="mb-4 flex items-start gap-2 text-sm text-audity-secondary">
                <input className="mt-1" type="checkbox" checked={importForm.licenseConfirmed} onChange={(event) => setImportForm({ ...importForm, licenseConfirmed: event.target.checked })} />
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
