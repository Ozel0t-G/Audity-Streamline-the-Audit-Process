import crypto, { randomUUID } from "node:crypto";
import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import { appendActivityEvent } from "../activity/service.js";
import { requireCsrfPermission, requirePermission } from "../auth/hooks.js";
import { pool } from "../db/client.js";

type LogFilters = {
  userId?: string;
  assessmentId?: string;
  action?: string;
  entityType?: string;
  dateFrom?: string;
  dateTo?: string;
};

type InviteBody = {
  email?: string;
  name?: string;
  role?: string;
  password?: string;
};

type UserUpdateBody = {
  role?: string;
  status?: "active" | "disabled";
};

function csvCell(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  return [
    columns.map(csvCell).join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))
  ].join("\n");
}

function mapActivity(row: Record<string, unknown>) {
  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    before: row.before_value,
    after: row.after_value,
    prevHash: row.prev_hash,
    eventHash: row.event_hash,
    createdAt: row.created_at
  };
}

function mapAudit(row: Record<string, unknown>) {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    ip: row.ip,
    userAgent: row.user_agent,
    payload: row.payload,
    createdAt: row.created_at
  };
}

function activityWhere(filters: LogFilters): { where: string; values: unknown[] } {
  const clauses: string[] = [];
  const values: unknown[] = [];
  const add = (clause: string, ...nextValues: unknown[]) => {
    const indexes = nextValues.map((_, index) => `$${values.length + index + 1}`);
    let current = 0;
    clauses.push(clause.replace(/\?/g, () => indexes[current++]));
    values.push(...nextValues);
  };
  if (filters.userId) add("ual.user_id = ?", filters.userId);
  if (filters.assessmentId) {
    add(
      "(ual.entity_id = ? or ual.after_value->>'assessmentId' = ? or ual.after_value->>'assessment_id' = ?)",
      filters.assessmentId,
      filters.assessmentId,
      filters.assessmentId
    );
  }
  if (filters.action) add("ual.action = ?", filters.action);
  if (filters.entityType) add("ual.entity_type = ?", filters.entityType);
  if (filters.dateFrom) add("ual.created_at >= ?", filters.dateFrom);
  if (filters.dateTo) add("ual.created_at <= ?", filters.dateTo);
  return {
    where: clauses.length ? `where ${clauses.join(" and ")}` : "",
    values
  };
}

function stableJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function eventHash(row: {
  created_at: Date;
  user_id: string;
  action: string;
  entity_id: string;
  before_value: unknown;
  after_value: unknown;
  prev_hash: string | null;
}): string {
  const payload = stableJson({ before: row.before_value, after: row.after_value });
  return crypto
    .createHash("sha256")
    .update(
      row.created_at.toISOString() +
        row.user_id +
        row.action +
        row.entity_id +
        payload +
        (row.prev_hash ?? "")
    )
    .digest("hex");
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: LogFilters }>(
    "/api/admin/activity-logs",
    { preHandler: requirePermission("activitylog.view") },
    async (request) => {
      const { where, values } = activityWhere(request.query);
      const result = await pool.query(
        `select ual.*, u.email as user_email
         from user_activity_logs ual
         left join users u on u.id = ual.user_id
         ${where}
         order by ual.created_at desc
         limit 250`,
        values
      );
      return { activityLogs: result.rows.map(mapActivity) };
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/admin/activity-logs/:id",
    { preHandler: requirePermission("activitylog.view") },
    async (request, reply) => {
      const result = await pool.query(
        `select ual.*, u.email as user_email
         from user_activity_logs ual
         left join users u on u.id = ual.user_id
         where ual.id = $1`,
        [request.params.id]
      );
      if (!result.rows[0]) {
        return reply.code(404).send({ code: "ACTIVITY_LOG_NOT_FOUND", message: "Activity log not found" });
      }
      return { activityLog: mapActivity(result.rows[0]) };
    }
  );

  app.get<{ Querystring: LogFilters }>(
    "/api/admin/activity-logs/export",
    { preHandler: requirePermission("activitylog.view") },
    async (request, reply) => {
      const { where, values } = activityWhere(request.query);
      const result = await pool.query(
        `select ual.id, u.email as user_email, ual.action, ual.entity_type, ual.entity_id,
          ual.before_value, ual.after_value, ual.event_hash, ual.created_at
         from user_activity_logs ual
         left join users u on u.id = ual.user_id
         ${where}
         order by ual.created_at desc`,
        values
      );
      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", "attachment; filename=audity-activity-logs.csv");
      return toCsv(result.rows, [
        "id",
        "user_email",
        "action",
        "entity_type",
        "entity_id",
        "before_value",
        "after_value",
        "event_hash",
        "created_at"
      ]);
    }
  );

  app.get(
    "/api/admin/activity-logs/verify",
    { preHandler: requirePermission("activitylog.view") },
    async () => {
      const result = await pool.query<{
        id: string;
        user_id: string;
        action: string;
        entity_id: string;
        before_value: unknown;
        after_value: unknown;
        prev_hash: string | null;
        event_hash: string;
        created_at: Date;
      }>("select * from user_activity_logs order by created_at asc, id asc");

      let previous = "";
      let recomputeWarnings = 0;
      for (const row of result.rows) {
        if ((row.prev_hash ?? "") !== previous) {
          return { valid: false, brokenAt: row.id, reason: "prev_hash_mismatch" };
        }
        if (!/^[a-f0-9]{64}$/.test(row.event_hash)) {
          return { valid: false, brokenAt: row.id, reason: "event_hash_invalid" };
        }
        const recalculated = eventHash(row);
        if (recalculated !== row.event_hash) {
          recomputeWarnings += 1;
        }
        previous = row.event_hash;
      }
      return {
        valid: true,
        brokenAt: null,
        checked: result.rows.length,
        recomputeWarnings
      };
    }
  );

  app.get<{ Querystring: { action?: string; dateFrom?: string; dateTo?: string } }>(
    "/api/admin/audit-logs",
    { preHandler: requirePermission("auditlog.view") },
    async (request) => {
      const clauses: string[] = [];
      const values: unknown[] = [];
      if (request.query.action) {
        values.push(request.query.action);
        clauses.push(`al.action = $${values.length}`);
      }
      if (request.query.dateFrom) {
        values.push(request.query.dateFrom);
        clauses.push(`al.created_at >= $${values.length}`);
      }
      if (request.query.dateTo) {
        values.push(request.query.dateTo);
        clauses.push(`al.created_at <= $${values.length}`);
      }
      const result = await pool.query(
        `select al.*, u.email as actor_email
         from audit_logs al
         left join users u on u.id = al.actor_user_id
         ${clauses.length ? `where ${clauses.join(" and ")}` : ""}
         order by al.created_at desc
         limit 250`,
        values
      );
      return { auditLogs: result.rows.map(mapAudit) };
    }
  );

  app.get(
    "/api/admin/audit-logs/export",
    { preHandler: requirePermission("auditlog.view") },
    async (_request, reply) => {
      const result = await pool.query(
        `select al.id, u.email as actor_email, al.action, al.entity, al.entity_id,
          al.ip, al.user_agent, al.payload, al.created_at
         from audit_logs al
         left join users u on u.id = al.actor_user_id
         order by al.created_at desc`
      );
      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", "attachment; filename=audity-audit-logs.csv");
      return toCsv(result.rows, [
        "id",
        "actor_email",
        "action",
        "entity",
        "entity_id",
        "ip",
        "user_agent",
        "payload",
        "created_at"
      ]);
    }
  );

  app.get("/api/admin/users", { preHandler: requirePermission("roles.manage") }, async () => {
    const result = await pool.query(
      `select u.id, u.email, u.name, u.status, r.name as role, u.created_at, u.updated_at
       from users u
       join roles r on r.id = u.role_id
       order by u.created_at desc`
    );
    const roles = await pool.query("select id, name from roles order by name");
    return { users: result.rows, roles: roles.rows };
  });

  app.post<{ Body: InviteBody }>(
    "/api/admin/users/invite",
    { preHandler: requireCsrfPermission("users.invite") },
    async (request, reply) => {
      if (!request.body.email || !request.body.name || !request.body.role || !request.body.password) {
        return reply.code(400).send({ code: "INVALID_INPUT", message: "Email, name, role and temporary password are required" });
      }
      const role = await pool.query<{ id: string }>("select id from roles where name = $1", [request.body.role]);
      if (!role.rows[0]) {
        return reply.code(400).send({ code: "ROLE_NOT_FOUND", message: "Role not found" });
      }
      const passwordHash = await argon2.hash(request.body.password, { type: argon2.argon2id });
      const id = randomUUID();
      const result = await pool.query(
        `insert into users (id, email, name, password_hash, role_id)
         values ($1, lower($2), $3, $4, $5)
         returning id, email, name, status, created_at, updated_at`,
        [id, request.body.email, request.body.name, passwordHash, role.rows[0].id]
      );
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "user.invited",
        entityType: "user",
        entityId: id,
        before: null,
        after: { ...result.rows[0], role: request.body.role }
      });
      return reply.code(201).send({ user: { ...result.rows[0], role: request.body.role } });
    }
  );

  app.put<{ Params: { id: string }; Body: UserUpdateBody }>(
    "/api/admin/users/:id",
    { preHandler: requireCsrfPermission("roles.manage") },
    async (request, reply) => {
      const before = await pool.query(
        `select u.id, u.email, u.name, u.status, r.name as role
         from users u join roles r on r.id = u.role_id
         where u.id = $1`,
        [request.params.id]
      );
      if (!before.rows[0]) {
        return reply.code(404).send({ code: "USER_NOT_FOUND", message: "User not found" });
      }
      const role = request.body.role
        ? await pool.query<{ id: string }>("select id from roles where name = $1", [request.body.role])
        : null;
      if (request.body.role && !role?.rows[0]) {
        return reply.code(400).send({ code: "ROLE_NOT_FOUND", message: "Role not found" });
      }
      const result = await pool.query(
        `update users
         set role_id = coalesce($2, role_id),
             status = coalesce($3, status),
             updated_at = now()
         where id = $1
         returning id`,
        [request.params.id, role?.rows[0]?.id ?? null, request.body.status ?? null]
      );
      const after = await pool.query(
        `select u.id, u.email, u.name, u.status, r.name as role
         from users u join roles r on r.id = u.role_id
         where u.id = $1`,
        [result.rows[0].id]
      );
      const action = before.rows[0].role !== after.rows[0].role ? "role.changed" : "user.disabled";
      await appendActivityEvent({
        userId: request.user!.sub,
        action,
        entityType: "user",
        entityId: request.params.id,
        before: before.rows[0],
        after: after.rows[0]
      });
      return { user: after.rows[0] };
    }
  );
}
