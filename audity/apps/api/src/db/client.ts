import pg from "pg";
import { loadConfig } from "../config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: loadConfig().databaseUrl
});

export async function verifyDatabaseConnection(): Promise<void> {
  const result = await pool.query<{ ok: number }>("select 1 as ok");
  if (result.rows[0]?.ok !== 1) {
    throw new Error("Database connection check failed");
  }
}
