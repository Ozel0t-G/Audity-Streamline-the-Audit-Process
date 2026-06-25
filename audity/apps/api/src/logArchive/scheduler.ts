import { pool } from "../db/client.js";
import { publishEmailTopic } from "../notifications/emailTopics.js";
import { runLogArchive } from "./service.js";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly tick
// Run when the last archive is older than this. 23h (not 24h) tolerates tick
// drift so we never silently skip a day.
const DUE_AFTER_MS = 23 * 60 * 60 * 1000;

async function isDue(): Promise<boolean> {
  const result = await pool.query<{ last_archived_at: Date | null }>(
    "select last_archived_at from log_archive_settings where id = 'default'"
  );
  const last = result.rows[0]?.last_archived_at;
  if (!last) return true;
  return Date.now() - new Date(last).getTime() >= DUE_AFTER_MS;
}

/**
 * Start the mandatory log-archival scheduler. This is wired UNCONDITIONALLY into
 * API boot — there is no settings flag and no API path that can stop it, so
 * neither a user nor an admin can disable the 24h archival of audit/activity logs.
 */
export function startLogArchiveScheduler(logger?: {
  info: (value: unknown, message?: string) => void;
  error: (value: unknown, message?: string) => void;
}) {
  let running = false;

  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      if (!(await isDue())) return;
      logger?.info({}, "Log archive scheduler: starting run");
      const result = await runLogArchive();
      if (result.status === "failed") {
        logger?.error(result, "Log archive run failed");
        await publishEmailTopic({
          topic: "backup.failed",
          subject: "Audity log archival failed",
          text: `The mandatory 24h archival of audit/activity logs failed: ${result.reason ?? "unknown error"}`
        }).catch(() => undefined);
      } else {
        logger?.info(result, "Log archive scheduler: completed");
      }
    } catch (error) {
      logger?.error(error, "Log archive scheduler tick crashed");
    } finally {
      running = false;
    }
  }

  // First tick shortly after boot, then hourly.
  const initial = setTimeout(() => void tick(), 60_000);
  initial.unref();
  const timer = setInterval(() => void tick(), CHECK_INTERVAL_MS);
  timer.unref();
  return timer;
}
