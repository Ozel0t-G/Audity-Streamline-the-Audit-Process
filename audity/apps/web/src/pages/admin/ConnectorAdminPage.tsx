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

const connectorVisuals: Record<ConnectorId, { mark: string; logoUrl: string; fallbackClass: string; accentClass: string }> = {
  jira: { mark: "J", logoUrl: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/jira.svg", fallbackClass: "bg-[#0052CC] text-white", accentClass: "border-[#0052CC]/70" },
  "microsoft-teams": { mark: "T", logoUrl: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/microsoftteams.svg", fallbackClass: "bg-[#6264A7] text-white", accentClass: "border-[#6264A7]/70" },
  servicenow: { mark: "SN", logoUrl: "https://www.google.com/s2/favicons?domain=servicenow.com&sz=128", fallbackClass: "bg-[#81B5A1] text-[#0D2B1F]", accentClass: "border-[#81B5A1]/70" },
  "sharepoint-onedrive": { mark: "SP", logoUrl: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/microsoftsharepoint.svg", fallbackClass: "bg-[#038387] text-white", accentClass: "border-[#038387]/70" },
  "microsoft-entra-id": { mark: "E", logoUrl: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/microsoftazure.svg", fallbackClass: "bg-[#0078D4] text-white", accentClass: "border-[#0078D4]/70" },
  "power-bi": { mark: "P", logoUrl: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/powerbi.svg", fallbackClass: "bg-[#F2C811] text-[#1A1A1A]", accentClass: "border-[#F2C811]/70" },
  confluence: { mark: "C", logoUrl: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/confluence.svg", fallbackClass: "bg-[#172B4D] text-white", accentClass: "border-[#2684FF]/70" },
  slack: { mark: "#", logoUrl: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/slack.svg", fallbackClass: "bg-[#4A154B] text-white", accentClass: "border-[#E01E5A]/70" }
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
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-audity border border-audity-border bg-white p-2 shadow-sm">
      <img
        className="h-full w-full object-contain"
        src={visual.logoUrl}
        alt={`${connector.displayName} logo`}
        onError={(event) => {
          const image = event.currentTarget;
          image.style.display = "none";
          image.parentElement?.classList.add(...visual.fallbackClass.split(" "));
          if (image.parentElement) image.parentElement.textContent = visual.mark;
        }}
      />
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
      <div className="mb-5 border-b border-audity-border pb-4">
        <p className="text-xs font-semibold uppercase text-audity-primary">Administration</p>
        <h1 className="mt-1 text-2xl font-semibold">Connector</h1>
        <p className="mt-2 max-w-3xl text-sm text-audity-secondary">
          Configure each external system once for the Audity instance. Enabled connectors synchronize customer data according to their sync settings.
        </p>
      </div>
      {error ? <div className="mb-4 rounded-audity border border-audity-error bg-[#2A1C17] px-3 py-2 text-sm text-[#FFB199]">{error}</div> : null}
      {message ? <div className="mb-4 rounded-audity border border-audity-success bg-audity-page px-3 py-2 text-sm text-audity-success">{message}</div> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {connectors.map((connector) => {
          const visual = connectorVisuals[connector.id];
          return (
            <button
              key={connector.id}
              className={`group min-h-44 rounded-audity border bg-audity-panel p-4 text-left transition hover:-translate-y-0.5 hover:bg-audity-panelAlt hover:shadow-xl ${visual.accentClass}`}
              onClick={() => setActiveConnectorId(connector.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <ConnectorLogo connector={connector} />
                <span className={`rounded-audity border px-2 py-1 text-[11px] ${statusClass(connector.status)}`}>
                  {connector.status}
                </span>
              </div>
              <h2 className="mt-4 text-lg font-semibold text-audity-text">{connector.displayName}</h2>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={`${activeConnector.displayName} connector settings`}>
            <form
              className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-audity border border-audity-border bg-audity-panel shadow-2xl"
              onSubmit={(event) => void saveConnector(event, activeConnector)}
            >
              <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-audity-border bg-audity-panel px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <ConnectorLogo connector={activeConnector} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-audity-primary">Connector Settings</p>
                    <h2 className="truncate text-xl font-semibold">{activeConnector.displayName}</h2>
                    <p className="text-sm text-audity-secondary">{activeConnector.provider}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="h-9 rounded-audity border border-audity-borderStrong bg-audity-panelAlt px-3 text-sm text-audity-text hover:border-audity-primary"
                  onClick={() => setActiveConnectorId("")}
                >
                  Close
                </button>
              </div>
              <div className="space-y-4 p-5">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-audity border border-audity-border bg-audity-page p-3">
                    <p className="text-xs font-semibold uppercase text-audity-primary">Was geht</p>
                    <p className="mt-2 text-sm text-audity-secondary">{activeConnector.whatWorks}</p>
                  </div>
                  <div className="rounded-audity border border-audity-border bg-audity-page p-3">
                    <p className="text-xs font-semibold uppercase text-audity-warning">Kommt noch</p>
                    <p className="mt-2 text-sm text-audity-secondary">{activeConnector.comingNext}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                  <label className="flex items-center gap-2 text-sm text-audity-text">
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      onChange={(event) => updateDraft(activeConnector.id, { enabled: event.target.checked })}
                    />
                    Enabled
                  </label>
                  <span className={`rounded-audity border px-2 py-1 text-xs ${statusClass(activeConnector.status)}`}>
                    {activeConnector.status}
                  </span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {connectorFields[activeConnector.id].map((field) => (
                    <label key={field.key} className="block text-xs font-semibold uppercase text-audity-secondary">
                      {field.label}
                      <input
                        className="mt-2 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm normal-case text-audity-text outline-none focus:border-audity-primary"
                        placeholder={field.placeholder}
                        value={draft.config[field.key] ?? ""}
                        onChange={(event) => updateDraft(activeConnector.id, { config: { ...draft.config, [field.key]: event.target.value } })}
                      />
                    </label>
                  ))}
                  {activeConnector.secretFields.map((field) => (
                    <label key={field} className="block text-xs font-semibold uppercase text-audity-secondary">
                      {secretLabels[field] ?? field}
                      <input
                        className="mt-2 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm normal-case text-audity-text outline-none focus:border-audity-primary"
                        type={field.toLowerCase().includes("url") || field === "username" ? "text" : "password"}
                        placeholder={activeConnector.hasSecrets[field] ? "Saved - enter new value to replace" : "Required"}
                        value={draft.secrets[field] ?? ""}
                        onChange={(event) => updateDraft(activeConnector.id, { secrets: { ...draft.secrets, [field]: event.target.value } })}
                      />
                    </label>
                  ))}
                </div>
                {activeConnector.lastMessage ? (
                  <div className="rounded-audity border border-audity-border bg-audity-page px-3 py-2 text-xs text-audity-secondary">
                    Last result: {activeConnector.lastMessage}
                    {activeConnector.lastCheckedAt ? ` - ${new Date(activeConnector.lastCheckedAt).toLocaleString()}` : ""}
                  </div>
                ) : null}
                <div className="rounded-audity border border-audity-border bg-audity-page p-3">
                  <p className="text-xs font-semibold uppercase text-audity-muted">Sync settings</p>
                  <p className="mt-1 text-sm text-audity-secondary">
                    These settings define which Audity data this system connector synchronizes. No customer is selected here; the connector syncs the configured dataset.
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-4">
                    {syncFields.map((field) => (
                      <label key={field.key} className="flex items-center gap-2 rounded-audity border border-audity-border bg-audity-panel px-3 py-2 text-sm text-audity-text">
                        <input
                          type="checkbox"
                          checked={(draft.config[field.key] ?? "true") === "true"}
                          onChange={(event) => updateDraft(activeConnector.id, { config: { ...draft.config, [field.key]: String(event.target.checked) } })}
                        />
                        {field.label}
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
                    <label className="block text-xs font-semibold uppercase text-audity-secondary">
                      Initial sync range
                      <select
                        className="mt-2 h-9 w-full rounded-audity border border-audity-border bg-audity-panel px-2 text-sm normal-case text-audity-text outline-none focus:border-audity-primary"
                        value={monthsBack[activeConnector.id] ?? 12}
                        onChange={(event) => setMonthsBack((current) => ({ ...current, [activeConnector.id]: Number(event.target.value) }))}
                      >
                        {initialSyncMonths.map((months) => (
                          <option key={months} value={months}>{months} months back</option>
                        ))}
                      </select>
                    </label>
                    <div className="rounded-audity border border-audity-border bg-audity-panel px-3 py-2 text-sm text-audity-secondary">
                      The first sync imports the selected history window. After that, customer and assessment changes are queued automatically while the connector is enabled.
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-audity-border pt-4">
                  <button
                    className="h-9 rounded-audity bg-audity-primary px-3 text-sm font-semibold text-white hover:bg-audity-primaryHover disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={busy === `${activeConnector.id}:save`}
                  >
                    {busy === `${activeConnector.id}:save` ? "Saving" : "Save"}
                  </button>
                  <button
                    type="button"
                    className="h-9 rounded-audity border border-audity-borderStrong bg-audity-panelAlt px-3 text-sm text-audity-text hover:border-audity-primary disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={busy === `${activeConnector.id}:test`}
                    onClick={() => void testConnector(activeConnector)}
                  >
                    {busy === `${activeConnector.id}:test` ? "Testing" : "Test connection"}
                  </button>
                  <button
                    type="button"
                    className="h-9 rounded-audity border border-audity-borderStrong bg-audity-panelAlt px-3 text-sm text-audity-text hover:border-audity-primary disabled:cursor-not-allowed disabled:opacity-60"
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
