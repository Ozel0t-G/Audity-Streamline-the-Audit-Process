import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendActivityEvent } from "../activity/service.js";
import { requireCsrfPermission, requirePermission } from "../auth/hooks.js";
import { canAccessAssessment } from "../customers/access.js";
import { pool } from "../db/client.js";

const linkBody = z.object({
  findingId: z.string().uuid(),
  contributionNote: z.string().max(500).optional()
});

export async function registerRiskFindingLinkRoutes(app: FastifyInstance): Promise<void> {
  // List findings linked to a risk
  app.get<{ Params: { id: string; riskId: string } }>(
    "/api/assessments/:id/risks/:riskId/findings",
    { preHandler: requirePermission("assessment.view") },
    async (request, reply) => {
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const result = await pool.query<{
        finding_id: string;
        title: string;
        status: string;
        priority: string | null;
        control_code: string | null;
        contribution_note: string | null;
        linked_at: string;
      }>(
        `select rfl.finding_id, f.title, f.status, f.priority,
                fc.control_code,
                rfl.contribution_note, rfl.created_at::text as linked_at
           from risk_finding_links rfl
           join findings f on f.id = rfl.finding_id
           left join framework_controls fc on fc.id = f.framework_control_id
          where rfl.risk_id = $1
          order by rfl.created_at desc`,
        [request.params.riskId]
      );
      return {
        links: result.rows.map((row) => ({
          findingId: row.finding_id,
          title: row.title,
          status: row.status,
          priority: row.priority,
          controlCode: row.control_code,
          contributionNote: row.contribution_note,
          linkedAt: row.linked_at
        }))
      };
    }
  );

  // List risks linked to a finding (reverse direction)
  app.get<{ Params: { id: string; findingId: string } }>(
    "/api/assessments/:id/findings/:findingId/risks",
    { preHandler: requirePermission("assessment.view") },
    async (request, reply) => {
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const result = await pool.query<{
        risk_id: string;
        title: string;
        likelihood: number | null;
        impact: number | null;
        rating: string | null;
        status: string;
        contribution_note: string | null;
        linked_at: string;
      }>(
        `select rfl.risk_id, r.title, r.likelihood, r.impact, r.rating, r.status,
                rfl.contribution_note, rfl.created_at::text as linked_at
           from risk_finding_links rfl
           join risks r on r.id = rfl.risk_id
          where rfl.finding_id = $1
          order by rfl.created_at desc`,
        [request.params.findingId]
      );
      return {
        links: result.rows.map((row) => ({
          riskId: row.risk_id,
          title: row.title,
          likelihood: row.likelihood,
          impact: row.impact,
          rating: row.rating,
          status: row.status,
          contributionNote: row.contribution_note,
          linkedAt: row.linked_at
        }))
      };
    }
  );

  // Link a finding to a risk
  app.post<{ Params: { id: string; riskId: string }; Body: z.infer<typeof linkBody> }>(
    "/api/assessments/:id/risks/:riskId/findings",
    { preHandler: requireCsrfPermission("assessment.edit") },
    async (request, reply) => {
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const parsed = linkBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ code: "INVALID_BODY", message: parsed.error.message });
      }
      const result = await pool.query(
        `insert into risk_finding_links (risk_id, finding_id, contribution_note)
              values ($1, $2, $3)
              on conflict (risk_id, finding_id) do update
                  set contribution_note = excluded.contribution_note
              returning *`,
        [request.params.riskId, parsed.data.findingId, parsed.data.contributionNote ?? null]
      );
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "risk.finding_linked",
        entityType: "risk",
        entityId: request.params.riskId,
        before: null,
        after: { findingId: parsed.data.findingId }
      }).catch(() => undefined);
      return reply.code(201).send({ link: result.rows[0] });
    }
  );

  // Unlink
  app.delete<{ Params: { id: string; riskId: string; findingId: string } }>(
    "/api/assessments/:id/risks/:riskId/findings/:findingId",
    { preHandler: requireCsrfPermission("assessment.edit") },
    async (request, reply) => {
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const result = await pool.query(
        `delete from risk_finding_links
              where risk_id = $1 and finding_id = $2 returning *`,
        [request.params.riskId, request.params.findingId]
      );
      if (!result.rowCount) {
        return reply.code(404).send({ code: "LINK_NOT_FOUND", message: "Link not found" });
      }
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "risk.finding_unlinked",
        entityType: "risk",
        entityId: request.params.riskId,
        before: { findingId: request.params.findingId },
        after: null
      }).catch(() => undefined);
      return { status: "ok" };
    }
  );
}
