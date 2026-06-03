import { FormEvent, useEffect, useMemo, useState } from "react";
import { useApi } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import type { ActivityLog, AdminUser, AuditLog, RoleOption } from "./types";

const apiBaseUrl = import.meta.env.VITE_AUDITY_API_URL ?? "http://localhost:3000";
const highRiskActions = new Set([
  "finding.dismissed",
  "risk.accepted",
  "score_reduced",
  "report.exported",
  "mfa.disabled",
  "auth.mfa.disabled",
  "role.changed"
]);

function jsonBlock(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function queryString(filters: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

type AdminSection = "activity" | "audit" | "users" | "branding" | "email";

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

type EmailSettings = {
  smtpHost: string;
  smtpPort: number;
  smtpTls: boolean;
  smtpUser: string;
  smtpPassword?: string;
  sender: string;
  hasPassword?: boolean;
};

type EmailDelivery = {
  id: string;
  sender: string;
  recipient: string;
  reportId: string;
  assessmentId: string;
  encryptionMethod: string;
  smtpResult: string;
  createdAt: string;
};

export function AdminDashboardPage({ section }: { section: AdminSection }) {
  const api = useApi();
  const { accessToken } = useAuth();
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [selectedLogId, setSelectedLogId] = useState("");
  const [filters, setFilters] = useState({
    userId: "",
    assessmentId: "",
    action: "",
    entityType: "",
    dateFrom: "",
    dateTo: ""
  });
  const [inviteForm, setInviteForm] = useState({
    email: "",
    name: "",
    role: "Viewer",
    password: "Change-me-now-123"
  });
  const [verify, setVerify] = useState<{ valid: boolean; brokenAt: string | null; checked?: number } | null>(null);
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
  const [emailSettings, setEmailSettings] = useState<EmailSettings>({
    smtpHost: "",
    smtpPort: 587,
    smtpTls: true,
    smtpUser: "",
    smtpPassword: "",
    sender: ""
  });
  const [emailDeliveryLog, setEmailDeliveryLog] = useState<EmailDelivery[]>([]);
  const [error, setError] = useState("");

  const selectedLog = useMemo(
    () => activityLogs.find((log) => log.id === selectedLogId) ?? activityLogs[0],
    [activityLogs, selectedLogId]
  );

  async function loadActivity() {
    const payload = await api<{ activityLogs: ActivityLog[] }>(
      `/api/admin/activity-logs${queryString(filters)}`
    );
    setActivityLogs(payload.activityLogs);
    if (!selectedLogId && payload.activityLogs[0]) setSelectedLogId(payload.activityLogs[0].id);
  }

  async function loadAudit() {
    const payload = await api<{ auditLogs: AuditLog[] }>("/api/admin/audit-logs");
    setAuditLogs(payload.auditLogs);
  }

  async function loadUsers() {
    const payload = await api<{ users: AdminUser[]; roles: RoleOption[] }>("/api/admin/users");
    setUsers(payload.users);
    setRoles(payload.roles);
    if (payload.roles[0] && !payload.roles.find((role) => role.name === inviteForm.role)) {
      setInviteForm((current) => ({ ...current, role: payload.roles[0].name }));
    }
  }

  async function loadBranding() {
    const payload = await api<{ branding: Branding }>("/api/admin/branding");
    setBranding(payload.branding);
  }

  async function loadEmail() {
    const [settingsPayload, deliveryPayload] = await Promise.all([
      api<{ emailSettings: EmailSettings }>("/api/admin/email-settings"),
      api<{ emailDeliveryLog: EmailDelivery[] }>("/api/admin/email-delivery-log")
    ]);
    setEmailSettings({ ...settingsPayload.emailSettings, smtpPassword: "" });
    setEmailDeliveryLog(deliveryPayload.emailDeliveryLog);
  }

  async function loadSection() {
    setError("");
    if (section === "activity") await loadActivity();
    if (section === "audit") await loadAudit();
    if (section === "users") await loadUsers();
    if (section === "branding") await loadBranding();
    if (section === "email") await loadEmail();
  }

  useEffect(() => {
    void loadSection().catch((err) => setError(err instanceof Error ? err.message : "Admin load failed"));
  }, [section]);

  async function verifyHashChain() {
    setError("");
    try {
      setVerify(await api<{ valid: boolean; brokenAt: string | null; checked: number }>("/api/admin/activity-logs/verify"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    }
  }

  async function exportCsv(path: string, filename: string) {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      credentials: "include"
    });
    if (!response.ok) throw new Error(`Export failed: ${response.status}`);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }

  async function inviteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/admin/users/invite", {
        method: "POST",
        body: JSON.stringify(inviteForm)
      });
      setInviteForm({ ...inviteForm, email: "", name: "" });
      await loadUsers();
      await loadActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    }
  }

  async function updateUser(user: AdminUser, patch: Partial<AdminUser>) {
    setError("");
    try {
      await api(`/api/admin/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify(patch)
      });
      await loadUsers();
      await loadActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : "User update failed");
    }
  }

  async function uploadLogo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem("logo") as HTMLInputElement;
    if (!input.files?.[0]) return;
    const body = new FormData();
    body.set("file", input.files[0]);
    const logo = await api<{ logoObjectKey: string; logoFileName: string }>("/api/admin/branding/logo", {
      method: "POST",
      body
    });
    setBranding({ ...branding, logoObjectKey: logo.logoObjectKey, logoFileName: logo.logoFileName });
    form.reset();
  }

  async function saveBranding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = await api<{ branding: Branding }>("/api/admin/branding", {
      method: "PUT",
      body: JSON.stringify(branding)
    });
    setBranding(payload.branding);
  }

  async function saveEmailSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = await api<{ emailSettings: EmailSettings }>("/api/admin/email-settings", {
      method: "PUT",
      body: JSON.stringify({
        ...emailSettings,
        smtpPassword: emailSettings.smtpPassword || undefined
      })
    });
    setEmailSettings({ ...payload.emailSettings, smtpPassword: "" });
    await loadEmail();
  }

  const title = {
    activity: "Activity Log",
    audit: "Audit Log",
    users: "User Management",
    branding: "Branding Settings",
    email: "Email Settings"
  }[section];

  return (
    <>
          <div className="mb-5 border-b border-audity-border pb-4">
            <p className="text-xs font-semibold uppercase text-audity-primary">Administration</p>
            <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
          </div>
          {error ? <div className="mb-4 rounded-audity border border-audity-error bg-[#2A1C17] px-3 py-2 text-sm text-[#FFB199]">{error}</div> : null}
          {section === "activity" ? (
          <section className="mb-4 rounded-audity border border-audity-border bg-audity-panel p-4">
            <div className="mb-4 flex flex-wrap items-end gap-3">
              {[
                ["userId", "User"],
                ["assessmentId", "Assessment"],
                ["action", "Action"],
                ["entityType", "Entity"],
                ["dateFrom", "From"],
                ["dateTo", "To"]
              ].map(([key, label]) => (
                <label key={key} className="block text-xs font-semibold uppercase text-audity-secondary">
                  {label}
                  <input
                    className="mt-2 h-9 w-40 rounded-audity border border-audity-border bg-audity-page px-3 text-sm normal-case text-audity-text outline-none focus:border-audity-primary"
                    type={key.startsWith("date") ? "date" : "text"}
                    value={filters[key as keyof typeof filters]}
                    onChange={(event) => setFilters({ ...filters, [key]: event.target.value })}
                  />
                </label>
              ))}
              <button className="h-9 rounded-audity bg-audity-primary px-3 text-sm font-semibold text-white hover:bg-audity-primaryHover" onClick={() => void loadActivity()}>
                Apply
              </button>
              <button className="h-9 rounded-audity border border-audity-borderStrong bg-audity-panelAlt px-3 text-sm text-audity-text hover:border-audity-primary" onClick={() => void exportCsv(`/api/admin/activity-logs/export${queryString(filters)}`, "audity-activity-logs.csv")}>
                Export
              </button>
              <button className="h-9 rounded-audity border border-audity-borderStrong bg-audity-panelAlt px-3 text-sm text-audity-text hover:border-audity-primary" onClick={() => void verifyHashChain()}>
                Verify Hash
              </button>
              {verify ? (
                <span className={`rounded-audity border px-3 py-2 text-sm ${verify.valid ? "border-audity-success text-audity-success" : "border-audity-error text-audity-error"}`}>
                  {verify.valid ? `valid: true (${verify.checked})` : `broken: ${verify.brokenAt}`}
                </span>
              ) : null}
            </div>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="overflow-hidden rounded-audity border border-audity-border">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-audity-tableHeader text-xs uppercase text-audity-muted">
                    <tr>
                      <th className="border-b border-audity-border px-3 py-3 text-left">Time</th>
                      <th className="border-b border-audity-border px-3 py-3 text-left">User</th>
                      <th className="border-b border-audity-border px-3 py-3 text-left">Action</th>
                      <th className="border-b border-audity-border px-3 py-3 text-left">Entity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityLogs.map((log) => (
                      <tr key={log.id} className={`cursor-pointer border-b border-audity-border last:border-0 ${log.id === selectedLog?.id ? "bg-audity-primaryActive/25" : ""}`} onClick={() => setSelectedLogId(log.id)}>
                        <td className="px-3 py-3 text-audity-secondary">{new Date(log.createdAt).toLocaleString()}</td>
                        <td className="px-3 py-3 text-audity-secondary">{log.userEmail ?? log.userId}</td>
                        <td className="px-3 py-3">
                          <span className={`rounded-audity border px-2 py-1 text-xs ${highRiskActions.has(log.action) ? "border-audity-error text-audity-error" : "border-audity-borderStrong text-audity-primary"}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-audity-secondary">{log.entityType}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <aside className="rounded-audity border border-audity-border bg-audity-page p-4">
                <h2 className="mb-3 text-lg font-semibold">Event Detail</h2>
                {selectedLog ? (
                  <div className="space-y-3">
                    <p className="text-sm text-audity-secondary">{selectedLog.action} · {selectedLog.eventHash.slice(0, 16)}</p>
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase text-audity-muted">Before</p>
                      <pre className="max-h-48 overflow-auto rounded-audity border border-audity-border bg-audity-panel p-3 text-xs text-audity-secondary">{jsonBlock(selectedLog.before)}</pre>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase text-audity-muted">After</p>
                      <pre className="max-h-48 overflow-auto rounded-audity border border-audity-border bg-audity-panel p-3 text-xs text-audity-secondary">{jsonBlock(selectedLog.after)}</pre>
                    </div>
                  </div>
                ) : <p className="text-sm text-audity-muted">No event selected</p>}
              </aside>
            </div>
          </section>
          ) : null}
          {section === "audit" ? (
          <div className="grid gap-4">
            <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Security Audit Log</h2>
                <button className="h-9 rounded-audity border border-audity-borderStrong bg-audity-panelAlt px-3 text-sm text-audity-text hover:border-audity-primary" onClick={() => void exportCsv("/api/admin/audit-logs/export", "audity-audit-logs.csv")}>
                  Export
                </button>
              </div>
              <div className="space-y-2">
                {auditLogs.slice(0, 12).map((log) => (
                  <div key={log.id} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-audity-primary">{log.action}</p>
                      <span className="text-xs text-audity-muted">{new Date(log.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 text-xs text-audity-secondary">{log.actorEmail ?? "system"} · {log.entity}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
          ) : null}
          {section === "users" ? (
          <div className="grid gap-4">
            <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
              <h2 className="mb-4 text-lg font-semibold">User Management</h2>
              <form className="mb-4 space-y-3" onSubmit={inviteUser}>
                <input className="h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm text-audity-text outline-none focus:border-audity-primary" placeholder="Email" value={inviteForm.email} onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })} />
                <input className="h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm text-audity-text outline-none focus:border-audity-primary" placeholder="Name" value={inviteForm.name} onChange={(event) => setInviteForm({ ...inviteForm, name: event.target.value })} />
                <div className="grid grid-cols-[1fr_160px] gap-2">
                  <input className="h-9 rounded-audity border border-audity-border bg-audity-page px-3 text-sm text-audity-text outline-none focus:border-audity-primary" placeholder="Temporary password" value={inviteForm.password} onChange={(event) => setInviteForm({ ...inviteForm, password: event.target.value })} />
                  <select className="h-9 rounded-audity border border-audity-border bg-audity-page px-2 text-sm text-audity-text" value={inviteForm.role} onChange={(event) => setInviteForm({ ...inviteForm, role: event.target.value })}>
                    {roles.map((role) => <option key={role.id} value={role.name}>{role.name}</option>)}
                  </select>
                </div>
                <button className="h-9 rounded-audity bg-audity-primary px-3 text-sm font-semibold text-white hover:bg-audity-primaryHover">Invite</button>
              </form>
              <div className="space-y-2">
                {users.map((user) => (
                  <div key={user.id} className="rounded-audity border border-audity-border bg-audity-page p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{user.email}</p>
                        <p className="text-xs text-audity-muted">{user.name} · {user.status}</p>
                      </div>
                      <button className="h-8 rounded-audity border border-audity-error px-2 text-xs text-audity-error" onClick={() => void updateUser(user, { status: "disabled" })}>Disable</button>
                    </div>
                    <select className="h-9 w-full rounded-audity border border-audity-border bg-audity-panel px-2 text-sm text-audity-text" value={user.role} onChange={(event) => void updateUser(user, { role: event.target.value })}>
                      {roles.map((role) => <option key={role.id} value={role.name}>{role.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </section>
          </div>
          ) : null}
          {section === "branding" ? (
            <section className="max-w-3xl rounded-audity border border-audity-border bg-audity-panel p-4">
              <form className="mb-4 flex flex-wrap items-center gap-3" onSubmit={(event) => void uploadLogo(event)}>
                <input name="logo" type="file" accept="image/png,image/jpeg" className="text-sm text-audity-secondary" />
                <button className="h-9 rounded-audity border border-audity-borderStrong px-3 text-sm text-audity-primary">Upload logo</button>
                {branding.logoFileName ? <span className="text-sm text-audity-secondary">{branding.logoFileName}</span> : null}
              </form>
              <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => void saveBranding(event)}>
                {(["primaryColor", "secondaryColor", "accentColor"] as const).map((key) => (
                  <label key={key} className="text-xs font-semibold uppercase text-audity-secondary">
                    {key}
                    <input type="color" className="mt-2 h-9 w-full rounded-audity border border-audity-border bg-audity-page" value={branding[key]} onChange={(event) => setBranding({ ...branding, [key]: event.target.value })} />
                  </label>
                ))}
                {(["headerText", "footerText", "confidentialityLabel", "watermark"] as const).map((key) => (
                  <label key={key} className="text-xs font-semibold uppercase text-audity-secondary">
                    {key}
                    <input className="mt-2 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm normal-case text-audity-text outline-none focus:border-audity-primary" value={branding[key]} onChange={(event) => setBranding({ ...branding, [key]: event.target.value })} />
                  </label>
                ))}
                <button className="h-9 rounded-audity bg-audity-primary px-3 text-sm font-semibold text-white hover:bg-audity-primaryHover">Save branding</button>
              </form>
            </section>
          ) : null}
          {section === "email" ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
              <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
                <h2 className="mb-4 text-lg font-semibold">SMTP Configuration</h2>
                <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => void saveEmailSettings(event)}>
                  <input className="h-9 rounded-audity border border-audity-border bg-audity-page px-3 text-sm text-audity-text outline-none focus:border-audity-primary" placeholder="SMTP host" value={emailSettings.smtpHost} onChange={(event) => setEmailSettings({ ...emailSettings, smtpHost: event.target.value })} />
                  <input className="h-9 rounded-audity border border-audity-border bg-audity-page px-3 text-sm text-audity-text outline-none focus:border-audity-primary" type="number" placeholder="Port" value={emailSettings.smtpPort} onChange={(event) => setEmailSettings({ ...emailSettings, smtpPort: Number(event.target.value) })} />
                  <input className="h-9 rounded-audity border border-audity-border bg-audity-page px-3 text-sm text-audity-text outline-none focus:border-audity-primary" placeholder="SMTP user" value={emailSettings.smtpUser} onChange={(event) => setEmailSettings({ ...emailSettings, smtpUser: event.target.value })} />
                  <input className="h-9 rounded-audity border border-audity-border bg-audity-page px-3 text-sm text-audity-text outline-none focus:border-audity-primary" type="password" placeholder={emailSettings.hasPassword ? "Password saved" : "SMTP password"} value={emailSettings.smtpPassword ?? ""} onChange={(event) => setEmailSettings({ ...emailSettings, smtpPassword: event.target.value })} />
                  <input className="h-9 rounded-audity border border-audity-border bg-audity-page px-3 text-sm text-audity-text outline-none focus:border-audity-primary" placeholder="Sender" value={emailSettings.sender} onChange={(event) => setEmailSettings({ ...emailSettings, sender: event.target.value })} />
                  <label className="flex h-9 items-center gap-2 text-sm text-audity-secondary">
                    <input type="checkbox" checked={emailSettings.smtpTls} onChange={(event) => setEmailSettings({ ...emailSettings, smtpTls: event.target.checked })} />
                    TLS
                  </label>
                  <button className="h-9 rounded-audity bg-audity-primary px-3 text-sm font-semibold text-white hover:bg-audity-primaryHover">Save email settings</button>
                </form>
              </section>
              <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
                <h2 className="mb-4 text-lg font-semibold">Delivery Log</h2>
                <div className="space-y-2">
                  {emailDeliveryLog.map((entry) => (
                    <div key={entry.id} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                      <p className="text-sm font-semibold text-audity-primary">{entry.recipient}</p>
                      <p className="mt-1 text-xs text-audity-secondary">{entry.smtpResult} · {entry.encryptionMethod}</p>
                      <p className="mt-1 text-xs text-audity-muted">{new Date(entry.createdAt).toLocaleString()}</p>
                    </div>
                  ))}
                  {!emailDeliveryLog.length ? <p className="text-sm text-audity-muted">No deliveries yet</p> : null}
                </div>
              </section>
            </div>
          ) : null}
    </>
  );
}
