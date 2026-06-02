import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { appendActivityEvent } from "../activity/service.js";
import { requireCsrfPermission, requirePermission } from "../auth/hooks.js";
import { pool } from "../db/client.js";

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

function priorityForScore(score: number): string {
  if (score <= 1) return "high";
  return "medium";
}

function ratingFor(likelihood = 1, impact = 1): { riskScore: number; rating: string } {
  const riskScore = likelihood * impact;
  if (riskScore >= 20) return { riskScore, rating: "Critical" };
  if (riskScore >= 12) return { riskScore, rating: "High" };
  if (riskScore >= 5) return { riskScore, rating: "Medium" };
  return { riskScore, rating: "Low" };
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

async function ensureSuggestedFindings(assessmentId: string): Promise<void> {
  const candidates = await pool.query<{
    question_id: string;
    framework_control_id: string;
    control_code: string;
    control_title: string;
    question: string;
    score: number;
    evidence_status: string;
    notes: string | null;
  }>(
    `select aq.id as question_id, aq.framework_control_id, fc.control_code,
      fc.title as control_title, aq.question, ca.score, ca.evidence_status, ca.notes
     from assessment_questions aq
     join framework_controls fc on fc.id = aq.framework_control_id
     join control_answers ca on ca.assessment_question_id = aq.id
     where aq.assessment_id = $1 and ca.score <= 2`,
    [assessmentId]
  );

  for (const candidate of candidates.rows) {
    const title = `${candidate.control_code}: ${candidate.control_title} needs attention`;
    const observation = `Score ${candidate.score}/5 indicates a control gap. Evidence status: ${candidate.evidence_status}.`;
    const recommendation =
      "Review the control owner, collect supporting evidence, and define a risk treatment action.";
    const sourceExplanation = `Suggested because the guided question for ${candidate.control_code} was scored ${candidate.score}, which is at or below the Step 6 threshold of 2.`;
    await pool.query(
      `insert into findings
        (id, assessment_id, assessment_question_id, framework_control_id, title, status,
         priority, observation, recommendation, source_explanation)
       values ($1, $2, $3, $4, $5, 'suggested', $6, $7, $8, $9)
       on conflict (assessment_id, framework_control_id) where framework_control_id is not null
       do update set
        title = case when findings.status = 'suggested' then excluded.title else findings.title end,
        priority = case when findings.status = 'suggested' then excluded.priority else findings.priority end,
        observation = case when findings.status = 'suggested' then excluded.observation else findings.observation end,
        recommendation = case when findings.status = 'suggested' then excluded.recommendation else findings.recommendation end,
        source_explanation = excluded.source_explanation,
        updated_at = now()`,
      [
        randomUUID(),
        assessmentId,
        candidate.question_id,
        candidate.framework_control_id,
        title,
        priorityForScore(candidate.score),
        observation,
        recommendation,
        sourceExplanation
      ]
    );
  }
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
      if (!(await ensureAssessmentExists(request.params.id))) {
        return reply
          .code(404)
          .send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
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
      const before = await loadFinding(request.params.findingId);
      if (!before || before.assessmentId !== request.params.id) {
        return reply.code(404).send({ code: "FINDING_NOT_FOUND", message: "Finding not found" });
      }
      const action = request.body.action ?? "edit";
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
          request.body.title,
          request.body.priority,
          request.body.observation,
          request.body.recommendation,
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
      if (!(await ensureAssessmentExists(request.params.id))) {
        return reply
          .code(404)
          .send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const result = await pool.query(
        `select r.*, f.title as finding_title
         from risks r
         left join findings f on f.id = r.finding_id
         where r.assessment_id = $1
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
      if (!(await ensureAssessmentExists(request.params.id))) {
        return reply
          .code(404)
          .send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const likelihood = request.body.likelihood ?? 3;
      const impact = request.body.impact ?? 3;
      if (likelihood < 1 || likelihood > 5 || impact < 1 || impact > 5) {
        return reply
          .code(400)
          .send({ code: "INVALID_RISK_SCORE", message: "Likelihood and impact must be 1-5" });
      }
      const { riskScore, rating } = ratingFor(likelihood, impact);
      let title = request.body.title;
      if (!title && request.body.findingId) {
        const finding = await loadFinding(request.body.findingId);
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
          request.body.findingId ?? null,
          title,
          likelihood,
          impact,
          riskScore,
          rating,
          request.body.treatmentOption ?? "mitigate",
          request.body.owner ?? "",
          request.body.treatmentPlan ?? "",
          request.body.dueDate || null,
          request.body.status ?? "open"
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
      const before = await loadRisk(request.params.riskId);
      if (!before || before.assessmentId !== request.params.id) {
        return reply.code(404).send({ code: "RISK_NOT_FOUND", message: "Risk not found" });
      }
      const likelihood = request.body.likelihood ?? (before.likelihood as number) ?? 3;
      const impact = request.body.impact ?? (before.impact as number) ?? 3;
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
             due_date = $10,
             status = coalesce($11, status),
             updated_at = now()
         where id = $1
         returning *`,
        [
          request.params.riskId,
          request.body.title,
          likelihood,
          impact,
          riskScore,
          rating,
          request.body.treatmentOption,
          request.body.owner,
          request.body.treatmentPlan,
          request.body.dueDate || null,
          request.body.status
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

  app.get<{ Params: { id: string } }>(
    "/api/assessments/:id/roadmap",
    { preHandler: requirePermission("assessment.view") },
    async (request, reply) => {
      if (!(await ensureAssessmentExists(request.params.id))) {
        return reply
          .code(404)
          .send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
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
      if (!(await ensureAssessmentExists(request.params.id))) {
        return reply
          .code(404)
          .send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      if (!request.body.action && !request.body.riskId) {
        return reply
          .code(400)
          .send({ code: "INVALID_INPUT", message: "Roadmap action or risk is required" });
      }
      const risk = request.body.riskId ? await loadRisk(request.body.riskId) : null;
      const result = await pool.query(
        `insert into roadmap_items
          (id, assessment_id, risk_id, phase, action, owner, due_date, effort_estimate, status, source_risk_rating)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         returning *`,
        [
          randomUUID(),
          request.params.id,
          request.body.riskId ?? null,
          request.body.phase ?? "31-90d",
          request.body.action ?? `Treat risk: ${risk?.title ?? "Untitled risk"}`,
          request.body.owner ?? (risk?.owner as string) ?? "",
          request.body.dueDate || null,
          request.body.effortEstimate ?? "Medium",
          request.body.status ?? "open",
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
          request.body.phase,
          request.body.action,
          request.body.owner,
          request.body.dueDate || null,
          request.body.effortEstimate,
          request.body.status
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
