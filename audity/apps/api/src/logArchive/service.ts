import { randomUUID } from "node:crypto";
import { pool } from "../db/client.js";
import { encryptText, decryptText } from "../utils/crypto.js";
import { appendAuditEvent } from "../audit/service.js";
import { appendActivityEvent } from "../activity/service.js";
import { buildLogArchiveBundle } from "./bundle.js";
import {
  getDestination,
  type DestinationType,
  type ResolvedDestinationConfig
} from "./destinations/index.js";

// Pull the whole 24h window in one bundle. The app's audit/activity volume is
// modest; if a run ever exceeds this, the watermark still advances and the
// remainder is picked up on the next tick.
const MAX_ROWS_PER_RUN = 100_000;

const SECRET_KEYS = ["password", "secretKey"] as const;

type SettingsRow = {
  destination_type: DestinationType;
  destination_config: Record<string, unknown>;
  last_archived_at: Date | null;
  last_audit_log_id: string | null;
  last_audit_log_at: Date | null;
  last_activity_log_id: string | null;
  last_activity_log_at: Date | null;
  last_bundle_checksum: string | null;
};

/** Destination config with secrets supplied in plaintext (UI input shape). */
export type DestinationInput =
  | { type: "local"; path?: string }
  | {
      type: "sftp";
      host: string;
      port?: number;
      username: string;
      password?: string;
      remotePath: string;
    }
  | {
      type: "s3";
      endpoint: string;
      region?: string;
      bucket: string;
      accessKey: string;
      secretKey?: string;
      prefix?: string;
      useSSL?: boolean;
    }
  | {
      type: "ftp";
      host: string;
      port?: number;
      username: string;
      password?: string;
      remotePath: string;
      secure?: boolean;
    };

async function loadSettingsRow(): Promise<SettingsRow> {
  const result = await pool.query<SettingsRow>(
    "select * from log_archive_settings where id = 'default'"
  );
  const row = result.rows[0];
  if (row) return row;
  // Defensive: migration seeds this row, but guarantee it exists.
  await pool.query(
    "insert into log_archive_settings (id, destination_type, destination_config) values ('default','local','{}'::jsonb) on conflict (id) do nothing"
  );
  return {
    destination_type: "local",
    destination_config: {},
    last_archived_at: null,
    last_audit_log_id: null,
    last_audit_log_at: null,
    last_activity_log_id: null,
    last_activity_log_at: null,
    last_bundle_checksum: null
  };
}

/** Public view of the settings — secrets are never returned, only presence flags. */
export async function getPublicSettings() {
  const row = await loadSettingsRow();
  const config: Record<string, unknown> = { ...row.destination_config };
  const flags: Record<string, boolean> = {};
  for (const key of SECRET_KEYS) {
    if (typeof config[key] === "string" && config[key]) {
      flags[`has${key[0].toUpperCase()}${key.slice(1)}`] = true;
    }
    delete config[key];
  }
  const lastRun = await pool.query(
    `select id, started_at, completed_at, status, audit_log_count, activity_log_count,
            destination_type, destination_uri, bundle_checksum, failure_reason
       from log_archive_runs order by started_at desc limit 1`
  );
  return {
    destinationType: row.destination_type,
    destinationConfig: config,
    secretsPresent: flags,
    lastArchivedAt: row.last_archived_at,
    lastBundleChecksum: row.last_bundle_checksum,
    lastRun: lastRun.rows[0] ?? null,
    // Surfaced read-only so the UI can state the guarantee.
    mandatory: true,
    intervalHours: 24
  };
}

export async function listRuns(limit = 50) {
  const result = await pool.query(
    `select id, started_at, completed_at, status, audit_log_count, activity_log_count,
            destination_type, destination_uri, bundle_checksum, prev_bundle_checksum, failure_reason
       from log_archive_runs order by started_at desc limit $1`,
    [Math.max(1, Math.min(500, limit))]
  );
  return result.rows;
}

/**
 * Merge an incoming destination config into the stored shape, encrypting secrets.
 * If a secret field is omitted on update and the type is unchanged, the prior
 * encrypted secret is retained (so the UI never has to round-trip the secret).
 */
function buildStoredConfig(
  input: DestinationInput,
  prior: SettingsRow
): Record<string, unknown> {
  const sameType = prior.destination_type === input.type;
  const priorConfig = sameType ? prior.destination_config : {};
  const retainSecret = (key: (typeof SECRET_KEYS)[number], provided?: string) => {
    if (provided && provided.length > 0) return encryptText(provided);
    const existing = priorConfig[key];
    if (typeof existing === "string" && existing) return existing;
    throw Object.assign(new Error(`Missing required secret: ${key}`), { statusCode: 400 });
  };

  switch (input.type) {
    case "local":
      return { path: input.path?.trim() || undefined };
    case "sftp":
      return {
        host: input.host,
        port: input.port,
        username: input.username,
        remotePath: input.remotePath,
        password: retainSecret("password", input.password)
      };
    case "s3":
      return {
        endpoint: input.endpoint,
        region: input.region,
        bucket: input.bucket,
        prefix: input.prefix,
        useSSL: input.useSSL,
        accessKey: input.accessKey,
        secretKey: retainSecret("secretKey", input.secretKey)
      };
    case "ftp":
      return {
        host: input.host,
        port: input.port,
        username: input.username,
        remotePath: input.remotePath,
        secure: input.secure,
        password: retainSecret("password", input.password)
      };
  }
}

/** Decrypt stored secrets into a config the destination adapters can use. */
function resolveConfig(
  type: DestinationType,
  stored: Record<string, unknown>
): ResolvedDestinationConfig {
  const config: Record<string, unknown> = { type, ...stored };
  for (const key of SECRET_KEYS) {
    if (typeof config[key] === "string" && config[key]) {
      config[key] = decryptText(config[key] as string);
    }
  }
  return config as ResolvedDestinationConfig;
}

/** Persist a new destination. Audited in both audit_logs and user_activity_logs. */
export async function updateDestination(input: DestinationInput, actor: {
  userId: string;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const prior = await loadSettingsRow();
  const stored = buildStoredConfig(input, prior);
  await pool.query(
    `update log_archive_settings
        set destination_type = $1,
            destination_config = $2::jsonb,
            updated_by_user_id = $3,
            updated_at = now()
      where id = 'default'`,
    [input.type, JSON.stringify(stored), actor.userId]
  );
  // The destination change is itself part of the immutable trail.
  await appendAuditEvent({
    actor: actor.userId,
    action: "log_archive.destination_changed",
    entity: "log_archive_settings",
    entityId: "default",
    ip: actor.ip,
    userAgent: actor.userAgent,
    payload: { from: prior.destination_type, to: input.type }
  });
  await appendActivityEvent({
    userId: actor.userId,
    action: "log_archive.destination_changed",
    entityType: "log_archive_settings",
    entityId: "default",
    before: { destinationType: prior.destination_type },
    after: { destinationType: input.type }
  }).catch(() => undefined);
  return getPublicSettings();
}

/** Verify connectivity to a candidate destination without persisting it. */
export async function testDestination(input: DestinationInput): Promise<void> {
  const prior = await loadSettingsRow();
  const stored = buildStoredConfig(input, prior);
  const resolved = resolveConfig(input.type, stored);
  await getDestination(resolved).test();
}

async function fetchNewAuditRows(row: SettingsRow): Promise<Record<string, unknown>[]> {
  if (row.last_audit_log_id && row.last_audit_log_at) {
    const result = await pool.query(
      `select * from audit_logs
        where (created_at, id) > ($1, $2)
        order by created_at asc, id asc limit $3`,
      [row.last_audit_log_at, row.last_audit_log_id, MAX_ROWS_PER_RUN]
    );
    return result.rows;
  }
  const result = await pool.query(
    `select * from audit_logs order by created_at asc, id asc limit $1`,
    [MAX_ROWS_PER_RUN]
  );
  return result.rows;
}

async function fetchNewActivityRows(row: SettingsRow): Promise<Record<string, unknown>[]> {
  if (row.last_activity_log_id && row.last_activity_log_at) {
    const result = await pool.query(
      `select * from user_activity_logs
        where (created_at, id) > ($1, $2)
        order by created_at asc, id asc limit $3`,
      [row.last_activity_log_at, row.last_activity_log_id, MAX_ROWS_PER_RUN]
    );
    return result.rows;
  }
  const result = await pool.query(
    `select * from user_activity_logs order by created_at asc, id asc limit $1`,
    [MAX_ROWS_PER_RUN]
  );
  return result.rows;
}

export type LogArchiveRunResult = {
  status: "success" | "skipped" | "failed";
  auditLogCount: number;
  activityLogCount: number;
  checksum?: string;
  uri?: string;
  reason?: string;
};

/**
 * Export all audit + activity log rows appended since the last successful run,
 * write a signed, encrypted, hash-chained bundle to the configured destination,
 * advance the watermark, and append an append-only run record.
 *
 * Concurrency is guarded by a transaction-scoped advisory lock so overlapping
 * ticks (or multiple API replicas) cannot double-archive the same rows.
 */
export async function runLogArchive(): Promise<LogArchiveRunResult> {
  const lockClient = await pool.connect();
  try {
    await lockClient.query("begin");
    const lock = await lockClient.query<{ locked: boolean }>(
      "select pg_try_advisory_xact_lock(hashtext('audity_log_archive')) as locked"
    );
    if (!lock.rows[0]?.locked) {
      await lockClient.query("rollback");
      return { status: "skipped", auditLogCount: 0, activityLogCount: 0, reason: "locked" };
    }

    const row = await loadSettingsRow();
    const auditRows = await fetchNewAuditRows(row);
    const activityRows = await fetchNewActivityRows(row);

    if (auditRows.length === 0 && activityRows.length === 0) {
      // Nothing new — record a heartbeat run, advance the timestamp only.
      await lockClient.query(
        `insert into log_archive_runs
           (id, started_at, completed_at, status, audit_log_count, activity_log_count, destination_type)
         values ($1, now(), now(), 'success', 0, 0, $2)`,
        [randomUUID(), row.destination_type]
      );
      await lockClient.query(
        "update log_archive_settings set last_archived_at = now() where id = 'default'"
      );
      await lockClient.query("commit");
      return { status: "success", auditLogCount: 0, activityLogCount: 0 };
    }

    const built = buildLogArchiveBundle({
      auditRows,
      activityRows,
      prevChecksum: row.last_bundle_checksum
    });

    const resolved = resolveConfig(row.destination_type, row.destination_config);
    const { uri } = await getDestination(resolved).write(built.filename, built.bundle);

    const lastAudit = auditRows[auditRows.length - 1];
    const lastActivity = activityRows[activityRows.length - 1];
    await lockClient.query(
      `update log_archive_settings
          set last_archived_at = now(),
              last_audit_log_id = coalesce($1, last_audit_log_id),
              last_audit_log_at = coalesce($2, last_audit_log_at),
              last_activity_log_id = coalesce($3, last_activity_log_id),
              last_activity_log_at = coalesce($4, last_activity_log_at),
              last_bundle_checksum = $5
        where id = 'default'`,
      [
        (lastAudit?.id as string | undefined) ?? null,
        (lastAudit?.created_at as Date | undefined) ?? null,
        (lastActivity?.id as string | undefined) ?? null,
        (lastActivity?.created_at as Date | undefined) ?? null,
        built.checksum
      ]
    );
    await lockClient.query(
      `insert into log_archive_runs
         (id, started_at, completed_at, status, audit_log_count, activity_log_count,
          destination_type, destination_uri, bundle_checksum, prev_bundle_checksum)
       values ($1, now(), now(), 'success', $2, $3, $4, $5, $6, $7)`,
      [
        randomUUID(),
        auditRows.length,
        activityRows.length,
        row.destination_type,
        uri,
        built.checksum,
        row.last_bundle_checksum
      ]
    );
    await lockClient.query("commit");
    return {
      status: "success",
      auditLogCount: auditRows.length,
      activityLogCount: activityRows.length,
      checksum: built.checksum,
      uri
    };
  } catch (error) {
    await lockClient.query("rollback").catch(() => undefined);
    const reason = error instanceof Error ? error.message : String(error);
    // Record the failure in the append-only trail (outside the rolled-back tx).
    await pool
      .query(
        `insert into log_archive_runs
           (id, started_at, completed_at, status, failure_reason)
         values ($1, now(), now(), 'failed', $2)`,
        [randomUUID(), reason]
      )
      .catch(() => undefined);
    return { status: "failed", auditLogCount: 0, activityLogCount: 0, reason };
  } finally {
    lockClient.release();
  }
}
