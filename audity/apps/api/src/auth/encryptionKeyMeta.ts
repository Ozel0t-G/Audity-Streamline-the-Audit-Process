import { loadConfig } from "../config.js";
import { pool } from "../db/client.js";
import { fingerprintFromKey } from "./recoveryPhrase.js";

export type KeyMetaRow = {
  fingerprint: string;
  setup_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
};

export type PhraseRevealSource = "install" | "cli";

export type PhraseSeal = {
  fingerprint: string;
  revealedAt: string | null;
  revealedSource: string | null;
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
      // Key changed (operator rotated it manually). Reset acknowledgement AND the
      // one-time phrase-reveal seal so the NEW key generation gets its own single,
      // host-side reveal — this is a new key, not an override of the old seal.
      await pool.query(
        `update encryption_key_meta
           set fingerprint = $1,
               acknowledged_at = null,
               acknowledged_by = null,
               phrase_revealed_at = null,
               phrase_revealed_source = null,
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

/** Read the one-time phrase-reveal seal state for the current key. */
export async function getPhraseSeal(): Promise<PhraseSeal> {
  await ensureKeyMeta();
  const row = await pool.query<{
    fingerprint: string;
    phrase_revealed_at: string | null;
    phrase_revealed_source: string | null;
  }>(
    "select fingerprint, phrase_revealed_at, phrase_revealed_source from encryption_key_meta where id = 1"
  );
  const r = row.rows[0];
  return {
    fingerprint: r?.fingerprint ?? fingerprintFromKey(loadConfig().encryptionKey),
    revealedAt: r?.phrase_revealed_at ?? null,
    revealedSource: r?.phrase_revealed_source ?? null
  };
}

/**
 * Atomically consume the single, host-side phrase-reveal token for the current
 * key. Returns `{ revealed: true }` exactly once per key generation (the caller
 * may then print the phrase). On every later call it returns
 * `{ revealed: false, ... }` with the original reveal's timestamp/source — the
 * phrase stays sealed (no override). The seal resets only when the key itself
 * changes (handled in ensureKeyMeta on a fingerprint mismatch).
 */
export async function consumePhraseReveal(
  source: PhraseRevealSource
): Promise<{ revealed: boolean; revealedAt: string | null; revealedSource: string | null }> {
  const fp = fingerprintFromKey(loadConfig().encryptionKey);
  await ensureKeyMeta();
  // Single atomic UPDATE: only the first caller (revealed_at IS NULL) wins.
  const consumed = await pool.query<{ phrase_revealed_at: string }>(
    `update encryption_key_meta
        set phrase_revealed_at = now(),
            phrase_revealed_source = $1
      where id = 1
        and fingerprint = $2
        and phrase_revealed_at is null
      returning phrase_revealed_at`,
    [source, fp]
  );
  if (consumed.rows[0]) {
    return { revealed: true, revealedAt: consumed.rows[0].phrase_revealed_at, revealedSource: source };
  }
  const seal = await getPhraseSeal();
  return { revealed: false, revealedAt: seal.revealedAt, revealedSource: seal.revealedSource };
}
