import type { FastifyInstance } from "fastify";
import { appendActivityEvent } from "../activity/service.js";
import { requireCsrfPermission, requirePermission } from "../auth/hooks.js";
import { canAccessAssessment, canAccessCustomer } from "../customers/access.js";
import { pool } from "../db/client.js";
import { invalidateCockpitCache } from "./routes.js";

type GateFailure = { field: string; message: string };

async function checkActiveGate(assessmentId: string): Promise<GateFailure[]> {
  const failures: GateFailure[] = [];

  const plan = await pool.query<{
    kickoff_at: string | null;
    audit_owner: string | null;
  }>(
    "select kickoff_at::text, audit_owner from audit_plans where assessment_id = $1",
    [assessmentId]
  );
  const planRow = plan.rows[0];
  if (!planRow) {
    failures.push({ field: "plan", message: "Audit plan missing — complete the Plan phase first." });
  } else {
    if (!planRow.kickoff_at) {
      failures.push({ field: "kickoff_at", message: "Kickoff date missing." });
    }
    if (!planRow.audit_owner || !planRow.audit_owner.trim()) {
      failures.push({ field: "audit_owner", message: "Audit owner missing." });
    }
  }

  const scope = await pool.query<{ count: string }>(
    "select count(*)::text as count from audit_scope_items where assessment_id = $1 and in_scope = true",
    [assessmentId]
  );
  if (Number(scope.rows[0]?.count ?? "0") < 1) {
    failures.push({ field: "scope", message: "At least 1 in-scope item required." });
  }

  return failures;
}

export async function registerTransitionRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>(
    "/api/assessments/:id/transition-eligibility",
    { preHandler: requirePermission("assessment.view") },
    async (request, reply) => {
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const failures = await checkActiveGate(request.params.id);
      const status = await pool.query<{ status: string }>(
        "select status from assessments where id = $1",
        [request.params.id]
      );
      return {
        currentStatus: status.rows[0]?.status ?? null,
        canPromoteToActive: failures.length === 0,
        gateFailures: failures
      };
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/assessments/:id/promote-to-active",
    { preHandler: requireCsrfPermission("assessment.edit") },
    async (request, reply) => {
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const current = await pool.query<{ status: string; customer_id: string }>(
        "select status, customer_id from assessments where id = $1",
        [request.params.id]
      );
      const row = current.rows[0];
      if (!row) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      if (row.status === "active") {
        return reply.code(409).send({ code: "ALREADY_ACTIVE", message: "Audit is already active." });
      }
      if (!["draft", "imported"].includes(row.status)) {
        return reply.code(409).send({
          code: "INVALID_STATUS",
          message: `Audit cannot be activated from status "${row.status}".`
        });
      }
      const failures = await checkActiveGate(request.params.id);
      if (failures.length) {
        return reply.code(422).send({
          code: "GATE_FAILED",
          message: "Audit cannot be activated.",
          failures
        });
      }
      const before = { status: row.status };
      await pool.query(
        "update assessments set status = 'active', updated_at = now() where id = $1",
        [request.params.id]
      );
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "assessment.promoted_to_active",
        entityType: "assessment",
        entityId: request.params.id,
        before,
        after: { status: "active" }
      }).catch(() => undefined);
      await invalidateCockpitCache({ customerId: row.customer_id });
      return { status: "active" };
    }
  );

  // Iter. 16 — Framework-Suggestions for the next audit, derived from legacy customer_frameworks
  // (now repurposed as "audit_suggestion") instead of the deprecated customer-level scope.
  app.get<{ Params: { id: string } }>(
    "/api/customers/:id/framework-suggestions",
    { preHandler: requirePermission("assessment.view") },
    async (request, reply) => {
      if (!(await canAccessCustomer(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
      }
      const result = await pool.query<{
        framework_id: string;
        framework_name: string;
        short_name: string | null;
        used_in_active: boolean;
      }>(
        `select cf.framework_id, f.name as framework_name, f.version as short_name,
                exists(
                  select 1 from assessments a
                   where a.customer_id = $1
                     and a.framework_id = cf.framework_id
                     and a.status in ('active','imported')
                ) as used_in_active
           from customer_frameworks cf
           join frameworks f on f.id = cf.framework_id
          where cf.customer_id = $1 and cf.deprecated_at is null`,
        [request.params.id]
      );
      // Suggestion ranking: not-yet-used frameworks first.
      const suggestions = result.rows
        .map((row) => ({
          frameworkId: row.framework_id,
          name: row.framework_name,
          shortName: row.short_name,
          usedInActive: row.used_in_active
        }))
        .sort((a, b) => Number(a.usedInActive) - Number(b.usedInActive));
      return {
        suggestions,
        note:
          "This list is derived from the (deprecated) customer-level framework scope. Frameworks now belong to the audit, not the customer."
      };
    }
  );

  app.post<{ Params: { id: string; frameworkId: string } }>(
    "/api/customers/:id/framework-suggestions/:frameworkId/deprecate",
    { preHandler: requireCsrfPermission("assessment.edit") },
    async (request, reply) => {
      if (!(await canAccessCustomer(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
      }
      const result = await pool.query(
        `update customer_frameworks
            set deprecated_at = now()
          where customer_id = $1 and framework_id = $2 and deprecated_at is null
          returning *`,
        [request.params.id, request.params.frameworkId]
      );
      if (!result.rowCount) {
        return reply.code(404).send({ code: "SUGGESTION_NOT_FOUND", message: "Suggestion not found" });
      }
      await invalidateCockpitCache({ customerId: request.params.id });
      return { status: "deprecated" };
    }
  );
}
