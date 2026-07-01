import type { FastifyInstance } from "fastify";
import { Redis } from "ioredis";
import { requireAuth, requirePermission } from "../auth/hooks.js";
import { canAccessCustomer, canViewCustomerIncludingArchived } from "../customers/access.js";
import { loadConfig } from "../config.js";
import { pool } from "../db/client.js";
import { computePhase, deriveNextActions, isStuck, type AuditPhase, type NextAction } from "./actions.js";
import { loadThresholdsForAssessments, type StuckThresholds } from "./thresholds.js";
import { decodeCursor, paginate } from "./inboxPagination.js";

const config = loadConfig();
const cockpitCache = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 1,
  enableReadyCheck: false,
  lazyConnect: false
});
cockpitCache.on("error", () => undefined);
const CACHE_TTL_SECONDS = 300;

function cockpitCacheKey(customerId: string, userId: string): string {
  return `cockpit:${customerId}:${userId}`;
}

function inboxCacheKey(userId: string): string {
  return `cockpit-inbox:${userId}`;
}

export async function invalidateCockpitCache(
  options: { customerId?: string; assessmentId?: string } = {}
): Promise<void> {
  try {
    const patterns: string[] = [];
    if (options.customerId) {
      patterns.push(`cockpit:${options.customerId}:*`);
    } else if (options.assessmentId) {
      const result = await pool.query<{ customer_id: string }>(
        "select customer_id from assessments where id = $1",
        [options.assessmentId]
      );
      const customerId = result.rows[0]?.customer_id;
      if (customerId) patterns.push(`cockpit:${customerId}:*`);
    } else {
      patterns.push("cockpit:*");
    }
    patterns.push("cockpit-inbox:*");
    for (const pattern of patterns) {
      const stream = cockpitCache.scanStream({ match: pattern, count: 100 });
      for await (const keys of stream) {
        if (Array.isArray(keys) && keys.length) {
          await cockpitCache.del(...keys).catch(() => undefined);
        }
      }
    }
  } catch {
    // Cache invalidation is best-effort; ignore failures.
  }
}

type AssessmentRow = {
  id: string;
  type: string;
  audience: string | null;
  framework_id: string | null;
  framework_name: string | null;
  status: string;
  target_date: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  current_phase: string | null;
  readiness_target: number | null;
  audit_owner: string | null;
  reviewer: string | null;
  question_count: number;
  answered_count: number;
  finding_count: number;
  open_finding_count: number;
};

type CockpitAudit = {
  id: string;
  type: string;
  audience: string | null;
  framework: string | null;
  status: string;
  phase: AuditPhase;
  archivedAt: string | null;
  targetDate: string | null;
  updatedAt: string;
  readinessScore: number;
  readinessTarget: number;
  auditOwner: string | null;
  reviewer: string | null;
  questionCount: number;
  answeredCount: number;
  findingCount: number;
  openFindingCount: number;
  stuck: { stuck: boolean; days: number; threshold: number };
  thresholds: StuckThresholds;
};

function mapAssessment(row: AssessmentRow, thresholds: StuckThresholds): CockpitAudit {
  const questions = Number(row.question_count);
  const answered = Number(row.answered_count);
  const readinessScore = questions > 0 ? Math.round((answered / questions) * 100) : 0;
  return {
    id: row.id,
    type: row.type,
    audience: row.audience,
    framework: row.framework_name,
    status: row.status,
    phase: computePhase({ currentPhase: row.current_phase }, row.status),
    archivedAt: row.archived_at,
    targetDate: row.target_date,
    updatedAt: row.updated_at,
    readinessScore,
    readinessTarget: row.readiness_target ?? 85,
    auditOwner: row.audit_owner,
    reviewer: row.reviewer,
    questionCount: questions,
    answeredCount: answered,
    findingCount: Number(row.finding_count),
    openFindingCount: Number(row.open_finding_count),
    stuck: isStuck(row.updated_at, row.status, thresholds),
    thresholds
  };
}

async function loadCustomerAudits(customerId: string): Promise<CockpitAudit[]> {
  const result = await pool.query<AssessmentRow>(
    `select
        a.id, a.type, a.audience, a.framework_id, a.status, a.target_date::text,
        a.archived_at::text, a.created_at::text, a.updated_at::text,
        f.name as framework_name,
        ap.current_phase, ap.readiness_target, ap.audit_owner, ap.reviewer,
        (select count(*) from assessment_questions q where q.assessment_id = a.id)::int as question_count,
        (select count(*) from assessment_questions q
           join control_answers ca on ca.assessment_question_id = q.id
          where q.assessment_id = a.id and (ca.score is not null or ca.answer_state <> 'unknown'))::int as answered_count,
        (select count(*) from findings fnd where fnd.assessment_id = a.id)::int as finding_count,
        (select count(*) from findings fnd where fnd.assessment_id = a.id
           and fnd.status <> 'dismissed' and fnd.lifecycle_status not in ('closed','verified'))::int as open_finding_count
       from assessments a
       left join frameworks f on f.id = a.framework_id
       left join audit_plans ap on ap.assessment_id = a.id
      where a.customer_id = $1
      order by a.updated_at desc`,
    [customerId]
  );
  const thresholdMap = await loadThresholdsForAssessments(result.rows.map((r) => r.id));
  return result.rows.map((row) => {
    const thresholds = thresholdMap.get(row.id) ?? {
      fieldwork: 14,
      findings_response: 21,
      evidence_request: 14,
      remediation: 21
    };
    return mapAssessment(row, thresholds);
  });
}

type CockpitActivityRow = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  occurred_at: string;
  user_name: string | null;
};

async function loadActivity(customerId: string, limit = 10): Promise<CockpitActivityRow[]> {
  const result = await pool.query<CockpitActivityRow>(
    `select ae.id, ae.user_id, ae.action, ae.entity_type, ae.entity_id,
            ae.created_at::text as occurred_at, u.name as user_name
       from user_activity_logs ae
       left join users u on u.id = ae.user_id
      where ae.entity_id in (
              select id::text from assessments where customer_id = $1
              union select $1::text
            )
      order by ae.created_at desc
      limit $2`,
    [customerId, limit]
  );
  return result.rows;
}

async function loadShareTargets(customerId: string): Promise<Array<{ id: string; name: string | null; email: string }>> {
  const result = await pool.query<{ id: string; name: string | null; email: string }>(
    `select u.id, u.name, u.email
       from customer_shares s
       join users u on u.id = s.shared_with_user_id
      where s.customer_id = $1 and s.revoked_at is null`,
    [customerId]
  );
  return result.rows;
}

async function isOnboardingDismissed(userId: string, customerId: string): Promise<boolean> {
  const result = await pool.query<{ dismissed: boolean }>(
    "select dismissed from customer_onboarding_state where user_id = $1 and customer_id = $2",
    [userId, customerId]
  );
  return Boolean(result.rows[0]?.dismissed);
}

export async function registerCockpitRoutes(app: FastifyInstance): Promise<void> {
  // Centralized cache invalidation on any audit-center/customer/assessment mutation.
  // Matches plan/scope/control-profile/evidence-mapping/evidence-request/finding/signoff/report-review writes
  // plus high-level customer/assessment writes.
  app.addHook("onResponse", async (request, reply) => {
    if (reply.statusCode >= 400) return;
    const method = request.method.toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
    const url = request.url ?? "";
    const auditCenterMatch = url.match(/\/api\/assessments\/([0-9a-f-]{36})\/audit-center/i);
    if (auditCenterMatch) {
      await invalidateCockpitCache({ assessmentId: auditCenterMatch[1] });
      return;
    }
    const assessmentMatch = url.match(/\/api\/assessments\/([0-9a-f-]{36})(?:\b|\/)/i);
    if (assessmentMatch) {
      await invalidateCockpitCache({ assessmentId: assessmentMatch[1] });
      return;
    }
    const customerMatch = url.match(/\/api\/customers\/([0-9a-f-]{36})(?:\b|\/)/i);
    if (customerMatch) {
      await invalidateCockpitCache({ customerId: customerMatch[1] });
      return;
    }
  });

  app.get<{ Params: { id: string } }>(
    "/api/customers/:id/cockpit",
    { preHandler: requirePermission("assessment.view") },
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user!;
      if (!(await canViewCustomerIncludingArchived(user, id))) {
        return reply.code(404).send({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
      }
      const cacheKey = cockpitCacheKey(id, user.sub);
      try {
        const cached = await cockpitCache.get(cacheKey);
        if (cached) {
          reply.header("X-Cache", "HIT");
          return JSON.parse(cached);
        }
      } catch {
        // ignore cache errors
      }

      const customerResult = await pool.query(
        `select c.id, c.name, c.industry, c.business_criticality, c.regulatory_context,
                c.archived_at::text, c.archive_reason, c.created_by_user_id,
                u.name as created_by_name
           from customers c
           left join users u on u.id = c.created_by_user_id
          where c.id = $1`,
        [id]
      );
      const customerRow = customerResult.rows[0];
      if (!customerRow) {
        return reply.code(404).send({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
      }

      const [audits, activity, shareTargets, actions, onboardingDismissed] = await Promise.all([
        loadCustomerAudits(id),
        loadActivity(id),
        loadShareTargets(id),
        deriveNextActions(user, { customerId: id }),
        isOnboardingDismissed(user.sub, id)
      ]);

      const activeAudits = audits.filter((a) => a.status === "active").slice(0, 3);
      const draftAudits = audits.filter((a) => a.status === "draft");
      const importedAudits = audits.filter((a) => a.status === "imported");
      const completedAudits = audits.filter((a) => a.status === "completed");
      const archivedAudits = audits.filter((a) => a.archivedAt);

      const totalReadiness = activeAudits.length
        ? Math.round(activeAudits.reduce((sum, a) => sum + a.readinessScore, 0) / activeAudits.length)
        : 0;

      const executiveSummary = activeAudits.length
        ? `${activeAudits.length} active audit${activeAudits.length === 1 ? "" : "s"} · average readiness ${totalReadiness}%. ` +
          `${actions.length} open action${actions.length === 1 ? "" : "s"}.`
        : draftAudits.length
          ? `${draftAudits.length} audit${draftAudits.length === 1 ? "" : "s"} in preparation — complete the plan to activate.`
          : "No audit yet. Create the first audit to start.";

      const role: "auditor" | "reviewer" | "admin" =
        user.role === "Instance Admin" || user.role === "Tenant Admin"
          ? "admin"
          : user.permissions.includes("finding.approve")
            ? "reviewer"
            : "auditor";

      const showOnboarding =
        !onboardingDismissed && audits.length === 0 && !customerRow.archived_at;

      const payload = {
        customer: {
          id: customerRow.id,
          name: customerRow.name,
          industry: customerRow.industry,
          businessCriticality: customerRow.business_criticality,
          regulatoryContext: customerRow.regulatory_context,
          archivedAt: customerRow.archived_at,
          archiveReason: customerRow.archive_reason,
          createdByUserId: customerRow.created_by_user_id,
          createdByName: customerRow.created_by_name
        },
        meta: {
          role,
          totalReadiness,
          executiveSummary,
          showOnboarding,
          generatedAt: new Date().toISOString()
        },
        audits: {
          active: activeAudits,
          draft: draftAudits,
          imported: importedAudits,
          completed: completedAudits,
          archived: archivedAudits,
          totalCount: audits.length
        },
        nextActions: actions.slice(0, 12),
        stuck: activeAudits.filter((a) => a.stuck.stuck).map((a) => ({
          assessmentId: a.id,
          assessmentName: a.type,
          phase: a.phase,
          daysWithoutMovement: a.stuck.days,
          deepLink: `/customers/${id}?audit=${a.id}`
        })),
        team: {
          shareTargets,
          owner: customerRow.created_by_name
        },
        activity: activity.map((event) => ({
          id: event.id,
          action: event.action,
          entityType: event.entity_type,
          entityId: event.entity_id,
          actor: event.user_name,
          occurredAt: event.occurred_at
        }))
      };

      try {
        await cockpitCache.set(cacheKey, JSON.stringify(payload), "EX", CACHE_TTL_SECONDS);
      } catch {
        // ignore cache errors
      }
      reply.header("X-Cache", "MISS");
      return payload;
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/customers/:id/cockpit/dismiss-onboarding",
    { preHandler: requirePermission("assessment.view") },
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user!;
      if (!(await canAccessCustomer(user, id))) {
        return reply.code(404).send({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
      }
      await pool.query(
        `insert into customer_onboarding_state (user_id, customer_id, dismissed, dismissed_at)
         values ($1, $2, true, now())
         on conflict (user_id, customer_id) do update set dismissed = true, dismissed_at = excluded.dismissed_at`,
        [user.sub, id]
      );
      await invalidateCockpitCache({ customerId: id });
      return { status: "ok" };
    }
  );

  app.get<{ Querystring: { cursor?: string; limit?: string; overdueOnly?: string } }>(
    "/api/me/inbox",
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = request.user!;
      const cursor = decodeCursor(request.query.cursor);
      const rawLimit = Number(request.query.limit ?? "50");
      const limit = Math.min(100, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 50));
      const overdueOnly = request.query.overdueOnly === "true";

      // Cache the unpaginated action set per (user, overdueOnly).
      const baseKey = `${inboxCacheKey(user.sub)}:overdue=${overdueOnly ? "1" : "0"}`;
      let allActions: NextAction[];
      try {
        const cached = await cockpitCache.get(baseKey);
        if (cached) {
          reply.header("X-Cache", "HIT");
          allActions = JSON.parse(cached) as NextAction[];
        } else {
          allActions = await deriveNextActions(user);
          if (overdueOnly) {
            allActions = allActions.filter((a) => (a.overdueBy ?? 0) > 0);
          }
          await cockpitCache.set(baseKey, JSON.stringify(allActions), "EX", CACHE_TTL_SECONDS);
          reply.header("X-Cache", "MISS");
        }
      } catch {
        allActions = await deriveNextActions(user);
        if (overdueOnly) {
          allActions = allActions.filter((a) => (a.overdueBy ?? 0) > 0);
        }
      }

      const page = paginate(allActions, cursor, limit);
      return {
        meta: {
          totalCount: allActions.length,
          criticalCount: allActions.filter((a) => a.severity === "critical").length,
          warningCount: allActions.filter((a) => a.severity === "warning").length,
          pageSize: limit,
          returned: page.items.length,
          generatedAt: new Date().toISOString()
        },
        actions: groupByCustomer(page.items),
        pagination: {
          nextCursor: page.nextCursor,
          hasMore: page.hasMore
        }
      };
    }
  );

  app.get<{ Querystring: { customerId?: string } }>(
    "/api/me/next-action-count",
    { preHandler: requireAuth },
    async (request) => {
      const actions = await deriveNextActions(request.user!, {
        customerId: request.query.customerId
      });
      return {
        totalCount: actions.length,
        criticalCount: actions.filter((a) => a.severity === "critical").length,
        warningCount: actions.filter((a) => a.severity === "warning").length
      };
    }
  );
}

function groupByCustomer(actions: NextAction[]): Array<{
  customerId: string;
  customerName: string;
  actions: NextAction[];
}> {
  const map = new Map<string, { customerId: string; customerName: string; actions: NextAction[] }>();
  for (const action of actions) {
    const entry = map.get(action.customerId) ?? {
      customerId: action.customerId,
      customerName: action.customerName,
      actions: []
    };
    entry.actions.push(action);
    map.set(action.customerId, entry);
  }
  return Array.from(map.values());
}
