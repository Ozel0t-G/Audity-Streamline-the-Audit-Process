import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import loginBackground from "../assets/login_bg.gif";
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
  const [showVerify, setShowVerify] = useState(false);
  const [verifyPhrase, setVerifyPhrase] = useState("");
  const [verifyResult, setVerifyResult] = useState<
    | null
    | {
        ok: boolean;
        matchesInstance: boolean;
        message: string;
        fingerprint?: string;
      }
  >(null);
  const [verifyLoading, setVerifyLoading] = useState(false);

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

  async function handleVerifyPhrase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVerifyResult(null);
    setVerifyLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/recovery-phrase/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phrase: verifyPhrase })
      });
      const payload = (await response.json()) as {
        valid?: boolean;
        matchesInstance?: boolean;
        fingerprint?: string;
        message?: string;
      };
      if (!response.ok) {
        setVerifyResult({
          ok: false,
          matchesInstance: false,
          message: payload.message ?? "Verification failed."
        });
        return;
      }
      if (!payload.valid) {
        setVerifyResult({
          ok: false,
          matchesInstance: false,
          message: payload.message ?? "Phrase is invalid (checksum mismatch)."
        });
        return;
      }
      setVerifyResult({
        ok: true,
        matchesInstance: !!payload.matchesInstance,
        fingerprint: payload.fingerprint,
        message: payload.matchesInstance
          ? "Phrase is valid and matches this instance."
          : "Phrase is valid, but does NOT match this instance's encryption key."
      });
    } catch (err) {
      setVerifyResult({
        ok: false,
        matchesInstance: false,
        message: err instanceof Error ? err.message : "Verification failed."
      });
    } finally {
      setVerifyLoading(false);
    }
  }

  return (
    <main
      className="relative min-h-screen overflow-hidden bg-audity-app bg-cover bg-center text-audity-text"
      style={{ backgroundImage: `url(${loginBackground})` }}
    >
      <div className="pointer-events-none absolute inset-0 bg-slate-950/30" aria-hidden="true" />
      <div className="relative z-10 min-h-screen">
      <header className="flex h-12 items-center border-b border-audity-border bg-audity-topnav/90 px-5 backdrop-blur-sm">
        <div className="flex items-center">
          <BrandMark />
        </div>
      </header>
      <section className="mx-auto grid min-h-[calc(100vh-44px)] max-w-5xl grid-cols-1 items-center gap-4 px-4 py-7 lg:grid-cols-[1fr_380px]">
        <div>
          <p className="mb-2 text-xs font-medium text-audity-primary">Self-hosted GRC workspace</p>
          <h1 className="text-3xl font-semibold leading-tight">Sign in to Audity</h1>
          <p className="mt-3 max-w-xl text-sm text-audity-secondary">
            Audity is a local-first audit workspace. Sign in to continue your assessments, findings, evidence collection
            and report deliveries.
          </p>
        </div>
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
      <section className="mx-auto max-w-5xl px-4 pb-8">
        <button
          type="button"
          className="text-xs font-medium text-audity-secondary underline-offset-2 hover:underline"
          onClick={() => {
            setShowVerify((value) => !value);
            setVerifyResult(null);
          }}
        >
          {showVerify ? "Hide recovery-phrase verification" : "Verify your recovery phrase"}
        </button>
        {showVerify ? (
          <form
            className="mt-3 rounded-audity border border-audity-border bg-audity-panel/95 p-4 shadow-lg backdrop-blur-sm"
            onSubmit={handleVerifyPhrase}
          >
            <p className="mb-3 text-xs text-audity-secondary">
              Paste your 72-character recovery phrase to confirm it is valid and matches the current
              instance encryption key. This does NOT log you in — it only checks the phrase.
            </p>
            <textarea
              className="audity-input min-h-[5rem] font-mono text-sm"
              value={verifyPhrase}
              onChange={(event) => setVerifyPhrase(event.target.value)}
              placeholder="xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxx"
            />
            {verifyResult ? (
              <div
                className={`mt-3 rounded-audity border px-3 py-2 text-sm ${
                  verifyResult.ok && verifyResult.matchesInstance
                    ? "border-audity-success bg-audity-success/10 text-audity-success"
                    : verifyResult.ok
                    ? "border-audity-warning bg-audity-warning/10 text-audity-warning"
                    : "border-audity-error bg-audity-error/10 text-audity-error"
                }`}
              >
                <div>{verifyResult.message}</div>
                {verifyResult.fingerprint ? (
                  <div className="mt-1 font-mono text-xs">Fingerprint: {verifyResult.fingerprint}</div>
                ) : null}
              </div>
            ) : null}
            <div className="mt-3 flex gap-2">
              <button className="audity-btn-primary" disabled={verifyLoading || !verifyPhrase.trim()}>
                {verifyLoading ? "Verifying…" : "Verify phrase"}
              </button>
              <button
                type="button"
                className="audity-btn-secondary"
                onClick={() => {
                  setVerifyPhrase("");
                  setVerifyResult(null);
                }}
              >
                Clear
              </button>
            </div>
          </form>
        ) : null}
      </section>
      </div>
    </main>
  );
}
