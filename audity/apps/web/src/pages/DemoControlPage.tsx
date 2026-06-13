import { FormEvent, useEffect, useMemo, useState } from "react";
import { BrandMark } from "../components/BrandMark";

const apiBaseUrl = import.meta.env.VITE_AUDITY_API_URL ?? "";
const tokenKey = "audity_demo_control_token";

type DemoSettings = {
  demoModeEnabled: boolean;
  publicLoginEnabled: boolean;
  resetEnabled: boolean;
  resetIntervalMinutes: number;
  nextResetAt: string | null;
  telemetryEnabled: boolean;
  collectIpAddress: boolean;
  collectDeviceDetails: boolean;
  resetDataDeletionEnabled: boolean;
  demoLoginEmail: string;
  demoLoginRole: string;
  lastResetAt: string | null;
};

type DemoOverview = {
  settings: DemoSettings;
  control: { configured: boolean; totpRequired: boolean; ipAllowlistEnabled: boolean; sessionMinutes: number };
  telemetrySummary: { total_logins: number; logins_24h: number; distinct_ip_hashes: number; failed_logins: number };
  recentLoginEvents: Array<Record<string, unknown>>;
  resetRuns: Array<Record<string, unknown>>;
  controlAuditEvents: Array<Record<string, unknown>>;
};

function text(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function DemoControlPage() {
  const [token, setToken] = useState(() => window.sessionStorage.getItem(tokenKey) ?? "");
  const [secret, setSecret] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [overview, setOverview] = useState<DemoOverview | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState({
    publicLoginEnabled: true,
    resetEnabled: true,
    resetIntervalMinutes: 60,
    telemetryEnabled: true,
    collectIpAddress: false,
    collectDeviceDetails: true
  });

  const nextResetLabel = useMemo(() => {
    if (!overview?.settings.nextResetAt) return "Not scheduled";
    return new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "medium" }).format(new Date(overview.settings.nextResetAt));
  }, [overview?.settings.nextResetAt]);

  async function controlApi<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Audity-Control-Token": token,
        ...(init.headers ?? {})
      }
    });
    const payload = (await response.json().catch(() => null)) as T & { message?: string };
    if (!response.ok) throw new Error(payload?.message ?? `Request failed: ${response.status}`);
    return payload;
  }

  async function load() {
    if (!token) return;
    const payload = await controlApi<DemoOverview>("/api/control/demo/overview");
    setOverview(payload);
    setDraft({
      publicLoginEnabled: payload.settings.publicLoginEnabled,
      resetEnabled: payload.settings.resetEnabled,
      resetIntervalMinutes: payload.settings.resetIntervalMinutes,
      telemetryEnabled: payload.settings.telemetryEnabled,
      collectIpAddress: payload.settings.collectIpAddress,
      collectDeviceDetails: payload.settings.collectDeviceDetails
    });
  }

  useEffect(() => {
    void load().catch(() => {
      window.sessionStorage.removeItem(tokenKey);
      setToken("");
    });
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload = await fetch(`${apiBaseUrl}/api/control/demo/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, totpCode: totpCode || undefined })
      }).then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.message ?? "Control login failed");
        return body as { controlToken: string; expiresAt: string };
      });
      window.sessionStorage.setItem(tokenKey, payload.controlToken);
      setToken(payload.controlToken);
      setSecret("");
      setTotpCode("");
      setMessage(`Control session active until ${new Date(payload.expiresAt).toLocaleTimeString()}.`);
      setTimeout(() => void load(), 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Control login failed");
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      await controlApi("/api/control/demo/settings", { method: "PUT", body: JSON.stringify(draft) });
      setMessage("Demo control settings saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Settings update failed");
    } finally {
      setLoading(false);
    }
  }

  async function resetNow() {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const payload = await controlApi<{ result: { status: string; message?: string } }>("/api/control/demo/reset-now", { method: "POST", body: "{}" });
      setMessage(payload.result.message ?? `Reset ${payload.result.status}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    void controlApi("/api/control/demo/logout", { method: "POST", body: "{}" }).catch(() => null);
    window.sessionStorage.removeItem(tokenKey);
    setToken("");
    setOverview(null);
  }

  return (
    <main className="min-h-screen bg-audity-app text-audity-text">
      <header className="flex h-12 items-center justify-between border-b border-audity-border bg-audity-topnav px-5">
        <div className="flex items-center gap-3">
          <BrandMark />
          <span className="text-sm font-semibold">Audity Demo Control</span>
        </div>
        {token ? <button className="audity-btn-secondary" onClick={logout}>End control session</button> : null}
      </header>
      <section className="mx-auto max-w-7xl p-4">
        <div className="audity-page-header">
          <p className="audity-page-kicker">Hidden control plane</p>
          <h1 className="audity-page-title">Demo Tenant Control</h1>
          <p className="audity-page-copy">Configure public demo access, reset timing, telemetry collection and manual reset for the isolated demo tenant.</p>
        </div>
        {error ? <div className="mb-3 rounded-audity border border-audity-error bg-[#2A1C17] px-3 py-2 text-sm text-[#FFB199]">{error}</div> : null}
        {message ? <div className="mb-3 rounded-audity border border-audity-success bg-audity-page px-3 py-2 text-sm text-audity-success">{message}</div> : null}

        {!token ? (
          <form className="max-w-md rounded-audity border border-audity-border bg-audity-panel p-4" onSubmit={login}>
            <h2 className="text-lg font-semibold">Control Login</h2>
            <p className="mt-1 text-sm text-audity-secondary">Use the dedicated demo-control secret. TOTP is required when configured on the server.</p>
            <label className="mt-4 block text-xs font-semibold uppercase text-audity-secondary">Control secret</label>
            <input className="mt-2 audity-input" type="password" value={secret} onChange={(event) => setSecret(event.target.value)} />
            <label className="mt-4 block text-xs font-semibold uppercase text-audity-secondary">TOTP code</label>
            <input className="mt-2 audity-input" inputMode="numeric" value={totpCode} onChange={(event) => setTotpCode(event.target.value)} />
            <button className="mt-4 audity-btn-primary" disabled={loading}>Unlock control plane</button>
          </form>
        ) : overview ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                {[
                  ["Demo mode", overview.settings.demoModeEnabled ? "Enabled" : "Disabled"],
                  ["Next reset", nextResetLabel],
                  ["Logins 24h", overview.telemetrySummary?.logins_24h ?? 0],
                  ["Failed logins", overview.telemetrySummary?.failed_logins ?? 0]
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-audity border border-audity-border bg-audity-panel p-3">
                    <p className="text-xs font-semibold uppercase text-audity-muted">{label}</p>
                    <p className="mt-2 text-lg font-semibold">{value}</p>
                  </div>
                ))}
              </div>
              <form className="rounded-audity border border-audity-border bg-audity-panel p-4" onSubmit={saveSettings}>
                <h2 className="text-lg font-semibold">Tenant Reset & Collection</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm text-audity-secondary"><input type="checkbox" checked={draft.publicLoginEnabled} onChange={(event) => setDraft({ ...draft, publicLoginEnabled: event.target.checked })} />Public demo login enabled</label>
                  <label className="flex items-center gap-2 text-sm text-audity-secondary"><input type="checkbox" checked={draft.resetEnabled} onChange={(event) => setDraft({ ...draft, resetEnabled: event.target.checked })} />Automatic reset enabled</label>
                  <label className="flex items-center gap-2 text-sm text-audity-secondary"><input type="checkbox" checked={draft.telemetryEnabled} onChange={(event) => setDraft({ ...draft, telemetryEnabled: event.target.checked })} />Collect demo login telemetry</label>
                  <label className="flex items-center gap-2 text-sm text-audity-secondary"><input type="checkbox" checked={draft.collectDeviceDetails} onChange={(event) => setDraft({ ...draft, collectDeviceDetails: event.target.checked })} />Collect device/browser details</label>
                  <label className="flex items-center gap-2 text-sm text-audity-secondary"><input type="checkbox" checked={draft.collectIpAddress} onChange={(event) => setDraft({ ...draft, collectIpAddress: event.target.checked })} />Store raw IP address</label>
                  <label className="text-sm text-audity-secondary">Reset interval minutes<input className="mt-2 audity-input" type="number" min={5} max={1440} value={draft.resetIntervalMinutes} onChange={(event) => setDraft({ ...draft, resetIntervalMinutes: Number(event.target.value) })} /></label>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="audity-btn-primary" disabled={loading}>Save settings</button>
                  <button className="audity-btn-secondary" type="button" disabled={loading} onClick={() => void resetNow()}>Reset now</button>
                </div>
                {!overview.settings.resetDataDeletionEnabled ? (
                  <p className="mt-3 rounded-audity border border-audity-warning bg-audity-page px-3 py-2 text-xs text-audity-warning">
                    Destructive reset is safety-locked. Set AUDITY_DEMO_RESET_DANGEROUSLY_ALLOW_DATA_DELETION=true on the isolated demo stack to allow data deletion.
                  </p>
                ) : null}
              </form>
              <div className="rounded-audity border border-audity-border bg-audity-panel p-4">
                <h2 className="text-lg font-semibold">Recent Login Telemetry</h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-audity-muted"><tr><th className="p-2">Time</th><th className="p-2">Email</th><th className="p-2">Method</th><th className="p-2">IP</th><th className="p-2">Device</th><th className="p-2">Browser</th><th className="p-2">OS</th></tr></thead>
                    <tbody>
                      {overview.recentLoginEvents.map((event) => (
                        <tr key={String(event.id)} className="border-t border-audity-border">
                          <td className="p-2">{text(event.created_at)}</td>
                          <td className="p-2">{text(event.email)}</td>
                          <td className="p-2">{text(event.login_method)}</td>
                          <td className="p-2">{text(event.ip_address ?? event.ip_masked)}</td>
                          <td className="p-2">{text(event.device_type)}</td>
                          <td className="p-2">{text(event.browser)}</td>
                          <td className="p-2">{text(event.operating_system)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
            <aside className="space-y-4">
              <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
                <h2 className="text-sm font-semibold">Security Posture</h2>
                <div className="mt-3 space-y-2 text-sm text-audity-secondary">
                  <p>Control secret: {overview.control.configured ? "configured" : "missing"}</p>
                  <p>TOTP: {overview.control.totpRequired ? "required" : "not configured"}</p>
                  <p>IP allowlist: {overview.control.ipAllowlistEnabled ? "enabled" : "disabled"}</p>
                  <p>Session length: {overview.control.sessionMinutes} minutes</p>
                  <p>Demo login: {overview.settings.demoLoginEmail}</p>
                  <p>Demo role: {overview.settings.demoLoginRole}</p>
                </div>
              </section>
              <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
                <h2 className="text-sm font-semibold">Reset Runs</h2>
                <div className="mt-3 space-y-2">
                  {overview.resetRuns.map((run) => (
                    <div key={String(run.id)} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2 text-xs">
                      <p className="font-semibold">{text(run.status)} · {text(run.trigger_source)}</p>
                      <p className="text-audity-muted">{text(run.started_at)}</p>
                      <p className="mt-1 text-audity-secondary">{text(run.message)}</p>
                    </div>
                  ))}
                </div>
              </section>
              <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
                <h2 className="text-sm font-semibold">Control Audit</h2>
                <div className="mt-3 space-y-2">
                  {overview.controlAuditEvents.map((event) => (
                    <div key={String(event.id)} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2 text-xs">
                      <p className="font-semibold">{text(event.action)}</p>
                      <p className="text-audity-muted">{text(event.created_at)}</p>
                    </div>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        ) : (
          <p className="text-sm text-audity-secondary">Loading control overview...</p>
        )}
      </section>
    </main>
  );
}
