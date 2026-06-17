import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useApi } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { currentLanguage, translate } from "../i18n";
import { BrandMark } from "./BrandMark";
import { CommandPalette } from "./CommandPalette";
import { HelpDrawer } from "./HelpDrawer";
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

function shortCustomerName(value: string, maxLength = 12) {
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

const tooltipDictionary: Array<[RegExp, string]> = [
  [/change password/i, "Update your password after confirming the current one."],
  [/current password/i, "Enter the password you use to sign in today."],
  [/new password/i, "Choose a new password with at least 8 characters."],
  [/confirm password/i, "Repeat the new password so typos are caught before saving."],
  [/tooltips/i, "Show or hide small help text when hovering controls."],
  [/user settings/i, "Open your personal account and interface preferences."],
  [/notifications/i, "Open recent system messages and review reminders."],
  [/logout|sign out/i, "End this browser session and return to the login screen."],
  [/dashboard/i, "Open the overview with current audit metrics."],
  [/customers/i, "Open the customer and assessment workspace."],
  [/activity log/i, "Review traceable application events and workflow changes."],
  [/audit log/i, "Review security relevant events such as login and password activity."],
  [/user management/i, "Manage users, roles, status, and visible permissions."],
  [/apply/i, "Apply the selected filters to the current list."],
  [/export/i, "Download the currently shown data as a file."],
  [/verify hash/i, "Check whether the activity log hash chain is still intact."],
  [/invite/i, "Create a new user with the entered role and temporary password."],
  [/disable/i, "Disable this account so the user can no longer sign in."],
  [/save/i, "Store the changes shown in this form."],
  [/confirm finding/i, "Mark this suggested finding as confirmed by the reviewer."],
  [/mark residual risk accepted/i, "Record that the remaining risk is knowingly accepted."],
  [/reject finding/i, "Dismiss this finding while keeping an audit trail."],
  [/risk register/i, "Review, edit, import, export, and track assessment risks."],
  [/export csv/i, "Download the risk register as a CSV file."],
  [/csv template/i, "Download a CSV template for importing risks."],
  [/import csv/i, "Upload a CSV file and add its risks to this assessment."],
  [/clear filter/i, "Remove the matrix filter and show all risks again."],
  [/likelihood/i, "Set how probable the risk scenario is on a 1 to 5 scale."],
  [/impact/i, "Set the expected business impact on a 1 to 5 scale."],
  [/treatment/i, "Choose whether to mitigate, accept, transfer, or avoid the risk."],
  [/owner/i, "Name the person or team responsible for this item."],
  [/due date/i, "Set the target date for completing this action."],
  [/treatment plan/i, "Describe the concrete steps planned for this risk."],
  [/add review note/i, "Write a review comment that stays with this item."],
  [/auto-generate/i, "Create roadmap actions from high and critical risks."],
  [/generate from risk/i, "Create a roadmap action for the selected risk."],
  [/backup/i, "Create or manage backup and restore jobs."],
  [/restore/i, "Check or start a restore process from an existing backup."]
];

function tooltipFor(element: Element): string {
  const explicit = element.getAttribute("aria-label") || element.getAttribute("placeholder") || element.getAttribute("name");
  const text = element.textContent?.replace(/\s+/g, " ").trim();
  const tag = element.tagName.toLowerCase();
  const label = explicit || text;
  if (label) {
    const match = tooltipDictionary.find(([pattern]) => pattern.test(label));
    if (match) return match[1];
    if (tag === "a") return `Open ${label}.`;
    if (tag === "button") return `Run the ${label} action.`;
    return `Enter or choose a value for ${label}.`;
  }
  if (tag === "select") return "Choose one of the available options.";
  if (tag === "textarea") return "Enter notes or longer audit text here.";
  if (tag === "input") return "Enter a value for this field.";
  return "Open this action.";
}

function useTooltips() {
  const [enabled, setEnabled] = useState(() => window.localStorage.getItem("audity_tooltips_enabled") !== "false");

  useEffect(() => {
    const sync = () => setEnabled(window.localStorage.getItem("audity_tooltips_enabled") !== "false");
    window.addEventListener("audity-tooltips-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("audity-tooltips-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("audity-tooltips-off", !enabled);
    let tooltip = document.getElementById("audity-tooltip-layer");
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.id = "audity-tooltip-layer";
      tooltip.className = "audity-tooltip-layer";
      document.body.appendChild(tooltip);
    }
    const annotate = () => {
      document.querySelectorAll("button, a, input, select, textarea, label").forEach((element) => {
        if (element.hasAttribute("data-tooltip")) return;
        if (element.closest("[data-tooltip-skip]")) return;
        element.setAttribute("data-tooltip", tooltipFor(element));
      });
    };
    annotate();
    const show = (event: Event) => {
      if (!enabled || !tooltip) return;
      const target = event.target instanceof Element ? event.target.closest("[data-tooltip]") : null;
      if (!target) return;
      const text = target.getAttribute("data-tooltip");
      if (!text) return;
      const rect = target.getBoundingClientRect();
      tooltip.textContent = text;
      tooltip.style.display = "block";
      const top = Math.max(8, rect.top + window.scrollY - tooltip.offsetHeight - 8);
      const left = Math.min(window.innerWidth - tooltip.offsetWidth - 12, Math.max(8, rect.left + window.scrollX));
      tooltip.style.top = `${top}px`;
      tooltip.style.left = `${left}px`;
    };
    const hide = () => {
      if (tooltip) tooltip.style.display = "none";
    };
    const observer = new MutationObserver(annotate);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("mouseover", show);
    document.addEventListener("focusin", show);
    document.addEventListener("mouseout", hide);
    document.addEventListener("focusout", hide);
    document.addEventListener("scroll", hide, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("mouseover", show);
      document.removeEventListener("focusin", show);
      document.removeEventListener("mouseout", hide);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("scroll", hide, true);
    };
  }, [enabled]);
}

function useUserTheme() {
  useEffect(() => {
    const apply = () => {
      const preference = window.localStorage.getItem("audity_theme") ?? "System";
      const systemLight = window.matchMedia?.("(prefers-color-scheme: light)").matches ?? false;
      const light = preference === "Light" || (preference === "System" && systemLight);
      document.documentElement.classList.toggle("audity-theme-light", light);
    };
    apply();
    window.addEventListener("audity-theme-changed", apply);
    window.addEventListener("storage", apply);
    return () => {
      window.removeEventListener("audity-theme-changed", apply);
      window.removeEventListener("storage", apply);
    };
  }, []);
}

function useLanguage() {
  const [language, setLanguage] = useState(currentLanguage);
  useEffect(() => {
    const sync = () => setLanguage(currentLanguage());
    window.addEventListener("audity-language-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("audity-language-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = "en";
  }, [language]);
  return (label: string) => translate(label, language);
}

function TopBar({ adminMode = false }: { adminMode?: boolean }) {
  const { user, logout } = useAuth();
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

  function openResult(result: SearchResult) {
    navigate(result.url);
    setSearchOpen(false);
    setCommandOpen(false);
    setSearchQuery("");
    setCommandQuery("");
  }

  return (
    <header className="flex h-11 items-center justify-between border-b border-audity-border bg-audity-topnav px-4">
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
            <div className="absolute left-0 z-30 mt-2 w-full min-w-[360px] overflow-hidden rounded-audity border border-audity-border bg-audity-panel shadow-xl">
              {searchResults.map((result) => (
                <button key={`${result.type}-${result.id}`} className="block w-full border-b border-audity-border px-3 py-2 text-left last:border-0 hover:bg-audity-page" onClick={() => openResult(result)}>
                  <span className="text-xs font-semibold uppercase text-audity-primary">{result.type}</span>
                  <span className="ml-2 text-sm font-semibold text-audity-text">{result.title}</span>
                  <span className="ml-2 text-xs text-audity-muted">{result.subtitle}</span>
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
            <div className="absolute right-0 z-20 mt-2 w-96 overflow-hidden rounded-audity border border-audity-border bg-audity-panel shadow-xl">
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
    </>
  );

  return (
    <div className="min-h-screen bg-audity-app text-audity-text">
      <a href="#audity-main" className="audity-skip-link">{t("Skip to main content")}</a>
      <TopBar />
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
          aria-label={t("Primary navigation")}
        >
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
        </aside>
        <main id="audity-main" tabIndex={-1} className="min-w-0 overflow-hidden bg-audity-page p-3 sm:p-4 focus:outline-none">
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
  const location = useLocation();
  const t = useLanguage();
  useIdleLogout();
  useTooltips();
  useUserTheme();
  const can = (permission: string) => Boolean(user?.permissions.includes(permission));
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
  return (
    <div className="min-h-screen bg-audity-app text-audity-text">
      <a href="#audity-main" className="audity-skip-link">{t("Skip to main content")}</a>
      <TopBar adminMode />
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
          aria-label={t("Admin navigation")}
        >
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
            className="mt-5 block rounded-audity border border-audity-error/60 bg-[#2A1C17] px-3 py-2 text-sm font-semibold text-[#FFB199] hover:border-audity-error hover:bg-[#351F19] hover:text-white"
            to="/dashboard"
          >
            {t("Leave Admin Panel")}
          </Link>
        </aside>
        <main id="audity-main" tabIndex={-1} className="min-w-0 overflow-hidden bg-audity-page p-3 sm:p-4 focus:outline-none">
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
