import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { appendActivityEvent } from "../activity/service.js";
import { requireCsrfPermission, requirePermission } from "../auth/hooks.js";
import { pool } from "../db/client.js";

type AssessmentBody = {
  type?: string;
  audience?: string;
  framework?: string;
  language?: string;
  targetDate?: string;
  status?: string;
};

type ScopeBody = {
  inScopeSystems?: string[];
  outOfScope?: string[];
  businessProcesses?: string[];
  regulatoryContext?: string;
  assumptions?: string;
  limitations?: string;
  criticality?: string;
};

function mapAssessment(row: Record<string, unknown>) {
  return {
    id: row.id,
    customerId: row.customer_id,
    type: row.type,
    audience: row.audience,
    framework: row.framework,
    language: row.language,
    targetDate: row.target_date,
    status: row.status,
    scope: row.scope,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function loadAssessment(id: string) {
  const result = await pool.query("select * from assessments where id = $1", [id]);
  return result.rows[0] ? mapAssessment(result.rows[0]) : null;
}

export async function registerAssessmentRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>(
    "/api/customers/:id/assessments",
    { preHandler: requirePermission("assessment.view") },
    async (request) => {
      const result = await pool.query(
        "select * from assessments where customer_id = $1 order by created_at desc",
        [request.params.id]
      );
      return { assessments: result.rows.map(mapAssessment) };
    }
  );

  app.post<{ Params: { id: string }; Body: AssessmentBody }>(
    "/api/customers/:id/assessments",
    { preHandler: requireCsrfPermission("assessment.create") },
    async (request, reply) => {
      if (!request.body.type) {
        return reply
          .code(400)
          .send({ code: "INVALID_INPUT", message: "Assessment type is required" });
      }
      const customer = await pool.query("select id from customers where id = $1", [
        request.params.id
      ]);
      if (!customer.rows[0]) {
        return reply
          .code(404)
          .send({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
      }
      const id = randomUUID();
      const result = await pool.query(
        `insert into assessments
          (id, customer_id, type, audience, framework, language, target_date, status)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning *`,
        [
          id,
          request.params.id,
          request.body.type,
          request.body.audience ?? null,
          request.body.framework ?? null,
          request.body.language ?? "en",
          request.body.targetDate || null,
          request.body.status ?? "draft"
        ]
      );
      const assessment = mapAssessment(result.rows[0]);
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "assessment.created",
        entityType: "assessment",
        entityId: id,
        before: null,
        after: assessment
      });
      return reply.code(201).send({ assessment });
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/assessments/:id",
    { preHandler: requirePermission("assessment.view") },
    async (request, reply) => {
      const assessment = await loadAssessment(request.params.id);
      if (!assessment) {
        return reply
          .code(404)
          .send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      return { assessment };
    }
  );

  app.put<{ Params: { id: string }; Body: AssessmentBody }>(
    "/api/assessments/:id",
    { preHandler: requireCsrfPermission("assessment.edit") },
    async (request, reply) => {
      const before = await loadAssessment(request.params.id);
      if (!before) {
        return reply
          .code(404)
          .send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const result = await pool.query(
        `update assessments
         set type = coalesce($2, type),
             audience = $3,
             framework = $4,
             language = coalesce($5, language),
             target_date = $6,
             status = coalesce($7, status),
             updated_at = now()
         where id = $1
         returning *`,
        [
          request.params.id,
          request.body.type,
          request.body.audience ?? null,
          request.body.framework ?? null,
          request.body.language,
          request.body.targetDate || null,
          request.body.status
        ]
      );
      const assessment = mapAssessment(result.rows[0]);
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "assessment.updated",
        entityType: "assessment",
        entityId: request.params.id,
        before,
        after: assessment
      });
      return { assessment };
    }
  );

  app.put<{ Params: { id: string }; Body: ScopeBody }>(
    "/api/assessments/:id/scope",
    { preHandler: requireCsrfPermission("assessment.edit") },
    async (request, reply) => {
      const before = await loadAssessment(request.params.id);
      if (!before) {
        return reply
          .code(404)
          .send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const scope = {
        inScopeSystems: request.body.inScopeSystems ?? [],
        outOfScope: request.body.outOfScope ?? [],
        businessProcesses: request.body.businessProcesses ?? [],
        regulatoryContext: request.body.regulatoryContext ?? "",
        assumptions: request.body.assumptions ?? "",
        limitations: request.body.limitations ?? "",
        criticality: request.body.criticality ?? ""
      };
      const result = await pool.query(
        `update assessments
         set scope = $2, updated_at = now()
         where id = $1
         returning *`,
        [request.params.id, JSON.stringify(scope)]
      );
      const assessment = mapAssessment(result.rows[0]);
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "scope.updated",
        entityType: "assessment",
        entityId: request.params.id,
        before: before.scope,
        after: scope
      });
      return { assessment };
    }
  );
}
