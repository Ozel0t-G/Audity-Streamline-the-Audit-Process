import type { FastifyInstance } from "fastify";
import { appendActivityEvent } from "../activity/service.js";
import { ensureUpdateNotificationForAdmin } from "../admin/updateService.js";
import { requireAuth, requireCsrf } from "../auth/hooks.js";
import { verifyAccessToken } from "../auth/tokens.js";
import { pool } from "../db/client.js";
import { mapNotification } from "./service.js";

async function notificationDigest(userId: string): Promise<string> {
  const result = await pool.query<{ count: string; latest: string | null }>(
    `select count(*)::text as count,
            max(coalesce(read_at, created_at))::text as latest
     from notifications where recipient_user_id = $1`,
    [userId]
  );
  return `${result.rows[0]?.count ?? 0}|${result.rows[0]?.latest ?? ""}`;
}

export async function registerNotificationRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { token?: string } }>(
    "/api/notifications/stream",
    async (request, reply) => {
      const token = request.query.token;
      if (!token) {
        return reply.code(401).send({ code: "AUTH_REQUIRED", message: "Token query parameter required" });
      }
      let userId: string;
      try {
        userId = verifyAccessToken(token).sub;
      } catch {
        return reply.code(401).send({ code: "TOKEN_INVALID", message: "Access token is invalid" });
      }
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      });
      reply.raw.write(`: connected\n\n`);
      let lastDigest = "";
      let cancelled = false;
      const sendUpdate = async () => {
        const digest = await notificationDigest(userId).catch(() => "");
        if (digest && digest !== lastDigest) {
          lastDigest = digest;
          reply.raw.write(`event: notifications.changed\ndata: {}\n\n`);
        }
      };
      const interval = setInterval(() => {
        if (cancelled) return;
        void sendUpdate();
      }, 15000);
      const heartbeat = setInterval(() => {
        if (cancelled) return;
        reply.raw.write(`: heartbeat\n\n`);
      }, 25000);
      void sendUpdate();
      request.raw.on("close", () => {
        cancelled = true;
        clearInterval(interval);
        clearInterval(heartbeat);
      });
    }
  );

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
