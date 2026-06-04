import crypto, { randomUUID } from "node:crypto";
import argon2 from "argon2";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendActivityEvent } from "../activity/service.js";
import { requireCsrf, requireCsrfPermission, requirePermission } from "../auth/hooks.js";
import { pool } from "../db/client.js";
import { backupQueue } from "../jobs/queue.js";
import { signedBackupGetUrl } from "../storage/service.js";
import { validateBody } from "../utils/validation.js";

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

const backupTriggerSchema = z.object({
  jobType: z.enum(["full", "database", "evidence"]).optional()
});

const backupSettingsSchema = z.object({
  automaticBackupsEnabled: z.boolean(),
  backupType: z.enum(["full", "database", "evidence"]),
  includeDatabase: z.boolean(),
  includeEvidenceFiles: z.boolean(),
  includeReports: z.boolean(),
  includeFrameworkImports: z.boolean(),
  includeAuditLogs: z.boolean(),
  includeActivityLogs: z.boolean(),
  includeSystemSettings: z.boolean(),
  includeNotifications: z.boolean(),
  scheduleTimezone: z.string().trim().min(1).max(80),
  scheduleCron: z.string().trim().min(3).max(120),
  retentionDays: z.number().int().min(1).max(3650)
});

const restorePrecheckSchema = z.object({
  backupJobId: z.string().uuid(),
  passwordProvided: z.boolean().optional()
});

const restoreStartSchema = z.object({
  backupJobId: z.string().uuid(),
  confirmationPhrase: z.literal("RESTORE AUDITY"),
  passwordProvided: z.boolean().optional()
});

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1),
  role: z.string().trim().min(1),
  password: z.string().min(8)
});

const userUpdateSchema = z.object({
  role: z.string().optional(),
  status: z.enum(["active", "disabled"]).optional()
});

const systemSettingsSchema = z.object({
  sessionIdleTimeoutMinutes: z.union([
    z.literal(5),
    z.literal(10),
    z.literal(15),
    z.literal(20),
    z.literal(25),
    z.literal(30),
    z.literal(35),
    z.literal(40),
    z.literal(45),
    z.literal(50),
    z.literal(55),
    z.literal(60)
  ])
});

function mapBackup(row: Record<string, unknown>) {
  return {
    id: row.id,
    jobType: row.job_type,
    source: row.source,
    status: row.status,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
    failureReason: row.failure_reason,
    storageLocation: row.storage_location,
    downloadExpiresAt: row.download_expires_at,
    isDownloadableZip: row.is_downloadable_zip,
    backupManifest: row.backup_manifest,
    metadata: row.metadata ?? {}
  };
}

function mapBackupSettings(row: Record<string, unknown> | undefined) {
  return {
    automaticBackupsEnabled: Boolean(row?.automatic_backups_enabled ?? false),
    backupType: (row?.backup_type as string | undefined) ?? "full",
    includeDatabase: Boolean(row?.include_database ?? true),
    includeEvidenceFiles: Boolean(row?.include_evidence_files ?? true),
    includeReports: Boolean(row?.include_reports ?? true),
    includeFrameworkImports: Boolean(row?.include_framework_imports ?? true),
    includeAuditLogs: Boolean(row?.include_audit_logs ?? true),
    includeActivityLogs: Boolean(row?.include_activity_logs ?? true),
    includeSystemSettings: Boolean(row?.include_system_settings ?? true),
    includeNotifications: Boolean(row?.include_notifications ?? true),
    scheduleTimezone: (row?.schedule_timezone as string | undefined) ?? "Europe/Oslo",
    scheduleCron: (row?.schedule_cron as string | undefined) ?? "0 2 * * *",
    retentionDays: Number(row?.retention_days ?? 30),
    updatedAt: row?.updated_at ?? null
  };
}

function randomBackupPassword(): string {
  return crypto.randomBytes(18).toString("base64url");
}

async function syncBackupScheduler(settings: z.infer<typeof backupSettingsSchema>): Promise<void> {
  const schedulerId = "audity-scheduled-backup";
  if (!settings.automaticBackupsEnabled) {
    await backupQueue.removeJobScheduler(schedulerId);
    return;
  }
  await backupQueue.upsertJobScheduler(
    schedulerId,
    {
      pattern: settings.scheduleCron,
      tz: settings.scheduleTimezone
    },
    {
      name: "run-backup",
      data: {
        jobType: settings.backupType,
        source: "automatic"
      },
      opts: {
        attempts: 1,
        removeOnComplete: 50,
        removeOnFail: 100
      }
    }
  );
}

const adminRoles = new Set(["Instance Admin", "Tenant Admin"]);

function requireAdminPermission(permission: string) {
  const permissionHandler = requirePermission(permission);
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await permissionHandler(request, reply);
    if (reply.sent) {
      return;
    }
    if (!request.user || !adminRoles.has(request.user.role)) {
      await reply
        .code(403)
        .send({ code: "ADMIN_ROLE_REQUIRED", message: "Admin role required" });
    }
  };
}

async function requireInstanceAdminCsrf(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireCsrf(request, reply);
  if (reply.sent) return;
  if (request.user?.role !== "Instance Admin") {
    await reply
      .code(403)
      .send({ code: "INSTANCE_ADMIN_REQUIRED", message: "Instance Admin role required" });
  }
}

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
  app.get(
    "/api/admin/system-settings",
    { preHandler: requireAdminPermission("settings.manage") },
    async () => {
      const result = await pool.query<{ value: number }>(
        "select (value #>> '{}')::int as value from settings where key = 'session_idle_timeout_minutes'"
      );
      return { sessionIdleTimeoutMinutes: result.rows[0]?.value ?? 30 };
    }
  );

  app.patch<{ Body: { sessionIdleTimeoutMinutes: number } }>(
    "/api/admin/system-settings",
    { preHandler: requireCsrfPermission("settings.manage") },
    async (request, reply) => {
      const body = validateBody(systemSettingsSchema, request.body, reply);
      if (!body) return;
      if (request.user?.role !== "Instance Admin" && request.user?.role !== "Tenant Admin") {
        return reply.code(403).send({ code: "ADMIN_ROLE_REQUIRED", message: "Admin role required" });
      }
      const previous = await pool.query<{ value: number }>(
        "select (value #>> '{}')::int as value from settings where key = 'session_idle_timeout_minutes'"
      );
      const oldValue = previous.rows[0]?.value ?? 30;
      await pool.query(
        `insert into settings (key, value, updated_at)
         values ('session_idle_timeout_minutes', $1::jsonb, now())
         on conflict (key) do update set value = excluded.value, updated_at = now()`,
        [JSON.stringify(body.sessionIdleTimeoutMinutes)]
      );
      await pool.query(
        `insert into audit_logs (id, actor_user_id, action, entity, entity_id, ip, user_agent, payload)
         values ($1,$2,'system.session_timeout.updated','settings','session_idle_timeout_minutes',$3,$4,$5)`,
        [
          randomUUID(),
          request.user!.sub,
          request.ip,
          request.headers["user-agent"] ?? null,
          JSON.stringify({ oldValue, newValue: body.sessionIdleTimeoutMinutes })
        ]
      );
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "system.session_timeout.updated",
        entityType: "settings",
        entityId: "session_idle_timeout_minutes",
        before: { value: oldValue },
        after: { value: body.sessionIdleTimeoutMinutes }
      });
      return { sessionIdleTimeoutMinutes: body.sessionIdleTimeoutMinutes };
    }
  );

  async function listBackups(limit = 50) {
    const result = await pool.query(
      `select * from backup_jobs
       order by coalesce(created_at, started_at, finished_at, now()) desc, id desc
       limit $1`,
      [limit]
    );
    return result.rows.map(mapBackup);
  }

  async function createBackupJob(input: {
    jobType: "full" | "database" | "evidence";
    userId: string;
    source: "manual" | "manual_download_zip";
    downloadableZip?: boolean;
    downloadPassword?: string;
  }) {
    const running = await pool.query(
      "select id from backup_jobs where job_type = 'full' and status in ('queued','running') limit 1"
    );
    if (input.jobType === "full" && running.rows[0]) {
      const error = new Error("A full backup is already queued or running.");
      (error as Error & { statusCode?: number }).statusCode = 409;
      throw error;
    }
    const id = randomUUID();
    await pool.query(
      `insert into backup_jobs
        (id, job_type, source, status, started_at, created_by_user_id, is_downloadable_zip, metadata)
       values ($1, $2, $3, 'queued', now(), $4, $5, $6::jsonb)`,
      [
        id,
        input.jobType,
        input.source,
        input.userId,
        Boolean(input.downloadableZip),
        JSON.stringify({
          requestedBy: input.userId,
          requestedAt: new Date().toISOString(),
          downloadPasswordShownOnce: Boolean(input.downloadableZip)
        })
      ]
    );
    const job = await backupQueue.add("run-backup", {
      backupJobId: id,
      jobType: input.jobType,
      userId: input.userId,
      source: input.source,
      downloadableZip: Boolean(input.downloadableZip),
      downloadPassword: input.downloadPassword
    });
    await appendActivityEvent({
      userId: input.userId,
      action: input.downloadableZip ? "backup.download_requested" : "backup.triggered",
      entityType: "backup_job",
      entityId: id,
      before: null,
      after: { backupJobId: id, jobType: input.jobType, source: input.source, queueJobId: job.id }
    });
    return { backupJobId: id, queueJobId: job.id };
  }

  app.get(
    "/api/admin/backups",
    { preHandler: requireAdminPermission("backup.manage") },
    async () => {
      const backupJobs = await listBackups();
      return {
        latestBackup: backupJobs[0] ?? null,
        backupJobs
      };
    }
  );

  app.get(
    "/api/admin/backup/status",
    { preHandler: requireAdminPermission("backup.manage") },
    async () => {
      const backupJobs = await listBackups(20);
      return {
        latestBackup: backupJobs[0] ?? null,
        backupJobs
      };
    }
  );

  app.post<{ Body: { jobType?: "full" | "database" | "evidence" } }>(
    "/api/admin/backups/manual",
    { preHandler: requireInstanceAdminCsrf },
    async (request, reply) => {
      const body = validateBody(backupTriggerSchema, request.body ?? {}, reply);
      if (!body) return;
      try {
        const result = await createBackupJob({
          jobType: body.jobType ?? "full",
          userId: request.user!.sub,
          source: "manual"
        });
        return reply.code(202).send(result);
      } catch (error) {
        return reply
          .code((error as Error & { statusCode?: number }).statusCode ?? 500)
          .send({ code: "BACKUP_QUEUE_FAILED", message: error instanceof Error ? error.message : "Backup queue failed" });
      }
    }
  );

  app.post<{ Body: { jobType?: "full" | "database" | "evidence" } }>(
    "/api/admin/backups/manual-download-zip",
    { preHandler: requireInstanceAdminCsrf },
    async (request, reply) => {
      const body = validateBody(backupTriggerSchema, request.body ?? {}, reply);
      if (!body) return;
      const downloadPassword = randomBackupPassword();
      try {
        const result = await createBackupJob({
          jobType: body.jobType ?? "full",
          userId: request.user!.sub,
          source: "manual_download_zip",
          downloadableZip: true,
          downloadPassword
        });
        return reply.code(202).send({
          ...result,
          downloadPassword,
          passwordNotice: "This password is shown once and is required to open the encrypted backup package."
        });
      } catch (error) {
        return reply
          .code((error as Error & { statusCode?: number }).statusCode ?? 500)
          .send({ code: "BACKUP_QUEUE_FAILED", message: error instanceof Error ? error.message : "Backup queue failed" });
      }
    }
  );

  app.post<{ Body: { jobType?: "full" | "database" | "evidence" } }>(
    "/api/admin/backup/trigger",
    { preHandler: requireInstanceAdminCsrf },
    async (request, reply) => {
      const body = validateBody(backupTriggerSchema, request.body ?? {}, reply);
      if (!body) return;
      try {
        const result = await createBackupJob({
          jobType: body.jobType ?? "full",
          userId: request.user!.sub,
          source: "manual"
        });
        return reply.code(202).send(result);
      } catch (error) {
        return reply
          .code((error as Error & { statusCode?: number }).statusCode ?? 500)
          .send({ code: "BACKUP_QUEUE_FAILED", message: error instanceof Error ? error.message : "Backup queue failed" });
      }
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/admin/backups/:id/manifest",
    { preHandler: requireAdminPermission("backup.manage") },
    async (request, reply) => {
      const result = await pool.query("select backup_manifest from backup_jobs where id = $1", [request.params.id]);
      if (!result.rows[0]) {
        return reply.code(404).send({ code: "BACKUP_NOT_FOUND", message: "Backup not found" });
      }
      return { manifest: result.rows[0].backup_manifest ?? null };
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/admin/backups/:id/download",
    { preHandler: requireAdminPermission("backup.manage") },
    async (request, reply) => {
      const result = await pool.query(
        "select status, download_expires_at, metadata from backup_jobs where id = $1",
        [request.params.id]
      );
      const backup = result.rows[0];
      if (!backup) {
        return reply.code(404).send({ code: "BACKUP_NOT_FOUND", message: "Backup not found" });
      }
      if (backup.status !== "completed") {
        return reply.code(409).send({ code: "BACKUP_NOT_READY", message: "Backup is not completed yet" });
      }
      if (backup.download_expires_at && new Date(backup.download_expires_at).getTime() < Date.now()) {
        return reply.code(410).send({ code: "BACKUP_DOWNLOAD_EXPIRED", message: "Backup download has expired" });
      }
      const objectKey = backup.metadata?.downloadObjectKey;
      if (typeof objectKey !== "string") {
        return reply.code(404).send({ code: "BACKUP_PACKAGE_NOT_FOUND", message: "Download package not found" });
      }
      return {
        downloadUrl: await signedBackupGetUrl(objectKey),
        expiresInSeconds: 600,
        objectKey
      };
    }
  );

  app.get(
    "/api/admin/backup-settings",
    { preHandler: requireAdminPermission("backup.manage") },
    async () => {
      const result = await pool.query("select * from backup_settings where id = 'default'");
      return { backupSettings: mapBackupSettings(result.rows[0]) };
    }
  );

  app.patch<{ Body: z.infer<typeof backupSettingsSchema> }>(
    "/api/admin/backup-settings",
    { preHandler: requireInstanceAdminCsrf },
    async (request, reply) => {
      const body = validateBody(backupSettingsSchema, request.body, reply);
      if (!body) return;
      await pool.query(
        `insert into backup_settings
          (id, automatic_backups_enabled, backup_type, include_database, include_evidence_files,
           include_reports, include_framework_imports, include_audit_logs, include_activity_logs,
           include_system_settings, include_notifications, schedule_timezone, schedule_cron,
           retention_days, updated_by_user_id, updated_at)
         values ('default',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())
         on conflict (id) do update set
           automatic_backups_enabled = excluded.automatic_backups_enabled,
           backup_type = excluded.backup_type,
           include_database = excluded.include_database,
           include_evidence_files = excluded.include_evidence_files,
           include_reports = excluded.include_reports,
           include_framework_imports = excluded.include_framework_imports,
           include_audit_logs = excluded.include_audit_logs,
           include_activity_logs = excluded.include_activity_logs,
           include_system_settings = excluded.include_system_settings,
           include_notifications = excluded.include_notifications,
           schedule_timezone = excluded.schedule_timezone,
           schedule_cron = excluded.schedule_cron,
           retention_days = excluded.retention_days,
           updated_by_user_id = excluded.updated_by_user_id,
           updated_at = now()`,
        [
          body.automaticBackupsEnabled,
          body.backupType,
          body.includeDatabase,
          body.includeEvidenceFiles,
          body.includeReports,
          body.includeFrameworkImports,
          body.includeAuditLogs,
          body.includeActivityLogs,
          body.includeSystemSettings,
          body.includeNotifications,
          body.scheduleTimezone,
          body.scheduleCron,
          body.retentionDays,
          request.user!.sub
        ]
      );
      await syncBackupScheduler(body);
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "backup.settings.updated",
        entityType: "backup_settings",
        entityId: "default",
        before: null,
        after: body
      });
      const result = await pool.query("select * from backup_settings where id = 'default'");
      return { backupSettings: mapBackupSettings(result.rows[0]) };
    }
  );

  app.post<{ Body: z.infer<typeof restorePrecheckSchema> }>(
    "/api/admin/backups/restore-precheck",
    { preHandler: requireInstanceAdminCsrf },
    async (request, reply) => {
      const body = validateBody(restorePrecheckSchema, request.body, reply);
      if (!body) return;
      const result = await pool.query("select * from backup_jobs where id = $1", [body.backupJobId]);
      const backup = result.rows[0];
      if (!backup) {
        return reply.code(404).send({ code: "BACKUP_NOT_FOUND", message: "Backup not found" });
      }
      const issues: string[] = [];
      if (backup.status !== "completed") issues.push("Backup is not completed");
      if (!backup.backup_manifest) issues.push("Backup manifest is missing");
      if (backup.is_downloadable_zip && !body.passwordProvided) issues.push("Download package password is required");
      const precheck = {
        backupJobId: body.backupJobId,
        ok: issues.length === 0,
        issues,
        checkedAt: new Date().toISOString(),
        manifestPresent: Boolean(backup.backup_manifest),
        status: backup.status
      };
      return { precheck };
    }
  );

  app.post<{ Params: { id: string }; Body: z.infer<typeof restoreStartSchema> }>(
    "/api/admin/backups/:id/restore",
    { preHandler: requireInstanceAdminCsrf },
    async (request, reply) => {
      const body = validateBody(restoreStartSchema, { ...request.body, backupJobId: request.params.id }, reply);
      if (!body) return;
      const backup = await pool.query("select * from backup_jobs where id = $1", [request.params.id]);
      if (!backup.rows[0]) {
        return reply.code(404).send({ code: "BACKUP_NOT_FOUND", message: "Backup not found" });
      }
      const restoreJobId = randomUUID();
      const precheck = {
        backupJobId: request.params.id,
        ok: backup.rows[0].status === "completed" && Boolean(backup.rows[0].backup_manifest),
        checkedAt: new Date().toISOString()
      };
      await pool.query(
        `insert into restore_jobs
          (id, backup_job_id, status, started_by_user_id, started_at, failed_at, failure_reason, precheck_result)
         values ($1,$2,'failed',$3,now(),now(),$4,$5::jsonb)`,
        [
          restoreJobId,
          request.params.id,
          request.user!.sub,
          "Automated full restore execution is not enabled in this build.",
          JSON.stringify(precheck)
        ]
      );
      return reply.code(501).send({
        restoreJobId,
        code: "RESTORE_EXECUTION_NOT_ENABLED",
        message: "Restore precheck is available, but destructive full restore execution is not enabled in this build.",
        precheck
      });
    }
  );

  app.get<{ Querystring: LogFilters }>(
    "/api/admin/activity-logs",
    { preHandler: requireAdminPermission("activitylog.view") },
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
    { preHandler: requireAdminPermission("activitylog.view") },
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
    { preHandler: requireAdminPermission("activitylog.view") },
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
    { preHandler: requireAdminPermission("activitylog.view") },
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
    { preHandler: requireAdminPermission("auditlog.view") },
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
    { preHandler: requireAdminPermission("auditlog.view") },
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
      const body = validateBody(inviteSchema, request.body, reply);
      if (!body) return;
      const role = await pool.query<{ id: string }>("select id from roles where name = $1", [body.role]);
      if (!role.rows[0]) {
        return reply.code(400).send({ code: "ROLE_NOT_FOUND", message: "Role not found" });
      }
      const passwordHash = await argon2.hash(body.password, { type: argon2.argon2id });
      const id = randomUUID();
      const result = await pool.query(
        `insert into users (id, email, name, password_hash, role_id)
         values ($1, lower($2), $3, $4, $5)
         returning id, email, name, status, created_at, updated_at`,
        [id, body.email, body.name, passwordHash, role.rows[0].id]
      );
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "user.invited",
        entityType: "user",
        entityId: id,
        before: null,
        after: { ...result.rows[0], role: body.role }
      });
      return reply.code(201).send({ user: { ...result.rows[0], role: body.role } });
    }
  );

  app.put<{ Params: { id: string }; Body: UserUpdateBody }>(
    "/api/admin/users/:id",
    { preHandler: requireCsrfPermission("roles.manage") },
    async (request, reply) => {
      const body = validateBody(userUpdateSchema, request.body, reply);
      if (!body) return;
      const before = await pool.query(
        `select u.id, u.email, u.name, u.status, r.name as role
         from users u join roles r on r.id = u.role_id
         where u.id = $1`,
        [request.params.id]
      );
      if (!before.rows[0]) {
        return reply.code(404).send({ code: "USER_NOT_FOUND", message: "User not found" });
      }
      const role = body.role
        ? await pool.query<{ id: string }>("select id from roles where name = $1", [body.role])
        : null;
      if (body.role && !role?.rows[0]) {
        return reply.code(400).send({ code: "ROLE_NOT_FOUND", message: "Role not found" });
      }
      const result = await pool.query(
        `update users
         set role_id = coalesce($2, role_id),
             status = coalesce($3, status),
             updated_at = now()
         where id = $1
         returning id`,
        [request.params.id, role?.rows[0]?.id ?? null, body.status ?? null]
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
