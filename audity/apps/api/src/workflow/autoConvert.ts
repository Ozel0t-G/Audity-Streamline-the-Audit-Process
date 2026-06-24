import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendActivityEvent } from "../activity/service.js";
import { requireCsrfPermission, requirePermission } from "../auth/hooks.js";
import { canAccessAssessment } from "../customers/access.js";
import { pool } from "../db/client.js";

const toggleBody = z.object({
  enabled: z.boolean()
});

/**
 * Per-assessment toggle: when on, approving a Finding automatically creates
 * a draft Risk linked via risk_finding_links (if no linked risk exists yet).
 */
export async function registerAutoConvertRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>(
    "/api/assessments/:id/auto-convert-findings",
    { preHandler: requirePermission("assessment.view") },
    async (request, reply) => {
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const result = await pool.query<{ auto_convert_findings_to_risks: boolean }>(
        `select auto_convert_findings_to_risks from assessments where id = $1`,
        [request.params.id]
      );
      return { enabled: Boolean(result.rows[0]?.auto_convert_findings_to_risks) };
    }
  );

  app.put<{ Params: { id: string }; Body: z.infer<typeof toggleBody> }>(
    "/api/assessments/:id/auto-convert-findings",
    { preHandler: requireCsrfPermission("assessment.edit") },
    async (request, reply) => {
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const parsed = toggleBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ code: "INVALID_BODY", message: parsed.error.message });
      }
      await pool.query(
        `update assessments set auto_convert_findings_to_risks = $2, updated_at = now() where id = $1`,
        [request.params.id, parsed.data.enabled]
      );
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "assessment.auto_convert_toggle",
        entityType: "assessment",
        entityId: request.params.id,
        before: null,
        after: { enabled: parsed.data.enabled }
      }).catch(() => undefined);
      return { enabled: parsed.data.enabled };
    }
  );
}

/**
 * Called from the finding PUT handler when a finding moves to 'approved'.
 * Creates a draft risk linked via risk_finding_links if no risk linked yet.
 * Idempotent: if a risk is already linked, does nothing.
 */
export async function maybeAutoConvertFindingToRisk(
  assessmentId: string,
  findingId: string,
  userId: string
): Promise<{ created: boolean; riskId?: string }> {
  const settings = await pool.query<{ auto_convert_findings_to_risks: boolean }>(
    `select auto_convert_findings_to_risks from assessments where id = $1`,
    [assessmentId]
  );
  if (!settings.rows[0]?.auto_convert_findings_to_risks) {
    return { created: false };
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    // Serialize concurrent auto-conversions for the same finding. Without this, two
    // near-simultaneous approvals (double-submit/retry) both pass the existence check
    // below and each insert a *different* random-id risk — the `on conflict
    // (risk_id, finding_id)` guard can't dedup because the risk ids differ, yielding
    // duplicate draft risks. risk_finding_links is many-to-many (a finding may back
    // multiple risks), so a unique(finding_id) constraint isn't viable; a
    // transaction-scoped advisory lock keyed on the finding is the right guard.
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`risk-autoconvert:${findingId}`]);

    const existing = await client.query<{ risk_id: string }>(
      `select risk_id from risk_finding_links where finding_id = $1 limit 1`,
      [findingId]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      await client.query("commit");
      return { created: false, riskId: existing.rows[0].risk_id };
    }
    const finding = await client.query<{ title: string; priority: string | null }>(
      `select title, priority from findings where id = $1`,
      [findingId]
    );
    const f = finding.rows[0];
    if (!f) {
      await client.query("commit");
      return { created: false };
    }

    const riskId = randomUUID();
    await client.query(
      `insert into risks (id, assessment_id, finding_id, title, likelihood, impact, risk_score, rating, status, draft)
         values ($1, $2, $3, $4, 3, 3, 9, 'Medium', 'open', true)`,
      [riskId, assessmentId, findingId, f.title]
    );
    await client.query(
      `insert into risk_finding_links (risk_id, finding_id, contribution_note)
         values ($1, $2, 'Auto-created on finding approval')
         on conflict (risk_id, finding_id) do nothing`,
      [riskId, findingId]
    );
    await client.query("commit");

    await appendActivityEvent({
      userId,
      action: "risk.auto_created_from_finding",
      entityType: "risk",
      entityId: riskId,
      before: null,
      after: { findingId, autoCreated: true }
    }).catch(() => undefined);
    return { created: true, riskId };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
