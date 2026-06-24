import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { AUDITY_VERSION, type HealthResponse } from "@audity/shared";
import { Redis } from "ioredis";
import { registerAdminRoutes } from "./admin/routes.js";
import { registerAssessmentRoutes } from "./assessments/routes.js";
import { registerAuditCenterRoutes } from "./audit-center/routes.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { loadConfig } from "./config.js";
import { registerCustomerRoutes } from "./customers/routes.js";
import { registerArchiveRoutes } from "./archive/routes.js";
import { registerConnectorRoutes, startConnectorSyncWorker } from "./connectors/routes.js";
import { registerDashboardRoutes } from "./dashboard/routes.js";
import { verifyDatabaseConnection } from "./db/client.js";
import { applyCoreSchema } from "./db/schema.js";
import { seedRolesAndPermissions } from "./rbac/seed.js";
import { registerEvidenceRoutes } from "./evidence/routes.js";
import { registerFrameworkRoutes } from "./frameworks/routes.js";
import { startFrameworkYamlAutoSync } from "./frameworks/yamlImporter.js";
import { startArchiveBundleCron } from "./archive/cron.js";
import { startUpdateAutoCheck } from "./admin/updateService.js";
import { registerNotificationRoutes } from "./notifications/routes.js";
import { registerCockpitRoutes } from "./cockpit/routes.js";
import { registerNotificationPreferencesRoutes } from "./cockpit/preferences.js";
import { startDigestScheduler } from "./cockpit/digest.js";
import { registerFrameworkThresholdRoutes } from "./cockpit/adminThresholds.js";
import { registerTransitionRoutes } from "./cockpit/transitions.js";
import { registerCustomerAckRoutes } from "./customerAck/routes.js";
import { startExpiryScheduler } from "./customerAck/expiryJob.js";
import { registerProductivityRoutes } from "./productivity/routes.js";
import { registerReportRoutes } from "./reports/routes.js";
import { registerSecureRoutes } from "./secure/routes.js";
import { registerWorkflowRoutes } from "./workflow/routes.js";
import { registerRiskFindingLinkRoutes } from "./workflow/links.js";
import { registerAutoConvertRoutes } from "./workflow/autoConvert.js";

const config = loadConfig();
function redactSensitiveQuery(url: string): string {
  if (!url.includes("?")) return url;
  const [path, search] = url.split("?", 2);
  const sanitized = search
    .split("&")
    .map((part) => {
      const [key] = part.split("=", 1);
      if (/^(token|access_token|password|refresh|secret)$/i.test(key)) {
        return `${key}=[REDACTED]`;
      }
      return part;
    })
    .join("&");
  return `${path}?${sanitized}`;
}

const app = Fastify({
  // Behind the nginx reverse proxy: trust X-Forwarded-For only from private/loopback
  // peers (the proxy + localhost), never from arbitrary public IPs. This makes
  // request.ip the real client IP, so the auth rate-limit keys per client (not one
  // shared bucket) and the console grant binds to the real IP. If the proxy isn't
  // covered, request.ip falls back to the socket IP — same as before, so no regression.
  trustProxy: "loopback, linklocal, uniquelocal",
  logger: {
    level: config.logLevel,
    serializers: {
      req(request: { method?: string; url?: string; remoteAddress?: string; remotePort?: number }) {
        return {
          method: request.method,
          url: request.url ? redactSensitiveQuery(request.url) : undefined,
          remoteAddress: request.remoteAddress,
          remotePort: request.remotePort
        };
      }
    }
  }
});
const rateLimitRedis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 1,
  enableReadyCheck: false
});
const publicOrigin = new URL(config.publicUrl.includes("://") ? config.publicUrl : `http://${config.publicUrl}`).origin;
const isProduction = config.env === "production";
// Operators can allow extra origins (e.g. when the app is reached via both an IP and a
// domain, or behind a proxy) without changing the canonical public URL. Comma-separated.
const extraAllowedOrigins = (process.env.AUDITY_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const allowedOrigins = Array.from(
  new Set([
    publicOrigin,
    ...extraAllowedOrigins,
    ...(isProduction ? [] : ["http://localhost", "http://127.0.0.1"])
  ])
);

await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'", config.storagePublicEndpoint, ...allowedOrigins],
      fontSrc: ["'self'", "data:"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", "data:", "blob:"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: isProduction ? ["'self'"] : ["'self'", "'unsafe-inline'"]
    }
  },
  global: true,
  hsts: config.publicUrl.startsWith("https:")
});
await app.register(rateLimit, {
  global: true,
  max: 200,
  timeWindow: "1 minute",
  redis: rateLimitRedis,
  errorResponseBuilder: () => ({
    code: "RATE_LIMITED",
    message: "Too many requests"
  })
});
await app.register(cookie);
await app.register(cors, {
  credentials: true,
  origin: allowedOrigins
});
await app.register(multipart, {
  limits: {
    fileSize: config.uploadMaxBytes ?? 26 * 1024 * 1024,
    files: 5
  }
});

app.addHook("preHandler", async (request, reply) => {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.origin;
  if (!origin) return;
  // Explicit allowlist (AUDITY_PUBLIC_URL + AUDITY_ALLOWED_ORIGINS).
  if (allowedOrigins.includes(origin)) return;
  // Same-origin fallback: accept when the browser-reported Origin host matches the host
  // this request was served on. This makes the app work on any server/IP/domain/port
  // with no allowlist config — while a genuine cross-site (CSRF) request, whose Origin
  // host differs from the target Host, is still rejected. A victim's browser always sends
  // the real target as Host and the attacker's site as Origin, so the two only match for
  // legitimate same-site requests. (Behind a Host-rewriting proxy, set AUDITY_ALLOWED_ORIGINS.)
  try {
    if (request.headers.host && new URL(origin).host === request.headers.host) return;
  } catch {
    /* malformed Origin → fall through to deny */
  }
  return reply
    .code(403)
    .send({ code: "ORIGIN_DENIED", message: "Request origin is not allowed" });
});

app.setErrorHandler((error, request, reply) => {
  const detail = error as { statusCode?: number; code?: string; message?: string };
  const statusCode =
    detail.statusCode && detail.statusCode >= 400
      ? detail.statusCode
      : detail.code === "RATE_LIMITED"
        ? 429
        : 500;
  if (statusCode >= 500) {
    request.log.error({ err: error }, "Request failed");
  } else if (statusCode === 429) {
    request.log.warn({ code: detail.code }, "Rate limited");
  } else {
    request.log.info({ code: detail.code, statusCode }, "Client error");
  }
  reply.code(statusCode).send({
    code: statusCode >= 500 ? "INTERNAL_ERROR" : detail.code ?? "REQUEST_ERROR",
    message: statusCode >= 500 ? "Internal server error" : detail.message
  });
});

const runtimeVersion = () =>
  /^\d+\.\d+\.\d+(?:[-+].*)?$/.test(process.env.AUDITY_VERSION ?? "")
    ? process.env.AUDITY_VERSION!
    : AUDITY_VERSION;

app.get("/health", async (): Promise<HealthResponse> => ({
  status: "ok",
  version: runtimeVersion()
}));
app.get("/api/health", async (): Promise<HealthResponse> => ({
  status: "ok",
  version: runtimeVersion()
}));

app.get("/ready", async () => {
  await verifyDatabaseConnection();
  return { status: "ok", checks: { database: "ok" } };
});

await verifyDatabaseConnection();
await applyCoreSchema();
// Re-sync roles + permissions on every startup so permission changes
// shipped in a new release are applied to existing instances without a
// separate `npm run db:seed` step.
await seedRolesAndPermissions();
// Recover stuck framework-import jobs on startup so they don't display
// an eternal progress bar after an API restart mid-job.
await (await import("./db/client.js")).pool.query(
  `update framework_imports
     set status = 'failed',
         error_message = coalesce(error_message, 'API restarted while job was still running. Please retry.'),
         updated_at = now()
   where status in ('extracting', 'enriching')`
);
startFrameworkYamlAutoSync(app.log);
startArchiveBundleCron(app.log);
startUpdateAutoCheck(app.log);
startConnectorSyncWorker(app.log);
await registerAuthRoutes(app);
await registerDashboardRoutes(app);
await registerConnectorRoutes(app);
await registerCustomerRoutes(app);
await registerArchiveRoutes(app);
await registerAssessmentRoutes(app);
await registerAuditCenterRoutes(app);
await registerFrameworkRoutes(app);
await registerNotificationRoutes(app);
await registerCockpitRoutes(app);
await registerNotificationPreferencesRoutes(app);
await registerFrameworkThresholdRoutes(app);
await registerTransitionRoutes(app);
await registerCustomerAckRoutes(app, { publicUrl: config.publicUrl });
startDigestScheduler();
startExpiryScheduler();
await registerProductivityRoutes(app);
await registerWorkflowRoutes(app);
await registerRiskFindingLinkRoutes(app);
await registerAutoConvertRoutes(app);
await registerAdminRoutes(app);
await registerEvidenceRoutes(app);
await registerReportRoutes(app);
await registerSecureRoutes(app);
// Maintenance-mode console: loaded only when enabled, so the optional ws/console
// dependencies are not required for a normal boot.
if (config.consoleEnabled) {
  const { registerConsoleRoutes } = await import("./console/routes.js");
  await registerConsoleRoutes(app);
}
await app.listen({ host: "0.0.0.0", port: config.port });

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "Shutting down API");
  try {
    await app.close();
    await rateLimitRedis.quit().catch(() => undefined);
  } catch (err) {
    app.log.error({ err }, "Shutdown error");
  } finally {
    process.exit(0);
  }
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  app.log.error({ reason }, "Unhandled promise rejection in API");
});
process.on("uncaughtException", (error) => {
  app.log.fatal({ err: error }, "Uncaught exception in API — exiting");
  setTimeout(() => process.exit(1), 100).unref();
});
