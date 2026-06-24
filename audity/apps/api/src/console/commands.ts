import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { AUDITY_VERSION } from "@audity/shared";
import { loadConfig } from "../config.js";
import { applyCoreSchema } from "../db/schema.js";
import { pool } from "../db/client.js";
import { backupQueue } from "../jobs/queue.js";

// Fixed set of services any container command may target. Anything else is rejected
// before it can reach the (no-shell) executor.
const SERVICES = ["api", "web", "worker", "db", "redis", "storage"] as const;
export type ServiceName = (typeof SERVICES)[number];

export type CommandArg = {
  name: string;
  kind: "service" | "int";
  required?: boolean;
  max?: number;
  default?: number;
};

export type CommandSpec = {
  name: string;
  category: "Container & services" | "Database" | "Diagnostics";
  description: string;
  args?: CommandArg[];
};

// The allowlist. This is the ENTIRE surface of the console — nothing outside it runs.
export const COMMAND_ALLOWLIST: CommandSpec[] = [
  { name: "status", category: "Container & services", description: "Show all Audity containers with status and health." },
  { name: "restart", category: "Container & services", description: "Restart a single service.", args: [{ name: "service", kind: "service", required: true }] },
  { name: "logs", category: "Container & services", description: "Show the last N log lines of a service.", args: [{ name: "service", kind: "service", required: true }, { name: "lines", kind: "int", max: 1000, default: 100 }] },
  { name: "disk", category: "Container & services", description: "Docker disk usage (images, containers, volumes)." },
  { name: "prune", category: "Container & services", description: "Reclaim disk: remove stopped containers, dangling images and build cache (keeps data volumes and running containers)." },
  { name: "db:status", category: "Database", description: "Database reachability and table count." },
  { name: "db:migrate", category: "Database", description: "Apply any pending database migrations (idempotent)." },
  { name: "backup:create", category: "Database", description: "Queue a full backup job." },
  { name: "backup:list", category: "Database", description: "List the most recent backup jobs." },
  { name: "health", category: "Diagnostics", description: "Reachability of database and Redis from the API." },
  { name: "version", category: "Diagnostics", description: "Installed Audity version." },
  { name: "whoami", category: "Diagnostics", description: "The admin and role running this console." }
];

export type RunContext = { userId: string; userEmail: string; userName: string; userRole: string };

function validateService(value: unknown): ServiceName {
  if (typeof value === "string" && (SERVICES as readonly string[]).includes(value)) {
    return value as ServiceName;
  }
  throw new Error(`Invalid service. Allowed: ${SERVICES.join(", ")}`);
}

async function updaterFetch(path: string, body?: unknown): Promise<Record<string, unknown>> {
  const url = process.env.AUDITY_UPDATER_URL;
  const token = process.env.AUDITY_UPDATER_TOKEN;
  if (!url || !token) {
    throw new Error("Container commands are unavailable: the updater service is not configured on this server.");
  }
  const res = await fetch(`${url}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof data.message === "string" ? data.message : `Updater returned ${res.status}`);
  return data;
}

/**
 * Dispatch one allowlisted command. The name is matched against a fixed switch — there
 * is no dynamic command construction and no shell anywhere. Container actions are
 * delegated to the token-gated updater (the only component with the Docker socket).
 */
export async function runCommand(name: string, args: Record<string, unknown>, ctx: RunContext): Promise<{ output: string }> {
  switch (name) {
    case "status":
      return { output: String((await updaterFetch("/exec", { action: "status" })).output ?? "") };
    case "disk":
      return { output: String((await updaterFetch("/exec", { action: "disk" })).output ?? "") };
    case "prune":
      return { output: String((await updaterFetch("/exec", { action: "prune" })).output ?? "") || "Nothing to reclaim." };
    case "restart": {
      const service = validateService(args.service);
      return { output: String((await updaterFetch("/exec", { action: "restart", service })).output ?? "") };
    }
    case "logs": {
      const service = validateService(args.service);
      const lines = Math.min(1000, Math.max(1, Math.floor(Number(args.lines) || 100)));
      return { output: String((await updaterFetch("/exec", { action: "logs", service, lines })).output ?? "") };
    }
    case "db:status": {
      const tables = await pool.query<{ count: string }>(
        "select count(*)::text as count from information_schema.tables where table_schema = 'public'"
      );
      return { output: `Database reachable. Public tables: ${tables.rows[0]?.count ?? "?"}.` };
    }
    case "db:migrate": {
      await applyCoreSchema();
      return { output: "Migrations applied — database schema is up to date." };
    }
    case "backup:create": {
      // Mirror the admin backup flow: create the backup_jobs row first, then enqueue
      // with backupJobId — the worker UPDATES that row by id, so it must exist.
      const id = randomUUID();
      await pool.query(
        `insert into backup_jobs
           (id, job_type, source, status, started_at, created_by_user_id, is_downloadable_zip, metadata)
         values ($1, 'full', 'console', 'queued', now(), $2, false, $3::jsonb)`,
        [id, ctx.userId, JSON.stringify({ requestedBy: ctx.userId, requestedAt: new Date().toISOString() })]
      );
      await backupQueue.add("run-backup", { backupJobId: id, jobType: "full", userId: ctx.userId, source: "console", downloadableZip: false });
      return { output: `Full backup queued (job ${id}).` };
    }
    case "backup:list": {
      const rows = await pool.query<{ id: string; status: string; job_type: string; created_at: string }>(
        "select id::text, status, job_type, created_at::text from backup_jobs order by created_at desc limit 10"
      );
      if (!rows.rows.length) return { output: "No backups yet." };
      return { output: rows.rows.map((r) => `${r.created_at}  ${r.job_type.padEnd(6)}  ${r.status.padEnd(10)}  ${r.id}`).join("\n") };
    }
    case "health": {
      const parts: string[] = [];
      try {
        await pool.query("select 1");
        parts.push("database: ok");
      } catch (e) {
        parts.push(`database: FAIL (${e instanceof Error ? e.message : "error"})`);
      }
      const redis = new Redis(loadConfig().redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true, connectTimeout: 3000 });
      redis.on("error", () => undefined);
      try {
        await redis.connect();
        const pong = await redis.ping();
        parts.push(pong === "PONG" ? "redis: ok" : `redis: unexpected (${pong})`);
      } catch (e) {
        parts.push(`redis: FAIL (${e instanceof Error ? e.message : "error"})`);
      } finally {
        redis.disconnect();
      }
      return { output: parts.join("\n") + "\n(Use 'status' for per-container health.)" };
    }
    case "version":
      return { output: `Audity ${AUDITY_VERSION}` };
    case "whoami":
      return { output: `${ctx.userName} <${ctx.userEmail}> — role: ${ctx.userRole}` };
    default:
      throw new Error("Unknown command");
  }
}
