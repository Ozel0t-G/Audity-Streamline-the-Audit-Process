import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { loadConfig } from "../config.js";
import {
  controlPlaneStatus,
  createControlSession,
  createPublicDemoSession,
  demoOverview,
  getDemoSettings,
  performDemoReset,
  requireDemoControl,
  revokeControlSession,
  updateDemoSettings
} from "./service.js";

const refreshCookieName = "audity_refresh";
const controlLoginRateLimit = { max: 5, timeWindow: "5 minutes" };

const controlLoginSchema = z.object({
  secret: z.string().min(12).max(512),
  totpCode: z.string().trim().min(6).max(12).optional()
});

const settingsSchema = z.object({
  publicLoginEnabled: z.boolean().optional(),
  resetEnabled: z.boolean().optional(),
  resetIntervalMinutes: z.number().int().min(5).max(1440).optional(),
  telemetryEnabled: z.boolean().optional(),
  collectIpAddress: z.boolean().optional(),
  collectDeviceDetails: z.boolean().optional()
});

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw Object.assign(new Error("Invalid input"), {
      statusCode: 400,
      code: "INVALID_INPUT"
    });
  }
  return result.data;
}

function setRefreshCookie(reply: FastifyReply, token: string): void {
  const config = loadConfig();
  reply.setCookie(refreshCookieName, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: config.publicUrl.startsWith("https://"),
    path: "/api/auth",
    maxAge: 60 * 60 * 24 * 30
  });
}

function publicUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  alphaAcceptedAt?: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    permissions: user.permissions,
    alphaAcceptedAt: user.alphaAcceptedAt ?? null
  };
}

export async function registerDemoRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/demo/status", async () => {
    const settings = await getDemoSettings();
    return {
      demoModeEnabled: settings.demoModeEnabled,
      publicLoginEnabled: settings.publicLoginEnabled,
      resetEnabled: settings.resetEnabled,
      resetIntervalMinutes: settings.resetIntervalMinutes,
      nextResetAt: settings.nextResetAt,
      demoLoginEmail: settings.publicLoginEnabled ? settings.demoLoginEmail : null,
      control: controlPlaneStatus()
    };
  });

  app.post("/api/demo/public-login", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
    const session = await createPublicDemoSession(request);
    setRefreshCookie(reply, session.refreshToken);
    return {
      accessToken: session.accessToken,
      csrfToken: session.csrfToken,
      user: publicUser(session.user)
    };
  });

  app.post<{ Body: { secret?: string; totpCode?: string } }>(
    "/api/control/demo/login",
    { config: { rateLimit: controlLoginRateLimit } },
    async (request) => {
      const body = parseBody(controlLoginSchema, request.body);
      return createControlSession(request, body.secret, body.totpCode);
    }
  );

  app.post("/api/control/demo/logout", { preHandler: requireDemoControl }, async (request) => {
    await revokeControlSession(request);
    return { status: "ok" };
  });

  app.get("/api/control/demo/overview", { preHandler: requireDemoControl }, async () => demoOverview());

  app.put<{ Body: z.infer<typeof settingsSchema> }>("/api/control/demo/settings", { preHandler: requireDemoControl }, async (request) => {
    const body = parseBody(settingsSchema, request.body);
    return { settings: await updateDemoSettings(body) };
  });

  app.post("/api/control/demo/reset-now", { preHandler: requireDemoControl }, async () => ({
    result: await performDemoReset("manual", app.log)
  }));
}
