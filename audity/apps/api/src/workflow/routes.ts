import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendActivityEvent } from "../activity/service.js";
import { requireCsrfPermission, requirePermission } from "../auth/hooks.js";
import { canAccessAssessment } from "../customers/access.js";
import { pool } from "../db/client.js";
import { validateBody } from "../utils/validation.js";
import { ensureAutomaticRiskRegister, ensureSuggestedFindings, ratingFor } from "./suggestions.js";
import { maybeAutoConvertFindingToRisk } from "./autoConvert.js";
import {
  isLegalFindingTransition,
  isLegalRiskTransition,
  normalisePhaseLabel,
  phaseDatesFor,
  ROADMAP_PHASES
} from "./transitions.js";

type FindingBody = {
  action?: "accept" | "edit" | "dismiss" | "mark-as-accepted-risk";
  title?: string;
  priority?: string;
  status?: string;
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
  draft?: boolean;
  acceptanceReason?: string;
  acceptanceExpiresAt?: string | null;
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

type BulkFindingBody = {
  findingIds: string[];
  status?: string;
  priority?: string;
};

type BulkRiskBody = {
  riskIds: string[];
  status?: string;
  owner?: string;
  dueDate?: string | null;
  treatmentOption?: string;
  draft?: boolean;
  delete?: boolean;
};

type CommentBody = {
  entityType?: string;
  entityId?: string;
  comment?: string;
};

type RiskImportBody = {
  csv?: string;
};

const roadmapPhases = Object.entries(ROADMAP_PHASES).map(([key, def]) => ({
  key,
  label: def.label,
  startDays: def.startDays,
  endDays: def.endDays
}));

const findingSchema = z.object({
  action: z.enum(["accept", "edit", "dismiss", "mark-as-accepted-risk"]).optional(),
  title: z.string().optional(),
  priority: z.string().optional(),
  status: z.string().optional(),
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
  status: z.string().optional(),
  draft: z.boolean().optional(),
  acceptanceReason: z.string().optional(),
  acceptanceExpiresAt: z.string().nullable().optional()
});

const roadmapSchema = z.object({
  riskId: z.string().uuid().nullable().optional(),
  // Accept legacy labels and new keys; normalised server-side via normalisePhaseLabel.
  phase: z.string().optional(),
  action: z.string().optional(),
  owner: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  effortEstimate: z.string().optional(),
  status: z.string().optional()
});

async function loadAnchorDate(assessmentId: string): Promise<string | null> {
  const result = await pool.query<{ closure_due_date: string | null }>(
    `select closure_due_date::text from audit_plans where assessment_id = $1`,
    [assessmentId]
  );
  return result.rows[0]?.closure_due_date ?? null;
}

const bulkFindingSchema = z.object({
  findingIds: z.array(z.string().uuid()).min(1),
  status: z.string().optional(),
  priority: z.string().optional()
});

const bulkRiskSchema = z.object({
  riskIds: z.array(z.string().uuid()).min(1),
  status: z.string().optional(),
  owner: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  treatmentOption: z.string().optional(),
  draft: z.boolean().optional(),
  delete: z.boolean().optional()
});

const commentSchema = z.object({
  entityType: z.enum(["question", "finding", "risk", "roadmap_item"]),
  entityId: z.string().min(1),
  comment: z.string().min(1)
});

const riskImportSchema = z.object({
  csv: z.string().min(1)
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
    severityImpact: row.severity_impact,
    severityLikelihood: row.severity_likelihood,
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
    draft: row.draft,
    sourceType: row.source_type,
    sourceAssessmentQuestionId: row.source_assessment_question_id,
    sourceFrameworkControlId: row.source_framework_control_id,
    sourceScore: row.source_score,
    sourceGeneratedAt: row.source_generated_at,
    sourceExplanation: row.source_explanation,
    acceptanceReason: row.acceptance_reason,
    acceptedBy: row.accepted_by,
    acceptedAt: row.accepted_at,
    acceptanceExpiresAt: row.acceptance_expires_at,
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
    phase: normalisePhaseLabel(String(row.phase ?? "")),
    phaseStartDate: row.phase_start_date,
    phaseEndDate: row.phase_end_date,
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

function mapHistoryEvent(row: Record<string, unknown>) {
  return {
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    userEmail: row.user_email,
    before: row.before_value,
    after: row.after_value,
    createdAt: row.created_at
  };
}

function mapComment(row: Record<string, unknown>) {
  return {
    id: row.id,
    assessmentId: row.assessment_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    userEmail: row.user_email,
    comment: row.comment,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at
  };
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

function riskActivityAction(before: Record<string, unknown> | null, after: Record<string, unknown>) {
  if (!before) return "risk.created";
  if (before.status !== after.status && after.status === "accepted") return "risk.accepted";
  if (before.rating !== after.rating) return "risk.rating_changed";
  return "risk.treatment_changed";
}

function treatmentValidationError(body: RiskBody): string | null {
  const isAccepted = body.treatmentOption === "accept" || body.status === "accepted";
  if (!isAccepted) return null;
  if (!body.owner?.trim()) return "Accepted risks require an owner";
  if (!body.acceptanceReason?.trim() && !body.treatmentPlan?.trim()) {
    return "Accepted risks require an acceptance reason";
  }
  if (!body.acceptanceExpiresAt && !body.dueDate) {
    return "Accepted risks require an expiration date";
  }
  return null;
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

  // Excel export: risk register + the findings summary list (finding · L · I ·
  // mapped framework control · free-text note) in a single .xlsx workbook.
  app.get<{ Params: { id: string } }>(
    "/api/assessments/:id/risk-register.xlsx",
    { preHandler: requirePermission("assessment.view") },
    async (request, reply) => {
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const risksResult = await pool.query(
        `select * from risks where assessment_id = $1
         order by risk_score desc nulls last, created_at desc`,
        [request.params.id]
      );
      const findingsResult = await pool.query(
        `select f.*, fc.control_code, fc.title as control_title
         from findings f
         left join framework_controls fc on fc.id = f.framework_control_id
         where f.assessment_id = $1
         order by f.created_at desc`,
        [request.params.id]
      );

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Audity";
      workbook.created = new Date();

      const riskSheet = workbook.addWorksheet("Risk Register");
      riskSheet.columns = [
        { header: "Title", key: "title", width: 42 },
        { header: "Likelihood", key: "likelihood", width: 12 },
        { header: "Impact", key: "impact", width: 10 },
        { header: "Score", key: "score", width: 10 },
        { header: "Rating", key: "rating", width: 12 },
        { header: "Treatment", key: "treatment", width: 16 },
        { header: "Owner", key: "owner", width: 22 },
        { header: "Due date", key: "due", width: 14 },
        { header: "Status", key: "status", width: 14 }
      ];
      for (const r of risksResult.rows) {
        riskSheet.addRow({
          title: r.title,
          likelihood: r.likelihood,
          impact: r.impact,
          score: r.risk_score,
          rating: r.rating,
          treatment: r.treatment_option,
          owner: r.owner,
          due: r.due_date,
          status: r.status
        });
      }
      riskSheet.getRow(1).font = { bold: true };

      const findingSheet = workbook.addWorksheet("Findings");
      findingSheet.columns = [
        { header: "Finding", key: "title", width: 42 },
        { header: "L", key: "l", width: 6 },
        { header: "I", key: "i", width: 6 },
        { header: "Framework control", key: "control", width: 30 },
        { header: "Note", key: "note", width: 60 }
      ];
      for (const f of findingsResult.rows) {
        findingSheet.addRow({
          title: f.title,
          l: f.severity_likelihood,
          i: f.severity_impact,
          control: f.control_code
            ? `${f.control_code}${f.control_title ? ` — ${f.control_title}` : ""}`
            : "",
          note: f.observation ?? ""
        });
      }
      findingSheet.getRow(1).font = { bold: true };
      findingSheet.getColumn("note").alignment = { wrapText: true, vertical: "top" };

      const buffer = await workbook.xlsx.writeBuffer();
      return reply
        .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        .header("Content-Disposition", `attachment; filename="risk-register-${request.params.id}.xlsx"`)
        .send(Buffer.from(buffer));
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
        action === "accept"
          ? "confirmed"
          : action === "dismiss"
            ? "dismissed"
            : body.status ?? (before.status as string);
      const acceptedRisk = action === "mark-as-accepted-risk" ? true : before.acceptedRisk;
      // Validate status transition against the legal graph.
      if (nextStatus !== before.status && !isLegalFindingTransition(before.status as string, nextStatus)) {
        return reply.code(409).send({
          code: "ILLEGAL_TRANSITION",
          message: `Cannot move finding from "${before.status}" to "${nextStatus}".`
        });
      }
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
      // PR-7: optionally auto-convert approved findings to draft risks.
      if (after?.status === "approved" && before?.status !== "approved") {
        await maybeAutoConvertFindingToRisk(
          request.params.id,
          request.params.findingId,
          request.user!.sub
        ).catch(() => undefined);
      }
      return { finding: after };
    }
  );

  app.patch<{ Params: { id: string }; Body: BulkFindingBody }>(
    "/api/assessments/:id/findings/bulk",
    { preHandler: requireCsrfPermission("finding.approve") },
    async (request, reply) => {
      const body = validateBody(bulkFindingSchema, request.body, reply);
      if (!body) return;
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      if (!body.status && !body.priority) {
        return reply.code(400).send({ code: "INVALID_INPUT", message: "Status or priority is required" });
      }
      const before = await pool.query(
        "select * from findings where assessment_id = $1 and id = any($2::uuid[])",
        [request.params.id, body.findingIds]
      );
      const result = await pool.query(
        `update findings
         set status = coalesce($3, status),
             priority = coalesce($4, priority),
             updated_by = $5,
             updated_at = now()
         where assessment_id = $1 and id = any($2::uuid[])
         returning *`,
        [request.params.id, body.findingIds, body.status, body.priority, request.user!.sub]
      );
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "finding.bulk_updated",
        entityType: "assessment",
        entityId: request.params.id,
        before: before.rows,
        after: result.rows
      });
      return { updated: result.rowCount };
    }
  );

  app.get<{ Params: { id: string }; Querystring: { entityType?: string; entityId?: string } }>(
    "/api/assessments/:id/history",
    { preHandler: requirePermission("assessment.view") },
    async (request, reply) => {
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const values: unknown[] = [];
      const clauses: string[] = [];
      if (!request.query.entityId) {
        values.push(request.params.id);
        clauses.push(`ual.entity_id = $${values.length}`);
      }
      if (request.query.entityType) {
        values.push(request.query.entityType);
        clauses.push(`ual.entity_type = $${values.length}`);
      }
      if (request.query.entityId) {
        values.push(request.query.entityId);
        clauses.push(`ual.entity_id = $${values.length}`);
      }
      const result = await pool.query(
        `select ual.*, u.email as user_email
         from user_activity_logs ual
         left join users u on u.id = ual.user_id
         ${clauses.length ? `where ${clauses.join(" and ")}` : ""}
         order by ual.created_at desc
         limit 25`,
        values
      );
      return { history: result.rows.map(mapHistoryEvent) };
    }
  );

  app.get<{ Params: { id: string }; Querystring: { entityType?: string; entityId?: string } }>(
    "/api/assessments/:id/comments",
    { preHandler: requirePermission("assessment.view") },
    async (request, reply) => {
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const values: unknown[] = [request.params.id];
      const clauses = ["rc.assessment_id = $1"];
      if (request.query.entityType) {
        values.push(request.query.entityType);
        clauses.push(`rc.entity_type = $${values.length}`);
      }
      if (request.query.entityId) {
        values.push(request.query.entityId);
        clauses.push(`rc.entity_id = $${values.length}`);
      }
      const result = await pool.query(
        `select rc.*, u.email as user_email
         from review_comments rc
         left join users u on u.id = rc.user_id
         where ${clauses.join(" and ")}
         order by rc.created_at desc
         limit 50`,
        values
      );
      return { comments: result.rows.map(mapComment) };
    }
  );

  app.post<{ Params: { id: string }; Body: CommentBody }>(
    "/api/assessments/:id/comments",
    { preHandler: requireCsrfPermission("assessment.edit") },
    async (request, reply) => {
      const body = validateBody(commentSchema, request.body, reply);
      if (!body) return;
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const result = await pool.query(
        `insert into review_comments (id, assessment_id, entity_type, entity_id, user_id, comment)
         values ($1,$2,$3,$4,$5,$6)
         returning *`,
        [randomUUID(), request.params.id, body.entityType, body.entityId, request.user!.sub, body.comment]
      );
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "comment.added",
        entityType: body.entityType,
        entityId: body.entityId,
        before: null,
        after: result.rows[0]
      });
      return reply.code(201).send({ comment: mapComment(result.rows[0]) });
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
      const validationError = treatmentValidationError(body);
      if (validationError) {
        return reply.code(400).send({ code: "INVALID_RISK_TREATMENT", message: validationError });
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
           treatment_option, owner, treatment_plan, due_date, status, draft, source_type,
           acceptance_reason, accepted_by, accepted_at, acceptance_expires_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'manual',
           $15, $16, $17, $18)
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
          body.status ?? "open",
          body.draft ?? false,
          body.acceptanceReason ?? (body.treatmentOption === "accept" || body.status === "accepted" ? body.treatmentPlan ?? null : null),
          body.status === "accepted" || body.treatmentOption === "accept" ? request.user!.sub : null,
          body.status === "accepted" || body.treatmentOption === "accept" ? new Date().toISOString() : null,
          body.acceptanceExpiresAt ?? body.dueDate ?? null
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

  // Removed: /api/assessments/:id/risks/export and /risks/import (CSV)
  // CSV import/export was removed by product decision — the workflow is now
  // a guided in-app flow. Bulk PATCH on /risks/bulk remains for mass actions.
  // Stub endpoints return 410 Gone so older clients get a clear signal.
  app.get<{ Params: { id: string } }>(
    "/api/assessments/:id/risks/export",
    async (_request, reply) => {
      return reply.code(410).send({
        code: "FEATURE_REMOVED",
        message: "CSV export was removed. Use the in-app bulk actions."
      });
    }
  );
  app.post<{ Params: { id: string } }>(
    "/api/assessments/:id/risks/import",
    async (_request, reply) => {
      return reply.code(410).send({
        code: "FEATURE_REMOVED",
        message: "CSV import was removed. Use bulk PATCH on /risks/bulk instead."
      });
    }
  );

  // Dead-code stub block, kept temporarily so the rest of the file diff is small.
  // Will be cleaned in PR-2 risk refactor.
  if (false) {
    const _legacyImport = async (request: { params: { id: string }; user?: { sub: string }; body?: unknown }, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) => {
      const body = validateBody(riskImportSchema, request.body, reply as never);
      if (!body) return;
      void body;
      const rows = parseCsv(body.csv);
      const [header, ...records] = rows;
      if (!header?.length) {
        return reply.code(400).send({ code: "CSV_INVALID", message: "CSV header is required" });
      }
      const keys = header.map((value) => value.trim().toLowerCase());
      let imported = 0;
      for (const record of records) {
        const row = Object.fromEntries(keys.map((key, index) => [key, record[index] ?? ""]));
        const title = String(row.title ?? "").trim();
        if (!title) continue;
        const likelihood = Math.min(5, Math.max(1, Number(row.likelihood || 3)));
        const impact = Math.min(5, Math.max(1, Number(row.impact || 3)));
        const { riskScore, rating } = ratingFor(likelihood, impact);
        const existing = await pool.query(
          "select id from risks where assessment_id = $1 and lower(title) = lower($2) and status <> 'deleted' limit 1",
          [request.params.id, title]
        );
        if (existing.rows[0]) {
          await pool.query(
            `update risks
             set likelihood = $3,
                 impact = $4,
                 risk_score = $5,
                 rating = $6,
                 treatment_option = $7,
                 owner = $8,
                 treatment_plan = $9,
                 due_date = nullif($10, '')::date,
                 status = $11,
                 draft = $12,
                 source_type = 'csv_import',
                 acceptance_reason = $13,
                 acceptance_expires_at = nullif($14, '')::date,
                 updated_at = now()
             where id = $1 and assessment_id = $2`,
            [
              existing.rows[0].id,
              request.params.id,
              likelihood,
              impact,
              riskScore,
              rating,
              row.treatment_option || "mitigate",
              row.owner || "",
              row.treatment_plan || "",
              row.due_date || "",
              row.status || "open",
              String(row.draft ?? "").toLowerCase() === "true",
              row.acceptance_reason || null,
              row.acceptance_expires_at || ""
            ]
          );
        } else {
          await pool.query(
            `insert into risks
              (id, assessment_id, title, likelihood, impact, risk_score, rating, treatment_option,
               owner, treatment_plan, due_date, status, draft, source_type, acceptance_reason, acceptance_expires_at)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,nullif($11, '')::date,$12,$13,'csv_import',$14,nullif($15, '')::date)`,
            [
              randomUUID(),
              request.params.id,
              title,
              likelihood,
              impact,
              riskScore,
              rating,
              row.treatment_option || "mitigate",
              row.owner || "",
              row.treatment_plan || "",
              row.due_date || "",
              row.status || "open",
              String(row.draft ?? "").toLowerCase() === "true",
              row.acceptance_reason || null,
              row.acceptance_expires_at || ""
            ]
          );
        }
        imported += 1;
      }
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "risk_register.imported",
        entityType: "assessment",
        entityId: request.params.id,
        before: null,
        after: { imported }
      });
      void imported;
      return reply.code(201).send({ imported });
    };
    void _legacyImport;
  }

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
      const mergedBody = {
        ...body,
        owner: body.owner ?? (before.owner as string | undefined),
        treatmentPlan: body.treatmentPlan ?? (before.treatmentPlan as string | undefined),
        acceptanceReason: body.acceptanceReason ?? (before.acceptanceReason as string | undefined),
        dueDate: body.dueDate ?? (before.dueDate as string | null | undefined),
        acceptanceExpiresAt:
          body.acceptanceExpiresAt ?? (before.acceptanceExpiresAt as string | null | undefined),
        treatmentOption: body.treatmentOption ?? (before.treatmentOption as string | undefined),
        status: body.status ?? (before.status as string | undefined)
      };
      const validationError = treatmentValidationError(mergedBody);
      if (validationError) {
        return reply.code(400).send({ code: "INVALID_RISK_TREATMENT", message: validationError });
      }
      const likelihood = body.likelihood ?? (before.likelihood as number) ?? 3;
      const impact = body.impact ?? (before.impact as number) ?? 3;
      const { riskScore, rating } = ratingFor(likelihood, impact);
      const becomesAccepted = mergedBody.treatmentOption === "accept" || mergedBody.status === "accepted";
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
             draft = coalesce($12, draft),
             acceptance_reason = coalesce($13, acceptance_reason),
             accepted_by = case when $14::boolean then coalesce(accepted_by, $15) else accepted_by end,
             accepted_at = case when $14::boolean then coalesce(accepted_at, now()) else accepted_at end,
             acceptance_expires_at = case when $16::text is null then acceptance_expires_at else nullif($16, '')::date end,
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
          body.status,
          body.draft,
          body.acceptanceReason ?? (becomesAccepted ? body.treatmentPlan : undefined),
          becomesAccepted,
          request.user!.sub,
          body.acceptanceExpiresAt ?? body.dueDate
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

  app.patch<{ Params: { id: string }; Body: BulkRiskBody }>(
    "/api/assessments/:id/risks/bulk",
    { preHandler: requireCsrfPermission("risk.edit") },
    async (request, reply) => {
      const body = validateBody(bulkRiskSchema, request.body, reply);
      if (!body) return;
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      if (!body.delete && !body.status && !body.owner && body.dueDate === undefined && !body.treatmentOption && body.draft === undefined) {
        return reply.code(400).send({ code: "INVALID_INPUT", message: "At least one bulk change is required" });
      }
      const before = await pool.query(
        "select * from risks where assessment_id = $1 and id = any($2::uuid[])",
        [request.params.id, body.riskIds]
      );
      const result = body.delete
        ? await pool.query(
            `update risks
             set status = 'deleted',
                 updated_at = now()
             where assessment_id = $1 and id = any($2::uuid[])
             returning *`,
            [request.params.id, body.riskIds]
          )
        : await pool.query(
            `update risks
             set status = coalesce($3, status),
                 owner = coalesce($4, owner),
                 due_date = case when $5::text is null then due_date else nullif($5, '')::date end,
                 treatment_option = coalesce($6, treatment_option),
                 draft = coalesce($7, draft),
                 updated_at = now()
             where assessment_id = $1 and id = any($2::uuid[])
             returning *`,
            [
              request.params.id,
              body.riskIds,
              body.status,
              body.owner,
              body.dueDate,
              body.treatmentOption,
              body.draft
            ]
          );
      await appendActivityEvent({
        userId: request.user!.sub,
        action: body.delete ? "risk.bulk_deleted" : "risk.bulk_updated",
        entityType: "assessment",
        entityId: request.params.id,
        before: before.rows,
        after: result.rows
      });
      return { updated: result.rowCount };
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
      const phaseKey = normalisePhaseLabel(body.phase ?? "soon");
      const anchor = await loadAnchorDate(request.params.id);
      const { startDate, endDate } = phaseDatesFor(phaseKey, anchor);
      const result = await pool.query(
        `insert into roadmap_items
          (id, assessment_id, risk_id, phase, action, owner, due_date, effort_estimate, status, source_risk_rating,
           phase_start_date, phase_end_date)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         returning *`,
        [
          randomUUID(),
          request.params.id,
          body.riskId ?? null,
          phaseKey,
          body.action ?? `Treat risk: ${risk?.title ?? "Untitled risk"}`,
          body.owner ?? (risk?.owner as string) ?? "",
          body.dueDate || endDate,
          body.effortEstimate ?? "Medium",
          body.status ?? "open",
          risk?.rating ?? null,
          startDate,
          endDate
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

  app.post<{ Params: { id: string } }>(
    "/api/assessments/:id/roadmap/generate",
    { preHandler: requireCsrfPermission("roadmap.edit") },
    async (request, reply) => {
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const risks = await pool.query(
        `select r.*
         from risks r
         left join roadmap_items ri on ri.risk_id = r.id
         where r.assessment_id = $1
           and r.status not in ('closed','deleted')
           and r.rating in ('High','Critical')
           and ri.id is null
         order by r.risk_score desc nulls last`,
        [request.params.id]
      );
      const created = [];
      for (const risk of risks.rows) {
        const phase = risk.rating === "Critical" ? "0-30d" : "31-90d";
        const result = await pool.query(
          `insert into roadmap_items
            (id, assessment_id, risk_id, phase, action, owner, due_date, effort_estimate, status, source_risk_rating)
           values ($1,$2,$3,$4,$5,$6,null,$7,'open',$8)
           returning *`,
          [
            randomUUID(),
            request.params.id,
            risk.id,
            phase,
            `Treat ${risk.rating} risk: ${risk.title}`,
            risk.owner ?? "",
            risk.rating === "Critical" ? "High" : "Medium",
            risk.rating
          ]
        );
        created.push(result.rows[0]);
      }
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "roadmap.generated_from_risks",
        entityType: "assessment",
        entityId: request.params.id,
        before: null,
        after: { created: created.length }
      });
      return reply.code(201).send({ created: created.length, roadmapItems: created.map(mapRoadmapItem) });
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
      // If phase changed, recompute the absolute phase boundaries.
      const phaseChanged = body.phase && normalisePhaseLabel(body.phase) !== before.phase;
      const phaseKey = body.phase ? normalisePhaseLabel(body.phase) : (before.phase as never);
      const anchor = await loadAnchorDate(request.params.id);
      const phaseRange = phaseChanged ? phaseDatesFor(phaseKey, anchor) : { startDate: null, endDate: null };
      const result = await pool.query(
        `update roadmap_items
         set phase = coalesce($2, phase),
             action = coalesce($3, action),
             owner = coalesce($4, owner),
             due_date = $5,
             effort_estimate = coalesce($6, effort_estimate),
             status = coalesce($7, status),
             phase_start_date = coalesce($8, phase_start_date),
             phase_end_date = coalesce($9, phase_end_date),
             updated_at = now()
         where id = $1
         returning *`,
        [
          request.params.roadmapItemId,
          body.phase ? phaseKey : null,
          body.action,
          body.owner,
          body.dueDate || (phaseChanged ? phaseRange.endDate : null),
          body.effortEstimate,
          body.status,
          phaseChanged ? phaseRange.startDate : null,
          phaseChanged ? phaseRange.endDate : null
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
