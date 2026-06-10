import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useApi } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { BrandMark } from "./BrandMark";

const navClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-audity px-3 py-2 text-sm ${
    isActive
      ? "bg-audity-primaryActive font-semibold text-audity-text"
      : "text-audity-secondary hover:bg-audity-panel hover:text-audity-text"
  }`;

const subNavClass = ({ isActive }: { isActive: boolean }) =>
  `ml-3 block rounded-audity px-3 py-2 text-sm ${
    isActive
      ? "bg-audity-primaryActive font-semibold text-audity-text"
      : "text-audity-secondary hover:bg-audity-panel hover:text-audity-text"
  }`;

function isAdminRole(role?: string) {
  return role === "Instance Admin" || role === "Tenant Admin";
}

function useIdleLogout() {
  const api = useApi();
  const { accessToken, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!accessToken) return;
    let timer: number | undefined;
    let cancelled = false;
    let timeoutMinutes = 30;
    const activityEvents = ["click", "keydown", "mousemove", "scroll", "touchstart"];

    const schedule = () => {
      if (cancelled) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        window.localStorage.setItem("audity_login_notice", "Your session timed out because of inactivity.");
        void logout().finally(() => navigate("/login", { replace: true }));
      }, Math.max(5, timeoutMinutes) * 60 * 1000);
    };

    const loadTimeout = async () => {
      const payload = await api<{ sessionIdleTimeoutMinutes: number }>("/api/system/session-timeout").catch(() => ({
        sessionIdleTimeoutMinutes: 30
      }));
      timeoutMinutes = payload.sessionIdleTimeoutMinutes;
      schedule();
    };

    void loadTimeout();
    activityEvents.forEach((eventName) => window.addEventListener(eventName, reset, { passive: true }));
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, reset));
    };

    function reset() {
      schedule();
    }
  }, [accessToken, api, logout, navigate]);
}

function TopBar({ adminMode = false }: { adminMode?: boolean }) {
  const { user, logout } = useAuth();
  const api = useApi();
  const navigate = useNavigate();
  const location = useLocation();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    title: string;
    message: string;
    customerId?: string | null;
    readAt?: string | null;
    createdAt: string;
  }>>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [customerLabel, setCustomerLabel] = useState("");
  const admin = isAdminRole(user?.role);
  const showCustomerContext =
    /^\/customers\/[0-9a-f-]{36}$/i.test(location.pathname) ||
    /^\/assessments\/[0-9a-f-]{36}\//i.test(location.pathname);

  function setCurrentCustomerLabel(label: string) {
    setCustomerLabel(label);
    if (label) {
      window.localStorage.setItem("audity_current_customer_label", label);
    } else {
      window.localStorage.removeItem("audity_current_customer_label");
    }
  }

  useEffect(() => {
    const handleContext = (event: Event) => {
      const nextLabel = (event as CustomEvent<string>).detail;
      setCurrentCustomerLabel(nextLabel);
    };
    window.addEventListener("audity-customer-context", handleContext);
    return () => window.removeEventListener("audity-customer-context", handleContext);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const customerMatch = location.pathname.match(/^\/customers\/([0-9a-f-]{36})$/i);
    const assessmentMatch = location.pathname.match(/^\/assessments\/([0-9a-f-]{36})\//i);
    setCurrentCustomerLabel("");
    if (customerMatch) {
      return () => {
        cancelled = true;
      };
    }
    if (assessmentMatch) {
      void api<{ assessment: { customerId: string } }>(`/api/assessments/${assessmentMatch[1]}`)
        .then((assessmentPayload) =>
          api<{ customer: { name: string } }>(`/api/customers/${assessmentPayload.assessment.customerId}`)
        )
        .then((customerPayload) => {
          if (!cancelled) setCurrentCustomerLabel(customerPayload.customer.name);
        })
        .catch(() => {
          if (!cancelled) setCurrentCustomerLabel("");
        });
    }
    return () => {
      cancelled = true;
    };
  }, [api, location.pathname]);

  async function loadNotifications() {
    const payload = await api<{ unreadCount: number; notifications: typeof notifications }>("/api/notifications");
    setNotifications(payload.notifications);
    setUnreadCount(payload.unreadCount);
  }

  useEffect(() => {
    void loadNotifications().catch(() => undefined);
    const timer = window.setInterval(() => void loadNotifications().catch(() => undefined), 30000);
    return () => window.clearInterval(timer);
  }, [api]);

  async function openNotification(notification: (typeof notifications)[number]) {
    await api(`/api/notifications/${notification.id}/read`, { method: "PATCH" });
    await loadNotifications();
    setNotificationsOpen(false);
    if (notification.customerId) navigate(`/customers/${notification.customerId}`);
  }

  async function markAllRead() {
    await api("/api/notifications/mark-all-read", { method: "POST" });
    await loadNotifications();
  }

  return (
    <header className="flex h-12 items-center justify-between border-b border-audity-border bg-audity-topnav px-5">
      <div className="flex min-w-0 items-center gap-3">
        <BrandMark />
        <span className="text-sm font-semibold">Audity</span>
        {showCustomerContext && customerLabel ? (
          <span className="max-w-[320px] truncate rounded-audity border border-audity-borderStrong bg-audity-panel px-2 py-1 text-xs font-semibold text-audity-secondary">
            Customer: {customerLabel}
          </span>
        ) : null}
        {admin ? (
          <span className="rounded-audity border border-audity-primary/60 bg-audity-primaryActive px-2 py-1 text-xs font-semibold text-audity-primary">
            Admin: {user?.role}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <div className="relative">
          <button
            className="relative flex h-8 w-9 items-center justify-center rounded-audity border border-audity-borderStrong bg-audity-panel text-audity-secondary hover:border-audity-primary hover:text-audity-text"
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            aria-label="Notifications"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
            </svg>
            {unreadCount ? (
              <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-audity-primary px-1 text-[10px] font-semibold text-white">
                {unreadCount}
              </span>
            ) : null}
          </button>
          {notificationsOpen ? (
            <div className="absolute right-0 z-20 mt-2 w-96 overflow-hidden rounded-audity border border-audity-border bg-audity-panel shadow-xl">
              <div className="flex items-center justify-between border-b border-audity-border px-3 py-2">
                <span className="text-sm font-semibold">Notifications</span>
                <button className="text-xs font-semibold text-audity-primary" onClick={() => void markAllRead()}>
                  Mark all read
                </button>
              </div>
              <div className="max-h-96 overflow-auto">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    className="block w-full border-b border-audity-border px-3 py-3 text-left last:border-0 hover:bg-audity-page"
                    onClick={() => void openNotification(notification)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-audity-text">{notification.title}</p>
                      {!notification.readAt ? <span className="mt-1 h-2 w-2 rounded-full bg-audity-primary" /> : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-audity-secondary">{notification.message}</p>
                    <p className="mt-1 text-[11px] text-audity-muted">{new Date(notification.createdAt).toLocaleString()}</p>
                  </button>
                ))}
                {!notifications.length ? <div className="px-3 py-8 text-center text-sm text-audity-muted">No notifications</div> : null}
              </div>
            </div>
          ) : null}
        </div>
        {admin && !adminMode ? (
          <Link
            className="h-8 rounded-audity border border-audity-primary bg-audity-primaryActive px-3 py-1.5 text-sm font-semibold text-audity-primary hover:bg-audity-panel"
            to="/admin/activity"
          >
            Admin Menu
          </Link>
        ) : null}
        <button
          className="h-8 rounded-audity border border-audity-borderStrong bg-audity-panel px-3 text-sm text-audity-secondary hover:border-audity-primary hover:text-audity-text"
          onClick={() => void logout()}
        >
          Logout
        </button>
      </div>
    </header>
  );
}

export function AppLayout() {
  const location = useLocation();
  useIdleLogout();
  const [assessmentId, setAssessmentId] = useState(() =>
    window.localStorage.getItem("audity_last_assessment_id") ?? ""
  );

  useEffect(() => {
    const match = location.pathname.match(/\/assessments\/([^/]+)/);
    if (match?.[1]) {
      window.localStorage.setItem("audity_last_assessment_id", match[1]);
      setAssessmentId(match[1]);
    }
  }, [location.pathname]);

  useEffect(() => {
    const handleContext = (event: Event) => {
      const nextId = (event as CustomEvent<string>).detail;
      if (nextId) setAssessmentId(nextId);
    };
    window.addEventListener("audity-assessment-context", handleContext);
    return () => window.removeEventListener("audity-assessment-context", handleContext);
  }, []);

  const assessmentClass = assessmentId
    ? "block rounded-audity px-3 py-2 text-sm text-audity-secondary hover:bg-audity-panel hover:text-audity-text"
    : "block cursor-not-allowed rounded-audity px-3 py-2 text-sm text-audity-muted opacity-60";

  return (
    <main className="min-h-screen bg-audity-app text-audity-text">
      <TopBar />
      <div className="grid min-h-[calc(100vh-48px)] grid-cols-1 lg:grid-cols-[260px_1fr]">
        <aside className="border-r border-audity-border bg-audity-sidebar p-5">
          <p className="mb-3 text-xs font-semibold uppercase text-audity-muted">Workspace</p>
          <nav className="space-y-1">
            <NavLink className={navClass} to="/dashboard">Dashboard</NavLink>
            <span className="block px-3 pt-3 pb-1 text-xs font-semibold uppercase text-audity-muted">Customer</span>
            <NavLink className={subNavClass} to="/customers/my">My Customers</NavLink>
            <NavLink className={subNavClass} to="/customers/shared">Shared Customers</NavLink>
            {assessmentId ? <NavLink className={navClass} to={`/assessments/${assessmentId}/questions`}>Questions</NavLink> : <span className={assessmentClass}>Questions</span>}
            {assessmentId ? <NavLink className={navClass} to={`/assessments/${assessmentId}/workflow`}>Findings & Risk</NavLink> : <span className={assessmentClass}>Findings & Risk</span>}
            {assessmentId ? <NavLink className={navClass} to={`/assessments/${assessmentId}/assets`}>Evidence & Reports</NavLink> : <span className={assessmentClass}>Evidence & Reports</span>}
          </nav>
        </aside>
        <section className="bg-audity-page p-5">
          <Outlet />
        </section>
      </div>
    </main>
  );
}

export function AdminLayout() {
  const { user } = useAuth();
  useIdleLogout();
  const can = (permission: string) => Boolean(user?.permissions.includes(permission));
  return (
    <main className="min-h-screen bg-audity-app text-audity-text">
      <TopBar adminMode />
      <div className="grid min-h-[calc(100vh-48px)] grid-cols-1 lg:grid-cols-[260px_1fr]">
        <aside className="border-r border-audity-border bg-audity-sidebar p-5">
          <p className="mb-3 text-xs font-semibold uppercase text-audity-muted">Admin Panel</p>
          <nav className="space-y-1">
            {can("activitylog.view") ? <NavLink className={navClass} to="/admin/activity">Activity Log</NavLink> : null}
            {can("auditlog.view") ? <NavLink className={navClass} to="/admin/audit">Audit Log</NavLink> : null}
            {can("roles.manage") ? <NavLink className={navClass} to="/admin/users">User Management</NavLink> : null}
            {can("assessment.view") ? <NavLink className={navClass} to="/admin/frameworks">Framework Library</NavLink> : null}
            {can("branding.manage") ? <NavLink className={navClass} to="/admin/branding">Branding</NavLink> : null}
            {can("email.manage") ? <NavLink className={navClass} to="/admin/email">Email Settings</NavLink> : null}
            {can("settings.manage") ? <NavLink className={navClass} to="/admin/system">System</NavLink> : null}
            {user?.role === "Instance Admin" ? <NavLink className={navClass} to="/admin/backup">Backup</NavLink> : null}
          </nav>
          <Link
            className="mt-5 block rounded-audity border border-audity-error/60 bg-[#2A1C17] px-3 py-2 text-sm font-semibold text-[#FFB199] hover:border-audity-error hover:bg-[#351F19] hover:text-white"
            to="/dashboard"
          >
            Leave Admin Panel
          </Link>
        </aside>
        <section className="bg-audity-page p-5">
          <Outlet />
        </section>
      </div>
    </main>
  );
}
