import { Client } from "minio";
import { loadConfig } from "../config.js";

const config = loadConfig();
const endpoint = new URL(config.storageEndpoint);

export const storageClient = new Client({
  endPoint: endpoint.hostname,
  port: Number(endpoint.port || (endpoint.protocol === "https:" ? 443 : 80)),
  useSSL: endpoint.protocol === "https:",
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

export function storageBucket(): string {
  return config.storageBucket;
}

export async function signedGetUrl(objectKey: string): Promise<string> {
  await ensureBucket();
  const publicClient = new Client({
    endPoint: "localhost",
    port: 9000,
    useSSL: false,
    accessKey: config.storageAccessKey,
    secretKey: config.storageSecretKey,
    region: "us-east-1"
  });
  return publicClient.presignedGetObject(config.storageBucket, objectKey, 60 * 10);
}
