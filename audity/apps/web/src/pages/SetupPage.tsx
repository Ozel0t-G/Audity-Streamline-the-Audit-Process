import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { BrandMark } from "../components/BrandMark";

const apiBaseUrl = import.meta.env.VITE_AUDITY_API_URL ?? "";

type RecoveryPhraseResponse = {
  phrase: string;
  fingerprint: string;
  fingerprintShort: string;
  acknowledgedAt: string | null;
};

export function SetupPage() {
  const navigate = useNavigate();
  const { csrfToken, setupInitialAdmin } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("Instance Admin");
  const [password, setPassword] = useState("");
  const [headerText, setHeaderText] = useState("Audity Assessment Report");
  const [footerText, setFooterText] = useState("Confidential");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [sender, setSender] = useState("");
  const [step, setStep] = useState<"account" | "phrase" | "optional">("account");
  const [strength, setStrength] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [phrase, setPhrase] = useState<string>("");
  const [phraseFingerprint, setPhraseFingerprint] = useState<string>("");
  const [phraseConfirmed, setPhraseConfirmed] = useState<boolean>(false);

  useEffect(() => {
    fetch(`${apiBaseUrl}/api/auth/setup-status`)
      .then((response) => response.json())
      .then((payload: { setupRequired?: boolean }) => {
        if (!payload.setupRequired) navigate("/login", { replace: true });
      })
      .catch(() => undefined);
  }, [navigate]);

  function evaluateStrength(value: string) {
    let score = 0;
    if (value.length >= 8) score++;
    if (value.length >= 12) score++;
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
    if (/\d/.test(value)) score++;
    if (/[^A-Za-z0-9]/.test(value)) score++;
    return Math.min(score, 4);
  }

  async function loadRecoveryPhrase() {
    const response = await fetch(`${apiBaseUrl}/api/auth/recovery-phrase`, {
      credentials: "include"
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail?.message ?? "Could not load recovery phrase.");
    }
    const payload = (await response.json()) as RecoveryPhraseResponse;
    setPhrase(payload.phrase);
    setPhraseFingerprint(payload.fingerprintShort);
  }

  async function handleAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (strength < 3) {
      setError("Choose a stronger password (use length, numbers, and symbols).");
      return;
    }
    setLoading(true);
    try {
      await setupInitialAdmin({ email, name, password });
      await loadRecoveryPhrase();
      setStep("phrase");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleAcknowledgePhrase() {
    setError("");
    if (!phraseConfirmed) {
      setError("Please confirm that you stored the recovery phrase in a safe place.");
      return;
    }
    setLoading(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
      const response = await fetch(`${apiBaseUrl}/api/auth/recovery-phrase/acknowledge`, {
        method: "POST",
        credentials: "include",
        headers
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail?.message ?? "Acknowledgement failed.");
      }
      setStep("optional");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not acknowledge recovery phrase.");
    } finally {
      setLoading(false);
    }
  }

  async function handleOptional(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
      if (smtpHost) {
        await fetch(`${apiBaseUrl}/api/admin/email-settings`, {
          method: "PUT",
          credentials: "include",
          headers,
          body: JSON.stringify({
            smtpHost,
            smtpPort: 587,
            smtpTls: true,
            smtpUser,
            smtpPassword,
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

  return (
    <main className="min-h-screen bg-audity-app text-audity-text">
      <header className="flex h-12 items-center border-b border-audity-border bg-audity-topnav px-5">
        <div className="flex items-center gap-3">
          <BrandMark />
          <span className="text-sm font-semibold">Audity · First-start setup</span>
        </div>
      </header>
      <section className="mx-auto grid min-h-[calc(100vh-44px)] max-w-3xl items-center px-4 py-7">
        {step === "account" ? (
          <form className="rounded-audity border border-audity-border bg-audity-panel p-6" onSubmit={handleAccount}>
            <h1 className="mb-4 text-xl font-semibold">Create the initial Instance Admin</h1>
            <label className="mb-2 block text-xs font-medium text-audity-secondary">Admin name</label>
            <input className="mb-3 audity-input" value={name} onChange={(event) => setName(event.target.value)} />
            <label className="mb-2 block text-xs font-medium text-audity-secondary">Admin email</label>
            <input className="mb-3 audity-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <label className="mb-2 block text-xs font-medium text-audity-secondary">Admin password</label>
            <input
              className="mb-2 audity-input"
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setStrength(evaluateStrength(event.target.value));
              }}
              minLength={8}
              required
            />
            <PasswordStrength value={strength} />
            {error ? <p className="mt-3 text-sm text-audity-error">{error}</p> : null}
            <button className="mt-4 w-full audity-btn-primary" disabled={loading}>
              Create admin and continue
            </button>
          </form>
        ) : step === "phrase" ? (
          <div className="rounded-audity border border-audity-border bg-audity-panel p-6">
            <h1 className="mb-2 text-xl font-semibold">Save your recovery phrase</h1>
            <p className="mb-4 text-sm text-audity-secondary">
              This phrase encodes the encryption key that protects archives and backups. Without it,
              encrypted exports cannot be restored after a fresh install. Audity cannot recover it
              for you — store it in a password manager, printed envelope, or other safe location.
            </p>
            <div className="mb-4 rounded-audity border border-audity-warning/40 bg-audity-warning/10 p-4">
              <ul className="list-inside list-disc space-y-1 text-xs text-audity-warning">
                <li>Anyone with this phrase can decrypt your archives. Treat it like a master password.</li>
                <li>Do not store it in the same place as your admin password.</li>
                <li>You can re-display it any time under Admin → System Monitor.</li>
              </ul>
            </div>
            <div className="mb-4 rounded-audity border border-audity-border bg-audity-page p-4 font-mono text-base leading-relaxed text-audity-text">
              {phrase ? phrase.split("-").map((block, idx) => (
                <div key={`${idx}-${block}`} className="flex">
                  <span className="w-8 text-audity-muted">{(idx + 1).toString().padStart(2, " ")}.</span>
                  <span className="tracking-wider">{block}</span>
                </div>
              )) : <span className="text-audity-muted">Loading…</span>}
            </div>
            <div className="mb-4 text-xs text-audity-secondary">
              Fingerprint: <span className="font-mono text-audity-text">{phraseFingerprint}</span>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="audity-btn-secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(phrase);
                  } catch {
                    /* ignore clipboard errors */
                  }
                }}
              >
                Copy phrase
              </button>
              <button
                type="button"
                className="audity-btn-secondary"
                onClick={() => window.print()}
              >
                Print
              </button>
            </div>
            <label className="mb-4 flex items-start gap-2 text-sm text-audity-text">
              <input
                type="checkbox"
                className="mt-1"
                checked={phraseConfirmed}
                onChange={(event) => setPhraseConfirmed(event.target.checked)}
              />
              <span>
                I have stored this recovery phrase in a safe place outside this server.
                I understand that without it, encrypted archives cannot be restored.
              </span>
            </label>
            {error ? <p className="mb-3 text-sm text-audity-error">{error}</p> : null}
            <button
              type="button"
              className="w-full audity-btn-primary"
              disabled={loading || !phraseConfirmed}
              onClick={handleAcknowledgePhrase}
            >
              I saved the phrase — continue
            </button>
          </div>
        ) : (
          <form className="rounded-audity border border-audity-border bg-audity-panel p-6" onSubmit={handleOptional}>
            <h1 className="mb-4 text-xl font-semibold">Optional: SMTP &amp; report branding</h1>
            <label className="mb-2 block text-xs font-medium text-audity-secondary">SMTP Host</label>
            <input className="mb-3 audity-input" value={smtpHost} onChange={(event) => setSmtpHost(event.target.value)} />
            <label className="mb-2 block text-xs font-medium text-audity-secondary">SMTP User</label>
            <input className="mb-3 audity-input" value={smtpUser} onChange={(event) => setSmtpUser(event.target.value)} />
            <label className="mb-2 block text-xs font-medium text-audity-secondary">SMTP Password</label>
            <input className="mb-3 audity-input" type="password" value={smtpPassword} onChange={(event) => setSmtpPassword(event.target.value)} />
            <label className="mb-2 block text-xs font-medium text-audity-secondary">Sender</label>
            <input className="mb-3 audity-input" value={sender} onChange={(event) => setSender(event.target.value)} />
            <label className="mb-2 block text-xs font-medium text-audity-secondary">Report Header</label>
            <input className="mb-3 audity-input" value={headerText} onChange={(event) => setHeaderText(event.target.value)} />
            <label className="mb-2 block text-xs font-medium text-audity-secondary">Report Footer</label>
            <input className="audity-input" value={footerText} onChange={(event) => setFooterText(event.target.value)} />
            {error ? <p className="mt-3 text-sm text-audity-error">{error}</p> : null}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button className="audity-btn-primary" disabled={loading}>Save and continue</button>
              <button
                className="audity-btn-secondary"
                type="button"
                onClick={() => navigate("/alpha-disclaimer", { replace: true })}
              >
                Skip optional setup
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}

export function PasswordStrength({ value }: { value: number }) {
  const labels = ["Too short", "Weak", "Okay", "Good", "Strong"];
  const colors = ["bg-audity-error", "bg-audity-error", "bg-audity-warning", "bg-audity-primary", "bg-audity-success"];
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-audity-page">
        {[0, 1, 2, 3].map((segment) => (
          <span
            key={segment}
            className={`h-full flex-1 ${segment < value ? colors[Math.min(value, colors.length - 1)] : "bg-transparent"}`}
          />
        ))}
      </div>
      <span className="text-xs font-semibold text-audity-muted">{labels[value]}</span>
    </div>
  );
}
