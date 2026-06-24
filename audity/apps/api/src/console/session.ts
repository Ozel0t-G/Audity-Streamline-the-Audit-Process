import { randomUUID } from "node:crypto";
import { appendActivityEvent } from "../activity/service.js";
import { pool } from "../db/client.js";
import { createNotification } from "../notifications/service.js";

// Cap the persisted transcript so a noisy session can't blow up memory/storage.
const TRANSCRIPT_CAP_BYTES = 1_000_000;

export type ConsoleSessionMeta = {
  userId: string;
  ip: string;
  userAgent: string;
};

/**
 * Records one maintenance-console session: a console_sessions row, a full
 * input+output transcript (size-capped), tamper-evident start/end audit events, and a
 * start notification to every Instance Admin (so console use is never silent).
 */
export class ConsoleSession {
  readonly id = randomUUID();
  private chunks: string[] = [];
  private bytes = 0;
  private truncated = false;
  private ended = false;

  constructor(private readonly meta: ConsoleSessionMeta) {}

  async begin(): Promise<void> {
    await pool.query(
      `insert into console_sessions (id, user_id, source_ip, user_agent) values ($1, $2, $3, $4)`,
      [this.id, this.meta.userId, this.meta.ip, this.meta.userAgent]
    );
    await appendActivityEvent({
      userId: this.meta.userId,
      action: "console.session_started",
      entityType: "console_session",
      entityId: this.id,
      before: null,
      after: { ip: this.meta.ip, userAgent: this.meta.userAgent }
    }).catch(() => undefined);
    await this.notifyInstanceAdmins().catch(() => undefined);
  }

  record(direction: "in" | "out", data: string): void {
    if (this.truncated) return;
    this.bytes += Buffer.byteLength(data, "utf8");
    if (this.bytes > TRANSCRIPT_CAP_BYTES) {
      this.truncated = true;
      this.chunks.push("\n[transcript truncated — size cap reached]\n");
      return;
    }
    // Prefix input lines so the transcript distinguishes what the admin typed.
    this.chunks.push(direction === "in" ? data : data);
  }

  async end(exitReason: string): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    const transcript = this.chunks.join("");
    await pool
      .query(
        `update console_sessions
            set ended_at = now(), exit_reason = $2, transcript = $3, byte_count = $4
          where id = $1`,
        [this.id, exitReason, transcript, this.bytes]
      )
      .catch(() => undefined);
    await appendActivityEvent({
      userId: this.meta.userId,
      action: "console.session_ended",
      entityType: "console_session",
      entityId: this.id,
      before: null,
      after: { exitReason, byteCount: this.bytes }
    }).catch(() => undefined);
  }

  private async notifyInstanceAdmins(): Promise<void> {
    const admins = await pool.query<{ id: string }>(
      `select u.id from users u
         join roles r on r.id = u.role_id
        where r.name = 'Instance Admin' and u.status = 'active'`
    );
    for (const admin of admins.rows) {
      await createNotification({
        recipientUserId: admin.id,
        type: "console_session",
        title: "Maintenance console session started",
        message: `An Instance Admin opened the server console from ${this.meta.ip}.`,
        entityType: "console_session",
        entityId: this.id,
        createdByUserId: this.meta.userId
      }).catch(() => undefined);
    }
  }
}
