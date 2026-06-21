import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import type { Zippable, Unzipped } from "fflate";
import { loadConfig } from "../config.js";
import { pool } from "../db/client.js";
import { appendAuditEvent } from "../audit/service.js";
import { publishEmailTopic } from "../notifications/emailTopics.js";
import type { ArchiveIndexRow } from "./service.js";

/**
 * Container layout for `.audity-archive` files:
 *   bytes 0..3   : magic "AUDA"
 *   bytes 4..7   : version u32 LE (currently 1)
 *   bytes 8..19  : IV (12 bytes)
 *   bytes 20..35 : AES-256-GCM auth tag (16 bytes)
 *   bytes 36..   : ciphertext (encrypted ZIP body)
 *
 * Key is sha256(AUDITY_ENCRYPTION_KEY) — same derivation as utils/crypto.ts.
 */
const MAGIC = Buffer.from("AUDA", "ascii");
const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

function deriveKey(): Buffer {
  return crypto.createHash("sha256").update(loadConfig().encryptionKey).digest();
}

async function readDirRecursive(root: string, base = root): Promise<Record<string, Uint8Array>> {
  const out: Record<string, Uint8Array> = {};
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      Object.assign(out, await readDirRecursive(full, base));
    } else if (entry.isFile()) {
      const rel = path.relative(base, full).split(path.sep).join("/");
      out[rel] = await fs.readFile(full);
    }
  }
  return out;
}

/**
 * Bundle every customer spool directory under `archive/spool/<month>/` into a
 * single encrypted `.audity-archive` file, and mark the corresponding
 * archive_index rows as `bundled`.
 *
 * Returns the absolute bundle path and total size in bytes.
 */
export async function bundleMonth(month: string, actorUserId: string | null): Promise<{
  bundlePath: string;
  sizeBytes: number;
  customerCount: number;
}> {
  const cfg = loadConfig();
  const monthDir = path.join(cfg.archiveDirectory, "spool", month);
  const bundleDir = path.join(cfg.archiveDirectory, "bundled");
  await fs.mkdir(bundleDir, { recursive: true });

  const archives = await pool.query<ArchiveIndexRow>(
    `select * from archive_index where archive_month = $1 and archive_state = 'spool'`,
    [month]
  );
  if (archives.rows.length === 0) {
    throw new Error(`No spooled archives for month ${month}.`);
  }

  const zipInput: Zippable = {};
  const manifest: Array<{ customerId: string; spoolDir: string }> = [];
  for (const archive of archives.rows) {
    const spool = archive.spool_path;
    if (!spool) continue;
    try {
      const files = await readDirRecursive(spool);
      for (const [rel, content] of Object.entries(files)) {
        zipInput[`${archive.customer_id}/${rel}`] = content;
      }
      manifest.push({ customerId: archive.customer_id, spoolDir: spool });
    } catch (error) {
      throw new Error(
        `Failed to read spool directory '${spool}' for customer ${archive.customer_id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
  const bundleManifest = {
    month,
    createdAt: new Date().toISOString(),
    customers: archives.rows.map((row) => ({
      customerId: row.customer_id,
      archivedAt: row.archived_at,
      archivedBy: row.archived_by,
      sizeBytes: Number(row.size_bytes ?? 0),
      manifest: row.manifest_json
    }))
  };
  zipInput["_bundle.json"] = strToU8(JSON.stringify(bundleManifest, null, 2));

  const zipBytes = zipSync(zipInput, { level: 6 });
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(zipBytes), cipher.final()]);
  const tag = cipher.getAuthTag();
  const versionBuf = Buffer.alloc(4);
  versionBuf.writeUInt32LE(VERSION, 0);
  const bundle = Buffer.concat([MAGIC, versionBuf, iv, tag, ciphertext]);

  const filename = `${month}.audity-archive`;
  const bundlePath = path.join(bundleDir, filename);
  await fs.writeFile(bundlePath, bundle);
  const checksum = crypto.createHash("sha256").update(bundle).digest("hex");

  for (const row of archives.rows) {
    await pool.query(
      `update archive_index
          set archive_state = 'bundled',
              bundle_filename = $2,
              bundle_checksum = $3
        where customer_id = $1`,
      [row.customer_id, filename, checksum]
    );
    if (row.spool_path) {
      await fs.rm(row.spool_path, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  // Tidy the empty month dir if nothing else lives in it.
  await fs.rm(monthDir, { recursive: true, force: true }).catch(() => undefined);

  await appendAuditEvent({
    actor: actorUserId,
    action: "archive.bundle.created",
    entity: "archive_bundle",
    entityId: filename,
    ip: null,
    userAgent: null,
    payload: {
      month,
      customerCount: archives.rows.length,
      sizeBytes: bundle.length,
      checksum
    }
  });
  await publishEmailTopic({
    topic: "archive.bundle_completed",
    subject: `Archive bundle ${month} written (${archives.rows.length} customers)`,
    text: `Bundle file ${filename} (${bundle.length} bytes) written to ${bundleDir}.\nSHA-256: ${checksum}`
  }).catch(() => undefined);

  return {
    bundlePath,
    sizeBytes: bundle.length,
    customerCount: archives.rows.length
  };
}

export type DecodedBundle = {
  manifest: {
    month: string;
    createdAt: string;
    customers: Array<{
      customerId: string;
      archivedAt: string;
      archivedBy: string;
      sizeBytes: number;
      manifest: Record<string, unknown>;
    }>;
  };
  entries: Unzipped;
};

/**
 * Decrypt + parse a `.audity-archive` bundle. Verifies magic and GCM tag.
 *
 * @param bundleBytes - the raw file contents as read from disk.
 * @param overrideKey - optional 32-byte key (for re-import with the old key
 *                      after the operator rotated AUDITY_ENCRYPTION_KEY).
 */
export function decodeBundle(bundleBytes: Buffer, overrideKey?: Buffer): DecodedBundle {
  if (bundleBytes.length < 4 + 4 + IV_BYTES + TAG_BYTES) {
    throw new Error("Bundle is too small to be a valid .audity-archive file.");
  }
  const magic = bundleBytes.subarray(0, 4);
  if (!magic.equals(MAGIC)) {
    throw new Error("Bundle magic header mismatch — not an Audity archive.");
  }
  const version = bundleBytes.readUInt32LE(4);
  if (version !== VERSION) {
    throw new Error(`Unsupported bundle version ${version} (expected ${VERSION}).`);
  }
  const iv = bundleBytes.subarray(8, 8 + IV_BYTES);
  const tag = bundleBytes.subarray(8 + IV_BYTES, 8 + IV_BYTES + TAG_BYTES);
  const ciphertext = bundleBytes.subarray(8 + IV_BYTES + TAG_BYTES);
  const key = overrideKey ?? deriveKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  let zipBytes: Buffer;
  try {
    zipBytes = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (error) {
    throw new Error(
      `Bundle decryption failed: ${
        error instanceof Error ? error.message : String(error)
      }. The bundle is corrupted, was tampered with, or was encrypted with a different key.`
    );
  }
  const entries = unzipSync(zipBytes);
  const manifestBytes = entries["_bundle.json"];
  if (!manifestBytes) {
    throw new Error("Bundle is missing the required _bundle.json manifest.");
  }
  const manifest = JSON.parse(strFromU8(manifestBytes));
  return { manifest, entries };
}
