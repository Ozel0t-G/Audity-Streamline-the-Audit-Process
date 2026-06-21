import nodemailer from "nodemailer";
import { pool } from "../db/client.js";
import { decryptText } from "../utils/crypto.js";

export type EmailTopicId =
  | "framework.imported"
  | "framework.archived"
  | "user.invited"
  | "user.password_reset"
  | "auth.login.failed_burst"
  | "system.problem.critical"
  | "backup.completed"
  | "backup.failed"
  | "report.delivered"
  | "customer.archived"
  | "archive.restore_requested"
  | "archive.restore_approved"
  | "archive.restore_denied"
  | "archive.bundle_completed"
  | "archive.bundle_failed";

export type EmailTopic = {
  id: EmailTopicId;
  label: string;
  description: string;
  defaultRoles: string[];
  variables: string[];
};

export const EMAIL_TOPICS: EmailTopic[] = [
  {
    id: "framework.imported",
    label: "Framework import committed",
    description: "Fires when an Instance Admin publishes a user-uploaded framework (from a CSV upload).",
    defaultRoles: ["Instance Admin"],
    variables: ["frameworkName", "frameworkKey", "uploadedBy"]
  },
  {
    id: "framework.archived",
    label: "Framework archived",
    description: "Fires when a framework is removed and existing answers become read-only.",
    defaultRoles: ["Instance Admin"],
    variables: ["frameworkName", "reason"]
  },
  {
    id: "user.invited",
    label: "User invited",
    description: "Fires when a new user is added by an admin.",
    defaultRoles: ["Instance Admin"],
    variables: ["email", "role", "invitedBy"]
  },
  {
    id: "user.password_reset",
    label: "User password reset by admin",
    description: "Fires when an admin resets a user's password.",
    defaultRoles: ["Instance Admin"],
    variables: ["email", "resetBy"]
  },
  {
    id: "auth.login.failed_burst",
    label: "Repeated failed logins",
    description: "Fires when ≥ 5 failed login attempts occur against the same email within 10 minutes.",
    defaultRoles: ["Instance Admin"],
    variables: ["email", "attempts", "ip"]
  },
  {
    id: "system.problem.critical",
    label: "Critical system problem",
    description: "Fires when the System Monitor flags a critical health issue (DB unreachable, disk full, stuck jobs).",
    defaultRoles: ["Instance Admin"],
    variables: ["problems"]
  },
  {
    id: "backup.completed",
    label: "Backup completed",
    description: "Fires after a successful manual or scheduled backup.",
    defaultRoles: [],
    variables: ["jobId", "size"]
  },
  {
    id: "backup.failed",
    label: "Backup failed",
    description: "Fires when a backup job exits with an error.",
    defaultRoles: ["Instance Admin"],
    variables: ["jobId", "error"]
  },
  {
    id: "report.delivered",
    label: "Audit report delivered",
    description: "Fires when a secure audit report is downloaded by the recipient for the first time.",
    defaultRoles: [],
    variables: ["assessmentId", "reportId", "recipient"]
  },
  {
    id: "customer.archived",
    label: "Customer archived",
    description: "Fires when a customer is archived. The customer remains read-only and evidence is moved to the archive spool.",
    defaultRoles: ["Instance Admin"],
    variables: ["customerName", "archivedBy", "reason"]
  },
  {
    id: "archive.restore_requested",
    label: "Archive restore requested",
    description: "Fires when a non-admin user requests restoration of an archived customer.",
    defaultRoles: ["Instance Admin"],
    variables: ["customerName", "requestedBy", "reason"]
  },
  {
    id: "archive.restore_approved",
    label: "Archive restore approved",
    description: "Fires when an admin approves an archive restore request.",
    defaultRoles: ["Instance Admin"],
    variables: ["customerName", "approvedBy", "requestedBy"]
  },
  {
    id: "archive.restore_denied",
    label: "Archive restore denied",
    description: "Fires when an admin denies an archive restore request.",
    defaultRoles: ["Instance Admin"],
    variables: ["customerName", "deniedBy", "reason"]
  },
  {
    id: "archive.bundle_completed",
    label: "Archive monthly bundle completed",
    description: "Fires after the monthly archive bundle ZIP has been written successfully.",
    defaultRoles: ["Instance Admin"],
    variables: ["month", "customerCount", "sizeBytes"]
  },
  {
    id: "archive.bundle_failed",
    label: "Archive monthly bundle failed",
    description: "Fires when the monthly archive bundling job exits with an error.",
    defaultRoles: ["Instance Admin"],
    variables: ["month", "error"]
  }
];

type SubscriptionRow = {
  topic: EmailTopicId;
  roles: string[];
  extra_emails: string[];
  enabled: boolean;
  updated_at: string;
  updated_by: string | null;
};

export async function listSubscriptions(): Promise<Array<SubscriptionRow & { topic: EmailTopicId }>> {
  const result = await pool.query<SubscriptionRow>(
    "select topic, roles, extra_emails, enabled, updated_at, updated_by from email_subscriptions"
  );
  const seen = new Map<EmailTopicId, SubscriptionRow>();
  for (const row of result.rows) seen.set(row.topic, row);
  return EMAIL_TOPICS.map((topic) => {
    const existing = seen.get(topic.id);
    return existing ?? {
      topic: topic.id,
      roles: topic.defaultRoles,
      extra_emails: [],
      enabled: topic.defaultRoles.length > 0,
      updated_at: new Date(0).toISOString(),
      updated_by: null
    };
  });
}

export async function upsertSubscription(
  topic: EmailTopicId,
  payload: { roles: string[]; extraEmails: string[]; enabled: boolean },
  updatedBy: string
): Promise<void> {
  await pool.query(
    `insert into email_subscriptions (topic, roles, extra_emails, enabled, updated_at, updated_by)
     values ($1, $2::jsonb, $3::jsonb, $4, now(), $5)
     on conflict (topic) do update set
       roles = excluded.roles,
       extra_emails = excluded.extra_emails,
       enabled = excluded.enabled,
       updated_at = now(),
       updated_by = excluded.updated_by`,
    [topic, JSON.stringify(payload.roles), JSON.stringify(payload.extraEmails), payload.enabled, updatedBy]
  );
}

async function resolveRecipients(topic: EmailTopicId): Promise<string[]> {
  const result = await pool.query<SubscriptionRow>(
    "select roles, extra_emails, enabled from email_subscriptions where topic = $1",
    [topic]
  );
  let row = result.rows[0];
  if (!row) {
    const defaults = EMAIL_TOPICS.find((entry) => entry.id === topic);
    if (!defaults) return [];
    row = {
      topic,
      roles: defaults.defaultRoles,
      extra_emails: [],
      enabled: defaults.defaultRoles.length > 0,
      updated_at: new Date(0).toISOString(),
      updated_by: null
    };
  }
  if (!row.enabled) return [];
  const recipients = new Set<string>();
  if (row.roles.length > 0) {
    const usersByRole = await pool.query<{ email: string }>(
      `select u.email from users u
       join roles r on r.id = u.role_id
       where u.status = 'active' and r.name = any($1::text[])`,
      [row.roles]
    );
    for (const r of usersByRole.rows) recipients.add(r.email);
  }
  for (const email of row.extra_emails) {
    if (typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      recipients.add(email);
    }
  }
  return [...recipients];
}

type SmtpSettings = {
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_tls: boolean | null;
  smtp_user: string | null;
  smtp_password_encrypted: string | null;
  sender: string | null;
};

async function smtpTransport() {
  const row = await pool.query<SmtpSettings>("select * from email_settings order by updated_at desc limit 1");
  const settings = row.rows[0];
  if (!settings?.smtp_host) return null;
  const password = settings.smtp_password_encrypted ? safeDecrypt(settings.smtp_password_encrypted) : undefined;
  const smtpOptions = {
    host: settings.smtp_host,
    port: settings.smtp_port ?? 587,
    secure: (settings.smtp_port ?? 587) === 465,
    requireTLS: Boolean(settings.smtp_tls) && settings.smtp_port !== 465,
    auth: settings.smtp_user ? { user: settings.smtp_user, pass: password } : undefined
  };
  const transporter = nodemailer.createTransport(smtpOptions as unknown as nodemailer.TransportOptions);
  return {
    transporter,
    sender: settings.sender || settings.smtp_user || `audity@${settings.smtp_host}`
  };
}

function safeDecrypt(value: string): string | undefined {
  try {
    return decryptText(value);
  } catch {
    return undefined;
  }
}

export type TopicEvent = {
  topic: EmailTopicId;
  subject: string;
  text: string;
  html?: string;
};

/**
 * Resolve recipients for a topic, send via SMTP, log the result.
 * Failures are caught and logged — never throw, never block the caller.
 */
export async function publishEmailTopic(event: TopicEvent): Promise<void> {
  try {
    const recipients = await resolveRecipients(event.topic);
    if (recipients.length === 0) return;
    const transport = await smtpTransport();
    if (!transport) return;
    for (const recipient of recipients) {
      try {
        const result = await transport.transporter.sendMail({
          from: transport.sender,
          to: recipient,
          subject: event.subject,
          text: event.text,
          html: event.html
        });
        await pool.query(
          `insert into email_delivery_log (id, sender, recipient, encryption_method, smtp_result)
           values (gen_random_uuid(), $1, $2, $3, $4)`,
          [transport.sender, recipient, "tls", `topic=${event.topic} id=${result.messageId}`]
        ).catch(() => undefined);
      } catch (error) {
        await pool.query(
          `insert into email_delivery_log (id, sender, recipient, encryption_method, smtp_result)
           values (gen_random_uuid(), $1, $2, $3, $4)`,
          [transport.sender, recipient, "tls", `topic=${event.topic} failed=${(error as Error).message?.slice(0, 200)}`]
        ).catch(() => undefined);
      }
    }
  } catch (error) {
    // Swallow — notification failures must never break a foreground request.
    console.error("publishEmailTopic failure", error);
  }
}
