export type AudityConfig = {
  appSecret: string;
  databaseUrl: string;
  encryptionKey: string;
  env: string;
  auditYamlDirectory: string;
  userYamlDirectory: string;
  userSourcesDirectory: string;
  frameworkYamlDirectory: string;
  frameworkYamlSyncIntervalSeconds: number;
  archiveDirectory: string;
  archiveBundleDayOfMonth: number;
  logLevel: string;
  port: number;
  publicUrl: string;
  redisUrl: string;
  backupBucket: string;
  sessionIdleTimeoutMinutes: number;
  storageAccessKey: string;
  storageBucket: string;
  storageEndpoint: string;
  storagePublicEndpoint: string;
  storageSecretKey: string;
  uploadMaxBytes: number;
  uploadAllowedTypes: string[];
};

const insecureValues = new Set([
  "change-me",
  "change-me-now",
  "replace-me",
  "replace-with-secure-random-secret",
  "replace-with-base64-encoded-32-byte-key",
  "replace-with-secure-database-password",
  "replace-with-secure-initial-admin-password"
]);

function isInsecureValue(value: string): boolean {
  return insecureValues.has(value) || value.includes("change-me") || value.includes("replace-with");
}

function publicStorageEndpoint(publicUrl: string, storageEndpoint: string): string {
  const explicit = process.env.AUDITY_STORAGE_PUBLIC_ENDPOINT;
  if (explicit) return explicit;
  const internal = new URL(storageEndpoint);
  if (!["audity-storage", "localhost", "127.0.0.1"].includes(internal.hostname)) {
    return storageEndpoint;
  }
  const publicOrigin = new URL(publicUrl.includes("://") ? publicUrl : `http://${publicUrl}`);
  const minioPort = process.env.AUDITY_MINIO_API_PORT ?? "9000";
  return `${publicOrigin.protocol}//${publicOrigin.hostname}:${minioPort}`;
}

function validateProductionConfig(config: AudityConfig): void {
  if (process.env.AUDITY_ALLOW_INSECURE_DEFAULTS === "true") return;
  if (config.env !== "production") return;
  const insecureKeys = [
    ["AUDITY_APP_SECRET", config.appSecret],
    ["AUDITY_ENCRYPTION_KEY", config.encryptionKey],
    ["AUDITY_DATABASE_URL", config.databaseUrl],
    ["AUDITY_STORAGE_ACCESS_KEY", config.storageAccessKey],
    ["AUDITY_STORAGE_SECRET_KEY", config.storageSecretKey]
  ].filter(([, value]) => isInsecureValue(value));
  if (insecureKeys.length > 0) {
    throw new Error(
      `Refusing to start production with insecure default values: ${insecureKeys
        .map(([key]) => key)
        .join(", ")}. Run ./scripts/install.sh or set secure values in .env.`
    );
  }
  const weakKeys = [
    ["AUDITY_APP_SECRET", config.appSecret, 32],
    ["AUDITY_ENCRYPTION_KEY", config.encryptionKey, 32],
    ["AUDITY_STORAGE_SECRET_KEY", config.storageSecretKey, 24]
  ].filter(([, value, minLength]) => String(value).length < Number(minLength));
  if (weakKeys.length > 0) {
    throw new Error(
      `Refusing to start production with weak secret values: ${weakKeys
        .map(([key]) => key)
        .join(", ")}. Use ./scripts/install.sh or generate new random values.`
    );
  }
  if (config.encryptionKey === config.appSecret) {
    throw new Error(
      "Refusing to start production with AUDITY_ENCRYPTION_KEY equal to AUDITY_APP_SECRET. Generate a separate key (e.g. openssl rand -base64 32)."
    );
  }
}

let cachedConfig: AudityConfig | null = null;

export function loadConfig(): AudityConfig {
  if (cachedConfig) return cachedConfig;
  const storageEndpoint = process.env.AUDITY_STORAGE_ENDPOINT ?? "http://audity-storage:9000";
  const publicUrl = process.env.AUDITY_PUBLIC_URL ?? "http://localhost";
  const config = {
    appSecret: process.env.AUDITY_APP_SECRET ?? "change-me",
    databaseUrl:
      process.env.AUDITY_DATABASE_URL ??
      "postgres://audity:change-me@audity-db:5432/audity",
    env: process.env.AUDITY_ENV ?? "production",
    encryptionKey: process.env.AUDITY_ENCRYPTION_KEY ?? process.env.AUDITY_APP_SECRET ?? "change-me",
    auditYamlDirectory: process.env.AUDITY_AUDITY_YAML_DIR ?? "audity_frameworks",
    userYamlDirectory: process.env.AUDITY_USER_YAML_DIR ?? "user_frameworks",
    userSourcesDirectory: process.env.AUDITY_USER_SOURCES_DIR ?? "user_frameworks/_sources",
    frameworkYamlDirectory: process.env.AUDITY_FRAMEWORK_YAML_DIR ?? "frameworks",
    frameworkYamlSyncIntervalSeconds: Number(process.env.AUDITY_FRAMEWORK_YAML_SYNC_INTERVAL_SECONDS ?? 10),
    archiveDirectory: process.env.AUDITY_ARCHIVE_DIR ?? "/app/archive",
    archiveBundleDayOfMonth: Number(process.env.AUDITY_ARCHIVE_BUNDLE_DAY ?? 1),
    logLevel: process.env.AUDITY_LOG_LEVEL ?? "info",
    port: Number(process.env.PORT ?? 3000),
    publicUrl,
    redisUrl: process.env.AUDITY_REDIS_URL ?? "redis://audity-redis:6379",
    backupBucket: process.env.AUDITY_BACKUP_BUCKET ?? "audity-backups",
    sessionIdleTimeoutMinutes: Number(
      process.env.AUDITY_SESSION_IDLE_TIMEOUT_MINUTES ?? 30
    ),
    storageEndpoint,
    storageBucket: process.env.AUDITY_STORAGE_BUCKET ?? "audity-evidence",
    storageAccessKey: process.env.AUDITY_STORAGE_ACCESS_KEY ?? "replace-me",
    storagePublicEndpoint: publicStorageEndpoint(publicUrl, storageEndpoint),
    storageSecretKey: process.env.AUDITY_STORAGE_SECRET_KEY ?? "replace-me",
    uploadMaxBytes: Number(process.env.AUDITY_UPLOAD_MAX_BYTES ?? 25 * 1024 * 1024),
    uploadAllowedTypes: (
      process.env.AUDITY_UPLOAD_ALLOWED_TYPES ??
      "application/pdf,text/plain,text/csv,image/png,image/jpeg,application/json"
    ).split(",").map((type) => type.trim()).filter(Boolean)
  };
  validateProductionConfig(config);
  cachedConfig = config;
  return config;
}

export function resetConfigCache(): void {
  cachedConfig = null;
}
