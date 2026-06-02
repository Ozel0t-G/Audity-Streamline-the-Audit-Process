import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./client.js";

const currentDir = dirname(fileURLToPath(import.meta.url));

export async function applyCoreSchema(): Promise<void> {
  const sql = await readFile(
    join(currentDir, "migrations", "001_core_schema.sql"),
    "utf8"
  );
  await pool.query(sql);
}
