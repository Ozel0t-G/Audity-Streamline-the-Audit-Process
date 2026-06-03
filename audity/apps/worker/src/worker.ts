import Fastify from "fastify";
import { Worker } from "bullmq";
import { Client } from "minio";
import { createDecipheriv, createHash, randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import pg from "pg";
import puppeteer from "puppeteer-core";

const app = Fastify({
  logger: {
    level: process.env.AUDITY_LOG_LEVEL ?? "info"
  }
});

const pool = new pg.Pool({
  connectionString:
    process.env.AUDITY_DATABASE_URL ??
    "postgres://audity:change-me@audity-db:5432/audity"
});

const storageEndpoint = new URL(
  process.env.AUDITY_STORAGE_ENDPOINT ?? "http://audity-storage:9000"
);
const storageBucket = process.env.AUDITY_STORAGE_BUCKET ?? "audity-evidence";
const storageClient = new Client({
  endPoint: storageEndpoint.hostname,
  port: Number(storageEndpoint.port || 9000),
  useSSL: storageEndpoint.protocol === "https:",
  accessKey: process.env.AUDITY_STORAGE_ACCESS_KEY ?? "replace-me",
  secretKey: process.env.AUDITY_STORAGE_SECRET_KEY ?? "replace-me"
});

async function ensureBucket(): Promise<void> {
  if (!(await storageClient.bucketExists(storageBucket))) {
    await storageClient.makeBucket(storageBucket);
  }
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
    const payload = JSON.stringify({ before, after });
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
        JSON.stringify(before),
        JSON.stringify(after),
        prevHash || null,
        eventHash,
        timestamp
      ]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
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

async function verifyDatabaseConnection(): Promise<void> {
  const result = await pool.query<{ ok: number }>("select 1 as ok");
  if (result.rows[0]?.ok !== 1) {
    throw new Error("Worker database connection check failed");
  }
}

app.get("/health", async () => ({
  status: "ok",
  process: "audity-worker",
  version: "0.1.0"
}));

await verifyDatabaseConnection();
await ensureBucket();

new Worker(
  "audity-report-export",
  async (job) => {
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
    } finally {
      await browser.close();
    }
  },
  {
    connection: {
      url: process.env.AUDITY_REDIS_URL ?? "redis://audity-redis:6379"
    }
  }
);

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
      url: process.env.AUDITY_REDIS_URL ?? "redis://audity-redis:6379"
    }
  }
);

await app.listen({
  host: "0.0.0.0",
  port: Number(process.env.WORKER_HEALTH_PORT ?? 3001)
});
