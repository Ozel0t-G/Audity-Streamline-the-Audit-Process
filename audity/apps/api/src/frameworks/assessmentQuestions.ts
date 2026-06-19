import { createHash } from "node:crypto";
import { pool } from "../db/client.js";

function stableUuid(input: string): string {
  const hash = createHash("sha256").update(input).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(
    16,
    20
  )}-${hash.slice(20, 32)}`;
}

async function getDefaultFramework(): Promise<{ id: string; label: string } | null> {
  const configuredKey = process.env.AUDITY_DEFAULT_FRAMEWORK_KEY;
  const configuredId = process.env.AUDITY_DEFAULT_FRAMEWORK_ID
    ?? (configuredKey ? stableUuid(`framework:${configuredKey}`) : null);
  const preferred = configuredId
    ? await pool.query<{ id: string; name: string; short_name: string | null; version: string | null }>(
        "select id, name, short_name, version from frameworks where id = $1 and archived_at is null limit 1",
        [configuredId]
      )
    : { rows: [] as Array<{ id: string; name: string; short_name: string | null; version: string | null }> };
  const fallback = preferred.rows[0]
    ? preferred
    : await pool.query<{ id: string; name: string; short_name: string | null; version: string | null }>(
        `select id, name, short_name, version
         from frameworks
         where archived_at is null
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

export async function getAssessmentFrameworkId(assessmentId: string): Promise<string | null> {
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

export async function ensureAssessmentQuestions(
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
