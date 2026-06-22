import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requireCsrf } from "../auth/hooks.js";
import { pool } from "../db/client.js";

const prefsSchema = z.object({
  inAppEnabled: z.boolean().optional(),
  digestEnabled: z.boolean().optional(),
  digestHourLocal: z.number().int().min(0).max(23).optional(),
  digestTimezone: z.string().max(80).optional()
});

type PrefsRow = {
  in_app_enabled: boolean;
  digest_enabled: boolean;
  digest_hour_local: number;
  digest_timezone: string;
  last_digest_sent_at: string | null;
};

function defaultPrefs(): PrefsRow {
  return {
    in_app_enabled: true,
    digest_enabled: false,
    digest_hour_local: 6,
    digest_timezone: "Europe/Berlin",
    last_digest_sent_at: null
  };
}

async function loadPrefs(userId: string): Promise<PrefsRow> {
  const result = await pool.query<PrefsRow>(
    `select in_app_enabled, digest_enabled, digest_hour_local, digest_timezone, last_digest_sent_at::text
       from user_notification_prefs where user_id = $1`,
    [userId]
  );
  return result.rows[0] ?? defaultPrefs();
}

export async function registerNotificationPreferencesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/me/notification-prefs", { preHandler: requireAuth }, async (request) => {
    const prefs = await loadPrefs(request.user!.sub);
    return {
      preferences: {
        inAppEnabled: prefs.in_app_enabled,
        digestEnabled: prefs.digest_enabled,
        digestHourLocal: prefs.digest_hour_local,
        digestTimezone: prefs.digest_timezone,
        lastDigestSentAt: prefs.last_digest_sent_at
      }
    };
  });

  app.put<{ Body: z.infer<typeof prefsSchema> }>(
    "/api/me/notification-prefs",
    { preHandler: requireCsrf },
    async (request, reply) => {
      const parsed = prefsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ code: "INVALID_BODY", message: parsed.error.message });
      }
      const current = await loadPrefs(request.user!.sub);
      const next = {
        inAppEnabled: parsed.data.inAppEnabled ?? current.in_app_enabled,
        digestEnabled: parsed.data.digestEnabled ?? current.digest_enabled,
        digestHourLocal: parsed.data.digestHourLocal ?? current.digest_hour_local,
        digestTimezone: parsed.data.digestTimezone ?? current.digest_timezone
      };
      await pool.query(
        `insert into user_notification_prefs
           (user_id, in_app_enabled, digest_enabled, digest_hour_local, digest_timezone, updated_at)
         values ($1, $2, $3, $4, $5, now())
         on conflict (user_id) do update set
           in_app_enabled = excluded.in_app_enabled,
           digest_enabled = excluded.digest_enabled,
           digest_hour_local = excluded.digest_hour_local,
           digest_timezone = excluded.digest_timezone,
           updated_at = now()`,
        [
          request.user!.sub,
          next.inAppEnabled,
          next.digestEnabled,
          next.digestHourLocal,
          next.digestTimezone
        ]
      );
      return { preferences: next };
    }
  );
}
