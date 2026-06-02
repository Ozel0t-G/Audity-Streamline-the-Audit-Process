import Fastify from "fastify";
import pg from "pg";

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
await app.listen({
  host: "0.0.0.0",
  port: Number(process.env.WORKER_HEALTH_PORT ?? 3001)
});
