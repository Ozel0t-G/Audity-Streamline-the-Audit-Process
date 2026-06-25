import crypto from "node:crypto";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import type { Unzipped } from "fflate";
import { loadConfig } from "../config.js";

/**
 * Container layout for `.audity-logs` archive files:
 *   bytes 0..3   : magic "ALOG"
 *   bytes 4..7   : version u32 LE (currently 1)
 *   bytes 8..19  : IV (12 bytes)
 *   bytes 20..35 : AES-256-GCM auth tag (16 bytes)
 *   bytes 36..   : ciphertext (encrypted ZIP body)
 *
 * Key is sha256(AUDITY_ENCRYPTION_KEY) — same derivation as utils/crypto.ts and
 * archive/bundle.ts. The ZIP body contains:
 *   manifest.json   — metadata incl. prevChecksum (hash-chain link) + HMAC signature
 *   audit.jsonl     — one audit_logs row per line
 *   activity.jsonl  — one user_activity_logs row per line
 *
 * Tamper evidence: GCM authenticates the ciphertext, the SHA-256 checksum of the
 * whole encrypted file is chained into the NEXT archive's manifest.prevChecksum,
 * and manifest.signature is an HMAC over the manifest body keyed by the same
 * encryption key. Altering any archive in the chain breaks verification.
 */
const MAGIC = Buffer.from("ALOG", "ascii");
const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

function deriveKey(): Buffer {
  return crypto.createHash("sha256").update(loadConfig().encryptionKey).digest();
}

function toJsonl(rows: Record<string, unknown>[]): Uint8Array {
  return strToU8(rows.map((row) => JSON.stringify(row)).join("\n"));
}

export type LogArchiveManifest = {
  format: "audity-log-archive";
  version: number;
  createdAt: string;
  auditLogCount: number;
  activityLogCount: number;
  auditRange: { fromId: string | null; toId: string | null };
  activityRange: { fromId: string | null; toId: string | null };
  prevChecksum: string | null;
  signature?: string;
};

export type BuiltLogArchive = {
  bundle: Buffer;
  checksum: string;
  filename: string;
  manifest: LogArchiveManifest;
};

/**
 * Build an encrypted, signed, hash-chained archive of the supplied audit and
 * activity log rows. Rows are expected in ascending append order.
 */
export function buildLogArchiveBundle(input: {
  auditRows: Record<string, unknown>[];
  activityRows: Record<string, unknown>[];
  prevChecksum: string | null;
  createdAt?: Date;
}): BuiltLogArchive {
  const createdAt = input.createdAt ?? new Date();
  const manifestBody: LogArchiveManifest = {
    format: "audity-log-archive",
    version: VERSION,
    createdAt: createdAt.toISOString(),
    auditLogCount: input.auditRows.length,
    activityLogCount: input.activityRows.length,
    auditRange: {
      fromId: (input.auditRows[0]?.id as string | undefined) ?? null,
      toId: (input.auditRows[input.auditRows.length - 1]?.id as string | undefined) ?? null
    },
    activityRange: {
      fromId: (input.activityRows[0]?.id as string | undefined) ?? null,
      toId: (input.activityRows[input.activityRows.length - 1]?.id as string | undefined) ?? null
    },
    prevChecksum: input.prevChecksum
  };
  // HMAC over the canonical (signature-free) manifest body, keyed by the
  // encryption key, so the manifest itself is independently verifiable.
  const signature = crypto
    .createHmac("sha256", deriveKey())
    .update(JSON.stringify(manifestBody))
    .digest("hex");
  const manifest: LogArchiveManifest = { ...manifestBody, signature };

  const zipBytes = zipSync(
    {
      "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
      "audit.jsonl": toJsonl(input.auditRows),
      "activity.jsonl": toJsonl(input.activityRows)
    },
    { level: 6 }
  );

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(zipBytes), cipher.final()]);
  const tag = cipher.getAuthTag();
  const versionBuf = Buffer.alloc(4);
  versionBuf.writeUInt32LE(VERSION, 0);
  const bundle = Buffer.concat([MAGIC, versionBuf, iv, tag, ciphertext]);
  const checksum = crypto.createHash("sha256").update(bundle).digest("hex");

  const stamp = createdAt.toISOString().replace(/[:.]/g, "-");
  return {
    bundle,
    checksum,
    filename: `audity-logs-${stamp}.audity-logs`,
    manifest
  };
}

export type DecodedLogArchive = {
  manifest: LogArchiveManifest;
  entries: Unzipped;
};

/**
 * Decrypt + verify a `.audity-logs` archive. Throws on magic/version mismatch,
 * GCM auth failure, or a broken manifest HMAC signature.
 */
export function decodeLogArchiveBundle(bundleBytes: Buffer): DecodedLogArchive {
  if (bundleBytes.length < 4 + 4 + IV_BYTES + TAG_BYTES) {
    throw new Error("Bundle too small to be a valid .audity-logs file.");
  }
  if (!bundleBytes.subarray(0, 4).equals(MAGIC)) {
    throw new Error("Bundle magic header mismatch — not an Audity log archive.");
  }
  const version = bundleBytes.readUInt32LE(4);
  if (version !== VERSION) {
    throw new Error(`Unsupported log archive version ${version} (expected ${VERSION}).`);
  }
  const iv = bundleBytes.subarray(8, 8 + IV_BYTES);
  const tag = bundleBytes.subarray(8 + IV_BYTES, 8 + IV_BYTES + TAG_BYTES);
  const ciphertext = bundleBytes.subarray(8 + IV_BYTES + TAG_BYTES);
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(), iv);
  decipher.setAuthTag(tag);
  const zipBytes = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const entries = unzipSync(zipBytes);
  const manifestBytes = entries["manifest.json"];
  if (!manifestBytes) {
    throw new Error("Log archive missing required manifest.json.");
  }
  const manifest = JSON.parse(strFromU8(manifestBytes)) as LogArchiveManifest;
  const { signature, ...manifestBody } = manifest;
  const expected = crypto
    .createHmac("sha256", deriveKey())
    .update(JSON.stringify(manifestBody))
    .digest("hex");
  if (!signature || signature !== expected) {
    throw new Error("Log archive manifest signature is invalid — possible tampering.");
  }
  return { manifest, entries };
}
