import { writeFile, mkdir, access, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadConfig } from "../../config.js";
import type { LogArchiveDestination, ResolvedDestinationConfig } from "./index.js";

/**
 * Default, tamper-resistant destination: write into a dedicated WORM directory on
 * the application server (AUDITY_LOG_ARCHIVE_DIR, own Docker volume). Files are
 * created with the exclusive `wx` flag so an existing archive is never silently
 * overwritten — the chain is append-only at the filesystem level too.
 */
export class LocalDestination implements LogArchiveDestination {
  private readonly dir: string;

  constructor(config: Extract<ResolvedDestinationConfig, { type: "local" }>) {
    this.dir = resolve(config.path?.trim() || loadConfig().logArchiveDirectory);
  }

  async write(filename: string, data: Buffer): Promise<{ uri: string }> {
    await mkdir(this.dir, { recursive: true });
    const target = join(this.dir, filename);
    // `wx` => fail if the file already exists (no overwrite of prior archives).
    await writeFile(target, data, { flag: "wx" });
    return { uri: `file://${target}` };
  }

  async test(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const probe = join(this.dir, `.audity-logs-probe-${Date.now()}`);
    await writeFile(probe, Buffer.from("probe"), { flag: "wx" });
    await access(probe);
    await unlink(probe).catch(() => undefined);
  }
}
