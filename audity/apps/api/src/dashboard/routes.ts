import { randomUUID } from "node:crypto";
import os from "node:os";
import { statfs } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { requirePermission } from "../auth/hooks.js";
import { pool } from "../db/client.js";

type DashboardRange = "6h" | "24h" | "1w" | "1m";

const rangeIntervals: Record<DashboardRange, string> = {
  "6h": "6 hours",
  "24h": "24 hours",
  "1w": "7 days",
  "1m": "1 month"
};

function isDashboardRange(value: unknown): value is DashboardRange {
  return value === "6h" || value === "24h" || value === "1w" || value === "1m";
}

function isAdminRole(role?: string): boolean {
  return role === "Instance Admin" || role === "Tenant Admin";
}

function serverIp(): string {
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const entry of interfaces ?? []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return "127.0.0.1";
}

async function collectSystemSnapshot() {
  const cpus = Math.max(1, os.cpus().length);
  const loadPercent = Math.min(100, Math.round((os.loadavg()[0] / cpus) * 100));
  const totalMemory = os.totalmem();
  const usedMemory = totalMemory - os.freemem();
  const memoryPercent = Math.round((usedMemory / totalMemory) * 100);
  const storage = await statfs(process.cwd());
  const totalStorage = storage.blocks * storage.bsize;
  const freeStorage = storage.bfree * storage.bsize;
  const usedStorage = totalStorage - freeStorage;
  const storagePercent = totalStorage > 0 ? Math.round((usedStorage / totalStorage) * 100) : 0;
  const issues = [
    loadPercent >= 90 ? "High CPU load" : null,
    memoryPercent >= 90 ? "High memory usage" : null,
    storagePercent >= 90 ? "Low free storage" : null
  ].filter((issue): issue is string => Boolean(issue));

  const snapshot = {
    status: issues.length ? "degraded" : "online",
    cpuPercent: loadPercent,
    memoryPercent,
    storagePercent,
    memoryUsedBytes: usedMemory,
    memoryTotalBytes: totalMemory,
    storageUsedBytes: usedStorage,
    storageTotalBytes: totalStorage,
    serverIp: serverIp(),
    hostname: os.hostname(),
    uptimeSeconds: Math.round(os.uptime()),
    issues
  };

  await pool.query(
    `insert into system_health_samples
      (id, status, cpu_percent, memory_percent, storage_percent, server_ip, issues)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      randomUUID(),
      snapshot.status,
      snapshot.cpuPercent,
      snapshot.memoryPercent,
      snapshot.storagePercent,
      snapshot.serverIp,
      JSON.stringify(snapshot.issues)
    ]
  );
  await pool.query("delete from system_health_samples where created_at < now() - interval '45 days'");

  return snapshot;
}

async function loadTimeline(range: DashboardRange) {
  const result = await pool.query(
    `select status,
            round(cpu_percent)::int as cpu_percent,
            round(memory_percent)::int as memory_percent,
            round(storage_percent)::int as storage_percent,
            server_ip,
            issues,
            created_at
     from system_health_samples
     where created_at >= now() - ($1::text)::interval
     order by created_at asc
     limit 500`,
    [rangeIntervals[range]]
  );
  return result.rows.map((row) => ({
    status: row.status,
    cpuPercent: Number(row.cpu_percent),
    memoryPercent: Number(row.memory_percent),
    storagePercent: Number(row.storage_percent),
    serverIp: row.server_ip,
    issues: row.issues ?? [],
    createdAt: row.created_at
  }));
}

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { range?: string } }>(
    "/api/dashboard",
    { preHandler: requirePermission("assessment.view") },
    async (request) => {
      const range = isDashboardRange(request.query.range) ? request.query.range : "24h";
      const admin = isAdminRole(request.user!.role);
      const owned = await pool.query(
        `select c.id as customer_id,
                c.name as customer_name,
                c.status as customer_status,
                coalesce(
                  json_agg(distinct jsonb_build_object('id', su.id, 'name', su.name, 'email', su.email))
                    filter (where su.id is not null),
                  '[]'::json
                ) as shared_with,
                coalesce(
                  json_agg(distinct jsonb_build_object(
                    'id', a.id,
                    'type', a.type,
                    'framework', a.framework,
                    'status', a.status,
                    'targetDate', a.target_date,
                    'progressPercent',
                      case
                        when q.total_questions = 0 then 0
                        else round((coalesce(ans.answered_questions, 0)::numeric / q.total_questions::numeric) * 100)::int
                      end
                  )) filter (where a.id is not null),
                  '[]'::json
                ) as assessments
         from customers c
         left join customer_shares cs on cs.customer_id = c.id and cs.revoked_at is null
         left join users su on su.id = cs.shared_with_user_id
         left join assessments a on a.customer_id = c.id
         left join lateral (
           select count(*)::int as total_questions
           from assessment_questions aq
           where aq.assessment_id = a.id
         ) q on true
         left join lateral (
           select count(distinct ca.assessment_question_id)::int as answered_questions
           from control_answers ca
           join assessment_questions aq on aq.id = ca.assessment_question_id
           where aq.assessment_id = a.id
             and (ca.score is not null or ca.answer_state <> 'unknown')
         ) ans on true
         where c.archived_at is null and c.created_by_user_id = $1
         group by c.id
         order by max(coalesce(a.updated_at, c.updated_at)) desc nulls last
         limit 20`,
        [request.user!.sub]
      );

      const shared = await pool.query(
        `select c.id,
                c.name,
                c.status,
                creator.name as owner_name,
                creator.email as owner_email,
                cs.created_at as shared_at,
                coalesce(
                  json_agg(distinct jsonb_build_object('id', a.id, 'type', a.type, 'framework', a.framework, 'status', a.status))
                    filter (where a.id is not null),
                  '[]'::json
                ) as assessments
         from customer_shares cs
         join customers c on c.id = cs.customer_id and c.archived_at is null
         left join users creator on creator.id = c.created_by_user_id
         left join assessments a on a.customer_id = c.id
         where cs.shared_with_user_id = $1 and cs.revoked_at is null and c.created_by_user_id <> $1
         group by c.id, creator.id, cs.created_at
         order by cs.created_at desc
         limit 20`,
        [request.user!.sub]
      );

      if (!admin) {
        return {
          ownedCustomers: owned.rows.map((row) => ({
            customerId: row.customer_id,
            customerName: row.customer_name,
            customerStatus: row.customer_status,
            sharedWith: row.shared_with ?? [],
            assessments: row.assessments ?? []
          })),
          sharedCustomers: shared.rows.map((row) => ({
            id: row.id,
            name: row.name,
            status: row.status,
            ownerName: row.owner_name,
            ownerEmail: row.owner_email,
            sharedAt: row.shared_at,
            assessments: row.assessments ?? []
          })),
          system: null
        };
      }

      const snapshot = await collectSystemSnapshot();
      return {
        ownedCustomers: owned.rows.map((row) => ({
          customerId: row.customer_id,
          customerName: row.customer_name,
          customerStatus: row.customer_status,
          sharedWith: row.shared_with ?? [],
          assessments: row.assessments ?? []
        })),
        sharedCustomers: shared.rows.map((row) => ({
          id: row.id,
          name: row.name,
          status: row.status,
          ownerName: row.owner_name,
          ownerEmail: row.owner_email,
          sharedAt: row.shared_at,
          assessments: row.assessments ?? []
        })),
        system: {
          snapshot,
          timeline: await loadTimeline(range),
          range
        }
      };
    }
  );
}
