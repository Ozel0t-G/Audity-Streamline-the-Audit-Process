import nodemailer from "nodemailer";
import { decryptText } from "../utils/crypto.js";
import type { AuthenticatedUser } from "../auth/hooks.js";
import { pool } from "../db/client.js";
import { deriveNextActions } from "./actions.js";

type DigestUser = AuthenticatedUser & {
  display_name: string | null;
  digest_timezone: string;
  digest_hour_local: number;
};

function localHourInZone(tz: string): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: tz
    });
    return Number(fmt.format(new Date()));
  } catch {
    return new Date().getUTCHours();
  }
}

async function smtpTransport(): Promise<{ transporter: nodemailer.Transporter; sender: string } | null> {
  const row = await pool.query<{
    smtp_host: string | null;
    smtp_port: number | null;
    smtp_tls: boolean | null;
    smtp_user: string | null;
    smtp_password_encrypted: string | null;
    sender: string | null;
  }>("select * from email_settings order by updated_at desc limit 1");
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

async function loadDueDigestUsers(): Promise<DigestUser[]> {
  const result = await pool.query<{
    id: string;
    email: string;
    display_name: string | null;
    role_name: string;
    digest_timezone: string;
    digest_hour_local: number;
    last_digest_sent_at: string | null;
    permissions: string[];
  }>(
    `select u.id, u.email, u.name as display_name, r.name as role_name,
            p.digest_timezone, p.digest_hour_local, p.last_digest_sent_at::text,
            coalesce(array_agg(perm.name) filter (where perm.name is not null), '{}') as permissions
       from user_notification_prefs p
       join users u on u.id = p.user_id
       left join roles r on r.id = u.role_id
       left join role_permissions rp on rp.role_id = u.role_id
       left join permissions perm on perm.id = rp.permission_id
      where p.digest_enabled = true and u.status = 'active'
      group by u.id, u.email, u.name as display_name, r.name,
               p.digest_timezone, p.digest_hour_local, p.last_digest_sent_at`,
    []
  );
  const now = Date.now();
  return result.rows
    .filter((row) => {
      const targetHour = row.digest_hour_local;
      const currentHour = localHourInZone(row.digest_timezone);
      if (currentHour !== targetHour) return false;
      if (!row.last_digest_sent_at) return true;
      const last = new Date(row.last_digest_sent_at).getTime();
      // Don't resend within 12h window
      return now - last > 12 * 3600_000;
    })
    .map((row) => ({
      id: row.id,
      sub: row.id,
      sid: row.id,
      email: row.email,
      name: row.display_name ?? row.email,
      display_name: row.display_name,
      role: row.role_name,
      permissions: row.permissions ?? [],
      alphaAcceptedAt: null,
      digest_timezone: row.digest_timezone,
      digest_hour_local: row.digest_hour_local
    }));
}

function renderDigestHtml(displayName: string | null, groups: Array<{ customerName: string; lines: string[] }>) {
  if (!groups.length) {
    return `<p>Hallo ${displayName ?? "Audity-Nutzer"},</p><p>Heute keine offenen Aktionen — sauberer Posteingang.</p>`;
  }
  const sections = groups
    .map(
      (g) =>
        `<h3 style="margin-top:24px;font-family:sans-serif;font-size:14px;color:#1f2937;">${escapeHtml(g.customerName)}</h3><ul style="padding-left:18px;font-family:sans-serif;font-size:13px;color:#374151;">${g.lines.map((l) => `<li style="margin:4px 0;">${escapeHtml(l)}</li>`).join("")}</ul>`
    )
    .join("");
  return `<div style="max-width:560px;font-family:sans-serif;">
    <p>Hallo ${displayName ?? "Audity-Nutzer"},</p>
    <p>${groups.reduce((sum, g) => sum + g.lines.length, 0)} offene Aktion(en) über ${groups.length} Kunde(n):</p>
    ${sections}
    <p style="margin-top:24px;font-size:12px;color:#6b7280;">Audity Audit-Center Digest. <a href="/me/notification-prefs">Einstellungen ändern</a></p>
  </div>`;
}

function renderDigestText(displayName: string | null, groups: Array<{ customerName: string; lines: string[] }>) {
  if (!groups.length) {
    return `Hallo ${displayName ?? "Audity-Nutzer"},\n\nHeute keine offenen Aktionen.\n`;
  }
  return [
    `Hallo ${displayName ?? "Audity-Nutzer"},`,
    "",
    `${groups.reduce((sum, g) => sum + g.lines.length, 0)} offene Aktion(en) über ${groups.length} Kunde(n):`,
    "",
    ...groups.flatMap((g) => [`# ${g.customerName}`, ...g.lines.map((l) => `  - ${l}`), ""]),
    "Audity Audit-Center Digest"
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendDueDigests(): Promise<{ sent: number; skipped: number }> {
  const users = await loadDueDigestUsers();
  if (!users.length) return { sent: 0, skipped: 0 };
  const transport = await smtpTransport();
  if (!transport) return { sent: 0, skipped: users.length };

  let sent = 0;
  for (const user of users) {
    try {
      const actions = await deriveNextActions(user);
      const groupsMap = new Map<string, { customerName: string; lines: string[] }>();
      for (const action of actions) {
        const entry = groupsMap.get(action.customerId) ?? {
          customerName: action.customerName,
          lines: []
        };
        const overdue = action.overdueBy ? ` (${action.overdueBy} T überfällig)` : "";
        entry.lines.push(`${action.title}${overdue} — ${action.detail}`);
        groupsMap.set(action.customerId, entry);
      }
      const groups = Array.from(groupsMap.values());

      await transport.transporter.sendMail({
        from: transport.sender,
        to: user.email,
        subject: groups.length
          ? `Audity Digest · ${actions.length} offene Aktion(en)`
          : "Audity Digest · sauberer Posteingang",
        text: renderDigestText(user.display_name, groups),
        html: renderDigestHtml(user.display_name, groups)
      });

      await pool.query(
        "update user_notification_prefs set last_digest_sent_at = now() where user_id = $1",
        [user.sub]
      );
      sent += 1;
    } catch {
      // best-effort; continue with other users
    }
  }
  return { sent, skipped: users.length - sent };
}

export function startDigestScheduler(): NodeJS.Timeout {
  // Tick every 10 minutes; loadDueDigestUsers internally filters by hour + 12h dedup.
  return setInterval(() => {
    void sendDueDigests().catch(() => undefined);
  }, 10 * 60 * 1000);
}
