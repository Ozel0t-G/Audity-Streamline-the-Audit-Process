import { pool } from "../db/client.js";
import type { AuthenticatedUser } from "../auth/hooks.js";

export type NextAction = {
  id: string;
  kind:
    | "controls_awaiting_review"
    | "evidence_overdue"
    | "evidence_requested"
    | "finding_response_pending"
    | "finding_remediation_due"
    | "signoff_due"
    | "contradiction"
    | "report_review_due"
    | "customer_ack_pending";
  customerId: string;
  customerName: string;
  assessmentId: string;
  assessmentName: string;
  title: string;
  detail: string;
  count: number;
  overdueBy: number | null;
  deepLink: string;
  severity: "info" | "warning" | "critical";
};

export type AuditPhase =
  | "Setup"
  | "Plan"
  | "Fieldwork"
  | "Findings"
  | "Report"
  | "Sign-off"
  | "Closed";

type AssessmentForActions = {
  id: string;
  customer_id: string;
  customer_name: string;
  type: string;
  status: string;
  archived_at: string | null;
};

function pickRole(user: AuthenticatedUser): "reviewer" | "auditor" {
  if (user.permissions.includes("finding.approve")) return "reviewer";
  return "auditor";
}

async function loadAccessibleAssessments(
  user: AuthenticatedUser,
  scope: { customerId?: string }
): Promise<AssessmentForActions[]> {
  const isAdmin = user.role === "Instance Admin" || user.role === "Tenant Admin";
  const params: unknown[] = [];
  const conditions: string[] = ["a.archived_at is null"];
  if (!isAdmin) {
    params.push(user.sub);
    const userParam = `$${params.length}`;
    conditions.push(
      `(c.created_by_user_id = ${userParam} or exists (select 1 from customer_shares s where s.customer_id = c.id and s.shared_with_user_id = ${userParam} and s.revoked_at is null))`
    );
  }
  if (scope.customerId) {
    params.push(scope.customerId);
    conditions.push(`a.customer_id = $${params.length}`);
  }
  const result = await pool.query<AssessmentForActions>(
    `select a.id, a.customer_id, c.name as customer_name, a.type, a.status, a.archived_at
     from assessments a
     join customers c on c.id = a.customer_id
     where ${conditions.join(" and ")}
     order by a.updated_at desc`,
    params
  );
  return result.rows;
}

export async function deriveNextActions(
  user: AuthenticatedUser,
  scope: { customerId?: string } = {}
): Promise<NextAction[]> {
  const assessments = await loadAccessibleAssessments(user, scope);
  if (!assessments.length) return [];
  const activeAssessmentIds = assessments
    .filter((row) => row.status === "active")
    .map((row) => row.id);
  if (!activeAssessmentIds.length) return [];

  const role = pickRole(user);
  const actions: NextAction[] = [];

  if (role === "reviewer") {
    const reviewRows = await pool.query<{
      assessment_id: string;
      ready_count: string;
      draft_count: string;
    }>(
      `select assessment_id,
              count(*) filter (where review_status = 'ready_for_review')::text as ready_count,
              count(*) filter (where review_status in ('draft','changes_requested'))::text as draft_count
         from audit_control_profiles
        where assessment_id = any($1::uuid[])
        group by assessment_id`,
      [activeAssessmentIds]
    );
    for (const row of reviewRows.rows) {
      const ready = Number(row.ready_count);
      if (!ready) continue;
      const assessment = assessments.find((a) => a.id === row.assessment_id);
      if (!assessment) continue;
      actions.push({
        id: `review:${row.assessment_id}`,
        kind: "controls_awaiting_review",
        customerId: assessment.customer_id,
        customerName: assessment.customer_name,
        assessmentId: assessment.id,
        assessmentName: assessment.type,
        title: `${ready} control${ready === 1 ? "" : "s"} awaiting review`,
        detail: "Reviewer approval required",
        count: ready,
        overdueBy: null,
        deepLink: `/customers/${assessment.customer_id}/controls?audit=${assessment.id}&filter=ready_for_review`,
        severity: ready > 10 ? "warning" : "info"
      });
    }
  }

  // Aggregate overdue evidence per assessment in SQL (same shape as the findings query
  // below). The previous version fetched raw rows with `limit 50` and aggregated in JS,
  // which under-reported on instances with >50 open requests: assessments whose requests
  // fell outside the 50 most-overdue silently showed no "evidence overdue" action. The
  // overdue-day expression is unchanged (> 0 == the old `od <= 0 → skip`).
  const evidenceRows = await pool.query<{
    assessment_id: string;
    overdue_count: number;
    max_overdue: number;
  }>(
    `select assessment_id,
            count(*) filter (
              where due_date is not null
                and extract(day from (now() at time zone 'utc') - (due_date::timestamp)) > 0
            )::int as overdue_count,
            coalesce(max(extract(day from (now() at time zone 'utc') - (due_date::timestamp))) filter (
              where due_date is not null
                and extract(day from (now() at time zone 'utc') - (due_date::timestamp)) > 0
            ), 0)::int as max_overdue
       from audit_evidence_requests
      where assessment_id = any($1::uuid[])
        and status in ('open', 'requested')
      group by assessment_id`,
    [activeAssessmentIds]
  );

  for (const row of evidenceRows.rows) {
    if (row.overdue_count <= 0) continue;
    const assessment = assessments.find((a) => a.id === row.assessment_id);
    if (!assessment) continue;
    actions.push({
      id: `evidence_overdue:${row.assessment_id}`,
      kind: "evidence_overdue",
      customerId: assessment.customer_id,
      customerName: assessment.customer_name,
      assessmentId: row.assessment_id,
      assessmentName: assessment.type,
      title: `${row.overdue_count} evidence request${row.overdue_count === 1 ? "" : "s"} overdue`,
      detail: `Longest delay: ${row.max_overdue} day${row.max_overdue === 1 ? "" : "s"}`,
      count: row.overdue_count,
      overdueBy: row.max_overdue,
      deepLink: `/customers/${assessment.customer_id}/controls?audit=${row.assessment_id}&tab=requests`,
      severity: row.max_overdue > 7 ? "critical" : "warning"
    });
  }

  const findingRows = await pool.query<{
    assessment_id: string;
    pending_response: string;
    overdue_remediation: string;
  }>(
    `select f.assessment_id,
            count(*) filter (where coalesce(f.management_response_status,'pending') = 'pending')::text as pending_response,
            count(*) filter (where f.remediation_due_date is not null
                                and f.remediation_due_date < (now()::date)
                                and coalesce(f.remediation_status,'not_started') not in ('implemented','closed'))::text as overdue_remediation
       from findings f
      where f.assessment_id = any($1::uuid[])
      group by f.assessment_id`,
    [activeAssessmentIds]
  );
  for (const row of findingRows.rows) {
    const assessment = assessments.find((a) => a.id === row.assessment_id);
    if (!assessment) continue;
    const pending = Number(row.pending_response);
    if (pending > 0) {
      actions.push({
        id: `finding_response:${row.assessment_id}`,
        kind: "finding_response_pending",
        customerId: assessment.customer_id,
        customerName: assessment.customer_name,
        assessmentId: row.assessment_id,
        assessmentName: assessment.type,
        title: `${pending} finding${pending === 1 ? "" : "s"} awaiting response`,
        detail: "Management response pending",
        count: pending,
        overdueBy: null,
        deepLink: `/customers/${assessment.customer_id}/findings?audit=${row.assessment_id}&filter=response_pending`,
        severity: "warning"
      });
    }
    const overdueRemediation = Number(row.overdue_remediation);
    if (overdueRemediation > 0) {
      actions.push({
        id: `finding_remediation:${row.assessment_id}`,
        kind: "finding_remediation_due",
        customerId: assessment.customer_id,
        customerName: assessment.customer_name,
        assessmentId: row.assessment_id,
        assessmentName: assessment.type,
        title: `${overdueRemediation} remediation${overdueRemediation === 1 ? "" : "s"} overdue`,
        detail: "Re-test pending",
        count: overdueRemediation,
        overdueBy: null,
        deepLink: `/customers/${assessment.customer_id}/findings?audit=${row.assessment_id}&filter=remediation_overdue`,
        severity: "critical"
      });
    }
  }

  const contradictionRows = await pool.query<{ assessment_id: string; count: string }>(
    `select cp.assessment_id, count(*)::text
       from audit_control_profiles cp
       left join audit_evidence_mappings em
         on em.assessment_question_id = cp.assessment_question_id
        and em.assessment_id = cp.assessment_id
      where cp.assessment_id = any($1::uuid[])
        and cp.readiness_status = 'ready'
        and em.id is null
      group by cp.assessment_id`,
    [activeAssessmentIds]
  );
  for (const row of contradictionRows.rows) {
    const assessment = assessments.find((a) => a.id === row.assessment_id);
    if (!assessment) continue;
    const count = Number(row.count);
    if (!count) continue;
    actions.push({
      id: `contradiction:${row.assessment_id}`,
      kind: "contradiction",
      customerId: assessment.customer_id,
      customerName: assessment.customer_name,
      assessmentId: row.assessment_id,
      assessmentName: assessment.type,
      title: `${count} contradiction${count === 1 ? "" : "s"} detected`,
      detail: "Controls marked ready but missing mapped evidence",
      count,
      overdueBy: null,
      deepLink: `/customers/${assessment.customer_id}/controls?audit=${row.assessment_id}&filter=contradiction`,
      severity: "warning"
    });
  }

  const signoffRows = await pool.query<{ assessment_id: string; count: string }>(
    `select arr.assessment_id, count(*)::text
       from audit_report_reviews arr
      where arr.assessment_id = any($1::uuid[])
        and arr.status in ('customer_review', 'final')
      group by arr.assessment_id`,
    [activeAssessmentIds]
  );
  for (const row of signoffRows.rows) {
    const assessment = assessments.find((a) => a.id === row.assessment_id);
    if (!assessment) continue;
    const count = Number(row.count);
    if (!count) continue;
    actions.push({
      id: `signoff:${row.assessment_id}`,
      kind: "signoff_due",
      customerId: assessment.customer_id,
      customerName: assessment.customer_name,
      assessmentId: row.assessment_id,
      assessmentName: assessment.type,
      title: `Sign-off pending`,
      detail: `${count} report review${count === 1 ? "" : "s"} in sign-off state`,
      count,
      overdueBy: null,
      deepLink: `/customers/${assessment.customer_id}/report?audit=${row.assessment_id}`,
      severity: "warning"
    });
  }

  // Pending customer acknowledgments — severity ramps as the link approaches expiry.
  const ackRows = await pool.query<{
    assessment_id: string;
    token_id: string;
    recipient_email: string;
    expires_at: string;
    hours_remaining: number;
  }>(
    `select assessment_id, id as token_id, recipient_email, expires_at::text,
            extract(epoch from (expires_at - now())) / 3600 as hours_remaining
       from customer_ack_tokens
      where assessment_id = any($1::uuid[])
        and redeemed_at is null
        and revoked_at is null
        and expires_at > now()`,
    [activeAssessmentIds]
  );
  for (const row of ackRows.rows) {
    const assessment = assessments.find((a) => a.id === row.assessment_id);
    if (!assessment) continue;
    const hours = Number(row.hours_remaining ?? 0);
    let severity: NextAction["severity"] = "info";
    if (hours < 24) severity = "critical";
    else if (hours < 72) severity = "warning";
    actions.push({
      id: `customer_ack:${row.token_id}`,
      kind: "customer_ack_pending",
      customerId: assessment.customer_id,
      customerName: assessment.customer_name,
      assessmentId: row.assessment_id,
      assessmentName: assessment.type,
      title: `Customer ack pending: ${row.recipient_email}`,
      detail: hours < 24
        ? `Expires in ${Math.max(0, Math.floor(hours))}h — resend or follow up`
        : `Expires in ${Math.floor(hours / 24)}d`,
      count: 1,
      overdueBy: null,
      deepLink: `/customers/${assessment.customer_id}/report?audit=${row.assessment_id}`,
      severity
    });
  }

  actions.sort((a, b) => {
    const sev = { critical: 0, warning: 1, info: 2 } as const;
    if (sev[a.severity] !== sev[b.severity]) return sev[a.severity] - sev[b.severity];
    return (b.overdueBy ?? 0) - (a.overdueBy ?? 0);
  });

  return actions;
}

export function computePhase(plan: { currentPhase?: string | null } | null, status: string): AuditPhase {
  if (status === "completed") return "Closed";
  if (status === "draft") return "Setup";
  if (!plan) return "Setup";
  const raw = String(plan.currentPhase ?? "").toLowerCase();
  if (raw.includes("kickoff") || raw.includes("preparation")) return "Plan";
  if (raw.includes("evidence") || raw.includes("interview") || raw.includes("review") || raw.includes("fieldwork")) return "Fieldwork";
  if (raw.includes("finding")) return "Findings";
  if (raw.includes("report")) return "Report";
  if (raw.includes("sign") || raw.includes("closure")) return "Sign-off";
  return "Plan";
}

import { HARDCODED_DEFAULTS, evaluateStuck, type StuckThresholds } from "./thresholds.js";

/**
 * Backwards-compatible isStuck (cockpit display layer).
 * Prefer evaluateStuck(updatedAt, status, thresholds) for new code so per-audit overrides apply.
 */
export function isStuck(
  updatedAt: string | Date,
  status: string,
  thresholds?: StuckThresholds
): { stuck: boolean; days: number; threshold: number } {
  const effective = thresholds ?? HARDCODED_DEFAULTS;
  const evaluation = evaluateStuck(updatedAt, status, effective, "fieldwork");
  return { stuck: evaluation.stuck, days: evaluation.days, threshold: evaluation.threshold };
}
