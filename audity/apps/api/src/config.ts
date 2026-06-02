export type AudityConfig = {
  appSecret: string;
  databaseUrl: string;
  env: string;
  logLevel: string;
  port: number;
  publicUrl: string;
  sessionIdleTimeoutMinutes: number;
};

export function loadConfig(): AudityConfig {
  return {
    appSecret: process.env.AUDITY_APP_SECRET ?? "change-me",
    databaseUrl:
      process.env.AUDITY_DATABASE_URL ??
      "postgres://audity:change-me@audity-db:5432/audity",
    env: process.env.AUDITY_ENV ?? "production",
    logLevel: process.env.AUDITY_LOG_LEVEL ?? "info",
    port: Number(process.env.PORT ?? 3000),
    publicUrl: process.env.AUDITY_PUBLIC_URL ?? "http://localhost",
    sessionIdleTimeoutMinutes: Number(
      process.env.AUDITY_SESSION_IDLE_TIMEOUT_MINUTES ?? 30
    )
  };
}
