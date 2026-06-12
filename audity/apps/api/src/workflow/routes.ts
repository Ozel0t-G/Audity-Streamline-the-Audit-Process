import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendActivityEvent } from "../activity/service.js";
import { requireCsrfPermission, requirePermission } from "../auth/hooks.js";
import { canAccessAssessment } from "../customers/access.js";
import { pool } from "../db/client.js";
import { validateBody } from "../utils/validation.js";
import { ensureAutomaticRiskRegister, ensureSuggestedFindings, ratingFor } from "./suggestions.js";

type FindingBody = {
  action?: "accept" | "edit" | "dismiss" | "mark-as-accepted-risk";
  title?: string;
  priority?: string;
  observation?: string;
  recommendation?: string;
};

type RiskBody = {
  findingId?: string | null;
  title?: string;
  likelihood?: number;
  impact?: number;
  treatmentOption?: string;
  owner?: string;
  treatmentPlan?: string;
  dueDate?: string | null;
  status?: string;
};

type RoadmapBody = {
  riskId?: string | null;
  phase?: string;
  action?: string;
  owner?: string;
  dueDate?: string | null;
  effortEstimate?: string;
  status?: string;
};

const roadmapPhases = ["0-30d", "31-90d", "3-6M", "6-12M"];

const findingSchema = z.object({
  action: z.enum(["accept", "edit", "dismiss", "mark-as-accepted-risk"]).optional(),
  title: z.string().optional(),
  priority: z.string().optional(),
  observation: z.string().optional(),
  recommendation: z.string().optional()
});

const riskSchema = z.object({
  findingId: z.string().uuid().nullable().optional(),
  title: z.string().optional(),
  likelihood: z.number().int().min(1).max(5).optional(),
  impact: z.number().int().min(1).max(5).optional(),
  treatmentOption: z.string().optional(),
  owner: z.string().optional(),
  treatmentPlan: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  status: z.string().optional()
});

const roadmapSchema = z.object({
  riskId: z.string().uuid().nullable().optional(),
  phase: z.enum(["0-30d", "31-90d", "3-6M", "6-12M"]).optional(),
  action: z.string().optional(),
  owner: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  effortEstimate: z.string().optional(),
  status: z.string().optional()
});

function mapFinding(row: Record<string, unknown>) {
  return {
    id: row.id,
    assessmentId: row.assessment_id,
    assessmentQuestionId: row.assessment_question_id,
    frameworkControlId: row.framework_control_id,
    controlCode: row.control_code,
    controlTitle: row.control_title,
    question: row.question,
    score: row.score,
    title: row.title,
    status: row.status,
    priority: row.priority,
    observation: row.observation,
    recommendation: row.recommendation,
    sourceExplanation: row.source_explanation,
    acceptedRisk: row.accepted_risk,
    mappings: row.mappings ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRisk(row: Record<string, unknown>) {
  return {
    id: row.id,
    assessmentId: row.assessment_id,
    findingId: row.finding_id,
    title: row.title,
    likelihood: row.likelihood,
    impact: row.impact,
    riskScore: row.risk_score,
    rating: row.rating,
    treatmentOption: row.treatment_option,
    owner: row.owner,
    treatmentPlan: row.treatment_plan,
    dueDate: row.due_date,
    status: row.status,
    findingTitle: row.finding_title,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRoadmapItem(row: Record<string, unknown>) {
  return {
    id: row.id,
    assessmentId: row.assessment_id,
    riskId: row.risk_id,
    phase: row.phase,
    action: row.action,
    owner: row.owner,
    dueDate: row.due_date,
    effortEstimate: row.effort_estimate,
    status: row.status,
    sourceRiskRating: row.source_risk_rating,
    riskTitle: row.risk_title,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function riskActivityAction(before: Record<string, unknown> | null, after: Record<string, unknown>) {
  if (!before) return "risk.created";
  if (before.status !== after.status && after.status === "accepted") return "risk.accepted";
  if (before.rating !== after.rating) return "risk.rating_changed";
  return "risk.treatment_changed";
}

async function ensureAssessmentExists(assessmentId: string): Promise<boolean> {
  const result = await pool.query("select id from assessments where id = $1", [assessmentId]);
  return Boolean(result.rows[0]);
}

async function loadFinding(id: string) {
  const result = await pool.query(
    `select f.*, fc.control_code, fc.title as control_title, aq.question, ca.score,
      coalesce(
        json_agg(distinct jsonb_build_object(
          'controlId', mapped.id,
          'code', mapped.control_code,
          'title', mapped.title,
          'mappingType', cm.mapping_type
        )) filter (where mapped.id is not null),
        '[]'::json
      ) as mappings
     from findings f
     left join assessment_questions aq on aq.id = f.assessment_question_id
     left join control_answers ca on ca.assessment_question_id = aq.id
     left join framework_controls fc on fc.id = f.framework_control_id
     left join control_mappings cm on cm.source_control_id = fc.id or cm.target_control_id = fc.id
     left join framework_controls mapped on mapped.id = case
       when cm.source_control_id = fc.id then cm.target_control_id
       else cm.source_control_id
     end
     where f.id = $1
     group by f.id, fc.id, aq.id, ca.id`,
    [id]
  );
  return result.rows[0] ? mapFinding(result.rows[0]) : null;
}

async function loadRisk(id: string) {
  const result = await pool.query(
    `select r.*, f.title as finding_title
     from risks r
     left join findings f on f.id = r.finding_id
     where r.id = $1`,
    [id]
  );
  return result.rows[0] ? mapRisk(result.rows[0]) : null;
}

async function loadRoadmapItem(id: string) {
  const result = await pool.query(
    `select ri.*, r.title as risk_title
     from roadmap_items ri
     left join risks r on r.id = ri.risk_id
     where ri.id = $1`,
    [id]
  );
  return result.rows[0] ? mapRoadmapItem(result.rows[0]) : null;
}

export async function registerWorkflowRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>(
    "/api/assessments/:id/findings",
    { preHandler: requirePermission("assessment.view") },
    async (request, reply) => {
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      if (!(await ensureAssessmentExists(request.params.id))) {
        return reply
          .code(404)
          .send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "findings.opened",
        entityType: "assessment",
        entityId: request.params.id,
        before: null,
        after: { assessmentId: request.params.id }
      });
      await ensureSuggestedFindings(request.params.id);
      const result = await pool.query(
        `select f.*, fc.control_code, fc.title as control_title, aq.question, ca.score,
          coalesce(
            json_agg(distinct jsonb_build_object(
              'controlId', mapped.id,
              'code', mapped.control_code,
              'title', mapped.title,
              'mappingType', cm.mapping_type
            )) filter (where mapped.id is not null),
            '[]'::json
          ) as mappings
         from findings f
         left join assessment_questions aq on aq.id = f.assessment_question_id
         left join control_answers ca on ca.assessment_question_id = aq.id
         left join framework_controls fc on fc.id = f.framework_control_id
         left join control_mappings cm on cm.source_control_id = fc.id or cm.target_control_id = fc.id
         left join framework_controls mapped on mapped.id = case
           when cm.source_control_id = fc.id then cm.target_control_id
           else cm.source_control_id
         end
         where f.assessment_id = $1
         group by f.id, fc.id, aq.id, ca.id
         order by f.created_at desc`,
        [request.params.id]
      );
      return { findings: result.rows.map(mapFinding) };
    }
  );

  app.put<{ Params: { id: string; findingId: string }; Body: FindingBody }>(
    "/api/assessments/:id/findings/:findingId",
    { preHandler: requireCsrfPermission("finding.approve") },
    async (request, reply) => {
      const body = validateBody(findingSchema, request.body, reply);
      if (!body) return;
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const before = await loadFinding(request.params.findingId);
      if (!before || before.assessmentId !== request.params.id) {
        return reply.code(404).send({ code: "FINDING_NOT_FOUND", message: "Finding not found" });
      }
      const action = body.action ?? "edit";
      const nextStatus =
        action === "accept" ? "confirmed" : action === "dismiss" ? "dismissed" : before.status;
      const acceptedRisk = action === "mark-as-accepted-risk" ? true : before.acceptedRisk;
      const result = await pool.query(
        `update findings
         set title = coalesce($2, title),
             priority = coalesce($3, priority),
             observation = coalesce($4, observation),
             recommendation = coalesce($5, recommendation),
             status = $6,
             accepted_risk = $7,
             updated_by = $8,
             updated_at = now()
         where id = $1
         returning *`,
        [
          request.params.findingId,
          body.title,
          body.priority,
          body.observation,
          body.recommendation,
          nextStatus,
          acceptedRisk,
          request.user!.sub
        ]
      );
      const after = await loadFinding(result.rows[0].id);
      const logAction =
        action === "accept"
          ? "finding.accepted"
          : action === "dismiss"
            ? "finding.dismissed"
            : before.priority !== after?.priority
              ? "finding.priority_changed"
              : "finding.edited";
      await appendActivityEvent({
        userId: request.user!.sub,
        action: logAction,
        entityType: "finding",
        entityId: request.params.findingId,
        before,
        after
      });
      return { finding: after };
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/assessments/:id/risks",
    { preHandler: requirePermission("assessment.view") },
    async (request, reply) => {
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      if (!(await ensureAssessmentExists(request.params.id))) {
        return reply
          .code(404)
          .send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "risk_register.opened",
        entityType: "assessment",
        entityId: request.params.id,
        before: null,
        after: { assessmentId: request.params.id }
      });
      await ensureAutomaticRiskRegister(request.params.id);
      const result = await pool.query(
        `select r.*, f.title as finding_title
         from risks r
         left join findings f on f.id = r.finding_id
         where r.assessment_id = $1
           and r.status <> 'deleted'
         order by r.risk_score desc nulls last, r.created_at desc`,
        [request.params.id]
      );
      return { risks: result.rows.map(mapRisk) };
    }
  );

  app.post<{ Params: { id: string }; Body: RiskBody }>(
    "/api/assessments/:id/risks",
    { preHandler: requireCsrfPermission("risk.edit") },
    async (request, reply) => {
      const body = validateBody(riskSchema, request.body, reply);
      if (!body) return;
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      if (!(await ensureAssessmentExists(request.params.id))) {
        return reply
          .code(404)
          .send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const likelihood = body.likelihood ?? 3;
      const impact = body.impact ?? 3;
      if (likelihood < 1 || likelihood > 5 || impact < 1 || impact > 5) {
        return reply
          .code(400)
          .send({ code: "INVALID_RISK_SCORE", message: "Likelihood and impact must be 1-5" });
      }
      const { riskScore, rating } = ratingFor(likelihood, impact);
      let title = body.title;
      if (!title && body.findingId) {
        const finding = await loadFinding(body.findingId);
        title = finding?.title as string | undefined;
      }
      if (!title) {
        return reply.code(400).send({ code: "INVALID_INPUT", message: "Risk title is required" });
      }
      const result = await pool.query(
        `insert into risks
          (id, assessment_id, finding_id, title, likelihood, impact, risk_score, rating,
           treatment_option, owner, treatment_plan, due_date, status)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         returning *`,
        [
          randomUUID(),
          request.params.id,
          body.findingId ?? null,
          title,
          likelihood,
          impact,
          riskScore,
          rating,
          body.treatmentOption ?? "mitigate",
          body.owner ?? "",
          body.treatmentPlan ?? "",
          body.dueDate || null,
          body.status ?? "open"
        ]
      );
      const risk = await loadRisk(result.rows[0].id);
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "risk.created",
        entityType: "risk",
        entityId: result.rows[0].id,
        before: null,
        after: risk
      });
      return reply.code(201).send({ risk });
    }
  );

  app.put<{ Params: { id: string; riskId: string }; Body: RiskBody }>(
    "/api/assessments/:id/risks/:riskId",
    { preHandler: requireCsrfPermission("risk.edit") },
    async (request, reply) => {
      const body = validateBody(riskSchema, request.body, reply);
      if (!body) return;
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const before = await loadRisk(request.params.riskId);
      if (!before || before.assessmentId !== request.params.id) {
        return reply.code(404).send({ code: "RISK_NOT_FOUND", message: "Risk not found" });
      }
      const likelihood = body.likelihood ?? (before.likelihood as number) ?? 3;
      const impact = body.impact ?? (before.impact as number) ?? 3;
      const { riskScore, rating } = ratingFor(likelihood, impact);
      const result = await pool.query(
        `update risks
         set title = coalesce($2, title),
             likelihood = $3,
             impact = $4,
             risk_score = $5,
             rating = $6,
             treatment_option = coalesce($7, treatment_option),
             owner = coalesce($8, owner),
             treatment_plan = coalesce($9, treatment_plan),
             due_date = case when $10::text is null then due_date else nullif($10, '')::date end,
             status = coalesce($11, status),
             updated_at = now()
         where id = $1
         returning *`,
        [
          request.params.riskId,
          body.title,
          likelihood,
          impact,
          riskScore,
          rating,
          body.treatmentOption,
          body.owner,
          body.treatmentPlan,
          body.dueDate,
          body.status
        ]
      );
      const after = await loadRisk(result.rows[0].id);
      await appendActivityEvent({
        userId: request.user!.sub,
        action: riskActivityAction(before as Record<string, unknown>, after as Record<string, unknown>),
        entityType: "risk",
        entityId: request.params.riskId,
        before,
        after
      });
      return { risk: after };
    }
  );

  app.delete<{ Params: { id: string; riskId: string } }>(
    "/api/assessments/:id/risks/:riskId",
    { preHandler: requireCsrfPermission("risk.edit") },
    async (request, reply) => {
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const before = await loadRisk(request.params.riskId);
      if (!before || before.assessmentId !== request.params.id) {
        return reply.code(404).send({ code: "RISK_NOT_FOUND", message: "Risk not found" });
      }
      const result = await pool.query(
        `update risks
         set status = 'deleted',
             updated_at = now()
         where id = $1
         returning *`,
        [request.params.riskId]
      );
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "risk.deleted",
        entityType: "risk",
        entityId: request.params.riskId,
        before,
        after: result.rows[0]
      });
      return reply.code(204).send();
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/assessments/:id/roadmap",
    { preHandler: requirePermission("assessment.view") },
    async (request, reply) => {
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      if (!(await ensureAssessmentExists(request.params.id))) {
        return reply
          .code(404)
          .send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "roadmap.opened",
        entityType: "assessment",
        entityId: request.params.id,
        before: null,
        after: { assessmentId: request.params.id }
      });
      const result = await pool.query(
        `select ri.*, r.title as risk_title
         from roadmap_items ri
         left join risks r on r.id = ri.risk_id
         where ri.assessment_id = $1
         order by array_position(array['0-30d','31-90d','3-6M','6-12M'], ri.phase), ri.created_at`,
        [request.params.id]
      );
      return { phases: roadmapPhases, roadmapItems: result.rows.map(mapRoadmapItem) };
    }
  );

  app.post<{ Params: { id: string }; Body: RoadmapBody }>(
    "/api/assessments/:id/roadmap",
    { preHandler: requireCsrfPermission("roadmap.edit") },
    async (request, reply) => {
      const body = validateBody(roadmapSchema, request.body, reply);
      if (!body) return;
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      if (!(await ensureAssessmentExists(request.params.id))) {
        return reply
          .code(404)
          .send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      if (!body.action && !body.riskId) {
        return reply
          .code(400)
          .send({ code: "INVALID_INPUT", message: "Roadmap action or risk is required" });
      }
      const risk = body.riskId ? await loadRisk(body.riskId) : null;
      const result = await pool.query(
        `insert into roadmap_items
          (id, assessment_id, risk_id, phase, action, owner, due_date, effort_estimate, status, source_risk_rating)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         returning *`,
        [
          randomUUID(),
          request.params.id,
          body.riskId ?? null,
          body.phase ?? "31-90d",
          body.action ?? `Treat risk: ${risk?.title ?? "Untitled risk"}`,
          body.owner ?? (risk?.owner as string) ?? "",
          body.dueDate || null,
          body.effortEstimate ?? "Medium",
          body.status ?? "open",
          risk?.rating ?? null
        ]
      );
      const item = await loadRoadmapItem(result.rows[0].id);
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "roadmap.item_updated",
        entityType: "roadmap_item",
        entityId: result.rows[0].id,
        before: null,
        after: item
      });
      return reply.code(201).send({ roadmapItem: item });
    }
  );

  app.put<{ Params: { id: string; roadmapItemId: string }; Body: RoadmapBody }>(
    "/api/assessments/:id/roadmap/:roadmapItemId",
    { preHandler: requireCsrfPermission("roadmap.edit") },
    async (request, reply) => {
      const body = validateBody(roadmapSchema, request.body, reply);
      if (!body) return;
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const before = await loadRoadmapItem(request.params.roadmapItemId);
      if (!before || before.assessmentId !== request.params.id) {
        return reply
          .code(404)
          .send({ code: "ROADMAP_ITEM_NOT_FOUND", message: "Roadmap item not found" });
      }
      const result = await pool.query(
        `update roadmap_items
         set phase = coalesce($2, phase),
             action = coalesce($3, action),
             owner = coalesce($4, owner),
             due_date = $5,
             effort_estimate = coalesce($6, effort_estimate),
             status = coalesce($7, status),
             updated_at = now()
         where id = $1
         returning *`,
        [
          request.params.roadmapItemId,
          body.phase,
          body.action,
          body.owner,
          body.dueDate || null,
          body.effortEstimate,
          body.status
        ]
      );
      const after = await loadRoadmapItem(result.rows[0].id);
      await appendActivityEvent({
        userId: request.user!.sub,
        action: before.phase !== after?.phase ? "roadmap.item_moved" : "roadmap.item_updated",
        entityType: "roadmap_item",
        entityId: request.params.roadmapItemId,
        before,
        after
      });
      return { roadmapItem: after };
    }
  );
}
