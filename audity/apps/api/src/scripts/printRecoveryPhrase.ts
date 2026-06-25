import { loadConfig } from "../config.js";
import { pool } from "../db/client.js";
import { keyToPhrase, fingerprintFromKey, formatPhraseForPrint } from "../auth/recoveryPhrase.js";
import { consumePhraseReveal, type PhraseRevealSource } from "../auth/encryptionKeyMeta.js";
import { appendAuditEvent } from "../audit/service.js";

/**
 * One-time, host-side reveal of the instance recovery phrase.
 *
 * The phrase is the encoding of AUDITY_ENCRYPTION_KEY. It can be revealed exactly
 * ONCE per key generation — either by the installer (source "install") or by a
 * single manual CLI call (source "cli"). After that this tool refuses to reprint
 * it (irreversible seal) and shows only the non-secret fingerprint. The seal
 * resets only if the encryption key itself changes (a new key generation).
 *
 * Source: pass `--source install` (or AUDITY_PHRASE_REVEAL_SOURCE=install).
 * Defaults to "cli".
 */
function resolveSource(): PhraseRevealSource {
  const fromArg = process.argv.find((a) => a.startsWith("--source="))?.split("=")[1];
  const raw = fromArg ?? process.env.AUDITY_PHRASE_REVEAL_SOURCE ?? "cli";
  return raw === "install" ? "install" : "cli";
}

const sep = "=".repeat(64);

async function main(): Promise<number> {
  const config = loadConfig();
  const fingerprint = fingerprintFromKey(config.encryptionKey);
  const fingerprintShort = fingerprint.match(/.{2}/g)!.join(" ");
  const source = resolveSource();

  const result = await consumePhraseReveal(source);

  if (!result.revealed) {
    // Already revealed once — sealed. Show only the fingerprint.
    await appendAuditEvent({
      actor: null,
      action: "encryption_key.phrase_reveal_denied",
      entity: "encryption_key",
      entityId: "1",
      payload: { fingerprint, source, originalRevealAt: result.revealedAt, originalSource: result.revealedSource }
    }).catch(() => undefined);

    console.log("");
    console.log("Audity recovery phrase — SEALED");
    console.log(sep);
    console.log("");
    console.log("  The recovery phrase has already been revealed once and is now SEALED.");
    console.log(`  It will NOT be reprinted (this is intentional and irreversible).`);
    console.log("");
    console.log(`  First revealed: ${result.revealedAt ?? "unknown"} (source: ${result.revealedSource ?? "unknown"})`);
    console.log(`  Fingerprint:    ${fingerprintShort}`);
    console.log("");
    console.log("  Recover the phrase from the copy you stored at setup. There is no");
    console.log("  app/CLI override. (The phrase encodes AUDITY_ENCRYPTION_KEY; only host");
    console.log("  access to .env could reconstruct it manually.)");
    console.log("");
    console.log(sep);
    console.log("");
    return 3;
  }

  // First and only reveal — print the full phrase.
  await appendAuditEvent({
    actor: null,
    action: "encryption_key.phrase_revealed",
    entity: "encryption_key",
    entityId: "1",
    payload: { fingerprint, source }
  }).catch(() => undefined);

  const lines = formatPhraseForPrint(keyToPhrase(config.encryptionKey));
  console.log("");
  console.log("Audity instance recovery phrase — ONE-TIME REVEAL");
  console.log(sep);
  console.log("");
  console.log("  This is the ONLY time the phrase will be shown. Store it now.");
  console.log("");
  for (const line of lines) console.log(`  ${line}`);
  console.log("");
  console.log(`  Fingerprint: ${fingerprintShort}`);
  console.log("");
  console.log(sep);
  console.log("");
  console.log("⚠  Store this phrase securely (password manager, safe, printed envelope).");
  console.log("   Without it, encrypted archives and backups cannot be restored after");
  console.log("   a fresh installation. This print contains the FULL key material —");
  console.log("   anyone with these 72 hex chars can decrypt your archives.");
  console.log("   After this, the phrase is SEALED and will not be shown again.");
  console.log("");
  return 0;
}

main()
  .then(async (code) => {
    await pool.end().catch(() => undefined);
    process.exit(code);
  })
  .catch(async (error) => {
    console.error("Failed to reveal recovery phrase:", error instanceof Error ? error.message : error);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
