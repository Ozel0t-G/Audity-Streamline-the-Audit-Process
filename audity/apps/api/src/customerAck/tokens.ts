import { createHash, randomBytes, randomUUID } from "node:crypto";
import { pool } from "../db/client.js";

export type CustomerAckTokenStatus = "pending" | "redeemed" | "revoked" | "expired";

export type CustomerAckTokenRow = {
  id: string;
  assessment_id: string;
  recipient_email: string;
  recipient_hint: string | null;
  token_hash: string;
  issued_by_user_id: string;
  issued_at: string;
  expires_at: string;
  redeemed_at: string | null;
  redeemed_by_email: string | null;
  redeemed_signoff_id: string | null;
  revoked_at: string | null;
  revoked_by_user_id: string | null;
  revoke_reason: string | null;
  message: string | null;
  report_version_at_issue: number;
  email_send_status: string;
  email_send_error: string | null;
  last_opened_at: string | null;
  open_count: number;
};

export type CustomerAckToken = {
  id: string;
  assessmentId: string;
  recipientEmail: string;
  recipientHint: string | null;
  issuedByUserId: string;
  issuedAt: string;
  expiresAt: string;
  redeemedAt: string | null;
  redeemedByEmail: string | null;
  redeemedSignoffId: string | null;
  revokedAt: string | null;
  revokedByUserId: string | null;
  revokeReason: string | null;
  message: string | null;
  reportVersionAtIssue: number;
  emailSendStatus: string;
  emailSendError: string | null;
  lastOpenedAt: string | null;
  openCount: number;
  status: CustomerAckTokenStatus;
};

const DEFAULT_EXPIRY_DAYS = 7;
const MAX_CONCURRENT_PENDING = 3;

export function mapTokenRow(row: CustomerAckTokenRow): CustomerAckToken {
  return {
    id: row.id,
    assessmentId: row.assessment_id,
    recipientEmail: row.recipient_email,
    recipientHint: row.recipient_hint,
    issuedByUserId: row.issued_by_user_id,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    redeemedAt: row.redeemed_at,
    redeemedByEmail: row.redeemed_by_email,
    redeemedSignoffId: row.redeemed_signoff_id,
    revokedAt: row.revoked_at,
    revokedByUserId: row.revoked_by_user_id,
    revokeReason: row.revoke_reason,
    message: row.message,
    reportVersionAtIssue: row.report_version_at_issue,
    emailSendStatus: row.email_send_status,
    emailSendError: row.email_send_error,
    lastOpenedAt: row.last_opened_at,
    openCount: row.open_count,
    status: deriveStatus(row)
  };
}

function deriveStatus(row: CustomerAckTokenRow): CustomerAckTokenStatus {
  if (row.redeemed_at) return "redeemed";
  if (row.revoked_at) return "revoked";
  if (new Date(row.expires_at).getTime() < Date.now()) return "expired";
  return "pending";
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateTokenString(): string {
  return randomBytes(32).toString("base64url");
}

export type PinnedSnapshot = {
  customerName: string;
  assessmentType: string;
  auditorName: string;
  capturedAt: string;
  reportVersion: number;
  findings: Array<{
    id: string;
    title: string;
    severityTier: "critical" | "high" | "medium" | "low";
    severityScore: number;
    managementResponse: string | null;
    managementResponseStatus: string | null;
    lifecycleStatus: string | null;
  }>;
  readinessScore: number;
  controlCount: number;
  scopeItemCount: number;
  executiveSummary: string;
};

export async function captureSnapshot(assessmentId: string, reportVersion: number): Promise<PinnedSnapshot> {
  const audit = await pool.query<{
    customer_name: string;
    type: string;
    auditor_name: string | null;
  }>(
    `select c.name as customer_name, a.type, u.name as auditor_name
       from assessments a
       join customers c on c.id = a.customer_id
       left join audit_plans ap on ap.assessment_id = a.id
       left join users u on u.id = ap.created_by
      where a.id = $1`,
    [assessmentId]
  );
  const auditRow = audit.rows[0];
  if (!auditRow) {
    throw new Error(`Assessment ${assessmentId} not found for snapshot`);
  }

  const findingsResult = await pool.query<{
    id: string;
    title: string | null;
    severity_impact: number | null;
    severity_likelihood: number | null;
    management_response: string | null;
    management_response_status: string | null;
    lifecycle_status: string | null;
  }>(
    `select id, title, severity_impact, severity_likelihood,
            management_response, management_response_status, lifecycle_status
       from findings
      where assessment_id = $1
      order by severity_impact desc nulls last, severity_likelihood desc nulls last`,
    [assessmentId]
  );
  const findings = findingsResult.rows.map((f) => {
    const score = (f.severity_impact ?? 0) * (f.severity_likelihood ?? 0);
    let tier: "critical" | "high" | "medium" | "low" = "low";
    if (score >= 20) tier = "critical";
    else if (score >= 14) tier = "high";
    else if (score >= 7) tier = "medium";
    return {
      id: f.id,
      title: f.title ?? "(untitled)",
      severityTier: tier,
      severityScore: score,
      managementResponse: f.management_response,
      managementResponseStatus: f.management_response_status,
      lifecycleStatus: f.lifecycle_status
    };
  });

  const counts = await pool.query<{
    control_count: string;
    scope_count: string;
    answered: string;
    total: string;
  }>(
    `select
        (select count(*) from assessment_questions q where q.assessment_id = $1)::text as control_count,
        (select count(*) from audit_scope_items s where s.assessment_id = $1)::text as scope_count,
        (select count(*) from assessment_questions q
           join control_answers ca on ca.assessment_question_id = q.id
          where q.assessment_id = $1 and ca.answer_state <> 'unknown')::text as answered,
        (select count(*) from assessment_questions q where q.assessment_id = $1)::text as total`,
    [assessmentId]
  );
  const countsRow = counts.rows[0];
  const answered = Number(countsRow?.answered ?? "0");
  const total = Number(countsRow?.total ?? "0");
  const readiness = total > 0 ? Math.round((answered / total) * 100) : 0;

  const summary = `${findings.length} finding(s) recorded · ${countsRow?.control_count ?? "0"} controls · readiness ${readiness}%.`;

  return {
    customerName: auditRow.customer_name,
    assessmentType: auditRow.type,
    auditorName: auditRow.auditor_name ?? "An auditor",
    capturedAt: new Date().toISOString(),
    reportVersion,
    findings,
    readinessScore: readiness,
    controlCount: Number(countsRow?.control_count ?? "0"),
    scopeItemCount: Number(countsRow?.scope_count ?? "0"),
    executiveSummary: summary
  };
}

export async function issueToken(input: {
  assessmentId: string;
  recipientEmail: string;
  recipientHint?: string | null;
  message?: string | null;
  issuedByUserId: string;
  expiryDays?: number;
  reportVersion?: number;
}): Promise<{ token: string; row: CustomerAckToken }> {
  const expiryDays = Math.max(1, Math.min(30, input.expiryDays ?? DEFAULT_EXPIRY_DAYS));

  const pending = await pool.query<{ count: string }>(
    `select count(*)::text as count
       from customer_ack_tokens
      where assessment_id = $1
        and recipient_email = $2
        and redeemed_at is null
        and revoked_at is null
        and expires_at > now()`,
    [input.assessmentId, input.recipientEmail.toLowerCase()]
  );
  if (Number(pending.rows[0]?.count ?? "0") >= MAX_CONCURRENT_PENDING) {
    throw Object.assign(
      new Error(`Recipient already has ${MAX_CONCURRENT_PENDING} active pending tokens for this audit. Revoke one before issuing another.`),
      { code: "TOO_MANY_PENDING" }
    );
  }

  const id = randomUUID();
  const token = generateTokenString();
  const tokenHash = hashToken(token);
  const now = new Date();
  const expires = new Date(now.getTime() + expiryDays * 86400_000);

  const reportVersion = input.reportVersion ?? 1;
  const snapshot = await captureSnapshot(input.assessmentId, reportVersion);

  const inserted = await pool.query<CustomerAckTokenRow>(
    `insert into customer_ack_tokens (
       id, assessment_id, recipient_email, recipient_hint, token_hash,
       issued_by_user_id, issued_at, expires_at, message, report_version_at_issue,
       pinned_snapshot
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
     returning *`,
    [
      id,
      input.assessmentId,
      input.recipientEmail.toLowerCase().trim(),
      input.recipientHint?.trim() || null,
      tokenHash,
      input.issuedByUserId,
      now.toISOString(),
      expires.toISOString(),
      input.message?.trim() || null,
      reportVersion,
      JSON.stringify(snapshot)
    ]
  );
  return { token, row: mapTokenRow(inserted.rows[0]) };
}

export async function listTokensForAssessment(assessmentId: string): Promise<CustomerAckToken[]> {
  const result = await pool.query<CustomerAckTokenRow>(
    `select * from customer_ack_tokens
      where assessment_id = $1
      order by issued_at desc`,
    [assessmentId]
  );
  return result.rows.map(mapTokenRow);
}

export async function findTokenByPlain(token: string): Promise<(CustomerAckTokenRow & { pinned_snapshot: PinnedSnapshot | null }) | null> {
  const tokenHash = hashToken(token);
  const result = await pool.query<CustomerAckTokenRow & { pinned_snapshot: PinnedSnapshot | null }>(
    `select *, pinned_snapshot from customer_ack_tokens where token_hash = $1 limit 1`,
    [tokenHash]
  );
  return result.rows[0] ?? null;
}

export async function revokeToken(input: {
  tokenId: string;
  revokedByUserId: string;
  reason: string;
}): Promise<CustomerAckToken | null> {
  const result = await pool.query<CustomerAckTokenRow>(
    `update customer_ack_tokens
        set revoked_at = now(),
            revoked_by_user_id = $2,
            revoke_reason = $3
      where id = $1 and revoked_at is null and redeemed_at is null
      returning *`,
    [input.tokenId, input.revokedByUserId, input.reason.trim().slice(0, 500)]
  );
  return result.rows[0] ? mapTokenRow(result.rows[0]) : null;
}

export async function markEmailSent(tokenId: string, status: "sent" | "failed" | "skipped", error?: string): Promise<void> {
  await pool.query(
    `update customer_ack_tokens
        set email_send_status = $2, email_send_error = $3
      where id = $1`,
    [tokenId, status, error ?? null]
  );
}

export async function recordTokenOpen(tokenId: string): Promise<void> {
  await pool.query(
    `update customer_ack_tokens
        set last_opened_at = now(), open_count = open_count + 1
      where id = $1`,
    [tokenId]
  );
}

/**
 * Atomically claims the token for redemption. The guarded UPDATE only succeeds
 * for a token that is still pending (not already redeemed, revoked, or expired),
 * so concurrent redeem requests (e.g. a double-clicked Submit) can't both win and
 * produce duplicate sign-offs. Returns true only for the request that claimed it.
 */
export async function markTokenRedeemed(input: {
  tokenId: string;
  redeemedByEmail: string;
  signoffId: string;
}): Promise<boolean> {
  const result = await pool.query(
    `update customer_ack_tokens
        set redeemed_at = now(),
            redeemed_by_email = $2,
            redeemed_signoff_id = $3
      where id = $1
        and redeemed_at is null
        and revoked_at is null
        and expires_at > now()`,
    [input.tokenId, input.redeemedByEmail.toLowerCase().trim(), input.signoffId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function isFeatureEnabled(): Promise<boolean> {
  const result = await pool.query<{ value: unknown }>(
    `select value from settings where key = 'customer_ack_enabled'`
  );
  const raw = result.rows[0]?.value;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") return raw === "true";
  if (raw && typeof raw === "object" && "enabled" in raw) {
    return Boolean((raw as { enabled: unknown }).enabled);
  }
  return false;
}

export async function setFeatureEnabled(enabled: boolean): Promise<void> {
  await pool.query(
    `insert into settings (key, value, updated_at)
       values ('customer_ack_enabled', $1::jsonb, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [JSON.stringify(enabled)]
  );
}
