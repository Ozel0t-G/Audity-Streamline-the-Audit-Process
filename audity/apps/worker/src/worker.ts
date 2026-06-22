import Fastify from "fastify";
import { Worker, type Job } from "bullmq";
import { Client } from "minio";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, scryptSync } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import nodemailer from "nodemailer";
import pg from "pg";
import puppeteer from "puppeteer-core";

const insecureValues = new Set([
  "change-me",
  "change-me-now",
  "replace-me",
  "replace-with-secure-random-secret",
  "replace-with-base64-encoded-32-byte-key",
  "replace-with-secure-database-password",
  "replace-with-secure-initial-admin-password"
]);

function isInsecureValue(value: string): boolean {
  return insecureValues.has(value) || value.includes("change-me") || value.includes("replace-with");
}

function requiredEnv(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function validateProductionConfig(): void {
  if (process.env.AUDITY_ALLOW_INSECURE_DEFAULTS === "true") return;
  if ((process.env.AUDITY_ENV ?? "production") !== "production") return;
  const insecureKeys = [
    ["AUDITY_APP_SECRET", requiredEnv("AUDITY_APP_SECRET", "change-me")],
    [
      "AUDITY_ENCRYPTION_KEY",
      process.env.AUDITY_ENCRYPTION_KEY ?? process.env.AUDITY_APP_SECRET ?? "change-me"
    ],
    [
      "AUDITY_DATABASE_URL",
      requiredEnv("AUDITY_DATABASE_URL", "postgres://audity:change-me@audity-db:5432/audity")
    ],
    ["AUDITY_STORAGE_ACCESS_KEY", requiredEnv("AUDITY_STORAGE_ACCESS_KEY", "replace-me")],
    ["AUDITY_STORAGE_SECRET_KEY", requiredEnv("AUDITY_STORAGE_SECRET_KEY", "replace-me")]
  ].filter(([, value]) => isInsecureValue(value));
  if (insecureKeys.length > 0) {
    throw new Error(
      `Refusing to start production worker with insecure default values: ${insecureKeys
        .map(([key]) => key)
        .join(", ")}. Run ./scripts/install.sh or set secure values in .env.`
    );
  }
}

validateProductionConfig();

const app = Fastify({
  logger: {
    level: process.env.AUDITY_LOG_LEVEL ?? "info"
  }
});

const pool = new pg.Pool({
  connectionString:
    process.env.AUDITY_DATABASE_URL ??
    "postgres://audity:change-me@audity-db:5432/audity",
  max: Number(process.env.AUDITY_DB_POOL_MAX ?? 15),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.on("error", (error) => {
  console.error("[worker-db] idle pg client error", error);
});

const storageEndpoint = new URL(
  process.env.AUDITY_STORAGE_ENDPOINT ?? "http://audity-storage:9000"
);
const storageBucket = process.env.AUDITY_STORAGE_BUCKET ?? "audity-evidence";
const backupBucket = process.env.AUDITY_BACKUP_BUCKET ?? "audity-backups";
const redisUrl = process.env.AUDITY_REDIS_URL ?? "redis://audity-redis:6379";
const storageClient = new Client({
  endPoint: storageEndpoint.hostname,
  port: Number(storageEndpoint.port || 9000),
  useSSL: storageEndpoint.protocol === "https:",
  accessKey: process.env.AUDITY_STORAGE_ACCESS_KEY ?? "replace-me",
  secretKey: process.env.AUDITY_STORAGE_SECRET_KEY ?? "replace-me"
});

let bucketReady: Promise<void> | null = null;
async function ensureBucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      if (!(await storageClient.bucketExists(storageBucket))) {
        await storageClient.makeBucket(storageBucket);
      }
      if (!(await storageClient.bucketExists(backupBucket))) {
        await storageClient.makeBucket(backupBucket);
      }
    })().catch((err) => {
      bucketReady = null;
      throw err;
    });
  }
  return bucketReady;
}

function nextTimestamp(previous?: Date): Date {
  const now = new Date();
  if (!previous || now.getTime() > previous.getTime()) {
    return now;
  }
  return new Date(previous.getTime() + 1);
}

async function appendReportExported(userId: string, reportId: string, objectKey: string): Promise<void> {
  await appendActivityEvent(userId, "report.exported", "report", reportId, null, { reportId, objectKey });
}

async function appendActivityEvent(
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  before: unknown,
  after: unknown
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext('audity_user_activity_logs'))");
    const previous = await client.query<{ event_hash: string; created_at: Date }>(
      "select event_hash, created_at from user_activity_logs order by created_at desc, id desc limit 1"
    );
    const timestamp = nextTimestamp(previous.rows[0]?.created_at).toISOString();
    const prevHash = previous.rows[0]?.event_hash ?? "";
    const payload = JSON.stringify({ before: before ?? null, after: after ?? null });
    const eventHash = createHash("sha256")
      .update(timestamp + userId + action + entityId + payload + prevHash)
      .digest("hex");
    await client.query(
      `insert into user_activity_logs
        (id, user_id, action, entity_type, entity_id, before_value, after_value, prev_hash, event_hash, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        randomUUID(),
        userId,
        action,
        entityType,
        entityId,
        JSON.stringify(before ?? null),
        JSON.stringify(after ?? null),
        prevHash || null,
        eventHash,
        timestamp
      ]
    );
    await client.query("commit");
  } catch (error) {
    // Roll back, but don't let a rollback failure (broken connection, etc.)
    // mask the underlying error the caller cares about.
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function decryptText(payload: string): string {
  const [ivRaw, tagRaw, encryptedRaw] = payload.split(".");
  const key = createHash("sha256")
    .update(process.env.AUDITY_ENCRYPTION_KEY ?? process.env.AUDITY_APP_SECRET ?? "change-me")
    .digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function encryptBackupPackage(
  files: Array<{ path: string; contentType: string; content: Buffer }>,
  password: string
): Buffer {
  const bundle = Buffer.from(
    JSON.stringify(
      {
        format: "audity-encrypted-backup-package",
        version: 1,
        generatedAt: new Date().toISOString(),
        files: files.map((file) => ({
          path: file.path,
          contentType: file.contentType,
          size: file.content.length,
          sha256: createHash("sha256").update(file.content).digest("hex"),
          contentBase64: file.content.toString("base64")
        }))
      },
      null,
      2
    ),
    "utf8"
  );
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(password, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(bundle), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.from(
    JSON.stringify(
      {
        format: "audity-encrypted-backup-package",
        version: 1,
        encryption: "AES-256-GCM",
        kdf: "scrypt",
        salt: salt.toString("base64url"),
        iv: iv.toString("base64url"),
        tag: tag.toString("base64url"),
        checksum: createHash("sha256").update(bundle).digest("hex"),
        encryptedContentBase64: encrypted.toString("base64")
      },
      null,
      2
    ),
    "utf8"
  );
}

async function sendSecureReportEmail(jobData: {
  assessmentId: string;
  reportId: string;
  userId: string;
  recipient: string;
  subject: string;
  message: string;
  packageObjectKey: string;
}) {
  const settings = await pool.query(
    "select * from email_settings order by updated_at desc limit 1"
  );
  const row = settings.rows[0];
  const sender = row?.sender || row?.smtp_user || "no-reply@audity.local";
  let smtpResult = "skipped: smtp not configured";
  const packageStream = await storageClient.getObject(storageBucket, jobData.packageObjectKey);
  const chunks: Buffer[] = [];
  for await (const chunk of packageStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const attachment = Buffer.concat(chunks);

  if (process.env.AUDITY_SMTP_ENABLED === "true" && row?.smtp_host) {
    const transporter = nodemailer.createTransport({
      host: row.smtp_host,
      port: Number(row.smtp_port ?? 587),
      secure: Boolean(row.smtp_tls),
      auth: row.smtp_user
        ? {
            user: row.smtp_user,
            pass: row.smtp_password_encrypted ? decryptText(row.smtp_password_encrypted) : ""
          }
        : undefined
    });
    const result = await transporter.sendMail({
      from: sender,
      to: jobData.recipient,
      subject: jobData.subject,
      text: `${jobData.message || "Attached is your encrypted Audity report package."}\n\nThe package uses AES-256-GCM encryption.`,
      attachments: [
        {
          filename: `Assessment_Report_${jobData.reportId}.auditysecure`,
          content: attachment
        }
      ]
    });
    smtpResult = `sent: ${result.messageId}`;
  }

  await pool.query(
    `insert into email_delivery_log
      (id, sender, recipient, report_id, assessment_id, encryption_method, smtp_result)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [
      randomUUID(),
      sender,
      jobData.recipient,
      jobData.reportId,
      jobData.assessmentId,
      "AES-256-GCM",
      smtpResult
    ]
  );
  await appendActivityEvent(
    jobData.userId,
    "report.email_sent",
    "report",
    jobData.reportId,
    null,
    {
      reportId: jobData.reportId,
      assessmentId: jobData.assessmentId,
      recipient: jobData.recipient,
      encryptionMethod: "AES-256-GCM",
      smtpResult
    }
  );
  return { smtpResult };
}

function pgDump(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    const child = spawn("pg_dump", [
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      process.env.AUDITY_DATABASE_URL ?? "postgres://audity:change-me@audity-db:5432/audity"
    ]);
    child.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => errors.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(Buffer.concat(errors).toString("utf8") || `pg_dump exited with ${code}`));
      }
    });
  });
}

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const errors: Buffer[] = [];
    const child = spawn(command, args);
    child.stderr.on("data", (chunk) => errors.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(Buffer.concat(errors).toString("utf8") || `${command} exited with ${code}`));
      }
    });
  });
}

async function pgRestore(dump: Buffer): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "audity-restore-"));
  const dumpPath = join(dir, "database.dump");
  try {
    await writeFile(dumpPath, dump);
    await runCommand("pg_restore", [
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-privileges",
      "--exit-on-error",
      "--dbname",
      process.env.AUDITY_DATABASE_URL ?? "postgres://audity:change-me@audity-db:5432/audity",
      dumpPath
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function listEvidenceObjects(): Promise<Array<{ name: string; size?: number; lastModified?: Date; etag?: string }>> {
  const objects: Array<{ name: string; size?: number; lastModified?: Date; etag?: string }> = [];
  const stream = storageClient.listObjectsV2(storageBucket, "", true);
  for await (const item of stream) {
    if (item.name) {
      objects.push({
        name: item.name,
        size: item.size,
        lastModified: item.lastModified,
        etag: item.etag
      });
    }
  }
  return objects;
}

async function listStorageObjects(bucket: string, prefix = ""): Promise<string[]> {
  const objects: string[] = [];
  const stream = storageClient.listObjectsV2(bucket, prefix, true);
  for await (const item of stream) {
    if (item.name) {
      objects.push(item.name);
    }
  }
  return objects;
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function evidenceSnapshot(prefix: string): Promise<{ manifest: Buffer; copiedObjects: string[] }> {
  const objects = await listEvidenceObjects();
  const copiedObjects: string[] = [];
  for (const object of objects) {
    const content = await streamToBuffer(await storageClient.getObject(storageBucket, object.name));
    const objectKey = `${prefix}/evidence/${object.name}`;
    await storageClient.putObject(backupBucket, objectKey, content, content.length, {
      "Content-Type": "application/octet-stream"
    });
    copiedObjects.push(objectKey);
  }
  return {
    manifest: Buffer.from(JSON.stringify({
      generatedAt: new Date().toISOString(),
      sourceBucket: storageBucket,
      backupBucket,
      copiedObjects,
      objects
    }, null, 2), "utf8"),
    copiedObjects
  };
}

function parseEvidenceManifest(manifest: Buffer): { copiedObjects: string[] } {
  const parsed = JSON.parse(manifest.toString("utf8")) as { copiedObjects?: unknown };
  if (!Array.isArray(parsed.copiedObjects)) {
    throw new Error("Evidence manifest is invalid");
  }
  return {
    copiedObjects: parsed.copiedObjects.filter((value): value is string => typeof value === "string")
  };
}

async function restoreEvidenceObjects(copiedObjects: string[]): Promise<{ restoredObjects: string[]; removedObjects: number }> {
  const currentObjects = await listStorageObjects(storageBucket);
  if (currentObjects.length > 0) {
    await storageClient.removeObjects(storageBucket, currentObjects);
  }
  const restoredObjects: string[] = [];
  for (const objectKey of copiedObjects) {
    const evidenceMarker = "/evidence/";
    const markerIndex = objectKey.indexOf(evidenceMarker);
    if (markerIndex === -1) {
      throw new Error(`Invalid evidence backup object key: ${objectKey}`);
    }
    const destinationKey = objectKey.slice(markerIndex + evidenceMarker.length);
    if (!destinationKey) continue;
    const content = await streamToBuffer(await storageClient.getObject(backupBucket, objectKey));
    await storageClient.putObject(storageBucket, destinationKey, content, content.length, {
      "Content-Type": "application/octet-stream"
    });
    restoredObjects.push(destinationKey);
  }
  return { restoredObjects, removedObjects: currentObjects.length };
}

async function ensureBackupRecord(
  backupJobId: string | undefined,
  jobType: string,
  source: string,
  userId?: string
) {
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
  if (backupJobId) {
    await pool.query(
      `update backup_jobs
       set status = 'running',
           source = coalesce(source, $2),
           started_at = coalesce(started_at, now()),
           created_by_user_id = coalesce(created_by_user_id, $3)
       where id = $1`,
      [backupJobId, source, userId ?? null]
    );
    return backupJobId;
  }
  const running = await pool.query(
    "select id from backup_jobs where job_type = 'full' and status in ('queued','running') limit 1"
  );
  if (jobType === "full" && running.rows[0]) {
    throw new Error("A backup is already running. Please wait until it finishes.");
  }
  const id = randomUUID();
  await pool.query(
    `insert into backup_jobs (id, job_type, source, status, started_at, created_by_user_id, metadata)
     values ($1, $2, $3, 'running', now(), $4, $5)`,
    [
      id,
      jobType,
      source,
      userId ?? null,
      JSON.stringify({ scheduled: source === "automatic", requestedAt: new Date().toISOString() })
    ]
  );
  return id;
}

async function writeBackupManifest(input: {
  backupJobId: string;
  jobType: string;
  source: string;
  userId?: string;
  prefix: string;
  metadata: Record<string, unknown>;
}) {
  const user = input.userId
    ? await pool.query<{ email: string }>("select email from users where id = $1", [input.userId])
    : null;
  const manifest = {
    backupId: input.backupJobId,
    backupType: input.jobType,
    source: input.source,
    createdAt: new Date().toISOString(),
    createdByUserId: input.userId ?? null,
    createdByUserEmail: user?.rows[0]?.email ?? null,
    audityVersion: "0.2.1",
    databaseSchemaVersion: "core",
    includes: {
      database: input.jobType === "full" || input.jobType === "database",
      evidenceFiles: input.jobType === "full" || input.jobType === "evidence",
      reports: input.jobType === "full",
      frameworkImports: input.jobType === "full",
      auditLogs: input.jobType === "full",
      activityLogs: input.jobType === "full",
      systemSettings: input.jobType === "full",
      notifications: input.jobType === "full"
    },
    storage: {
      provider: "minio",
      bucket: backupBucket,
      prefix: input.prefix,
      objectCount: Array.isArray(input.metadata.objects) ? input.metadata.objects.length : 0
    },
    checksums: {
      databaseDump: input.metadata.databaseDumpSha256 ? `sha256:${input.metadata.databaseDumpSha256}` : null,
      evidenceManifest: input.metadata.evidenceManifestSha256 ? `sha256:${input.metadata.evidenceManifestSha256}` : null
    }
  };
  const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
  const objectKey = `${input.prefix}/backup-manifest.json`;
  await storageClient.putObject(backupBucket, objectKey, manifestBuffer, manifestBuffer.length, {
    "Content-Type": "application/json"
  });
  (input.metadata.objects as string[]).push(objectKey);
  input.metadata.manifestObjectKey = objectKey;
  return manifest;
}

async function ensureNoConcurrentFullBackup(backupJobId: string, jobType: string): Promise<void> {
  if (jobType !== "full") return;
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
    `select id from backup_jobs
     where id <> $1 and job_type = 'full' and status in ('queued','running')
     limit 1`,
    [backupJobId]
  );
  if (running.rows[0]) {
    throw new Error("A backup is already running. Please wait until it finishes.");
  }
}

function twelveHoursFromNow(): Date {
  return new Date(Date.now() + 12 * 60 * 60 * 1000);
}

async function markBackupRunning(backupJobId: string, source: string, userId?: string): Promise<void> {
  await pool.query(
    `update backup_jobs
     set status = 'running',
         source = coalesce(source, $2),
         started_at = coalesce(started_at, now()),
         created_by_user_id = coalesce(created_by_user_id, $3)
     where id = $1`,
    [backupJobId, source, userId ?? null]
  );
}

async function runBackup(jobData: {
  backupJobId?: string;
  jobType?: "full" | "database" | "evidence";
  userId?: string;
  source?: string;
  downloadableZip?: boolean;
  downloadPassword?: string;
}) {
  const jobType = jobData.jobType ?? "full";
  const source = jobData.source ?? (jobData.downloadableZip ? "manual_download_zip" : jobData.userId ? "manual" : "automatic");
  const backupJobId = await ensureBackupRecord(jobData.backupJobId, jobType, source, jobData.userId);
  await ensureNoConcurrentFullBackup(backupJobId, jobType);
  await markBackupRunning(backupJobId, source, jobData.userId);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const prefix = `backups/${timestamp}-${backupJobId}`;
  const metadata: Record<string, unknown> = {
    backupJobId,
    jobType,
    backupBucket,
    objects: []
  };
  const packageFiles: Array<{ path: string; contentType: string; content: Buffer }> = [];
  try {
    await ensureBucket();
    if (jobType === "full" || jobType === "database") {
      const dump = await pgDump();
      packageFiles.push({
        path: "database.dump",
        contentType: "application/octet-stream",
        content: dump
      });
      const objectKey = `${prefix}/database.dump`;
      await storageClient.putObject(backupBucket, objectKey, dump, dump.length, {
        "Content-Type": "application/octet-stream"
      });
      (metadata.objects as string[]).push(objectKey);
      metadata.databaseDumpBytes = dump.length;
      metadata.databaseDumpObjectKey = objectKey;
      metadata.databaseDumpSha256 = createHash("sha256").update(dump).digest("hex");
    }
    if (jobType === "full" || jobType === "evidence") {
      const snapshot = await evidenceSnapshot(prefix);
      packageFiles.push({
        path: "evidence-manifest.json",
        contentType: "application/json",
        content: snapshot.manifest
      });
      const objectKey = `${prefix}/evidence-manifest.json`;
      await storageClient.putObject(backupBucket, objectKey, snapshot.manifest, snapshot.manifest.length, {
        "Content-Type": "application/json"
      });
      (metadata.objects as string[]).push(objectKey);
      (metadata.objects as string[]).push(...snapshot.copiedObjects);
      metadata.evidenceManifestBytes = snapshot.manifest.length;
      metadata.evidenceObjectCount = snapshot.copiedObjects.length;
      metadata.evidenceManifestObjectKey = objectKey;
      metadata.evidenceManifestSha256 = createHash("sha256").update(snapshot.manifest).digest("hex");
    }
    const manifest = await writeBackupManifest({ backupJobId, jobType, source, userId: jobData.userId, prefix, metadata });
    packageFiles.push({
      path: "backup-manifest.json",
      contentType: "application/json",
      content: Buffer.from(JSON.stringify(manifest, null, 2), "utf8")
    });
    if (jobData.downloadableZip && jobData.downloadPassword) {
      const packageBuffer = encryptBackupPackage(packageFiles, jobData.downloadPassword);
      const packageObjectKey = `${prefix}/audity-${jobType}-backup-${timestamp}.auditybackup`;
      await storageClient.putObject(backupBucket, packageObjectKey, packageBuffer, packageBuffer.length, {
        "Content-Type": "application/octet-stream"
      });
      (metadata.objects as string[]).push(packageObjectKey);
      metadata.downloadObjectKey = packageObjectKey;
      metadata.downloadPackageBytes = packageBuffer.length;
      metadata.downloadPackageSha256 = createHash("sha256").update(packageBuffer).digest("hex");
      metadata.downloadPackageFormat = "audity-encrypted-backup-package";
      metadata.downloadPackageEncryption = "AES-256-GCM";
    }
    await pool.query(
      `update backup_jobs
       set status = 'completed',
           finished_at = now(),
           completed_at = now(),
           storage_location = $2,
           download_expires_at = case when is_downloadable_zip then $3 else download_expires_at end,
           backup_manifest = $4::jsonb,
           metadata = metadata || $5::jsonb
       where id = $1`,
      [backupJobId, `${backupBucket}/${prefix}`, twelveHoursFromNow().toISOString(), JSON.stringify(manifest), JSON.stringify(metadata)]
    );
    if (jobData.userId) {
      await appendActivityEvent(
        jobData.userId,
        "backup.completed",
        "backup_job",
        backupJobId,
        null,
        metadata
      );
    }
    return metadata;
  } catch (error) {
    await pool.query(
      `update backup_jobs
       set status = 'failed',
           finished_at = now(),
           failed_at = now(),
           failure_reason = $2,
           metadata = metadata || $3::jsonb
       where id = $1`,
      [
        backupJobId,
        error instanceof Error ? error.message : "Backup failed",
        JSON.stringify({ error: error instanceof Error ? error.message : "Backup failed" })
      ]
    );
    throw error;
  }
}

async function writeRestoreStatus(input: {
  restoreJobId: string;
  backupJobId: string;
  userId: string;
  status: "running" | "completed" | "failed";
  precheck?: unknown;
  safetyBackupJobId?: string;
  failureReason?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await pool.query(
    `insert into restore_jobs
      (id, backup_job_id, status, started_by_user_id, created_at, started_at, completed_at, failed_at,
       failure_reason, precheck_result, metadata, safety_backup_job_id)
     values
      ($1,$2,$3,$4,now(),now(),
       case when $3 = 'completed' then now() else null end,
       case when $3 = 'failed' then now() else null end,
       $5,$6::jsonb,$7::jsonb,$8)
     on conflict (id) do update set
       backup_job_id = excluded.backup_job_id,
       status = excluded.status,
       started_by_user_id = excluded.started_by_user_id,
       started_at = coalesce(restore_jobs.started_at, now()),
       completed_at = case when excluded.status = 'completed' then now() else restore_jobs.completed_at end,
       failed_at = case when excluded.status = 'failed' then now() else restore_jobs.failed_at end,
       failure_reason = excluded.failure_reason,
       precheck_result = coalesce(excluded.precheck_result, restore_jobs.precheck_result),
       metadata = restore_jobs.metadata || excluded.metadata,
       safety_backup_job_id = coalesce(excluded.safety_backup_job_id, restore_jobs.safety_backup_job_id)`,
    [
      input.restoreJobId,
      input.backupJobId,
      input.status,
      input.userId,
      input.failureReason ?? null,
      JSON.stringify(input.precheck ?? null),
      JSON.stringify(input.metadata ?? {}),
      input.safetyBackupJobId ?? null
    ]
  );
}

function backupPrefixFromRow(row: {
  backup_manifest?: { storage?: { prefix?: unknown } } | null;
  metadata?: Record<string, unknown>;
  storage_location?: string | null;
}): string {
  const manifestPrefix = row.backup_manifest?.storage?.prefix;
  if (typeof manifestPrefix === "string" && manifestPrefix.length > 0) return manifestPrefix;
  const objectKey = row.metadata?.databaseDumpObjectKey;
  if (typeof objectKey === "string" && objectKey.endsWith("/database.dump")) {
    return objectKey.slice(0, -"/database.dump".length);
  }
  if (row.storage_location?.startsWith(`${backupBucket}/`)) {
    return row.storage_location.slice(`${backupBucket}/`.length);
  }
  throw new Error("Backup storage prefix is missing");
}

async function runRestore(jobData: {
  restoreJobId: string;
  backupJobId: string;
  userId: string;
}) {
  await ensureBucket();
  const backupResult = await pool.query<{
    id: string;
    job_type: string;
    status: string;
    metadata: Record<string, unknown>;
    backup_manifest: { storage?: { prefix?: unknown } } | null;
    storage_location: string | null;
  }>("select * from backup_jobs where id = $1", [jobData.backupJobId]);
  const backup = backupResult.rows[0];
  if (!backup) throw new Error("Backup not found");
  if (backup.status !== "completed") throw new Error("Backup is not completed");
  if (backup.job_type !== "full") throw new Error("Only full backups can be restored");
  const databaseDumpObjectKey = backup.metadata?.databaseDumpObjectKey;
  if (typeof databaseDumpObjectKey !== "string") {
    throw new Error("Database dump object key is missing");
  }
  const evidenceManifestObjectKey = backup.metadata?.evidenceManifestObjectKey;
  if (typeof evidenceManifestObjectKey !== "string") {
    throw new Error("Evidence manifest object key is missing");
  }
  const backupPrefix = backupPrefixFromRow(backup);
  const databaseDump = await streamToBuffer(await storageClient.getObject(backupBucket, databaseDumpObjectKey));
  const evidenceManifest = parseEvidenceManifest(
    await streamToBuffer(await storageClient.getObject(backupBucket, evidenceManifestObjectKey))
  );
  await writeRestoreStatus({
    restoreJobId: jobData.restoreJobId,
    backupJobId: jobData.backupJobId,
    userId: jobData.userId,
    status: "running",
    metadata: {
      backupJobId: jobData.backupJobId,
      backupPrefix,
      phase: "safety_backup",
      startedAt: new Date().toISOString()
    }
  });
  try {
    const safetyBackupMetadata = await runBackup({
      jobType: "full",
      source: "pre_restore_safety",
      userId: jobData.userId
    });
    const safetyBackupJobId =
      typeof safetyBackupMetadata.backupJobId === "string" ? safetyBackupMetadata.backupJobId : undefined;
    await writeRestoreStatus({
      restoreJobId: jobData.restoreJobId,
      backupJobId: jobData.backupJobId,
      userId: jobData.userId,
      status: "running",
      safetyBackupJobId,
      metadata: {
        backupJobId: jobData.backupJobId,
        backupPrefix,
        safetyBackupJobId,
        phase: "database_restore"
      }
    });
    await pgRestore(databaseDump);
    await pool.query(
      `update backup_jobs
       set status = 'completed',
           finished_at = coalesce(finished_at, now()),
           completed_at = coalesce(completed_at, now())
       where id = $1 and status in ('queued', 'running')`,
      [jobData.backupJobId]
    );
    await writeRestoreStatus({
      restoreJobId: jobData.restoreJobId,
      backupJobId: jobData.backupJobId,
      userId: jobData.userId,
      status: "running",
      safetyBackupJobId,
      metadata: {
        backupJobId: jobData.backupJobId,
        backupPrefix,
        safetyBackupJobId,
        phase: "evidence_restore"
      }
    });
    const evidenceResult = await restoreEvidenceObjects(evidenceManifest.copiedObjects);
    await writeRestoreStatus({
      restoreJobId: jobData.restoreJobId,
      backupJobId: jobData.backupJobId,
      userId: jobData.userId,
      status: "completed",
      safetyBackupJobId,
      metadata: {
        backupJobId: jobData.backupJobId,
        backupPrefix,
        safetyBackupJobId,
        phase: "completed",
        evidenceRestoredObjects: evidenceResult.restoredObjects.length,
        evidenceRemovedObjects: evidenceResult.removedObjects,
        completedAt: new Date().toISOString()
      }
    });
    return { safetyBackupJobId, ...evidenceResult };
  } catch (error) {
    await writeRestoreStatus({
      restoreJobId: jobData.restoreJobId,
      backupJobId: jobData.backupJobId,
      userId: jobData.userId,
      status: "failed",
      failureReason: error instanceof Error ? error.message : "Restore failed",
      metadata: {
        backupJobId: jobData.backupJobId,
        phase: "failed",
        error: error instanceof Error ? error.message : "Restore failed"
      }
    });
    throw error;
  }
}

async function verifyDatabaseConnection(): Promise<void> {
  const result = await pool.query<{ ok: number }>("select 1 as ok");
  if (result.rows[0]?.ok !== 1) {
    throw new Error("Worker database connection check failed");
  }
}

app.get("/health", async () => ({
  status: "ok",
  process: "audity-worker",
  version: "0.2.1"
}));

await verifyDatabaseConnection();
await ensureBucket();

new Worker(
  "audity-report-export",
  async (job) => {
    if (job.name === "export-report-xlsx") {
      return runXlsxExport(job);
    }
    return runPdfExport(job);
  },
  {
    connection: {
      url: redisUrl
    }
  }
);

async function runPdfExport(job: Job): Promise<{ objectKey: string }> {
  const { reportId, userId } = job.data as {
    assessmentId: string;
    reportId: string;
    userId: string;
  };
  await job.updateProgress(10);
  const report = await pool.query<{ html_preview: string }>(
    "select html_preview from reports where id = $1",
    [reportId]
  );
  if (!report.rows[0]) {
    throw new Error("Report not found");
  }
  await pool.query("update reports set status = 'rendering', updated_at = now() where id = $1", [
    reportId
  ]);
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  try {
    const page = await browser.newPage();
    await page.setContent(report.rows[0].html_preview, { waitUntil: "load" });
    await job.updateProgress(60);
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    const objectKey = `reports/${reportId}/audity-report.pdf`;
    await storageClient.putObject(storageBucket, objectKey, Buffer.from(pdf), pdf.length, {
      "Content-Type": "application/pdf"
    });
    await pool.query(
      `update reports
       set status = 'exported',
           pdf_object_key = $2,
           exported_at = now(),
           content = content || $3::jsonb,
           updated_at = now()
       where id = $1`,
      [
        reportId,
        objectKey,
        JSON.stringify({
          generationTimestamp: new Date().toISOString(),
          reportVersion: 1,
          pdfObjectKey: objectKey
        })
      ]
    );
    await appendReportExported(userId, reportId, objectKey);
    await job.updateProgress(100);
    return { objectKey };
  } catch (error) {
    await pool.query(
      "update reports set status = 'export_failed', updated_at = now() where id = $1",
      [reportId]
    ).catch(() => undefined);
    throw error;
  } finally {
    await browser.close();
  }
}

async function runXlsxExport(job: Job): Promise<{ objectKey: string }> {
  const { assessmentId, reportId, userId } = job.data as {
    assessmentId: string;
    reportId: string;
    userId: string;
  };
  await job.updateProgress(10);
  await pool.query("update reports set status = 'rendering', updated_at = now() where id = $1", [
    reportId
  ]);

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Audity";
  workbook.created = new Date();

  const assessment = await pool.query<{
    id: string;
    name: string;
    customer_name: string;
    status: string;
  }>(
    `select a.id::text, a.name, c.name as customer_name, a.status
       from assessments a
       join customers c on c.id = a.customer_id
      where a.id = $1`,
    [assessmentId]
  );
  const overview = workbook.addWorksheet("Overview");
  overview.columns = [
    { header: "Field", key: "field", width: 24 },
    { header: "Value", key: "value", width: 60 }
  ];
  overview.addRows([
    { field: "Customer", value: assessment.rows[0]?.customer_name ?? "" },
    { field: "Assessment", value: assessment.rows[0]?.name ?? "" },
    { field: "Status", value: assessment.rows[0]?.status ?? "" },
    { field: "Generated", value: new Date().toISOString() },
    { field: "Report ID", value: reportId }
  ]);
  overview.getRow(1).font = { bold: true };

  await job.updateProgress(30);

  const controls = await pool.query<{
    control_code: string;
    control_title: string;
    score: number | null;
    answer_text: string | null;
    notes: string | null;
    framework_name: string;
  }>(
    `select fc.control_code,
            fc.title as control_title,
            ca.score,
            ca.answer_text,
            ca.notes,
            f.name as framework_name
       from control_answers ca
       join assessment_questions aq on aq.id = ca.assessment_question_id
       join framework_controls fc on fc.id = aq.framework_control_id
       join framework_domains fd on fd.id = fc.framework_domain_id
       join frameworks f on f.id = fd.framework_id
      where aq.assessment_id = $1
      order by f.name, fc.control_code`,
    [assessmentId]
  );
  const controlsSheet = workbook.addWorksheet("Controls");
  controlsSheet.columns = [
    { header: "Framework", key: "framework", width: 22 },
    { header: "Control", key: "code", width: 14 },
    { header: "Title", key: "title", width: 48 },
    { header: "Score", key: "score", width: 8 },
    { header: "Answer", key: "answer", width: 60 },
    { header: "Notes", key: "notes", width: 40 }
  ];
  for (const row of controls.rows) {
    controlsSheet.addRow({
      framework: row.framework_name,
      code: row.control_code,
      title: row.control_title,
      score: row.score,
      answer: row.answer_text,
      notes: row.notes
    });
  }
  controlsSheet.getRow(1).font = { bold: true };
  controlsSheet.autoFilter = { from: "A1", to: "F1" };

  await job.updateProgress(55);

  const findings = await pool.query<{
    id: string;
    title: string;
    severity: string | null;
    status: string | null;
    description: string | null;
    recommendation: string | null;
    control_code: string | null;
  }>(
    `select f.id::text, f.title, f.severity, f.status, f.description, f.recommendation, fc.control_code
       from findings f
       left join framework_controls fc on fc.id = f.framework_control_id
      where f.assessment_id = $1
      order by f.severity desc nulls last, f.title`,
    [assessmentId]
  ).catch(() => ({ rows: [] as Array<never> }));
  const findingsSheet = workbook.addWorksheet("Findings");
  findingsSheet.columns = [
    { header: "Title", key: "title", width: 42 },
    { header: "Severity", key: "severity", width: 12 },
    { header: "Status", key: "status", width: 14 },
    { header: "Control", key: "control_code", width: 14 },
    { header: "Description", key: "description", width: 50 },
    { header: "Recommendation", key: "recommendation", width: 50 }
  ];
  for (const row of findings.rows) {
    findingsSheet.addRow(row);
  }
  findingsSheet.getRow(1).font = { bold: true };
  if (findings.rows.length > 0) findingsSheet.autoFilter = { from: "A1", to: "F1" };

  await job.updateProgress(75);

  const risks = await pool.query<{
    id: string;
    title: string;
    likelihood: string | null;
    impact: string | null;
    status: string | null;
    treatment: string | null;
    owner: string | null;
  }>(
    `select id::text, title, likelihood, impact, status, treatment, owner
       from risks
      where assessment_id = $1
      order by status, title`,
    [assessmentId]
  ).catch(() => ({ rows: [] as Array<never> }));
  const risksSheet = workbook.addWorksheet("Risks");
  risksSheet.columns = [
    { header: "Title", key: "title", width: 42 },
    { header: "Likelihood", key: "likelihood", width: 14 },
    { header: "Impact", key: "impact", width: 14 },
    { header: "Status", key: "status", width: 14 },
    { header: "Treatment", key: "treatment", width: 30 },
    { header: "Owner", key: "owner", width: 20 }
  ];
  for (const row of risks.rows) {
    risksSheet.addRow(row);
  }
  risksSheet.getRow(1).font = { bold: true };
  if (risks.rows.length > 0) risksSheet.autoFilter = { from: "A1", to: "F1" };

  await job.updateProgress(90);

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const objectKey = `reports/${reportId}/audity-report.xlsx`;
  await storageClient.putObject(storageBucket, objectKey, buffer, buffer.length, {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  await pool.query(
    `update reports
       set status = 'exported',
           exported_at = now(),
           content = content || $2::jsonb,
           updated_at = now()
     where id = $1`,
    [
      reportId,
      JSON.stringify({
        xlsxObjectKey: objectKey,
        xlsxGeneratedAt: new Date().toISOString()
      })
    ]
  );
  await appendReportExported(userId, reportId, objectKey);
  await job.updateProgress(100);
  return { objectKey };
}

new Worker(
  "audity-email-send",
  async (job) => {
    return sendSecureReportEmail(job.data as {
      assessmentId: string;
      reportId: string;
      userId: string;
      recipient: string;
      subject: string;
      message: string;
      packageObjectKey: string;
    });
  },
  {
    connection: {
      url: redisUrl
    }
  }
);

new Worker(
  "audity-backup",
  async (job) => runBackup(job.data as {
    backupJobId?: string;
    jobType?: "full" | "database" | "evidence";
    userId?: string;
    source?: string;
    downloadableZip?: boolean;
    downloadPassword?: string;
  }),
  {
    connection: {
      url: redisUrl
    }
  }
);

new Worker(
  "audity-restore",
  async (job) => runRestore(job.data as {
    restoreJobId: string;
    backupJobId: string;
    userId: string;
  }),
  {
    connection: {
      url: redisUrl
    }
  }
);

await app.listen({
  host: "0.0.0.0",
  port: Number(process.env.WORKER_HEALTH_PORT ?? 3001)
});

process.on("unhandledRejection", (reason) => {
  app.log.error({ reason }, "Unhandled promise rejection in worker");
});
process.on("uncaughtException", (error) => {
  app.log.fatal({ err: error }, "Uncaught exception in worker — exiting");
  setTimeout(() => process.exit(1), 100).unref();
});

let workerShuttingDown = false;
async function shutdownWorker(signal: string) {
  if (workerShuttingDown) return;
  workerShuttingDown = true;
  app.log.info({ signal }, "Shutting down worker");
  try {
    await app.close();
  } catch (err) {
    app.log.error({ err }, "Worker shutdown error");
  } finally {
    process.exit(0);
  }
}
process.once("SIGTERM", () => void shutdownWorker("SIGTERM"));
process.once("SIGINT", () => void shutdownWorker("SIGINT"));
