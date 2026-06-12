import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../api/client";
import { useAuth } from "../auth/AuthProvider";

type SharedUser = {
  id: string;
  name: string;
  email: string;
};

type AssessmentSummary = {
  id: string;
  type: string;
  framework?: string | null;
  status: string;
  targetDate?: string | null;
  progressPercent?: number;
  openHighRisks?: number;
  criticalRisks?: number;
  openFindings?: number;
  evidenceGaps?: number;
  overdueRoadmapItems?: number;
  reports?: number;
};

type OwnedCustomer = {
  customerId: string;
  customerName: string;
  customerStatus: string;
  sharedWith: SharedUser[];
  assessments: AssessmentSummary[];
};

type SharedCustomer = {
  id: string;
  name: string;
  status: string;
  ownerName?: string | null;
  ownerEmail?: string | null;
  sharedAt: string;
  assessments: AssessmentSummary[];
};

type DashboardPayload = {
  ownedCustomers: OwnedCustomer[];
  sharedCustomers: SharedCustomer[];
};

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  readAt?: string | null;
  createdAt: string;
};

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-audity-page">
      <div className="h-full bg-audity-primary" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function SignalPill({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "warning" | "error" }) {
  const toneClass =
    tone === "error"
      ? "border-audity-error text-audity-error"
      : tone === "warning"
        ? "border-audity-warning text-audity-warning"
        : "border-audity-borderStrong text-audity-secondary";
  return (
    <span className={`rounded-audity border px-2 py-1 text-[11px] ${toneClass}`}>
      {label}: {value}
    </span>
  );
}

export function DashboardPage() {
  const { user, setupMfa, verifyMfaSetup } = useAuth();
  const api = useApi();
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [widgets, setWidgets] = useState(() => ({
    customers: window.localStorage.getItem("audity_widget_customers") !== "false",
    shared: window.localStorage.getItem("audity_widget_shared") !== "false",
    notifications: window.localStorage.getItem("audity_widget_notifications") !== "false",
    security: window.localStorage.getItem("audity_widget_security") !== "false"
  }));
  const [showOnboarding, setShowOnboarding] = useState(() => window.localStorage.getItem("audity_onboarding_done") !== "true");
  const [mfaSetup, setMfaSetup] = useState<{
    secret: string;
    otpauthUrl: string;
    qrCodeDataUrl: string;
  } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void api<DashboardPayload>("/api/dashboard")
      .then(setDashboard)
      .catch((err) => setError(err instanceof Error ? err.message : "Dashboard load failed"));
    void api<{ notifications: NotificationItem[] }>("/api/notifications")
      .then((payload) => setNotifications(payload.notifications))
      .catch(() => setNotifications([]));
  }, [api]);

  useEffect(() => {
    window.localStorage.setItem("audity_widget_customers", String(widgets.customers));
    window.localStorage.setItem("audity_widget_shared", String(widgets.shared));
    window.localStorage.setItem("audity_widget_notifications", String(widgets.notifications));
    window.localStorage.setItem("audity_widget_security", String(widgets.security));
  }, [widgets]);

  const totals = useMemo(() => {
    const assessments = dashboard?.ownedCustomers.flatMap((customer) => customer.assessments) ?? [];
    return {
      assessments: assessments.length,
      critical: assessments.reduce((sum, assessment) => sum + (assessment.criticalRisks ?? 0), 0),
      gaps: assessments.reduce((sum, assessment) => sum + (assessment.evidenceGaps ?? 0), 0),
      overdue: assessments.reduce((sum, assessment) => sum + (assessment.overdueRoadmapItems ?? 0), 0)
    };
  }, [dashboard]);

  async function startMfaSetup() {
    setError("");
    setRecoveryCodes([]);
    try {
      setMfaSetup(await setupMfa());
    } catch (err) {
      setError(err instanceof Error ? err.message : "MFA setup failed");
    }
  }

  async function verifySetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      setRecoveryCodes(await verifyMfaSetup(mfaCode));
    } catch (err) {
      setError(err instanceof Error ? err.message : "MFA verification failed");
    }
  }

  return (
    <>
      <div className="mb-5 border-b border-audity-border pb-4">
        <p className="text-xs font-semibold uppercase text-audity-primary">Workspace Overview</p>
        <h1 className="mt-1 text-2xl font-semibold">Dashboard</h1>
        <p className="mt-2 text-sm text-audity-secondary">
          {user?.email} · {user?.role}
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded-audity border border-[#FF4B00] bg-[#2A1C17] px-3 py-2 text-sm text-[#FFB199]">
          {error}
        </div>
      ) : null}

      {showOnboarding ? (
        <section className="mb-4 rounded-audity border border-audity-primary bg-audity-panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-audity-primary">First Setup</p>
              <h2 className="mt-1 text-lg font-semibold">Start a clean audit workspace</h2>
              <div className="mt-3 grid gap-2 md:grid-cols-4">
                {["Review User Settings", "Create or open Customer", "Start Assessment", "Answer Questions"].map((step, index) => (
                  <div key={step} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                    <p className="text-xs font-semibold text-audity-muted">Step {index + 1}</p>
                    <p className="mt-1 text-sm text-audity-secondary">{step}</p>
                  </div>
                ))}
              </div>
            </div>
            <button
              className="h-9 rounded-audity border border-audity-borderStrong px-3 text-sm text-audity-primary"
              onClick={() => {
                window.localStorage.setItem("audity_onboarding_done", "true");
                setShowOnboarding(false);
              }}
            >
              Dismiss
            </button>
          </div>
        </section>
      ) : null}

      <section className="mb-4 rounded-audity border border-audity-border bg-audity-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Dashboard Widgets</h2>
            <p className="mt-1 text-xs text-audity-muted">
              {totals.assessments} assessments · {totals.critical} critical risks · {totals.gaps} evidence gaps · {totals.overdue} overdue actions
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {([
              ["customers", "Customers"],
              ["shared", "Shared"],
              ["notifications", "Notifications"],
              ["security", "Security"]
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-audity-secondary">
                <input type="checkbox" checked={widgets[key]} onChange={(event) => setWidgets({ ...widgets, [key]: event.target.checked })} />
                {label}
              </label>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        {widgets.customers ? (
        <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
          <div className="mb-4 border-b border-audity-border pb-3">
            <p className="text-xs font-semibold uppercase text-audity-muted">In Progress</p>
            <h2 className="mt-1 text-lg font-semibold">My Customers & Assessments</h2>
          </div>
          <div className="space-y-3">
            {dashboard?.ownedCustomers.map((customer) => (
              <div key={customer.customerId} className="rounded-audity border border-audity-border bg-audity-page p-3">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link className="text-sm font-semibold text-audity-text hover:text-audity-primary" to={`/customers/${customer.customerId}`}>
                      {customer.customerName}
                    </Link>
                    <p className="mt-1 text-xs text-audity-muted">Customer status: {customer.customerStatus}</p>
                  </div>
                  <div className="max-w-md text-right text-xs text-audity-secondary">
                    {customer.sharedWith.length ? (
                      <span>Shared with {customer.sharedWith.map((shared) => shared.name || shared.email).join(", ")}</span>
                    ) : (
                      <span>Not shared</span>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  {customer.assessments.map((assessment) => (
                    <Link
                      key={assessment.id}
                      className="block rounded-audity border border-audity-border bg-audity-panel px-3 py-2 hover:border-audity-primary"
                      to={`/assessments/${assessment.id}/questions`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-semibold">{assessment.type}</span>
                        <span className="shrink-0 text-xs text-audity-secondary">{assessment.progressPercent ?? 0}%</span>
                      </div>
                      <ProgressBar value={assessment.progressPercent ?? 0} />
                      <div className="mt-2 flex flex-wrap gap-1">
                        <SignalPill label="Critical" value={assessment.criticalRisks ?? 0} tone={(assessment.criticalRisks ?? 0) > 0 ? "error" : "neutral"} />
                        <SignalPill label="High/Critical" value={assessment.openHighRisks ?? 0} tone={(assessment.openHighRisks ?? 0) > 0 ? "warning" : "neutral"} />
                        <SignalPill label="Findings" value={assessment.openFindings ?? 0} />
                        <SignalPill label="Evidence gaps" value={assessment.evidenceGaps ?? 0} tone={(assessment.evidenceGaps ?? 0) > 0 ? "warning" : "neutral"} />
                        <SignalPill label="Overdue" value={assessment.overdueRoadmapItems ?? 0} tone={(assessment.overdueRoadmapItems ?? 0) > 0 ? "error" : "neutral"} />
                      </div>
                      <p className="mt-2 text-xs text-audity-muted">
                        {assessment.framework ?? "No framework"} · {assessment.status}
                        {assessment.targetDate ? ` · Target ${assessment.targetDate}` : ""}
                        {assessment.reports ? ` · ${assessment.reports} reports` : ""}
                      </p>
                    </Link>
                  ))}
                  {!customer.assessments.length ? (
                    <p className="rounded-audity border border-audity-border bg-audity-panel px-3 py-4 text-sm text-audity-muted">
                      No assessment running
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
            {!dashboard?.ownedCustomers.length ? (
              <p className="py-10 text-center text-sm text-audity-muted">No customers in progress</p>
            ) : null}
          </div>
        </section>
        ) : <div />}

        <aside className="space-y-4">
          {widgets.notifications ? (
          <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
            <div className="mb-4 border-b border-audity-border pb-3">
              <p className="text-xs font-semibold uppercase text-audity-muted">Notifications</p>
              <h2 className="mt-1 text-lg font-semibold">Review & Due Updates</h2>
            </div>
            <div className="space-y-2">
              {notifications.slice(0, 5).map((notification) => (
                <div key={notification.id} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-audity-primary">{notification.title}</p>
                    {!notification.readAt ? <span className="rounded-audity border border-audity-warning px-2 py-0.5 text-[11px] text-audity-warning">New</span> : null}
                  </div>
                  <p className="mt-1 text-xs text-audity-secondary">{notification.message}</p>
                </div>
              ))}
              {!notifications.length ? <p className="py-6 text-center text-sm text-audity-muted">No notifications</p> : null}
            </div>
          </section>
          ) : null}
          {widgets.shared ? (
          <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
            <div className="mb-4 border-b border-audity-border pb-3">
              <p className="text-xs font-semibold uppercase text-audity-muted">Shared</p>
              <h2 className="mt-1 text-lg font-semibold">Customers Shared With Me</h2>
            </div>
            <div className="space-y-2">
              {dashboard?.sharedCustomers.map((customer) => (
                <Link
                  key={customer.id}
                  className="block rounded-audity border border-audity-border bg-audity-page px-3 py-3 hover:border-audity-primary"
                  to={`/customers/${customer.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-audity-text">{customer.name}</p>
                      <p className="mt-1 text-xs text-audity-muted">
                        Owner: {customer.ownerName ?? customer.ownerEmail ?? "Unknown"}
                      </p>
                    </div>
                    <span className="text-xs text-audity-secondary">{customer.assessments.length} assessments</span>
                  </div>
                </Link>
              ))}
              {!dashboard?.sharedCustomers.length ? (
                <p className="py-8 text-center text-sm text-audity-muted">No shared customers</p>
              ) : null}
            </div>
          </section>
          ) : null}

          {widgets.security ? (
          <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
            <div className="mb-4 border-b border-audity-border pb-3">
              <p className="text-xs font-semibold uppercase text-audity-muted">Security</p>
              <h2 className="mt-1 text-lg font-semibold">Authenticator MFA</h2>
            </div>
            <button
              className="h-9 rounded-audity bg-audity-primary px-3 text-sm font-semibold text-white hover:bg-audity-primaryHover"
              onClick={() => void startMfaSetup()}
            >
              Set up MFA
            </button>
            {mfaSetup ? (
              <form className="mt-4 space-y-3" onSubmit={(event) => void verifySetup(event)}>
                <img
                  className="h-40 w-40 rounded-audity border border-audity-border bg-white p-2"
                  src={mfaSetup.qrCodeDataUrl}
                  alt="MFA QR code"
                />
                <div className="rounded-audity border border-audity-border bg-audity-page p-2 font-mono text-xs text-audity-secondary">
                  {mfaSetup.secret}
                </div>
                <input
                  className="h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm text-audity-text outline-none focus:border-audity-primary"
                  value={mfaCode}
                  inputMode="numeric"
                  placeholder="Authenticator code"
                  onChange={(event) => setMfaCode(event.target.value)}
                />
                <button className="h-9 rounded-audity border border-audity-borderStrong bg-audity-panelAlt px-3 text-sm text-audity-text hover:border-audity-primary">
                  Verify MFA
                </button>
              </form>
            ) : null}
            {recoveryCodes.length ? (
              <div className="mt-4 rounded-audity border border-audity-border bg-audity-page p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-audity-muted">Recovery codes</p>
                <div className="grid gap-1 font-mono text-xs text-audity-secondary">
                  {recoveryCodes.map((code) => (
                    <span key={code}>{code}</span>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
          ) : null}
        </aside>
      </div>

    </>
  );
}
