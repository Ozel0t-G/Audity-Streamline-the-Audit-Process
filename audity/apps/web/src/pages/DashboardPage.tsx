import { FormEvent, useEffect, useState } from "react";
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

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-audity-page">
      <div className="h-full bg-audity-primary" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function DashboardPage() {
  const { user, setupMfa, verifyMfaSetup } = useAuth();
  const api = useApi();
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
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
  }, [api]);

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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
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
                      <p className="mt-2 text-xs text-audity-muted">
                        {assessment.framework ?? "No framework"} · {assessment.status}
                        {assessment.targetDate ? ` · Target ${assessment.targetDate}` : ""}
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

        <aside className="space-y-4">
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
        </aside>
      </div>

    </>
  );
}
