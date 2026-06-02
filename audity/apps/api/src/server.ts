import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { AUDITY_VERSION, type HealthResponse } from "@audity/shared";
import { registerAssessmentRoutes } from "./assessments/routes.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { loadConfig } from "./config.js";
import { registerCustomerRoutes } from "./customers/routes.js";
import { verifyDatabaseConnection } from "./db/client.js";
import { applyCoreSchema } from "./db/schema.js";

const config = loadConfig();
const app = Fastify({
  logger: {
    level: config.logLevel
  }
});

await app.register(cookie);
await app.register(cors, {
  credentials: true,
  origin: ["http://localhost", "http://127.0.0.1"]
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
await app.listen({ host: "0.0.0.0", port: config.port });
