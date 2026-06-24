import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendActivityEvent } from "../activity/service.js";
import { requireCsrfPermission, requirePermission } from "../auth/hooks.js";
import { isAdminRole } from "../customers/access.js";
import { pool } from "../db/client.js";

const workbenchKinds = [
  "evidence_request",
  "vendor",
  "asset",
  "policy",
  "exception",
  "dependency",
  "control_owner",
  "sla",
  "data_quality",
  "approval_task",
  "external_review",
  "framework_mapping",
  "customer_portal_task",
  "security_task",
  "health_alert",
  "license_note",
  "export_job",
  "ai_draft",
  "customer_comment",
  "internal_comment"
] as const;

const integrationKeys = ["sso", "scim", "mfa_enforcement", "delegated_admins", "customer_portal", "webhooks"] as const;

const recordSchema = z.object({
  kind: z.enum(workbenchKinds),
  title: z.string().trim().min(1).max(240),
  description: z.string().max(4000).optional(),
  status: z.string().trim().min(1).max(80).optional(),
  priority: z.string().trim().min(1).max(80).optional(),
  owner: z.string().max(240).nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  assessmentId: z.string().uuid().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  visibility: z.enum(["internal", "customer", "public_readonly"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const recordPatchSchema = recordSchema.partial().omit({ kind: true });

const savedViewSchema = z.object({
  name: z.string().trim().min(1).max(160),
  scope: z.string().trim().min(1).max(120),
  filters: z.record(z.string(), z.unknown()).optional(),
  columns: z.array(z.string()).optional(),
  shared: z.boolean().optional()
});

const templateSchema = z.object({
  name: z.string().trim().min(1).max(180),
  description: z.string().max(2000).optional(),
  frameworkId: z.string().uuid().nullable().optional(),
  defaultAudience: z.string().max(180).nullable().optional(),
  defaultLanguage: z.string().min(2).max(12).optional(),
  defaultDueDays: z.number().int().min(1).max(365).optional(),
  settings: z.record(z.string(), z.unknown()).optional()
});

const recurringSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  templateId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(180),
  cadence: z.enum(["monthly", "quarterly", "semiannual", "annual"]).optional(),
  nextRunDate: z.string().nullable().optional(),
  enabled: z.boolean().optional()
});

const approvalGateSchema = z.object({
  name: z.string().trim().min(1).max(180),
  entityType: z.string().trim().min(1).max(80),
  requiredRole: z.string().max(120).nullable().optional(),
  requiredApprovals: z.number().int().min(1).max(10).optional(),
  enabled: z.boolean().optional(),
  rules: z.record(z.string(), z.unknown()).optional()
});

const customFieldSchema = z.object({
  entityType: z.string().trim().min(1).max(80),
  fieldKey: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(160),
  fieldType: z.enum(["text", "number", "date", "select", "boolean", "user"]).optional(),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional()
});

const customStatusWorkflowSchema = z.object({
  entityType: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  statuses: z.array(z.string()).min(1).optional(),
  defaultStatus: z.string().max(80).nullable().optional(),
  enabled: z.boolean().optional()
});

const retentionPolicySchema = z.object({
  name: z.string().trim().min(1).max(160),
  entityType: z.string().trim().min(1).max(80),
  retentionDays: z.number().int().min(1).max(3650).optional(),
  legalHoldExempt: z.boolean().optional(),
  enabled: z.boolean().optional()
});

const legalHoldSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  assessmentId: z.string().uuid().nullable().optional(),
  reason: z.string().trim().min(1).max(2000),
  status: z.string().trim().min(1).max(80).optional(),
  approvedBy: z.string().max(180).nullable().optional(),
  expiresAt: z.string().nullable().optional()
});

const webhookSchema = z.object({
  name: z.string().trim().min(1).max(160),
  targetUrl: z.string().url(),
  events: z.array(z.string()).min(1).optional(),
  enabled: z.boolean().optional(),
  secret: z.string().max(256).optional()
});

const integrationSchema = z.object({
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional()
});

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw Object.assign(new Error("Request validation failed"), {
      statusCode: 400,
      code: "VALIDATION_ERROR"
    });
  }
  return result.data;
}

function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function mapRecord(row: Record<string, unknown>) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    owner: row.owner,
    customerId: row.customer_id,
    customerName: row.customer_name,
    assessmentId: row.assessment_id,
    assessmentType: row.assessment_type,
    dueDate: row.due_date,
    visibility: row.visibility,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function nullDate(value?: string | null): string | null {
  return value ? value : null;
}

async function ensureProductivityDefaults(userId: string) {
  // Previously this function force-shared all private saved_views on every call,
  // which clobbered tenant users' private views. Removed; defaults below only
  // insert new seed rows via ON CONFLICT DO NOTHING.
  await pool.query(
    `insert into assessment_templates (id, name, description, default_audience, default_due_days, settings, created_by)
     values
       ($1, 'Quarterly Security Review', 'Recurring quarterly assessment with evidence and risk review gates.', 'Internal security and customer stakeholders', 45, $2::jsonb, $3),
       ($4, 'External Customer Review', 'Read-only customer-facing review flow with evidence requests and report approval.', 'External customer reviewer', 30, $5::jsonb, $3)
     on conflict do nothing`,
    [
      "10000000-0000-4000-8000-000000000021",
      JSON.stringify({ reportTemplate: "Customer Summary", approvalGate: "Customer report approval" }),
      userId,
      "10000000-0000-4000-8000-000000000022",
      JSON.stringify({ portal: true, evidenceRequests: true })
    ]
  );
  await pool.query(
    `insert into approval_gates (id, name, entity_type, required_role, required_approvals, rules, created_by)
     values
       ($1, 'Risk approval gate', 'risk', 'Reviewer', 1, $2::jsonb, $4),
       ($3, 'Report approval gate', 'report', 'Assessment Manager', 2, $2::jsonb, $4)
     on conflict do nothing`,
    ["10000000-0000-4000-8000-000000000025", JSON.stringify({ blocksExportUntilApproved: true }), "10000000-0000-4000-8000-000000000026", userId]
  );
  for (const key of integrationKeys) {
    await pool.query(
      `insert into integration_settings (key, enabled, config, updated_by)
       values ($1, false, '{}'::jsonb, $2)
       on conflict (key) do nothing`,
      [key, userId]
    );
  }
}

async function createSeedRecord(userId: string, kind: string, title: string, description: string, metadata: Record<string, unknown> = {}) {
  await pool.query(
    `insert into workbench_records (id, kind, title, description, metadata, created_by, updated_by)
     values ($1, $2, $3, $4, $5::jsonb, $6, $6)
     on conflict do nothing`,
    [randomUUID(), kind, title, description, JSON.stringify(metadata), userId]
  );
}

async function ensureWorkbenchSeeds(userId: string) {
  const count = await pool.query<{ count: string }>("select count(*) from workbench_records");
  if (Number(count.rows[0]?.count ?? 0) > 0) return;
  await createSeedRecord(userId, "evidence_request", "Request certificate evidence", "Track an evidence request with owner, due date, and customer visibility.", { slaDays: 14, expires: true });
  await createSeedRecord(userId, "vendor", "Example supplier security review", "Vendor register item for third-party security tracking.", { category: "Supplier Register" });
  await createSeedRecord(userId, "asset", "Critical application inventory item", "Asset register item with owner, criticality, and dependency metadata.", { criticality: "High" });
  await createSeedRecord(userId, "policy", "Annual policy review", "Policy register item with owner and review date.", { versioned: true });
  await createSeedRecord(userId, "exception", "Temporary control exception", "Exception management item with approval and expiry tracking.", { requiresApproval: true });
}

async function analyticsSummary() {
  const [customers, assessments, risks, findings, evidence, records, connectorRuns, users, sessions] = await Promise.all([
    pool.query<{ count: string }>("select count(*) from customers where archived_at is null"),
    pool.query<{ count: string }>("select count(*) from assessments"),
    pool.query<{ count: string; critical: string; overdue: string }>(
      `select count(*)::text,
              count(*) filter (where rating = 'Critical')::text as critical,
              count(*) filter (where due_date < current_date and status not in ('closed', 'accepted'))::text as overdue
       from risks`
    ),
    pool.query<{ count: string; open: string }>("select count(*)::text, count(*) filter (where status not in ('approved','dismissed'))::text as open from findings"),
    pool.query<{ count: string }>("select count(*) from evidence_items where deleted_at is null"),
    pool.query<{ kind: string; count: string }>("select kind, count(*)::text from workbench_records group by kind order by kind"),
    pool.query<{ count: string; errors: string }>("select count(*)::text, count(*) filter (where status = 'error')::text as errors from connector_runs where created_at > now() - interval '30 days'"),
    pool.query<{ count: string }>("select count(*) from users where status = 'active'"),
    pool.query<{ count: string }>("select count(*) from sessions where revoked_at is null and expires_at > now()")
  ]);
  return {
    usage: {
      customers: Number(customers.rows[0]?.count ?? 0),
      assessments: Number(assessments.rows[0]?.count ?? 0),
      users: Number(users.rows[0]?.count ?? 0),
      activeSessions: Number(sessions.rows[0]?.count ?? 0),
      evidenceItems: Number(evidence.rows[0]?.count ?? 0)
    },
    risk: {
      total: Number(risks.rows[0]?.count ?? 0),
      critical: Number(risks.rows[0]?.critical ?? 0),
      overdue: Number(risks.rows[0]?.overdue ?? 0)
    },
    findings: {
      total: Number(findings.rows[0]?.count ?? 0),
      open: Number(findings.rows[0]?.open ?? 0)
    },
    workbench: records.rows.map((row) => ({ kind: row.kind, count: Number(row.count) })),
    connectors: {
      runs30d: Number(connectorRuns.rows[0]?.count ?? 0),
      errors30d: Number(connectorRuns.rows[0]?.errors ?? 0)
    }
  };
}

export async function registerProductivityRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { q?: string } }>("/api/search", { preHandler: requirePermission("assessment.view") }, async (request) => {
    const term = (request.query.q ?? "").trim();
    if (!term) return { results: [] };
    const canUseWorkbench = request.user!.permissions.includes("settings.manage");
    const q = `%${term}%`;
    // Scope every result to customers the user may access (owner or active share),
    // admins excepted — otherwise global search leaks customer/assessment/risk/
    // finding names across tenants regardless of access.
    const userId = request.user!.sub;
    const isAdmin = isAdminRole(request.user!.role);
    const access = `($2::boolean or c.created_by_user_id = $3 or exists (
      select 1 from customer_shares cs
      where cs.customer_id = c.id and cs.shared_with_user_id = $3 and cs.revoked_at is null
    ))`;
    const scoped = [q, isAdmin, userId];
    const [customers, assessments, risks, findings, reports, records] = await Promise.all([
      pool.query(
        `select 'Customer' as type, c.id::text, c.name as title, c.industry as subtitle, '/customers/' || c.id as url
         from customers c where c.archived_at is null and c.name ilike $1 and ${access} order by c.updated_at desc limit 8`,
        scoped
      ),
      pool.query(
        `select 'Assessment' as type, a.id::text, c.name || ' - ' || a.type as title, coalesce(a.framework, f.short_name, f.name, 'Assessment') as subtitle,
                '/assessments/' || a.id || '/questions' as url
         from assessments a
         join customers c on c.id = a.customer_id
         left join frameworks f on f.id = a.framework_id
         where (c.name ilike $1 or a.type ilike $1 or coalesce(a.framework, f.name, '') ilike $1) and ${access}
         order by a.updated_at desc limit 8`,
        scoped
      ),
      pool.query(
        `select 'Risk' as type, r.id::text, r.title, coalesce(r.rating, r.status) as subtitle,
                '/assessments/' || r.assessment_id || '/workflow' as url
         from risks r
         join assessments a on a.id = r.assessment_id
         join customers c on c.id = a.customer_id
         where r.title ilike $1 and ${access} order by r.updated_at desc limit 8`,
        scoped
      ),
      pool.query(
        `select 'Finding' as type, f.id::text, f.title, coalesce(f.priority, f.status) as subtitle,
                '/assessments/' || f.assessment_id || '/workflow' as url
         from findings f
         join assessments a on a.id = f.assessment_id
         join customers c on c.id = a.customer_id
         where f.title ilike $1 and ${access} order by f.updated_at desc limit 8`,
        scoped
      ),
      pool.query(
        `select 'Report' as type, rep.id::text, 'Report v' || rep.report_version as title, rep.status as subtitle,
                '/assessments/' || rep.assessment_id || '/assets' as url
         from reports rep
         join assessments a on a.id = rep.assessment_id
         join customers c on c.id = a.customer_id
         where (rep.status ilike $1 or rep.content::text ilike $1) and ${access} order by rep.updated_at desc limit 8`,
        scoped
      ),
      canUseWorkbench ? pool.query(
        `select 'Workbench' as type, id::text, title, kind as subtitle, '/admin/workbench?kind=' || kind as url
         from workbench_records where title ilike $1 or description ilike $1 or kind ilike $1 order by updated_at desc limit 8`,
        [q]
      ) : Promise.resolve({ rows: [] })
    ]);
    return { results: [...customers.rows, ...assessments.rows, ...risks.rows, ...findings.rows, ...reports.rows, ...records.rows] };
  });

  app.get<{ Querystring: { q?: string } }>("/api/command-palette", { preHandler: requirePermission("assessment.view") }, async (request) => {
    const search = await app.inject({
      method: "GET",
      url: `/api/search?q=${encodeURIComponent(request.query.q ?? "")}`,
      headers: { authorization: request.headers.authorization ?? "" }
    });
    const results = search.json().results ?? [];
    const canUseWorkbench = request.user!.permissions.includes("settings.manage");
    const actions = [
      { type: "Action", id: "new-customer", title: "Create customer", subtitle: "Open customer management", url: "/customers/my" },
      { type: "Action", id: "manual", title: "Open manual", subtitle: "Documentation and help", url: "/manual" },
      { type: "Action", id: "connectors", title: "Open connectors", subtitle: "Admin connector settings", url: "/admin/connectors" }
    ];
    if (canUseWorkbench) {
      actions.splice(1, 0, { type: "Action", id: "workbench", title: "Open workbench", subtitle: "Admin operations, automation and governance", url: "/admin/workbench" });
    }
    return {
      actions,
      results
    };
  });

  app.get("/api/workbench/overview", { preHandler: requirePermission("settings.manage") }, async (request) => {
    await ensureProductivityDefaults(request.user!.sub);
    await ensureWorkbenchSeeds(request.user!.sub);
    const [analytics, recent, savedViews, integrations] = await Promise.all([
      analyticsSummary(),
      pool.query(
        `select wr.*, c.name as customer_name, a.type as assessment_type
         from workbench_records wr
         left join customers c on c.id = wr.customer_id
         left join assessments a on a.id = wr.assessment_id
         order by wr.updated_at desc limit 20`
      ),
      pool.query("select * from saved_views order by updated_at desc limit 12"),
      pool.query("select key, enabled, config, updated_at from integration_settings order by key")
    ]);
    return {
      analytics,
      recent: recent.rows.map(mapRecord),
      savedViews: savedViews.rows,
      integrations: integrations.rows
    };
  });

  app.get<{ Querystring: { kind?: string; status?: string; q?: string } }>("/api/workbench/records", { preHandler: requirePermission("settings.manage") }, async (request) => {
    const params: unknown[] = [];
    const where: string[] = [];
    if (request.query.kind) {
      params.push(request.query.kind);
      where.push(`wr.kind = $${params.length}`);
    }
    if (request.query.status) {
      params.push(request.query.status);
      where.push(`wr.status = $${params.length}`);
    }
    if (request.query.q) {
      params.push(`%${request.query.q}%`);
      where.push(`(wr.title ilike $${params.length} or wr.description ilike $${params.length})`);
    }
    const result = await pool.query(
      `select wr.*, c.name as customer_name, a.type as assessment_type
       from workbench_records wr
       left join customers c on c.id = wr.customer_id
       left join assessments a on a.id = wr.assessment_id
       ${where.length ? `where ${where.join(" and ")}` : ""}
       order by wr.updated_at desc
       limit 200`,
      params
    );
    return { records: result.rows.map(mapRecord) };
  });

  app.post<{ Body: z.infer<typeof recordSchema> }>("/api/workbench/records", { preHandler: requireCsrfPermission("settings.manage") }, async (request) => {
    const body = parseBody(recordSchema, request.body);
    const id = randomUUID();
    const result = await pool.query(
      `insert into workbench_records
       (id, kind, title, description, status, priority, owner, customer_id, assessment_id, due_date, visibility, metadata, created_by, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$13)
       returning *`,
      [
        id,
        body.kind,
        body.title,
        body.description ?? "",
        body.status ?? "open",
        body.priority ?? "medium",
        body.owner ?? null,
        body.customerId ?? null,
        body.assessmentId ?? null,
        nullDate(body.dueDate),
        body.visibility ?? "internal",
        JSON.stringify(body.metadata ?? {}),
        request.user!.sub
      ]
    );
    await appendActivityEvent({ userId: request.user!.sub, action: "workbench.record.created", entityType: "workbench", entityId: id, before: null, after: result.rows[0] });
    return { record: mapRecord(result.rows[0]) };
  });

  app.patch<{ Params: { id: string }; Body: z.infer<typeof recordPatchSchema> }>("/api/workbench/records/:id", { preHandler: requireCsrfPermission("settings.manage") }, async (request, reply) => {
    const body = parseBody(recordPatchSchema, request.body);
    const before = await pool.query("select * from workbench_records where id = $1", [request.params.id]);
    if (!before.rows[0]) return reply.code(404).send({ code: "NOT_FOUND", message: "Record not found" });
        const result = await pool.query(
      `update workbench_records
       set title = $2, description = $3, status = $4, priority = $5, owner = $6,
           customer_id = $7, assessment_id = $8, due_date = $9, visibility = $10,
           metadata = $11::jsonb, updated_by = $12, updated_at = now()
       where id = $1 returning *`,
      [
        request.params.id,
        body.title ?? before.rows[0].title,
        body.description ?? before.rows[0].description,
        body.status ?? before.rows[0].status,
        body.priority ?? before.rows[0].priority,
        body.owner ?? before.rows[0].owner,
        body.customerId ?? before.rows[0].customer_id,
        body.assessmentId ?? before.rows[0].assessment_id,
        "dueDate" in body ? nullDate(body.dueDate) : before.rows[0].due_date,
        body.visibility ?? before.rows[0].visibility,
        JSON.stringify(body.metadata ?? before.rows[0].metadata ?? {}),
        request.user!.sub
      ]
    );
    await appendActivityEvent({ userId: request.user!.sub, action: "workbench.record.updated", entityType: "workbench", entityId: request.params.id, before: before.rows[0], after: result.rows[0] });
    return { record: mapRecord(result.rows[0]) };
  });

  app.delete<{ Params: { id: string } }>("/api/workbench/records/:id", { preHandler: requireCsrfPermission("settings.manage") }, async (request, reply) => {
    const result = await pool.query("delete from workbench_records where id = $1 returning *", [request.params.id]);
    if (!result.rows[0]) return reply.code(404).send({ code: "NOT_FOUND", message: "Record not found" });
    await appendActivityEvent({ userId: request.user!.sub, action: "workbench.record.deleted", entityType: "workbench", entityId: request.params.id, before: result.rows[0], after: null });
    return { status: "ok" };
  });

  app.post<{ Body: { ids?: string[]; status?: string; priority?: string; owner?: string } }>("/api/workbench/records/bulk", { preHandler: requireCsrfPermission("settings.manage") }, async (request) => {
    const body = parseBody(
      z.object({
        ids: z.array(z.string().uuid()).min(1).max(500),
        status: z.string().trim().min(1).max(80).optional(),
        priority: z.string().trim().min(1).max(80).optional(),
        owner: z.string().trim().max(240).optional()
      }),
      request.body
    );
    const result = await pool.query(
      `update workbench_records
       set status = coalesce($2, status), priority = coalesce($3, priority), owner = coalesce($4, owner),
           updated_by = $5, updated_at = now()
       where id = any($1::uuid[]) returning *`,
      [body.ids, body.status ?? null, body.priority ?? null, body.owner ?? null, request.user!.sub]
    );
    return { records: result.rows.map(mapRecord) };
  });

  app.get("/api/workbench/saved-views", { preHandler: requirePermission("settings.manage") }, async () => {
    const result = await pool.query("select * from saved_views order by updated_at desc");
    return { views: result.rows };
  });

  app.post<{ Body: z.infer<typeof savedViewSchema> }>("/api/workbench/saved-views", { preHandler: requireCsrfPermission("settings.manage") }, async (request) => {
    const body = parseBody(savedViewSchema, request.body);
    const result = await pool.query(
      `insert into saved_views (id, name, scope, filters, columns, owner_user_id, shared)
       values ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7) returning *`,
      [randomUUID(), body.name, body.scope, JSON.stringify(body.filters ?? {}), JSON.stringify(body.columns ?? []), request.user!.sub, true]
    );
    return { view: result.rows[0] };
  });

  app.delete<{ Params: { id: string } }>("/api/workbench/saved-views/:id", { preHandler: requireCsrfPermission("settings.manage") }, async (request, reply) => {
    const result = await pool.query("delete from saved_views where id = $1 returning id", [request.params.id]);
    if (!result.rows[0]) return reply.code(404).send({ code: "NOT_FOUND", message: "Saved view not found" });
    return { status: "ok" };
  });

  app.get("/api/workbench/analytics", { preHandler: requirePermission("settings.manage") }, async () => ({ analytics: await analyticsSummary() }));

  app.get("/api/admin/productivity/config", { preHandler: requirePermission("settings.manage") }, async () => {
    const [templates, recurring, gates, fields, workflows, retention, holds, webhooks, integrations, tokens] = await Promise.all([
      pool.query("select * from assessment_templates order by updated_at desc"),
      pool.query("select * from recurring_assessments order by updated_at desc"),
      pool.query("select * from approval_gates order by updated_at desc"),
      pool.query("select * from custom_fields order by updated_at desc"),
      pool.query("select * from custom_status_workflows order by updated_at desc"),
      pool.query("select * from retention_policies order by updated_at desc"),
      pool.query("select * from legal_holds order by updated_at desc"),
      pool.query("select id, name, target_url, events, enabled, last_status, last_message, last_called_at, created_at, updated_at from webhook_subscriptions order by updated_at desc"),
      pool.query("select key, enabled, config, updated_at from integration_settings order by key"),
      pool.query("select id, name, token_prefix, scopes, last_used_at, expires_at, revoked_at, created_at from public_api_tokens order by created_at desc")
    ]);
    return {
      templates: templates.rows,
      recurring: recurring.rows,
      approvalGates: gates.rows,
      customFields: fields.rows,
      statusWorkflows: workflows.rows,
      retentionPolicies: retention.rows,
      legalHolds: holds.rows,
      webhooks: webhooks.rows,
      integrations: integrations.rows,
      apiTokens: tokens.rows
    };
  });

  app.post<{ Body: z.infer<typeof templateSchema> }>("/api/admin/productivity/templates", { preHandler: requireCsrfPermission("settings.manage") }, async (request) => {
    const body = parseBody(templateSchema, request.body);
    const result = await pool.query(
      `insert into assessment_templates (id, name, description, framework_id, default_audience, default_language, default_due_days, settings, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) returning *`,
      [randomUUID(), body.name, body.description ?? "", body.frameworkId ?? null, body.defaultAudience ?? null, body.defaultLanguage ?? "en", body.defaultDueDays ?? 30, JSON.stringify(body.settings ?? {}), request.user!.sub]
    );
    return { template: result.rows[0] };
  });

  app.post<{ Body: z.infer<typeof recurringSchema> }>("/api/admin/productivity/recurring", { preHandler: requireCsrfPermission("settings.manage") }, async (request) => {
    const body = parseBody(recurringSchema, request.body);
    const result = await pool.query(
      `insert into recurring_assessments (id, customer_id, template_id, name, cadence, next_run_date, enabled, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [randomUUID(), body.customerId ?? null, body.templateId ?? null, body.name, body.cadence ?? "quarterly", nullDate(body.nextRunDate), body.enabled ?? true, request.user!.sub]
    );
    return { recurring: result.rows[0] };
  });

  app.post<{ Body: z.infer<typeof approvalGateSchema> }>("/api/admin/productivity/approval-gates", { preHandler: requireCsrfPermission("settings.manage") }, async (request) => {
    const body = parseBody(approvalGateSchema, request.body);
    const result = await pool.query(
      `insert into approval_gates (id, name, entity_type, required_role, required_approvals, enabled, rules, created_by)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) returning *`,
      [randomUUID(), body.name, body.entityType, body.requiredRole ?? null, body.requiredApprovals ?? 1, body.enabled ?? true, JSON.stringify(body.rules ?? {}), request.user!.sub]
    );
    return { approvalGate: result.rows[0] };
  });

  app.post<{ Body: z.infer<typeof customFieldSchema> }>("/api/admin/productivity/custom-fields", { preHandler: requireCsrfPermission("settings.manage") }, async (request) => {
    const body = parseBody(customFieldSchema, request.body);
    const result = await pool.query(
      `insert into custom_fields (id, entity_type, field_key, label, field_type, required, options, created_by)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
       on conflict (entity_type, field_key) do update set label = excluded.label, field_type = excluded.field_type, required = excluded.required, options = excluded.options, updated_at = now()
       returning *`,
      [randomUUID(), body.entityType, body.fieldKey, body.label, body.fieldType ?? "text", body.required ?? false, JSON.stringify(body.options ?? []), request.user!.sub]
    );
    return { customField: result.rows[0] };
  });

  app.post<{ Body: z.infer<typeof customStatusWorkflowSchema> }>("/api/admin/productivity/status-workflows", { preHandler: requireCsrfPermission("settings.manage") }, async (request) => {
    const body = parseBody(customStatusWorkflowSchema, request.body);
    const result = await pool.query(
      `insert into custom_status_workflows (id, entity_type, name, statuses, default_status, enabled, created_by)
       values ($1,$2,$3,$4::jsonb,$5,$6,$7) returning *`,
      [randomUUID(), body.entityType, body.name, JSON.stringify(body.statuses ?? ["draft", "review", "approved", "closed"]), body.defaultStatus ?? null, body.enabled ?? true, request.user!.sub]
    );
    return { workflow: result.rows[0] };
  });

  app.post<{ Body: z.infer<typeof retentionPolicySchema> }>("/api/admin/productivity/retention-policies", { preHandler: requireCsrfPermission("settings.manage") }, async (request) => {
    const body = parseBody(retentionPolicySchema, request.body);
    const result = await pool.query(
      `insert into retention_policies (id, name, entity_type, retention_days, legal_hold_exempt, enabled, created_by)
       values ($1,$2,$3,$4,$5,$6,$7) returning *`,
      [randomUUID(), body.name, body.entityType, body.retentionDays ?? 365, body.legalHoldExempt ?? true, body.enabled ?? true, request.user!.sub]
    );
    return { retentionPolicy: result.rows[0] };
  });

  app.post<{ Body: z.infer<typeof legalHoldSchema> }>("/api/admin/productivity/legal-holds", { preHandler: requireCsrfPermission("settings.manage") }, async (request) => {
    const body = parseBody(legalHoldSchema, request.body);
    const result = await pool.query(
      `insert into legal_holds (id, customer_id, assessment_id, reason, status, approved_by, expires_at, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [randomUUID(), body.customerId ?? null, body.assessmentId ?? null, body.reason, body.status ?? "active", body.approvedBy ?? null, nullDate(body.expiresAt), request.user!.sub]
    );
    return { legalHold: result.rows[0] };
  });

  app.post<{ Body: z.infer<typeof webhookSchema> }>("/api/admin/productivity/webhooks", { preHandler: requireCsrfPermission("settings.manage") }, async (request) => {
    const body = parseBody(webhookSchema, request.body);
    const result = await pool.query(
      `insert into webhook_subscriptions (id, name, target_url, events, enabled, secret_hash, created_by)
       values ($1,$2,$3,$4::jsonb,$5,$6,$7) returning id, name, target_url, events, enabled, last_status, last_message, created_at, updated_at`,
      [randomUUID(), body.name, body.targetUrl, JSON.stringify(body.events ?? ["assessment.updated"]), body.enabled ?? true, body.secret ? hashSecret(body.secret) : null, request.user!.sub]
    );
    return { webhook: result.rows[0] };
  });

  app.post<{ Params: { id: string } }>("/api/admin/productivity/webhooks/:id/test", { preHandler: requireCsrfPermission("settings.manage") }, async (request, reply) => {
    const webhook = await pool.query<{ target_url: string }>("select target_url from webhook_subscriptions where id = $1 and enabled = true", [request.params.id]);
    if (!webhook.rows[0]) return reply.code(404).send({ code: "NOT_FOUND", message: "Webhook not found" });
    try {
      const response = await fetch(webhook.rows[0].target_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "audity.webhook.test", sentAt: new Date().toISOString() })
      });
      await pool.query("update webhook_subscriptions set last_status = $2, last_message = $3, last_called_at = now(), updated_at = now() where id = $1", [
        request.params.id,
        response.ok ? "ok" : "error",
        `${response.status} ${response.statusText}`
      ]);
      return { status: response.ok ? "ok" : "error", message: `${response.status} ${response.statusText}` };
    } catch (error) {
      await pool.query("update webhook_subscriptions set last_status = 'error', last_message = $2, last_called_at = now(), updated_at = now() where id = $1", [request.params.id, error instanceof Error ? error.message : "Webhook test failed"]);
      return reply.code(502).send({ code: "WEBHOOK_FAILED", message: error instanceof Error ? error.message : "Webhook test failed" });
    }
  });

  app.post<{ Body: { name?: string; scopes?: string[]; expiresAt?: string | null } }>("/api/admin/productivity/api-tokens", { preHandler: requireCsrfPermission("settings.manage") }, async (request, reply) => {
    const body = parseBody(z.object({ name: z.string().trim().min(1).max(160), scopes: z.array(z.string()).optional(), expiresAt: z.string().nullable().optional() }), request.body);
    const token = `audity_${randomBytes(24).toString("base64url")}`;
    const result = await pool.query(
      `insert into public_api_tokens (id, name, token_hash, token_prefix, scopes, created_by, expires_at)
       values ($1,$2,$3,$4,$5::jsonb,$6,$7) returning id, name, token_prefix, scopes, expires_at, created_at`,
      [randomUUID(), body.name, hashSecret(token), token.slice(0, 14), JSON.stringify(body.scopes ?? ["read"]), request.user!.sub, body.expiresAt ?? null]
    );
    return reply.code(201).send({ apiToken: result.rows[0], token });
  });

  app.delete<{ Params: { id: string } }>("/api/admin/productivity/api-tokens/:id", { preHandler: requireCsrfPermission("settings.manage") }, async (request, reply) => {
    const result = await pool.query("update public_api_tokens set revoked_at = now() where id = $1 returning id", [request.params.id]);
    if (!result.rows[0]) return reply.code(404).send({ code: "NOT_FOUND", message: "API token not found" });
    return { status: "ok" };
  });

  app.put<{ Params: { key: string }; Body: z.infer<typeof integrationSchema> }>("/api/admin/productivity/integration-settings/:key", { preHandler: requireCsrfPermission("settings.manage") }, async (request, reply) => {
    if (!integrationKeys.includes(request.params.key as (typeof integrationKeys)[number])) {
      return reply.code(404).send({ code: "NOT_FOUND", message: "Integration setting not found" });
    }
    const body = parseBody(integrationSchema, request.body);
    const result = await pool.query(
      `insert into integration_settings (key, enabled, config, updated_by)
       values ($1,$2,$3::jsonb,$4)
       on conflict (key) do update set enabled = excluded.enabled, config = excluded.config, updated_by = excluded.updated_by, updated_at = now()
       returning key, enabled, config, updated_at`,
      [request.params.key, body.enabled ?? false, JSON.stringify(body.config ?? {}), request.user!.sub]
    );
    return { integration: result.rows[0] };
  });
}
