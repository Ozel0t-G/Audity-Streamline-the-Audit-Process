import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createHash, randomUUID as cryptoRandomUUID } from "node:crypto";
import { appendActivityEvent } from "../activity/service.js";
import { requireCsrf, requireCsrfPermission, requirePermission } from "../auth/hooks.js";
import { requireFeature } from "../license/requireFeature.js";
import { canAccessAssessment } from "../customers/access.js";
import { pool } from "../db/client.js";
import { invalidateCockpitCache } from "../cockpit/routes.js";
import { sendAckEmail } from "./email.js";
import { renderReceiptPdf } from "./receiptPdf.js";
import { renderSnapshotPdf } from "./snapshotPdf.js";
import {
  findTokenByPlain,
  isFeatureEnabled,
  issueToken,
  listTokensForAssessment,
  markEmailSent,
  markTokenRedeemed,
  mapTokenRow,
  recordTokenOpen,
  revokeToken,
  setFeatureEnabled,
  type PinnedSnapshot
} from "./tokens.js";

// Portal-specific rate-limit: stricter than the global 200/min default to discourage
// token guessing. Applied per-route via Fastify's @fastify/rate-limit config option.
const PORTAL_RATE_LIMIT = { max: 20, timeWindow: "1 minute" } as const;

/**
 * Defensive response headers for portal endpoints — minimise what a compromised
 * portal page could exfiltrate, prevent embedding in iframes, suppress referer leaks.
 */
function applyPortalHeaders(
  reply: { header: (name: string, value: string) => unknown },
  options: { frameable?: boolean } = {}
): void {
  // The snapshot PDF is intentionally embedded in an <iframe> on the portal page,
  // so it must allow same-origin framing; everything else stays DENY.
  reply.header("X-Frame-Options", options.frameable ? "SAMEORIGIN" : "DENY");
  reply.header("Referrer-Policy", "no-referrer");
  reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("Cross-Origin-Opener-Policy", "same-origin");
  reply.header("Cross-Origin-Resource-Policy", "same-origin");
}

const issueBody = z.object({
  recipientEmail: z.string().email().max(254),
  recipientHint: z.string().max(120).optional(),
  message: z.string().max(2000).optional(),
  expiryDays: z.number().int().min(1).max(30).optional()
});

const revokeBody = z.object({
  reason: z.string().trim().min(1).max(500)
});

const redeemBody = z.object({
  signerName: z.string().trim().min(2).max(120),
  position: z.string().trim().max(120).optional(),
  comment: z.string().max(2000).optional(),
  acknowledgmentConfirmed: z.literal(true)
});

const tenantToggleBody = z.object({
  enabled: z.boolean()
});

/**
 * Lightweight portal-side activity append. Bypasses the strict appendActivityEvent
 * (which requires a userId FK) because portal users have no Audity account.
 * Hash-chain compatible: chains off the most recent user_activity_logs entry.
 */
async function appendPortalActivity(input: {
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
}): Promise<void> {
  try {
    const previous = await pool.query<{ event_hash: string }>(
      "select event_hash from user_activity_logs order by created_at desc, id desc limit 1"
    );
    const prevHash = previous.rows[0]?.event_hash ?? "";
    const payload = JSON.stringify({ before: input.before, after: input.after });
    const timestamp = new Date().toISOString();
    const eventHash = createHash("sha256")
      .update(timestamp + "PORTAL" + input.action + input.entityId + payload + prevHash)
      .digest("hex");
    await pool.query(
      `insert into user_activity_logs
         (id, user_id, action, entity_type, entity_id, before_value, after_value, prev_hash, event_hash, created_at)
       values ($1, null, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        cryptoRandomUUID(),
        input.action,
        input.entityType,
        input.entityId,
        input.before ? JSON.stringify(input.before) : null,
        input.after ? JSON.stringify(input.after) : null,
        prevHash,
        eventHash,
        timestamp
      ]
    );
  } catch {
    // best-effort
  }
}

function clientIp(request: { ip?: string; headers?: Record<string, unknown> }): string | null {
  const forwarded = request.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0]?.trim() || null;
  }
  return request.ip ?? null;
}

async function loadAuditContext(assessmentId: string): Promise<{
  customerName: string;
  assessmentType: string;
  auditorName: string;
} | null> {
  const result = await pool.query<{
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
  const row = result.rows[0];
  if (!row) return null;
  return {
    customerName: row.customer_name,
    assessmentType: row.type,
    auditorName: row.auditor_name ?? "An auditor"
  };
}

function portalUrlFor(token: string, publicUrl: string): string {
  const base = publicUrl.startsWith("http") ? publicUrl : `https://${publicUrl}`;
  return `${base.replace(/\/$/, "")}/portal/ack/${token}`;
}

const closureBody = z.object({
  forceWithoutAck: z.boolean().optional()
});

export async function registerCustomerAckRoutes(app: FastifyInstance, config: { publicUrl: string }): Promise<void> {
  // Closure endpoint with customer-ack-skip warning.
  app.post<{ Params: { id: string }; Body: z.infer<typeof closureBody> }>(
    "/api/assessments/:id/close",
    { preHandler: requireCsrfPermission("assessment.edit") },
    async (request, reply) => {
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const parsed = closureBody.safeParse(request.body ?? {});
      const force = parsed.success && parsed.data.forceWithoutAck === true;
      const featureEnabled = await isFeatureEnabled();
      let skipFlagged = false;
      if (featureEnabled) {
        const acks = await pool.query<{ count: string }>(
          `select count(*)::text as count from audit_signoffs
            where assessment_id = $1
              and signoff_type = 'customer_ack'`,
          [request.params.id]
        );
        const ackCount = Number(acks.rows[0]?.count ?? "0");
        if (ackCount === 0 && !force) {
          return reply.code(409).send({
            code: "MISSING_CUSTOMER_ACK",
            message: "No customer acknowledgment recorded. Re-send with forceWithoutAck=true to close anyway.",
            warning: true
          });
        }
        if (ackCount === 0 && force) {
          skipFlagged = true;
        }
      }
      const updated = await pool.query<{ id: string; status: string }>(
        `update assessments
            set status = 'completed',
                updated_at = now(),
                closure_flags = $2::jsonb
          where id = $1
          returning id, status`,
        [
          request.params.id,
          JSON.stringify(
            skipFlagged
              ? [
                  {
                    flag: "closed_without_customer_ack",
                    by: request.user!.sub,
                    at: new Date().toISOString()
                  }
                ]
              : []
          )
        ]
      );
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "assessment.closed",
        entityType: "assessment",
        entityId: request.params.id,
        before: null,
        after: { skipFlagged }
      }).catch(() => undefined);
      await invalidateCockpitCache({ assessmentId: request.params.id });
      return { assessment: updated.rows[0], skipFlagged };
    }
  );

  // ───────────────── Admin tenant toggle ─────────────────
  app.get(
    "/api/admin/customer-ack/settings",
    { preHandler: [requirePermission("settings.manage"), requireFeature("customer_ack")] },
    async () => {
      const enabled = await isFeatureEnabled();
      return { enabled };
    }
  );

  app.put<{ Body: z.infer<typeof tenantToggleBody> }>(
    "/api/admin/customer-ack/settings",
    { preHandler: [requirePermission("settings.manage"), requireFeature("customer_ack")] },
    async (request, reply) => {
      const parsed = tenantToggleBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ code: "INVALID_BODY", message: parsed.error.message });
      }
      await requireCsrf(request, reply);
      if (reply.sent) return;
      const before = await isFeatureEnabled();
      await setFeatureEnabled(parsed.data.enabled);
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "customer_ack.tenant_toggle",
        entityType: "settings",
        entityId: "customer_ack_enabled",
        before: { enabled: before },
        after: { enabled: parsed.data.enabled }
      }).catch(() => undefined);
      return { enabled: parsed.data.enabled };
    }
  );

  // ───────────────── Auditor endpoints ─────────────────
  app.get<{ Params: { id: string } }>(
    "/api/assessments/:id/customer-ack-tokens",
    { preHandler: [requirePermission("assessment.view"), requireFeature("customer_ack")] },
    async (request, reply) => {
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const enabled = await isFeatureEnabled();
      const tokens = await listTokensForAssessment(request.params.id);
      return { enabled, tokens };
    }
  );

  app.post<{ Params: { id: string }; Body: z.infer<typeof issueBody> }>(
    "/api/assessments/:id/customer-ack-tokens",
    { preHandler: [requireCsrfPermission("finding.approve"), requireFeature("customer_ack")] },
    async (request, reply) => {
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      if (!(await isFeatureEnabled())) {
        return reply.code(403).send({ code: "FEATURE_DISABLED", message: "Customer acknowledgments are disabled for this tenant." });
      }
      const parsed = issueBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ code: "INVALID_BODY", message: parsed.error.message });
      }
      try {
        const ctx = await loadAuditContext(request.params.id);
        if (!ctx) {
          return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
        }
        const { token, row } = await issueToken({
          assessmentId: request.params.id,
          recipientEmail: parsed.data.recipientEmail,
          recipientHint: parsed.data.recipientHint,
          message: parsed.data.message,
          expiryDays: parsed.data.expiryDays,
          issuedByUserId: request.user!.sub
        });
        await appendActivityEvent({
          userId: request.user!.sub,
          action: "customer_ack.issued",
          entityType: "assessment",
          entityId: request.params.id,
          before: null,
          after: { tokenId: row.id, recipientEmail: row.recipientEmail, expiresAt: row.expiresAt }
        }).catch(() => undefined);
        const portalUrl = portalUrlFor(token, config.publicUrl);
        const sendResult = await sendAckEmail({
          recipientEmail: row.recipientEmail,
          recipientHint: row.recipientHint,
          message: row.message,
          customerName: ctx.customerName,
          assessmentType: ctx.assessmentType,
          auditorName: ctx.auditorName,
          portalUrl,
          expiresAt: row.expiresAt
        });
        await markEmailSent(row.id, sendResult.ok ? "sent" : "failed", sendResult.error);
        await appendActivityEvent({
          userId: request.user!.sub,
          action: sendResult.ok ? "customer_ack.email_sent" : "customer_ack.email_failed",
          entityType: "assessment",
          entityId: request.params.id,
          before: null,
          after: { tokenId: row.id, error: sendResult.error ?? null }
        }).catch(() => undefined);
        await invalidateCockpitCache({ assessmentId: request.params.id });
        const refreshed = await listTokensForAssessment(request.params.id);
        const updated = refreshed.find((t) => t.id === row.id) ?? row;
        return reply.code(201).send({ token: updated });
      } catch (err) {
        const error = err as Error & { code?: string };
        if (error.code === "TOO_MANY_PENDING") {
          return reply.code(409).send({ code: error.code, message: error.message });
        }
        return reply.code(500).send({ code: "ISSUE_FAILED", message: error.message });
      }
    }
  );

  app.post<{ Params: { id: string; tokenId: string }; Body: z.infer<typeof revokeBody> }>(
    "/api/assessments/:id/customer-ack-tokens/:tokenId/revoke",
    { preHandler: [requireCsrfPermission("finding.approve"), requireFeature("customer_ack")] },
    async (request, reply) => {
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const parsed = revokeBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ code: "INVALID_BODY", message: parsed.error.message });
      }
      const result = await revokeToken({
        tokenId: request.params.tokenId,
        revokedByUserId: request.user!.sub,
        reason: parsed.data.reason
      });
      if (!result) {
        return reply.code(409).send({ code: "CANNOT_REVOKE", message: "Token cannot be revoked (already redeemed, revoked, or unknown)." });
      }
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "customer_ack.revoked",
        entityType: "assessment",
        entityId: request.params.id,
        before: null,
        after: { tokenId: result.id, reason: result.revokeReason }
      }).catch(() => undefined);
      await invalidateCockpitCache({ assessmentId: request.params.id });
      return { token: result };
    }
  );

  app.post<{ Params: { id: string; tokenId: string } }>(
    "/api/assessments/:id/customer-ack-tokens/:tokenId/resend",
    { preHandler: [requireCsrfPermission("finding.approve"), requireFeature("customer_ack")] },
    async (request, reply) => {
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const existing = await pool.query<{
        recipient_email: string;
        recipient_hint: string | null;
        message: string | null;
        report_version_at_issue: number;
        redeemed_at: string | null;
        revoked_at: string | null;
      }>(
        `select recipient_email, recipient_hint, message, report_version_at_issue, redeemed_at::text, revoked_at::text
           from customer_ack_tokens
          where id = $1 and assessment_id = $2`,
        [request.params.tokenId, request.params.id]
      );
      const oldRow = existing.rows[0];
      if (!oldRow) {
        return reply.code(404).send({ code: "TOKEN_NOT_FOUND", message: "Token not found" });
      }
      if (oldRow.redeemed_at) {
        return reply.code(409).send({ code: "ALREADY_REDEEMED", message: "Token already redeemed." });
      }
      if (!oldRow.revoked_at) {
        await revokeToken({
          tokenId: request.params.tokenId,
          revokedByUserId: request.user!.sub,
          reason: "Replaced by resend"
        });
      }
      const ctx = await loadAuditContext(request.params.id);
      if (!ctx) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const { token, row } = await issueToken({
        assessmentId: request.params.id,
        recipientEmail: oldRow.recipient_email,
        recipientHint: oldRow.recipient_hint,
        message: oldRow.message,
        reportVersion: oldRow.report_version_at_issue,
        issuedByUserId: request.user!.sub
      });
      const portalUrl = portalUrlFor(token, config.publicUrl);
      const sendResult = await sendAckEmail({
        recipientEmail: row.recipientEmail,
        recipientHint: row.recipientHint,
        message: row.message,
        customerName: ctx.customerName,
        assessmentType: ctx.assessmentType,
        auditorName: ctx.auditorName,
        portalUrl,
        expiresAt: row.expiresAt
      });
      await markEmailSent(row.id, sendResult.ok ? "sent" : "failed", sendResult.error);
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "customer_ack.resent",
        entityType: "assessment",
        entityId: request.params.id,
        before: { previousTokenId: request.params.tokenId },
        after: { tokenId: row.id }
      }).catch(() => undefined);
      await invalidateCockpitCache({ assessmentId: request.params.id });
      return reply.code(201).send({ token: row });
    }
  );

  // ───────────────── Customer portal (no auth) ─────────────────
  app.get<{ Params: { token: string } }>(
    "/api/portal/ack/:token",
    { config: { rateLimit: PORTAL_RATE_LIMIT } },
    async (request, reply) => {
      applyPortalHeaders(reply);
      const row = await findTokenByPlain(request.params.token);
      if (!row) {
        return reply.code(404).send({ code: "INVALID_TOKEN", message: "Link is no longer valid." });
      }
      const mapped = mapTokenRow(row);
      if (mapped.status === "revoked") {
        return reply.code(410).send({ code: "TOKEN_REVOKED", message: "This link was revoked.", revokeReason: mapped.revokeReason });
      }
      if (mapped.status === "expired") {
        return reply.code(410).send({ code: "TOKEN_EXPIRED", message: "This link has expired." });
      }
      if (mapped.status === "redeemed") {
        return reply.code(410).send({
          code: "ALREADY_REDEEMED",
          message: "This acknowledgment has already been recorded.",
          redeemedAt: mapped.redeemedAt
        });
      }
      await recordTokenOpen(mapped.id);

      // Use the frozen snapshot pinned at issue time, NOT live data.
      const snapshot = row.pinned_snapshot;
      if (!snapshot) {
        // Legacy tokens issued before migration 005 — fall back to live data once.
        return reply.code(409).send({
          code: "SNAPSHOT_MISSING",
          message: "This token was issued before the snapshot feature shipped. Auditor must resend the link."
        });
      }

      const branding = await pool.query<{
        logo_object_key: string | null;
        primary_color: string | null;
        header_text: string | null;
        footer_text: string | null;
      }>(
        "select logo_object_key, primary_color, header_text, footer_text from report_branding order by updated_at desc limit 1"
      );
      const b = branding.rows[0];

      await appendPortalActivity({
        action: "customer_ack.opened",
        entityType: "assessment",
        entityId: mapped.assessmentId,
        before: null,
        after: { tokenId: mapped.id, ip: clientIp(request) }
      }).catch(() => undefined);

      return {
        audit: {
          customerName: snapshot.customerName,
          assessmentType: snapshot.assessmentType,
          auditorName: snapshot.auditorName
        },
        findings: snapshot.findings,
        snapshot: {
          capturedAt: snapshot.capturedAt,
          reportVersion: snapshot.reportVersion,
          readinessScore: snapshot.readinessScore,
          controlCount: snapshot.controlCount,
          scopeItemCount: snapshot.scopeItemCount,
          executiveSummary: snapshot.executiveSummary
        },
        recipientEmail: mapped.recipientEmail,
        recipientHint: mapped.recipientHint,
        message: mapped.message,
        expiresAt: mapped.expiresAt,
        branding: {
          logoUrl: b?.logo_object_key ?? null,
          primaryColor: b?.primary_color ?? "#3b6eea",
          headerText: b?.header_text ?? null,
          footerText: b?.footer_text ?? null
        },
        tokenStatus: mapped.status
      };
    }
  );

  app.post<{ Params: { token: string }; Body: z.infer<typeof redeemBody> }>(
    "/api/portal/ack/:token/redeem",
    { config: { rateLimit: PORTAL_RATE_LIMIT } },
    async (request, reply) => {
      applyPortalHeaders(reply);
      const parsed = redeemBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ code: "INVALID_BODY", message: parsed.error.message });
      }
      const row = await findTokenByPlain(request.params.token);
      if (!row) {
        return reply.code(404).send({ code: "INVALID_TOKEN", message: "Link is no longer valid." });
      }
      const mapped = mapTokenRow(row);
      if (mapped.status !== "pending") {
        return reply.code(410).send({ code: `TOKEN_${mapped.status.toUpperCase()}`, message: `Token is ${mapped.status}.` });
      }

      const ip = clientIp(request);
      const userAgent =
        typeof request.headers["user-agent"] === "string"
          ? (request.headers["user-agent"] as string).slice(0, 500)
          : null;
      const signerName = parsed.data.signerName.trim();
      const position = parsed.data.position?.trim() || null;
      const comment = parsed.data.comment?.trim() || null;

      const statement = position
        ? `${signerName} (${position}) acknowledged the audit report.`
        : `${signerName} acknowledged the audit report.`;

      const signoffId = randomUUID();
      const eventHash = await import("node:crypto").then(({ createHash }) =>
        createHash("sha256")
          .update(`${signoffId}|${mapped.assessmentId}|${row.id}|${signerName}|${Date.now()}`)
          .digest("hex")
      );

      // Claim the token and write the sign-off in ONE transaction. Otherwise a
      // transient failure on the sign-off insert (after a successful claim) would
      // burn the token while leaving no sign-off — the customer could never
      // re-acknowledge. The claim itself stays atomic (single conditional UPDATE),
      // so a concurrent double-submit still has exactly one winner.
      const client = await pool.connect();
      try {
        await client.query("begin");
        const claimed = await markTokenRedeemed({
          tokenId: row.id,
          redeemedByEmail: mapped.recipientEmail,
          signoffId
        }, client);
        if (!claimed) {
          await client.query("rollback");
          return reply.code(410).send({ code: "TOKEN_REDEEMED", message: "Token is redeemed." });
        }

        await client.query(
          `insert into audit_signoffs (
              id, assessment_id, entity_type, entity_id, signoff_status, signoff_type,
              signer_name, signer_email, signer_ip, signer_user_agent, statement,
              comment, token_id, report_version, event_hash
           ) values ($1, $2, 'assessment', $3, 'signed', 'customer_ack',
                     $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            signoffId,
            mapped.assessmentId,
            mapped.assessmentId,
            signerName,
            mapped.recipientEmail,
            ip,
            userAgent,
            statement,
            comment,
            row.id,
            mapped.reportVersionAtIssue,
            eventHash
          ]
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }

      await appendPortalActivity({
        action: "customer_ack.redeemed",
        entityType: "assessment",
        entityId: mapped.assessmentId,
        before: null,
        after: {
          tokenId: row.id,
          signoffId,
          signerName,
          signerEmail: mapped.recipientEmail,
          ip,
          position,
          hasComment: Boolean(comment)
        }
      }).catch(() => undefined);

      await invalidateCockpitCache({ assessmentId: mapped.assessmentId });

      return {
        signoffId,
        signoffHash: eventHash,
        receiptUrl: `/api/portal/ack/${request.params.token}/receipt`
      };
    }
  );

  // Snapshot PDF: report preview the customer can scroll/print before submitting.
  // Same token-auth as GET /portal/ack/:token — pinned snapshot only, no live data.
  app.get<{ Params: { token: string } }>(
    "/api/portal/ack/:token/snapshot.pdf",
    { config: { rateLimit: PORTAL_RATE_LIMIT } },
    async (request, reply) => {
      applyPortalHeaders(reply, { frameable: true });
      const row = await findTokenByPlain(request.params.token);
      if (!row) {
        return reply.code(404).send({ code: "INVALID_TOKEN", message: "Link is no longer valid." });
      }
      const mapped = mapTokenRow(row);
      // Allow snapshot view while pending OR while redeemed (audit-trail use)
      if (mapped.status === "revoked" || mapped.status === "expired") {
        return reply.code(410).send({ code: `TOKEN_${mapped.status.toUpperCase()}`, message: `Token is ${mapped.status}.` });
      }
      if (!row.pinned_snapshot) {
        return reply.code(409).send({ code: "SNAPSHOT_MISSING", message: "No snapshot available for this token." });
      }
      const brandingResult = await pool.query<{
        primary_color: string | null;
        header_text: string | null;
        footer_text: string | null;
      }>(
        "select primary_color, header_text, footer_text from report_branding order by updated_at desc limit 1"
      );
      const b = brandingResult.rows[0];

      const pdf = await renderSnapshotPdf({
        snapshot: row.pinned_snapshot,
        message: mapped.message,
        recipientEmail: mapped.recipientEmail,
        branding: {
          primaryColor: b?.primary_color ?? undefined,
          headerText: b?.header_text ?? undefined,
          footerText: b?.footer_text ?? undefined
        }
      });
      reply
        .header("Content-Type", "application/pdf")
        .header(
          "Content-Disposition",
          `inline; filename="audit-snapshot-${mapped.id}.pdf"`
        )
        .header("Cache-Control", "private, no-store");
      return reply.send(pdf);
    }
  );

  // Receipt PDF download — tamper-evident record bound to the frozen snapshot.
  app.get<{ Params: { token: string } }>(
    "/api/portal/ack/:token/receipt",
    { config: { rateLimit: PORTAL_RATE_LIMIT } },
    async (request, reply) => {
      applyPortalHeaders(reply);
      const row = await findTokenByPlain(request.params.token);
      if (!row) {
        return reply.code(404).send({ code: "INVALID_TOKEN", message: "Link is no longer valid." });
      }
      const mapped = mapTokenRow(row);
      if (!mapped.redeemedAt || !mapped.redeemedSignoffId) {
        return reply.code(409).send({ code: "NOT_REDEEMED", message: "Acknowledgment has not been recorded yet." });
      }
      const signoff = await pool.query<{
        id: string;
        signer_name: string | null;
        signer_email: string | null;
        signer_ip: string | null;
        signer_user_agent: string | null;
        statement: string;
        comment: string | null;
        event_hash: string;
        created_at: string;
        report_version: number | null;
      }>(
        `select id, signer_name, signer_email, signer_ip, signer_user_agent,
                statement, comment, event_hash, created_at::text, report_version
           from audit_signoffs where id = $1`,
        [mapped.redeemedSignoffId]
      );
      const s = signoff.rows[0];
      if (!s) {
        return reply.code(404).send({ code: "SIGNOFF_NOT_FOUND", message: "Signoff record not found." });
      }
      const snapshot: PinnedSnapshot | null = row.pinned_snapshot;
      if (!snapshot) {
        return reply.code(409).send({ code: "SNAPSHOT_MISSING", message: "Snapshot missing — cannot render receipt." });
      }
      const brandingResult = await pool.query<{
        primary_color: string | null;
        header_text: string | null;
        footer_text: string | null;
      }>(
        "select primary_color, header_text, footer_text from report_branding order by updated_at desc limit 1"
      );
      const b = brandingResult.rows[0];

      const pdf = await renderReceiptPdf({
        signoffId: s.id,
        signoffHash: s.event_hash,
        signerName: s.signer_name ?? "",
        signerEmail: s.signer_email ?? "",
        signerIp: s.signer_ip,
        signerUserAgent: s.signer_user_agent,
        statement: s.statement,
        comment: s.comment,
        signedAt: s.created_at,
        reportVersion: s.report_version ?? snapshot.reportVersion,
        tokenId: mapped.id,
        snapshot,
        branding: {
          primaryColor: b?.primary_color ?? undefined,
          headerText: b?.header_text ?? undefined,
          footerText: b?.footer_text ?? undefined
        }
      });

      reply
        .header("Content-Type", "application/pdf")
        .header(
          "Content-Disposition",
          `inline; filename="audit-acknowledgment-${mapped.id}.pdf"`
        )
        .header("Cache-Control", "private, no-store");
      return reply.send(pdf);
    }
  );

  // Auditor-side: copy raw token link (for SMTP-failure recovery).
  // Returns the token plain-text only to the issuing auditor and only while pending.
  app.get<{ Params: { id: string; tokenId: string } }>(
    "/api/assessments/:id/customer-ack-tokens/:tokenId/link",
    { preHandler: [requirePermission("finding.approve"), requireFeature("customer_ack")] },
    async (request, reply) => {
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      // Sub-status check: link can only be retrieved if email failed AND token is pending.
      const result = await pool.query<{
        issued_by_user_id: string;
        email_send_status: string;
        redeemed_at: string | null;
        revoked_at: string | null;
        expires_at: string;
        recipient_email: string;
      }>(
        `select issued_by_user_id, email_send_status, redeemed_at::text, revoked_at::text, expires_at::text, recipient_email
           from customer_ack_tokens
          where id = $1 and assessment_id = $2`,
        [request.params.tokenId, request.params.id]
      );
      const tokenRow = result.rows[0];
      if (!tokenRow) {
        return reply.code(404).send({ code: "TOKEN_NOT_FOUND", message: "Token not found." });
      }
      if (tokenRow.issued_by_user_id !== request.user!.sub) {
        return reply.code(403).send({ code: "NOT_ISSUER", message: "Only the issuer can retrieve the raw link." });
      }
      if (tokenRow.redeemed_at || tokenRow.revoked_at || new Date(tokenRow.expires_at) < new Date()) {
        return reply.code(409).send({ code: "NOT_PENDING", message: "Token is no longer pending." });
      }
      if (tokenRow.email_send_status === "sent") {
        return reply.code(409).send({
          code: "EMAIL_OK",
          message: "Email was sent successfully. Raw link retrieval is reserved for SMTP failures."
        });
      }
      // We can't recover the raw token (only its hash is stored), so we mint a fresh one
      // and revoke the failed-email one. This is the documented copy-link recovery path.
      const ctx = await loadAuditContext(request.params.id);
      if (!ctx) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      await revokeToken({
        tokenId: request.params.tokenId,
        revokedByUserId: request.user!.sub,
        reason: "Replaced by copy-link recovery after email failure"
      });
      const fresh = await issueToken({
        assessmentId: request.params.id,
        recipientEmail: tokenRow.recipient_email,
        issuedByUserId: request.user!.sub
      });
      // Don't try to send email this time — return the link directly.
      await markEmailSent(fresh.row.id, "skipped", "Returned via copy-link recovery");
      const portalUrl = portalUrlFor(fresh.token, config.publicUrl);
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "customer_ack.copy_link_recovered",
        entityType: "assessment",
        entityId: request.params.id,
        before: { failedTokenId: request.params.tokenId },
        after: { newTokenId: fresh.row.id }
      }).catch(() => undefined);
      await invalidateCockpitCache({ assessmentId: request.params.id });
      return { token: fresh.row, portalUrl };
    }
  );
}
