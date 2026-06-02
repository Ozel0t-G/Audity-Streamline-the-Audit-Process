import Fastify from "fastify";
import { Worker } from "bullmq";
import { Client } from "minio";
import { createHash, randomUUID } from "node:crypto";
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

async function appendReportExported(userId: string, reportId: string, objectKey: string): Promise<void> {
  const previous = await pool.query<{ event_hash: string }>(
    "select event_hash from user_activity_logs order by created_at desc limit 1"
  );
  const timestamp = new Date().toISOString();
  const prevHash = previous.rows[0]?.event_hash ?? "";
  const before = null;
  const after = { reportId, objectKey };
  const payload = JSON.stringify({ before, after });
  const eventHash = createHash("sha256")
    .update(timestamp + userId + "report.exported" + reportId + payload + prevHash)
    .digest("hex");
  await pool.query(
    `insert into user_activity_logs
      (id, user_id, action, entity_type, entity_id, before_value, after_value, prev_hash, event_hash, created_at)
     values ($1, $2, 'report.exported', 'report', $3, $4, $5, $6, $7, $8)`,
    [
      randomUUID(),
      userId,
      reportId,
      JSON.stringify(before),
      JSON.stringify(after),
      prevHash || null,
      eventHash,
      timestamp
    ]
  );
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

await app.listen({
  host: "0.0.0.0",
  port: Number(process.env.WORKER_HEALTH_PORT ?? 3001)
});
