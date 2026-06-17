import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { parse } from "yaml";
import { z } from "zod";
import { appendActivityEvent } from "../activity/service.js";
import { requireCsrfPermission, requirePermission } from "../auth/hooks.js";
import { canAccessAssessment } from "../customers/access.js";
import { pool } from "../db/client.js";
import { validateBody } from "../utils/validation.js";
import { ensureAutomaticRiskRegister } from "../workflow/suggestions.js";

type ImportControl = {
  domain?: string;
  code?: string;
  title?: string;
  description?: string;
  question?: string;
};

type ImportBody = {
  licenseConfirmed?: boolean;
  publishToTenant?: boolean;
  name?: string;
  version?: string;
  shortName?: string;
  csv?: string;
  yaml?: string;
  controls?: ImportControl[];
  framework?: {
    name?: string;
    version?: string;
    shortName?: string;
    controls?: ImportControl[];
  };
};

type AnswerBody = {
  score?: number | null;
  answerState?: string;
  evidenceStatus?: string;
  confidenceLevel?: string;
  notes?: string;
};

const importControlSchema = z.object({
  domain: z.string().optional(),
  code: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  question: z.string().optional()
});

const importSchema = z.object({
  licenseConfirmed: z.literal(true),
  publishToTenant: z.boolean().optional().default(true),
  name: z.string().optional(),
  version: z.string().optional(),
  shortName: z.string().optional(),
  csv: z.string().optional(),
  yaml: z.string().optional(),
  controls: z.array(importControlSchema).optional(),
  framework: z.object({
    name: z.string().optional(),
    version: z.string().optional(),
    shortName: z.string().optional(),
    controls: z.array(importControlSchema).optional()
  }).optional()
});

const answerSchema = z.object({
  score: z.number().int().min(0).max(5).nullable().optional(),
  answerState: z.string().optional(),
  evidenceStatus: z.string().optional(),
  confidenceLevel: z.string().optional(),
  notes: z.string().optional()
});

function stableUuid(input: string): string {
  const hash = createHash("sha256").update(input).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(
    16,
    20
  )}-${hash.slice(20, 32)}`;
}

function mapFramework(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    version: row.version,
    sourceType: row.source_type,
    licenseStatus: row.license_status,
    distributedByAudity: row.distributed_by_audity,
    statusLabel: row.status_label,
    disclaimer: row.disclaimer,
    importedBy: row.imported_by,
    importedAt: row.imported_at,
    licenseConfirmed: row.license_confirmed,
    deliveryMode: row.delivery_mode,
    contentClass: row.content_class,
    officialStandardTextIncluded: row.official_standard_text_included,
    officialControlCatalogueIncluded: row.official_control_catalogue_included,
    licensedContentImportSupported: row.licensed_content_import_supported,
    redistributionNote: row.redistribution_note,
    controlCount: Number(row.control_count ?? 0)
  };
}

function parseCsvControls(csv: string): ImportControl[] {
  const [headerLine, ...lines] = csv.split(/\r?\n/).filter((line) => line.trim());
  if (!headerLine) {
    return [];
  }
  const headers = headerLine.split(",").map((header) => header.trim().toLowerCase());
  return lines.map((line) => {
    const cells = line.split(",").map((cell) => cell.trim());
    const value = (name: string) => cells[headers.indexOf(name)] ?? "";
    return {
      domain: value("domain"),
      code: value("code"),
      title: value("title"),
      description: value("description"),
      question: value("question")
    };
  });
}

function parseYamlImport(yaml: string): { name?: string; version?: string; shortName?: string; controls: ImportControl[] } {
  const schema = z.object({
    framework: z.object({
      name: z.string().optional(),
      version: z.string().optional(),
      shortName: z.string().optional()
    }).optional(),
    domains: z.array(z.object({
      name: z.string().optional(),
      controls: z.array(z.object({
        id: z.string().optional(),
        code: z.string().optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        question: z.string().optional(),
        questions: z.array(z.object({
          text: z.string().optional()
        })).optional()
      })).optional()
    })).optional()
  });
  const parsed = schema.parse(parse(yaml));
  return {
    name: parsed.framework?.name,
    version: parsed.framework?.version,
    shortName: parsed.framework?.shortName,
    controls: (parsed.domains ?? []).flatMap((domain) =>
      (domain.controls ?? []).map((control) => ({
        domain: domain.name,
        code: control.code ?? control.id,
        title: control.title,
        description: control.description,
        question: control.question ?? control.questions?.[0]?.text
      }))
    )
  };
}

function normalizeControls(body: ImportBody): ImportControl[] {
  if (body.yaml) {
    return parseYamlImport(body.yaml).controls;
  }
  if (body.csv) {
    return parseCsvControls(body.csv);
  }
  return body.framework?.controls ?? body.controls ?? [];
}

async function publishFrameworkToActiveCustomers(frameworkId: string, userId: string): Promise<number> {
  const result = await pool.query(
    `insert into customer_frameworks (customer_id, framework_id, selected_by_user_id)
     select c.id, $1, $2
     from customers c
     where c.status = 'active'
       and c.archived_at is null
     on conflict (customer_id, framework_id) do nothing`,
    [frameworkId, userId]
  );
  return result.rowCount ?? 0;
}

async function getDefaultFramework(): Promise<{ id: string; label: string } | null> {
  const configuredKey = process.env.AUDITY_DEFAULT_FRAMEWORK_KEY ?? "nist-csf-2";
  const configuredId = process.env.AUDITY_DEFAULT_FRAMEWORK_ID ?? stableUuid(`framework:${configuredKey}`);
  const preferred = await pool.query<{ id: string; name: string; short_name: string | null; version: string | null }>(
    "select id, name, short_name, version from frameworks where id = $1 limit 1",
    [configuredId]
  );
  const fallback = preferred.rows[0]
    ? preferred
    : await pool.query<{ id: string; name: string; short_name: string | null; version: string | null }>(
        `select id, name, short_name, version
         from frameworks
         order by distributed_by_audity desc, name asc, version asc
         limit 1`
      );
  const row = fallback.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    label: `${row.short_name ?? row.name} ${row.version ?? ""}`.trim()
  };
}

async function getAssessmentFrameworkId(assessmentId: string): Promise<string | null> {
  const assessment = await pool.query<{ framework_id: string | null; framework: string | null }>(
    "select framework_id, framework from assessments where id = $1",
    [assessmentId]
  );
  if (!assessment.rows[0]) {
    return null;
  }
  if (assessment.rows[0].framework_id) {
    return assessment.rows[0].framework_id;
  }
  const defaultFramework = await getDefaultFramework();
  if (defaultFramework) {
    await pool.query(
      `update assessments
       set framework_id = $2,
           framework = coalesce(nullif(framework, 'Framework placeholder'), $3),
           updated_at = now()
       where id = $1`,
      [assessmentId, defaultFramework.id, defaultFramework.label]
    );
  }
  return defaultFramework?.id ?? null;
}

async function ensureAssessmentQuestions(
  assessmentId: string,
  frameworkId: string
): Promise<void> {
  const controls = await pool.query<{
    id: string;
    question_id: string;
    question: string;
    answer_scale: string;
    minimum_evidence_expected: number;
    preferred_evidence_types: unknown;
    gap_trigger: string | null;
    question_text: string | null;
    title: string;
    name: string;
    sort_order: number;
    question_sort_order: number;
    domain_sort_order: number;
  }>(
    `select fc.id, fc.question_text, fc.title, fd.name, fc.sort_order, fd.sort_order as domain_sort_order,
       qcm.question_id, qcm.question, qcm.answer_scale, qcm.minimum_evidence_expected,
       qcm.preferred_evidence_types, qcm.gap_trigger, qcm.sort_order as question_sort_order
     from question_control_mappings qcm
     join framework_controls fc on fc.id = qcm.framework_control_id
     join framework_domains fd on fd.id = fc.framework_domain_id
     where qcm.framework_id = $1
     order by fd.sort_order, fc.sort_order, qcm.sort_order`,
    [frameworkId]
  );
  for (const control of controls.rows) {
    const questionId = stableUuid(`assessment-question:${assessmentId}:${control.question_id}`);
    await pool.query(
      `insert into assessment_questions
        (id, assessment_id, framework_control_id, question_id, question, domain, sort_order,
         answer_scale, minimum_evidence_expected, preferred_evidence_types, gap_trigger)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (assessment_id, question_id) where question_id is not null
       do update set
        framework_control_id = excluded.framework_control_id,
        question = excluded.question,
        domain = excluded.domain,
        sort_order = excluded.sort_order,
        answer_scale = excluded.answer_scale,
        minimum_evidence_expected = excluded.minimum_evidence_expected,
        preferred_evidence_types = excluded.preferred_evidence_types,
        gap_trigger = excluded.gap_trigger`,
      [
        questionId,
        assessmentId,
        control.id,
        control.question_id,
        control.question ?? control.question_text ?? `Assess readiness for ${control.title}`,
        control.name,
        control.domain_sort_order * 1000 + control.question_sort_order,
        control.answer_scale,
        control.minimum_evidence_expected,
        JSON.stringify(control.preferred_evidence_types ?? []),
        control.gap_trigger
      ]
    );
  }
}

function coverage(answered: number, total: number): number {
  return total === 0 ? 0 : Math.round((answered / total) * 100);
}

export async function registerFrameworkRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/frameworks",
    { preHandler: requirePermission("assessment.view") },
    async () => {
      const result = await pool.query(
        `select f.*,
          count(fc.id)::int as control_count
         from frameworks f
         left join framework_domains fd on fd.framework_id = f.id
         left join framework_controls fc on fc.framework_domain_id = fd.id
         group by f.id
         order by f.distributed_by_audity desc, f.name`
      );
      return { frameworks: result.rows.map(mapFramework) };
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/frameworks/:id/controls",
    { preHandler: requirePermission("assessment.view") },
    async (request, reply) => {
      const frameworkResult = await pool.query(
        `select f.*, count(fc.id)::int as control_count
         from frameworks f
         left join framework_domains fd on fd.framework_id = f.id
         left join framework_controls fc on fc.framework_domain_id = fd.id
         where f.id = $1
         group by f.id`,
        [request.params.id]
      );
      if (!frameworkResult.rows[0]) {
        return reply
          .code(404)
          .send({ code: "FRAMEWORK_NOT_FOUND", message: "Framework not found" });
      }
      const domains = await pool.query(
        `select fd.id as domain_id, fd.name as domain_name, fd.description as domain_description,
          fd.sort_order as domain_sort_order, fc.id as control_id, fc.control_code, fc.title,
          fc.description, fc.question_text, fc.evidence_examples, fc.tags, fc.sort_order,
          fc.audity_objective, fc.default_weight, fc.readiness_pass_condition,
          fc.gap_condition, fc.report_mapping
         from framework_domains fd
         left join framework_controls fc on fc.framework_domain_id = fd.id
         where fd.framework_id = $1
         order by fd.sort_order, fc.sort_order`,
        [request.params.id]
      );
      const grouped = new Map<string, Record<string, unknown>>();
      for (const row of domains.rows) {
        if (!grouped.has(row.domain_id)) {
          grouped.set(row.domain_id, {
            id: row.domain_id,
            name: row.domain_name,
            description: row.domain_description,
            sortOrder: row.domain_sort_order,
            controls: []
          });
        }
        if (row.control_id) {
          (grouped.get(row.domain_id)!.controls as unknown[]).push({
            id: row.control_id,
            code: row.control_code,
            title: row.title,
            description: row.description,
            question: row.question_text,
            evidenceExamples: row.evidence_examples,
            tags: row.tags,
            audityObjective: row.audity_objective,
            defaultWeight: Number(row.default_weight ?? 1),
            readinessPassCondition: row.readiness_pass_condition,
            gapCondition: row.gap_condition,
            reportMapping: row.report_mapping,
            sortOrder: row.sort_order
          });
        }
      }
      return {
        framework: mapFramework(frameworkResult.rows[0]),
        domains: [...grouped.values()]
      };
    }
  );

  app.post<{ Body: ImportBody }>(
    "/api/frameworks/import",
    { preHandler: requireCsrfPermission("frameworks.manage") },
    async (request, reply) => {
      const body = validateBody(importSchema, request.body, reply);
      if (!body) return;
      let yamlImport: ReturnType<typeof parseYamlImport> | null = null;
      try {
        yamlImport = body.yaml ? parseYamlImport(body.yaml) : null;
      } catch (error) {
        return reply.code(400).send({
          code: "INVALID_IMPORT",
          message: error instanceof Error ? `Invalid YAML framework: ${error.message}` : "Invalid YAML framework"
        });
      }
      const name = yamlImport?.name ?? body.framework?.name ?? body.name;
      const version = yamlImport?.version ?? body.framework?.version ?? body.version ?? "User Import";
      const shortName = yamlImport?.shortName ?? body.framework?.shortName ?? body.shortName ?? name;
      const controls = (yamlImport?.controls ?? normalizeControls(body)).filter(
        (control) => control.domain && control.code && control.title
      );
      if (!name || controls.length === 0) {
        return reply.code(400).send({
          code: "INVALID_IMPORT",
          message: "Framework name and at least one control are required"
        });
      }

      const frameworkId = randomUUID();
      await pool.query(
        `insert into frameworks
          (id, name, short_name, version, source_type, license_status, distributed_by_audity,
           status_label, disclaimer, imported_by, imported_at, license_confirmed)
         values ($1, $2, $3, $4, 'tenant_published', 'tenant_license_confirmed', false,
          'Tenant Published', $5, $6, now(), true)`,
        [
          frameworkId,
          name,
          shortName,
          version,
          "This framework was published by an Instance Admin for tenant-wide use. The publisher confirmed they have the required license or permission.",
          request.user!.sub
        ]
      );

      const domainIds = new Map<string, string>();
      for (const control of controls) {
        const domainName = control.domain!;
        let domainId = domainIds.get(domainName);
        if (!domainId) {
          domainId = randomUUID();
          domainIds.set(domainName, domainId);
          await pool.query(
          `insert into framework_domains (id, framework_id, name, description, sort_order)
             values ($1, $2, $3, $4, $5)`,
            [
              domainId,
              frameworkId,
              domainName,
              "Tenant-published framework domain",
              domainIds.size
            ]
          );
        }
        const controlId = randomUUID();
        await pool.query(
          `insert into framework_controls
            (id, framework_domain_id, control_code, title, description, question_text, sort_order)
           values ($1, $2, $3, $4, $5, $6, $7)`,
          [
            controlId,
            domainId,
            control.code,
            control.title,
            control.description ?? "",
            control.question ?? `Assess readiness for ${control.title}`,
            controls.indexOf(control) + 1
          ]
        );
        await pool.query(
          `insert into question_control_mappings
            (id, framework_id, framework_control_id, question_id, question, answer_scale,
             minimum_evidence_expected, preferred_evidence_types, gap_trigger, sort_order)
           values ($1, $2, $3, $4, $5, '0,1,2,3,4,NA', 1, $6, $7, $8)`,
          [
            randomUUID(),
            frameworkId,
            controlId,
            `${control.code}-Q1`,
            control.question ?? `Assess readiness for ${control.title}`,
            JSON.stringify([]),
            "score <= 2 or missing approved evidence",
            controls.indexOf(control) + 1
          ]
        );
      }

      const publishedCustomerCount = body.publishToTenant
        ? await publishFrameworkToActiveCustomers(frameworkId, request.user!.sub)
        : 0;

      const saved = await pool.query(
        `select f.*, count(fc.id)::int as control_count
         from frameworks f
         left join framework_domains fd on fd.framework_id = f.id
         left join framework_controls fc on fc.framework_domain_id = fd.id
         where f.id = $1
         group by f.id`,
        [frameworkId]
      );
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "framework.tenant_published",
        entityType: "framework",
        entityId: frameworkId,
        before: null,
        after: {
          framework: mapFramework(saved.rows[0]),
          publishToTenant: body.publishToTenant,
          publishedCustomerCount
        }
      });
      return reply.code(201).send({
        framework: mapFramework(saved.rows[0]),
        publishedCustomerCount
      });
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/assessments/:id/questions",
    { preHandler: requirePermission("assessment.view") },
    async (request, reply) => {
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const frameworkId = await getAssessmentFrameworkId(request.params.id);
      if (!frameworkId) {
        return reply
          .code(404)
          .send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "questions.opened",
        entityType: "assessment",
        entityId: request.params.id,
        before: null,
        after: { assessmentId: request.params.id, frameworkId }
      });
      await ensureAssessmentQuestions(request.params.id, frameworkId);

      const framework = await pool.query(
        `select f.*, count(fc.id)::int as control_count
         from frameworks f
         left join framework_domains fd on fd.framework_id = f.id
         left join framework_controls fc on fc.framework_domain_id = fd.id
         where f.id = $1
         group by f.id`,
        [frameworkId]
      );
      const rows = await pool.query(
        `select fd.id as domain_id, fd.name as domain_name, fd.description as domain_description,
          fd.sort_order as domain_sort_order, fc.id as control_id, fc.control_code, fc.title,
          fc.description, fc.question_text, fc.evidence_examples, fc.default_weight,
          fc.readiness_pass_condition, fc.gap_condition,
          aq.id as assessment_question_id, aq.question_id, aq.answer_scale,
          aq.minimum_evidence_expected, aq.preferred_evidence_types, aq.gap_trigger,
          aq.question, ca.id as answer_id, ca.score, ca.answer_state, ca.evidence_status,
          ca.confidence_level, ca.notes, ca.updated_at,
          coalesce(
            json_agg(distinct jsonb_build_object(
              'controlId', mapped.id,
              'code', mapped.control_code,
              'title', mapped.title,
              'framework', mapped_framework.short_name,
              'mappingType', cm.mapping_type
            )) filter (where mapped.id is not null),
            '[]'::json
          ) as mappings
         from framework_domains fd
         join framework_controls fc on fc.framework_domain_id = fd.id
         join assessment_questions aq on aq.framework_control_id = fc.id and aq.assessment_id = $2
         left join control_answers ca on ca.assessment_question_id = aq.id
         left join control_mappings cm on cm.source_control_id = fc.id or cm.target_control_id = fc.id
         left join framework_controls mapped on mapped.id = case
           when cm.source_control_id = fc.id then cm.target_control_id
           else cm.source_control_id
         end
         left join framework_domains mapped_domain on mapped_domain.id = mapped.framework_domain_id
         left join frameworks mapped_framework on mapped_framework.id = mapped_domain.framework_id
         where fd.framework_id = $1
        group by fd.id, fc.id, aq.id, ca.id
         order by fd.sort_order, aq.sort_order, fc.sort_order`,
        [frameworkId, request.params.id]
      );

      const domains = new Map<string, Record<string, unknown>>();
      let totalControls = 0;
      let answeredControls = 0;
      for (const row of rows.rows) {
        totalControls += 1;
        const answered = row.answer_id !== null && (row.score !== null || row.answer_state !== "unknown");
        if (answered) {
          answeredControls += 1;
        }
        if (!domains.has(row.domain_id)) {
          domains.set(row.domain_id, {
            id: row.domain_id,
            name: row.domain_name,
            description: row.domain_description,
            totalControls: 0,
            answeredControls: 0,
            coverage: 0,
            questions: []
          });
        }
        const domain = domains.get(row.domain_id)!;
        domain.totalControls = Number(domain.totalControls) + 1;
        domain.answeredControls = Number(domain.answeredControls) + (answered ? 1 : 0);
        (domain.questions as unknown[]).push({
          questionId: row.assessment_question_id,
          sourceQuestionId: row.question_id,
          controlId: row.control_id,
          code: row.control_code,
          title: row.title,
          description: row.description,
          question: row.question,
          answerScale: row.answer_scale,
          minimumEvidenceExpected: row.minimum_evidence_expected,
          preferredEvidenceTypes: row.preferred_evidence_types,
          gapTrigger: row.gap_trigger,
          defaultWeight: Number(row.default_weight ?? 1),
          readinessPassCondition: row.readiness_pass_condition,
          gapCondition: row.gap_condition,
          evidenceExamples: row.evidence_examples,
          evidenceGap:
            row.score !== null &&
            Number(row.score) <= 2 &&
            !["received", "validated"].includes(String(row.evidence_status ?? "not_requested")),
          mappings: row.mappings,
          answer: row.answer_id
            ? {
                id: row.answer_id,
                score: row.score,
                answerState: row.answer_state,
                evidenceStatus: row.evidence_status,
                confidenceLevel: row.confidence_level,
                notes: row.notes,
                updatedAt: row.updated_at
              }
            : null
        });
      }
      const domainList = [...domains.values()].map((domain) => ({
        ...domain,
        coverage: coverage(Number(domain.answeredControls), Number(domain.totalControls))
      }));
      return {
        framework: mapFramework(framework.rows[0]),
        coverage: {
          totalControls,
          answeredControls,
          percentage: coverage(answeredControls, totalControls)
        },
        domains: domainList
      };
    }
  );

  app.put<{ Params: { id: string; controlId: string }; Body: AnswerBody }>(
    "/api/assessments/:id/questions/:controlId/answer",
    { preHandler: requireCsrfPermission("assessment.edit") },
    async (request, reply) => {
      const body = validateBody(answerSchema, request.body, reply);
      if (!body) return;
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const frameworkId = await getAssessmentFrameworkId(request.params.id);
      if (!frameworkId) {
        return reply
          .code(404)
          .send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      await ensureAssessmentQuestions(request.params.id, frameworkId);
      if (
        body.score !== null &&
        body.score !== undefined &&
        (!Number.isInteger(body.score) || body.score < 0 || body.score > 5)
      ) {
        return reply
          .code(400)
          .send({ code: "INVALID_SCORE", message: "Score must be an integer from 0 to 5" });
      }

      const question = await pool.query<{ id: string }>(
        `select aq.id
         from assessment_questions aq
         join framework_controls fc on fc.id = aq.framework_control_id
         join framework_domains fd on fd.id = fc.framework_domain_id
         where aq.assessment_id = $1
           and (aq.id::text = $2 or aq.question_id = $2 or aq.framework_control_id::text = $2)
           and fd.framework_id = $3`,
        [request.params.id, request.params.controlId, frameworkId]
      );
      if (!question.rows[0]) {
        return reply
          .code(404)
          .send({ code: "CONTROL_NOT_FOUND", message: "Control not found in assessment framework" });
      }

      const beforeResult = await pool.query(
        "select * from control_answers where assessment_question_id = $1",
        [question.rows[0].id]
      );
      const before = beforeResult.rows[0]
        ? {
            score: beforeResult.rows[0].score,
            evidenceStatus: beforeResult.rows[0].evidence_status,
            notes: beforeResult.rows[0].notes
          }
        : null;

      const answerId = beforeResult.rows[0]?.id ?? randomUUID();
      const result = await pool.query(
        `insert into control_answers
          (id, assessment_question_id, user_id, score, answer_state, evidence_status, confidence_level, notes)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (assessment_question_id) do update set
          user_id = excluded.user_id,
          score = excluded.score,
          answer_state = excluded.answer_state,
          evidence_status = excluded.evidence_status,
          confidence_level = excluded.confidence_level,
          notes = excluded.notes,
          updated_at = now()
         returning *`,
        [
          answerId,
          question.rows[0].id,
          request.user!.sub,
          body.score ?? null,
          body.answerState ?? "answered",
          body.evidenceStatus ?? "not_requested",
          body.confidenceLevel ?? "medium",
          body.notes ?? ""
        ]
      );
      const after = {
        score: result.rows[0].score,
        evidenceStatus: result.rows[0].evidence_status,
        notes: result.rows[0].notes
      };
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "control_answer.updated",
        entityType: "control_answer",
        entityId: result.rows[0].id,
        before,
        after
      });
      await ensureAutomaticRiskRegister(request.params.id);
      return {
        answer: {
          id: result.rows[0].id,
          score: result.rows[0].score,
          answerState: result.rows[0].answer_state,
          evidenceStatus: result.rows[0].evidence_status,
          confidenceLevel: result.rows[0].confidence_level,
          notes: result.rows[0].notes,
          updatedAt: result.rows[0].updated_at
        }
      };
    }
  );
}
