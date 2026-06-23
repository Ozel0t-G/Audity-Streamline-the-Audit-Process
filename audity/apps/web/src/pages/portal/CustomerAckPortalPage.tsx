import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

type AckFinding = {
  id: string;
  title: string;
  severityTier: "low" | "medium" | "high" | "critical";
  severityScore: number;
  managementResponse: string | null;
  managementResponseStatus: string | null;
  lifecycleStatus: string | null;
};

type AckBranding = {
  logoUrl: string | null;
  primaryColor: string | null;
  headerText: string | null;
  footerText: string | null;
};

type AckSnapshotMeta = {
  capturedAt: string;
  reportVersion: number;
  readinessScore: number;
  controlCount: number;
  scopeItemCount: number;
  executiveSummary: string;
};

type AckPayload = {
  audit: { customerName: string; assessmentType: string; auditorName: string };
  findings: AckFinding[];
  snapshot: AckSnapshotMeta;
  recipientEmail: string;
  recipientHint: string | null;
  message: string | null;
  expiresAt: string;
  branding: AckBranding;
  tokenStatus: "pending";
};

type AckErrorPayload = {
  code: string;
  message: string;
  redeemedAt?: string;
  revokeReason?: string;
};

const apiBaseUrl = import.meta.env.VITE_AUDITY_API_URL ?? "";

async function rawFetch<T>(path: string, init: RequestInit = {}): Promise<{ ok: boolean; body: T | null; status: number }> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...(init.body ? { "Content-Type": "application/json" } : {})
    }
  });
  let body: T | null = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { ok: response.ok, body, status: response.status };
}

const SEVERITY_STYLE: Record<AckFinding["severityTier"], string> = {
  critical: "border-red-500 bg-red-50 text-red-700",
  high: "border-orange-500 bg-orange-50 text-orange-700",
  medium: "border-yellow-500 bg-yellow-50 text-yellow-700",
  low: "border-emerald-500 bg-emerald-50 text-emerald-700"
};

export function CustomerAckPortalPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<AckPayload | null>(null);
  const [error, setError] = useState<AckErrorPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ signoffId: string; signoffHash: string; receiptUrl: string } | null>(null);

  const [signerName, setSignerName] = useState("");
  const [position, setPosition] = useState("");
  const [comment, setComment] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!token) return;
    void rawFetch<AckPayload | AckErrorPayload>(`/api/portal/ack/${token}`)
      .then(({ ok, body, status }) => {
        if (ok) {
          setData(body as AckPayload);
        } else {
          setError((body as AckErrorPayload) ?? { code: `HTTP_${status}`, message: "Could not load this acknowledgment link." });
        }
      })
      .catch(() =>
        setError({ code: "NETWORK", message: "Network error. Try again." })
      )
      .finally(() => setLoading(false));
  }, [token]);

  const primaryColor = data?.branding.primaryColor ?? "#3b6eea";

  const severityCounts = useMemo(() => {
    if (!data) return { critical: 0, high: 0, medium: 0, low: 0 };
    return data.findings.reduce(
      (counts, f) => ({ ...counts, [f.severityTier]: counts[f.severityTier] + 1 }),
      { critical: 0, high: 0, medium: 0, low: 0 }
    );
  }, [data]);

  async function submit() {
    if (!token || !confirmed) return;
    if (signerName.trim().length < 2) {
      alert("Enter your name (at least 2 characters).");
      return;
    }
    setSubmitting(true);
    const { ok, body, status } = await rawFetch<typeof submitted | AckErrorPayload>(
      `/api/portal/ack/${token}/redeem`,
      {
        method: "POST",
        body: JSON.stringify({
          signerName: signerName.trim(),
          position: position.trim() || undefined,
          comment: comment.trim() || undefined,
          acknowledgmentConfirmed: true
        })
      }
    );
    setSubmitting(false);
    if (ok && body) {
      setSubmitted(body as typeof submitted);
    } else {
      setError((body as AckErrorPayload) ?? { code: `HTTP_${status}`, message: "Could not record acknowledgment." });
    }
  }

  if (loading) {
    return (
      <PortalShell branding={null} title="Loading…">
        <p className="text-gray-500">Please wait…</p>
      </PortalShell>
    );
  }

  if (error) {
    return (
      <PortalShell branding={data?.branding ?? null} title={errorTitle(error.code)}>
        <p className="text-gray-700">{error.message}</p>
        {error.code === "ALREADY_REDEEMED" && error.redeemedAt ? (
          <p className="mt-2 text-sm text-gray-500">
            Recorded on {new Date(error.redeemedAt).toLocaleString()}.
          </p>
        ) : null}
        {error.code === "TOKEN_REVOKED" && error.revokeReason ? (
          <p className="mt-2 text-sm text-gray-500">
            Reason: <em>{error.revokeReason}</em>
          </p>
        ) : null}
        <p className="mt-6 text-xs text-gray-500">
          If you need a new link, please contact the auditor who sent this email.
        </p>
      </PortalShell>
    );
  }

  if (submitted && data) {
    return (
      <PortalShell branding={data.branding} title="Acknowledgment recorded">
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-800">
            ✓ Thank you, {signerName}.
          </p>
          <p className="mt-1 text-sm text-emerald-700">
            Your acknowledgment of the audit report has been recorded. The auditor has
            been notified.
          </p>
        </div>
        <dl className="mt-6 grid gap-3 text-sm text-gray-700 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase text-gray-500">Customer</dt>
            <dd>{data.audit.customerName}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-gray-500">Audit</dt>
            <dd>{data.audit.assessmentType}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-gray-500">Email on record</dt>
            <dd>{data.recipientEmail}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-gray-500">Hash</dt>
            <dd className="break-all font-mono text-xs">{submitted.signoffHash}</dd>
          </div>
        </dl>
        <a
          href={`${apiBaseUrl}${submitted.receiptUrl}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-block rounded-md px-4 py-2 text-sm font-semibold text-white"
          style={{ background: primaryColor }}
        >
          View receipt
        </a>
      </PortalShell>
    );
  }

  if (!data) return null;

  return (
    <PortalShell branding={data.branding} title="Audit acknowledgment">
      <div className="space-y-1 border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-semibold text-gray-900">
          {data.audit.customerName}
        </h1>
        <p className="text-sm text-gray-600">
          {data.audit.assessmentType} · completed by {data.audit.auditorName}
        </p>
      </div>

      {data.message ? (
        <div
          className="mt-4 rounded-md border-l-4 bg-gray-50 p-3 text-sm text-gray-700"
          style={{ borderColor: primaryColor }}
        >
          <p className="whitespace-pre-line">{data.message}</p>
          <p className="mt-1 text-xs text-gray-500">— Message from the auditor</p>
        </div>
      ) : null}

      <div className="mt-6 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
        <strong>Pinned report version {data.snapshot.reportVersion}</strong>
        <p className="mt-1">
          The data below was frozen on {new Date(data.snapshot.capturedAt).toUTCString()} when
          the auditor issued this acknowledgment link. Your acknowledgment binds to this exact
          snapshot, not to later edits.
        </p>
        <p className="mt-1 text-blue-700">
          Controls: {data.snapshot.controlCount} · Scope items: {data.snapshot.scopeItemCount} ·
          Readiness: {data.snapshot.readinessScore}%
        </p>
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Report preview (PDF)
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          A printable summary of the pinned snapshot. Use the toolbar to download or print.
        </p>
        <div className="mt-2 overflow-hidden rounded-md border border-gray-300 bg-gray-50">
          <iframe
            src={`${apiBaseUrl}/api/portal/ack/${token}/snapshot.pdf`}
            title="Audit report preview"
            className="h-[420px] w-full"
          />
        </div>
        <a
          href={`${apiBaseUrl}/api/portal/ack/${token}/snapshot.pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-xs font-semibold text-blue-700 hover:underline"
        >
          Open PDF in new tab ↗
        </a>
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Findings summary
        </h2>
        <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-red-700">
            Critical: {severityCounts.critical}
          </span>
          <span className="rounded-md border border-orange-300 bg-orange-50 px-2 py-1 text-orange-700">
            High: {severityCounts.high}
          </span>
          <span className="rounded-md border border-yellow-300 bg-yellow-50 px-2 py-1 text-yellow-700">
            Medium: {severityCounts.medium}
          </span>
          <span className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-emerald-700">
            Low: {severityCounts.low}
          </span>
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-gray-700">
            Show all findings ({data.findings.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {data.findings.map((f) => (
              <li
                key={f.id}
                className={`rounded-md border-l-4 bg-white p-3 ${SEVERITY_STYLE[f.severityTier]}`}
              >
                <p className="text-sm font-semibold">{f.title}</p>
                <p className="mt-0.5 text-xs">
                  Severity: {f.severityTier} ({f.severityScore}) · Lifecycle:{" "}
                  {f.lifecycleStatus ?? "—"} · Response:{" "}
                  {f.managementResponseStatus ?? "pending"}
                </p>
                {f.managementResponse ? (
                  <p className="mt-1 text-xs italic text-gray-600">
                    {f.managementResponse}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      </div>

      <div className="mt-8 rounded-md border border-gray-300 bg-gray-50 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Your acknowledgment
        </h2>

        <label className="mt-3 flex items-start gap-2 text-sm text-gray-800">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-1 h-4 w-4"
          />
          <span>
            I acknowledge that I have received this audit report and reviewed the findings.
          </span>
        </label>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-gray-700">
            Your name *
            <input
              className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="John Doe"
            />
          </label>
          <label className="block text-xs font-medium text-gray-700">
            Position (optional)
            <input
              className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="CISO, IT Director, …"
            />
          </label>
          <label className="block text-xs font-medium text-gray-700 sm:col-span-2">
            Comment (optional)
            <textarea
              className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Optional notes for the auditor."
              maxLength={2000}
            />
          </label>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          Email on record: <strong>{data.recipientEmail}</strong> (cannot be changed here)
        </p>
        <p className="mt-1 text-xs text-gray-500">
          By submitting, an audit log entry will be created with your name, browser
          information and timestamp.
        </p>

        <button
          className="mt-4 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: primaryColor }}
          disabled={!confirmed || submitting || signerName.trim().length < 2}
          onClick={() => void submit()}
        >
          {submitting ? "Submitting…" : "Submit acknowledgment"}
        </button>
      </div>

      <p className="mt-6 text-xs text-gray-500">
        This link expires on {new Date(data.expiresAt).toLocaleString()}.
      </p>
    </PortalShell>
  );
}

function errorTitle(code: string): string {
  if (code === "TOKEN_REVOKED") return "Link revoked";
  if (code === "TOKEN_EXPIRED") return "Link expired";
  if (code === "ALREADY_REDEEMED") return "Already acknowledged";
  if (code === "INVALID_TOKEN") return "Invalid link";
  return "Cannot open link";
}

function PortalShell({
  branding,
  title,
  children
}: {
  branding: AckBranding | null;
  title: string;
  children: React.ReactNode;
}) {
  const primaryColor = branding?.primaryColor ?? "#3b6eea";
  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <header
        className="border-b border-gray-200 px-6 py-4 text-white"
        style={{ background: primaryColor }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <strong className="text-sm tracking-wide">
            {branding?.headerText ?? "Audit Acknowledgment"}
          </strong>
          <span className="text-xs opacity-80">{title}</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          {children}
        </div>
      </main>
      <footer className="px-6 py-6 text-center text-xs text-gray-500">
        {branding?.footerText ? `${branding.footerText} · ` : ""}Powered by Audity
      </footer>
    </div>
  );
}
