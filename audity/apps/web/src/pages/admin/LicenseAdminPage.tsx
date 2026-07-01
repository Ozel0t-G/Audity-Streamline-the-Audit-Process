import { FormEvent, useState } from "react";
import { useApi } from "../../api/client";
import { useLicense } from "../../license/LicenseProvider";
import { useConfirm, useToast } from "../../components/ui";

const TIER_LABEL: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  enterprise: "Enterprise"
};

const REASON_LABEL: Record<string, string> = {
  no_license: "No license active (Free)",
  invalid_signature: "Invalid signature",
  no_public_key: "No license public key configured",
  instance_mismatch: "Bound to a different instance",
  not_yet_valid: "Not valid yet (notBefore)",
  expired: "Expired"
};

export function LicenseAdminPage() {
  const api = useApi();
  const { state, reload, demoMode } = useLicense();
  const toast = useToast();
  const confirm = useConfirm();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  async function activate(event: FormEvent) {
    event.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    try {
      await api("/api/admin/license/activate", {
        method: "POST",
        body: JSON.stringify({ token: token.trim() })
      });
      toast.success("License activated.");
      setToken("");
      reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Activation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    const ok = await confirm({
      title: "Deactivate license?",
      body: "This instance falls back to the Free tier. Your data is kept.",
      confirmLabel: "Deactivate",
      destructive: true
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api("/api/admin/license/deactivate", { method: "POST" });
      toast.success("License deactivated.");
      reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Deactivation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function resetDemo() {
    const ok = await confirm({
      title: "Reset demo data?",
      body: "All demo customers (A/B/C) will be deleted and recreated.",
      confirmLabel: "Reset"
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await api<{ customers: number }>("/api/admin/demo/reset", { method: "POST" });
      toast.success(`Demo data recreated (${result.customers} customers).`);
      reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Demo reset failed.");
    } finally {
      setBusy(false);
    }
  }

  const statusTone = state.demoMode
    ? "text-amber-400"
    : state.valid
      ? "text-audity-success"
      : "text-audity-secondary";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-audity-text">License</h1>
        <p className="mt-1 text-sm text-audity-secondary">
          Activate a license token and manage this instance's license status.
        </p>
      </div>

      {/* Current status */}
      <div className="rounded-audity border border-audity-border bg-audity-panel p-6">
        <h2 className="mb-4 text-sm font-semibold text-audity-text">Current status</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <dt className="text-audity-secondary">Tier</dt>
          <dd className={`font-semibold ${statusTone}`}>
            {state.demoMode ? "Demo (all features active)" : TIER_LABEL[state.tier] ?? state.tier}
          </dd>
          <dt className="text-audity-secondary">Status</dt>
          <dd className="text-audity-text">
            {state.valid ? "Valid" : "Inactive"}
            {state.inGrace ? " · in grace period (please renew)" : ""}
            {!state.valid && state.reason ? ` · ${REASON_LABEL[state.reason] ?? state.reason}` : ""}
          </dd>
          <dt className="text-audity-secondary">Licensee</dt>
          <dd className="text-audity-text">{state.customer ?? "—"}</dd>
          <dt className="text-audity-secondary">Expires</dt>
          <dd className="text-audity-text">
            {state.expiresAt ? new Date(state.expiresAt).toLocaleDateString() : "No expiry"}
          </dd>
        </dl>
      </div>

      {/* Demo notice */}
      {demoMode ? (
        <div className="rounded-audity border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          <strong>Demo mode active.</strong> All features are unlocked and marked with a
          colored tier tag. Sample data (customers A/B/C) is shown.
          <div className="mt-3">
            <button type="button" className="audity-btn-ghost audity-btn-sm" disabled={busy} onClick={() => void resetDemo()}>
              Reset demo data
            </button>
          </div>
        </div>
      ) : null}

      {/* Activate */}
      <form className="rounded-audity border border-audity-border bg-audity-panel p-6" onSubmit={activate}>
        <h2 className="mb-2 text-sm font-semibold text-audity-text">Activate a license</h2>
        <p className="mb-3 text-xs text-audity-secondary">
          Paste a license token. It is signature-verified and applied immediately.
        </p>
        <textarea
          className="audity-input min-h-[120px] w-full font-mono text-xs"
          placeholder="eyJ…   (license token)"
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
        <div className="mt-4 flex items-center gap-2">
          <button type="submit" className="audity-btn-primary" disabled={busy || !token.trim()}>
            Activate
          </button>
          {state.valid && !state.demoMode ? (
            <button type="button" className="audity-btn-ghost" disabled={busy} onClick={() => void deactivate()}>
              Deactivate current license
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
