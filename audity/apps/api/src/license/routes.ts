import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth, requireCsrf } from "../auth/hooks.js";
import { licenseService } from "./service.js";
import { featureTierMap } from "./catalog.js";
import { ensureDemoSeeded, reseedDemo } from "./demoSeed.js";

async function requireInstanceAdminCsrf(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireCsrf(request, reply);
  if (reply.sent) return;
  if (request.user?.role !== "Instance Admin") {
    await reply
      .code(403)
      .send({ code: "INSTANCE_ADMIN_REQUIRED", message: "Instance Admin role required" });
  }
}

const activateSchema = z.object({ token: z.string().trim().min(1).max(8192) });

export async function registerLicenseRoutes(app: FastifyInstance): Promise<void> {
  // Für alle eingeloggten User: Zustand + Feature→Tier-Map (Gating + Demo-Tags).
  // Enthält keine Geheimnisse (nur Tier/Status/Preisstruktur).
  app.get("/api/license/state", { preHandler: requireAuth }, async () => {
    const state = licenseService.getState();
    // Lazy-Trigger: falls Demo aktiv und Admin erst nach dem Boot angelegt wurde.
    if (state.demoMode) void ensureDemoSeeded();
    return { state, featureTiers: featureTierMap() };
  });

  app.post<{ Body: unknown }>(
    "/api/admin/license/activate",
    { preHandler: requireInstanceAdminCsrf },
    async (request, reply) => {
      const parsed = activateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ code: "VALIDATION_FAILED", message: "License token is missing." });
      }
      try {
        const state = await licenseService.activate(parsed.data.token, request.user!.sub);
        return { state, featureTiers: featureTierMap() };
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode ?? 400;
        return reply.code(statusCode).send({
          code: "LICENSE_INVALID",
          message: error instanceof Error ? error.message : "Invalid license"
        });
      }
    }
  );

  app.post(
    "/api/admin/license/deactivate",
    { preHandler: requireInstanceAdminCsrf },
    async (request) => {
      const state = await licenseService.deactivate(request.user!.sub);
      return { state, featureTiers: featureTierMap() };
    }
  );

  app.post(
    "/api/admin/demo/reset",
    { preHandler: requireInstanceAdminCsrf },
    async (request, reply) => {
      if (!licenseService.getState().demoMode) {
        return reply.code(400).send({ code: "NOT_DEMO", message: "Demo reset is only available in demo mode." });
      }
      const result = await reseedDemo(request.user!.sub);
      return { ok: true, ...result };
    }
  );
}
