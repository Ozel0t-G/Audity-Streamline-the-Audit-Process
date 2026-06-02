import crypto, { randomUUID } from "node:crypto";
import { pool } from "../db/client.js";

function stableJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export async function appendActivityEvent(input: {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
}): Promise<void> {
  const previous = await pool.query<{ event_hash: string }>(
    "select event_hash from user_activity_logs order by created_at desc limit 1"
  );
  const timestamp = new Date().toISOString();
  const prevHash = previous.rows[0]?.event_hash ?? "";
  const payload = stableJson({ before: input.before, after: input.after });
  const eventHash = crypto
    .createHash("sha256")
    .update(timestamp + input.userId + input.action + input.entityId + payload + prevHash)
    .digest("hex");

  await pool.query(
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
}
