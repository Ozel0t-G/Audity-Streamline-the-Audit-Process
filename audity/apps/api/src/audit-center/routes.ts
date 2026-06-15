import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendActivityEvent } from "../activity/service.js";
import { requireCsrfPermission, requirePermission, type AuthenticatedUser } from "../auth/hooks.js";
import { canAccessAssessment } from "../customers/access.js";
import { pool } from "../db/client.js";

const defaultPhases = [
  { name: "Preparation", status: "active", sortOrder: 1 },
  { name: "Kickoff", status: "planned", sortOrder: 2 },
  { name: "Evidence Collection", status: "planned", sortOrder: 3 },
  { name: "Interviews", status: "planned", sortOrder: 4 },
  { name: "Review", status: "planned", sortOrder: 5 },
  { name: "Findings", status: "planned", sortOrder: 6 },
  { name: "Report", status: "planned", sortOrder: 7 },
  { name: "Closure", status: "planned", sortOrder: 8 }
];

type AuditControlRow = Record<string, unknown> & {
  assessmentQuestionId?: string;
  questionId?: string | null;
  question?: string | null;
  controlCode?: string | null;
  controlTitle?: string | null;
  domain?: string | null;
  applicability?: string | null;
  applicabilityReason?: string | null;
  controlOwner?: string | null;
  reviewStatus?: string | null;
  readinessStatus?: string | null;
  evidenceStatus?: string | null;
  evidenceQualityScore?: number | null;
  signoffStatus?: string | null;
  maturityJustification?: string | null;
  score?: number | null;
  mappedEvidence: number;
  contradiction: boolean;
};

const planSchema = z.object({
  programTemplateId: z.string().uuid().nullable().optional(),
  currentPhase: z.string().trim().min(1).optional(),
  phases: z.array(z.record(z.string(), z.unknown())).optional(),
  kickoffAt: z.string().nullable().optional(),
  fieldworkStart: z.string().nullable().optional(),
  fieldworkEnd: z.string().nullable().optional(),
  reportDueDate: z.string().nullable().optional(),
  closureDueDate: z.string().nullable().optional(),
  auditOwner: z.string().max(180).nullable().optional(),
  reviewer: z.string().max(180).nullable().optional(),
  readinessTarget: z.number().int().min(1).max(100).optional()
});

const scopeSchema = z.object({
  itemType: z.enum(["system", "process", "supplier", "data_type", "location", "regulation", "other"]),
  name: z.string().trim().min(1).max(240),
  description: z.string().max(2000).optional(),
  inScope: z.boolean().optional(),
  criticality: z.enum(["low", "medium", "high", "critical"]).optional(),
  rationale: z.string().max(2000).nullable().optional()
});

const controlProfileSchema = z.object({
  applicability: z.enum(["applicable", "not_applicable", "partially_applicable"]).optional(),
  applicabilityReason: z.string().max(2000).nullable().optional(),
  controlOwner: z.string().max(180).nullable().optional(),
  reviewer: z.string().max(180).nullable().optional(),
  reviewStatus: z.enum(["draft", "ready_for_review", "changes_requested", "approved"]).optional(),
  controlCriticality: z.enum(["low", "medium", "high", "critical"]).optional(),
  maturityJustification: z.string().max(4000).nullable().optional(),
  evidenceQualityScore: z.number().int().min(0).max(5).optional(),
  readinessStatus: z.enum(["not_ready", "in_progress", "ready", "blocked"]).optional()
});

const evidenceRequestSchema = z.object({
  assessmentQuestionId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(240),
  description: z.string().max(3000).optional(),
  owner: z.string().max(180).nullable().optional(),
  dueDate: z.string().nullable().optional(),
  status: z.enum(["open", "requested", "received", "validated", "closed", "cancelled"]).optional(),
  portalVisibility: z.enum(["internal", "customer"]).optional()
});

const evidenceMappingSchema = z.object({
  evidenceId: z.string().uuid(),
  assessmentQuestionId: z.string().uuid().nullable().optional(),
  findingId: z.string().uuid().nullable().optional(),
  riskId: z.string().uuid().nullable().optional(),
  mappingType: z.string().trim().min(1).max(120).optional(),
  qualityRelevance: z.number().int().min(1).max(5).optional(),
  qualityCompleteness: z.number().int().min(1).max(5).optional(),
  qualityFreshness: z.number().int().min(1).max(5).optional(),
  qualityTrust: z.number().int().min(1).max(5).optional(),
  status: z.enum(["mapped", "reviewed", "rejected"]).optional(),
  notes: z.string().max(2000).nullable().optional()
});

const interviewSchema = z.object({
  title: z.string().trim().min(1).max(240),
  participants: z.string().max(1000).optional(),
  interviewAt: z.string().nullable().optional(),
  notes: z.string().max(6000).optional(),
  linkedQuestionId: z.string().uuid().nullable().optional(),
  followUp: z.string().max(3000).nullable().optional(),
  status: z.enum(["planned", "completed", "follow_up", "cancelled"]).optional()
});

const sampleSchema = z.object({
  name: z.string().trim().min(1).max(240),
  populationDescription: z.string().max(2000).optional(),
  populationSize: z.number().int().min(0).optional(),
  sampleSize: z.number().int().min(0).optional(),
  selectionMethod: z.enum(["random", "judgmental", "risk_based", "systematic"]).optional(),
  selectedItems: z.array(z.string()).optional(),
  resultSummary: z.string().max(4000).nullable().optional(),
  status: z.enum(["planned", "selected", "tested", "exception_found", "completed"]).optional()
});

const findingAuditSchema = z.object({
  lifecycleStatus: z.enum(["draft", "confirmed", "agreed", "remediation_planned", "remediated", "verified", "closed"]).optional(),
  severityImpact: z.number().int().min(1).max(5).optional(),
  severityLikelihood: z.number().int().min(1).max(5).optional(),
  controlCriticality: z.enum(["low", "medium", "high", "critical"]).optional(),
  evidenceConfidence: z.enum(["low", "medium", "high"]).optional(),
  managementResponseStatus: z.enum(["pending", "accepted", "remediation_planned", "rejected"]).nullable().optional(),
  managementResponse: z.string().max(4000).nullable().optional(),
  managementOwner: z.string().max(180).nullable().optional(),
  remediationStatus: z.enum(["not_started", "planned", "in_progress", "implemented", "blocked"]).optional(),
  remediationOwner: z.string().max(180).nullable().optional(),
  remediationDueDate: z.string().nullable().optional(),
  retestStatus: z.enum(["not_ready", "ready", "passed", "failed"]).optional(),
  retestNotes: z.string().max(4000).nullable().optional(),
  retestEvidenceId: z.string().uuid().nullable().optional()
});

const reportReviewSchema = z.object({
  reportId: z.string().uuid().nullable().optional(),
  status: z.enum(["draft", "internal_review", "customer_review", "final", "approved"]).optional(),
  reviewer: z.string().max(180).nullable().optional(),
  customerReviewer: z.string().max(180).nullable().optional(),
  summary: z.string().max(4000).nullable().optional(),
  dueDate: z.string().nullable().optional()
});

const signoffSchema = z.object({
  entityType: z.enum(["control", "finding", "report", "assessment"]),
  entityId: z.string().trim().min(1).max(120),
  statement: z.string().trim().min(1).max(2000),
  signerName: z.string().max(180).nullable().optional()
});

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw Object.assign(new Error("Invalid input"), { statusCode: 400, code: "INVALID_INPUT" });
  }
  return result.data;
}

function nullDate(value?: string | null) {
  return value ? value : null;
}

function calculateQuality(input: z.infer<typeof evidenceMappingSchema>) {
  const values = [
    input.qualityRelevance ?? 3,
    input.qualityCompleteness ?? 3,
    input.qualityFreshness ?? 3,
    input.qualityTrust ?? 3
  ];
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function calculatedSeverity(input: z.infer<typeof findingAuditSchema>) {
  const impact = input.severityImpact ?? 3;
  const likelihood = input.severityLikelihood ?? 3;
  const criticalityBoost = input.controlCriticality === "critical" ? 5 : input.controlCriticality === "high" ? 3 : input.controlCriticality === "medium" ? 1 : 0;
  const confidenceBoost = input.evidenceConfidence === "high" ? 1 : input.evidenceConfidence === "low" ? -1 : 0;
  const score = impact * likelihood + criticalityBoost + confidenceBoost;
  if (score >= 20) return "critical";
  if (score >= 14) return "high";
  if (score >= 7) return "medium";
  return "low";
}

function hashSignoff(input: { assessmentId: string; entityType: string; entityId: string; statement: string; userId: string; timestamp: string }) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function rowToCamel(row: Record<string, unknown>) {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    mapped[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] = value;
  }
  return mapped;
}

async function ensureAuditTemplates() {
  await pool.query(
    `insert into audit_program_templates (id, name, description, program_type, phases, default_scope, default_controls)
     values
       ($1, 'Internal Security Audit', 'General internal control audit with planning, evidence, interviews, findings, remediation and reporting.', 'internal_security_audit', $4::jsonb, '{}'::jsonb, '[]'::jsonb),
       ($2, 'ISO 27001 Readiness Audit', 'Readiness-focused audit program with applicability, evidence and management-response workflow.', 'iso27001_readiness', $4::jsonb, '{}'::jsonb, '[]'::jsonb),
       ($3, 'Vendor Security Audit', 'Third-party audit program with supplier scope, evidence requests and remediation follow-up.', 'vendor_security_audit', $4::jsonb, '{}'::jsonb, '[]'::jsonb)
     on conflict (id) do update set phases = excluded.phases, updated_at = now()`,
    [
      "10000000-0000-4000-8000-000000000101",
      "10000000-0000-4000-8000-000000000102",
      "10000000-0000-4000-8000-000000000103",
      JSON.stringify(defaultPhases)
    ]
  );
}

async function assertAssessmentAccess(user: AuthenticatedUser, assessmentId: string) {
  return canAccessAssessment(user, assessmentId);
}

async function ensureAuditDefaults(assessmentId: string, userId: string) {
  await ensureAuditTemplates();
  await pool.query(
    `insert into audit_plans (assessment_id, phases, created_by, updated_by)
     values ($1, $2::jsonb, $3, $3)
     on conflict (assessment_id) do nothing`,
    [assessmentId, JSON.stringify(defaultPhases), userId]
  );
  const profileQuestions = await pool.query<{ id: string; framework_control_id: string | null }>(
    `select aq.id, aq.framework_control_id
     from assessment_questions aq
     left join audit_control_profiles acp
       on acp.assessment_question_id = aq.id and acp.assessment_id = aq.assessment_id
     where aq.assessment_id = $1 and acp.id is null`,
    [assessmentId]
  );
  for (const question of profileQuestions.rows) {
    await pool.query(
      `insert into audit_control_profiles
        (id, assessment_id, assessment_question_id, framework_control_id, updated_by)
       values ($1,$2,$3,$4,$5)
       on conflict (assessment_id, assessment_question_id) do nothing`,
      [randomUUID(), assessmentId, question.id, question.framework_control_id, userId]
    );
  }
  const scopeCount = await pool.query<{ count: string }>("select count(*) from audit_scope_items where assessment_id = $1", [assessmentId]);
  if (Number(scopeCount.rows[0]?.count ?? 0) === 0) {
    const assessment = await pool.query<{ scope: Record<string, unknown> }>("select scope from assessments where id = $1", [assessmentId]);
    const scope = assessment.rows[0]?.scope ?? {};
    const seedItems: Array<{ itemType: string; name: string; inScope: boolean }> = [];
    for (const name of (scope.inScopeSystems as string[] | undefined) ?? []) seedItems.push({ itemType: "system", name, inScope: true });
    for (const name of (scope.businessProcesses as string[] | undefined) ?? []) seedItems.push({ itemType: "process", name, inScope: true });
    for (const name of (scope.outOfScope as string[] | undefined) ?? []) seedItems.push({ itemType: "other", name, inScope: false });
    if (typeof scope.regulatoryContext === "string" && scope.regulatoryContext) seedItems.push({ itemType: "regulation", name: scope.regulatoryContext, inScope: true });
    for (const item of seedItems.slice(0, 30)) {
      await pool.query(
        `insert into audit_scope_items (id, assessment_id, item_type, name, in_scope, created_by)
         values ($1,$2,$3,$4,$5,$6)`,
        [randomUUID(), assessmentId, item.itemType, item.name, item.inScope, userId]
      );
    }
  }
}

async function loadOverview(assessmentId: string, userId: string) {
  await ensureAuditDefaults(assessmentId, userId);
  const [
    assessment,
    plan,
    scopeItems,
    controls,
    evidence,
    mappings,
    evidenceRequests,
    findings,
    risks,
    interviews,
    samples,
    reportReviews,
    signoffs,
    history
  ] = await Promise.all([
    pool.query(
      `select a.*, c.name as customer_name
       from assessments a
       join customers c on c.id = a.customer_id
       where a.id = $1`,
      [assessmentId]
    ),
    pool.query("select * from audit_plans where assessment_id = $1", [assessmentId]),
    pool.query("select * from audit_scope_items where assessment_id = $1 order by item_type, name", [assessmentId]),
    pool.query(
      `select aq.id as assessment_question_id, aq.question_id, aq.question, aq.domain,
              fc.id as framework_control_id, fc.control_code, fc.title as control_title,
              fc.evidence_examples, fc.criticality_hint,
              ca.score, ca.answer_state, ca.evidence_status, ca.confidence_level, ca.notes,
              acp.*
       from assessment_questions aq
       left join framework_controls fc on fc.id = aq.framework_control_id
       left join control_answers ca on ca.assessment_question_id = aq.id
       left join audit_control_profiles acp on acp.assessment_question_id = aq.id
       where aq.assessment_id = $1
       order by aq.sort_order, fc.control_code nulls last`,
      [assessmentId]
    ),
    pool.query("select * from evidence_items where assessment_id = $1 and deleted_at is null order by created_at desc", [assessmentId]),
    pool.query("select * from audit_evidence_mappings where assessment_id = $1 order by created_at desc", [assessmentId]),
    pool.query("select * from audit_evidence_requests where assessment_id = $1 order by due_date nulls last, created_at desc", [assessmentId]),
    pool.query("select * from findings where assessment_id = $1 order by updated_at desc", [assessmentId]),
    pool.query("select * from risks where assessment_id = $1 and status <> 'deleted' order by risk_score desc nulls last, updated_at desc", [assessmentId]),
    pool.query("select * from audit_interviews where assessment_id = $1 order by interview_at nulls last, created_at desc", [assessmentId]),
    pool.query("select * from audit_samples where assessment_id = $1 order by created_at desc", [assessmentId]),
    pool.query("select * from audit_report_reviews where assessment_id = $1 order by created_at desc", [assessmentId]),
    pool.query("select * from audit_signoffs where assessment_id = $1 order by created_at desc", [assessmentId]),
    pool.query("select * from user_activity_logs where entity_id = $1 order by created_at desc limit 25", [assessmentId])
  ]);

  const mappingByQuestion = new Map<string, number>();
  for (const mapping of mappings.rows) {
    const key = String(mapping.assessment_question_id ?? "");
    if (key) mappingByQuestion.set(key, (mappingByQuestion.get(key) ?? 0) + 1);
  }

  const controlRows: AuditControlRow[] = controls.rows.map((row) => {
    const mappedEvidence = mappingByQuestion.get(String(row.assessment_question_id)) ?? 0;
    return {
      ...rowToCamel(row),
      mappedEvidence,
      contradiction:
        Number(row.score ?? 0) >= 4 &&
        mappedEvidence === 0 &&
        !["validated", "received"].includes(String(row.evidence_status ?? "not_requested"))
    } as AuditControlRow;
  });

  const gaps = [
    ...controlRows
      .filter((control) => control.applicability !== "not_applicable" && Number(control.score ?? 0) <= 2)
      .map((control) => ({
        type: "Control Gap",
        title: `${control.controlCode ?? "Control"} ${control.controlTitle ?? ""}`.trim(),
        status: control.reviewStatus ?? "draft",
        owner: control.controlOwner ?? null
      })),
    ...controlRows
      .filter((control) => control.applicability !== "not_applicable" && Number(control.mappedEvidence ?? 0) === 0)
      .map((control) => ({
        type: "Evidence Gap",
        title: `${control.controlCode ?? "Control"} missing evidence`,
        status: control.evidenceStatus ?? "not_requested",
        owner: control.controlOwner ?? null
      })),
    ...findings.rows
      .filter((finding) => !["closed", "verified"].includes(String(finding.lifecycle_status ?? "draft")))
      .map((finding) => ({
        type: "Process Gap",
        title: finding.title,
        status: finding.lifecycle_status,
        owner: finding.remediation_owner ?? finding.management_owner ?? null
      }))
  ].slice(0, 200);

  const controlsTotal = controlRows.length;
  const approvedControls = controlRows.filter((control) => control.reviewStatus === "approved" || control.signoffStatus === "signed").length;
  const evidenceMappedControls = controlRows.filter((control) => Number(control.mappedEvidence ?? 0) > 0 || ["validated", "received"].includes(String(control.evidenceStatus ?? ""))).length;
  const openFindings = findings.rows.filter((finding) => !["closed", "verified"].includes(String(finding.lifecycle_status ?? "draft"))).length;
  const reportFinal = reportReviews.rows.some((review) => ["final", "approved"].includes(String(review.status)));
  const readinessScore = controlsTotal
    ? Math.max(0, Math.min(100, Math.round(
        (approvedControls / controlsTotal) * 35 +
        (evidenceMappedControls / controlsTotal) * 35 +
        (1 - Math.min(openFindings, controlsTotal) / Math.max(controlsTotal, 1)) * 20 +
        (reportFinal ? 10 : 0)
      )))
    : 0;

  const contradictions = controlRows.filter((control) => control.contradiction);
  const statementOfApplicability = controlRows.map((control) => ({
    assessmentQuestionId: control.assessmentQuestionId,
    controlCode: control.controlCode ?? control.questionId,
    controlTitle: control.controlTitle ?? control.question,
    domain: control.domain,
    applicability: control.applicability ?? "applicable",
    applicabilityReason: control.applicabilityReason ?? "",
    controlOwner: control.controlOwner ?? "",
    reviewStatus: control.reviewStatus ?? "draft",
    readinessStatus: control.readinessStatus ?? "not_ready",
    evidenceMapped: control.mappedEvidence,
    evidenceQualityScore: control.evidenceQualityScore ?? 0,
    signoffStatus: control.signoffStatus ?? "not_signed",
    maturityJustification: control.maturityJustification ?? ""
  }));
  const executiveSummary = [
    `Audit readiness is ${readinessScore}% for ${assessment.rows[0]?.customer_name ?? "this customer"}.`,
    `${controlsTotal} controls are in scope, ${approvedControls} are approved or signed off, and ${evidenceMappedControls} have mapped or received evidence.`,
    `${openFindings} findings still require remediation or verification. ${contradictions.length} contradictions should be reviewed before final report sign-off.`
  ].join(" ");

  return {
    assessment: rowToCamel(assessment.rows[0] ?? {}),
    plan: rowToCamel(plan.rows[0] ?? {}),
    scopeItems: scopeItems.rows.map(rowToCamel),
    controls: controlRows,
    evidenceItems: evidence.rows.map(rowToCamel),
    evidenceMappings: mappings.rows.map(rowToCamel),
    evidenceRequests: evidenceRequests.rows.map(rowToCamel),
    findings: findings.rows.map(rowToCamel),
    risks: risks.rows.map(rowToCamel),
    interviews: interviews.rows.map(rowToCamel),
    samples: samples.rows.map(rowToCamel),
    reportReviews: reportReviews.rows.map(rowToCamel),
    signoffs: signoffs.rows.map(rowToCamel),
    history: history.rows.map(rowToCamel),
    statementOfApplicability,
    gaps,
    contradictions,
    readinessScore,
    executiveSummary
  };
}

export async function registerAuditCenterRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/audit-program-templates", { preHandler: requirePermission("assessment.view") }, async () => {
    await ensureAuditTemplates();
    const result = await pool.query("select * from audit_program_templates order by name");
    return { templates: result.rows.map(rowToCamel) };
  });

  app.get<{ Params: { id: string } }>("/api/assessments/:id/audit-center", { preHandler: requirePermission("assessment.view") }, async (request, reply) => {
    if (!(await assertAssessmentAccess(request.user!, request.params.id))) {
      return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
    }
    return loadOverview(request.params.id, request.user!.sub);
  });

  app.get<{ Params: { id: string } }>("/api/assessments/:id/audit-center/evidence-pack", { preHandler: requirePermission("assessment.view") }, async (request, reply) => {
    if (!(await assertAssessmentAccess(request.user!, request.params.id))) {
      return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
    }
    const overview = await loadOverview(request.params.id, request.user!.sub);
    const mappings = overview.evidenceMappings as Array<Record<string, unknown>>;
    const evidence = new Map((overview.evidenceItems as Array<Record<string, unknown>>).map((item) => [String(item.id), item]));
    const pack = {
      generatedAt: new Date().toISOString(),
      assessment: overview.assessment,
      executiveSummary: overview.executiveSummary,
      readinessScore: overview.readinessScore,
      statementOfApplicability: overview.statementOfApplicability,
      controls: (overview.controls as Array<Record<string, unknown>>).map((control) => {
        const controlMappings = mappings.filter((mapping) => mapping.assessmentQuestionId === control.assessmentQuestionId);
        return {
          assessmentQuestionId: control.assessmentQuestionId,
          controlCode: control.controlCode ?? control.questionId,
          controlTitle: control.controlTitle ?? control.question,
          reviewStatus: control.reviewStatus,
          readinessStatus: control.readinessStatus,
          evidenceQualityScore: control.evidenceQualityScore,
          evidence: controlMappings.map((mapping) => ({
            mappingId: mapping.id,
            mappingType: mapping.mappingType,
            qualityScore: mapping.qualityScore,
            status: mapping.status,
            evidenceItem: evidence.get(String(mapping.evidenceId)) ?? { id: mapping.evidenceId }
          }))
        };
      }),
      findings: overview.findings,
      risks: overview.risks,
      evidenceRequests: overview.evidenceRequests,
      interviews: overview.interviews,
      samples: overview.samples,
      reportReviews: overview.reportReviews,
      signoffs: overview.signoffs,
      gaps: overview.gaps,
      contradictions: overview.contradictions
    };
    return { pack };
  });

  app.put<{ Params: { id: string }; Body: z.infer<typeof planSchema> }>("/api/assessments/:id/audit-center/plan", { preHandler: requireCsrfPermission("assessment.edit") }, async (request, reply) => {
    if (!(await assertAssessmentAccess(request.user!, request.params.id))) return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
    const body = parseBody(planSchema, request.body);
    await ensureAuditDefaults(request.params.id, request.user!.sub);
    const result = await pool.query(
      `update audit_plans
       set current_phase = coalesce($2, current_phase),
           phases = coalesce($3::jsonb, phases),
           kickoff_at = $4,
           fieldwork_start = $5,
           fieldwork_end = $6,
           report_due_date = $7,
           closure_due_date = $8,
           audit_owner = $9,
           reviewer = $10,
           readiness_target = coalesce($11, readiness_target),
           program_template_id = coalesce($12, program_template_id),
           updated_by = $13,
           updated_at = now()
       where assessment_id = $1
       returning *`,
      [
        request.params.id,
        body.currentPhase ?? null,
        body.phases ? JSON.stringify(body.phases) : null,
        body.kickoffAt ?? null,
        nullDate(body.fieldworkStart),
        nullDate(body.fieldworkEnd),
        nullDate(body.reportDueDate),
        nullDate(body.closureDueDate),
        body.auditOwner ?? null,
        body.reviewer ?? null,
        body.readinessTarget ?? null,
        body.programTemplateId ?? null,
        request.user!.sub
      ]
    );
    await appendActivityEvent({ userId: request.user!.sub, action: "audit.plan.updated", entityType: "assessment", entityId: request.params.id, before: null, after: result.rows[0] });
    return { plan: rowToCamel(result.rows[0]) };
  });

  app.post<{ Params: { id: string }; Body: z.infer<typeof scopeSchema> }>("/api/assessments/:id/audit-center/scope", { preHandler: requireCsrfPermission("assessment.edit") }, async (request, reply) => {
    if (!(await assertAssessmentAccess(request.user!, request.params.id))) return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
    const body = parseBody(scopeSchema, request.body);
    const result = await pool.query(
      `insert into audit_scope_items (id, assessment_id, item_type, name, description, in_scope, criticality, rationale, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
      [randomUUID(), request.params.id, body.itemType, body.name, body.description ?? "", body.inScope ?? true, body.criticality ?? "medium", body.rationale ?? null, request.user!.sub]
    );
    await appendActivityEvent({ userId: request.user!.sub, action: "audit.scope.created", entityType: "assessment", entityId: request.params.id, before: null, after: result.rows[0] });
    return { scopeItem: rowToCamel(result.rows[0]) };
  });

  app.patch<{ Params: { id: string; scopeId: string }; Body: Partial<z.infer<typeof scopeSchema>> }>("/api/assessments/:id/audit-center/scope/:scopeId", { preHandler: requireCsrfPermission("assessment.edit") }, async (request, reply) => {
    if (!(await assertAssessmentAccess(request.user!, request.params.id))) return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
    const body = parseBody(scopeSchema.partial(), request.body);
    const before = await pool.query("select * from audit_scope_items where id = $1 and assessment_id = $2", [request.params.scopeId, request.params.id]);
    if (!before.rows[0]) return reply.code(404).send({ code: "SCOPE_NOT_FOUND", message: "Scope item not found" });
    const result = await pool.query(
      `update audit_scope_items
       set item_type = coalesce($3, item_type),
           name = coalesce($4, name),
           description = coalesce($5, description),
           in_scope = coalesce($6, in_scope),
           criticality = coalesce($7, criticality),
           rationale = coalesce($8, rationale),
           updated_at = now()
       where id = $1 and assessment_id = $2 returning *`,
      [request.params.scopeId, request.params.id, body.itemType ?? null, body.name ?? null, body.description ?? null, body.inScope ?? null, body.criticality ?? null, body.rationale ?? null]
    );
    await appendActivityEvent({ userId: request.user!.sub, action: "audit.scope.updated", entityType: "assessment", entityId: request.params.id, before: before.rows[0], after: result.rows[0] });
    return { scopeItem: rowToCamel(result.rows[0]) };
  });

  app.delete<{ Params: { id: string; scopeId: string } }>("/api/assessments/:id/audit-center/scope/:scopeId", { preHandler: requireCsrfPermission("assessment.edit") }, async (request, reply) => {
    if (!(await assertAssessmentAccess(request.user!, request.params.id))) return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
    const before = await pool.query("select * from audit_scope_items where id = $1 and assessment_id = $2", [request.params.scopeId, request.params.id]);
    await pool.query("delete from audit_scope_items where id = $1 and assessment_id = $2", [request.params.scopeId, request.params.id]);
    if (before.rows[0]) {
      await appendActivityEvent({ userId: request.user!.sub, action: "audit.scope.deleted", entityType: "assessment", entityId: request.params.id, before: before.rows[0], after: null });
    }
    return { status: "ok" };
  });

  app.patch<{ Params: { id: string; questionId: string }; Body: z.infer<typeof controlProfileSchema> }>("/api/assessments/:id/audit-center/controls/:questionId", { preHandler: requireCsrfPermission("assessment.edit") }, async (request, reply) => {
    if (!(await assertAssessmentAccess(request.user!, request.params.id))) return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
    const body = parseBody(controlProfileSchema, request.body);
    await ensureAuditDefaults(request.params.id, request.user!.sub);
    const question = await pool.query("select id, framework_control_id from assessment_questions where id = $1 and assessment_id = $2", [request.params.questionId, request.params.id]);
    if (!question.rows[0]) return reply.code(404).send({ code: "CONTROL_NOT_FOUND", message: "Control not found" });
    const result = await pool.query(
      `insert into audit_control_profiles
        (id, assessment_id, assessment_question_id, framework_control_id, applicability, applicability_reason, control_owner, reviewer,
         review_status, control_criticality, maturity_justification, evidence_quality_score, readiness_status, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       on conflict (assessment_id, assessment_question_id) do update
       set applicability = excluded.applicability,
           applicability_reason = excluded.applicability_reason,
           control_owner = excluded.control_owner,
           reviewer = excluded.reviewer,
           review_status = excluded.review_status,
           control_criticality = excluded.control_criticality,
           maturity_justification = excluded.maturity_justification,
           evidence_quality_score = excluded.evidence_quality_score,
           readiness_status = excluded.readiness_status,
           updated_by = excluded.updated_by,
           updated_at = now()
       returning *`,
      [
        randomUUID(),
        request.params.id,
        request.params.questionId,
        question.rows[0].framework_control_id,
        body.applicability ?? "applicable",
        body.applicabilityReason ?? null,
        body.controlOwner ?? null,
        body.reviewer ?? null,
        body.reviewStatus ?? "draft",
        body.controlCriticality ?? "medium",
        body.maturityJustification ?? null,
        body.evidenceQualityScore ?? 0,
        body.readinessStatus ?? "not_ready",
        request.user!.sub
      ]
    );
    await appendActivityEvent({ userId: request.user!.sub, action: "audit.control.updated", entityType: "assessment", entityId: request.params.id, before: null, after: result.rows[0] });
    return { controlProfile: rowToCamel(result.rows[0]) };
  });

  app.post<{ Params: { id: string }; Body: z.infer<typeof evidenceRequestSchema> }>("/api/assessments/:id/audit-center/evidence-requests", { preHandler: requireCsrfPermission("assessment.edit") }, async (request, reply) => {
    if (!(await assertAssessmentAccess(request.user!, request.params.id))) return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
    const body = parseBody(evidenceRequestSchema, request.body);
    const result = await pool.query(
      `insert into audit_evidence_requests
        (id, assessment_id, assessment_question_id, title, description, owner, due_date, status, portal_visibility, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [randomUUID(), request.params.id, body.assessmentQuestionId ?? null, body.title, body.description ?? "", body.owner ?? null, nullDate(body.dueDate), body.status ?? "open", body.portalVisibility ?? "customer", request.user!.sub]
    );
    await appendActivityEvent({ userId: request.user!.sub, action: "audit.evidence_request.created", entityType: "assessment", entityId: request.params.id, before: null, after: result.rows[0] });
    return { evidenceRequest: rowToCamel(result.rows[0]) };
  });

  app.patch<{ Params: { id: string; requestId: string }; Body: Partial<z.infer<typeof evidenceRequestSchema>> }>("/api/assessments/:id/audit-center/evidence-requests/:requestId", { preHandler: requireCsrfPermission("assessment.edit") }, async (request, reply) => {
    if (!(await assertAssessmentAccess(request.user!, request.params.id))) return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
    const body = parseBody(evidenceRequestSchema.partial(), request.body);
    const result = await pool.query(
      `update audit_evidence_requests
       set title = coalesce($3, title),
           description = coalesce($4, description),
           owner = coalesce($5, owner),
           due_date = coalesce($6, due_date),
           status = coalesce($7, status),
           portal_visibility = coalesce($8, portal_visibility),
           updated_at = now()
       where id = $1 and assessment_id = $2 returning *`,
      [request.params.requestId, request.params.id, body.title ?? null, body.description ?? null, body.owner ?? null, nullDate(body.dueDate), body.status ?? null, body.portalVisibility ?? null]
    );
    if (!result.rows[0]) return reply.code(404).send({ code: "REQUEST_NOT_FOUND", message: "Evidence request not found" });
    await appendActivityEvent({ userId: request.user!.sub, action: "audit.evidence_request.updated", entityType: "assessment", entityId: request.params.id, before: null, after: result.rows[0] });
    return { evidenceRequest: rowToCamel(result.rows[0]) };
  });

  app.post<{ Params: { id: string }; Body: z.infer<typeof evidenceMappingSchema> }>("/api/assessments/:id/audit-center/evidence-mappings", { preHandler: requireCsrfPermission("assessment.edit") }, async (request, reply) => {
    if (!(await assertAssessmentAccess(request.user!, request.params.id))) return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
    const body = parseBody(evidenceMappingSchema, request.body);
    const evidenceItem = await pool.query("select id from evidence_items where id = $1 and assessment_id = $2 and deleted_at is null", [body.evidenceId, request.params.id]);
    if (!evidenceItem.rows[0]) return reply.code(404).send({ code: "EVIDENCE_NOT_FOUND", message: "Evidence item not found" });
    const qualityScore = calculateQuality(body);
    const result = await pool.query(
      `insert into audit_evidence_mappings
        (id, assessment_id, evidence_id, assessment_question_id, finding_id, risk_id, mapping_type,
         quality_relevance, quality_completeness, quality_freshness, quality_trust, quality_score, status, notes, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning *`,
      [
        randomUUID(),
        request.params.id,
        body.evidenceId,
        body.assessmentQuestionId ?? null,
        body.findingId ?? null,
        body.riskId ?? null,
        body.mappingType ?? "supports_control",
        body.qualityRelevance ?? 3,
        body.qualityCompleteness ?? 3,
        body.qualityFreshness ?? 3,
        body.qualityTrust ?? 3,
        qualityScore,
        body.status ?? "mapped",
        body.notes ?? null,
        request.user!.sub
      ]
    );
    if (body.assessmentQuestionId) {
      await pool.query(
        `update audit_control_profiles
         set evidence_quality_score = greatest(evidence_quality_score, $3), updated_at = now(), updated_by = $4
         where assessment_id = $1 and assessment_question_id = $2`,
        [request.params.id, body.assessmentQuestionId, qualityScore, request.user!.sub]
      );
    }
    await appendActivityEvent({ userId: request.user!.sub, action: "audit.evidence_mapping.created", entityType: "assessment", entityId: request.params.id, before: null, after: result.rows[0] });
    return { evidenceMapping: rowToCamel(result.rows[0]) };
  });

  app.delete<{ Params: { id: string; mappingId: string } }>("/api/assessments/:id/audit-center/evidence-mappings/:mappingId", { preHandler: requireCsrfPermission("assessment.edit") }, async (request, reply) => {
    if (!(await assertAssessmentAccess(request.user!, request.params.id))) return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
    await pool.query("delete from audit_evidence_mappings where id = $1 and assessment_id = $2", [request.params.mappingId, request.params.id]);
    return { status: "ok" };
  });

  app.post<{ Params: { id: string }; Body: z.infer<typeof interviewSchema> }>("/api/assessments/:id/audit-center/interviews", { preHandler: requireCsrfPermission("assessment.edit") }, async (request, reply) => {
    if (!(await assertAssessmentAccess(request.user!, request.params.id))) return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
    const body = parseBody(interviewSchema, request.body);
    const result = await pool.query(
      `insert into audit_interviews
        (id, assessment_id, title, participants, interview_at, notes, linked_question_id, follow_up, status, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [randomUUID(), request.params.id, body.title, body.participants ?? "", body.interviewAt ?? null, body.notes ?? "", body.linkedQuestionId ?? null, body.followUp ?? null, body.status ?? "planned", request.user!.sub]
    );
    await appendActivityEvent({ userId: request.user!.sub, action: "audit.interview.created", entityType: "assessment", entityId: request.params.id, before: null, after: result.rows[0] });
    return { interview: rowToCamel(result.rows[0]) };
  });

  app.patch<{ Params: { id: string; interviewId: string }; Body: Partial<z.infer<typeof interviewSchema>> }>("/api/assessments/:id/audit-center/interviews/:interviewId", { preHandler: requireCsrfPermission("assessment.edit") }, async (request, reply) => {
    if (!(await assertAssessmentAccess(request.user!, request.params.id))) return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
    const body = parseBody(interviewSchema.partial(), request.body);
    const result = await pool.query(
      `update audit_interviews
       set title = coalesce($3, title),
           participants = coalesce($4, participants),
           interview_at = coalesce($5, interview_at),
           notes = coalesce($6, notes),
           linked_question_id = coalesce($7, linked_question_id),
           follow_up = coalesce($8, follow_up),
           status = coalesce($9, status),
           updated_at = now()
       where id = $1 and assessment_id = $2 returning *`,
      [request.params.interviewId, request.params.id, body.title ?? null, body.participants ?? null, body.interviewAt ?? null, body.notes ?? null, body.linkedQuestionId ?? null, body.followUp ?? null, body.status ?? null]
    );
    if (!result.rows[0]) return reply.code(404).send({ code: "INTERVIEW_NOT_FOUND", message: "Interview not found" });
    return { interview: rowToCamel(result.rows[0]) };
  });

  app.post<{ Params: { id: string }; Body: z.infer<typeof sampleSchema> }>("/api/assessments/:id/audit-center/samples", { preHandler: requireCsrfPermission("assessment.edit") }, async (request, reply) => {
    if (!(await assertAssessmentAccess(request.user!, request.params.id))) return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
    const body = parseBody(sampleSchema, request.body);
    const result = await pool.query(
      `insert into audit_samples
        (id, assessment_id, name, population_description, population_size, sample_size, selection_method, selected_items, result_summary, status, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11) returning *`,
      [randomUUID(), request.params.id, body.name, body.populationDescription ?? "", body.populationSize ?? 0, body.sampleSize ?? 0, body.selectionMethod ?? "judgmental", JSON.stringify(body.selectedItems ?? []), body.resultSummary ?? null, body.status ?? "planned", request.user!.sub]
    );
    await appendActivityEvent({ userId: request.user!.sub, action: "audit.sample.created", entityType: "assessment", entityId: request.params.id, before: null, after: result.rows[0] });
    return { sample: rowToCamel(result.rows[0]) };
  });

  app.patch<{ Params: { id: string; sampleId: string }; Body: Partial<z.infer<typeof sampleSchema>> }>("/api/assessments/:id/audit-center/samples/:sampleId", { preHandler: requireCsrfPermission("assessment.edit") }, async (request, reply) => {
    if (!(await assertAssessmentAccess(request.user!, request.params.id))) return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
    const body = parseBody(sampleSchema.partial(), request.body);
    const result = await pool.query(
      `update audit_samples
       set name = coalesce($3, name),
           population_description = coalesce($4, population_description),
           population_size = coalesce($5, population_size),
           sample_size = coalesce($6, sample_size),
           selection_method = coalesce($7, selection_method),
           selected_items = coalesce($8::jsonb, selected_items),
           result_summary = coalesce($9, result_summary),
           status = coalesce($10, status),
           updated_at = now()
       where id = $1 and assessment_id = $2 returning *`,
      [
        request.params.sampleId,
        request.params.id,
        body.name ?? null,
        body.populationDescription ?? null,
        body.populationSize ?? null,
        body.sampleSize ?? null,
        body.selectionMethod ?? null,
        body.selectedItems ? JSON.stringify(body.selectedItems) : null,
        body.resultSummary ?? null,
        body.status ?? null
      ]
    );
    if (!result.rows[0]) return reply.code(404).send({ code: "SAMPLE_NOT_FOUND", message: "Sample not found" });
    return { sample: rowToCamel(result.rows[0]) };
  });

  app.patch<{ Params: { id: string; findingId: string }; Body: z.infer<typeof findingAuditSchema> }>("/api/assessments/:id/audit-center/findings/:findingId", { preHandler: requireCsrfPermission("finding.approve") }, async (request, reply) => {
    if (!(await assertAssessmentAccess(request.user!, request.params.id))) return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
    const body = parseBody(findingAuditSchema, request.body);
    const before = await pool.query("select * from findings where id = $1 and assessment_id = $2", [request.params.findingId, request.params.id]);
    if (!before.rows[0]) return reply.code(404).send({ code: "FINDING_NOT_FOUND", message: "Finding not found" });
    const severity = calculatedSeverity({
      ...body,
      severityImpact: body.severityImpact ?? before.rows[0].severity_impact ?? 3,
      severityLikelihood: body.severityLikelihood ?? before.rows[0].severity_likelihood ?? 3,
      controlCriticality: body.controlCriticality ?? before.rows[0].control_criticality ?? "medium",
      evidenceConfidence: body.evidenceConfidence ?? before.rows[0].evidence_confidence ?? "medium"
    });
    const result = await pool.query(
      `update findings
       set lifecycle_status = coalesce($3, lifecycle_status),
           severity_impact = coalesce($4, severity_impact),
           severity_likelihood = coalesce($5, severity_likelihood),
           control_criticality = coalesce($6, control_criticality),
           evidence_confidence = coalesce($7, evidence_confidence),
           calculated_severity = $8,
           management_response_status = coalesce($9, management_response_status),
           management_response = coalesce($10, management_response),
           management_owner = coalesce($11, management_owner),
           remediation_status = coalesce($12, remediation_status),
           remediation_owner = coalesce($13, remediation_owner),
           remediation_due_date = coalesce($14, remediation_due_date),
           retest_status = coalesce($15, retest_status),
           retest_notes = coalesce($16, retest_notes),
           retest_evidence_id = coalesce($17, retest_evidence_id),
           verified_at = case when $15 = 'passed' then now() else verified_at end,
           verified_by = case when $15 = 'passed' then $18 else verified_by end,
           updated_by = $18,
           updated_at = now()
       where id = $1 and assessment_id = $2 returning *`,
      [
        request.params.findingId,
        request.params.id,
        body.lifecycleStatus ?? null,
        body.severityImpact ?? null,
        body.severityLikelihood ?? null,
        body.controlCriticality ?? null,
        body.evidenceConfidence ?? null,
        severity,
        body.managementResponseStatus ?? null,
        body.managementResponse ?? null,
        body.managementOwner ?? null,
        body.remediationStatus ?? null,
        body.remediationOwner ?? null,
        nullDate(body.remediationDueDate),
        body.retestStatus ?? null,
        body.retestNotes ?? null,
        body.retestEvidenceId ?? null,
        request.user!.sub
      ]
    );
    await appendActivityEvent({ userId: request.user!.sub, action: "audit.finding.updated", entityType: "assessment", entityId: request.params.id, before: before.rows[0], after: result.rows[0] });
    return { finding: rowToCamel(result.rows[0]) };
  });

  app.post<{ Params: { id: string }; Body: z.infer<typeof reportReviewSchema> }>("/api/assessments/:id/audit-center/report-reviews", { preHandler: requireCsrfPermission("report.export") }, async (request, reply) => {
    if (!(await assertAssessmentAccess(request.user!, request.params.id))) return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
    const body = parseBody(reportReviewSchema, request.body);
    const result = await pool.query(
      `insert into audit_report_reviews (id, assessment_id, report_id, status, reviewer, customer_reviewer, summary, due_date, approved_at, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,case when $4 in ('final','approved') then now() else null end,$9) returning *`,
      [randomUUID(), request.params.id, body.reportId ?? null, body.status ?? "draft", body.reviewer ?? null, body.customerReviewer ?? null, body.summary ?? null, nullDate(body.dueDate), request.user!.sub]
    );
    await appendActivityEvent({ userId: request.user!.sub, action: "audit.report_review.created", entityType: "assessment", entityId: request.params.id, before: null, after: result.rows[0] });
    return { reportReview: rowToCamel(result.rows[0]) };
  });

  app.patch<{ Params: { id: string; reviewId: string }; Body: Partial<z.infer<typeof reportReviewSchema>> }>("/api/assessments/:id/audit-center/report-reviews/:reviewId", { preHandler: requireCsrfPermission("report.export") }, async (request, reply) => {
    if (!(await assertAssessmentAccess(request.user!, request.params.id))) return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
    const body = parseBody(reportReviewSchema.partial(), request.body);
    const result = await pool.query(
      `update audit_report_reviews
       set report_id = coalesce($3, report_id),
           status = coalesce($4, status),
           reviewer = coalesce($5, reviewer),
           customer_reviewer = coalesce($6, customer_reviewer),
           summary = coalesce($7, summary),
           due_date = coalesce($8, due_date),
           approved_at = case when $4 in ('final','approved') then now() else approved_at end,
           updated_at = now()
       where id = $1 and assessment_id = $2 returning *`,
      [request.params.reviewId, request.params.id, body.reportId ?? null, body.status ?? null, body.reviewer ?? null, body.customerReviewer ?? null, body.summary ?? null, nullDate(body.dueDate)]
    );
    if (!result.rows[0]) return reply.code(404).send({ code: "REPORT_REVIEW_NOT_FOUND", message: "Report review not found" });
    return { reportReview: rowToCamel(result.rows[0]) };
  });

  app.post<{ Params: { id: string }; Body: z.infer<typeof signoffSchema> }>("/api/assessments/:id/audit-center/signoffs", { preHandler: requireCsrfPermission("finding.approve") }, async (request, reply) => {
    if (!(await assertAssessmentAccess(request.user!, request.params.id))) return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
    const body = parseBody(signoffSchema, request.body);
    const timestamp = new Date().toISOString();
    const eventHash = hashSignoff({ assessmentId: request.params.id, entityType: body.entityType, entityId: body.entityId, statement: body.statement, userId: request.user!.sub, timestamp });
    const result = await pool.query(
      `insert into audit_signoffs (id, assessment_id, entity_type, entity_id, signed_by, signer_name, statement, event_hash, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
      [randomUUID(), request.params.id, body.entityType, body.entityId, request.user!.sub, body.signerName ?? request.user!.email, body.statement, eventHash, timestamp]
    );
    if (body.entityType === "control") {
      await pool.query("update audit_control_profiles set signoff_status = 'signed', signoff_by = $3, signoff_at = now(), updated_at = now() where assessment_id = $1 and assessment_question_id::text = $2", [request.params.id, body.entityId, request.user!.sub]);
    }
    await appendActivityEvent({ userId: request.user!.sub, action: "audit.signoff.created", entityType: "assessment", entityId: request.params.id, before: null, after: result.rows[0] });
    return { signoff: rowToCamel(result.rows[0]) };
  });
}
