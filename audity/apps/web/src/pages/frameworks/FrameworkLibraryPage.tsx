import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import type { Framework, FrameworkDomain } from "./types";

function badgeClass(label: string | null) {
  if (label === "Built-in") return "border-audity-success text-audity-success";
  if (label === "Readiness Workflow Only") return "border-audity-warning text-audity-warning";
  return "border-audity-borderStrong text-audity-secondary";
}

export function FrameworkLibraryPage() {
  const api = useApi();
  const { logout } = useAuth();
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [domains, setDomains] = useState<FrameworkDomain[]>([]);
  const [importForm, setImportForm] = useState({
    name: "",
    version: "",
    licenseConfirmed: false,
    csv: "domain,code,title,description,question\nGovernance,USR-01,Imported control,Describe the control,How ready is this control?"
  });
  const [error, setError] = useState("");

  const selected = useMemo(
    () => frameworks.find((framework) => framework.id === selectedId) ?? frameworks[0],
    [frameworks, selectedId]
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
    try {
      const payload = await api<{ framework: Framework }>("/api/frameworks/import", {
        method: "POST",
        body: JSON.stringify({
          name: importForm.name,
          version: importForm.version,
          licenseConfirmed: importForm.licenseConfirmed,
          csv: importForm.csv
        })
      });
      await loadFrameworks();
      setSelectedId(payload.framework.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    }
  }

  return (
    <main className="min-h-screen bg-audity-app text-audity-text">
      <header className="flex h-12 items-center justify-between border-b border-audity-border bg-audity-topnav px-5">
        <div className="flex items-center gap-3">
          <div className="grid h-7 w-7 place-items-center rounded-audity border border-audity-borderStrong bg-audity-panel text-sm font-bold text-audity-primary">A</div>
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
          <Link className="mt-1 block rounded-audity px-3 py-2 text-sm text-audity-secondary hover:bg-audity-panel" to="/customers">Customers</Link>
          <Link className="mt-1 block rounded-audity bg-audity-primaryActive px-3 py-2 text-sm font-semibold" to="/frameworks">Framework Library</Link>
        </aside>
        <section className="bg-audity-page p-5">
          <div className="mb-5 border-b border-audity-border pb-4">
            <p className="text-xs font-semibold uppercase text-audity-primary">Framework Engine</p>
            <h1 className="mt-1 text-2xl font-semibold">Framework Library</h1>
          </div>
          <div className="mb-5 rounded-audity border border-audity-warning bg-[#282414] p-4 text-sm text-audity-secondary">
            {selected?.disclaimer ??
              "Built-in public-framework summaries and Audity-native readiness workflows are assessment aids. User-imported frameworks require your own license confirmation."}
          </div>
          {error ? <div className="mb-4 rounded-audity border border-audity-error bg-[#2A1C17] px-3 py-2 text-sm text-[#FFB199]">{error}</div> : null}
          <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)_360px]">
            <section className="overflow-hidden rounded-audity border border-audity-border bg-audity-panel">
              <div className="border-b border-audity-border px-4 py-3">
                <h2 className="text-lg font-semibold">Catalog</h2>
              </div>
              <div className="divide-y divide-audity-border">
                {frameworks.map((framework) => (
                  <button
                    key={framework.id}
                    className={`block w-full px-4 py-3 text-left hover:bg-audity-panelAlt ${framework.id === selected?.id ? "bg-audity-primaryActive/25" : ""}`}
                    onClick={() => setSelectedId(framework.id)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-audity-text">{framework.shortName ?? framework.name}</p>
                      <span className={`shrink-0 rounded-audity border px-2 py-1 text-[11px] font-semibold ${badgeClass(framework.statusLabel)}`}>
                        {framework.statusLabel ?? "User License Required"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-audity-secondary">{framework.name} {framework.version}</p>
                    <p className="mt-2 text-xs text-audity-muted">{framework.controlCount} controls</p>
                  </button>
                ))}
              </div>
            </section>
            <section className="rounded-audity border border-audity-border bg-audity-panel">
              <div className="border-b border-audity-border px-4 py-3">
                <h2 className="text-lg font-semibold">{selected?.name ?? "Framework"}</h2>
                <p className="mt-1 text-sm text-audity-secondary">{selected?.sourceType} · {selected?.licenseStatus}</p>
              </div>
              <div className="space-y-3 p-4">
                {domains.map((domain) => (
                  <section key={domain.id} className="rounded-audity border border-audity-border bg-audity-page p-3">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">{domain.name}</h3>
                        <p className="mt-1 text-xs text-audity-secondary">{domain.description}</p>
                      </div>
                      <span className="text-xs text-audity-muted">{domain.controls.length} controls</span>
                    </div>
                    <div className="space-y-2">
                      {domain.controls.map((control) => (
                        <div key={control.id} className="rounded-audity border border-audity-border bg-audity-panel px-3 py-2">
                          <p className="text-xs font-semibold text-audity-primary">{control.code}</p>
                          <p className="mt-1 text-sm font-semibold">{control.title}</p>
                          <p className="mt-1 text-xs text-audity-secondary">{control.description}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </section>
            <form onSubmit={importFramework} className="rounded-audity border border-audity-border bg-audity-panel p-4">
              <h2 className="mb-4 text-lg font-semibold">Import Framework</h2>
              <label className="mb-3 block text-xs font-semibold uppercase text-audity-secondary">
                Name
                <input className="mt-2 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm normal-case text-audity-text outline-none focus:border-audity-primary" value={importForm.name} onChange={(event) => setImportForm({ ...importForm, name: event.target.value })} />
              </label>
              <label className="mb-3 block text-xs font-semibold uppercase text-audity-secondary">
                Version
                <input className="mt-2 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm normal-case text-audity-text outline-none focus:border-audity-primary" value={importForm.version} onChange={(event) => setImportForm({ ...importForm, version: event.target.value })} />
              </label>
              <label className="mb-3 block text-xs font-semibold uppercase text-audity-secondary">
                CSV
                <textarea className="mt-2 min-h-40 w-full rounded-audity border border-audity-border bg-audity-page px-3 py-2 font-mono text-xs normal-case text-audity-text outline-none focus:border-audity-primary" value={importForm.csv} onChange={(event) => setImportForm({ ...importForm, csv: event.target.value })} />
              </label>
              <label className="mb-4 flex items-start gap-2 text-sm text-audity-secondary">
                <input className="mt-1" type="checkbox" checked={importForm.licenseConfirmed} onChange={(event) => setImportForm({ ...importForm, licenseConfirmed: event.target.checked })} />
                <span>I confirm that I have the rights or license required to import and use this framework.</span>
              </label>
              <button className="h-9 rounded-audity bg-audity-primary px-3 text-sm font-semibold text-white hover:bg-audity-primaryHover">
                Import
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
