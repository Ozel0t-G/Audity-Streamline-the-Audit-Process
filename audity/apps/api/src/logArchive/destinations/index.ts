import { LocalDestination } from "./local.js";
import { SftpDestination } from "./sftp.js";
import { S3Destination } from "./s3.js";
import { FtpDestination } from "./ftp.js";

export type DestinationType = "local" | "sftp" | "s3" | "ftp";

/**
 * Resolved destination config — secrets are already DECRYPTED here. The DB stores
 * the encrypted form; the service decrypts before constructing a destination.
 */
export type ResolvedDestinationConfig =
  | { type: "local"; path?: string }
  | {
      type: "sftp";
      host: string;
      port?: number;
      username: string;
      password: string;
      remotePath: string;
    }
  | {
      type: "s3";
      endpoint: string;
      region?: string;
      bucket: string;
      accessKey: string;
      secretKey: string;
      prefix?: string;
      useSSL?: boolean;
    }
  | {
      type: "ftp";
      host: string;
      port?: number;
      username: string;
      password: string;
      remotePath: string;
      secure?: boolean;
    };

export interface LogArchiveDestination {
  /** Persist the archive bytes. Returns a human-readable URI for the run record. */
  write(filename: string, data: Buffer): Promise<{ uri: string }>;
  /** Verify connectivity/credentials by writing and removing a probe object. */
  test(): Promise<void>;
}

export function getDestination(config: ResolvedDestinationConfig): LogArchiveDestination {
  switch (config.type) {
    case "local":
      return new LocalDestination(config);
    case "sftp":
      return new SftpDestination(config);
    case "s3":
      return new S3Destination(config);
    case "ftp":
      return new FtpDestination(config);
    default: {
      const exhaustive: never = config;
      throw new Error(`Unsupported log archive destination: ${JSON.stringify(exhaustive)}`);
    }
  }
}
