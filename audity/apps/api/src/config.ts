export type AudityConfig = {
  appSecret: string;
  databaseUrl: string;
  encryptionKey: string;
  env: string;
  logLevel: string;
  port: number;
  publicUrl: string;
  redisUrl: string;
  backupBucket: string;
  sessionIdleTimeoutMinutes: number;
  storageAccessKey: string;
  storageBucket: string;
  storageEndpoint: string;
  storageSecretKey: string;
  uploadMaxBytes: number;
  uploadAllowedTypes: string[];
};

export function loadConfig(): AudityConfig {
  return {
    appSecret: process.env.AUDITY_APP_SECRET ?? "change-me",
    databaseUrl:
      process.env.AUDITY_DATABASE_URL ??
      "postgres://audity:change-me@audity-db:5432/audity",
    env: process.env.AUDITY_ENV ?? "production",
    encryptionKey: process.env.AUDITY_ENCRYPTION_KEY ?? process.env.AUDITY_APP_SECRET ?? "change-me",
    logLevel: process.env.AUDITY_LOG_LEVEL ?? "info",
    port: Number(process.env.PORT ?? 3000),
    publicUrl: process.env.AUDITY_PUBLIC_URL ?? "http://localhost",
    redisUrl: process.env.AUDITY_REDIS_URL ?? "redis://audity-redis:6379",
    backupBucket: process.env.AUDITY_BACKUP_BUCKET ?? "audity-backups",
    sessionIdleTimeoutMinutes: Number(
      process.env.AUDITY_SESSION_IDLE_TIMEOUT_MINUTES ?? 30
    ),
    storageEndpoint: process.env.AUDITY_STORAGE_ENDPOINT ?? "http://audity-storage:9000",
    storageBucket: process.env.AUDITY_STORAGE_BUCKET ?? "audity-evidence",
    storageAccessKey: process.env.AUDITY_STORAGE_ACCESS_KEY ?? "replace-me",
    storageSecretKey: process.env.AUDITY_STORAGE_SECRET_KEY ?? "replace-me",
    uploadMaxBytes: Number(process.env.AUDITY_UPLOAD_MAX_BYTES ?? 25 * 1024 * 1024),
    uploadAllowedTypes: (
      process.env.AUDITY_UPLOAD_ALLOWED_TYPES ??
      "application/pdf,text/plain,text/csv,image/png,image/jpeg,application/json"
    ).split(",")
  };
}
