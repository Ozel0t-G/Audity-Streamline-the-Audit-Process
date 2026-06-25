import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendActivityEvent } from "../activity/service.js";
import { requireCsrfPermission, requirePermission } from "../auth/hooks.js";
import { canAccessAssessment, canAccessCustomer } from "../customers/access.js";
import { pool } from "../db/client.js";
import { isUuid, optionalDateString, validateBody } from "../utils/validation.js";

type AssessmentBody = {
  templateKey?: string;
  type?: string;
  audience?: string;
  framework?: string;
  frameworkId?: string;
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

const postgresUuidSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const assessmentSchema = z.object({
  templateKey: z.string().optional(),
  type: z.string().trim().min(1).optional(),
  audience: z.string().optional(),
  framework: z.string().optional(),
  frameworkId: z.preprocess(
    (value) => (value === "" ? undefined : value),
    postgresUuidSchema.optional()
  ),
  language: z.string().optional(),
  targetDate: optionalDateString,
  status: z.string().optional()
});

const assessmentTemplates = [
  {
    key: "supplier_security",
    name: "Supplier Security Assessment",
    type: "Supplier Security Assessment",
    audience: "Procurement + Security",
    language: "en",
    status: "draft",
    scope: {
      inScopeSystems: ["Supplier services", "Data processing activities", "Remote access paths"],
      outOfScope: ["Supplier internal systems without contractual access"],
      businessProcesses: ["Vendor onboarding", "Contract review", "Security monitoring"],
      regulatoryContext: "Third-party risk management",
      assumptions: "Supplier evidence is available for review.",
      limitations: "Testing is limited to agreed supplier scope.",
      criticality: "Medium"
    }
  },
  {
    key: "ot_security_readiness",
    name: "OT Security Readiness",
    type: "OT Security Readiness Assessment",
    audience: "Operations + Engineering + Security",
    language: "en",
    status: "draft",
    scope: {
      inScopeSystems: ["OT networks", "Engineering workstations", "Remote access", "Backup and recovery"],
      outOfScope: ["Unsafe active testing on production OT assets"],
      businessProcesses: ["Change management", "Incident response", "Asset management", "Patch governance"],
      regulatoryContext: "Industrial security readiness",
      assumptions: "Operational safety and uptime constraints take priority.",
      limitations: "Passive review unless explicitly approved.",
      criticality: "High"
    }
  }
];

const scopeSchema = z.object({
  inScopeSystems: z.array(z.string()).optional(),
  outOfScope: z.array(z.string()).optional(),
  businessProcesses: z.array(z.string()).optional(),
  regulatoryContext: z.string().optional(),
  assumptions: z.string().optional(),
  limitations: z.string().optional(),
  criticality: z.string().optional()
});

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
    frameworkId: row.framework_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function loadAssessment(id: string) {
  if (!isUuid(id)) return null;
  const result = await pool.query("select * from assessments where id = $1", [id]);
  return result.rows[0] ? mapAssessment(result.rows[0]) : null;
}

export async function registerAssessmentRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/assessment-templates",
    { preHandler: requirePermission("assessment.view") },
    async () => ({ templates: assessmentTemplates })
  );

  app.get<{ Params: { id: string } }>(
    "/api/customers/:id/assessments",
    { preHandler: requirePermission("assessment.view") },
    async (request, reply) => {
      if (!(await canAccessCustomer(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
      }
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
      const body = validateBody(assessmentSchema, request.body, reply);
      if (!body) return;
      const template = assessmentTemplates.find((item) => item.key === body.templateKey);
      if (!body.type && !template) {
        return reply
          .code(400)
          .send({ code: "INVALID_INPUT", message: "Assessment type is required" });
      }
      if (!(await canAccessCustomer(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
      }
      const customer = await pool.query("select id from customers where id = $1", [
        request.params.id
      ]);
      if (!customer.rows[0]) {
        return reply
          .code(404)
          .send({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
      }
      const framework = body.frameworkId
        ? await pool.query<{ id: string; label: string }>(
            `select id, coalesce(short_name, name) as label
             from frameworks
             where id = $1
               and exists (
                 select 1 from customer_frameworks cf
                 where cf.customer_id = $2 and cf.framework_id = frameworks.id
               )`,
            [body.frameworkId, request.params.id]
          )
        : null;
      if (body.frameworkId && !framework?.rows[0]) {
        return reply.code(400).send({
          code: "FRAMEWORK_OUT_OF_CUSTOMER_SCOPE",
          message: "Select a framework that is in this customer scope"
        });
      }
      const id = randomUUID();
      const result = await pool.query(
        `insert into assessments
          (id, customer_id, type, audience, framework, framework_id, language, target_date, status)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         returning *`,
        [
          id,
          request.params.id,
          body.type ?? template?.type,
          body.audience ?? template?.audience ?? null,
          framework?.rows[0]?.label ?? body.framework ?? null,
          framework?.rows[0]?.id ?? null,
          body.language ?? template?.language ?? "en",
          body.targetDate || null,
          body.status ?? template?.status ?? "draft"
        ]
      );
      if (template) {
        await pool.query("update assessments set scope = $2 where id = $1", [id, JSON.stringify(template.scope)]);
      }
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
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "assessment.opened",
        entityType: "assessment",
        entityId: request.params.id,
        before: null,
        after: { assessmentId: request.params.id }
      });
      return { assessment };
    }
  );

  app.put<{ Params: { id: string }; Body: AssessmentBody }>(
    "/api/assessments/:id",
    { preHandler: requireCsrfPermission("assessment.edit") },
    async (request, reply) => {
      const body = validateBody(assessmentSchema, request.body, reply);
      if (!body) return;
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
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
          body.type,
          body.audience ?? null,
          body.framework ?? null,
          body.language,
          body.targetDate || null,
          body.status
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
      const body = validateBody(scopeSchema, request.body, reply);
      if (!body) return;
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const before = await loadAssessment(request.params.id);
      if (!before) {
        return reply
          .code(404)
          .send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const scope = {
        inScopeSystems: body.inScopeSystems ?? [],
        outOfScope: body.outOfScope ?? [],
        businessProcesses: body.businessProcesses ?? [],
        regulatoryContext: body.regulatoryContext ?? "",
        assumptions: body.assumptions ?? "",
        limitations: body.limitations ?? "",
        criticality: body.criticality ?? ""
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
