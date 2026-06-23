import { useEffect, useState } from "react";
import { useApi } from "../../../api/client";
import { useAuth } from "../../../auth/AuthProvider";
import { useToast } from "../../../components/ui";
import { Field, Panel, Pill, dateValue, text } from "../../audit/auditPrimitives";

type AckToken = {
  id: string;
  recipientEmail: string;
  recipientHint: string | null;
  issuedAt: string;
  expiresAt: string;
  redeemedAt: string | null;
  redeemedByEmail: string | null;
  redeemedSignoffId: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  message: string | null;
  emailSendStatus: string;
  emailSendError: string | null;
  lastOpenedAt: string | null;
  openCount: number;
  status: "pending" | "redeemed" | "revoked" | "expired";
};

type AckPayload = {
  enabled: boolean;
  tokens: AckToken[];
};

export function CustomerAckPanel({ assessmentId }: { assessmentId: string }) {
  const api = useApi();
  const { user } = useAuth();
  const toast = useToast();
  const canSend = Boolean(user?.permissions.includes("finding.approve"));

  const [data, setData] = useState<AckPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    recipientEmail: "",
    recipientHint: "",
    message: "",
    expiryDays: 7
  });
  const [sending, setSending] = useState(false);
  const [revokeFor, setRevokeFor] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  async function load() {
    if (!assessmentId) return;
    setLoading(true);
    try {
      const payload = await api<AckPayload>(
        `/api/assessments/${assessmentId}/customer-ack-tokens`
      );
      setData(payload);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load tokens");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId]);

  async function send() {
    if (!form.recipientEmail.trim()) {
      toast.error("Recipient email required");
      return;
    }
    setSending(true);
    try {
      await api(`/api/assessments/${assessmentId}/customer-ack-tokens`, {
        method: "POST",
        body: JSON.stringify({
          recipientEmail: form.recipientEmail.trim(),
          recipientHint: form.recipientHint.trim() || undefined,
          message: form.message.trim() || undefined,
          expiryDays: form.expiryDays
        })
      });
      toast.success("Acknowledgment link sent");
      setForm({ ...form, recipientEmail: "", recipientHint: "", message: "" });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  async function copyLink(tokenId: string) {
    try {
      const res = await api<{ portalUrl: string }>(
        `/api/assessments/${assessmentId}/customer-ack-tokens/${tokenId}/link`,
        { method: "GET" }
      );
      try {
        await navigator.clipboard.writeText(res.portalUrl);
        toast.success("Link copied to clipboard");
      } catch {
        // Fallback: show in a prompt so the user can copy manually
        window.prompt("Copy this link:", res.portalUrl);
      }
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not retrieve link");
    }
  }

  async function resend(tokenId: string) {
    try {
      await api(`/api/assessments/${assessmentId}/customer-ack-tokens/${tokenId}/resend`, {
        method: "POST"
      });
      toast.success("Link resent");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Resend failed");
    }
  }

  async function revoke() {
    if (!revokeFor) return;
    if (revokeReason.trim().length < 1) {
      toast.error("Provide a reason");
      return;
    }
    try {
      await api(
        `/api/assessments/${assessmentId}/customer-ack-tokens/${revokeFor}/revoke`,
        {
          method: "POST",
          body: JSON.stringify({ reason: revokeReason.trim() })
        }
      );
      toast.success("Link revoked");
      setRevokeFor(null);
      setRevokeReason("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Revoke failed");
    }
  }

  if (loading || !data) {
    return (
      <Panel title="Customer acknowledgment" subtitle="Loading…">
        <p className="text-sm text-audity-muted">Loading…</p>
      </Panel>
    );
  }

  if (!data.enabled) {
    return (
      <Panel
        title="Customer acknowledgment"
        subtitle="Feature disabled for this tenant."
      >
        <p className="text-sm text-audity-muted">
          Magic-link customer acknowledgments are disabled. An administrator can enable this
          feature in <strong>Admin → Customer Acknowledgments</strong>.
        </p>
      </Panel>
    );
  }

  const pending = data.tokens.filter((t) => t.status === "pending");
  const redeemed = data.tokens.filter((t) => t.status === "redeemed");
  const others = data.tokens.filter(
    (t) => t.status !== "pending" && t.status !== "redeemed"
  );

  return (
    <Panel
      title="Customer acknowledgment"
      subtitle="Send a one-time magic link so the customer can confirm receipt without an Audity account."
    >
      {redeemed.length ? (
        <div className="mb-4 rounded-audity border border-audity-success bg-audity-success/10 p-3 text-sm">
          <strong className="text-audity-success">
            ✓ Acknowledged ({redeemed.length})
          </strong>
          <ul className="mt-2 space-y-2">
            {redeemed.map((token) => (
              <li key={token.id} className="text-xs">
                <strong>{token.recipientEmail}</strong> · signed{" "}
                {token.redeemedAt
                  ? new Date(token.redeemedAt).toLocaleString()
                  : "—"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {pending.length ? (
        <div className="mb-4 space-y-2">
          <p className="audity-page-kicker">Pending ({pending.length})</p>
          {pending.map((token) => (
            <div
              key={token.id}
              className="rounded-audity border border-audity-warning/40 bg-audity-warning/5 p-3 text-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <strong className="text-audity-text">{token.recipientEmail}</strong>
                  {token.recipientHint ? (
                    <span className="ml-1 text-xs text-audity-muted">
                      ({token.recipientHint})
                    </span>
                  ) : null}
                  <p className="text-xs text-audity-muted">
                    Sent {new Date(token.issuedAt).toLocaleString()} · Expires{" "}
                    {new Date(token.expiresAt).toLocaleString()}
                  </p>
                  <p className="text-xs text-audity-muted">
                    Email status: <Pill value={token.emailSendStatus} />
                    {token.openCount > 0 ? (
                      <span className="ml-2">
                        Opened {token.openCount}× · last{" "}
                        {token.lastOpenedAt
                          ? new Date(token.lastOpenedAt).toLocaleString()
                          : "—"}
                      </span>
                    ) : (
                      <span className="ml-2">Not yet opened</span>
                    )}
                  </p>
                </div>
                {canSend ? (
                  <div className="flex flex-col gap-1">
                    {token.emailSendStatus === "failed" ? (
                      <button
                        className="audity-btn-primary text-xs"
                        onClick={() => void copyLink(token.id)}
                        title="SMTP failed — get a fresh link to copy manually"
                      >
                        Copy link
                      </button>
                    ) : null}
                    <button
                      className="audity-btn-secondary text-xs"
                      onClick={() => void resend(token.id)}
                    >
                      Resend
                    </button>
                    <button
                      className="audity-btn-secondary text-xs"
                      onClick={() => {
                        setRevokeFor(token.id);
                        setRevokeReason("");
                      }}
                    >
                      Revoke
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {others.length ? (
        <details className="mb-4">
          <summary className="cursor-pointer text-xs text-audity-muted hover:text-audity-secondary">
            History ({others.length})
          </summary>
          <ul className="mt-2 space-y-1 text-xs">
            {others.map((token) => (
              <li
                key={token.id}
                className="rounded border border-audity-border bg-audity-page p-2"
              >
                <strong>{token.recipientEmail}</strong> · <Pill value={token.status} /> ·{" "}
                {dateValue(token.issuedAt)}
                {token.revokeReason ? ` · reason: ${token.revokeReason}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {canSend ? (
        <div className="rounded-audity border border-audity-border bg-audity-page p-3">
          <p className="audity-page-kicker mb-2">Send a new acknowledgment link</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Recipient email" required>
              <input
                type="email"
                className="audity-input"
                value={form.recipientEmail}
                placeholder="ciso@acme.com"
                onChange={(e) =>
                  setForm({ ...form, recipientEmail: e.target.value })
                }
              />
            </Field>
            <Field label="Recipient hint">
              <input
                className="audity-input"
                value={form.recipientHint}
                placeholder="CISO, Security Lead, …"
                onChange={(e) =>
                  setForm({ ...form, recipientHint: e.target.value })
                }
              />
            </Field>
            <Field label="Token expires (days)">
              <select
                className="audity-input"
                value={form.expiryDays}
                onChange={(e) =>
                  setForm({ ...form, expiryDays: Number(e.target.value) })
                }
              >
                {[3, 5, 7, 14, 21, 30].map((days) => (
                  <option key={days} value={days}>
                    {days}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Optional message" wide>
              <textarea
                className="audity-input min-h-[80px]"
                value={form.message}
                placeholder="Hi John, please confirm receipt of the audit report and your management responses."
                onChange={(e) =>
                  setForm({ ...form, message: e.target.value })
                }
              />
            </Field>
          </div>
          <button
            className="audity-btn-primary mt-3"
            disabled={sending}
            onClick={() => void send()}
          >
            {sending ? "Sending…" : "Send acknowledgment link"}
          </button>
        </div>
      ) : null}

      {revokeFor ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setRevokeFor(null)}
        >
          <div
            className="audity-card w-full max-w-md p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-audity-text">Revoke link</h2>
            <p className="mt-1 text-xs text-audity-muted">
              The recipient will no longer be able to use this link. They will see a
              friendly error page if they try.
            </p>
            <label className="mt-3 block text-xs font-medium text-audity-secondary">
              Reason
              <textarea
                className="audity-input mt-1 min-h-[60px]"
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="Why this link is being revoked"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="audity-btn-secondary"
                onClick={() => setRevokeFor(null)}
              >
                Cancel
              </button>
              <button className="audity-btn-primary" onClick={() => void revoke()}>
                Revoke link
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
