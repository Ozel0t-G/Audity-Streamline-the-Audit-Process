import { useEffect, useState } from "react";
import { useApi } from "../../api/client";
import { PageSkeleton, useToast } from "../../components/ui";

export function AdminCustomerAckPage() {
  const api = useApi();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const payload = await api<{ enabled: boolean }>("/api/admin/customer-ack/settings");
      setEnabled(payload.enabled);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(next: boolean) {
    setSaving(true);
    try {
      await api("/api/admin/customer-ack/settings", {
        method: "PUT",
        body: JSON.stringify({ enabled: next })
      });
      setEnabled(next);
      toast.success(`Customer acknowledgments ${next ? "enabled" : "disabled"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <>
        <div className="audity-page-header">
          <p className="audity-page-kicker">Admin · Settings</p>
          <h1 className="audity-page-title">Customer Acknowledgments</h1>
        </div>
        <PageSkeleton cards={1} />
      </>
    );
  }

  return (
    <>
      <div className="audity-page-header">
        <p className="audity-page-kicker">Admin · Settings</p>
        <h1 className="audity-page-title">Customer Acknowledgments</h1>
        <p className="audity-page-copy">
          Magic-link acknowledgments let customers confirm receipt of an audit report
          without an Audity account.
        </p>
      </div>

      <section className="audity-card p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={enabled}
            disabled={saving}
            onChange={(event) => void save(event.target.checked)}
            className="mt-1 h-4 w-4"
          />
          <div>
            <strong className="text-audity-text">
              Enable customer magic-link acknowledgments
            </strong>
            <p className="mt-1 text-sm text-audity-secondary">
              When enabled, auditors can send customers a one-time link from the
              Report &amp; Sign-off phase. Acknowledgments are recorded as sign-off
              entries with email, IP and timestamp, anchored to the report version at
              issue time.
            </p>
            <p className="mt-2 text-xs text-audity-muted">
              Disabling this feature hides the panel from all audits going forward.
              Existing acknowledgment records and pending tokens are preserved but
              tokens can no longer be redeemed once disabled.
            </p>
          </div>
        </label>

        <div className="mt-6 rounded-audity border border-audity-border bg-audity-page p-3">
          <p className="audity-page-kicker mb-2">How it works</p>
          <ol className="space-y-1.5 text-sm text-audity-secondary">
            <li>
              1. Auditor opens Report &amp; Sign-off phase of a finalised audit and
              enters a recipient email.
            </li>
            <li>2. Audity emails the customer a one-time secure link (default 7-day expiry).</li>
            <li>
              3. Customer opens the link, reviews findings, ticks the acknowledgment
              checkbox, enters their name, optionally adds a comment.
            </li>
            <li>
              4. Acknowledgment is hash-chained into the audit trail. Auditor sees
              the receipt in the cockpit.
            </li>
          </ol>
        </div>

        <div className="mt-4 rounded-audity border border-audity-border bg-audity-page p-3">
          <p className="audity-page-kicker mb-2">Legal note</p>
          <p className="text-sm text-audity-secondary">
            Magic-link acknowledgments qualify as eIDAS Simple Electronic Signature
            (SES) — sufficient for management acknowledgments under EU and US law.
            They are <strong>not</strong> qualified electronic signatures (QES) and
            should not be used for binding contracts. Use an external signing
            service for QES-grade requirements.
          </p>
        </div>
      </section>
    </>
  );
}
