import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendActivityEvent } from "../activity/service.js";
import { requireCsrfPermission, requirePermission } from "../auth/hooks.js";
import { canAccessAssessment } from "../customers/access.js";
import { pool } from "../db/client.js";
import { HARDCODED_DEFAULTS, resolveThresholds } from "./thresholds.js";

const thresholdsBody = z.object({
  fieldwork: z.number().int().positive().max(3650).optional(),
  findings_response: z.number().int().positive().max(3650).optional(),
  evidence_request: z.number().int().positive().max(3650).optional(),
  remediation: z.number().int().positive().max(3650).optional()
});

export async function registerFrameworkThresholdRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/admin/frameworks/thresholds",
    { preHandler: requirePermission("settings.manage") },
    async () => {
      const result = await pool.query<{
        id: string;
        name: string;
        version: string | null;
        default_stuck_thresholds: unknown;
      }>(
        `select id, name, version, default_stuck_thresholds
           from frameworks
          order by name asc`
      );
      return {
        defaults: HARDCODED_DEFAULTS,
        frameworks: result.rows.map((row) => ({
          id: row.id,
          name: row.name,
          version: row.version,
          thresholds: resolveThresholds(null, row.default_stuck_thresholds),
          hasCustom: row.default_stuck_thresholds !== null
        }))
      };
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/admin/frameworks/:id/stuck-thresholds",
    { preHandler: requirePermission("settings.manage") },
    async (request, reply) => {
      const result = await pool.query<{
        id: string;
        name: string;
        default_stuck_thresholds: unknown;
      }>(
        "select id, name, default_stuck_thresholds from frameworks where id = $1",
        [request.params.id]
      );
      const row = result.rows[0];
      if (!row) {
        return reply.code(404).send({ code: "FRAMEWORK_NOT_FOUND", message: "Framework not found" });
      }
      return {
        framework: { id: row.id, name: row.name },
        defaults: HARDCODED_DEFAULTS,
        thresholds: resolveThresholds(null, row.default_stuck_thresholds),
        hasCustom: row.default_stuck_thresholds !== null
      };
    }
  );

  app.put<{ Params: { id: string }; Body: z.infer<typeof thresholdsBody> }>(
    "/api/admin/frameworks/:id/stuck-thresholds",
    { preHandler: requireCsrfPermission("settings.manage") },
    async (request, reply) => {
      const parsed = thresholdsBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ code: "INVALID_BODY", message: parsed.error.message });
      }
      const before = await pool.query<{ default_stuck_thresholds: unknown }>(
        "select default_stuck_thresholds from frameworks where id = $1",
        [request.params.id]
      );
      if (!before.rowCount) {
        return reply.code(404).send({ code: "FRAMEWORK_NOT_FOUND", message: "Framework not found" });
      }
      const payload = Object.keys(parsed.data).length ? parsed.data : null;
      await pool.query(
        "update frameworks set default_stuck_thresholds = $2 where id = $1",
        [request.params.id, payload ? JSON.stringify(payload) : null]
      );
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "framework.stuck_thresholds.updated",
        entityType: "framework",
        entityId: request.params.id,
        before: before.rows[0]?.default_stuck_thresholds ?? null,
        after: payload
      }).catch(() => undefined);
      return {
        thresholds: resolveThresholds(null, payload),
        hasCustom: Boolean(payload)
      };
    }
  );

  app.put<{ Params: { id: string }; Body: z.infer<typeof thresholdsBody> }>(
    "/api/assessments/:id/stuck-thresholds",
    { preHandler: requireCsrfPermission("assessment.edit") },
    async (request, reply) => {
      // The "assessment.edit" permission alone doesn't scope to a specific assessment —
      // without this check any edit-capable user could rewrite the stuck-thresholds of
      // *any* assessment, including other customers' audits (IDOR). 404 (not 403) so we
      // don't reveal whether the id exists to users who can't access it.
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const parsed = thresholdsBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ code: "INVALID_BODY", message: parsed.error.message });
      }
      const payload = Object.keys(parsed.data).length ? parsed.data : null;
      const before = await pool.query<{ stuck_thresholds: unknown }>(
        "select stuck_thresholds from assessments where id = $1",
        [request.params.id]
      );
      if (!before.rowCount) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      await pool.query(
        "update assessments set stuck_thresholds = $2, updated_at = now() where id = $1",
        [request.params.id, payload ? JSON.stringify(payload) : null]
      );
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "assessment.stuck_thresholds.updated",
        entityType: "assessment",
        entityId: request.params.id,
        before: before.rows[0]?.stuck_thresholds ?? null,
        after: payload
      }).catch(() => undefined);
      return {
        thresholds: payload,
        hasCustom: Boolean(payload)
      };
    }
  );
}
