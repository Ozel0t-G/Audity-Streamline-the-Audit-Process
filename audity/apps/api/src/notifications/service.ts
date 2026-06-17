import { randomUUID } from "node:crypto";
import { appendActivityEvent } from "../activity/service.js";
import { pool } from "../db/client.js";

export type NotificationInput = {
  recipientUserId: string;
  type:
    | "customer_shared"
    | "customer_scope_changed"
    | "new_questions_available"
    | "system_update_available"
    | "system_update_started"
    | "system_update_finished";
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
  customerId?: string | null;
  createdByUserId?: string | null;
};

export function mapNotification(row: Record<string, unknown>) {
  return {
    id: row.id,
    recipientUserId: row.recipient_user_id,
    type: row.type,
    title: row.title,
    message: row.message,
    entityType: row.entity_type,
    entityId: row.entity_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    readAt: row.read_at
  };
}

export async function createNotification(input: NotificationInput): Promise<void> {
  const id = randomUUID();
  await pool.query(
    `insert into notifications
      (id, recipient_user_id, type, title, message, entity_type, entity_id, customer_id, created_by_user_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      input.recipientUserId,
      input.type,
      input.title,
      input.message,
      input.entityType ?? null,
      input.entityId ?? null,
      input.customerId ?? null,
      input.createdByUserId ?? null
    ]
  );
  await appendActivityEvent({
    userId: input.createdByUserId ?? input.recipientUserId,
    action: "notification.created",
    entityType: "notification",
    entityId: id,
    before: null,
    after: { type: input.type, recipientUserId: input.recipientUserId, customerId: input.customerId ?? null }
  });
}
