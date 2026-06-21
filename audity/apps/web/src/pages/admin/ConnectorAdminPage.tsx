import { FormEvent, useEffect, useMemo, useState } from "react";
import { useApi } from "../../api/client";

type ConnectorId =
  | "jira"
  | "microsoft-teams"
  | "servicenow"
  | "sharepoint-onedrive"
  | "microsoft-entra-id"
  | "power-bi"
  | "confluence"
  | "slack";

type Connector = {
  id: ConnectorId;
  provider: string;
  displayName: string;
  enabled: boolean;
  config: Record<string, string>;
  secretFields: string[];
  hasSecrets: Record<string, boolean>;
  requiredConfig: string[];
  whatWorks: string;
  comingNext: string;
  status: string;
  lastCheckedAt: string | null;
  lastMessage: string | null;
  updatedAt: string;
  lastRun?: { action: string; status: string; message: string; created_at: string } | null;
};

const connectorFields: Record<ConnectorId, Array<{ key: string; label: string; placeholder: string }>> = {
  jira: [
    { key: "baseUrl", label: "Base URL", placeholder: "https://company.atlassian.net" },
    { key: "email", label: "User email", placeholder: "jira-user@company.com" },
    { key: "projectKey", label: "Project key", placeholder: "AUD" },
    { key: "issueType", label: "Issue type", placeholder: "Task" }
  ],
  "microsoft-teams": [],
  servicenow: [
    { key: "instanceUrl", label: "Instance URL", placeholder: "https://company.service-now.com" },
    { key: "table", label: "Target table", placeholder: "incident" }
  ],
  "sharepoint-onedrive": [
    { key: "driveId", label: "Drive ID", placeholder: "b!..." },
    { key: "folderPath", label: "Folder path", placeholder: "Audity/Customers" },
    { key: "syncFileName", label: "Sync file name", placeholder: "audity-customer-sync.json" }
  ],
  "microsoft-entra-id": [],
  "power-bi": [
    { key: "workspaceId", label: "Workspace ID", placeholder: "Power BI workspace GUID" },
    { key: "datasetId", label: "Dataset ID", placeholder: "Optional existing dataset ID" },
    { key: "datasetName", label: "Dataset name", placeholder: "Audity Assessment Metrics" }
  ],
  confluence: [
    { key: "baseUrl", label: "Base URL", placeholder: "https://company.atlassian.net" },
    { key: "email", label: "User email", placeholder: "confluence-user@company.com" },
    { key: "spaceKey", label: "Space key", placeholder: "AUD" },
    { key: "parentPageId", label: "Parent page ID", placeholder: "Optional" }
  ],
  slack: []
};

const syncFields = [
  { key: "includeCustomers", label: "Customers" },
  { key: "includeAssessments", label: "Assessments" },
  { key: "includeRisks", label: "Risks" },
  { key: "includeFindings", label: "Findings" }
];

const initialSyncMonths = [1, 3, 6, 12, 24, 36];

const secretLabels: Record<string, string> = {
  apiToken: "API token",
  accessToken: "Access token",
  webhookUrl: "Webhook URL",
  username: "Username",
  password: "Password"
};

const connectorInputClass =
  "mt-1.5 h-8 w-full rounded-audity border border-audity-border bg-audity-page px-2.5 text-sm normal-case text-audity-text outline-none focus:border-audity-primary";

const connectorSectionClass = "border-b border-audity-border pb-4 last:border-b-0 last:pb-0";

type Glyph = (props: { className?: string }) => JSX.Element;

const Icons = {
  ticket: ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4Z" />
      <path d="M9 6v12" strokeDasharray="2 3" />
    </svg>
  ),
  chat: ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h12a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H9l-5 4Z" />
      <circle cx="9" cy="10" r="1" fill="currentColor" />
      <circle cx="13" cy="10" r="1" fill="currentColor" />
    </svg>
  ),
  workflow: ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="15" y="15" width="6" height="6" rx="1" />
      <rect x="3" y="15" width="6" height="6" rx="1" />
      <path d="M9 6h6a3 3 0 0 1 3 3v6" />
    </svg>
  ),
  cloudFolder: ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 14a4 4 0 0 1 4-4 5 5 0 0 1 10 1 3.5 3.5 0 0 1 0 7H7a4 4 0 0 1-4-4Z" />
      <path d="M9 13h6M9 16h4" />
    </svg>
  ),
  shieldId: ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6Z" />
      <circle cx="12" cy="11" r="2.5" />
      <path d="M9 17c1-1.6 2-2.4 3-2.4s2 .8 3 2.4" />
    </svg>
  ),
  chart: ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="3.5" height="9" rx="0.5" />
      <rect x="10.25" y="6" width="3.5" height="14" rx="0.5" />
      <rect x="16.5" y="14" width="3.5" height="6" rx="0.5" />
    </svg>
  ),
  bookOpen: ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3Z" />
      <path d="M21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7Z" />
    </svg>
  ),
  hash: ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" />
      <line x1="16" y1="3" x2="14" y2="21" />
    </svg>
  )
} satisfies Record<string, Glyph>;

const connectorVisuals: Record<ConnectorId, { Icon: Glyph; bg: string; fg: string; accentClass: string }> = {
  jira: { Icon: Icons.ticket, bg: "bg-[#0052CC]", fg: "text-white", accentClass: "border-[#0052CC]/70" },
  "microsoft-teams": { Icon: Icons.chat, bg: "bg-[#6264A7]", fg: "text-white", accentClass: "border-[#6264A7]/70" },
  servicenow: { Icon: Icons.workflow, bg: "bg-[#81B5A1]", fg: "text-[#0D2B1F]", accentClass: "border-[#81B5A1]/70" },
  "sharepoint-onedrive": { Icon: Icons.cloudFolder, bg: "bg-[#038387]", fg: "text-white", accentClass: "border-[#038387]/70" },
  "microsoft-entra-id": { Icon: Icons.shieldId, bg: "bg-[#0078D4]", fg: "text-white", accentClass: "border-[#0078D4]/70" },
  "power-bi": { Icon: Icons.chart, bg: "bg-[#F2C811]", fg: "text-[#1A1A1A]", accentClass: "border-[#F2C811]/70" },
  confluence: { Icon: Icons.bookOpen, bg: "bg-[#172B4D]", fg: "text-white", accentClass: "border-[#2684FF]/70" },
  slack: { Icon: Icons.hash, bg: "bg-[#4A154B]", fg: "text-white", accentClass: "border-[#E01E5A]/70" }
};

function statusClass(status: string) {
  if (status === "ok") return "border-audity-success text-audity-success";
  if (status === "error") return "border-audity-error text-audity-error";
  if (status === "disabled") return "border-audity-muted text-audity-muted";
  return "border-audity-borderStrong text-audity-secondary";
}

function ConnectorLogo({ connector }: { connector: Connector }) {
  const visual = connectorVisuals[connector.id];
  return (
    <div
      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-audity-md shadow-sm ${visual.bg} ${visual.fg}`}
      aria-label={`${connector.displayName} logo`}
      role="img"
    >
      <visual.Icon className="h-7 w-7" />
    </div>
  );
}

export function ConnectorAdminPage() {
  const api = useApi();
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { enabled: boolean; config: Record<string, string>; secrets: Record<string, string> }>>({});
  const [activeConnectorId, setActiveConnectorId] = useState<ConnectorId | "">("");
  const [monthsBack, setMonthsBack] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  async function loadConnectors() {
    const connectorPayload = await api<{ connectors: Connector[] }>("/api/admin/connectors");
    setConnectors(connectorPayload.connectors);
    setDrafts(Object.fromEntries(connectorPayload.connectors.map((connector) => [
      connector.id,
      { enabled: connector.enabled, config: connector.config ?? {}, secrets: {} }
    ])));
  }

  useEffect(() => {
    void loadConnectors().catch((err) => setError(err instanceof Error ? err.message : "Connector load failed"));
  }, []);

  const activeConnector = useMemo(
    () => connectors.find((connector) => connector.id === activeConnectorId) ?? null,
    [activeConnectorId, connectors]
  );

  function updateDraft(id: ConnectorId, patch: Partial<{ enabled: boolean; config: Record<string, string>; secrets: Record<string, string> }>) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        enabled: patch.enabled ?? current[id]?.enabled ?? false,
        config: patch.config ?? current[id]?.config ?? {},
        secrets: patch.secrets ?? current[id]?.secrets ?? {}
      }
    }));
  }

  async function saveConnector(event: FormEvent<HTMLFormElement>, connector: Connector) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(`${connector.id}:save`);
    try {
      await api(`/api/admin/connectors/${connector.id}`, {
        method: "PUT",
        body: JSON.stringify(drafts[connector.id])
      });
      await loadConnectors();
      setMessage(`${connector.displayName} saved.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connector save failed");
    } finally {
      setBusy("");
    }
  }

  async function testConnector(connector: Connector) {
    setError("");
    setMessage("");
    setBusy(`${connector.id}:test`);
    try {
      const payload = await api<{ message: string }>(`/api/admin/connectors/${connector.id}/test`, { method: "POST" });
      await loadConnectors();
      setMessage(`${connector.displayName}: ${payload.message}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connector test failed");
      await loadConnectors().catch(() => undefined);
    } finally {
      setBusy("");
    }
  }

  async function syncConnector(connector: Connector) {
    setError("");
    setMessage("");
    setBusy(`${connector.id}:sync`);
    try {
      const payload = await api<{ message: string; customers: number }>(`/api/admin/connectors/${connector.id}/sync`, {
        method: "POST",
        body: JSON.stringify({ monthsBack: monthsBack[connector.id] ?? 12 })
      });
      await loadConnectors();
      setMessage(`${connector.displayName}: ${payload.message} (${payload.customers} customers)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connector sync failed");
      await loadConnectors().catch(() => undefined);
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <div className="audity-page-header">
        <p className="audity-page-kicker">Administration</p>
        <h1 className="audity-page-title">Connectors</h1>
        <p className="audity-page-copy">
          Configure each external system once for the Audity instance. Enabled connectors synchronize customer data according to their sync settings.
        </p>
      </div>
      {error ? <div className="mb-4 rounded-audity border border-audity-error bg-audity-error/10 px-3 py-2 text-sm text-audity-error">{error}</div> : null}
      {message ? <div className="mb-4 rounded-audity border border-audity-success bg-audity-page px-3 py-2 text-sm text-audity-success">{message}</div> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {connectors.map((connector) => {
          const visual = connectorVisuals[connector.id];
          return (
            <button
              key={connector.id}
              className={`group min-h-36 rounded-audity border bg-audity-panel p-3 text-left transition hover:-translate-y-0.5 hover:bg-audity-panelAlt hover:shadow-lg ${visual.accentClass}`}
              onClick={() => setActiveConnectorId(connector.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <ConnectorLogo connector={connector} />
                <span className={`rounded-audity border px-2 py-1 text-xs ${statusClass(connector.status)}`}>
                  {connector.status}
                </span>
              </div>
              <h2 className="mt-3 text-base font-semibold text-audity-text">{connector.displayName}</h2>
              <p className="mt-1 text-sm text-audity-secondary">{connector.provider}</p>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-audity-border pt-3">
                <span className={connector.enabled ? "text-xs font-semibold text-audity-success" : "text-xs font-semibold text-audity-muted"}>
                  {connector.enabled ? "Enabled" : "Disabled"}
                </span>
                <span className="text-xs font-semibold text-audity-primary group-hover:text-audity-primaryHover">
                  Configure
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {activeConnector ? (() => {
        const draft = drafts[activeConnector.id] ?? { enabled: activeConnector.enabled, config: activeConnector.config ?? {}, secrets: {} };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 sm:p-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`${activeConnector.displayName} connector settings`}>
            <form
              className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-audity-lg border border-audity-border bg-audity-panel shadow-audity-raised"
              onSubmit={(event) => void saveConnector(event, activeConnector)}
            >
              <div className="flex items-center justify-between gap-4 border-b border-audity-border bg-audity-panel px-5 py-4">
                <div className="flex min-w-0 items-center gap-4">
                  <ConnectorLogo connector={activeConnector} />
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-audity-muted">Connector</p>
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-semibold tracking-tight">{activeConnector.displayName}</h2>
                      <span className={`rounded-audity border px-2 py-0.5 text-[11px] font-semibold ${statusClass(activeConnector.status)}`}>
                        {activeConnector.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-audity-secondary">{activeConnector.provider}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="audity-btn-icon"
                  onClick={() => setActiveConnectorId("")}
                  aria-label="Close connector settings"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="6" y1="18" x2="18" y2="6" />
                  </svg>
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-auto">
                <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
                  <div className="space-y-4 p-4">
                    <section className={connectorSectionClass}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold">Connection</h3>
                          <p className="mt-1 text-xs text-audity-secondary">Instance-wide settings used by this connector.</p>
                        </div>
                        <label className="flex items-center gap-2 text-sm text-audity-text">
                          <input
                            type="checkbox"
                            checked={draft.enabled}
                            onChange={(event) => updateDraft(activeConnector.id, { enabled: event.target.checked })}
                          />
                          Enabled
                        </label>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {connectorFields[activeConnector.id].map((field) => (
                          <label key={field.key} className="block text-xs font-medium text-audity-secondary">
                            {field.label}
                            <input
                              className={connectorInputClass}
                              placeholder={field.placeholder}
                              value={draft.config[field.key] ?? ""}
                              onChange={(event) => updateDraft(activeConnector.id, { config: { ...draft.config, [field.key]: event.target.value } })}
                            />
                          </label>
                        ))}
                        {activeConnector.secretFields.map((field) => (
                          <label key={field} className="block text-xs font-medium text-audity-secondary">
                            {secretLabels[field] ?? field}
                            <input
                              className={connectorInputClass}
                              type={field.toLowerCase().includes("url") || field === "username" ? "text" : "password"}
                              placeholder={activeConnector.hasSecrets[field] ? "Saved - enter new value to replace" : "Required"}
                              value={draft.secrets[field] ?? ""}
                              onChange={(event) => updateDraft(activeConnector.id, { secrets: { ...draft.secrets, [field]: event.target.value } })}
                            />
                          </label>
                        ))}
                        {!connectorFields[activeConnector.id].length && !activeConnector.secretFields.length ? (
                          <p className="text-sm text-audity-muted">This connector does not need additional connection fields.</p>
                        ) : null}
                      </div>
                    </section>

                    <section className={connectorSectionClass}>
                      <h3 className="text-sm font-semibold">Sync Scope</h3>
                      <p className="mt-1 text-xs text-audity-secondary">
                        Choose which Audity data is synchronized automatically after the initial sync.
                      </p>
                      <div className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
                        {syncFields.map((field) => (
                          <label key={field.key} className="flex items-center gap-2 text-sm text-audity-text">
                            <input
                              type="checkbox"
                              checked={(draft.config[field.key] ?? "true") === "true"}
                              onChange={(event) => updateDraft(activeConnector.id, { config: { ...draft.config, [field.key]: String(event.target.checked) } })}
                            />
                            {field.label}
                          </label>
                        ))}
                      </div>
                    </section>

                    <section className={connectorSectionClass}>
                      <h3 className="text-sm font-semibold">Initial Sync</h3>
                      <div className="mt-3 grid gap-3 md:grid-cols-[200px_minmax(0,1fr)]">
                        <label className="block text-xs font-medium text-audity-secondary">
                          History range
                          <select
                            className={connectorInputClass}
                            value={monthsBack[activeConnector.id] ?? 12}
                            onChange={(event) => setMonthsBack((current) => ({ ...current, [activeConnector.id]: Number(event.target.value) }))}
                          >
                            {initialSyncMonths.map((months) => (
                              <option key={months} value={months}>{months} months back</option>
                            ))}
                          </select>
                        </label>
                        <p className="self-end rounded-audity border-l-2 border-audity-primary bg-audity-page px-3 py-2 text-sm text-audity-secondary">
                          Start initial sync once to send historical data. Afterwards, customer and assessment changes are queued automatically while the connector is enabled.
                        </p>
                      </div>
                    </section>
                  </div>

                  <aside className="border-t border-audity-border bg-audity-page p-4 lg:border-l lg:border-t-0">
                    <div className="space-y-4">
                      <section>
                        <p className="text-xs font-medium text-audity-primary">Available now</p>
                        <p className="mt-1.5 text-sm leading-6 text-audity-secondary">{activeConnector.whatWorks}</p>
                      </section>
                      <section className="border-t border-audity-border pt-4">
                        <p className="text-xs font-medium text-audity-warning">Coming next</p>
                        <p className="mt-1.5 text-sm leading-6 text-audity-secondary">{activeConnector.comingNext}</p>
                      </section>
                      <section className="border-t border-audity-border pt-4">
                        <p className="text-xs font-medium text-audity-muted">Last result</p>
                        {activeConnector.lastMessage ? (
                          <>
                            <p className="mt-1.5 text-sm text-audity-secondary">{activeConnector.lastMessage}</p>
                            {activeConnector.lastCheckedAt ? (
                              <p className="mt-1 text-xs text-audity-muted">{new Date(activeConnector.lastCheckedAt).toLocaleString()}</p>
                            ) : null}
                          </>
                        ) : (
                          <p className="mt-1.5 text-sm text-audity-muted">No result yet.</p>
                        )}
                      </section>
                    </div>
                  </aside>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-audity-border bg-audity-panel px-4 py-3">
                <p className="text-xs text-audity-muted">Settings apply to the full Audity instance.</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="audity-btn-primary"
                    disabled={busy === `${activeConnector.id}:save`}
                  >
                    {busy === `${activeConnector.id}:save` ? "Saving" : "Save"}
                  </button>
                  <button
                    type="button"
                    className="audity-btn-secondary"
                    disabled={busy === `${activeConnector.id}:test`}
                    onClick={() => void testConnector(activeConnector)}
                  >
                    {busy === `${activeConnector.id}:test` ? "Testing" : "Test connection"}
                  </button>
                  <button
                    type="button"
                    className="audity-btn-secondary"
                    disabled={busy === `${activeConnector.id}:sync`}
                    onClick={() => void syncConnector(activeConnector)}
                  >
                    {busy === `${activeConnector.id}:sync` ? "Syncing" : "Start initial sync"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        );
      })() : null}
    </>
  );
}
