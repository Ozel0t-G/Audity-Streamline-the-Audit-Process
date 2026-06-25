import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { pool } from "../db/client.js";
import { isUuid } from "../utils/validation.js";

/**
 * Public API: token-authenticated, read-only surface for the `public_api_tokens`
 * minted under Admin → Productivity. Those tokens were previously created/listed/
 * revoked but never validated anywhere, so they granted no access. This module is
 * their consumer.
 *
 * Scopes are granular (`read:customers`, `read:findings`, `read:evidence`,
 * `read:reports`). The legacy coarse `read` scope is honoured as an alias that
 * grants every `read:*` (tokens minted before the granular model existed).
 *
 * Authentication is purely Bearer-token (no cookie/session), so these routes are
 * exempt from the CSRF origin check (GET only) and never touch requireAuth.
 */

function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hasScope(scopes: string[], required: string): boolean {
  if (scopes.includes(required)) return true;
  // `read` is an alias granting every read:* scope (back-compat).
  if (required.startsWith("read:") && scopes.includes("read")) return true;
  return false;
}

/** Clamp a user-supplied `?limit` to a sane range (default 100, max 500). */
function parseLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 100;
  return Math.min(Math.floor(n), 500);
}

type AuthedToken = { id: string; scopes: string[] };

// Token resolved by requireApiToken, stashed for the handler if it needs scopes.
const tokenStore = new WeakMap<FastifyRequest, AuthedToken>();

export function apiToken(request: FastifyRequest): AuthedToken | undefined {
  return tokenStore.get(request);
}

/**
 * preHandler factory: authenticates the Bearer API token and enforces `scope`.
 * 401 for missing/invalid/expired/revoked tokens, 403 when the scope is absent.
 */
export function requireApiToken(scope: string): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization ?? "";
    const match = /^Bearer\s+(audity_[A-Za-z0-9_-]+)$/.exec(header);
    if (!match) {
      return reply.code(401).send({ code: "API_TOKEN_REQUIRED", message: "Bearer API token required" });
    }
    const row = await pool.query<{ id: string; scopes: unknown }>(
      `select id, scopes
         from public_api_tokens
        where token_hash = $1
          and revoked_at is null
          and (expires_at is null or expires_at > now())
        limit 1`,
      [hashSecret(match[1])]
    );
    const token = row.rows[0];
    if (!token) {
      return reply.code(401).send({ code: "API_TOKEN_INVALID", message: "API token is invalid, expired, or revoked" });
    }
    const scopes = Array.isArray(token.scopes) ? (token.scopes as string[]) : [];
    if (!hasScope(scopes, scope)) {
      return reply.code(403).send({ code: "API_SCOPE_DENIED", message: `Token is missing required scope "${scope}"` });
    }
    tokenStore.set(request, { id: token.id, scopes });
    // Best-effort usage timestamp — never block or fail the request on it.
    void pool
      .query("update public_api_tokens set last_used_at = now() where id = $1", [token.id])
      .catch(() => undefined);
  };
}

export async function registerPublicApiRoutes(app: FastifyInstance): Promise<void> {
  // --- Customers + assessments (read:customers) ---------------------------------
  app.get<{ Querystring: { limit?: string } }>(
    "/api/public/v1/customers",
    { preHandler: requireApiToken("read:customers") },
    async (request) => {
      const result = await pool.query(
        `select id, name, industry, business_criticality, status, created_at, updated_at
           from customers
          order by created_at desc
          limit $1`,
        [parseLimit(request.query.limit)]
      );
      return { customers: result.rows };
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/public/v1/customers/:id",
    { preHandler: requireApiToken("read:customers") },
    async (request, reply) => {
      if (!isUuid(request.params.id)) return reply.code(404).send({ code: "NOT_FOUND", message: "Customer not found" });
      const result = await pool.query(
        `select id, name, industry, regulatory_context, business_criticality, status, created_at, updated_at
           from customers where id = $1`,
        [request.params.id]
      );
      if (!result.rows[0]) return reply.code(404).send({ code: "NOT_FOUND", message: "Customer not found" });
      return { customer: result.rows[0] };
    }
  );

  app.get<{ Querystring: { limit?: string } }>(
    "/api/public/v1/assessments",
    { preHandler: requireApiToken("read:customers") },
    async (request) => {
      const result = await pool.query(
        `select id, customer_id, type, audience, framework_id, language, target_date, status, created_at, updated_at
           from assessments
          where archived_at is null
          order by created_at desc
          limit $1`,
        [parseLimit(request.query.limit)]
      );
      return { assessments: result.rows };
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/public/v1/assessments/:id",
    { preHandler: requireApiToken("read:customers") },
    async (request, reply) => {
      if (!isUuid(request.params.id)) return reply.code(404).send({ code: "NOT_FOUND", message: "Assessment not found" });
      const result = await pool.query(
        `select id, customer_id, type, audience, framework_id, language, target_date, status, scope, created_at, updated_at
           from assessments where id = $1 and archived_at is null`,
        [request.params.id]
      );
      if (!result.rows[0]) return reply.code(404).send({ code: "NOT_FOUND", message: "Assessment not found" });
      const frameworks = await pool.query(
        "select framework_id, mode from assessment_frameworks where assessment_id = $1",
        [request.params.id]
      );
      return { assessment: { ...result.rows[0], frameworks: frameworks.rows } };
    }
  );

  // --- Findings + risks + roadmap (read:findings) -------------------------------
  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    "/api/public/v1/assessments/:id/findings",
    { preHandler: requireApiToken("read:findings") },
    async (request, reply) => {
      if (!isUuid(request.params.id)) return reply.code(404).send({ code: "NOT_FOUND", message: "Assessment not found" });
      const result = await pool.query(
        `select id, assessment_id, title, status, priority, observation, recommendation, created_at, updated_at
           from findings
          where assessment_id = $1
          order by created_at desc
          limit $2`,
        [request.params.id, parseLimit(request.query.limit)]
      );
      return { findings: result.rows };
    }
  );

  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    "/api/public/v1/assessments/:id/risks",
    { preHandler: requireApiToken("read:findings") },
    async (request, reply) => {
      if (!isUuid(request.params.id)) return reply.code(404).send({ code: "NOT_FOUND", message: "Assessment not found" });
      const result = await pool.query(
        `select id, assessment_id, finding_id, title, likelihood, impact, risk_score, rating,
                treatment_option, owner, due_date, status, created_at, updated_at
           from risks
          where assessment_id = $1
          order by created_at desc
          limit $2`,
        [request.params.id, parseLimit(request.query.limit)]
      );
      return { risks: result.rows };
    }
  );

  // --- Evidence metadata (read:evidence) — never the object_key or file content -
  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    "/api/public/v1/assessments/:id/evidence",
    { preHandler: requireApiToken("read:evidence") },
    async (request, reply) => {
      if (!isUuid(request.params.id)) return reply.code(404).send({ code: "NOT_FOUND", message: "Assessment not found" });
      const result = await pool.query(
        `select id, assessment_id, file_name, mime_type, file_size, notes, created_at
           from evidence_items
          where assessment_id = $1
          order by created_at desc
          limit $2`,
        [request.params.id, parseLimit(request.query.limit)]
      );
      return { evidence: result.rows };
    }
  );

  // --- Report metadata (read:reports) — never the report content jsonb ----------
  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    "/api/public/v1/assessments/:id/reports",
    { preHandler: requireApiToken("read:reports") },
    async (request, reply) => {
      if (!isUuid(request.params.id)) return reply.code(404).send({ code: "NOT_FOUND", message: "Assessment not found" });
      const result = await pool.query(
        `select id, assessment_id, template_id, status, created_at, updated_at
           from reports
          where assessment_id = $1
          order by created_at desc
          limit $2`,
        [request.params.id, parseLimit(request.query.limit)]
      );
      return { reports: result.rows };
    }
  );
}
