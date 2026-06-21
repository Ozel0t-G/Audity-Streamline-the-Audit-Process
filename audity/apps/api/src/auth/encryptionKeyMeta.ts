import { loadConfig } from "../config.js";
import { pool } from "../db/client.js";
import { fingerprintFromKey } from "./recoveryPhrase.js";

export type KeyMetaRow = {
  fingerprint: string;
  setup_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
};

export type KeyMetaPublic = {
  fingerprint: string;
  fingerprintShort: string;
  setupAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
};

/**
 * Reads or initialises the singleton encryption_key_meta row.
 * The fingerprint is recomputed from the current AUDITY_ENCRYPTION_KEY on every
 * call and the stored value is updated when it diverges — so a key change is
 * detected on the next read (acknowledge state stays linked to the new key).
 */
export async function ensureKeyMeta(): Promise<KeyMetaRow> {
  const fp = fingerprintFromKey(loadConfig().encryptionKey);
  const existing = await pool.query<KeyMetaRow>(
    "select fingerprint, setup_at, acknowledged_at, acknowledged_by from encryption_key_meta where id = 1"
  );
  if (existing.rows[0]) {
    if (existing.rows[0].fingerprint !== fp) {
      // Key changed (operator rotated it manually). Reset acknowledgement so
      // the new key has to be saved again.
      await pool.query(
        `update encryption_key_meta
           set fingerprint = $1,
               acknowledged_at = null,
               acknowledged_by = null,
               setup_at = now()
         where id = 1`,
        [fp]
      );
      return {
        fingerprint: fp,
        setup_at: new Date().toISOString(),
        acknowledged_at: null,
        acknowledged_by: null
      };
    }
    return existing.rows[0];
  }
  await pool.query(
    "insert into encryption_key_meta (id, fingerprint) values (1, $1) on conflict (id) do nothing",
    [fp]
  );
  return {
    fingerprint: fp,
    setup_at: new Date().toISOString(),
    acknowledged_at: null,
    acknowledged_by: null
  };
}

export async function acknowledgeKey(userId: string): Promise<KeyMetaRow> {
  const fp = fingerprintFromKey(loadConfig().encryptionKey);
  await ensureKeyMeta();
  await pool.query(
    `update encryption_key_meta
       set acknowledged_at = now(),
           acknowledged_by = $1
     where id = 1`,
    [userId]
  );
  const row = await pool.query<KeyMetaRow>(
    "select fingerprint, setup_at, acknowledged_at, acknowledged_by from encryption_key_meta where id = 1"
  );
  return row.rows[0] ?? {
    fingerprint: fp,
    setup_at: new Date().toISOString(),
    acknowledged_at: new Date().toISOString(),
    acknowledged_by: userId
  };
}

export function toPublic(meta: KeyMetaRow): KeyMetaPublic {
  const short = meta.fingerprint.match(/.{2}/g)!.join(" ");
  return {
    fingerprint: meta.fingerprint,
    fingerprintShort: short,
    setupAt: meta.setup_at,
    acknowledgedAt: meta.acknowledged_at,
    acknowledgedBy: meta.acknowledged_by
  };
}
