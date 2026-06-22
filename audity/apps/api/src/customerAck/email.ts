import nodemailer from "nodemailer";
import { decryptText } from "../utils/crypto.js";
import { pool } from "../db/client.js";

type SmtpRow = {
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_tls: boolean | null;
  smtp_user: string | null;
  smtp_password_encrypted: string | null;
  sender: string | null;
};

async function smtpTransport(): Promise<{ transporter: nodemailer.Transporter; sender: string } | null> {
  const row = await pool.query<SmtpRow>(
    "select smtp_host, smtp_port, smtp_tls, smtp_user, smtp_password_encrypted, sender from email_settings order by updated_at desc limit 1"
  );
  const settings = row.rows[0];
  if (!settings?.smtp_host) return null;
  let password: string | undefined;
  if (settings.smtp_password_encrypted) {
    try {
      password = decryptText(settings.smtp_password_encrypted);
    } catch {
      password = undefined;
    }
  }
  const port = settings.smtp_port ?? 587;
  const transporter = nodemailer.createTransport({
    host: settings.smtp_host,
    port,
    secure: port === 465,
    requireTLS: Boolean(settings.smtp_tls) && port !== 465,
    auth: settings.smtp_user ? { user: settings.smtp_user, pass: password } : undefined
  });
  return {
    transporter,
    sender: settings.sender || settings.smtp_user || `audity@${settings.smtp_host}`
  };
}

type Branding = {
  logoUrl?: string;
  primaryColor?: string;
  headerText?: string;
  footerText?: string;
};

async function loadBranding(): Promise<Branding> {
  const result = await pool.query<{
    logo_object_key: string | null;
    primary_color: string | null;
    header_text: string | null;
    footer_text: string | null;
  }>(
    "select logo_object_key, primary_color, header_text, footer_text from report_branding order by updated_at desc limit 1"
  );
  const row = result.rows[0];
  return {
    logoUrl: row?.logo_object_key ?? undefined,
    primaryColor: row?.primary_color ?? "#3b6eea",
    headerText: row?.header_text ?? undefined,
    footerText: row?.footer_text ?? undefined
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type AckEmailInput = {
  recipientEmail: string;
  recipientHint?: string | null;
  message?: string | null;
  customerName: string;
  assessmentType: string;
  auditorName: string;
  portalUrl: string;
  expiresAt: string;
};

export async function sendAckEmail(input: AckEmailInput): Promise<{ ok: boolean; error?: string }> {
  const transport = await smtpTransport();
  if (!transport) {
    return { ok: false, error: "SMTP not configured" };
  }
  const branding = await loadBranding();

  const expiresDate = new Date(input.expiresAt);
  const expiresStr = expiresDate.toUTCString();
  const safeMessage = input.message ? escapeHtml(input.message).replace(/\n/g, "<br>") : null;

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f6f7;font-family:sans-serif;color:#1f2937;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="padding:18px 20px;border-bottom:1px solid #e5e7eb;background:${branding.primaryColor};color:#fff;">
      <strong style="font-size:14px;letter-spacing:0.04em;">${branding.headerText ? escapeHtml(branding.headerText) : "Audit Acknowledgment Request"}</strong>
    </div>
    <div style="padding:24px 20px;">
      <p>Hello,</p>
      <p><strong>${escapeHtml(input.auditorName)}</strong> has completed the <strong>${escapeHtml(input.assessmentType)}</strong> audit for <strong>${escapeHtml(input.customerName)}</strong> and is asking for your acknowledgment.</p>
      ${safeMessage ? `<blockquote style="border-left:3px solid ${branding.primaryColor};padding:8px 12px;color:#374151;background:#f9fafb;margin:16px 0;">${safeMessage}</blockquote>` : ""}
      <p style="margin-top:24px;">What you'll do:</p>
      <ol>
        <li>Open the secure link below.</li>
        <li>Review the audit report and findings (no login required).</li>
        <li>Confirm receipt with your name.</li>
      </ol>
      <p style="text-align:center;margin:28px 0;">
        <a href="${input.portalUrl}" style="display:inline-block;padding:12px 24px;background:${branding.primaryColor};color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Open the audit</a>
      </p>
      <p style="font-size:12px;color:#6b7280;">This link is valid until ${expiresStr}.</p>
      <p style="font-size:12px;color:#6b7280;">If you received this email by mistake, please ignore it.</p>
    </div>
    <div style="padding:14px 20px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280;">
      ${branding.footerText ? `${escapeHtml(branding.footerText)} · ` : ""}Powered by Audity
    </div>
  </div>
</body></html>`;

  const text = [
    `Hello,`,
    ``,
    `${input.auditorName} has completed the ${input.assessmentType} audit for ${input.customerName}`,
    `and is asking for your acknowledgment.`,
    input.message ? `\nMessage from the auditor:\n${input.message}\n` : "",
    `Open the audit (no login required):`,
    input.portalUrl,
    ``,
    `This link is valid until ${expiresStr}.`,
    ``,
    `Powered by Audity`
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await transport.transporter.sendMail({
      from: transport.sender,
      to: input.recipientEmail,
      subject: `Audit acknowledgment requested — ${input.customerName} ${input.assessmentType}`,
      text,
      html
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "send failed" };
  }
}
