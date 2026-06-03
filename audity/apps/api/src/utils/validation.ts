import type { FastifyReply } from "fastify";
import type { z } from "zod";

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
