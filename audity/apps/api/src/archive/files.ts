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

  let total = 0;
  total += await moveBlobs(opts.evidenceKeys, path.join(opts.spoolPath, "evidence"));
  total += await moveBlobs(opts.reportKeys, path.join(opts.spoolPath, "reports"));

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
  const manifest = JSON.parse(raw) as { evidence: string[]; reports: string[] };

  for (const key of manifest.evidence) {
    const src = path.join(opts.spoolPath, "evidence", safeKeyToFilename(key));
    await storageClient.fPutObject(storageBucket(), key, src);
  }
  for (const key of manifest.reports) {
    const src = path.join(opts.spoolPath, "reports", safeKeyToFilename(key));
    await storageClient.fPutObject(storageBucket(), key, src);
  }
  await fs.rm(opts.spoolPath, { recursive: true, force: true });
}
