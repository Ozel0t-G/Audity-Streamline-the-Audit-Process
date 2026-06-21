import crypto, { randomUUID } from "node:crypto";
import argon2 from "argon2";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendActivityEvent } from "../activity/service.js";
import { requireCsrf, requireCsrfPermission, requirePermission } from "../auth/hooks.js";
import { pool } from "../db/client.js";
import { syncFrameworkYamlFiles } from "../frameworks/yamlImporter.js";
import { generatePassword, validateUserPassword, PASSWORD_POLICY_DESCRIPTION } from "../auth/passwordPolicy.js";
import {
  EMAIL_TOPICS,
  listSubscriptions,
  publishEmailTopic,
  upsertSubscription,
  type EmailTopicId
} from "../notifications/emailTopics.js";
import { createLlmProvider, estimateCostCents, type EnrichInput } from "../llm/provider.js";
import {
  loadLlmConfigInternal,
  loadLlmConfigPublic,
  saveLlmConfig,
  type LlmProviderKind
} from "../llm/settings.js";
import {
  commitDraft,
  createImportRecord,
  deleteImport,
  deleteUserFrameworkYaml,
  getImportRecord,
  listImports,
  mapImportRecord,
  persistSourceFile,
  scheduleImport,
  updateImportStatus,
  type DraftYaml
} from "../frameworks/importJobs.js";
import { CSV_TEMPLATE } from "../frameworks/csvParser.js";
import { backupQueue, restoreQueue } from "../jobs/queue.js";
import { signedBackupGetUrl } from "../storage/service.js";
import { validateBody } from "../utils/validation.js";
import { checkForUpdates, getUpdaterJob, startUpdate } from "./updateService.js";

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

type RolePermissionsBody = {
  permissions?: string[];
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
  password: z.string().min(16).optional()
});

const userUpdateSchema = z.object({
  role: z.string().optional(),
  status: z.enum(["active", "disabled"]).optional()
});

const rolePermissionsSchema = z.object({
  permissions: z.array(z.string()).min(1)
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

const updateRunSchema = z.object({
  version: z.string().trim().min(1).max(80).optional()
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

function requireAdminCsrfPermission(permission: string) {
  const permissionHandler = requireCsrfPermission(permission);
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

function canAssignRole(actorRole: string, targetRole: string): boolean {
  if (actorRole === "Instance Admin") return true;
  if (actorRole === "Tenant Admin") return !adminRoles.has(targetRole);
  return false;
}

async function wouldRemoveLastActiveInstanceAdmin(userId: string, nextRole: string, nextStatus: string): Promise<boolean> {
  if (nextRole === "Instance Admin" && nextStatus === "active") return false;
  const result = await pool.query<{ count: string }>(
    `select count(*)::text
     from users u
     join roles r on r.id = u.role_id
     where u.id <> $1 and u.status = 'active' and r.name = 'Instance Admin'`,
    [userId]
  );
  return Number(result.rows[0]?.count ?? 0) === 0;
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
    "/api/admin/system-info",
    { preHandler: requireAdminPermission("settings.manage") },
    async () => {
      const os = await import("node:os");
      const nics = os.networkInterfaces();
      const addresses: Array<{ iface: string; family: string; address: string; internal: boolean }> = [];
      for (const [name, infos] of Object.entries(nics)) {
        for (const info of infos ?? []) {
          if (info.internal) continue;
          addresses.push({ iface: name, family: info.family, address: info.address, internal: info.internal });
        }
      }
      const memory = {
        totalMb: Math.round(os.totalmem() / 1024 / 1024),
        freeMb: Math.round(os.freemem() / 1024 / 1024),
        usedPct: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100)
      };
      return {
        hostname: os.hostname(),
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        nodeVersion: process.version,
        uptimeSeconds: Math.round(process.uptime()),
        publicUrl: process.env.AUDITY_PUBLIC_URL ?? null,
        loadAverage: os.loadavg().map((value) => Math.round(value * 100) / 100),
        cpuCount: os.cpus().length,
        memory,
        networkAddresses: addresses
      };
    }
  );

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

  app.post(
    "/api/admin/frameworks/sync-yaml",
    { preHandler: requireInstanceAdminCsrf },
    async () => {
      return { sync: await syncFrameworkYamlFiles({ force: true }) };
    }
  );

  app.get(
    "/api/admin/updates/status",
    { preHandler: requireAdminPermission("settings.manage") },
    async () => {
      const [status, job] = await Promise.all([
        checkForUpdates(false),
        getUpdaterJob().catch(() => null)
      ]);
      return { update: status, job };
    }
  );

  app.post(
    "/api/admin/updates/check",
    { preHandler: requireCsrfPermission("settings.manage") },
    async () => {
      const status = await checkForUpdates(true);
      const job = await getUpdaterJob().catch(() => null);
      return { update: status, job };
    }
  );

  app.post<{ Body: { version?: string } }>(
    "/api/admin/updates/run",
    { preHandler: requireInstanceAdminCsrf },
    async (request, reply) => {
      const body = validateBody(updateRunSchema, request.body ?? {}, reply);
      if (!body) return;
      const job = await startUpdate(body.version, request.user!.sub);
      return reply.code(202).send({ job });
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
    await pool.query(
      `update backup_jobs
       set status = 'failed',
           failed_at = coalesce(failed_at, now()),
           finished_at = coalesce(finished_at, now()),
           failure_reason = coalesce(failure_reason, 'Backup job timed out before completion')
       where job_type = 'full'
         and status in ('queued','running')
         and coalesce(started_at, created_at) < now() - interval '1 hour'`
    );
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
      if (backup.job_type !== "full") issues.push("Only full backups can be restored");
      if (!backup.backup_manifest) issues.push("Backup manifest is missing");
      if (typeof backup.metadata?.databaseDumpObjectKey !== "string") issues.push("Database dump is missing");
      if (typeof backup.metadata?.evidenceManifestObjectKey !== "string") issues.push("Evidence manifest is missing");
      if (backup.is_downloadable_zip && !body.passwordProvided) issues.push("Download package password is required");
      const precheck = {
        backupJobId: body.backupJobId,
        ok: issues.length === 0,
        issues,
        checkedAt: new Date().toISOString(),
        manifestPresent: Boolean(backup.backup_manifest),
        databaseDumpPresent: typeof backup.metadata?.databaseDumpObjectKey === "string",
        evidenceManifestPresent: typeof backup.metadata?.evidenceManifestObjectKey === "string",
        backupType: backup.job_type,
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
      const backupRow = backup.rows[0];
      if (!backupRow) {
        return reply.code(404).send({ code: "BACKUP_NOT_FOUND", message: "Backup not found" });
      }
      const running = await pool.query("select id from restore_jobs where status in ('queued','running') limit 1");
      if (running.rows[0]) {
        return reply.code(409).send({ code: "RESTORE_ALREADY_RUNNING", message: "A restore is already queued or running" });
      }
      const issues: string[] = [];
      if (backupRow.status !== "completed") issues.push("Backup is not completed");
      if (backupRow.job_type !== "full") issues.push("Only full backups can be restored");
      if (!backupRow.backup_manifest) issues.push("Backup manifest is missing");
      if (typeof backupRow.metadata?.databaseDumpObjectKey !== "string") issues.push("Database dump is missing");
      if (typeof backupRow.metadata?.evidenceManifestObjectKey !== "string") issues.push("Evidence manifest is missing");
      const precheck = {
        backupJobId: request.params.id,
        ok: issues.length === 0,
        issues,
        checkedAt: new Date().toISOString(),
        manifestPresent: Boolean(backupRow.backup_manifest),
        databaseDumpPresent: typeof backupRow.metadata?.databaseDumpObjectKey === "string",
        evidenceManifestPresent: typeof backupRow.metadata?.evidenceManifestObjectKey === "string",
        backupType: backupRow.job_type,
        status: backupRow.status
      };
      if (!precheck.ok) {
        return reply.code(409).send({ code: "RESTORE_PRECHECK_FAILED", message: "Restore precheck failed", precheck });
      }
      const restoreJobId = randomUUID();
      await pool.query(
        `insert into restore_jobs
          (id, backup_job_id, status, started_by_user_id, created_at, precheck_result)
         values ($1,$2,'queued',$3,now(),$4::jsonb)`,
        [
          restoreJobId,
          request.params.id,
          request.user!.sub,
          JSON.stringify(precheck)
        ]
      );
      const job = await restoreQueue.add("run-restore", {
        restoreJobId,
        backupJobId: request.params.id,
        userId: request.user!.sub
      });
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "restore.queued",
        entityType: "restore_job",
        entityId: restoreJobId,
        before: null,
        after: { restoreJobId, backupJobId: request.params.id, queueJobId: job.id, precheck }
      });
      return reply.code(202).send({
        restoreJobId,
        queueJobId: job.id,
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

  app.get("/api/admin/users", { preHandler: requireAdminPermission("roles.manage") }, async () => {
    const result = await pool.query(
      `select u.id, u.email, u.name, u.status, r.name as role, u.created_at, u.updated_at
       from users u
       join roles r on r.id = u.role_id
       order by u.created_at desc`
    );
    const roles = await pool.query(
      `select r.id, r.name,
        coalesce(json_agg(p.name order by p.name) filter (where p.id is not null), '[]'::json) as permissions
       from roles r
       left join role_permissions rp on rp.role_id = r.id
       left join permissions p on p.id = rp.permission_id
       group by r.id
       order by r.name`
    );
    const permissions = await pool.query("select id, name from permissions order by name");
    return { users: result.rows, roles: roles.rows, permissions: permissions.rows };
  });

  app.patch<{ Params: { id: string }; Body: RolePermissionsBody }>(
    "/api/admin/roles/:id/permissions",
    { preHandler: requireInstanceAdminCsrf },
    async (request, reply) => {
      const body = validateBody(rolePermissionsSchema, request.body, reply);
      if (!body) return;
      const role = await pool.query<{ id: string; name: string }>("select id, name from roles where id = $1", [request.params.id]);
      if (!role.rows[0]) {
        return reply.code(404).send({ code: "ROLE_NOT_FOUND", message: "Role not found" });
      }
      const currentUserRole = await pool.query<{ role_id: string }>("select role_id from users where id = $1", [request.user!.sub]);
      if (currentUserRole.rows[0]?.role_id === request.params.id && !body.permissions.includes("roles.manage")) {
        return reply.code(400).send({
          code: "CANNOT_REMOVE_OWN_ROLE_MANAGEMENT",
          message: "You cannot remove role management from your own role."
        });
      }
      const permissionRows = await pool.query<{ id: string; name: string }>(
        "select id, name from permissions where name = any($1::text[])",
        [body.permissions]
      );
      if (permissionRows.rows.length !== body.permissions.length) {
        return reply.code(400).send({ code: "PERMISSION_NOT_FOUND", message: "One or more permissions do not exist" });
      }
      const before = await pool.query(
        `select p.name
         from role_permissions rp
         join permissions p on p.id = rp.permission_id
         where rp.role_id = $1
         order by p.name`,
        [request.params.id]
      );
      await pool.query("delete from role_permissions where role_id = $1", [request.params.id]);
      for (const permission of permissionRows.rows) {
        await pool.query(
          "insert into role_permissions (role_id, permission_id) values ($1, $2) on conflict do nothing",
          [request.params.id, permission.id]
        );
      }
      const after = permissionRows.rows.map((permission) => permission.name).sort();
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "role.permissions_changed",
        entityType: "role",
        entityId: request.params.id,
        before: { role: role.rows[0].name, permissions: before.rows.map((row) => row.name) },
        after: { role: role.rows[0].name, permissions: after }
      });
      return { role: { ...role.rows[0], permissions: after } };
    }
  );

  app.post<{ Body: InviteBody }>(
    "/api/admin/users/invite",
    { preHandler: requireAdminCsrfPermission("users.invite") },
    async (request, reply) => {
      const body = validateBody(inviteSchema, request.body, reply);
      if (!body) return;
      if (!canAssignRole(request.user!.role, body.role)) {
        return reply.code(403).send({
          code: "ROLE_ASSIGNMENT_FORBIDDEN",
          message: "You cannot assign this role."
        });
      }
      const role = await pool.query<{ id: string }>("select id from roles where name = $1", [body.role]);
      if (!role.rows[0]) {
        return reply.code(400).send({ code: "ROLE_NOT_FOUND", message: "Role not found" });
      }
      let plaintextPassword: string;
      let generated = false;
      if (body.password) {
        const policy = validateUserPassword(body.password);
        if (!policy.ok) {
          return reply.code(400).send({
            code: "PASSWORD_POLICY",
            message: `Password does not meet policy: ${policy.reasons.join(", ")}.`,
            policy: PASSWORD_POLICY_DESCRIPTION
          });
        }
        plaintextPassword = body.password;
      } else {
        plaintextPassword = generatePassword(24);
        generated = true;
      }
      const passwordHash = await argon2.hash(plaintextPassword, { type: argon2.argon2id });
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
        after: { ...result.rows[0], role: body.role, password_generated: generated }
      });
      return reply.code(201).send({
        user: { ...result.rows[0], role: body.role },
        oneTimePassword: plaintextPassword,
        passwordGenerated: generated
      });
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/admin/users/:id/reset-password",
    { preHandler: requireAdminCsrfPermission("roles.manage") },
    async (request, reply) => {
      const target = await pool.query<{ id: string; email: string }>(
        "select id, email from users where id = $1",
        [request.params.id]
      );
      if (!target.rows[0]) {
        return reply.code(404).send({ code: "NOT_FOUND", message: "User not found" });
      }
      const newPassword = generatePassword(24);
      const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
      await pool.query(
        "update users set password_hash = $1, updated_at = now() where id = $2",
        [passwordHash, request.params.id]
      );
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "user.password.reset",
        entityType: "user",
        entityId: request.params.id,
        before: null,
        after: { email: target.rows[0].email, by_admin: true }
      });
      return { oneTimePassword: newPassword };
    }
  );

  app.put<{ Params: { id: string }; Body: UserUpdateBody }>(
    "/api/admin/users/:id",
    { preHandler: requireAdminCsrfPermission("roles.manage") },
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
      if (request.user!.role !== "Instance Admin" && adminRoles.has(before.rows[0].role)) {
        return reply.code(403).send({
          code: "USER_MANAGEMENT_FORBIDDEN",
          message: "You cannot modify administrator accounts."
        });
      }
      if (request.params.id === request.user!.sub && body.status === "disabled") {
        return reply.code(400).send({
          code: "CANNOT_DISABLE_SELF",
          message: "You cannot disable your own user."
        });
      }
      if (body.role && !canAssignRole(request.user!.role, body.role)) {
        return reply.code(403).send({
          code: "ROLE_ASSIGNMENT_FORBIDDEN",
          message: "You cannot assign this role."
        });
      }
      const nextRole = body.role ?? before.rows[0].role;
      const nextStatus = body.status ?? before.rows[0].status;
      if (
        before.rows[0].role === "Instance Admin" &&
        (await wouldRemoveLastActiveInstanceAdmin(request.params.id, nextRole, nextStatus))
      ) {
        return reply.code(400).send({
          code: "LAST_INSTANCE_ADMIN_REQUIRED",
          message: "At least one active Instance Admin must remain."
        });
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
      if (after.rows[0].status === "disabled") {
        await pool.query("update sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [
          request.params.id
        ]);
      }
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

  // ----- Email subscriptions -----
  app.get(
    "/api/admin/email-subscriptions",
    { preHandler: requireAdminPermission("email.manage") },
    async () => {
      const subscriptions = await listSubscriptions();
      return {
        topics: EMAIL_TOPICS,
        subscriptions: subscriptions.map((row) => ({
          topic: row.topic,
          roles: row.roles ?? [],
          extraEmails: row.extra_emails ?? [],
          enabled: row.enabled,
          updatedAt: row.updated_at
        }))
      };
    }
  );

  const emailSubscriptionSchema = z.object({
    topic: z.string().min(1),
    roles: z.array(z.string().min(1)).max(20),
    extraEmails: z.array(z.string().email()).max(50),
    enabled: z.boolean()
  });

  app.put(
    "/api/admin/email-subscriptions",
    { preHandler: requireAdminCsrfPermission("email.manage") },
    async (request, reply) => {
      const body = validateBody(emailSubscriptionSchema, request.body, reply);
      if (!body) return;
      if (!EMAIL_TOPICS.some((topic) => topic.id === body.topic)) {
        return reply.code(400).send({ code: "UNKNOWN_TOPIC", message: `Unknown email topic '${body.topic}'.` });
      }
      await upsertSubscription(
        body.topic as EmailTopicId,
        { roles: body.roles, extraEmails: body.extraEmails, enabled: body.enabled },
        request.user!.sub
      );
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "email.subscription.updated",
        entityType: "email_subscription",
        entityId: body.topic,
        before: null,
        after: { roles: body.roles, extraEmails: body.extraEmails, enabled: body.enabled }
      });
      return { ok: true };
    }
  );

  // ----- LLM / AI Settings -----
  const llmConfigSchema = z.object({
    provider: z.enum(["none", "ollama", "anthropic", "openai"]),
    endpoint: z.string().trim().max(500).optional(),
    model: z.string().trim().max(120).optional(),
    apiKey: z.string().min(1).max(500).optional(),
    clearKey: z.boolean().optional(),
    timeoutSeconds: z.number().int().min(5).max(600).optional(),
    maxTokens: z.number().int().min(256).max(8000).optional()
  });

  app.get(
    "/api/admin/llm/config",
    { preHandler: requireAdminPermission("settings.manage") },
    async () => loadLlmConfigPublic()
  );

  app.put(
    "/api/admin/llm/config",
    { preHandler: requireAdminPermission("settings.manage") },
    async (request, reply) => {
      const body = validateBody(llmConfigSchema, request.body, reply);
      if (!body) return;
      const previous = await loadLlmConfigPublic();
      const next = await saveLlmConfig(
        {
          provider: body.provider as LlmProviderKind,
          endpoint: body.endpoint,
          model: body.model,
          apiKey: body.apiKey,
          clearKey: body.clearKey,
          timeoutSeconds: body.timeoutSeconds,
          maxTokens: body.maxTokens
        },
        request.user!.sub
      );
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "llm.config.updated",
        entityType: "settings",
        entityId: "llm_config",
        before: { provider: previous.provider, model: previous.model, hasKey: previous.hasKey },
        after: { provider: next.provider, model: next.model, hasKey: next.hasKey }
      });
      return { llmConfig: next };
    }
  );

  app.post(
    "/api/admin/llm/test",
    {
      preHandler: requireAdminPermission("settings.manage"),
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } }
    },
    async () => {
      const config = await loadLlmConfigInternal();
      const provider = createLlmProvider(config);
      return provider.testConnection();
    }
  );

  const enrichPreviewSchema = z.object({
    title: z.string().trim().min(1).max(300),
    requirement: z.string().trim().min(1).max(4000),
    language: z.enum(["de", "en"]).optional(),
    domain: z.string().trim().max(120).optional()
  });

  app.post(
    "/api/admin/llm/enrich-preview",
    {
      preHandler: requireAdminPermission("settings.manage"),
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
    },
    async (request, reply) => {
      const body = validateBody(enrichPreviewSchema, request.body, reply);
      if (!body) return;
      const config = await loadLlmConfigInternal();
      const provider = createLlmProvider(config);
      const input: EnrichInput = {
        title: body.title,
        requirement: body.requirement,
        language: (body.language ?? "de") as "de" | "en",
        domain: body.domain
      };
      try {
        const result = await provider.enrich(input);
        return { result, provider: config.provider, model: config.model };
      } catch (error) {
        return reply.code(502).send({
          code: "LLM_FAILED",
          message: error instanceof Error ? error.message : "LLM call failed"
        });
      }
    }
  );

  // ----- Framework Imports -----
  app.get(
    "/api/admin/frameworks/csv-template",
    { preHandler: requireAdminPermission("settings.manage") },
    async (_request, reply) => {
      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", "attachment; filename=\"audity-framework-template.csv\"");
      return CSV_TEMPLATE;
    }
  );

  app.post(
    "/api/admin/frameworks/import",
    {
      preHandler: requireAdminPermission("settings.manage"),
      config: { rateLimit: { max: 10, timeWindow: "1 hour" } }
    },
    async (request, reply) => {
      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ code: "FILE_REQUIRED", message: "Bitte eine CSV-Datei hochladen." });
      }
      const allowed = new Set(["text/csv", "application/vnd.ms-excel", "application/octet-stream"]);
      if (!allowed.has(file.mimetype)) {
        return reply.code(415).send({ code: "FILE_TYPE_BLOCKED", message: `Mime-Type ${file.mimetype} ist nicht erlaubt. Erlaubt: CSV.` });
      }
      const fields = file.fields as Record<string, { value?: string } | undefined>;
      const frameworkKey = fields.framework_key?.value?.trim();
      const frameworkName = fields.framework_name?.value?.trim();
      const frameworkVersion = fields.framework_version?.value?.trim();
      const languageRaw = fields.language?.value?.trim();
      const language = languageRaw === "en" ? "en" : "de";
      if (!frameworkKey || !frameworkName || !frameworkVersion) {
        return reply.code(400).send({
          code: "META_REQUIRED",
          message: "framework_key, framework_name und framework_version sind Pflicht-Felder im Upload-Formular."
        });
      }
      const chunks: Buffer[] = [];
      for await (const chunk of file.file) chunks.push(chunk as Buffer);
      const buffer = Buffer.concat(chunks);
      const persisted = await persistSourceFile(buffer, file.filename);
      const record = await createImportRecord({
        uploadedBy: request.user!.sub,
        sourceFilename: file.filename,
        sourceMime: file.mimetype,
        sourcePath: persisted.path,
        frameworkKey,
        frameworkName,
        frameworkVersion,
        frameworkLanguage: language
      });
      scheduleImport(record.id);
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "framework.import.uploaded",
        entityType: "framework_import",
        entityId: record.id,
        before: null,
        after: { framework_key: frameworkKey, source_filename: file.filename }
      });
      return { import: mapImportRecord(record) };
    }
  );

  app.get(
    "/api/admin/frameworks/imports",
    { preHandler: requireAdminPermission("settings.manage") },
    async () => ({ imports: (await listImports()).map(mapImportRecord) })
  );

  app.get<{ Params: { id: string } }>(
    "/api/admin/frameworks/imports/:id",
    { preHandler: requireAdminPermission("settings.manage") },
    async (request, reply) => {
      const record = await getImportRecord(request.params.id);
      if (!record) return reply.code(404).send({ code: "NOT_FOUND", message: "Import not found" });
      return { import: mapImportRecord(record) };
    }
  );

  const patchControlSchema = z.object({
    domainIndex: z.number().int().min(0),
    controlIndex: z.number().int().min(0),
    control: z.record(z.string(), z.unknown())
  });
  app.patch<{ Params: { id: string } }>(
    "/api/admin/frameworks/imports/:id",
    { preHandler: requireAdminPermission("settings.manage") },
    async (request, reply) => {
      const body = validateBody(patchControlSchema, request.body, reply);
      if (!body) return;
      const record = await getImportRecord(request.params.id);
      if (!record || !record.draft_yaml) {
        return reply.code(404).send({ code: "NOT_FOUND", message: "Import or draft not found" });
      }
      const draft: DraftYaml = JSON.parse(JSON.stringify(record.draft_yaml));
      const domain = draft.domains[body.domainIndex];
      if (!domain || !domain.controls[body.controlIndex]) {
        return reply.code(400).send({ code: "INVALID_INDEX", message: "Domain or control index out of range" });
      }
      domain.controls[body.controlIndex] = {
        ...domain.controls[body.controlIndex],
        ...(body.control as Record<string, unknown>)
      } as typeof domain.controls[number];
      await updateImportStatus(record.id, { draft_yaml: draft });
      return { ok: true };
    }
  );

  const regenerateSchema = z.object({
    domainIndex: z.number().int().min(0),
    controlIndex: z.number().int().min(0)
  });
  app.post<{ Params: { id: string } }>(
    "/api/admin/frameworks/imports/:id/regenerate-control",
    { preHandler: requireAdminPermission("settings.manage") },
    async (request, reply) => {
      const body = validateBody(regenerateSchema, request.body, reply);
      if (!body) return;
      const record = await getImportRecord(request.params.id);
      if (!record || !record.draft_yaml) {
        return reply.code(404).send({ code: "NOT_FOUND", message: "Import or draft not found" });
      }
      const config = await loadLlmConfigInternal();
      if (config.provider === "none") {
        return reply.code(400).send({ code: "LLM_DISABLED", message: "LLM provider is disabled" });
      }
      const draft: DraftYaml = JSON.parse(JSON.stringify(record.draft_yaml));
      const control = draft.domains[body.domainIndex]?.controls[body.controlIndex];
      if (!control) return reply.code(400).send({ code: "INVALID_INDEX", message: "Control not found" });
      const requirement = control._source?.requirement ?? control.title;
      const provider = createLlmProvider(config);
      const result = await provider.enrich({
        title: control.title,
        requirement,
        language: draft.framework.language ?? "de",
        domain: draft.domains[body.domainIndex].name
      });
      const updated = {
        ...control,
        question: result.fields.question,
        purpose: result.fields.purpose,
        expectedOutcome: result.fields.expectedOutcome,
        howTo: result.fields.howTo,
        evidenceExamples: result.fields.evidenceExamples,
        tags: control.tags?.length ? control.tags : result.fields.tags,
        weight: result.fields.weightHint ?? control.weight
      };
      draft.domains[body.domainIndex].controls[body.controlIndex] = updated as typeof control;
      await updateImportStatus(record.id, {
        draft_yaml: draft,
        // If the active provider differs from the import's initial provider,
        // update the row so cost-tracking and review-UI reflect what the
        // re-generate actually used.
        llm_provider: config.provider,
        llm_model: config.model || null,
        llm_tokens_in: record.llm_tokens_in + result.tokensIn,
        llm_tokens_out: record.llm_tokens_out + result.tokensOut,
        llm_estimated_cost_cents:
          record.llm_estimated_cost_cents + estimateCostCents(config.provider, result.tokensIn, result.tokensOut)
      });
      return { control: updated };
    }
  );

  app.post<{ Params: { id: string }; Body: { draft?: DraftYaml } }>(
    "/api/admin/frameworks/imports/:id/commit",
    { preHandler: requireAdminPermission("settings.manage") },
    async (request, reply) => {
      const record = await getImportRecord(request.params.id);
      if (!record || !record.draft_yaml) {
        return reply.code(404).send({ code: "NOT_FOUND", message: "Import or draft not found" });
      }
      if (request.body?.draft) {
        await updateImportStatus(record.id, { draft_yaml: request.body.draft });
        record.draft_yaml = request.body.draft;
      }
      const result = await commitDraft(record);
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "framework.import.committed",
        entityType: "framework_import",
        entityId: record.id,
        before: null,
        after: { yaml_path: result.path }
      });
      void publishEmailTopic({
        topic: "framework.imported",
        subject: `[Audity] Framework "${record.framework_name ?? record.framework_key ?? "—"}" published`,
        text: [
          `A new framework has been published in Audity.`,
          ``,
          `Name:    ${record.framework_name ?? "—"}`,
          `Key:     ${record.framework_key ?? "—"}`,
          `Version: ${record.framework_version ?? "—"}`,
          `Source:  user-uploaded CSV (${record.source_filename})`,
          `By:      ${request.user!.email ?? request.user!.sub}`,
          `File:    ${result.path}`
        ].join("\n")
      });
      return { ok: true, path: result.path };
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/admin/frameworks/imports/:id/retry",
    { preHandler: requireAdminPermission("settings.manage") },
    async (request, reply) => {
      const record = await getImportRecord(request.params.id);
      if (!record) return reply.code(404).send({ code: "NOT_FOUND", message: "Import not found" });
      if (record.status !== "failed") {
        return reply.code(400).send({ code: "INVALID_STATE", message: "Only failed imports can be retried" });
      }
      await updateImportStatus(record.id, {
        status: "uploaded",
        error_message: null,
        draft_yaml: null,
        enriched_controls: 0,
        total_controls: 0
      });
      scheduleImport(record.id);
      return { ok: true };
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/api/admin/frameworks/imports/:id",
    { preHandler: requireAdminPermission("settings.manage") },
    async (request, reply) => {
      const record = await getImportRecord(request.params.id);
      if (!record) return reply.code(404).send({ code: "NOT_FOUND", message: "Import not found" });
      await deleteImport(record);
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "framework.import.discarded",
        entityType: "framework_import",
        entityId: record.id,
        before: null,
        after: null
      });
      return { ok: true };
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/api/admin/frameworks/user/:id",
    { preHandler: requireAdminPermission("settings.manage") },
    async (request, reply) => {
      const result = await pool.query<{ yaml_source_path: string | null }>(
        "select yaml_source_path from frameworks where id = $1 and source_kind = 'user_uploaded'",
        [request.params.id]
      );
      if (!result.rows[0]) {
        return reply.code(404).send({ code: "NOT_FOUND", message: "User framework not found" });
      }
      const yamlPath = result.rows[0].yaml_source_path;
      if (yamlPath) await deleteUserFrameworkYaml(yamlPath);
      await pool.query("update frameworks set archived_at = now() where id = $1", [request.params.id]);
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "framework.user.deleted",
        entityType: "framework",
        entityId: request.params.id,
        before: null,
        after: null
      });
      return { ok: true };
    }
  );

  app.get(
    "/api/admin/llm/usage",
    { preHandler: requireAdminPermission("settings.manage") },
    async () => {
      const totals = await pool.query<{
        provider: string | null;
        tokens_in: number;
        tokens_out: number;
        cost_cents: number;
        imports: number;
      }>(`
        select llm_provider as provider,
               coalesce(sum(llm_tokens_in), 0)::int as tokens_in,
               coalesce(sum(llm_tokens_out), 0)::int as tokens_out,
               coalesce(sum(llm_estimated_cost_cents), 0)::int as cost_cents,
               count(*)::int as imports
        from framework_imports
        where created_at >= now() - interval '30 days'
        group by llm_provider
      `);
      return { last30Days: totals.rows };
    }
  );
}
