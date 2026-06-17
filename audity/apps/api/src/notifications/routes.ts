import type { FastifyInstance } from "fastify";
import { appendActivityEvent } from "../activity/service.js";
import { ensureUpdateNotificationForAdmin } from "../admin/updateService.js";
import { requireAuth, requireCsrf } from "../auth/hooks.js";
import { pool } from "../db/client.js";
import { mapNotification } from "./service.js";

export async function registerNotificationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/system/session-timeout", { preHandler: requireAuth }, async () => {
    const result = await pool.query<{ value: unknown }>(
      "select value from settings where key = 'session_idle_timeout_minutes'"
    );
    return { sessionIdleTimeoutMinutes: Number(result.rows[0]?.value ?? 30) };
  });

  app.get("/api/notifications", { preHandler: requireAuth }, async (request) => {
    if (request.user?.permissions.includes("settings.manage")) {
      await ensureUpdateNotificationForAdmin().catch(() => undefined);
    }
    const result = await pool.query(
      `select n.*, c.name as customer_name
       from notifications n
       left join customers c on c.id = n.customer_id
       where n.recipient_user_id = $1
       order by n.read_at nulls first, n.created_at desc
       limit 50`,
      [request.user!.sub]
    );
    const unread = result.rows.filter((row) => !row.read_at).length;
    return { unreadCount: unread, notifications: result.rows.map(mapNotification) };
  });

  app.patch<{ Params: { id: string } }>(
    "/api/notifications/:id/read",
    { preHandler: requireCsrf },
    async (request, reply) => {
      const result = await pool.query(
        `update notifications set read_at = coalesce(read_at, now())
         where id = $1 and recipient_user_id = $2
         returning *`,
        [request.params.id, request.user!.sub]
      );
      if (!result.rows[0]) {
        return reply.code(404).send({ code: "NOTIFICATION_NOT_FOUND", message: "Notification not found" });
      }
      const notification = mapNotification(result.rows[0]);
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "notification.read",
        entityType: "notification",
        entityId: request.params.id,
        before: null,
        after: notification
      });
      return { notification };
    }
  );

  app.post("/api/notifications/mark-all-read", { preHandler: requireCsrf }, async (request) => {
    const result = await pool.query(
      "update notifications set read_at = coalesce(read_at, now()) where recipient_user_id = $1 and read_at is null returning id",
      [request.user!.sub]
    );
    await appendActivityEvent({
      userId: request.user!.sub,
      action: "notification.read",
      entityType: "notification",
      entityId: "mark-all-read",
      before: null,
      after: { count: result.rowCount }
    });
    return { status: "ok" };
  });
}
