import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export function AlphaDisclaimerPage() {
  const navigate = useNavigate();
  const { acceptAlphaDisclaimer, logout } = useAuth();
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");

  async function continueToApp() {
    setError("");
    try {
      await acceptAlphaDisclaimer();
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Acceptance failed");
    }
  }

  return (
    <main className="min-h-screen bg-audity-app p-5 text-audity-text">
      <section className="mx-auto mt-16 max-w-2xl rounded-audity border border-audity-border bg-audity-panel p-5">
        <p className="text-xs font-semibold uppercase text-audity-primary">Alpha Notice</p>
        <h1 className="mt-1 text-2xl font-semibold">Audity Alpha Limitations</h1>
        <div className="mt-4 space-y-2 text-sm leading-6 text-audity-secondary">
          <p>This build is for controlled beta testing and may contain incomplete workflows, security limitations, and changing data models.</p>
          <p>Do not use placeholder secrets, production customer evidence, or regulated data until hardening and review are complete.</p>
          <p>Framework content and scoring are assessment aids and do not replace licensed standards or professional judgement.</p>
        </div>
        <label className="mt-5 flex items-start gap-2 text-sm text-audity-secondary">
          <input className="mt-1" type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
          <span>I understand and accept the alpha limitations for this test environment.</span>
        </label>
        {error ? <div className="mt-4 rounded-audity border border-audity-error bg-audity-error/10 px-3 py-2 text-sm text-audity-error">{error}</div> : null}
        <div className="mt-5 flex gap-2">
          <button className="audity-btn-primary" disabled={!accepted} onClick={() => void continueToApp()}>
            Accept and continue
          </button>
          <button
            className="audity-btn-secondary"
            onClick={() => void logout().finally(() => navigate("/login", { replace: true }))}
          >
            Logout
          </button>
        </div>
      </section>
    </main>
  );
}
