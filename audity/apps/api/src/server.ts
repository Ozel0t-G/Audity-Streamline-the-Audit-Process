import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { AUDITY_VERSION, type HealthResponse } from "@audity/shared";
import { Redis } from "ioredis";
import { registerAdminRoutes } from "./admin/routes.js";
import { registerAssessmentRoutes } from "./assessments/routes.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { loadConfig } from "./config.js";
import { registerCustomerRoutes } from "./customers/routes.js";
import { verifyDatabaseConnection } from "./db/client.js";
import { applyCoreSchema } from "./db/schema.js";
import { registerEvidenceRoutes } from "./evidence/routes.js";
import { registerFrameworkRoutes } from "./frameworks/routes.js";
import { registerNotificationRoutes } from "./notifications/routes.js";
import { registerReportRoutes } from "./reports/routes.js";
import { registerSecureRoutes } from "./secure/routes.js";
import { registerWorkflowRoutes } from "./workflow/routes.js";

const config = loadConfig();
const app = Fastify({
  logger: {
    level: config.logLevel
  }
});
const rateLimitRedis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 1,
  enableReadyCheck: false
});

await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'", "http://localhost:3000", "http://127.0.0.1:3000"],
      fontSrc: ["'self'", "data:"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", "data:", "blob:"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"]
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
  origin: ["http://localhost", "http://127.0.0.1"]
});

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  const detail = error as { statusCode?: number; code?: string; message?: string };
  const statusCode =
    detail.statusCode && detail.statusCode >= 400
      ? detail.statusCode
      : detail.code === "RATE_LIMITED"
        ? 429
        : 500;
  reply.code(statusCode).send({
    code: statusCode >= 500 ? "INTERNAL_ERROR" : detail.code ?? "REQUEST_ERROR",
    message: statusCode >= 500 ? "Internal server error" : detail.message
  });
});

app.get("/health", async (): Promise<HealthResponse> => ({
  status: "ok",
  version: AUDITY_VERSION
}));

app.get("/ready", async () => {
  await verifyDatabaseConnection();
  return { status: "ok", checks: { database: "ok" } };
});

await verifyDatabaseConnection();
await applyCoreSchema();
await registerAuthRoutes(app);
await registerCustomerRoutes(app);
await registerAssessmentRoutes(app);
await registerFrameworkRoutes(app);
await registerNotificationRoutes(app);
await registerWorkflowRoutes(app);
await registerAdminRoutes(app);
await registerEvidenceRoutes(app);
await registerReportRoutes(app);
await registerSecureRoutes(app);
await app.listen({ host: "0.0.0.0", port: config.port });
