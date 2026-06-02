import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { BrandMark } from "../components/BrandMark";

export function DashboardPage() {
  const { user, logout, setupMfa, verifyMfaSetup } = useAuth();
  const [mfaSetup, setMfaSetup] = useState<{
    secret: string;
    otpauthUrl: string;
    qrCodeDataUrl: string;
  } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState("");

  async function startMfaSetup() {
    setError("");
    setRecoveryCodes([]);
    try {
      setMfaSetup(await setupMfa());
    } catch (err) {
      setError(err instanceof Error ? err.message : "MFA setup failed");
    }
  }

  async function verifySetup() {
    setError("");
    try {
      setRecoveryCodes(await verifyMfaSetup(mfaCode));
    } catch (err) {
      setError(err instanceof Error ? err.message : "MFA verification failed");
    }
  }

  return (
    <main className="min-h-screen bg-audity-app text-audity-text">
      <header className="flex h-12 items-center justify-between border-b border-audity-border bg-audity-topnav px-5">
        <div className="flex items-center gap-3">
          <BrandMark />
          <span className="text-sm font-semibold">Audity</span>
        </div>
        <button
          className="h-8 rounded-audity border border-audity-borderStrong bg-audity-panel px-3 text-sm text-audity-secondary hover:border-audity-primary hover:text-audity-text"
          onClick={() => void logout()}
        >
          Logout
        </button>
      </header>
      <div className="grid min-h-[calc(100vh-48px)] grid-cols-1 lg:grid-cols-[260px_1fr]">
        <aside className="border-r border-audity-border bg-audity-sidebar p-5">
          <p className="mb-3 text-xs font-semibold uppercase text-audity-muted">Workspace</p>
          <div className="rounded-audity bg-audity-primaryActive px-3 py-2 text-sm font-semibold">
            Dashboard
          </div>
          <Link className="mt-1 block rounded-audity px-3 py-2 text-sm text-audity-secondary hover:bg-audity-panel" to="/customers">Customers</Link>
          <Link className="mt-1 block rounded-audity px-3 py-2 text-sm text-audity-secondary hover:bg-audity-panel" to="/frameworks">Framework Library</Link>
          <Link className="mt-1 block rounded-audity px-3 py-2 text-sm text-audity-secondary hover:bg-audity-panel" to="/admin">Admin</Link>
        </aside>
        <section className="bg-audity-page p-5">
          <div className="mb-5 border-b border-audity-border pb-4">
            <p className="text-xs font-semibold uppercase text-audity-primary">Authenticated</p>
            <h1 className="mt-1 text-2xl font-semibold">Dashboard</h1>
            <p className="mt-2 text-sm text-audity-secondary">
              {user?.email} · {user?.role}
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-h-80 rounded-audity border border-audity-border bg-audity-panel" />
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
                <div className="mt-4 space-y-3">
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
                  <button
                    className="h-9 rounded-audity border border-audity-borderStrong bg-audity-panelAlt px-3 text-sm text-audity-text hover:border-audity-primary"
                    onClick={() => void verifySetup()}
                  >
                    Verify MFA
                  </button>
                </div>
              ) : null}
              {recoveryCodes.length ? (
                <div className="mt-4 rounded-audity border border-audity-border bg-audity-page p-3">
                  <p className="mb-2 text-xs font-semibold uppercase text-audity-muted">
                    Recovery codes
                  </p>
                  <div className="grid gap-1 font-mono text-xs text-audity-secondary">
                    {recoveryCodes.map((code) => (
                      <span key={code}>{code}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {error ? (
                <div className="mt-4 rounded-audity border border-[#FF4B00] bg-[#2A1C17] px-3 py-2 text-sm text-[#FFB199]">
                  {error}
                </div>
              ) : null}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
