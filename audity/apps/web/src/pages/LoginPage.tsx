import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import lockupDark from "../assets/audity-lockup-dark.svg";
import lockupLight from "../assets/audity-lockup-light.svg";

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
    <main className="relative min-h-screen overflow-hidden bg-audity-app text-audity-text">
      <div className="audity-login-bg" aria-hidden="true">
        <div className="audity-login-bg__blobs">
          <span className="audity-login-bg__blob-c" />
        </div>
        <div className="audity-login-bg__grid" />
        <div className="audity-login-bg__noise" />
      </div>
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="flex justify-center" style={{ marginBottom: "20px" }} aria-label="Audity">
        <img className="block h-14 w-auto dark:hidden" src={lockupLight} alt="Audity" />
        <img className="hidden h-14 w-auto dark:block" src={lockupDark} alt="Audity" />
      </div>
      <section className="w-full max-w-sm">
        <form className="rounded-audity border border-audity-border bg-audity-panel/95 p-5 shadow-xl backdrop-blur-sm" onSubmit={challengeToken ? handleMfaSubmit : handleSubmit}>
          {notice ? <div className="mb-3 rounded-audity border border-audity-warning bg-audity-warning/10 px-3 py-2 text-sm text-audity-warning">{notice}</div> : null}
          {error ? <div className="mb-3 rounded-audity border border-audity-error bg-audity-error/10 px-3 py-2 text-sm text-audity-error">{error}</div> : null}
          {challengeToken ? (
            <>
              <label className="mb-2 block text-xs font-medium text-audity-secondary">Authenticator code</label>
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
              <label className="mb-2 block text-xs font-medium text-audity-secondary">Email</label>
              <input className="mb-3 audity-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
              <label className="mb-2 block text-xs font-medium text-audity-secondary">Password</label>
              <input className="audity-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
              <button className="mt-3 w-full audity-btn-primary" disabled={loading}>
                Sign in
              </button>
            </>
          )}
        </form>
      </section>
      </div>
    </main>
  );
}
