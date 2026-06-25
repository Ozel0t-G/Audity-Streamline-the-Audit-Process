import { createHash, randomUUID } from "node:crypto";
import { pool } from "../db/client.js";

// Mirror activity/service.ts: guarantee a strictly increasing created_at so the
// verifier's "order by created_at asc, id asc" reflects true append order.
function nextTimestamp(previous?: Date): Date {
  const now = new Date();
  if (!previous || now.getTime() > previous.getTime()) {
    return now;
  }
  return new Date(previous.getTime() + 1);
}

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
    // Each entry is appended under the same advisory lock and monotonic-timestamp
    // discipline as activity/service.ts. Without the lock a concurrent
    // appendActivityEvent() could read the same head, so both rows would share one
    // prev_hash and the verifier would (correctly) flag a prev_hash_mismatch.
    const client = await pool.connect();
    let committed = false;
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtext('audity_user_activity_logs'))");

      // Re-check inside the lock: a previous run (or another worker) may already have
      // logged this token between the unlocked scan above and acquiring the lock.
      const already = await client.query(
        `select 1 from user_activity_logs
          where action = 'customer_ack.expired'
            and entity_type = 'assessment'
            and entity_id = $1
            and after_value @> jsonb_build_object('tokenId', $2::text)
          limit 1`,
        [row.assessment_id, row.id]
      );
      if (already.rowCount) {
        await client.query("commit");
        committed = true;
        continue;
      }

      const previous = await client.query<{ event_hash: string; created_at: Date }>(
        "select event_hash, created_at from user_activity_logs order by created_at desc, id desc limit 1"
      );
      const prevHash = previous.rows[0]?.event_hash ?? "";
      const after = {
        tokenId: row.id,
        recipientEmail: row.recipient_email,
        expiredAt: row.expires_at
      };
      const payload = JSON.stringify({ before: null, after });
      const timestamp = nextTimestamp(previous.rows[0]?.created_at).toISOString();
      // System events store user_id = null; hash the actor slot as "" to match the
      // verifier, which reconstructs the hash with (user_id ?? "").
      const eventHash = createHash("sha256")
        .update(timestamp + "" + "customer_ack.expired" + row.assessment_id + payload + prevHash)
        .digest("hex");
      await client.query(
        `insert into user_activity_logs
           (id, user_id, action, entity_type, entity_id, before_value, after_value, prev_hash, event_hash, created_at)
         values ($1, null, 'customer_ack.expired', 'assessment', $2, null, $3::jsonb, $4, $5, $6)`,
        [randomUUID(), row.assessment_id, JSON.stringify(after), prevHash || null, eventHash, timestamp]
      );
      await client.query("commit");
      committed = true;
      flagged += 1;
    } catch {
      if (!committed) {
        await client.query("rollback").catch(() => undefined);
      }
      // best-effort; continue with the next token
    } finally {
      client.release();
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
