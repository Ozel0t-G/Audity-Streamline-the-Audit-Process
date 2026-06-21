import crypto from "node:crypto";

/**
 * Recovery-phrase encoding for the instance encryption key.
 *
 * Format: 32-byte AES key + 4-byte SHA-256(key) checksum = 36 bytes.
 * Encoded as 72 lowercase hex characters, grouped into 6 blocks of 12
 * with a hyphen separator (`xxxxxxxxxxxx-xxxxxxxxxxxx-...`).
 *
 * Example:
 *   a89f2c11e378-41b2dd0f5821-c9ab3e774012-bb1e2f4499aa-330d18c2e6f1-7a4b...
 *
 * The 4-byte checksum lets the restore wizard detect typos before
 * committing the key. The format is intentionally simple — no external
 * wordlist dependency, deterministic, and short enough to print on a card.
 *
 * Fingerprint = first 8 hex bytes of SHA-256(key) shown separately in the
 * System Monitor so the operator can visually verify a restored key without
 * leaking the full secret on screen.
 */

const KEY_BYTES = 32;
const CHECKSUM_BYTES = 4;

function deriveBytes(value: string): Buffer {
  // Same derivation as utils/crypto.ts to keep the key/phrase in sync.
  return crypto.createHash("sha256").update(value).digest();
}

function checksum(keyBytes: Buffer): Buffer {
  return crypto.createHash("sha256").update(keyBytes).digest().slice(0, CHECKSUM_BYTES);
}

export function fingerprintFromKey(value: string): string {
  const fp = checksum(deriveBytes(value));
  return fp.toString("hex");
}

export function fingerprintShort(value: string): string {
  return fingerprintFromKey(value).match(/.{2}/g)!.join(" ");
}

/**
 * Generate the human-readable recovery phrase from the current encryption key.
 *
 * @param value - the raw encryption-key string from `AUDITY_ENCRYPTION_KEY`.
 *                The same SHA-256 derivation as `utils/crypto.ts` is applied.
 * @returns 72 hex chars grouped as 6 blocks of 12, separated by hyphens.
 */
export function keyToPhrase(value: string): string {
  const keyBytes = deriveBytes(value);
  const cks = checksum(keyBytes);
  const full = Buffer.concat([keyBytes, cks]).toString("hex");
  return full.match(/.{12}/g)!.join("-");
}

/**
 * Decode a recovery phrase back into the 32-byte key bytes.
 *
 * @param phrase  - the user-typed phrase, hex chars + optional hyphens/whitespace.
 * @returns { keyBytes, fingerprint } if checksum verifies.
 * @throws when length is wrong or checksum mismatches.
 */
export function phraseToKey(phrase: string): { keyBytes: Buffer; fingerprint: string } {
  const cleaned = phrase.replace(/[^0-9a-f]/gi, "").toLowerCase();
  const expectedLen = (KEY_BYTES + CHECKSUM_BYTES) * 2;
  if (cleaned.length !== expectedLen) {
    throw new Error(
      `Recovery phrase must contain ${expectedLen} hex characters (got ${cleaned.length}). ` +
      `Check that you copied all 72 characters and that they are only 0-9 and a-f.`
    );
  }
  const buf = Buffer.from(cleaned, "hex");
  const keyBytes = buf.slice(0, KEY_BYTES);
  const givenChecksum = buf.slice(KEY_BYTES);
  const expectedChecksum = checksum(keyBytes);
  if (!expectedChecksum.equals(givenChecksum)) {
    throw new Error("Recovery phrase checksum does not match. Please re-check the last 8 characters for typos.");
  }
  return { keyBytes, fingerprint: expectedChecksum.toString("hex") };
}

/**
 * Pretty-print the phrase across 6 lines so it fits on a print template.
 */
export function formatPhraseForPrint(phrase: string): string[] {
  const blocks = phrase.split("-");
  return blocks.map((block, idx) => `${(idx + 1).toString().padStart(2, " ")}.  ${block}`);
}
