import type { FastifyReply } from "fastify";
import type { z } from "zod";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

export function validateBody<T>(schema: z.ZodType<T>, body: unknown, reply: FastifyReply): T | null {
  const result = schema.safeParse(body);
  if (!result.success) {
    void reply.code(400).send({
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      issues: result.error.flatten()
    });
    return null;
  }
  return result.data;
}
