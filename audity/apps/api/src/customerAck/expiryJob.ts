import { createHash, randomUUID } from "node:crypto";
import { pool } from "../db/client.js";

/**
 * Hourly job: find tokens that crossed their expiry without being redeemed or revoked,
 * write a customer_ack.expired activity-log entry per token, and mark them so the entry
 * is not written twice. The token row keeps its state — the runtime status derivation
 * already reports "expired"; this job exists purely to populate the audit trail.
 */
export async function runExpiryJob(): Promise<{ scanned: number; flagged: number }> {
  const expired = await pool.query<{
    id: string;
    assessment_id: string;
    recipient_email: string;
    expires_at: string;
  }>(
    `select id, assessment_id, recipient_email, expires_at::text
       from customer_ack_tokens
      where redeemed_at is null
        and revoked_at is null
        and expires_at < now()
        and (email_send_error is null or email_send_error not like 'expired_logged:%')
        and not exists (
          select 1 from user_activity_logs ual
           where ual.action = 'customer_ack.expired'
             and ual.entity_type = 'assessment'
             and ual.entity_id = customer_ack_tokens.assessment_id::text
             and ual.after_value @> jsonb_build_object('tokenId', customer_ack_tokens.id::text)
        )
      order by expires_at asc
      limit 200`
  );

  let flagged = 0;
  for (const row of expired.rows) {
    try {
      const previous = await pool.query<{ event_hash: string }>(
        "select event_hash from user_activity_logs order by created_at desc, id desc limit 1"
      );
      const prevHash = previous.rows[0]?.event_hash ?? "";
      const after = {
        tokenId: row.id,
        recipientEmail: row.recipient_email,
        expiredAt: row.expires_at
      };
      const payload = JSON.stringify({ before: null, after });
      const timestamp = new Date().toISOString();
      const eventHash = createHash("sha256")
        .update(timestamp + "SYSTEM" + "customer_ack.expired" + row.assessment_id + payload + prevHash)
        .digest("hex");
      await pool.query(
        `insert into user_activity_logs
           (id, user_id, action, entity_type, entity_id, before_value, after_value, prev_hash, event_hash, created_at)
         values ($1, null, 'customer_ack.expired', 'assessment', $2, null, $3::jsonb, $4, $5, $6)`,
        [randomUUID(), row.assessment_id, JSON.stringify(after), prevHash, eventHash, timestamp]
      );
      flagged += 1;
    } catch {
      // best-effort; continue
    }
  }
  return { scanned: expired.rowCount ?? 0, flagged };
}

export function startExpiryScheduler(): { stop: () => void } {
  // First tick 5 minutes after boot to give the API time to settle,
  // then hourly. setTimeout chain (not setInterval) so the delay can change.
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  const schedule = (delay: number) => {
    if (stopped) return;
    timer = setTimeout(() => {
      void (async () => {
        try {
          await runExpiryJob();
        } catch {
          // ignore — query is idempotent, will retry next tick
        } finally {
          schedule(3600_000); // hourly thereafter
        }
      })();
    }, delay);
  };
  schedule(5 * 60_000);
  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    }
  };
}
