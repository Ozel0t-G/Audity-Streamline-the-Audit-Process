import SftpClient from "ssh2-sftp-client";
import { posix } from "node:path";
import type { LogArchiveDestination, ResolvedDestinationConfig } from "./index.js";

type SftpConfig = Extract<ResolvedDestinationConfig, { type: "sftp" }>;

/**
 * SFTP destination (SSH file transfer). Secure by default and supported by
 * virtually every NAS/server — the recommended option for true remote targets.
 */
export class SftpDestination implements LogArchiveDestination {
  constructor(private readonly config: SftpConfig) {}

  private async withClient<T>(fn: (client: SftpClient) => Promise<T>): Promise<T> {
    const client = new SftpClient();
    try {
      await client.connect({
        host: this.config.host,
        port: this.config.port ?? 22,
        username: this.config.username,
        password: this.config.password
      });
      return await fn(client);
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  async write(filename: string, data: Buffer): Promise<{ uri: string }> {
    const remote = posix.join(this.config.remotePath || ".", filename);
    return this.withClient(async (client) => {
      const dir = posix.dirname(remote);
      if (dir && dir !== ".") {
        await client.mkdir(dir, true).catch(() => undefined);
      }
      await client.put(data, remote);
      return { uri: `sftp://${this.config.host}${remote.startsWith("/") ? "" : "/"}${remote}` };
    });
  }

  async test(): Promise<void> {
    const probe = posix.join(this.config.remotePath || ".", `.audity-logs-probe-${Date.now()}`);
    await this.withClient(async (client) => {
      const dir = posix.dirname(probe);
      if (dir && dir !== ".") {
        await client.mkdir(dir, true).catch(() => undefined);
      }
      await client.put(Buffer.from("probe"), probe);
      await client.delete(probe).catch(() => undefined);
    });
  }
}
