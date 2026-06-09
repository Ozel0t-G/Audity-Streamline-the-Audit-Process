import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import type { ActivityLog, AdminUser, AuditLog, RoleOption } from "./types";

const apiBaseUrl = import.meta.env.VITE_AUDITY_API_URL ?? "";
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

type AdminSection = "activity" | "audit" | "users" | "branding" | "email" | "system" | "backup";

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

type BackupJob = {
  id: string;
  jobType: string;
  source?: string;
  status: string;
  createdAt?: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  completedAt?: string | null;
  failedAt?: string | null;
  failureReason?: string | null;
  storageLocation?: string | null;
  downloadExpiresAt?: string | null;
  isDownloadableZip?: boolean;
  backupManifest?: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
};

type BackupSettings = {
  automaticBackupsEnabled: boolean;
  backupType: "full" | "database" | "evidence";
  includeDatabase: boolean;
  includeEvidenceFiles: boolean;
  includeReports: boolean;
  includeFrameworkImports: boolean;
  includeAuditLogs: boolean;
  includeActivityLogs: boolean;
  includeSystemSettings: boolean;
  includeNotifications: boolean;
  scheduleTimezone: string;
  scheduleCron: string;
  retentionDays: number;
};

export function AdminDashboardPage({ section }: { section: AdminSection }) {
  const api = useApi();
  const navigate = useNavigate();
  const { accessToken, expireSession, refreshSession, user } = useAuth();
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
  const [systemSettings, setSystemSettings] = useState({ sessionIdleTimeoutMinutes: 30 });
  const [backupJobs, setBackupJobs] = useState<BackupJob[]>([]);
  const [backupType, setBackupType] = useState<"full" | "database" | "evidence">("full");
  const [backupSettings, setBackupSettings] = useState<BackupSettings>({
    automaticBackupsEnabled: false,
    backupType: "full",
    includeDatabase: true,
    includeEvidenceFiles: true,
    includeReports: true,
    includeFrameworkImports: true,
    includeAuditLogs: true,
    includeActivityLogs: true,
    includeSystemSettings: true,
    includeNotifications: true,
    scheduleTimezone: "Europe/Oslo",
    scheduleCron: "0 2 * * *",
    retentionDays: 30
  });
  const [backupPassword, setBackupPassword] = useState("");
  const [restoreBackupId, setRestoreBackupId] = useState("");
  const [restorePrecheck, setRestorePrecheck] = useState<Record<string, unknown> | null>(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [error, setError] = useState("");

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

  const selectedLog = useMemo(
    () => activityLogs.find((log) => log.id === selectedLogId) ?? activityLogs[0],
    [activityLogs, selectedLogId]
  );
  const can = (permission: string) => Boolean(user?.permissions.includes(permission));

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

  async function loadSystemSettings() {
    const payload = await api<{ sessionIdleTimeoutMinutes: number }>("/api/admin/system-settings");
    setSystemSettings(payload);
  }

  async function loadBackup() {
    const [jobsPayload, settingsPayload] = await Promise.all([
      api<{ latestBackup: BackupJob | null; backupJobs: BackupJob[] }>("/api/admin/backups"),
      api<{ backupSettings: BackupSettings }>("/api/admin/backup-settings")
    ]);
    setBackupJobs(jobsPayload.backupJobs);
    setBackupSettings(settingsPayload.backupSettings);
    if (!restoreBackupId && jobsPayload.backupJobs[0]) setRestoreBackupId(jobsPayload.backupJobs[0].id);
  }

  async function loadSection() {
    setError("");
    if (section === "activity") await loadActivity();
    if (section === "audit") await loadAudit();
    if (section === "users") await loadUsers();
    if (section === "branding") await loadBranding();
    if (section === "email") await loadEmail();
    if (section === "system") await loadSystemSettings();
    if (section === "backup") await loadBackup();
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
    const response = await fetchWithFreshAuth(path);
    if (response.status === 401) return;
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

  async function saveSystemSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const payload = await api<{ sessionIdleTimeoutMinutes: number }>("/api/admin/system-settings", {
        method: "PATCH",
        body: JSON.stringify(systemSettings)
      });
      setSystemSettings(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save system settings failed");
    }
  }

  async function triggerBackup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/admin/backups/manual", {
        method: "POST",
        body: JSON.stringify({ jobType: backupType })
      });
      await loadBackup();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backup trigger failed");
    }
  }

  async function triggerDownloadBackup() {
    setError("");
    setBackupPassword("");
    try {
      const payload = await api<{ backupJobId: string; downloadPassword: string }>("/api/admin/backups/manual-download-zip", {
        method: "POST",
        body: JSON.stringify({ jobType: backupType })
      });
      setBackupPassword(payload.downloadPassword);
      await loadBackup();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download backup trigger failed");
    }
  }

  async function downloadBackup(job: BackupJob) {
    setError("");
    try {
      const payload = await api<{ downloadUrl: string }>(`/api/admin/backups/${job.id}/download`);
      window.open(payload.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backup download failed");
    }
  }

  async function saveBackupSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const payload = await api<{ backupSettings: BackupSettings }>("/api/admin/backup-settings", {
        method: "PATCH",
        body: JSON.stringify(backupSettings)
      });
      setBackupSettings(payload.backupSettings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backup settings save failed");
    }
  }

  async function runRestorePrecheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const payload = await api<{ precheck: Record<string, unknown> }>("/api/admin/backups/restore-precheck", {
        method: "POST",
        body: JSON.stringify({ backupJobId: restoreBackupId, passwordProvided: true })
      });
      setRestorePrecheck(payload.precheck);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore precheck failed");
    }
  }

  async function startFullRestore() {
    setError("");
    try {
      await api(`/api/admin/backups/${restoreBackupId}/restore`, {
        method: "POST",
        body: JSON.stringify({ confirmationPhrase: restoreConfirmation, passwordProvided: true })
      });
      setRestoreConfirmation("");
      await loadBackup();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore start failed");
    }
  }

  const title = {
    activity: "Activity Log",
    audit: "Audit Log",
    users: "User Management",
    branding: "Branding Settings",
    email: "Email Settings",
    system: "System Settings",
    backup: "Backup & Recovery"
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
                {can("auditlog.view") ? <button className="h-9 rounded-audity border border-audity-borderStrong bg-audity-panelAlt px-3 text-sm text-audity-text hover:border-audity-primary" onClick={() => void exportCsv("/api/admin/audit-logs/export", "audity-audit-logs.csv")}>
                  Export
                </button> : null}
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
              {can("users.invite") ? <form className="mb-4 space-y-3" onSubmit={inviteUser}>
                <input className="h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm text-audity-text outline-none focus:border-audity-primary" placeholder="Email" value={inviteForm.email} onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })} />
                <input className="h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm text-audity-text outline-none focus:border-audity-primary" placeholder="Name" value={inviteForm.name} onChange={(event) => setInviteForm({ ...inviteForm, name: event.target.value })} />
                <div className="grid grid-cols-[1fr_160px] gap-2">
                  <input className="h-9 rounded-audity border border-audity-border bg-audity-page px-3 text-sm text-audity-text outline-none focus:border-audity-primary" placeholder="Temporary password" value={inviteForm.password} onChange={(event) => setInviteForm({ ...inviteForm, password: event.target.value })} />
                  <select className="h-9 rounded-audity border border-audity-border bg-audity-page px-2 text-sm text-audity-text" value={inviteForm.role} onChange={(event) => setInviteForm({ ...inviteForm, role: event.target.value })}>
                    {roles.map((role) => <option key={role.id} value={role.name}>{role.name}</option>)}
                  </select>
                </div>
                <button className="h-9 rounded-audity bg-audity-primary px-3 text-sm font-semibold text-white hover:bg-audity-primaryHover">Invite</button>
              </form> : null}
              <div className="space-y-2">
                {users.map((user) => (
                  <div key={user.id} className="rounded-audity border border-audity-border bg-audity-page p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{user.email}</p>
                        <p className="text-xs text-audity-muted">{user.name} · {user.status}</p>
                      </div>
                      {can("users.disable") ? <button className="h-8 rounded-audity border border-audity-error px-2 text-xs text-audity-error" onClick={() => void updateUser(user, { status: "disabled" })}>Disable</button> : null}
                    </div>
                    {can("roles.manage") ? <select className="h-9 w-full rounded-audity border border-audity-border bg-audity-panel px-2 text-sm text-audity-text" value={user.role} onChange={(event) => void updateUser(user, { role: event.target.value })}>
                      {roles.map((role) => <option key={role.id} value={role.name}>{role.name}</option>)}
                    </select> : null}
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
          {section === "system" ? (
            <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
              <form className="max-w-md space-y-3" onSubmit={saveSystemSettings}>
                <label className="block text-xs font-semibold uppercase text-audity-secondary">
                  Session idle timeout
                  <select
                    className="mt-2 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-2 text-sm normal-case text-audity-text outline-none focus:border-audity-primary"
                    value={systemSettings.sessionIdleTimeoutMinutes}
                    onChange={(event) => setSystemSettings({ sessionIdleTimeoutMinutes: Number(event.target.value) })}
                  >
                    {Array.from({ length: 12 }, (_, index) => (index + 1) * 5).map((minutes) => (
                      <option key={minutes} value={minutes}>{minutes} minutes</option>
                    ))}
                  </select>
                </label>
                <button className="h-9 rounded-audity bg-audity-primary px-3 text-sm font-semibold text-white hover:bg-audity-primaryHover">
                  Save system settings
                </button>
              </form>
            </section>
          ) : null}
          {section === "backup" ? (
            <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
              <div className="space-y-4">
                <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
                  <h2 className="mb-4 text-lg font-semibold">Manual Backup</h2>
                  {user?.role === "Instance Admin" ? <form className="space-y-3" onSubmit={(event) => void triggerBackup(event)}>
                    <label className="block text-xs font-semibold uppercase text-audity-secondary">
                      Backup Type
                      <select className="mt-2 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-2 text-sm normal-case text-audity-text outline-none focus:border-audity-primary" value={backupType} onChange={(event) => setBackupType(event.target.value as typeof backupType)}>
                        <option value="full">Full</option>
                        <option value="database">Database</option>
                        <option value="evidence">Evidence</option>
                      </select>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button className="h-9 rounded-audity bg-audity-primary px-3 text-sm font-semibold text-white hover:bg-audity-primaryHover">
                        Trigger backup
                      </button>
                      <button type="button" className="h-9 rounded-audity border border-audity-borderStrong bg-audity-panelAlt px-3 text-sm text-audity-text hover:border-audity-primary" onClick={() => void triggerDownloadBackup()}>
                        Create download package
                      </button>
                    </div>
                    {backupPassword ? (
                      <div className="rounded-audity border border-audity-warning bg-audity-page px-3 py-2 text-xs text-audity-warning">
                        One-time password: <span className="font-mono">{backupPassword}</span>
                      </div>
                    ) : null}
                  </form> : <p className="text-sm text-audity-muted">Instance Admin required.</p>}
                </section>
                <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
                  <h2 className="mb-4 text-lg font-semibold">Automatic Backups</h2>
                  <form className="space-y-3" onSubmit={(event) => void saveBackupSettings(event)}>
                    <label className="flex items-center gap-2 text-sm text-audity-text">
                      <input type="checkbox" checked={backupSettings.automaticBackupsEnabled} onChange={(event) => setBackupSettings({ ...backupSettings, automaticBackupsEnabled: event.target.checked })} />
                      Enabled
                    </label>
                    <label className="block text-xs font-semibold uppercase text-audity-secondary">
                      Schedule
                      <input className="mt-2 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm normal-case text-audity-text outline-none focus:border-audity-primary" value={backupSettings.scheduleCron} onChange={(event) => setBackupSettings({ ...backupSettings, scheduleCron: event.target.value })} />
                    </label>
                    <label className="block text-xs font-semibold uppercase text-audity-secondary">
                      Retention days
                      <input className="mt-2 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm normal-case text-audity-text outline-none focus:border-audity-primary" type="number" min={1} max={3650} value={backupSettings.retentionDays} onChange={(event) => setBackupSettings({ ...backupSettings, retentionDays: Number(event.target.value) })} />
                    </label>
                    <button className="h-9 rounded-audity bg-audity-primary px-3 text-sm font-semibold text-white hover:bg-audity-primaryHover">
                      Save schedule
                    </button>
                  </form>
                </section>
                <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
                  <h2 className="mb-4 text-lg font-semibold">Restore Precheck</h2>
                  <form className="space-y-3" onSubmit={(event) => void runRestorePrecheck(event)}>
                    <label className="block text-xs font-semibold uppercase text-audity-secondary">
                      Backup
                      <select className="mt-2 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-2 text-sm normal-case text-audity-text outline-none focus:border-audity-primary" value={restoreBackupId} onChange={(event) => setRestoreBackupId(event.target.value)}>
                        {backupJobs.map((job) => (
                          <option key={job.id} value={job.id}>{job.jobType} - {job.status}</option>
                        ))}
                      </select>
                    </label>
                    <button className="h-9 rounded-audity border border-audity-borderStrong bg-audity-panelAlt px-3 text-sm text-audity-text hover:border-audity-primary">
                      Run precheck
                    </button>
                    {restorePrecheck ? <pre className="max-h-48 overflow-auto rounded-audity bg-audity-page p-3 text-xs text-audity-secondary">{jsonBlock(restorePrecheck)}</pre> : null}
                  </form>
                  <div className="mt-4 border-t border-audity-border pt-4">
                    <label className="block text-xs font-semibold uppercase text-audity-secondary">
                      Confirm Full Restore
                      <input
                        className="mt-2 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm normal-case text-audity-text outline-none focus:border-audity-primary"
                        placeholder="RESTORE AUDITY"
                        value={restoreConfirmation}
                        onChange={(event) => setRestoreConfirmation(event.target.value)}
                      />
                    </label>
                    <button
                      className="mt-3 h-9 rounded-audity border border-audity-error bg-[#2A1C17] px-3 text-sm font-semibold text-[#FFB199] disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!restoreBackupId || restoreConfirmation !== "RESTORE AUDITY"}
                      onClick={() => void startFullRestore()}
                    >
                      Start full restore
                    </button>
                  </div>
                </section>
              </div>
              <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">Backup History</h2>
                  <button className="h-9 rounded-audity border border-audity-borderStrong bg-audity-panelAlt px-3 text-sm text-audity-text hover:border-audity-primary" onClick={() => void loadBackup()}>
                    Refresh
                  </button>
                </div>
                <div className="space-y-2">
                  {backupJobs.map((job) => (
                    <div key={job.id} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-audity-primary">{job.jobType} <span className="text-xs font-normal text-audity-muted">{job.source ?? "manual"}</span></p>
                        <span className="rounded-audity border border-audity-borderStrong px-2 py-1 text-[11px] text-audity-secondary">{job.status}</span>
                      </div>
                      <p className="mt-1 text-xs text-audity-secondary">
                        Started: {job.startedAt ? new Date(job.startedAt).toLocaleString() : "-"} | Completed: {job.completedAt ? new Date(job.completedAt).toLocaleString() : "-"}
                      </p>
                      <p className="mt-1 text-xs text-audity-muted">
                        Objects: {Array.isArray(job.metadata?.objects) ? job.metadata.objects.length : 0}
                      </p>
                      {job.failureReason ? <p className="mt-1 text-xs text-audity-error">{job.failureReason}</p> : null}
                      {job.isDownloadableZip ? (
                        <button className="mt-2 h-8 rounded-audity border border-audity-borderStrong bg-audity-panelAlt px-3 text-xs text-audity-text hover:border-audity-primary" onClick={() => void downloadBackup(job)} disabled={job.status !== "completed"}>
                          Download package
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {!backupJobs.length ? <p className="text-sm text-audity-muted">No backup jobs yet</p> : null}
                </div>
              </section>
            </div>
          ) : null}
    </>
  );
}
