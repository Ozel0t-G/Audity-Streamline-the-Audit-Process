import crypto, { randomUUID } from "node:crypto";
import { pool } from "../db/client.js";
import { connectorQueue } from "../jobs/queue.js";

function stableJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function nextTimestamp(previous?: Date): Date {
  const now = new Date();
  if (!previous || now.getTime() > previous.getTime()) {
    return now;
  }
  return new Date(previous.getTime() + 1);
}

async function enqueueConnectorAutoSync(input: {
  action: string;
  entityType: string;
  entityId: string;
}): Promise<void> {
  const singletonJobId = "connector-auto-sync";
  const existing = await connectorQueue.getJob(singletonJobId);
  if (existing) {
    const state = await existing.getState();
    if (["completed", "failed", "delayed", "waiting", "paused"].includes(state)) {
      await existing.remove().catch(() => undefined);
    } else {
      await connectorQueue.add(
        "auto-sync",
        { trigger: input.action, entityType: input.entityType, entityId: input.entityId },
        {
          jobId: `${singletonJobId}-${Date.now()}-${randomUUID()}`,
          delay: 5000,
          attempts: 2,
          removeOnComplete: true,
          removeOnFail: 100
        }
      );
      return;
    }
  }

  await connectorQueue.add(
    "auto-sync",
    { trigger: input.action, entityType: input.entityType, entityId: input.entityId },
    {
      jobId: singletonJobId,
      delay: 5000,
      attempts: 2,
      removeOnComplete: true,
      removeOnFail: 100
    }
  );
}

export async function appendActivityEvent(input: {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
}): Promise<void> {
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext('audity_user_activity_logs'))");
    const previous = await client.query<{ event_hash: string; created_at: Date }>(
      "select event_hash, created_at from user_activity_logs order by created_at desc, id desc limit 1"
    );
    const timestamp = nextTimestamp(previous.rows[0]?.created_at).toISOString();
    const prevHash = previous.rows[0]?.event_hash ?? "";
    const payload = stableJson({ before: input.before, after: input.after });
    const eventHash = crypto
      .createHash("sha256")
      .update(timestamp + input.userId + input.action + input.entityId + payload + prevHash)
      .digest("hex");

    await client.query(
      `insert into user_activity_logs
        (id, user_id, action, entity_type, entity_id, before_value, after_value, prev_hash, event_hash, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        randomUUID(),
        input.userId,
        input.action,
        input.entityType,
        input.entityId,
        JSON.stringify(input.before ?? null),
        JSON.stringify(input.after ?? null),
        prevHash || null,
        eventHash,
        timestamp
      ]
    );
    await client.query("commit");
    committed = true;
    if (
      ["customer", "assessment"].includes(input.entityType) &&
      !input.action.endsWith(".opened")
    ) {
      await enqueueConnectorAutoSync(input).catch(() => undefined);
    }
  } catch (error) {
    if (!committed) {
      // Roll back, but don't let a rollback failure (broken connection, etc.)
      // mask the underlying error the caller cares about.
      await client.query("rollback").catch(() => undefined);
    }
    throw error;
  } finally {
    client.release();
  }
}
