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
import { registerNotificationRoutes } from "./notifications/routes.js";
import { registerProductivityRoutes } from "./productivity/routes.js";
import { registerReportRoutes } from "./reports/routes.js";
import { registerSecureRoutes } from "./secure/routes.js";
import { registerWorkflowRoutes } from "./workflow/routes.js";

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
const allowedOrigins = isProduction
  ? [publicOrigin]
  : Array.from(new Set([publicOrigin, "http://localhost", "http://127.0.0.1"]));

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
  if (!allowedOrigins.includes(origin)) {
    await reply
      .code(403)
      .send({ code: "ORIGIN_DENIED", message: "Request origin is not allowed" });
  }
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
await registerProductivityRoutes(app);
await registerWorkflowRoutes(app);
await registerAdminRoutes(app);
await registerEvidenceRoutes(app);
await registerReportRoutes(app);
await registerSecureRoutes(app);
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
