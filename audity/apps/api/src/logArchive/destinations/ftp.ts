import { Client } from "basic-ftp";
import { Readable } from "node:stream";
import { posix } from "node:path";
import type { LogArchiveDestination, ResolvedDestinationConfig } from "./index.js";

type FtpConfig = Extract<ResolvedDestinationConfig, { type: "ftp" }>;

/**
 * FTP / FTPS destination for legacy NAS devices. Plain FTP is unencrypted —
 * `secure: true` (FTPS) is strongly preferred and surfaced in the UI.
 */
export class FtpDestination implements LogArchiveDestination {
  constructor(private readonly config: FtpConfig) {}

  private async withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client();
    try {
      await client.access({
        host: this.config.host,
        port: this.config.port ?? 21,
        user: this.config.username,
        password: this.config.password,
        secure: this.config.secure ?? false
      });
      return await fn(client);
    } finally {
      client.close();
    }
  }

  async write(filename: string, data: Buffer): Promise<{ uri: string }> {
    const dir = this.config.remotePath || ".";
    const remote = posix.join(dir, filename);
    await this.withClient(async (client) => {
      if (dir && dir !== ".") {
        await client.ensureDir(dir);
      }
      await client.uploadFrom(Readable.from(data), filename);
    });
    return { uri: `ftp://${this.config.host}/${remote.replace(/^\/+/, "")}` };
  }

  async test(): Promise<void> {
    const dir = this.config.remotePath || ".";
    const name = `.audity-logs-probe-${Date.now()}`;
    await this.withClient(async (client) => {
      if (dir && dir !== ".") {
        await client.ensureDir(dir);
      }
      await client.uploadFrom(Readable.from(Buffer.from("probe")), name);
      await client.remove(name).catch(() => undefined);
    });
  }
}
