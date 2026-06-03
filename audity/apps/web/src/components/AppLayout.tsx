import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { BrandMark } from "./BrandMark";

const navClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-audity px-3 py-2 text-sm ${
    isActive
      ? "bg-audity-primaryActive font-semibold text-audity-text"
      : "text-audity-secondary hover:bg-audity-panel hover:text-audity-text"
  }`;

function isAdminRole(role?: string) {
  return role === "Instance Admin" || role === "Tenant Admin";
}

function TopBar({ adminMode = false }: { adminMode?: boolean }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [customerLabel, setCustomerLabel] = useState(() =>
    window.localStorage.getItem("audity_current_customer_label") ?? ""
  );
  const admin = isAdminRole(user?.role);
  const showCustomerContext =
    /^\/customers\/[^/]+/.test(location.pathname) || /^\/assessments\/[^/]+/.test(location.pathname);

  useEffect(() => {
    const handleContext = (event: Event) => {
      const nextLabel = (event as CustomEvent<string>).detail;
      setCustomerLabel(nextLabel);
    };
    window.addEventListener("audity-customer-context", handleContext);
    return () => window.removeEventListener("audity-customer-context", handleContext);
  }, []);

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
        {admin && !adminMode ? (
          <Link
            className="h-8 rounded-audity border border-audity-primary bg-audity-primaryActive px-3 py-1.5 text-sm font-semibold text-audity-primary hover:bg-audity-panel"
            to="/admin/activity"
          >
            Admin
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
            <NavLink className={navClass} to="/customers">Customers</NavLink>
            {assessmentId ? (
              <>
                <NavLink className={navClass} to={`/assessments/${assessmentId}/questions`}>Questions</NavLink>
                <NavLink className={navClass} to={`/assessments/${assessmentId}/workflow`}>Findings & Risk</NavLink>
                <NavLink className={navClass} to={`/assessments/${assessmentId}/assets`}>Evidence & Reports</NavLink>
              </>
            ) : (
              <>
                <span className={assessmentClass}>Questions</span>
                <span className={assessmentClass}>Findings & Risk</span>
                <span className={assessmentClass}>Evidence & Reports</span>
              </>
            )}
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
  return (
    <main className="min-h-screen bg-audity-app text-audity-text">
      <TopBar adminMode />
      <div className="grid min-h-[calc(100vh-48px)] grid-cols-1 lg:grid-cols-[260px_1fr]">
        <aside className="border-r border-audity-border bg-audity-sidebar p-5">
          <p className="mb-3 text-xs font-semibold uppercase text-audity-muted">Admin Panel</p>
          <nav className="space-y-1">
            <NavLink className={navClass} to="/admin/activity">Activity Log</NavLink>
            <NavLink className={navClass} to="/admin/audit">Audit Log</NavLink>
            <NavLink className={navClass} to="/admin/users">User Management</NavLink>
            <NavLink className={navClass} to="/admin/frameworks">Framework Library</NavLink>
            <NavLink className={navClass} to="/admin/branding">Branding</NavLink>
            <NavLink className={navClass} to="/admin/email">Email Settings</NavLink>
          </nav>
          <Link
            className="mt-5 block rounded-audity border border-audity-borderStrong px-3 py-2 text-sm font-semibold text-audity-secondary hover:border-audity-primary hover:text-audity-text"
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
