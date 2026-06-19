import { Client } from "minio";
import type { Readable } from "node:stream";
import { loadConfig } from "../config.js";

const config = loadConfig();
const endpoint = new URL(config.storageEndpoint);
const publicEndpoint = new URL(config.storagePublicEndpoint);

export const storageClient = new Client({
  endPoint: endpoint.hostname,
  port: Number(endpoint.port || (endpoint.protocol === "https:" ? 443 : 80)),
  useSSL: endpoint.protocol === "https:",
  accessKey: config.storageAccessKey,
  secretKey: config.storageSecretKey,
  region: "us-east-1"
});

const publicStorageClient = new Client({
  endPoint: publicEndpoint.hostname,
  port: Number(publicEndpoint.port || (publicEndpoint.protocol === "https:" ? 443 : 80)),
  useSSL: publicEndpoint.protocol === "https:",
  accessKey: config.storageAccessKey,
  secretKey: config.storageSecretKey,
  region: "us-east-1"
});

export async function ensureBucket(): Promise<void> {
  const exists = await storageClient.bucketExists(config.storageBucket);
  if (!exists) {
    await storageClient.makeBucket(config.storageBucket);
  }
}

export async function ensureBackupBucket(): Promise<void> {
  const exists = await storageClient.bucketExists(config.backupBucket);
  if (!exists) {
    await storageClient.makeBucket(config.backupBucket);
  }
}

export function storageBucket(): string {
  return config.storageBucket;
}

export function backupBucket(): string {
  return config.backupBucket;
}

export async function signedGetUrl(objectKey: string): Promise<string> {
  await ensureBucket();
  return publicStorageClient.presignedGetObject(config.storageBucket, objectKey, 60 * 10);
}

export async function signedBackupGetUrl(objectKey: string): Promise<string> {
  await ensureBackupBucket();
  return publicStorageClient.presignedGetObject(config.backupBucket, objectKey, 60 * 10);
}

export async function objectDataUrl(objectKey: string, mimeType: string): Promise<string> {
  const buffer = await objectBuffer(objectKey);
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export async function objectBuffer(objectKey: string): Promise<Buffer> {
  await ensureBucket();
  const stream = await storageClient.getObject(config.storageBucket, objectKey);
  const chunks: Buffer[] = [];
  for await (const chunk of stream as Readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
