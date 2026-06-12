import { randomUUID } from "node:crypto";
import { pool } from "../db/client.js";

export function priorityForScore(score: number): string {
  if (score <= 1) return "high";
  return "medium";
}

export function ratingFor(likelihood = 1, impact = 1): { riskScore: number; rating: string } {
  const riskScore = likelihood * impact;
  if (riskScore >= 20) return { riskScore, rating: "Critical" };
  if (riskScore >= 12) return { riskScore, rating: "High" };
  if (riskScore >= 5) return { riskScore, rating: "Medium" };
  return { riskScore, rating: "Low" };
}

export async function ensureSuggestedFindings(assessmentId: string): Promise<void> {
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

export async function ensureAutomaticRiskRegister(assessmentId: string): Promise<void> {
  await ensureSuggestedFindings(assessmentId);
  const candidates = await pool.query<{
    finding_id: string;
    title: string;
    priority: string | null;
  }>(
    `select f.id as finding_id, f.title, f.priority
     from findings f
     left join risks r on r.finding_id = f.id
     where f.assessment_id = $1
       and f.status <> 'dismissed'
       and r.id is null`,
    [assessmentId]
  );

  for (const candidate of candidates.rows) {
    const likelihood = candidate.priority === "high" ? 4 : 3;
    const impact = candidate.priority === "high" ? 4 : 3;
    const { riskScore, rating } = ratingFor(likelihood, impact);
    await pool.query(
      `insert into risks
        (id, assessment_id, finding_id, title, likelihood, impact, risk_score, rating,
         treatment_option, owner, treatment_plan, due_date, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'mitigate', '', $9, null, 'open')`,
      [
        randomUUID(),
        assessmentId,
        candidate.finding_id,
        candidate.title,
        likelihood,
        impact,
        riskScore,
        rating,
        "Auto-created from guided question answers. Adjust owner, treatment and scoring as needed."
      ]
    );
  }
}
