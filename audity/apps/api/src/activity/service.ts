import crypto, { randomUUID } from "node:crypto";
import { pool } from "../db/client.js";

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

export async function appendActivityEvent(input: {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
}): Promise<void> {
  const client = await pool.connect();
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
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
