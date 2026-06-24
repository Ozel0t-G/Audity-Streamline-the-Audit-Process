import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import type { ActivityLog, AdminUser, AuditLog, PermissionOption, RoleOption } from "./types";
import { MultiCombobox } from "../../components/ui";

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

function formatBytes(value: number) {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(value / 1024)} KB`;
}

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days) return `${days}d ${hours}h`;
  return `${hours}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-audity-page">
      <div className="h-full bg-audity-primary" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-audity border border-audity-border bg-audity-page p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-audity-muted">{label}</span>
        <span className="text-sm font-semibold text-audity-text">{value}%</span>
      </div>
      <ProgressBar value={value} />
      <p className="mt-2 text-xs text-audity-secondary">{detail}</p>
    </div>
  );
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

type DashboardRange = "6h" | "24h" | "1w" | "1m";

type DashboardSystem = {
  range: DashboardRange;
  snapshot: {
    status: string;
    cpuPercent: number;
    memoryPercent: number;
    storagePercent: number;
    memoryUsedBytes: number;
    memoryTotalBytes: number;
    storageUsedBytes: number;
    storageTotalBytes: number;
    serverIp: string;
    hostname: string;
    uptimeSeconds: number;
    issues: string[];
  };
  timeline: Array<{
    status: string;
    cpuPercent: number;
    memoryPercent: number;
    storagePercent: number;
    serverIp: string;
    createdAt: string;
  }>;
};

type UpdateStatus = {
  currentVersion: string;
  configuredImageTag: string;
  imageRegistry: string;
  repository: string;
  updateBranch: string;
  updateChannel: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  checkedAt: string | null;
  checkError: string | null;
  updaterConfigured: boolean;
};

type UpdateJob = {
  id: string;
  status: "idle" | "running" | "succeeded" | "failed";
  requestedVersion: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  log: string[];
};

const rangeOptions: DashboardRange[] = ["6h", "24h", "1w", "1m"];

export function AdminDashboardPage({ section }: { section: AdminSection }) {
  const api = useApi();
  const navigate = useNavigate();
  const { accessToken, csrfToken, expireSession, refreshSession, user } = useAuth();
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [permissions, setPermissions] = useState<PermissionOption[]>([]);
  const [rolePermissionDrafts, setRolePermissionDrafts] = useState<Record<string, string[]>>({});
  const [expandedRoleIds, setExpandedRoleIds] = useState<string[]>([]);
  const [selectedLogId, setSelectedLogId] = useState("");
  const [filters, setFilters] = useState({
    userId: "",
    assessmentId: "",
    action: "",
    entityType: "",
    dateFrom: "",
    dateTo: ""
  });
  const [auditFilters, setAuditFilters] = useState({
    action: "",
    dateFrom: "",
    dateTo: ""
  });
  const [inviteForm, setInviteForm] = useState({
    email: "",
    name: "",
    role: "Viewer"
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
  const [systemMonitor, setSystemMonitor] = useState<DashboardSystem | null>(null);
  const [systemRange, setSystemRange] = useState<DashboardRange>("24h");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [emailTestRecipient, setEmailTestRecipient] = useState("");
  const [emailTesting, setEmailTesting] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<{ ok: boolean; latencyMs: number; message: string } | null>(null);
  const [updateJob, setUpdateJob] = useState<UpdateJob | null>(null);
  const [updateVersion, setUpdateVersion] = useState("");
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
  const [oneTimePassword, setOneTimePassword] = useState<{ email: string; password: string; action: string } | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  async function fetchWithFreshAuth(path: string, init: RequestInit = {}) {
    const send = (token: string | null, csrf: string | null) => {
      const headers = new Headers(init.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      if (csrf && init.method && init.method !== "GET") headers.set("X-CSRF-Token", csrf);
      return fetch(`${apiBaseUrl}${path}`, {
        ...init,
        credentials: "include",
        headers
      });
    };
    let response = await send(accessToken, csrfToken);
    let needsRetry = response.status === 401;
    if (response.status === 403) {
      const body = await response.clone().json().catch(() => null) as { code?: string } | null;
      needsRetry = body?.code === "CSRF_INVALID";
    }
    if (needsRetry) {
      const refreshed = await refreshSession();
      if (refreshed) {
        response = await send(refreshed.accessToken, refreshed.csrfToken);
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
    const payload = await api<{ auditLogs: AuditLog[] }>(`/api/admin/audit-logs${queryString(auditFilters)}`);
    setAuditLogs(payload.auditLogs);
  }

  async function loadUsers() {
    const payload = await api<{ users: AdminUser[]; roles: RoleOption[]; permissions: PermissionOption[] }>("/api/admin/users");
    setUsers(payload.users);
    setRoles(payload.roles);
    setPermissions(payload.permissions);
    setRolePermissionDrafts(Object.fromEntries(payload.roles.map((role) => [role.id, role.permissions ?? []])));
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
    const [settingsPayload, dashboardPayload, updatePayload] = await Promise.all([
      api<{ sessionIdleTimeoutMinutes: number }>("/api/admin/system-settings"),
      api<{ system: DashboardSystem | null }>(`/api/dashboard?range=${systemRange}`),
      api<{ update: UpdateStatus; job: UpdateJob | null }>("/api/admin/updates/status")
    ]);
    setSystemSettings(settingsPayload);
    setSystemMonitor(dashboardPayload.system);
    setUpdateStatus(updatePayload.update);
    setUpdateJob(updatePayload.job);
    if (!updateVersion && updatePayload.update.latestVersion) setUpdateVersion(updatePayload.update.latestVersion);
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

  useEffect(() => {
    if (section !== "system") return;
    void loadSystemSettings().catch((err) => setError(err instanceof Error ? err.message : "System monitor load failed"));
  }, [section, systemRange]);

  useEffect(() => {
    if (section !== "system" || updateJob?.status !== "running") return;
    let timer: number | undefined;
    const poll = () =>
      api<{ update: UpdateStatus; job: UpdateJob | null }>("/api/admin/updates/status")
        .then((payload) => {
          setUpdateStatus(payload.update);
          setUpdateJob(payload.job);
        })
        .catch(() => undefined);
    const start = () => {
      if (timer !== undefined) return;
      timer = window.setInterval(() => void poll(), 5000);
    };
    const stop = () => {
      if (timer === undefined) return;
      window.clearInterval(timer);
      timer = undefined;
    };
    const sync = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      stop();
    };
  }, [api, section, updateJob?.status]);

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
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
  }

  async function inviteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      // The backend always generates a 24-char one-time password; admins never
      // set a starter password from the UI.
      const result = await api<{ oneTimePassword: string; user: { email: string } }>("/api/admin/users/invite", {
        method: "POST",
        body: JSON.stringify(inviteForm)
      });
      setOneTimePassword({ email: result.user.email, password: result.oneTimePassword, action: "Invitation" });
      setInviteForm({ ...inviteForm, email: "", name: "" });
      await loadUsers();
      await loadActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    }
  }

  async function resetUserPassword(user: AdminUser) {
    setError("");
    try {
      const result = await api<{ oneTimePassword: string }>(`/api/admin/users/${user.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({})
      });
      setOneTimePassword({ email: user.email, password: result.oneTimePassword, action: "Password reset" });
      await loadActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password reset failed");
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

  async function saveRolePermissions(role: RoleOption) {
    setError("");
    try {
      await api(`/api/admin/roles/${role.id}/permissions`, {
        method: "PATCH",
        body: JSON.stringify({ permissions: rolePermissionDrafts[role.id] ?? [] })
      });
      await loadUsers();
      await refreshSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Role permission update failed");
    }
  }

  function toggleRolePermission(roleId: string, permission: string) {
    setRolePermissionDrafts((current) => {
      const next = new Set(current[roleId] ?? []);
      if (next.has(permission)) {
        next.delete(permission);
      } else {
        next.add(permission);
      }
      return { ...current, [roleId]: Array.from(next).sort() };
    });
  }

  function toggleRoleExpanded(roleId: string) {
    setExpandedRoleIds((current) =>
      current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId]
    );
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

  async function sendTestEmail() {
    setEmailTestResult(null);
    setEmailTesting(true);
    try {
      const result = await api<{ ok: boolean; latencyMs: number; message?: string }>("/api/admin/email-settings/test", {
        method: "POST",
        body: JSON.stringify({ recipient: emailTestRecipient })
      });
      setEmailTestResult({ ok: result.ok ?? true, latencyMs: result.latencyMs, message: result.message ?? `Test email sent to ${emailTestRecipient}.` });
    } catch (err) {
      setEmailTestResult({ ok: false, latencyMs: 0, message: err instanceof Error ? err.message : "Test failed" });
    } finally {
      setEmailTesting(false);
    }
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

  async function checkUpdates() {
    setError("");
    setCheckingUpdates(true);
    try {
      const payload = await api<{ update: UpdateStatus; job: UpdateJob | null }>("/api/admin/updates/check", {
        method: "POST"
      });
      setUpdateStatus(payload.update);
      setUpdateJob(payload.job);
      if (payload.update.latestVersion) setUpdateVersion(payload.update.latestVersion);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update check failed");
    } finally {
      setCheckingUpdates(false);
    }
  }

  async function startAudityUpdate() {
    setError("");
    try {
      const payload = await api<{ job: UpdateJob }>("/api/admin/updates/run", {
        method: "POST",
        body: JSON.stringify({ version: updateVersion || updateStatus?.latestVersion || undefined })
      });
      setUpdateJob(payload.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update start failed");
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
          <div className="audity-page-header">
            <p className="audity-page-kicker">Administration</p>
            <h1 className="audity-page-title">{title}</h1>
          </div>
          {error ? <div className="mb-4 rounded-audity border border-audity-error bg-audity-error/10 px-3 py-2 text-sm text-audity-error">{error}</div> : null}
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
                <label key={key} className="block text-xs font-medium text-audity-secondary">
                  {label}
                  <input
                    className="mt-2 h-9 w-40 rounded-audity border border-audity-border bg-audity-page px-3 text-sm normal-case text-audity-text outline-none focus:border-audity-primary"
                    type={key.startsWith("date") ? "date" : "text"}
                    value={filters[key as keyof typeof filters]}
                    onChange={(event) => setFilters({ ...filters, [key]: event.target.value })}
                  />
                </label>
              ))}
              <button className="audity-btn-primary" onClick={() => void loadActivity()}>
                Apply
              </button>
              <button className="audity-btn-secondary" onClick={() => void exportCsv(`/api/admin/activity-logs/export${queryString(filters)}`, "audity-activity-logs.csv")}>
                Export
              </button>
              <button className="audity-btn-secondary" onClick={() => void verifyHashChain()}>
                Verify Hash
              </button>
              {verify ? (
                <span className={`rounded-audity border px-3 py-2 text-sm ${verify.valid ? "border-audity-success text-audity-success" : "border-audity-error text-audity-error"}`}>
                  {verify.valid ? `valid: true (${verify.checked})` : `broken: ${verify.brokenAt}`}
                </span>
              ) : null}
            </div>
            <div className="grid min-w-0 gap-3 2xl:grid-cols-[minmax(0,1fr)_320px]">
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
                      <p className="mb-1 text-xs font-medium text-audity-muted">Before</p>
                      <pre className="max-h-48 overflow-auto rounded-audity border border-audity-border bg-audity-panel p-3 text-xs text-audity-secondary">{jsonBlock(selectedLog.before)}</pre>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-audity-muted">After</p>
                      <pre className="max-h-48 overflow-auto rounded-audity border border-audity-border bg-audity-panel p-3 text-xs text-audity-secondary">{jsonBlock(selectedLog.after)}</pre>
                    </div>
                  </div>
                ) : <p className="text-sm text-audity-muted">No event selected</p>}
              </aside>
            </div>
          </section>
          ) : null}
          {section === "audit" ? (
          <div className="grid gap-3">
            <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <h2 className="text-lg font-semibold">Security Audit Log</h2>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="block text-xs font-medium text-audity-secondary">
                    Action
                    <input className="mt-2 w-44 audity-input" value={auditFilters.action} onChange={(event) => setAuditFilters({ ...auditFilters, action: event.target.value })} />
                  </label>
                  <label className="block text-xs font-medium text-audity-secondary">
                    From
                    <input className="mt-2 audity-input" type="date" value={auditFilters.dateFrom} onChange={(event) => setAuditFilters({ ...auditFilters, dateFrom: event.target.value })} />
                  </label>
                  <label className="block text-xs font-medium text-audity-secondary">
                    To
                    <input className="mt-2 audity-input" type="date" value={auditFilters.dateTo} onChange={(event) => setAuditFilters({ ...auditFilters, dateTo: event.target.value })} />
                  </label>
                  <button className="audity-btn-primary" onClick={() => void loadAudit()}>
                    Apply
                  </button>
                  {can("auditlog.view") ? <button className="audity-btn-secondary" onClick={() => void exportCsv("/api/admin/audit-logs/export", "audity-audit-logs.csv")}>
                    Export
                  </button> : null}
                </div>
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
          <div className="grid gap-3">
            <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
              <h2 className="mb-4 text-lg font-semibold">User Management</h2>
              <div className="mb-4 grid gap-2 xl:grid-cols-2">
                {roles.map((role) => {
                  const expanded = expandedRoleIds.includes(role.id);
                  return (
                  <div key={role.id} className="rounded-audity border border-audity-border bg-audity-page p-3">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 text-left"
                      onClick={() => toggleRoleExpanded(role.id)}
                      aria-expanded={expanded}
                    >
                      <div>
                        <p className="text-sm font-semibold text-audity-text">{role.name}</p>
                        <p className="mt-1 text-xs text-audity-muted">{rolePermissionDrafts[role.id]?.length ?? 0} permissions active</p>
                      </div>
                      <span className="rounded-audity border border-audity-borderStrong px-2 py-1 text-xs text-audity-primary">
                        {expanded ? "Collapse" : "Edit rights"}
                      </span>
                    </button>
                    {expanded ? (
                    <div className="mt-3 border-t border-audity-border pt-3">
                      <div className="mb-3 flex justify-end">
                        <button className="audity-btn-secondary px-2 py-1 text-xs" onClick={() => void saveRolePermissions(role)}>
                          Save rights
                        </button>
                      </div>
                      <div className="grid max-h-56 gap-1 overflow-auto rounded-audity border border-audity-border bg-audity-panel p-2 md:grid-cols-2">
                        {permissions.map((permission) => (
                          <label key={`${role.id}-${permission.id}`} className="flex items-center gap-2 text-xs text-audity-secondary">
                            <input
                              type="checkbox"
                              checked={(rolePermissionDrafts[role.id] ?? []).includes(permission.name)}
                              onChange={() => toggleRolePermission(role.id, permission.name)}
                            />
                            {permission.name}
                          </label>
                        ))}
                      </div>
                    </div>
                    ) : null}
                  </div>
                  );
                })}
              </div>
              {can("users.invite") ? <form className="mb-4 space-y-3" onSubmit={inviteUser}>
                <input className="audity-input" placeholder="Email" value={inviteForm.email} onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })} />
                <input className="audity-input" placeholder="Name" value={inviteForm.name} onChange={(event) => setInviteForm({ ...inviteForm, name: event.target.value })} />
                <select className="audity-input" value={inviteForm.role} onChange={(event) => setInviteForm({ ...inviteForm, role: event.target.value })}>
                  {roles.map((role) => <option key={role.id} value={role.name}>{role.name}</option>)}
                </select>
                <p className="text-xs text-audity-muted">A one-time password is generated automatically and shown once after the invite.</p>
                <button className="audity-btn-primary">Invite</button>
              </form> : null}
              <div className="space-y-2">
                {users.map((user) => (
                  <div key={user.id} className="rounded-audity border border-audity-border bg-audity-page p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{user.email}</p>
                        <p className="text-xs text-audity-muted">{user.name} · {user.status}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {can("roles.manage") ? (
                          <button
                            type="button"
                            className="audity-btn-secondary audity-btn-sm"
                            onClick={() => void resetUserPassword(user)}
                          >
                            Reset password
                          </button>
                        ) : null}
                        {can("users.disable") && user.status !== "disabled" ? (
                          <button
                            type="button"
                            className="audity-btn-secondary audity-btn-sm border-audity-error text-audity-error"
                            onClick={() => void updateUser(user, { status: "disabled" })}
                          >
                            Disable
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {can("roles.manage") ? <select className="audity-input bg-audity-panel" value={user.role} onChange={(event) => void updateUser(user, { role: event.target.value })}>
                      {roles.map((role) => <option key={role.id} value={role.name}>{role.name}</option>)}
                    </select> : null}
                  </div>
                ))}
              </div>
            </section>
          </div>
          ) : null}
          {section === "branding" ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <section className="audity-card">
                <form className="mb-4 flex flex-wrap items-center gap-3" onSubmit={(event) => void uploadLogo(event)}>
                  <input name="logo" type="file" accept="image/png,image/jpeg,image/svg+xml" className="text-sm text-audity-secondary" />
                  <button className="audity-btn-secondary">Upload logo</button>
                  {branding.logoFileName ? <span className="text-sm text-audity-secondary">{branding.logoFileName}</span> : null}
                </form>
                <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => void saveBranding(event)}>
                  {(["primaryColor", "secondaryColor", "accentColor"] as const).map((key) => (
                    <label key={key} className="text-xs font-medium text-audity-secondary">
                      {key}
                      <input type="color" className="mt-2 h-9 w-full rounded-audity border border-audity-border bg-audity-page" value={branding[key]} onChange={(event) => setBranding({ ...branding, [key]: event.target.value })} />
                    </label>
                  ))}
                  {(["headerText", "footerText", "confidentialityLabel", "watermark"] as const).map((key) => (
                    <label key={key} className="text-xs font-medium text-audity-secondary">
                      {key}
                      <input className="mt-2 audity-input" value={branding[key]} onChange={(event) => setBranding({ ...branding, [key]: event.target.value })} />
                    </label>
                  ))}
                  <div className="md:col-span-2">
                    <button className="audity-btn-primary">Save branding</button>
                  </div>
                </form>
              </section>
              <aside className="audity-card h-fit">
                <h3 className="audity-section-title text-sm">Where this shows up</h3>
                <ul className="mt-3 space-y-3 text-xs text-audity-secondary">
                  <li>
                    <p className="font-semibold text-audity-text">Logo</p>
                    <p>Login screen, top-bar (replaces the wordmark), generated PDF reports, secure report download page, email templates.</p>
                  </li>
                  <li>
                    <p className="font-semibold text-audity-text">Primary color</p>
                    <p>Main accent — buttons, active navigation, link underlines, progress bars, focus rings.</p>
                  </li>
                  <li>
                    <p className="font-semibold text-audity-text">Secondary color</p>
                    <p>Section dividers and chart secondary series in dashboards and reports.</p>
                  </li>
                  <li>
                    <p className="font-semibold text-audity-text">Accent color</p>
                    <p>Highlight badges and the user-uploaded customer pill in the top bar.</p>
                  </li>
                  <li>
                    <p className="font-semibold text-audity-text">Header / footer text</p>
                    <p>Top and bottom rows of every generated PDF report, plus the secure download landing page.</p>
                  </li>
                  <li>
                    <p className="font-semibold text-audity-text">Confidentiality label</p>
                    <p>Appears as a red ribbon on report cover pages and as a footer tag on each page.</p>
                  </li>
                  <li>
                    <p className="font-semibold text-audity-text">Watermark</p>
                    <p>Semi-transparent diagonal text rendered behind PDF report content (e.g. "Confidential — Draft").</p>
                  </li>
                </ul>
                <div className="mt-4 rounded-audity-md border border-audity-border bg-audity-page p-3">
                  <p className="text-xs font-semibold text-audity-text">Live preview</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="inline-block h-6 w-6 rounded-audity" style={{ background: branding.primaryColor }} />
                    <span className="inline-block h-6 w-6 rounded-audity" style={{ background: branding.secondaryColor }} />
                    <span className="inline-block h-6 w-6 rounded-audity" style={{ background: branding.accentColor }} />
                  </div>
                  <p className="mt-2 text-[11px] text-audity-muted break-all">{branding.headerText || "—"}</p>
                </div>
              </aside>
            </div>
          ) : null}
          {section === "email" ? (
            <div className="grid min-w-0 gap-3">
              <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
                <h2 className="mb-4 text-lg font-semibold">SMTP Configuration</h2>
                <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => void saveEmailSettings(event)}>
                  <input className="audity-input" placeholder="SMTP host" value={emailSettings.smtpHost} onChange={(event) => setEmailSettings({ ...emailSettings, smtpHost: event.target.value })} />
                  <input className="audity-input" type="number" placeholder="Port" value={emailSettings.smtpPort} onChange={(event) => setEmailSettings({ ...emailSettings, smtpPort: Number(event.target.value) })} />
                  <input className="audity-input" placeholder="SMTP user" value={emailSettings.smtpUser} onChange={(event) => setEmailSettings({ ...emailSettings, smtpUser: event.target.value })} />
                  <input className="audity-input" type="password" placeholder={emailSettings.hasPassword ? "Password saved" : "SMTP password"} value={emailSettings.smtpPassword ?? ""} onChange={(event) => setEmailSettings({ ...emailSettings, smtpPassword: event.target.value })} />
                  <input className="audity-input" placeholder="Sender" value={emailSettings.sender} onChange={(event) => setEmailSettings({ ...emailSettings, sender: event.target.value })} />
                  <label className="flex h-9 items-center gap-2 text-sm text-audity-secondary">
                    <input type="checkbox" checked={emailSettings.smtpTls} onChange={(event) => setEmailSettings({ ...emailSettings, smtpTls: event.target.checked })} />
                    TLS
                  </label>
                  <button className="audity-btn-primary">Save email settings</button>
                </form>
                <div className="mt-5 border-t border-audity-border pt-4">
                  <h3 className="audity-section-title text-sm">Test connection</h3>
                  <p className="mt-1 text-xs text-audity-secondary">
                    Audity will connect to your SMTP server, verify the handshake and send one short test email.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      type="email"
                      className="audity-input max-w-xs"
                      placeholder="recipient@example.com"
                      value={emailTestRecipient}
                      onChange={(event) => setEmailTestRecipient(event.target.value)}
                    />
                    <button
                      type="button"
                      className="audity-btn-secondary audity-btn-sm"
                      disabled={emailTesting || !emailTestRecipient}
                      onClick={() => void sendTestEmail()}
                    >
                      {emailTesting ? "Sending test…" : "Send test email"}
                    </button>
                  </div>
                  {emailTestResult ? (
                    <div className={`mt-3 rounded-audity border px-3 py-2 text-sm ${emailTestResult.ok ? "border-audity-success bg-audity-success/10 text-audity-success" : "border-audity-error bg-audity-error/10 text-audity-error"}`}>
                      <p className="font-semibold">{emailTestResult.ok ? "✓ Test succeeded" : "✗ Test failed"}{emailTestResult.latencyMs ? ` (${emailTestResult.latencyMs} ms)` : ""}</p>
                      <p className="mt-1 text-xs">{emailTestResult.message}</p>
                    </div>
                  ) : null}
                </div>
              </section>
              <EmailSubscriptionsCard />
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
            <div className="grid gap-3">
              <ServerStatusCard />
              <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-audity-border pb-3">
                  <div>
                    <p className="text-xs font-medium text-audity-muted">System Updates</p>
                    <h2 className="mt-1 text-lg font-semibold">Audity Update Panel</h2>
                    <p className="mt-1 text-sm text-audity-secondary">
                      Updates are checked only against the production branch and installed by the server-side updater.
                    </p>
                  </div>
                  <span className={`rounded-audity border px-3 py-1 text-xs font-semibold ${
                    updateStatus?.updateAvailable
                      ? "border-audity-warning bg-audity-warning/10 text-audity-warning"
                      : "border-audity-border bg-audity-page text-audity-secondary"
                  }`}>
                    {updateStatus?.updateAvailable ? "Update available" : "Up to date"}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      ["Installed", updateStatus?.currentVersion ?? "Unknown", `Image tag ${updateStatus?.configuredImageTag ?? "unknown"}`],
                      ["Latest", updateStatus?.latestVersion ?? "Not checked", `${updateStatus?.updateBranch ?? "production"} branch`],
                      ["Channel", updateStatus?.updateChannel ?? "production", updateStatus?.imageRegistry ?? "Unknown"],
                      ["Updater", updateStatus?.updaterConfigured ? "Configured" : "Not configured", updateJob?.status ? `Job ${updateJob.status}` : "No active job"]
                    ].map(([label, value, detail]) => (
                      <div key={label} className="rounded-audity border border-audity-border bg-audity-page p-3">
                        <p className="text-xs font-medium text-audity-muted">{label}</p>
                        <p className="mt-2 truncate text-sm font-semibold text-audity-text">{value}</p>
                        <p className="mt-1 truncate text-xs text-audity-secondary">{detail}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col gap-3 rounded-audity border border-audity-border bg-audity-page p-3 sm:flex-row sm:items-end xl:flex-col xl:items-stretch">
                    <label className="block min-w-0 flex-1 text-xs font-medium text-audity-secondary">
                      Target version
                      <input
                        className="mt-2 audity-input"
                        value={updateVersion}
                        placeholder={updateStatus?.latestVersion ?? "1.4.0"}
                        onChange={(event) => setUpdateVersion(event.target.value)}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="audity-btn-secondary"
                        disabled={checkingUpdates}
                        onClick={() => void checkUpdates()}
                      >
                        {checkingUpdates ? (
                          <>
                            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                              <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
                              <path d="M21 12a9 9 0 0 0-9-9" />
                            </svg>
                            Checking for updates…
                          </>
                        ) : "Check for updates"}
                      </button>
                      <button
                        type="button"
                        className="audity-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!updateStatus?.updaterConfigured || updateJob?.status === "running"}
                        onClick={() => void startAudityUpdate()}
                      >
                        Start update
                      </button>
                    </div>
                  </div>
                </div>
                {updateStatus?.checkedAt ? (
                  <p className="mt-3 text-xs text-audity-muted">Last checked {new Date(updateStatus.checkedAt).toLocaleString()}</p>
                ) : null}
                {updateStatus?.checkError ? (
                  <p className="mt-2 rounded-audity border border-audity-error/40 bg-audity-error/10 px-3 py-2 text-xs text-audity-error">
                    {updateStatus.checkError}
                  </p>
                ) : null}
                {updateJob ? <UpdateJobProgress job={updateJob} /> : null}
              </section>
              <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
                <form className="max-w-md space-y-3" onSubmit={saveSystemSettings}>
                  <label className="block text-xs font-medium text-audity-secondary">
                    Session idle timeout
                    <select
                      className="mt-2 audity-input"
                      value={systemSettings.sessionIdleTimeoutMinutes}
                      onChange={(event) => setSystemSettings({ sessionIdleTimeoutMinutes: Number(event.target.value) })}
                    >
                      {Array.from({ length: 12 }, (_, index) => (index + 1) * 5).map((minutes) => (
                        <option key={minutes} value={minutes}>{minutes} minutes</option>
                      ))}
                    </select>
                  </label>
                  <button className="audity-btn-primary">
                    Save system settings
                  </button>
                </form>
              </section>
              {systemMonitor ? (
                <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-audity-border pb-3">
                    <div>
                      <p className="text-xs font-medium text-audity-muted">Admin System Monitor</p>
                      <h2 className="mt-1 text-lg font-semibold">Docker / Server Status</h2>
                      <p className="mt-1 text-xs text-audity-secondary">
                        {systemMonitor.snapshot.hostname} · {systemMonitor.snapshot.serverIp} · Uptime {formatUptime(systemMonitor.snapshot.uptimeSeconds)}
                      </p>
                    </div>
                    <div className="flex rounded-audity border border-audity-border bg-audity-page p-1">
                      {rangeOptions.map((option) => (
                        <button
                          key={option}
                          className={`h-8 rounded-audity px-3 text-sm ${
                            systemRange === option ? "bg-audity-primary text-white" : "text-audity-secondary hover:text-audity-text"
                          }`}
                          onClick={() => setSystemRange(option)}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Metric label="CPU" value={systemMonitor.snapshot.cpuPercent} detail={`Load on ${systemMonitor.snapshot.hostname}`} />
                    <Metric
                      label="RAM"
                      value={systemMonitor.snapshot.memoryPercent}
                      detail={`${formatBytes(systemMonitor.snapshot.memoryUsedBytes)} / ${formatBytes(systemMonitor.snapshot.memoryTotalBytes)}`}
                    />
                    <Metric
                      label="Storage"
                      value={systemMonitor.snapshot.storagePercent}
                      detail={`${formatBytes(systemMonitor.snapshot.storageUsedBytes)} / ${formatBytes(systemMonitor.snapshot.storageTotalBytes)}`}
                    />
                  </div>
                  <div className="mt-3 grid min-w-0 gap-3 2xl:grid-cols-[300px_minmax(0,1fr)]">
                    <div className="rounded-audity border border-audity-border bg-audity-page p-3">
                      <p className="mb-2 text-xs font-medium text-audity-muted">System Problems</p>
                      {systemMonitor.snapshot.issues.length ? (
                        <div className="space-y-2">
                          {systemMonitor.snapshot.issues.map((issue) => (
                            <div key={issue} className="rounded-audity border border-audity-error bg-audity-error/10 px-3 py-2 text-sm text-audity-error">
                              {issue}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="rounded-audity border border-audity-border bg-audity-panel px-3 py-6 text-center text-sm text-audity-muted">
                          No system problems detected
                        </p>
                      )}
                    </div>
                    <div className="rounded-audity border border-audity-border bg-audity-page p-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-xs font-medium text-audity-muted">Server Timeline</p>
                        <span className="text-xs text-audity-secondary">{systemMonitor.timeline.length} samples</span>
                      </div>
                      <div className="flex h-28 items-end gap-1 overflow-hidden rounded-audity border border-audity-border bg-audity-panel p-2">
                        {systemMonitor.timeline.map((sample) => (
                          <div
                            key={sample.createdAt}
                            className={sample.status === "online" ? "flex-1 bg-audity-primary" : "flex-1 bg-[#FF4B00]"}
                            title={`${new Date(sample.createdAt).toLocaleString()} · ${sample.status} · CPU ${sample.cpuPercent}% · RAM ${sample.memoryPercent}% · Storage ${sample.storagePercent}% · ${sample.serverIp}`}
                            style={{ height: `${Math.max(8, sample.cpuPercent)}%` }}
                          />
                        ))}
                        {!systemMonitor.timeline.length ? (
                          <p className="m-auto text-sm text-audity-muted">No timeline samples yet</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}
          {section === "backup" ? (
            <div className="grid min-w-0 gap-3 2xl:grid-cols-[300px_minmax(0,1fr)]">
              <div className="space-y-3">
                <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
                  <h2 className="mb-4 text-lg font-semibold">Manual Backup</h2>
                  {user?.role === "Instance Admin" ? <form className="space-y-3" onSubmit={(event) => void triggerBackup(event)}>
                    <label className="block text-xs font-medium text-audity-secondary">
                      Backup Type
                      <select className="mt-2 audity-input" value={backupType} onChange={(event) => setBackupType(event.target.value as typeof backupType)}>
                        <option value="full">Full</option>
                        <option value="database">Database</option>
                        <option value="evidence">Evidence</option>
                      </select>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button className="audity-btn-primary">
                        Trigger backup
                      </button>
                      <button type="button" className="audity-btn-secondary" onClick={() => void triggerDownloadBackup()}>
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
                    <label className="block text-xs font-medium text-audity-secondary">
                      Schedule
                      <input className="mt-2 audity-input" value={backupSettings.scheduleCron} onChange={(event) => setBackupSettings({ ...backupSettings, scheduleCron: event.target.value })} />
                    </label>
                    <label className="block text-xs font-medium text-audity-secondary">
                      Retention days
                      <input className="mt-2 audity-input" type="number" min={1} max={3650} value={backupSettings.retentionDays} onChange={(event) => setBackupSettings({ ...backupSettings, retentionDays: Number(event.target.value) })} />
                    </label>
                    <button className="audity-btn-primary">
                      Save schedule
                    </button>
                  </form>
                </section>
                <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
                  <h2 className="mb-4 text-lg font-semibold">Restore Precheck</h2>
                  <form className="space-y-3" onSubmit={(event) => void runRestorePrecheck(event)}>
                    <label className="block text-xs font-medium text-audity-secondary">
                      Backup
                      <select className="mt-2 audity-input" value={restoreBackupId} onChange={(event) => setRestoreBackupId(event.target.value)}>
                        {backupJobs.map((job) => (
                          <option key={job.id} value={job.id}>{job.jobType} - {job.status}</option>
                        ))}
                      </select>
                    </label>
                    <button className="audity-btn-secondary">
                      Run precheck
                    </button>
                    {restorePrecheck ? <pre className="max-h-48 overflow-auto rounded-audity bg-audity-page p-3 text-xs text-audity-secondary">{jsonBlock(restorePrecheck)}</pre> : null}
                  </form>
                  <div className="mt-4 border-t border-audity-border pt-4">
                    <label className="block text-xs font-medium text-audity-secondary">
                      Confirm Full Restore
                      <span className="mt-1 block text-[11px] font-normal normal-case text-audity-muted">
                        Type the exact phrase <code className="font-mono">RESTORE AUDITY</code> to enable the restore button. The phrase stays in English as a safety guard against accidental clicks during a localized session.
                      </span>
                      <input
                        className="mt-2 audity-input"
                        placeholder="RESTORE AUDITY"
                        value={restoreConfirmation}
                        onChange={(event) => setRestoreConfirmation(event.target.value)}
                      />
                    </label>
                    <button
                      className="mt-3 audity-btn-secondary border-audity-error bg-audity-error/10 font-semibold text-audity-error"
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
                  <button className="audity-btn-secondary" onClick={() => void loadBackup()}>
                    Refresh
                  </button>
                </div>
                <div className="space-y-2">
                  {backupJobs.map((job) => (
                    <div key={job.id} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-audity-primary">{job.jobType} <span className="text-xs font-normal text-audity-muted">{job.source ?? "manual"}</span></p>
                        <span className="rounded-audity border border-audity-borderStrong px-2 py-1 text-xs text-audity-secondary">{job.status}</span>
                      </div>
                      <p className="mt-1 text-xs text-audity-secondary">
                        Started: {job.startedAt ? new Date(job.startedAt).toLocaleString() : "-"} | Completed: {job.completedAt ? new Date(job.completedAt).toLocaleString() : "-"}
                      </p>
                      <p className="mt-1 text-xs text-audity-muted">
                        Objects: {Array.isArray(job.metadata?.objects) ? job.metadata.objects.length : 0}
                      </p>
                      {job.failureReason ? <p className="mt-1 text-xs text-audity-error">{job.failureReason}</p> : null}
                      {job.isDownloadableZip ? (
                        <button className="mt-2 audity-btn-secondary px-3 py-1 text-xs" onClick={() => void downloadBackup(job)} disabled={job.status !== "completed"}>
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
          <div data-marker="otp-modal-anchor" hidden />
          {oneTimePassword ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
              <div className="audity-card max-w-md w-full shadow-audity-raised">
                <h2 className="text-lg font-semibold text-audity-text">{oneTimePassword.action} — copy now</h2>
                <p className="mt-2 text-sm text-audity-secondary">
                  The one-time password for <strong>{oneTimePassword.email}</strong> is shown below.
                  It will <strong>never be shown again</strong>. Copy and deliver it via a secure channel.
                </p>
                <div className="mt-4 rounded-audity border border-audity-borderStrong bg-audity-panelAlt p-3 font-mono text-sm break-all select-all">
                  {oneTimePassword.password}
                </div>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="audity-btn-soft"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(oneTimePassword.password);
                        setCopiedPassword(true);
                        window.setTimeout(() => setCopiedPassword(false), 2000);
                      } catch {
                        setError("Copy to clipboard failed — please select the password manually.");
                      }
                    }}
                  >
                    {copiedPassword ? "✓ Copied" : "Copy to clipboard"}
                  </button>
                  <button
                    type="button"
                    className="audity-btn-primary"
                    onClick={() => { setOneTimePassword(null); setCopiedPassword(false); }}
                  >
                    I've saved it
                  </button>
                </div>
              </div>
            </div>
          ) : null}
    </>
  );
}

type SystemInfo = {
  hostname: string;
  platform: string;
  release: string;
  arch: string;
  nodeVersion: string;
  uptimeSeconds: number;
  publicUrl: string | null;
  loadAverage: number[];
  cpuCount: number;
  memory: { totalMb: number; freeMb: number; usedPct: number };
  networkAddresses: Array<{ iface: string; family: string; address: string; internal: boolean }>;
};

type RecoveryFingerprintInfo = {
  fingerprint: string;
  fingerprintShort: string;
  setupAt: string;
  acknowledgedAt: string | null;
};

type UpdatePhase = {
  match: RegExp;
  label: string;
  progress: number;
};

const UPDATE_PHASES: UpdatePhase[] = [
  { match: /^Audity image update/i,             label: "Initialising",                 progress: 5 },
  { match: /Capturing current running images/i, label: "Capturing rollback snapshot",  progress: 15 },
  { match: /Pulling target images/i,            label: "Pulling target images",        progress: 30 },
  { match: /Running migration and seed/i,       label: "Running database migration",   progress: 55 },
  { match: /Restarting Audity application/i,    label: "Restarting services",          progress: 75 },
  { match: /Checking service health/i,          label: "Health-checking services",     progress: 90 },
  { match: /Audity update is complete/i,        label: "Done",                         progress: 100 }
];

function derivePhase(job: UpdateJob): { label: string; progress: number; failed: boolean } {
  const failed = job.status === "failed" || (job.exitCode !== null && job.exitCode !== 0);
  if (job.status === "succeeded" || (job.exitCode === 0 && job.status !== "running")) {
    return { label: "Done", progress: 100, failed: false };
  }
  let best: UpdatePhase | null = null;
  for (const line of job.log) {
    for (const phase of UPDATE_PHASES) {
      if (phase.match.test(line)) {
        if (!best || phase.progress > best.progress) best = phase;
      }
    }
  }
  if (failed) {
    return {
      label: best ? `Failed during: ${best.label}` : "Failed",
      progress: best?.progress ?? 0,
      failed: true
    };
  }
  if (!best) {
    return { label: job.status === "running" ? "Starting…" : "Waiting", progress: 2, failed: false };
  }
  // If the last matched phase has progress=100 but the job is still running,
  // cap at 95 so the bar visibly finishes only when the job actually does.
  if (job.status === "running" && best.progress >= 100) {
    return { label: "Finalising", progress: 95, failed: false };
  }
  return { label: best.label, progress: best.progress, failed: false };
}

function UpdateJobProgress({ job }: { job: UpdateJob }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const phase = derivePhase(job);
  const errorLines = job.log.filter((line) => /error|failed|fatal/i.test(line));
  const logText = job.log.join("\n");

  async function copyLog(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore — older browsers without clipboard API */
    }
  }

  const barColour =
    phase.failed
      ? "bg-audity-error"
      : phase.progress >= 100
      ? "bg-audity-success"
      : "bg-audity-primary";
  const showStripes = job.status === "running" && !phase.failed;

  return (
    <div className="mt-3 rounded-audity border border-audity-border bg-audity-page p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-audity-muted">
            Update progress · {job.status}
            {job.exitCode !== null ? ` · exit ${job.exitCode}` : ""}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-audity-text">{phase.label}</p>
        </div>
        <span className="text-xs text-audity-secondary">
          {job.startedAt ? new Date(job.startedAt).toLocaleTimeString() : "Not started"}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-audity-app">
        <div
          className={`h-full transition-all duration-500 ease-out ${barColour} ${
            showStripes ? "audity-update-bar-stripes" : ""
          }`}
          style={{ width: `${Math.max(2, Math.min(100, phase.progress))}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-audity-muted">
        <span>{Math.round(phase.progress)}%</span>
        <button
          type="button"
          className="font-medium text-audity-secondary underline-offset-2 hover:underline"
          onClick={() => setDetailsOpen((value) => !value)}
        >
          {detailsOpen ? "Hide details" : "Show details"}
        </button>
      </div>
      {phase.failed && errorLines.length > 0 ? (
        <div className="mt-2 rounded-audity border border-audity-error/40 bg-audity-error/10 p-2 text-xs text-audity-error">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-semibold">Errors detected</span>
            <button
              type="button"
              className="underline-offset-2 hover:underline"
              onClick={() => void copyLog(errorLines.join("\n"))}
            >
              {copied ? "Copied!" : "Copy errors"}
            </button>
          </div>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
            {errorLines.join("\n")}
          </pre>
        </div>
      ) : null}
      {detailsOpen ? (
        <div className="mt-2 rounded-audity border border-audity-border bg-audity-app p-2">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium text-audity-muted">Full update log</span>
            <button
              type="button"
              className="text-audity-secondary underline-offset-2 hover:underline"
              onClick={() => void copyLog(logText)}
            >
              {copied ? "Copied!" : "Copy log"}
            </button>
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-audity-secondary">
            {logText || "No update log yet."}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function ServerStatusCard() {
  const api = useApi();
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [fingerprint, setFingerprint] = useState<RecoveryFingerprintInfo | null>(null);
  const [error, setError] = useState("");
  const [acknowledging, setAcknowledging] = useState(false);

  const acknowledgePhrase = async () => {
    setAcknowledging(true);
    try {
      const result = await api<{ acknowledgedAt: string | null }>("/api/auth/recovery-phrase/acknowledge", {
        method: "POST"
      });
      setFingerprint((prev) => (prev ? { ...prev, acknowledgedAt: result.acknowledgedAt } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not acknowledge the recovery phrase.");
    } finally {
      setAcknowledging(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const payload = await api<SystemInfo>("/api/admin/system-info");
        if (!cancelled) setInfo(payload);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      }
      try {
        const fp = await api<RecoveryFingerprintInfo>("/api/auth/recovery-phrase/fingerprint");
        if (!cancelled) setFingerprint(fp);
      } catch {
        /* fingerprint is best-effort */
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 10000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [api]);

  if (error) {
    return <div className="audity-card text-sm text-audity-error">Server info unavailable: {error}</div>;
  }
  if (!info) {
    return <div className="audity-card text-sm text-audity-muted">Loading server status…</div>;
  }

  const uptime = (() => {
    const s = info.uptimeSeconds;
    const days = Math.floor(s / 86400);
    const hrs = Math.floor((s % 86400) / 3600);
    const mins = Math.floor((s % 3600) / 60);
    if (days) return `${days}d ${hrs}h ${mins}m`;
    if (hrs) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  })();

  return (
    <section className="audity-card">
      <h2 className="audity-section-title">Server status</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <InfoMetric label="Hostname" value={info.hostname} />
        <InfoMetric label="Public URL" value={info.publicUrl ?? "—"} />
        <InfoMetric label="Uptime" value={uptime} />
        <InfoMetric label="Platform" value={`${info.platform} ${info.release} · ${info.arch}`} />
        <InfoMetric label="Node" value={info.nodeVersion} />
        <InfoMetric label="CPU cores" value={String(info.cpuCount)} />
        <InfoMetric label="Load average" value={info.loadAverage.join(" / ")} />
        <InfoMetric label="Memory" value={`${info.memory.usedPct}% of ${(info.memory.totalMb / 1024).toFixed(1)} GB`} />
      </div>
      <div className="mt-4">
        <p className="audity-label">Network interfaces</p>
        <div className="mt-1 space-y-1 text-sm">
          {info.networkAddresses.length === 0 ? (
            <p className="text-audity-muted">No external interfaces detected.</p>
          ) : (
            info.networkAddresses.map((nic) => (
              <div key={`${nic.iface}-${nic.address}`} className="flex items-center gap-3 rounded-audity border border-audity-border bg-audity-page px-3 py-2 font-mono text-xs">
                <span className="text-audity-muted">{nic.iface}</span>
                <span className="text-audity-secondary">{nic.family}</span>
                <span className="font-semibold text-audity-text">{nic.address}</span>
              </div>
            ))
          )}
        </div>
      </div>
      {fingerprint ? (
        <div className="mt-4 rounded-audity border border-audity-border bg-audity-page p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="audity-label">Encryption-key fingerprint</p>
              <p className="mt-1 font-mono text-sm text-audity-text">{fingerprint.fingerprintShort}</p>
            </div>
            <div className="text-right text-xs">
              {fingerprint.acknowledgedAt ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-audity-success/30 bg-audity-success/10 px-2 py-0.5 text-audity-success">
                  Phrase acknowledged
                </span>
              ) : (
                <div className="flex flex-col items-end gap-1">
                  <span className="inline-flex items-center gap-1 rounded-full border border-audity-warning/30 bg-audity-warning/10 px-2 py-0.5 text-audity-warning">
                    Phrase not yet saved
                  </span>
                  <button
                    type="button"
                    className="audity-btn-secondary audity-btn-sm"
                    onClick={acknowledgePhrase}
                    disabled={acknowledging}
                  >
                    {acknowledging ? "Saving…" : "Mark phrase as saved"}
                  </button>
                </div>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-audity-secondary">
            Compare this fingerprint against the one you stored with your recovery phrase to confirm the
            instance is still using the same encryption key. Run{" "}
            <code className="font-mono text-xs">docker exec audity-api node apps/api/dist/scripts/printRecoveryPhrase.js</code>{" "}
            on the host to re-display the full phrase.
          </p>
        </div>
      ) : null}
    </section>
  );
}

type EmailTopic = {
  id: string;
  label: string;
  description: string;
  defaultRoles: string[];
  variables: string[];
};
type EmailSubscription = {
  topic: string;
  roles: string[];
  extraEmails: string[];
  enabled: boolean;
  updatedAt: string;
};

const KNOWN_ROLES = ["Instance Admin", "Tenant Admin", "Assessment Manager", "Auditor", "Reviewer", "Viewer"];

function EmailSubscriptionsCard() {
  const api = useApi();
  const [topics, setTopics] = useState<EmailTopic[]>([]);
  const [subs, setSubs] = useState<Record<string, EmailSubscription>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void api<{ topics: EmailTopic[]; subscriptions: EmailSubscription[] }>("/api/admin/email-subscriptions")
      .then((payload) => {
        if (cancelled) return;
        setTopics(payload.topics);
        const map: Record<string, EmailSubscription> = {};
        for (const sub of payload.subscriptions) map[sub.topic] = sub;
        setSubs(map);
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load"); });
    return () => { cancelled = true; };
  }, [api]);

  function update(topicId: string, patch: Partial<EmailSubscription>) {
    setSubs((current) => ({ ...current, [topicId]: { ...current[topicId], ...patch, topic: topicId } as EmailSubscription }));
  }

  async function save(topicId: string) {
    setSavingId(topicId);
    setError("");
    try {
      const sub = subs[topicId];
      await api("/api/admin/email-subscriptions", {
        method: "PUT",
        body: JSON.stringify({
          topic: topicId,
          roles: sub.roles,
          extraEmails: sub.extraEmails,
          enabled: sub.enabled
        })
      });
      setSavedId(topicId);
      window.setTimeout(() => setSavedId(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingId(null);
    }
  }

  if (topics.length === 0 && !error) {
    return <div className="audity-card text-sm text-audity-muted">Loading email subscriptions…</div>;
  }

  const roleOptions = KNOWN_ROLES.map((role) => ({ value: role, label: role }));

  return (
    <section className="audity-card">
      <h2 className="audity-section-title">Email notification</h2>
      <p className="mt-1 text-xs text-audity-secondary">
        Choose which roles receive an email per event. Members of a role get the email if they are
        active and have a valid address. Extra recipients are individual addresses without a user
        account (comma-separated).
      </p>
      {error ? (
        <div className="mt-3 rounded-audity border border-audity-error bg-audity-error/10 px-3 py-2 text-sm text-audity-error">
          {error}
        </div>
      ) : null}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[860px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-audity-muted">
              <th className="border-b border-audity-border px-3 py-2 font-medium" style={{ width: "32%" }}>
                Event
              </th>
              <th className="border-b border-audity-border px-3 py-2 font-medium" style={{ width: "8%" }}>
                On
              </th>
              <th className="border-b border-audity-border px-3 py-2 font-medium" style={{ width: "28%" }}>
                Roles
              </th>
              <th className="border-b border-audity-border px-3 py-2 font-medium" style={{ width: "24%" }}>
                Extra recipients
              </th>
              <th className="border-b border-audity-border px-3 py-2 font-medium" style={{ width: "8%" }}>
                {/* save column */}
              </th>
            </tr>
          </thead>
          <tbody>
            {topics.map((topic) => {
              const sub = subs[topic.id];
              if (!sub) return null;
              return (
                <tr key={topic.id} className="align-top">
                  <td className="border-b border-audity-border px-3 py-3">
                    <div className="font-semibold text-audity-text">{topic.label}</div>
                    <div className="mt-0.5 text-xs text-audity-secondary">{topic.description}</div>
                    {topic.variables.length ? (
                      <div className="mt-1 text-[11px] text-audity-muted">
                        Variables: {topic.variables.join(", ")}
                      </div>
                    ) : null}
                  </td>
                  <td className="border-b border-audity-border px-3 py-3">
                    <label className="inline-flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={sub.enabled}
                        onChange={(event) => update(topic.id, { enabled: event.target.checked })}
                      />
                    </label>
                  </td>
                  <td className="border-b border-audity-border px-3 py-3">
                    <MultiCombobox
                      options={roleOptions}
                      value={sub.roles}
                      onChange={(roles) => update(topic.id, { roles })}
                      placeholder="Select roles…"
                      ariaLabel={`Roles for ${topic.label}`}
                    />
                  </td>
                  <td className="border-b border-audity-border px-3 py-3">
                    <input
                      type="text"
                      className="audity-input"
                      value={sub.extraEmails.join(", ")}
                      onChange={(event) =>
                        update(topic.id, {
                          extraEmails: event.target.value
                            .split(/[,\n]/)
                            .map((line) => line.trim())
                            .filter(Boolean)
                        })
                      }
                      placeholder="a@example.com, b@example.com"
                    />
                  </td>
                  <td className="border-b border-audity-border px-3 py-3 text-right">
                    {savedId === topic.id ? (
                      <span className="mr-2 text-xs text-audity-success">✓</span>
                    ) : null}
                    <button
                      type="button"
                      className="audity-btn-soft audity-btn-sm"
                      disabled={savingId === topic.id}
                      onClick={() => void save(topic.id)}
                    >
                      {savingId === topic.id ? "Saving…" : "Save"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function InfoMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-audity-md border border-audity-border bg-audity-page px-3 py-2">
      <p className="text-xs text-audity-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-audity-text break-all">{value}</p>
    </div>
  );
}
