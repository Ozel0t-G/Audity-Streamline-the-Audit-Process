import { Client } from "minio";
import { posix } from "node:path";
import type { LogArchiveDestination, ResolvedDestinationConfig } from "./index.js";

type S3Config = Extract<ResolvedDestinationConfig, { type: "s3" }>;

/**
 * S3-compatible destination (MinIO, Synology, QNAP, Wasabi, AWS S3). Reuses the
 * already-bundled `minio` client against a caller-supplied endpoint/bucket.
 */
export class S3Destination implements LogArchiveDestination {
  private readonly client: Client;

  constructor(private readonly config: S3Config) {
    const url = new URL(config.endpoint);
    const useSSL = config.useSSL ?? url.protocol === "https:";
    this.client = new Client({
      endPoint: url.hostname,
      port: Number(url.port || (useSSL ? 443 : 80)),
      useSSL,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      region: config.region || "us-east-1"
    });
  }

  private key(filename: string): string {
    const prefix = this.config.prefix?.replace(/^\/+|\/+$/g, "");
    return prefix ? posix.join(prefix, filename) : filename;
  }

  private async ensureBucket(): Promise<void> {
    if (!(await this.client.bucketExists(this.config.bucket))) {
      await this.client.makeBucket(this.config.bucket);
    }
  }

  async write(filename: string, data: Buffer): Promise<{ uri: string }> {
    await this.ensureBucket();
    const key = this.key(filename);
    await this.client.putObject(this.config.bucket, key, data, data.length, {
      "Content-Type": "application/octet-stream"
    });
    return { uri: `s3://${this.config.bucket}/${key}` };
  }

  async test(): Promise<void> {
    await this.ensureBucket();
    const key = this.key(`.audity-logs-probe-${Date.now()}`);
    const probe = Buffer.from("probe");
    await this.client.putObject(this.config.bucket, key, probe, probe.length);
    await this.client.removeObject(this.config.bucket, key).catch(() => undefined);
  }
}
