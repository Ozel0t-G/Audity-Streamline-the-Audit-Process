import path from "node:path";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { storageBucket, storageClient } from "../storage/service.js";

function safeKeyToFilename(key: string): string {
  // Map object keys (e.g. "evidence/2026/06/foo bar.pdf") into a flat,
  // filesystem-safe filename that still allows reverse lookup.
  return key.replace(/[\\/]/g, "__").replace(/[^A-Za-z0-9_.\-]/g, "_");
}

export type MoveOptions = {
  customerId: string;
  spoolPath: string;
  evidenceKeys: string[];
  reportKeys: string[];
};

/**
 * Moves all evidence + report objects belonging to a customer from MinIO into
 * the local archive spool directory. Returns total size moved in bytes.
 * On failure, the spool directory is left in place so the operator can
 * inspect / retry; the caller decides whether to roll back.
 */
export async function moveCustomerArtifactsToSpool(opts: MoveOptions): Promise<number> {
  await fs.mkdir(path.join(opts.spoolPath, "evidence"), { recursive: true });
  await fs.mkdir(path.join(opts.spoolPath, "reports"), { recursive: true });

  // Write the manifest BEFORE moving any blobs. moveBlobs deletes each original from
  // object storage right after spooling it, so if the move throws partway the manifest is
  // the only record of which keys were in play — without it the already-spooled blobs
  // can't be mapped back to their original keys for recovery. (movedAt = move-start time.)
  const manifest = {
    movedAt: new Date().toISOString(),
    customerId: opts.customerId,
    evidence: opts.evidenceKeys,
    reports: opts.reportKeys
  };
  await fs.writeFile(
    path.join(opts.spoolPath, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );

  let total = 0;
  total += await moveBlobs(opts.evidenceKeys, path.join(opts.spoolPath, "evidence"));
  total += await moveBlobs(opts.reportKeys, path.join(opts.spoolPath, "reports"));
  return total;
}

async function moveBlobs(keys: string[], destDir: string): Promise<number> {
  let sum = 0;
  for (const key of keys) {
    const dest = path.join(destDir, safeKeyToFilename(key));
    try {
      const stream = (await storageClient.getObject(storageBucket(), key)) as Readable;
      await pipeline(stream, createWriteStream(dest));
      const stat = await fs.stat(dest);
      sum += stat.size;
      await storageClient.removeObject(storageBucket(), key);
    } catch (error) {
      throw new Error(
        `Failed to move object '${key}' to spool '${destDir}': ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
  return sum;
}

export type RestoreOptions = {
  customerId: string;
  spoolPath: string;
};

/**
 * Reverses moveCustomerArtifactsToSpool: re-uploads each spooled blob back to
 * MinIO under its original key (read from manifest.json), then deletes the
 * spool directory tree.
 */
export async function restoreCustomerArtifactsFromSpool(opts: RestoreOptions): Promise<void> {
  const manifestPath = path.join(opts.spoolPath, "manifest.json");
  const raw = await fs.readFile(manifestPath, "utf8");
  let manifest: { evidence?: unknown; reports?: unknown };
  try {
    manifest = JSON.parse(raw) as { evidence?: unknown; reports?: unknown };
  } catch {
    throw new Error(`Archive manifest is unreadable (corrupt JSON): ${manifestPath}`);
  }
  const evidence = Array.isArray(manifest.evidence) ? (manifest.evidence as string[]) : [];
  const reports = Array.isArray(manifest.reports) ? (manifest.reports as string[]) : [];

  for (const key of evidence) {
    await restoreOneBlob(key, path.join(opts.spoolPath, "evidence", safeKeyToFilename(key)));
  }
  for (const key of reports) {
    await restoreOneBlob(key, path.join(opts.spoolPath, "reports", safeKeyToFilename(key)));
  }
  await fs.rm(opts.spoolPath, { recursive: true, force: true });
}

/**
 * Re-upload one spooled blob to its original object-storage key. A manifest key whose
 * spool file is absent is only legitimate after a PARTIAL move (its original was never
 * removed from storage): verify the original is still present and skip if so. If the blob
 * is missing from BOTH the spool and storage it is genuinely lost — fail loud rather than
 * silently completing a lossy restore.
 */
async function restoreOneBlob(key: string, src: string): Promise<void> {
  try {
    await fs.access(src);
  } catch {
    try {
      await storageClient.statObject(storageBucket(), key);
      return; // original still in storage (never moved) — nothing to restore
    } catch {
      throw new Error(`Cannot restore '${key}': missing from both the spool and object storage`);
    }
  }
  await storageClient.fPutObject(storageBucket(), key, src);
}
