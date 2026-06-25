import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireCsrf, requirePermission } from "../auth/hooks.js";
import { validateBody } from "../utils/validation.js";
import {
  getPublicSettings,
  listRuns,
  testDestination,
  updateDestination,
  type DestinationInput
} from "./service.js";

async function requireInstanceAdminCsrf(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await requireCsrf(request, reply);
  if (reply.sent) return;
  if (request.user?.role !== "Instance Admin") {
    await reply
      .code(403)
      .send({ code: "INSTANCE_ADMIN_REQUIRED", message: "Instance Admin role required" });
  }
}

const destinationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("local"),
    path: z.string().trim().max(1024).optional()
  }),
  z.object({
    type: z.literal("sftp"),
    host: z.string().trim().min(1).max(255),
    port: z.number().int().min(1).max(65535).optional(),
    username: z.string().trim().min(1).max(255),
    password: z.string().max(1024).optional(),
    remotePath: z.string().trim().min(1).max(1024)
  }),
  z.object({
    type: z.literal("s3"),
    endpoint: z.string().trim().url().max(1024),
    region: z.string().trim().max(128).optional(),
    bucket: z.string().trim().min(1).max(255),
    accessKey: z.string().trim().min(1).max(512),
    secretKey: z.string().max(1024).optional(),
    prefix: z.string().trim().max(1024).optional(),
    useSSL: z.boolean().optional()
  }),
  z.object({
    type: z.literal("ftp"),
    host: z.string().trim().min(1).max(255),
    port: z.number().int().min(1).max(65535).optional(),
    username: z.string().trim().min(1).max(255),
    password: z.string().max(1024).optional(),
    remotePath: z.string().trim().min(1).max(1024),
    secure: z.boolean().optional()
  })
]);

export async function registerLogArchiveRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/admin/log-archive/settings",
    { preHandler: requirePermission("backup.manage") },
    async () => ({ settings: await getPublicSettings() })
  );

  app.get(
    "/api/admin/log-archive/runs",
    { preHandler: requirePermission("backup.manage") },
    async () => ({ runs: await listRuns(50) })
  );

  app.patch<{ Body: DestinationInput }>(
    "/api/admin/log-archive/destination",
    { preHandler: requireInstanceAdminCsrf },
    async (request, reply) => {
      const body = validateBody(destinationSchema, request.body, reply);
      if (!body) return;
      try {
        const settings = await updateDestination(body as DestinationInput, {
          userId: request.user!.sub,
          ip: request.ip,
          userAgent: request.headers["user-agent"] ?? null
        });
        return { settings };
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode ?? 400;
        return reply.code(statusCode).send({
          code: "LOG_ARCHIVE_DESTINATION_INVALID",
          message: error instanceof Error ? error.message : "Invalid destination"
        });
      }
    }
  );

  app.post<{ Body: DestinationInput }>(
    "/api/admin/log-archive/test",
    { preHandler: requireInstanceAdminCsrf },
    async (request, reply) => {
      const body = validateBody(destinationSchema, request.body, reply);
      if (!body) return;
      try {
        await testDestination(body as DestinationInput);
        return { ok: true };
      } catch (error) {
        return reply.code(400).send({
          code: "LOG_ARCHIVE_TEST_FAILED",
          message: error instanceof Error ? error.message : "Connection test failed"
        });
      }
    }
  );
}
