import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { translate, type AudityLanguage } from "../i18n";

export function UserSettingsPage() {
  const api = useApi();
  const { user, setupMfa, verifyMfaSetup } = useAuth();
  const [tooltipsEnabled, setTooltipsEnabled] = useState(() => window.localStorage.getItem("audity_tooltips_enabled") !== "false");
  const [preferences, setPreferences] = useState(() => ({
    language: "English" as AudityLanguage,
    theme: window.localStorage.getItem("audity_theme") ?? "System",
    notifications: window.localStorage.getItem("audity_notifications") !== "false",
    defaultView: window.localStorage.getItem("audity_default_view") ?? "Dashboard",
    tableDensity: window.localStorage.getItem("audity_table_density") ?? "Comfortable",
    exportFormat: window.localStorage.getItem("audity_export_format") ?? "CSV"
  }));
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [mfaSetup, setMfaSetup] = useState<{
    secret: string;
    otpauthUrl: string;
    qrCodeDataUrl: string;
  } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const t = (label: string) => translate(label, preferences.language);

  useEffect(() => {
    window.localStorage.setItem("audity_tooltips_enabled", String(tooltipsEnabled));
    window.dispatchEvent(new CustomEvent("audity-tooltips-changed", { detail: tooltipsEnabled }));
  }, [tooltipsEnabled]);

  useEffect(() => {
    window.localStorage.setItem("audity_language", preferences.language);
    window.localStorage.setItem("audity_theme", preferences.theme);
    window.localStorage.setItem("audity_notifications", String(preferences.notifications));
    window.localStorage.setItem("audity_default_view", preferences.defaultView);
    window.localStorage.setItem("audity_table_density", preferences.tableDensity);
    window.localStorage.setItem("audity_export_format", preferences.exportFormat);
    window.dispatchEvent(new CustomEvent("audity-language-changed", { detail: preferences.language }));
    window.dispatchEvent(new CustomEvent("audity-theme-changed", { detail: preferences.theme }));
  }, [preferences]);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved("");
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError(t("New passwords do not match"));
      return;
    }
    try {
      await api("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setSaved(t("Password changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password change failed");
    }
  }

  async function startMfaSetup() {
    setError("");
    setSaved("");
    setRecoveryCodes([]);
    try {
      setMfaSetup(await setupMfa());
    } catch (err) {
      setError(err instanceof Error ? err.message : "MFA setup failed");
    }
  }

  async function verifySetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved("");
    try {
      setRecoveryCodes(await verifyMfaSetup(mfaCode));
      setSaved("MFA enabled");
    } catch (err) {
      setError(err instanceof Error ? err.message : "MFA verification failed");
    }
  }

  return (
    <>
      <div className="audity-page-header">
        <p className="audity-page-kicker">{t("Account")}</p>
        <h1 className="audity-page-title">{t("User Settings")}</h1>
        <p className="audity-page-copy">{user?.email} · {user?.role}</p>
      </div>
      {error ? <div className="mb-4 rounded-audity border border-audity-error bg-[#2A1C17] px-3 py-2 text-sm text-[#FFB199]">{error}</div> : null}
      {saved ? <div className="mb-4 rounded-audity border border-audity-success bg-[#17251D] px-3 py-2 text-sm text-audity-success">{saved}</div> : null}
      <div className="grid gap-3 xl:grid-cols-2">
        <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
          <h2 className="mb-4 text-lg font-semibold">{t("Password")}</h2>
          <form className="space-y-3" onSubmit={changePassword}>
            <label className="block text-xs font-semibold uppercase text-audity-secondary" data-tooltip="Enter your current password to confirm this change.">
              {t("Current Password")}
              <input className="mt-2 audity-input" type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} />
            </label>
            <label className="block text-xs font-semibold uppercase text-audity-secondary" data-tooltip="Use at least 8 characters. Prefer a unique password stored in a password manager.">
              {t("New Password")}
              <input className="mt-2 audity-input" type="password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} />
            </label>
            <label className="block text-xs font-semibold uppercase text-audity-secondary" data-tooltip="Repeat the new password to avoid typos.">
              {t("Confirm Password")}
              <input className="mt-2 audity-input" type="password" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })} />
            </label>
            <button className="audity-btn-primary" data-tooltip="Save your new password and keep this session active.">
              {t("Change password")}
            </button>
          </form>
        </section>
        <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
          <h2 className="mb-4 text-lg font-semibold">Authenticator MFA</h2>
          <p className="mb-4 text-sm text-audity-secondary">Set up an authenticator app for stronger account protection. Scan the QR code, then verify the one-time code.</p>
          <button
            className="audity-btn-primary"
            onClick={() => void startMfaSetup()}
          >
            Set up MFA
          </button>
          {mfaSetup ? (
            <form className="mt-4 space-y-3" onSubmit={(event) => void verifySetup(event)}>
              <img
                className="h-40 w-40 rounded-audity border border-audity-border bg-white p-2"
                src={mfaSetup.qrCodeDataUrl}
                alt="MFA QR code"
              />
              <div className="rounded-audity border border-audity-border bg-audity-page p-2 font-mono text-xs text-audity-secondary">
                {mfaSetup.secret}
              </div>
              <input
                className="audity-input"
                value={mfaCode}
                inputMode="numeric"
                placeholder="Authenticator code"
                onChange={(event) => setMfaCode(event.target.value)}
              />
              <button className="audity-btn-secondary">
                Verify MFA
              </button>
            </form>
          ) : null}
          {recoveryCodes.length ? (
            <div className="mt-4 rounded-audity border border-audity-border bg-audity-page p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-audity-muted">Recovery codes</p>
              <div className="grid gap-1 font-mono text-xs text-audity-secondary">
                {recoveryCodes.map((code) => (
                  <span key={code}>{code}</span>
                ))}
              </div>
            </div>
          ) : null}
        </section>
        <section className="rounded-audity border border-audity-border bg-audity-panel p-4">
          <h2 className="mb-4 text-lg font-semibold">{t("Interface")}</h2>
          <div className="space-y-3">
            <label className="flex items-center justify-between gap-4 rounded-audity border border-audity-border bg-audity-page px-3 py-3" data-tooltip="Turn hover explanations for buttons, links, and form fields on or off.">
              <span>
                <span className="block text-sm font-semibold text-audity-text">{t("Tooltips")}</span>
                <span className="mt-1 block text-xs text-audity-muted">Show small explanations while hovering UI elements.</span>
              </span>
              <input type="checkbox" checked={tooltipsEnabled} onChange={(event) => setTooltipsEnabled(event.target.checked)} />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-xs font-semibold uppercase text-audity-secondary" data-tooltip="Choose the language preference saved for your browser.">
                {t("Language")}
                <select className="mt-2 audity-input" value={preferences.language} onChange={() => setPreferences({ ...preferences, language: "English" })}>
                  <option>English</option>
                </select>
              </label>
              <label className="block text-xs font-semibold uppercase text-audity-secondary" data-tooltip="Choose how the interface should look on this browser.">
                {t("Theme")}
                <select className="mt-2 audity-input" value={preferences.theme} onChange={(event) => setPreferences({ ...preferences, theme: event.target.value })}>
                  <option>System</option>
                  <option>Dark</option>
                  <option>Light</option>
                </select>
              </label>
              <label className="block text-xs font-semibold uppercase text-audity-secondary" data-tooltip="Choose the first workspace view you normally want to open.">
                {t("Default View")}
                <select className="mt-2 audity-input" value={preferences.defaultView} onChange={(event) => setPreferences({ ...preferences, defaultView: event.target.value })}>
                  <option>Dashboard</option>
                  <option>Customers</option>
                  <option>My Customers</option>
                  <option>Shared Customers</option>
                </select>
              </label>
              <label className="block text-xs font-semibold uppercase text-audity-secondary" data-tooltip="Choose how compact tables and lists should appear.">
                {t("Table Density")}
                <select className="mt-2 audity-input" value={preferences.tableDensity} onChange={(event) => setPreferences({ ...preferences, tableDensity: event.target.value })}>
                  <option>Comfortable</option>
                  <option>Compact</option>
                </select>
              </label>
              <label className="block text-xs font-semibold uppercase text-audity-secondary" data-tooltip="Set your preferred default file type for exports.">
                {t("Export Format")}
                <select className="mt-2 audity-input" value={preferences.exportFormat} onChange={(event) => setPreferences({ ...preferences, exportFormat: event.target.value })}>
                  <option>CSV</option>
                  <option>PDF</option>
                  <option>Word</option>
                </select>
              </label>
              <label className="flex items-center justify-between gap-4 rounded-audity border border-audity-border bg-audity-page px-3 py-3 normal-case" data-tooltip="Choose whether Audity should show in-app notifications for your work.">
                <span>
                  <span className="block text-sm font-semibold text-audity-text">{t("Notifications")}</span>
                  <span className="mt-1 block text-xs text-audity-muted">{t("Show reminders and review messages.")}</span>
                </span>
                <input type="checkbox" checked={preferences.notifications} onChange={(event) => setPreferences({ ...preferences, notifications: event.target.checked })} />
              </label>
            </div>
          </div>
        </section>
        {user?.role === "Instance Admin" ? (
        <section className="rounded-audity border border-audity-border bg-audity-panel p-4 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{t("Backup & Restore")}</h2>
              <p className="mt-1 text-sm text-audity-secondary">Create backups, download encrypted packages, run restore prechecks, and manage retention.</p>
            </div>
            <Link className="inline-flex items-center audity-btn-secondary text-audity-primary" to="/admin/backup">
              {t("Open Backup")}
            </Link>
          </div>
        </section>
        ) : null}
      </div>
    </>
  );
}
