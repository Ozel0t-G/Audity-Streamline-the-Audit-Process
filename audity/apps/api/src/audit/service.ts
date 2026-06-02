import { randomUUID } from "node:crypto";
import { pool } from "../db/client.js";

export async function appendAuditEvent(input: {
  actor: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await pool.query(
    `insert into audit_logs
      (id, actor_user_id, action, entity, entity_id, ip, user_agent, payload)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      randomUUID(),
      input.actor,
      input.action,
      input.entity,
      input.entityId ?? null,
      input.ip ?? null,
      input.userAgent ?? null,
      JSON.stringify(input.payload ?? {})
    ]
  );
}
