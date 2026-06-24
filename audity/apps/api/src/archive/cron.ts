import { pool } from "../db/client.js";
import { loadConfig } from "../config.js";
import { bundleMonth } from "./bundle.js";
import { publishEmailTopic } from "../notifications/emailTopics.js";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

function lastMonth(now: Date = new Date()): string {
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function alreadyBundled(month: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `select exists(
      select 1 from archive_index
       where archive_month = $1
         and archive_state = 'bundled'
    ) as exists`,
    [month]
  );
  return result.rows[0]?.exists === true;
}

async function hasSpooledForMonth(month: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `select exists(
      select 1 from archive_index
       where archive_month = $1
         and archive_state = 'spool'
    ) as exists`,
    [month]
  );
  return result.rows[0]?.exists === true;
}

/**
 * Hourly tick: on the configured day-of-month, bundle the previous month if
 * it has spooled archives and hasn't been bundled yet.
 *
 * Idempotent — running multiple times in one day is safe because
 * `bundleMonth` only operates on rows with `archive_state = 'spool'`, and
 * subsequent runs find none.
 */
export function startArchiveBundleCron(logger?: {
  info: (value: unknown, message?: string) => void;
  error: (value: unknown, message?: string) => void;
}) {
  const cfg = loadConfig();
  const targetDay = Math.max(1, Math.min(28, cfg.archiveBundleDayOfMonth));
  // Prevent overlapping ticks: bundling a large month can take longer than the 1h
  // interval, and a second concurrent bundleMonth races the first's spool-dir cleanup
  // (spurious "bundle failed" alert). A single-process flag is enough here.
  let running = false;

  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const now = new Date();
      if (now.getUTCDate() !== targetDay) return;
      const month = lastMonth(now);
      if (!(await hasSpooledForMonth(month))) return;
      if (await alreadyBundled(month)) return;
      logger?.info({ month }, "Archive bundle cron: starting bundle");
      const result = await bundleMonth(month, null);
      logger?.info(result, "Archive bundle cron: completed");
    } catch (error) {
      logger?.error(error, "Archive bundle cron failed");
      await publishEmailTopic({
        topic: "archive.bundle_failed",
        subject: "Archive monthly bundle failed",
        text: `Archive bundling failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      }).catch(() => undefined);
    } finally {
      running = false;
    }
  }

  void tick();
  const timer = setInterval(() => void tick(), CHECK_INTERVAL_MS);
  timer.unref();
  return timer;
}
