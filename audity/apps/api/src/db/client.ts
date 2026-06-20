import pg from "pg";
import { loadConfig } from "../config.js";

const { Pool } = pg;

const parsedPoolMax = Number.parseInt(process.env.AUDITY_DB_POOL_MAX ?? "", 10);
const poolMax = Number.isFinite(parsedPoolMax) && parsedPoolMax > 0 ? parsedPoolMax : 20;

export const pool = new Pool({
  connectionString: loadConfig().databaseUrl,
  max: poolMax,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

// Surface unexpected idle client errors instead of crashing the process.
pool.on("error", (error) => {
  console.error("[db] idle pg client error", error);
});

export async function verifyDatabaseConnection(): Promise<void> {
  const result = await pool.query<{ ok: number }>("select 1 as ok");
  if (result.rows[0]?.ok !== 1) {
    throw new Error("Database connection check failed");
  }
}
