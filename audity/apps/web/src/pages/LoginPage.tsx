import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { BrandMark } from "../components/BrandMark";

const apiBaseUrl = import.meta.env.VITE_AUDITY_API_URL ?? "http://localhost:3000";

export function LoginPage() {
  const navigate = useNavigate();
  const { accessToken, csrfToken, login, setupInitialAdmin, verifyMfaChallenge } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("Instance Admin");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [setupRequired, setSetupRequired] = useState(false);
  const [setupStep, setSetupStep] = useState<"account" | "optional">("account");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [sender, setSender] = useState("");
  const [headerText, setHeaderText] = useState("Audity Assessment Report");
  const [footerText, setFooterText] = useState("Confidential");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${apiBaseUrl}/api/auth/setup-status`)
      .then((response) => response.json())
      .then((payload: { setupRequired?: boolean }) => setSetupRequired(Boolean(payload.setupRequired)))
      .catch(() => setSetupRequired(false));
  }, []);

  async function handleSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await setupInitialAdmin({ email, name, password });
      setSetupStep("optional");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setLoading(false);
    }
  }

  async function saveOptionalSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const token = accessToken ?? window.localStorage.getItem("audity_access_token");
      const csrf = csrfToken ?? window.localStorage.getItem("audity_csrf_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token && csrf) {
        headers.Authorization = `Bearer ${token}`;
        headers["X-CSRF-Token"] = csrf;
      }
      if (smtpHost || smtpUser || sender) {
        await fetch(`${apiBaseUrl}/api/admin/email-settings`, {
          method: "PUT",
          credentials: "include",
          headers,
          body: JSON.stringify({
            smtpHost,
            smtpPort: 587,
            smtpTls: true,
            smtpUser,
            smtpPassword: smtpPassword || undefined,
            sender
          })
        });
      }
      await fetch(`${apiBaseUrl}/api/admin/branding`, {
        method: "PUT",
        credentials: "include",
        headers,
        body: JSON.stringify({ headerText, footerText })
      });
      navigate("/alpha-disclaimer", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Optional setup failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login(email, password);
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
      <section className="mx-auto grid min-h-[calc(100vh-48px)] max-w-6xl grid-cols-1 items-center gap-5 px-5 py-8 lg:grid-cols-[1fr_420px]">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-audity-primary">
            Self-hosted audit workspace
          </p>
          <h1 className="max-w-3xl text-3xl font-semibold text-audity-text">
            Secure access for assessment teams
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-audity-secondary">
            Sign in to manage customers, assessments, evidence, findings, risks, and reports in the Audity beta workspace.
          </p>
        </div>
        <form
          onSubmit={setupRequired ? (setupStep === "account" ? handleSetup : saveOptionalSetup) : challengeToken ? handleMfaSubmit : handleSubmit}
          className="rounded-audity border border-audity-border bg-audity-panel p-5"
        >
          <div className="mb-5 border-b border-audity-border pb-4">
            <h2 className="text-xl font-semibold">{setupRequired ? "Setup Wizard" : challengeToken ? "MFA Challenge" : "Login"}</h2>
            <p className="mt-1 text-sm text-audity-secondary">
              {setupRequired ? "Create the first admin account, then optionally configure SMTP and branding." : challengeToken ? "Enter the authenticator code for this account." : "Use your Audity account credentials."}
            </p>
          </div>
          {setupRequired && setupStep === "optional" ? (
            <>
              <label className="mb-2 block text-xs font-semibold uppercase text-audity-secondary">SMTP Host</label>
              <input className="mb-3 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm text-audity-text outline-none focus:border-audity-primary" value={smtpHost} onChange={(event) => setSmtpHost(event.target.value)} />
              <label className="mb-2 block text-xs font-semibold uppercase text-audity-secondary">SMTP User</label>
              <input className="mb-3 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm text-audity-text outline-none focus:border-audity-primary" value={smtpUser} onChange={(event) => setSmtpUser(event.target.value)} />
              <label className="mb-2 block text-xs font-semibold uppercase text-audity-secondary">SMTP Password</label>
              <input className="mb-3 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm text-audity-text outline-none focus:border-audity-primary" type="password" value={smtpPassword} onChange={(event) => setSmtpPassword(event.target.value)} />
              <label className="mb-2 block text-xs font-semibold uppercase text-audity-secondary">Sender</label>
              <input className="mb-3 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm text-audity-text outline-none focus:border-audity-primary" value={sender} onChange={(event) => setSender(event.target.value)} />
              <label className="mb-2 block text-xs font-semibold uppercase text-audity-secondary">Report Header</label>
              <input className="mb-3 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm text-audity-text outline-none focus:border-audity-primary" value={headerText} onChange={(event) => setHeaderText(event.target.value)} />
              <label className="mb-2 block text-xs font-semibold uppercase text-audity-secondary">Report Footer</label>
              <input className="h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm text-audity-text outline-none focus:border-audity-primary" value={footerText} onChange={(event) => setFooterText(event.target.value)} />
            </>
          ) : challengeToken ? (
            <>
              <label className="mb-2 block text-xs font-semibold uppercase text-audity-secondary">
                Authenticator code
              </label>
              <input
                className="h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm text-audity-text outline-none focus:border-audity-primary"
                value={mfaCode}
                inputMode="numeric"
                autoComplete="one-time-code"
                onChange={(event) => setMfaCode(event.target.value)}
              />
            </>
          ) : (
            <>
              <label className="mb-2 block text-xs font-semibold uppercase text-audity-secondary">
                Email
              </label>
              <input
                className="mb-4 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm text-audity-text outline-none focus:border-audity-primary"
                type="email"
                value={email}
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
              />
              {setupRequired ? (
                <>
                  <label className="mb-2 block text-xs font-semibold uppercase text-audity-secondary">
                    Name
                  </label>
                  <input
                    className="mb-4 h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm text-audity-text outline-none focus:border-audity-primary"
                    value={name}
                    autoComplete="name"
                    onChange={(event) => setName(event.target.value)}
                  />
                </>
              ) : null}
              <label className="mb-2 block text-xs font-semibold uppercase text-audity-secondary">
                Password
              </label>
              <input
                className="h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm text-audity-text outline-none focus:border-audity-primary"
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
              />
            </>
          )}
          {error ? (
            <div className="mt-4 rounded-audity border border-[#FF4B00] bg-[#2A1C17] px-3 py-2 text-sm text-[#FFB199]">
              {error}
            </div>
          ) : null}
          <button
            className="mt-5 h-9 w-full rounded-audity bg-audity-primary px-3 text-sm font-semibold text-white hover:bg-audity-primaryHover disabled:bg-audity-borderStrong disabled:text-audity-muted"
            type="submit"
            disabled={loading}
          >
            {loading ? "Working" : setupRequired && setupStep === "optional" ? "Save and continue" : setupRequired ? "Create admin" : challengeToken ? "Verify" : "Sign in"}
          </button>
          {setupRequired && setupStep === "optional" ? (
            <button className="mt-2 h-9 w-full rounded-audity border border-audity-borderStrong bg-audity-panelAlt px-3 text-sm text-audity-text hover:border-audity-primary" type="button" onClick={() => navigate("/alpha-disclaimer", { replace: true })}>
              Skip optional setup
            </button>
          ) : null}
        </form>
      </section>
    </main>
  );
}
