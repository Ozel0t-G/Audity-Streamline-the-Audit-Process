import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { BrandMark } from "../components/BrandMark";

const apiBaseUrl = import.meta.env.VITE_AUDITY_API_URL ?? "";

export function LoginPage() {
  const navigate = useNavigate();
  const { login, verifyMfaChallenge } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const storedNotice = window.localStorage.getItem("audity_login_notice");
    if (storedNotice) {
      setNotice(storedNotice);
      window.localStorage.removeItem("audity_login_notice");
    }
    fetch(`${apiBaseUrl}/api/auth/setup-status`)
      .then((response) => response.json())
      .then((payload: { setupRequired?: boolean }) => {
        if (payload.setupRequired) navigate("/setup", { replace: true });
      })
      .catch(() => undefined);
  }, [navigate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login(email, password);
      setNotice("");
      if (result.mfaRequired) {
        setChallengeToken(result.challengeToken);
        return;
      }
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await verifyMfaChallenge(challengeToken, mfaCode);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "MFA verification failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-audity-app text-audity-text">
      <header className="flex h-12 items-center border-b border-audity-border bg-audity-topnav px-5">
        <div className="flex items-center gap-3">
          <BrandMark />
          <span className="text-sm font-semibold">Audity</span>
        </div>
      </header>
      <section className="mx-auto grid min-h-[calc(100vh-44px)] max-w-5xl grid-cols-1 items-center gap-4 px-4 py-7 lg:grid-cols-[1fr_380px]">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-audity-primary">Self-hosted GRC workspace</p>
          <h1 className="text-3xl font-semibold leading-tight">Sign in to Audity</h1>
          <p className="mt-3 max-w-xl text-sm text-audity-secondary">
            Audity is a local-first audit workspace. Sign in to continue your assessments, findings, evidence collection
            and report deliveries.
          </p>
        </div>
        <form className="rounded-audity border border-audity-border bg-audity-panel p-5" onSubmit={challengeToken ? handleMfaSubmit : handleSubmit}>
          {notice ? <div className="mb-3 rounded-audity border border-audity-warning bg-audity-warning/10 px-3 py-2 text-sm text-audity-warning">{notice}</div> : null}
          {error ? <div className="mb-3 rounded-audity border border-audity-error bg-audity-error/10 px-3 py-2 text-sm text-audity-error">{error}</div> : null}
          {challengeToken ? (
            <>
              <label className="mb-2 block text-xs font-semibold uppercase text-audity-secondary">Authenticator code</label>
              <input
                className="audity-input"
                value={mfaCode}
                inputMode="numeric"
                autoComplete="one-time-code"
                onChange={(event) => setMfaCode(event.target.value)}
              />
              <button className="mt-3 w-full audity-btn-primary" disabled={loading}>
                Verify code
              </button>
            </>
          ) : (
            <>
              <label className="mb-2 block text-xs font-semibold uppercase text-audity-secondary">Email</label>
              <input className="mb-3 audity-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
              <label className="mb-2 block text-xs font-semibold uppercase text-audity-secondary">Password</label>
              <input className="audity-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
              <button className="mt-3 w-full audity-btn-primary" disabled={loading}>
                Sign in
              </button>
            </>
          )}
        </form>
      </section>
    </main>
  );
}
