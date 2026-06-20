import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useApi } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { BrandMark } from "./BrandMark";
import { CommandPalette } from "./CommandPalette";
import { CustomerContextProvider, useCustomerContext } from "./CustomerContextProvider";
import { HelpDrawer } from "./HelpDrawer";
import { useIdleLogout } from "./layout/useIdleLogout";
import { useTooltips } from "./layout/useTooltips";
import { useLanguage, useUserTheme } from "./layout/useUserTheme";
import { OnboardingTips } from "./OnboardingTips";
import { ErrorBoundary } from "./ui/ErrorBoundary";

const navClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 rounded-audity px-2.5 py-1.5 text-[13px] transition ${
    isActive
      ? "bg-audity-primaryActive font-semibold text-audity-text"
      : "text-audity-secondary hover:bg-audity-panelAlt hover:text-audity-text"
  }`;

const navSectionClass = "px-2 pt-5 pb-1 text-[11px] font-semibold tracking-wide text-audity-muted";

function shortCustomerName(value: string, maxLength = 24) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}...`;
}

type SearchResult = {
  type: string;
  id: string;
  title: string;
  subtitle?: string | null;
  url: string;
};

function isAdminRole(role?: string) {
  return role === "Instance Admin" || role === "Tenant Admin";
}

function getInitials(value?: string) {
  if (!value) return "?";
  const parts = value.split(/[\s@.]+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function TopBar({ adminMode = false }: { adminMode?: boolean }) {
  const { user, logout, accessToken } = useAuth();
  const t = useLanguage();
  const api = useApi();
  const navigate = useNavigate();
  const location = useLocation();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement | null>(null);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    title: string;
    message: string;
    entityType?: string | null;
    entityId?: string | null;
    customerId?: string | null;
    readAt?: string | null;
    createdAt: string;
  }>>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const { customerLabel } = useCustomerContext();
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [commandActions, setCommandActions] = useState<SearchResult[]>([]);
  const [commandResults, setCommandResults] = useState<SearchResult[]>([]);
  const [commandActiveIndex, setCommandActiveIndex] = useState(0);
  const admin = isAdminRole(user?.role);
  const showCustomerContext =
    /^\/customers\/[0-9a-f-]{36}$/i.test(location.pathname) ||
    /^\/assessments\/[0-9a-f-]{36}\//i.test(location.pathname);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setNotificationsOpen(false);
        setAccountOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    if (!notificationsOpen && !accountOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (notificationsOpen && notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
      if (accountOpen && accountRef.current && !accountRef.current.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [notificationsOpen, accountOpen]);

  useEffect(() => {
    if (!commandOpen) return;
    const timer = window.setTimeout(() => {
      void api<{ actions: SearchResult[]; results: SearchResult[] }>(`/api/command-palette?q=${encodeURIComponent(commandQuery)}`)
        .then((payload) => {
          setCommandActions(payload.actions);
          setCommandResults(payload.results);
        })
        .catch(() => {
          setCommandActions([]);
          setCommandResults([]);
        });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [api, commandOpen, commandQuery]);

  async function loadNotifications() {
    const payload = await api<{ unreadCount: number; notifications: typeof notifications }>("/api/notifications");
    setNotifications(payload.notifications);
    setUnreadCount(payload.unreadCount);
  }

  useEffect(() => {
    void loadNotifications().catch(() => undefined);
    if (!accessToken) return;
    let source: EventSource | undefined;
    let pollTimer: number | undefined;
    const startStream = () => {
      if (source) return;
      try {
        source = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(accessToken)}`);
        source.addEventListener("notifications.changed", () => void loadNotifications().catch(() => undefined));
        source.onerror = () => {
          source?.close();
          source = undefined;
          startPollingFallback();
        };
      } catch {
        startPollingFallback();
      }
    };
    const startPollingFallback = () => {
      if (pollTimer !== undefined) return;
      pollTimer = window.setInterval(() => void loadNotifications().catch(() => undefined), 30000);
    };
    const stop = () => {
      source?.close();
      source = undefined;
      if (pollTimer !== undefined) {
        window.clearInterval(pollTimer);
        pollTimer = undefined;
      }
    };
    const sync = () => {
      if (document.visibilityState === "visible") {
        void loadNotifications().catch(() => undefined);
        startStream();
      } else {
        stop();
      }
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      stop();
    };
  }, [api, accessToken]);

  async function openNotification(notification: (typeof notifications)[number]) {
    await api(`/api/notifications/${notification.id}/read`, { method: "PATCH" });
    await loadNotifications();
    setNotificationsOpen(false);
    if (notification.customerId) navigate(`/customers/${notification.customerId}`);
    if (notification.entityType === "system_update") navigate("/admin/system");
  }

  async function markAllRead() {
    await api("/api/notifications/mark-all-read", { method: "POST" });
    await loadNotifications();
  }

  function openResult(result: SearchResult) {
    navigate(result.url);
    setCommandOpen(false);
    setCommandQuery("");
  }

  const isMac = typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac");

  return (
    <header className="sticky top-0 z-40 flex h-12 items-center justify-between border-b border-audity-border bg-audity-topnav px-4">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="audity-btn-icon lg:hidden"
          aria-label={t("Open navigation")}
          onClick={() => window.dispatchEvent(new CustomEvent("audity-mobile-nav-toggle"))}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <Link to="/dashboard" className="flex items-center gap-2 text-audity-text hover:opacity-90">
          <BrandMark />
          <span className="text-sm font-semibold tracking-tight">Audity</span>
        </Link>
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className="hidden h-9 min-w-[260px] items-center gap-2 rounded-audity border border-audity-border bg-audity-panel px-3 text-sm text-audity-muted transition hover:border-audity-borderStrong hover:text-audity-secondary md:flex"
          aria-label={t("Open search")}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span className="flex-1 text-left">Search or jump to…</span>
          <span className="flex items-center gap-1">
            <span className="audity-kbd">{isMac ? "⌘" : "Ctrl"}</span>
            <span className="audity-kbd">K</span>
          </span>
        </button>
        {showCustomerContext && customerLabel ? (
          <span className="hidden max-w-[280px] truncate rounded-audity bg-audity-accentSoft px-2 py-0.5 text-xs font-medium text-audity-accent md:inline-flex">
            {customerLabel}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="audity-btn-icon md:hidden"
          onClick={() => setCommandOpen(true)}
          aria-label={t("Open search")}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
        <button
          type="button"
          className="audity-btn-icon"
          onClick={() => setHelpOpen(true)}
          aria-label={t("Help")}
          title={t("Help & Manual")}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.9.5-1.5 1-1.5 1.7" />
            <line x1="12" y1="17" x2="12" y2="17" />
          </svg>
        </button>
        <div className="relative" ref={notificationsRef}>
          <button
            type="button"
            className="audity-btn-icon relative"
            onClick={() => {
              setNotificationsOpen((open) => !open);
              setAccountOpen(false);
            }}
            aria-label={t("Notifications")}
            aria-expanded={notificationsOpen}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
              <path d="M10 19a2 2 0 0 0 4 0" />
            </svg>
            {unreadCount ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-audity-error px-1 text-[10px] font-semibold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </button>
          {notificationsOpen ? (
            <div className="absolute right-0 z-20 mt-2 w-[min(26rem,calc(100vw-1rem))] overflow-hidden rounded-audity-md border border-audity-border bg-audity-panel shadow-audity-raised">
              <div className="flex items-center justify-between border-b border-audity-border px-3 py-2">
                <span className="text-sm font-semibold text-audity-text">{t("Notifications")}</span>
                <button type="button" className="audity-btn-ghost audity-btn-sm" onClick={() => void markAllRead()}>
                  {t("Mark all read")}
                </button>
              </div>
              <div className="max-h-96 overflow-auto">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    className="block w-full border-b border-audity-border px-3 py-3 text-left last:border-0 hover:bg-audity-panelAlt"
                    onClick={() => void openNotification(notification)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[13px] font-semibold text-audity-text">{notification.title}</p>
                      {!notification.readAt ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-audity-primary" /> : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-audity-secondary">{notification.message}</p>
                    <p className="mt-1 text-[11px] text-audity-muted">{new Date(notification.createdAt).toLocaleString()}</p>
                  </button>
                ))}
                {!notifications.length ? <div className="px-3 py-10 text-center text-sm text-audity-muted">{t("No notifications")}</div> : null}
              </div>
            </div>
          ) : null}
        </div>
        <div className="relative" ref={accountRef}>
          <button
            type="button"
            onClick={() => {
              setAccountOpen((open) => !open);
              setNotificationsOpen(false);
            }}
            aria-expanded={accountOpen}
            aria-label={t("Account menu")}
            className="ml-1 flex h-9 items-center gap-2 rounded-audity border border-transparent px-1.5 transition hover:border-audity-border hover:bg-audity-panelAlt focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-audity-primary"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-audity-primaryActive text-[11px] font-medium text-audity-primary">
              {getInitials(user?.email)}
            </span>
            <svg className="hidden h-3.5 w-3.5 text-audity-muted sm:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {accountOpen ? (
            <div className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-audity-md border border-audity-border bg-audity-panel shadow-audity-raised">
              <div className="border-b border-audity-border px-3 py-3">
                <p className="truncate text-sm font-semibold text-audity-text">{user?.email}</p>
                <p className="mt-0.5 text-xs text-audity-muted">{user?.role}</p>
              </div>
              <div className="py-1">
                <Link to="/user-settings" className="flex items-center gap-2 px-3 py-2 text-sm text-audity-secondary hover:bg-audity-panelAlt hover:text-audity-text" onClick={() => setAccountOpen(false)}>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <circle cx="12" cy="7" r="4" />
                    <path d="M5 21a7 7 0 0 1 14 0" />
                  </svg>
                  {t("User Settings")}
                </Link>
                <Link to="/manual" className="flex items-center gap-2 px-3 py-2 text-sm text-audity-secondary hover:bg-audity-panelAlt hover:text-audity-text" onClick={() => setAccountOpen(false)}>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3Z" />
                    <line x1="8" y1="8" x2="15" y2="8" />
                    <line x1="8" y1="12" x2="15" y2="12" />
                  </svg>
                  {t("Manual")}
                </Link>
                {admin ? (
                  <Link
                    to={adminMode ? "/dashboard" : "/admin/activity"}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-audity-secondary hover:bg-audity-panelAlt hover:text-audity-text"
                    onClick={() => setAccountOpen(false)}
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6Z" />
                    </svg>
                    {adminMode ? t("Leave Admin Panel") : t("Admin Menu")}
                  </Link>
                ) : null}
              </div>
              <div className="border-t border-audity-border py-1">
                <button
                  type="button"
                  onClick={() => {
                    setAccountOpen(false);
                    void logout();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-audity-secondary hover:bg-audity-panelAlt hover:text-audity-text"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M16 17l5-5-5-5" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                    <path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
                  </svg>
                  {t("Logout")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {commandOpen ? (
        <CommandPalette
          query={commandQuery}
          onQueryChange={setCommandQuery}
          actions={commandActions}
          results={commandResults}
          activeIndex={commandActiveIndex}
          onActiveIndexChange={setCommandActiveIndex}
          onSelect={openResult}
          onClose={() => setCommandOpen(false)}
        />
      ) : null}
      <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
    </header>
  );
}

export function AppLayout() {
  return (
    <CustomerContextProvider>
      <AppLayoutInner />
    </CustomerContextProvider>
  );
}

function AppLayoutInner() {
  const t = useLanguage();
  useIdleLogout();
  useTooltips();
  useUserTheme();
  const customerContext = useCustomerContext();
  const { mobileNavOpen, setMobileNavOpen } = useMobileNav();

  const customerMenuLabel = shortCustomerName(customerContext.customerLabel);
  const hasAssessment = Boolean(customerContext.assessmentId);

  return (
    <Shell
      navAriaLabel={t("Primary navigation")}
      mobileNavOpen={mobileNavOpen}
      setMobileNavOpen={setMobileNavOpen}
      topBar={<TopBar />}
      skipLabel={t("Skip to main content")}
      sidebar={
        <nav className="space-y-0.5">
          <p className={navSectionClass}>{t("Workspace")}</p>
          <NavLink className={navClass} to="/dashboard">
            <NavIcon name="dashboard" /> {t("Dashboard")}
          </NavLink>
          <NavLink className={navClass} to="/customers/my">
            <NavIcon name="customers" /> {t("Customers")}
          </NavLink>
          <NavLink className={navClass} to="/customers/shared">
            <NavIcon name="shared" /> {t("Shared Customers")}
          </NavLink>
          {customerContext.customerLabel ? (
            <>
              <div className="mt-5 rounded-audity-md border border-audity-border bg-audity-panelAlt/60 p-2">
                <p className="px-1 pb-2 text-[11px] font-medium tracking-wider text-audity-muted">
                  {t("Active customer")}
                </p>
                <p className="truncate px-1 pb-2 text-sm font-semibold text-audity-text" title={customerContext.customerLabel}>
                  {customerMenuLabel}
                </p>
                {hasAssessment ? (
                  <div className="space-y-0.5">
                    <NavLink className={navClass} to={`/assessments/${customerContext.assessmentId}/questions`}>
                      <NavIcon name="question" /> {t("Questions")}
                    </NavLink>
                    <NavLink className={navClass} to={`/assessments/${customerContext.assessmentId}/audit-center`}>
                      <NavIcon name="audit" /> {t("Audit Center")}
                    </NavLink>
                    <NavLink className={navClass} to={`/assessments/${customerContext.assessmentId}/workflow`}>
                      <NavIcon name="risk" /> {t("Findings & Risk")}
                    </NavLink>
                    <NavLink className={navClass} to={`/assessments/${customerContext.assessmentId}/assets`}>
                      <NavIcon name="reports" /> {t("Evidence & Reports")}
                    </NavLink>
                  </div>
                ) : (
                  <p className="rounded-audity bg-audity-panel/60 px-2 py-1.5 text-[11px] leading-4 text-audity-muted">
                    {t("Select or create an assessment to unlock these views.")}
                  </p>
                )}
              </div>
            </>
          ) : null}
        </nav>
      }
    />
  );
}

function NavIcon({ name }: { name: "dashboard" | "customers" | "shared" | "question" | "audit" | "risk" | "reports" | "users" | "frameworks" | "activity" | "audit-log" | "system" | "connector" | "branding" | "email" | "workbench" | "backup" | "manual" }) {
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg className="h-4 w-4 shrink-0 text-current opacity-80" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      {name === "dashboard" ? <><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></> : null}
      {name === "customers" ? <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></> : null}
      {name === "shared" ? <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" /></> : null}
      {name === "question" ? <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.9.5-1.5 1-1.5 1.7" /><line x1="12" y1="17" x2="12" y2="17" /></> : null}
      {name === "audit" ? <><path d="M9 11l3 3 7-7" /><path d="M21 12v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11" /></> : null}
      {name === "risk" ? <><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12" y2="17" /></> : null}
      {name === "reports" ? <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></> : null}
      {name === "users" ? <><circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M21 21v-2a4 4 0 0 0-3-3.87" /></> : null}
      {name === "frameworks" ? <><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></> : null}
      {name === "activity" ? <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></> : null}
      {name === "audit-log" ? <><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="13" y2="17" /></> : null}
      {name === "system" ? <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c0 .68.39 1.27 1 1.51H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></> : null}
      {name === "connector" ? <><path d="M10 14a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72" /><path d="M14 10a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.72" /></> : null}
      {name === "branding" ? <><circle cx="13.5" cy="6.5" r="1.5" /><circle cx="17.5" cy="10.5" r="1.5" /><circle cx="8.5" cy="7.5" r="1.5" /><circle cx="6.5" cy="12.5" r="1.5" /><path d="M12 22a10 10 0 1 1 10-10c0 5-4 5-7 5h-1a2 2 0 0 0-2 2v3Z" /></> : null}
      {name === "email" ? <><rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="22 6 12 13 2 6" /></> : null}
      {name === "workbench" ? <><rect x="3" y="4" width="18" height="14" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /></> : null}
      {name === "backup" ? <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><polyline points="7.5 4.21 12 6.81 16.5 4.21" /></> : null}
      {name === "manual" ? <><path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3Z" /><line x1="8" y1="8" x2="15" y2="8" /><line x1="8" y1="12" x2="15" y2="12" /></> : null}
    </svg>
  );
}

function useMobileNav() {
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useEffect(() => {
    const open = () => setMobileNavOpen(true);
    const toggle = () => setMobileNavOpen((current) => !current);
    window.addEventListener("audity-mobile-nav-open", open);
    window.addEventListener("audity-mobile-nav-toggle", toggle);
    return () => {
      window.removeEventListener("audity-mobile-nav-open", open);
      window.removeEventListener("audity-mobile-nav-toggle", toggle);
    };
  }, []);
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);
  return { mobileNavOpen, setMobileNavOpen };
}

function Shell({
  topBar,
  sidebar,
  skipLabel,
  navAriaLabel,
  mobileNavOpen,
  setMobileNavOpen
}: {
  topBar: ReactNode;
  sidebar: ReactNode;
  skipLabel: string;
  navAriaLabel: string;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
}) {
  const location = useLocation();
  return (
    <div className="min-h-screen bg-audity-app text-audity-text">
      <a href="#audity-main" className="audity-skip-link">{skipLabel}</a>
      {topBar}
      {mobileNavOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          aria-hidden="true"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}
      <div className="grid min-h-[calc(100vh-48px)] grid-cols-1 lg:grid-cols-[224px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)] 2xl:grid-cols-[248px_minmax(0,1fr)]">
        <aside
          className={`fixed inset-y-[48px] left-0 z-40 w-64 border-r border-audity-border bg-audity-sidebar p-3 2xl:p-4 transition-transform lg:static lg:inset-auto lg:w-auto lg:translate-x-0 ${mobileNavOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"}`}
          aria-label={navAriaLabel}
        >
          {sidebar}
        </aside>
        <main id="audity-main" tabIndex={-1} className="min-w-0 overflow-x-hidden bg-audity-page p-4 sm:p-5 lg:p-6 xl:p-8 focus:outline-none">
          <OnboardingTips />
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

export function AdminLayout() {
  return (
    <CustomerContextProvider>
      <AdminLayoutInner />
    </CustomerContextProvider>
  );
}

function AdminLayoutInner() {
  const { user } = useAuth();
  const t = useLanguage();
  useIdleLogout();
  useTooltips();
  useUserTheme();
  const can = (permission: string) => Boolean(user?.permissions.includes(permission));
  const { mobileNavOpen, setMobileNavOpen } = useMobileNav();
  return (
    <Shell
      navAriaLabel={t("Admin navigation")}
      mobileNavOpen={mobileNavOpen}
      setMobileNavOpen={setMobileNavOpen}
      topBar={<TopBar adminMode />}
      skipLabel={t("Skip to main content")}
      sidebar={
        <>
          <nav className="space-y-0.5">
            <p className={navSectionClass}>{t("Administration")}</p>
            {can("roles.manage") ? <NavLink className={navClass} to="/admin/users"><NavIcon name="users" /> {t("User Management")}</NavLink> : null}
            {can("assessment.view") ? <NavLink className={navClass} to="/admin/frameworks"><NavIcon name="frameworks" /> {t("Framework Library")}</NavLink> : null}
            <p className={navSectionClass}>{t("Monitoring")}</p>
            {can("activitylog.view") ? <NavLink className={navClass} to="/admin/activity"><NavIcon name="activity" /> {t("Activity Log")}</NavLink> : null}
            {can("auditlog.view") ? <NavLink className={navClass} to="/admin/audit"><NavIcon name="audit-log" /> {t("Audit Log")}</NavLink> : null}
            <p className={navSectionClass}>{t("System")}</p>
            {can("settings.manage") ? <NavLink className={navClass} to="/admin/system"><NavIcon name="system" /> {t("System Monitor")}</NavLink> : null}
            {can("settings.manage") ? <NavLink className={navClass} to="/admin/ai"><NavIcon name="system" /> {t("AI & Integrations")}</NavLink> : null}
            {can("connectors.manage") ? <NavLink className={navClass} to="/admin/connectors"><NavIcon name="connector" /> {t("Connector")}</NavLink> : null}
            {can("branding.manage") ? <NavLink className={navClass} to="/admin/branding"><NavIcon name="branding" /> {t("Branding")}</NavLink> : null}
            {can("email.manage") ? <NavLink className={navClass} to="/admin/email"><NavIcon name="email" /> {t("Email Settings")}</NavLink> : null}
            {can("settings.manage") ? <NavLink className={navClass} to="/admin/workbench"><NavIcon name="workbench" /> {t("Workbench")}</NavLink> : null}
            {user?.role === "Instance Admin" ? <NavLink className={navClass} to="/admin/backup"><NavIcon name="backup" /> {t("Backup")}</NavLink> : null}
            <NavLink className={navClass} to="/manual"><NavIcon name="manual" /> {t("Manual")}</NavLink>
          </nav>
          <Link
            className="mt-5 flex h-9 items-center justify-center gap-2 rounded-audity-button border border-audity-error/50 bg-transparent px-3 text-sm font-medium text-audity-error transition-[background-color,border-color,color] duration-100 hover:border-audity-error hover:bg-audity-error hover:text-white"
            to="/dashboard"
          >
            {t("Leave Admin Panel")}
          </Link>
        </>
      }
    />
  );
}
