import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { BrandMark } from "../components/BrandMark";

export function LoginPage() {
  const navigate = useNavigate();
  const { login, verifyMfaChallenge } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
          onSubmit={challengeToken ? handleMfaSubmit : handleSubmit}
          className="rounded-audity border border-audity-border bg-audity-panel p-5"
        >
          <div className="mb-5 border-b border-audity-border pb-4">
            <h2 className="text-xl font-semibold">{challengeToken ? "MFA Challenge" : "Login"}</h2>
            <p className="mt-1 text-sm text-audity-secondary">
              {challengeToken ? "Enter the authenticator code for this account." : "Use your Audity account credentials."}
            </p>
          </div>
          {challengeToken ? (
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
            {loading ? "Working" : challengeToken ? "Verify" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
