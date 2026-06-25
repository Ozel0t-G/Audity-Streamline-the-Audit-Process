import type { FastifyReply } from "fastify";
import { z } from "zod";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

// Optional date field for endpoints that pass the value into a SQL `::date`/date column.
// Accepts empty/null/undefined, or any string Postgres `::date` can parse — i.e. the
// `YYYY-MM-DD` a <input type="date"> produces, or an ISO datetime echoed back from the API.
// Rejecting un-parseable strings turns a Postgres "invalid input syntax for type date" 500
// into a clean 400. Lenient on purpose so it never rejects a value the frontend sends.
export const optionalDateString = z
  .string()
  .refine((value) => value === "" || !Number.isNaN(Date.parse(value)), { message: "Invalid date" })
  .nullable()
  .optional();

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
