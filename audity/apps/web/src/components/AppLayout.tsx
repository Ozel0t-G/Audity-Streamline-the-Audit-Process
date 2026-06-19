import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useApi } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { BrandMark } from "./BrandMark";
import { CommandPalette } from "./CommandPalette";
import { HelpDrawer } from "./HelpDrawer";
import { useIdleLogout } from "./layout/useIdleLogout";
import { useTooltips } from "./layout/useTooltips";
import { useLanguage, useUserTheme } from "./layout/useUserTheme";
import { OnboardingTips } from "./OnboardingTips";
import { ErrorBoundary } from "./ui/ErrorBoundary";

const navClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-audity px-2.5 py-1.5 text-sm transition ${
    isActive
      ? "bg-audity-primaryActive font-semibold text-audity-text ring-1 ring-audity-primary/30"
      : "text-audity-secondary hover:bg-audity-panelAlt hover:text-audity-text"
  }`;

const navSectionClass = "px-2 pt-4 pb-1 text-xs font-semibold uppercase tracking-normal text-audity-muted";
const customerSectionClass = "px-2 pt-4 pb-1 text-xs font-semibold tracking-normal text-audity-muted";
const disabledNavClass = "block cursor-not-allowed rounded-audity px-2.5 py-1.5 text-sm text-audity-muted opacity-60";

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

function TopBar({ adminMode = false }: { adminMode?: boolean }) {
  const { user, logout, accessToken } = useAuth();
  const t = useLanguage();
  const api = useApi();
  const navigate = useNavigate();
  const location = useLocation();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
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
  const [customerLabel, setCustomerLabel] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [commandActions, setCommandActions] = useState<SearchResult[]>([]);
  const [commandResults, setCommandResults] = useState<SearchResult[]>([]);
  const [commandActiveIndex, setCommandActiveIndex] = useState(0);
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

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void api<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(query)}`)
        .then((payload) => {
          setSearchResults(payload.results);
          setSearchOpen(true);
        })
        .catch(() => setSearchResults([]));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [api, searchQuery]);

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
    setSearchOpen(false);
    setCommandOpen(false);
    setSearchQuery("");
    setCommandQuery("");
  }

  return (
    <header className="sticky top-0 z-40 flex h-11 items-center justify-between border-b border-audity-border bg-audity-topnav px-4">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-audity border border-audity-borderStrong bg-audity-panel text-audity-secondary hover:border-audity-primary hover:text-audity-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-audity-primary lg:hidden"
          aria-label={t("Open navigation")}
          onClick={() => window.dispatchEvent(new CustomEvent("audity-mobile-nav-toggle"))}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <BrandMark />
        <span className="text-sm font-semibold">Audity</span>
        <div className="relative hidden min-w-[220px] max-w-md flex-1 md:block">
          <input
            className="h-8 w-full rounded-audity border border-audity-border bg-audity-panel px-3 text-sm text-audity-text outline-none placeholder:text-audity-muted focus:border-audity-primary"
            placeholder="Search..."
            value={searchQuery}
            onFocus={() => setSearchOpen(true)}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          {searchOpen && searchQuery.trim().length >= 2 ? (
            <div className="absolute left-0 z-30 mt-2 w-[min(32rem,calc(100vw-2rem))] overflow-hidden rounded-audity border border-audity-border bg-audity-panel shadow-xl">
              {searchResults.map((result) => (
                <button key={`${result.type}-${result.id}`} className="block w-full min-w-0 border-b border-audity-border px-3 py-2 text-left last:border-0 hover:bg-audity-page" onClick={() => openResult(result)}>
                  <span className="text-xs font-semibold uppercase text-audity-primary">{result.type}</span>
                  <span className="mt-1 block truncate text-sm font-semibold text-audity-text">{result.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-audity-muted">{result.subtitle}</span>
                </button>
              ))}
              {!searchResults.length ? <div className="px-3 py-4 text-sm text-audity-muted">No results</div> : null}
            </div>
          ) : null}
        </div>
        {showCustomerContext && customerLabel ? (
          <span className="max-w-[320px] truncate rounded-audity border border-audity-borderStrong bg-audity-panel px-2 py-0.5 text-xs font-semibold text-audity-secondary">
            Customer: {customerLabel}
          </span>
        ) : null}
        {admin ? (
          <span className="rounded-audity border border-audity-primary/60 bg-audity-primaryActive px-2 py-0.5 text-xs font-semibold text-audity-primary">
            Admin: {user?.role}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-audity border border-audity-borderStrong bg-audity-panel text-audity-secondary hover:border-audity-primary hover:text-audity-text"
          onClick={() => setHelpOpen(true)}
          aria-label={t("Help")}
          title={t("Help & Manual")}
        >
          <span className="text-sm font-bold" aria-hidden="true">?</span>
        </button>
        <div className="relative">
          <button
            className="relative flex h-8 w-8 items-center justify-center rounded-audity border border-audity-borderStrong bg-audity-panel text-audity-secondary hover:border-audity-primary hover:text-audity-text"
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            aria-label={t("Notifications")}
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
            <div className="absolute right-0 z-20 mt-2 w-[min(24rem,calc(100vw-1rem))] overflow-hidden rounded-audity border border-audity-border bg-audity-panel shadow-xl">
              <div className="flex items-center justify-between border-b border-audity-border px-3 py-2">
                <span className="text-sm font-semibold">{t("Notifications")}</span>
                <button className="text-xs font-semibold text-audity-primary" onClick={() => void markAllRead()}>
                  {t("Mark all read")}
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
                    <p className="mt-1 text-xs text-audity-muted">{new Date(notification.createdAt).toLocaleString()}</p>
                  </button>
                ))}
                {!notifications.length ? <div className="px-3 py-8 text-center text-sm text-audity-muted">{t("No notifications")}</div> : null}
              </div>
            </div>
          ) : null}
        </div>
        {admin && !adminMode ? (
          <Link
            className="inline-flex h-8 items-center rounded-audity border border-audity-primary/70 bg-audity-primaryActive px-2.5 text-sm font-semibold leading-none text-audity-primary hover:bg-audity-panel"
            to="/admin/activity"
          >
            {t("Admin Menu")}
          </Link>
        ) : null}
        <button
          className="h-8 rounded-audity border border-audity-borderStrong bg-audity-panel px-2.5 text-sm text-audity-secondary hover:border-audity-primary hover:text-audity-text"
          onClick={() => void logout()}
        >
          {t("Logout")}
        </button>
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
  const api = useApi();
  const location = useLocation();
  const t = useLanguage();
  useIdleLogout();
  useTooltips();
  useUserTheme();
  const [customerContext, setCustomerContext] = useState({ label: "", assessmentId: "" });
  const { mobileNavOpen, setMobileNavOpen } = useMobileNav();

  useEffect(() => {
    const handleCustomerContext = (event: Event) => {
      const label = (event as CustomEvent<string>).detail ?? "";
      setCustomerContext((current) => ({ ...current, label }));
    };
    const handleAssessmentContext = (event: Event) => {
      const assessmentId = (event as CustomEvent<string>).detail ?? "";
      setCustomerContext((current) => ({ ...current, assessmentId }));
    };
    window.addEventListener("audity-customer-context", handleCustomerContext);
    window.addEventListener("audity-assessment-context", handleAssessmentContext);
    return () => {
      window.removeEventListener("audity-customer-context", handleCustomerContext);
      window.removeEventListener("audity-assessment-context", handleAssessmentContext);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const customerMatch = location.pathname.match(/^\/customers\/([0-9a-f-]{36})$/i);
    const assessmentMatch = location.pathname.match(/^\/assessments\/([0-9a-f-]{36})\//i);

    if (customerMatch) {
      setCustomerContext((current) => ({ ...current, label: "", assessmentId: "" }));
      void api<{ customer: { name: string } }>(`/api/customers/${customerMatch[1]}`)
        .then((payload) => {
          if (!cancelled) setCustomerContext((current) => ({ ...current, label: payload.customer.name }));
        })
        .catch(() => {
          if (!cancelled) setCustomerContext({ label: "", assessmentId: "" });
        });
    } else if (assessmentMatch) {
      const assessmentId = assessmentMatch[1];
      setCustomerContext((current) => ({ ...current, assessmentId }));
      void api<{ assessment: { customerId: string } }>(`/api/assessments/${assessmentId}`)
        .then((assessmentPayload) =>
          api<{ customer: { name: string } }>(`/api/customers/${assessmentPayload.assessment.customerId}`)
        )
        .then((customerPayload) => {
          if (!cancelled) setCustomerContext((current) => ({ ...current, label: customerPayload.customer.name, assessmentId }));
        })
        .catch(() => {
          if (!cancelled) setCustomerContext({ label: "", assessmentId: "" });
        });
    } else {
      setCustomerContext({ label: "", assessmentId: "" });
    }

    return () => {
      cancelled = true;
    };
  }, [api, location.pathname]);

  const customerMenuLabel = shortCustomerName(customerContext.label);
  const assessmentNav = customerContext.assessmentId ? (
    <>
      <NavLink className={navClass} to={`/assessments/${customerContext.assessmentId}/questions`}>{t("Questions")}</NavLink>
      <NavLink className={navClass} to={`/assessments/${customerContext.assessmentId}/audit-center`}>{t("Audit Center")}</NavLink>
      <NavLink className={navClass} to={`/assessments/${customerContext.assessmentId}/workflow`}>{t("Findings & Risk")}</NavLink>
      <NavLink className={navClass} to={`/assessments/${customerContext.assessmentId}/assets`}>{t("Evidence & Reports")}</NavLink>
    </>
  ) : (
    <>
      <span className={disabledNavClass} title="Select or create an assessment first.">{t("Questions")}</span>
      <span className={disabledNavClass} title="Select or create an assessment first.">{t("Audit Center")}</span>
      <span className={disabledNavClass} title="Select or create an assessment first.">{t("Findings & Risk")}</span>
      <span className={disabledNavClass} title="Select or create an assessment first.">{t("Evidence & Reports")}</span>
      <p className="mt-1 rounded-audity border border-audity-borderStrong bg-audity-panelAlt px-2 py-1 text-[11px] leading-4 text-audity-muted">
        Select or create an assessment first to enable these views.
      </p>
    </>
  );

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
          <NavLink className={navClass} to="/dashboard">{t("Dashboard")}</NavLink>
          <NavLink className={navClass} to="/customers/my">{t("Customers")}</NavLink>
          <NavLink className={navClass} to="/customers/shared">{t("Shared Customers")}</NavLink>
          {customerContext.label ? (
            <>
              <p className={customerSectionClass} title={customerContext.label}>{customerMenuLabel}</p>
              {assessmentNav}
            </>
          ) : null}
          <p className={navSectionClass}>{t("Settings")}</p>
          <NavLink className={navClass} to="/user-settings">{t("User Settings")}</NavLink>
          <NavLink className={navClass} to="/manual">{t("Manual")}</NavLink>
        </nav>
      }
    />
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
      <div className="grid min-h-[calc(100vh-44px)] grid-cols-1 lg:grid-cols-[208px_minmax(0,1fr)] xl:grid-cols-[224px_minmax(0,1fr)] 2xl:grid-cols-[232px_minmax(0,1fr)]">
        <aside
          className={`fixed inset-y-[44px] left-0 z-40 w-64 border-r border-audity-border bg-audity-sidebar p-3 2xl:p-4 transition-transform lg:static lg:inset-auto lg:w-auto lg:translate-x-0 ${mobileNavOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"}`}
          aria-label={navAriaLabel}
        >
          {sidebar}
        </aside>
        <main id="audity-main" tabIndex={-1} className="min-w-0 overflow-x-hidden bg-audity-page p-4 sm:p-5 lg:p-6 xl:p-7 focus:outline-none">
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
            {can("roles.manage") ? <NavLink className={navClass} to="/admin/users">{t("User Management")}</NavLink> : null}
            {can("assessment.view") ? <NavLink className={navClass} to="/admin/frameworks">{t("Framework Library")}</NavLink> : null}
            <p className={navSectionClass}>{t("Monitoring")}</p>
            {can("activitylog.view") ? <NavLink className={navClass} to="/admin/activity">{t("Activity Log")}</NavLink> : null}
            {can("auditlog.view") ? <NavLink className={navClass} to="/admin/audit">{t("Audit Log")}</NavLink> : null}
            <p className={navSectionClass}>{t("System")}</p>
            {can("settings.manage") ? <NavLink className={navClass} to="/admin/system">{t("System Monitor")}</NavLink> : null}
            {can("connectors.manage") ? <NavLink className={navClass} to="/admin/connectors">{t("Connector")}</NavLink> : null}
            {can("branding.manage") ? <NavLink className={navClass} to="/admin/branding">{t("Branding")}</NavLink> : null}
            {can("email.manage") ? <NavLink className={navClass} to="/admin/email">{t("Email Settings")}</NavLink> : null}
            {can("settings.manage") ? <NavLink className={navClass} to="/admin/workbench">{t("Workbench")}</NavLink> : null}
            {user?.role === "Instance Admin" ? <NavLink className={navClass} to="/admin/backup">{t("Backup")}</NavLink> : null}
            <NavLink className={navClass} to="/manual">{t("Manual")}</NavLink>
          </nav>
          <Link
            className="mt-5 block rounded-audity border border-audity-error/60 bg-audity-error/10 px-3 py-2 text-sm font-semibold text-audity-error hover:border-audity-error hover:bg-audity-error/20 hover:text-white"
            to="/dashboard"
          >
            {t("Leave Admin Panel")}
          </Link>
        </>
      }
    />
  );
}
