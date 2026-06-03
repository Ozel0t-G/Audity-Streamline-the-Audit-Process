import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { BrandMark } from "../../components/BrandMark";
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

export function AdminDashboardPage() {
  const api = useApi();
  const { logout, accessToken } = useAuth();
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

  async function loadAll() {
    setError("");
    await Promise.all([loadActivity(), loadAudit(), loadUsers()]);
  }

  useEffect(() => {
    void loadAll().catch((err) => setError(err instanceof Error ? err.message : "Admin load failed"));
  }, []);

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

  return (
    <main className="min-h-screen bg-audity-app text-audity-text">
      <header className="flex h-12 items-center justify-between border-b border-audity-border bg-audity-topnav px-5">
        <div className="flex items-center gap-3">
          <BrandMark />
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
          <Link className="mt-1 block rounded-audity px-3 py-2 text-sm text-audity-secondary hover:bg-audity-panel" to="/frameworks">Framework Library</Link>
          <Link className="mt-1 block rounded-audity bg-audity-primaryActive px-3 py-2 text-sm font-semibold" to="/admin">Admin</Link>
        </aside>
        <section className="bg-audity-page p-5">
          <div className="mb-5 border-b border-audity-border pb-4">
            <p className="text-xs font-semibold uppercase text-audity-primary">Administration</p>
            <h1 className="mt-1 text-2xl font-semibold">Activity, Audit & Users</h1>
          </div>
          {error ? <div className="mb-4 rounded-audity border border-audity-error bg-[#2A1C17] px-3 py-2 text-sm text-[#FFB199]">{error}</div> : null}
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
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
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
        </section>
      </div>
    </main>
  );
}
