import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./client.js";

const currentDir = dirname(fileURLToPath(import.meta.url));

export async function applyCoreSchema(): Promise<void> {
  const migrationsDir = join(currentDir, "migrations");
  const entries = await readdir(migrationsDir);
  const files = entries.filter((name) => name.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = await readFile(join(migrationsDir, file), "utf8");
    await pool.query(sql);
  }
}
