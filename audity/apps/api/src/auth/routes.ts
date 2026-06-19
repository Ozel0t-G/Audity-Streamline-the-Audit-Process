import type { FastifyInstance, FastifyReply } from "fastify";
import argon2 from "argon2";
import { z } from "zod";
import { appendAuditEvent } from "../audit/service.js";
import { loadConfig } from "../config.js";
import { pool } from "../db/client.js";
import { requireAuth, requireCsrf, requirePermission } from "./hooks.js";
import {
  signMfaChallengeToken,
  verifyAccessToken,
  verifyMfaChallengeToken
} from "./tokens.js";
import {
  createMfaSetup,
  disableMfa,
  enableMfa,
  getMfaSecret,
  getRecoveryCodeStatus,
  isMfaEnabled,
  regenerateRecoveryCodes,
  storePendingMfaSecret,
  verifyTotp
} from "./mfa.js";
import {
  authenticateWithPassword,
  type AuthUser,
  createSession,
  createInstanceAdmin,
  getUserById,
  getUserCount,
  loginWithPassword,
  refreshSession,
  revokeAllUserSessions,
  revokeRefreshToken,
  revokeSession
} from "./service.js";

const refreshCookieName = "audity_refresh";
const authRateLimit = { max: 5, timeWindow: "1 minute" };
const refreshRateLimit = { max: 120, timeWindow: "1 minute" };

type SetupBody = {
  email?: string;
  name?: string;
  password?: string;
};

type LoginBody = {
  email?: string;
  password?: string;
};

type ChangePasswordBody = {
  currentPassword?: string;
  newPassword?: string;
};

function publicUser(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    permissions: user.permissions,
    alphaAcceptedAt: user.alphaAcceptedAt
  };
}

const setupSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).max(160).optional(),
  password: z.string().min(8).max(256)
});
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(256)
});
const mfaChallengeSchema = z.object({
  code: z.string().trim().min(6).max(12),
  challengeToken: z.string().min(1)
});
const mfaSetupVerifySchema = z.object({
  code: z.string().trim().min(6).max(12)
});
const disableMfaSchema = z.object({
  userId: z.string().uuid().optional()
});
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(8).max(256)
});

function validateBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw Object.assign(new Error("Invalid input"), {
      statusCode: 400,
      code: "INVALID_INPUT"
    });
  }
  return result.data;
}

function hasCredentials<T extends SetupBody | LoginBody>(
  body: T
): body is T & { email: string; password: string } {
  return Boolean(body.email && body.password);
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

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/auth/setup-status", async () => ({
    setupRequired: (await getUserCount()) === 0
  }));

  app.post<{ Body: SetupBody }>("/api/auth/setup", { config: { rateLimit: authRateLimit } }, async (request, reply) => {
    const body = validateBody(setupSchema, request.body);
    const count = await getUserCount();
    if (count > 0) {
      return reply
        .code(409)
        .send({ code: "SETUP_CLOSED", message: "Initial setup is already complete" });
    }
    const user = await createInstanceAdmin({
      email: body.email,
      name: body.name ?? "Instance Admin",
      password: body.password
    });
    const session = await loginWithPassword(body.email, body.password);
    if (!session) {
      return reply
        .code(500)
        .send({ code: "SETUP_SESSION_FAILED", message: "Setup session failed" });
    }
    setRefreshCookie(reply, session.refreshToken);
    return { accessToken: session.accessToken, csrfToken: session.csrfToken, user: publicUser(user) };
  });

  app.post<{ Body: LoginBody }>("/api/auth/login", { config: { rateLimit: authRateLimit } }, async (request, reply) => {
    const body = validateBody(loginSchema, request.body);
    const user = await authenticateWithPassword(body.email, body.password);
    if (!user) {
      await appendAuditEvent({
        actor: null,
        action: "auth.login.failed",
        entity: "user",
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
        payload: { email: body.email }
      });
      return reply
        .code(401)
        .send({ code: "LOGIN_FAILED", message: "Invalid email or password" });
    }
    if (await isMfaEnabled(user.id)) {
      return {
        mfaRequired: true,
        challengeToken: signMfaChallengeToken(user.id)
      };
    }
    const session = await createSession(user);
    await appendAuditEvent({
      actor: user.id,
      action: "auth.login.success",
      entity: "user",
      entityId: user.id,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null
    });
    setRefreshCookie(reply, session.refreshToken);
    return {
      accessToken: session.accessToken,
      csrfToken: session.csrfToken,
      user: publicUser(user)
    };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const refreshToken = request.cookies[refreshCookieName];
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
    if (token) {
      try {
        await revokeSession(verifyAccessToken(token).sid);
        await appendAuditEvent({
          actor: verifyAccessToken(token).sub,
          action: "auth.logout",
          entity: "session",
          entityId: verifyAccessToken(token).sid,
          ip: request.ip,
          userAgent: request.headers["user-agent"] ?? null
        });
      } catch {
        // Invalid tokens are already logged out from the caller perspective.
      }
    }
    reply.clearCookie(refreshCookieName, { path: "/api/auth" });
    return { status: "ok" };
  });

  app.post("/api/auth/refresh", { config: { rateLimit: refreshRateLimit } }, async (request, reply) => {
    const refreshToken = request.cookies[refreshCookieName];
    if (!refreshToken) {
      return reply
        .code(401)
        .send({ code: "REFRESH_REQUIRED", message: "Refresh token required" });
    }
    const session = await refreshSession(refreshToken);
    if (!session) {
      reply.clearCookie(refreshCookieName, { path: "/api/auth" });
      return reply
        .code(401)
        .send({ code: "REFRESH_INVALID", message: "Refresh token is invalid" });
    }
    setRefreshCookie(reply, session.refreshToken);
    return {
      accessToken: session.accessToken,
      csrfToken: session.csrfToken,
      user: publicUser(session.user)
    };
  });

  app.post(
    "/api/auth/logout-all",
    { preHandler: requireCsrf },
    async (request) => {
      await revokeAllUserSessions(request.user!.sub);
      return { status: "ok" };
    }
  );

  app.post("/api/auth/mfa/setup", { preHandler: requireAuth }, async (request) => {
    const setup = await createMfaSetup(request.user!.email);
    await storePendingMfaSecret(request.user!.sub, setup.secret);
    return setup;
  });

  app.post<{ Body: { code?: string; challengeToken?: string } }>(
    "/api/auth/mfa/challenge",
    { config: { rateLimit: authRateLimit } },
    async (request, reply) => {
      const body = validateBody(mfaChallengeSchema, request.body);
      let challenge;
      try {
        challenge = verifyMfaChallengeToken(body.challengeToken);
      } catch {
        return reply
          .code(401)
          .send({ code: "MFA_CHALLENGE_INVALID", message: "MFA challenge is invalid" });
      }
      const secret = await getMfaSecret(challenge.sub);
      if (!secret || !verifyTotp(secret, body.code)) {
        await appendAuditEvent({
          actor: challenge.sub,
          action: "auth.login.failed",
          entity: "mfa_settings",
          entityId: challenge.sub,
          ip: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
          payload: { reason: "mfa_failed" }
        });
        return reply
          .code(401)
          .send({ code: "MFA_FAILED", message: "MFA code is invalid" });
      }
      const user = await getUserById(challenge.sub);
      if (!user) {
        return reply.code(401).send({ code: "USER_NOT_FOUND", message: "User not found" });
      }
      const session = await createSession(user);
      setRefreshCookie(reply, session.refreshToken);
      await appendAuditEvent({
        actor: user.id,
        action: "auth.login.success",
        entity: "user",
        entityId: user.id,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
        payload: { mfa: true }
      });
      return {
        accessToken: session.accessToken,
        csrfToken: session.csrfToken,
        user: publicUser(user)
      };
    }
  );

  app.post<{ Body: { code?: string } }>(
    "/api/auth/mfa/verify",
    { config: { rateLimit: authRateLimit }, preHandler: requireAuth },
    async (request, reply) => {
      const body = validateBody(mfaSetupVerifySchema, request.body);
      const secret = await getMfaSecret(request.user!.sub);
      if (!secret || !verifyTotp(secret, body.code)) {
        return reply.code(401).send({ code: "MFA_FAILED", message: "MFA code is invalid" });
      }
      const recoveryCodes = await enableMfa(request.user!.sub);
      await appendAuditEvent({
        actor: request.user!.sub,
        action: "auth.mfa.enabled",
        entity: "mfa_settings",
        entityId: request.user!.sub,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      });
      await appendAuditEvent({
        actor: request.user!.sub,
        action: "auth.mfa.verified",
        entity: "mfa_settings",
        entityId: request.user!.sub,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      });
      return { status: "ok", recoveryCodes };
    }
  );

  app.post<{ Body: { userId?: string } }>(
    "/api/auth/mfa/disable",
    { preHandler: requireCsrf },
    async (request, reply) => {
      const body = validateBody(disableMfaSchema, request.body);
      const targetUserId = body.userId ?? request.user!.sub;
      const disablingOtherUser = targetUserId !== request.user!.sub;
      const isAdmin = ["Instance Admin", "Tenant Admin"].includes(request.user!.role);
      if (disablingOtherUser && !isAdmin) {
        return reply
          .code(403)
          .send({ code: "PERMISSION_DENIED", message: "Only admins can disable MFA for other users" });
      }
      await disableMfa(targetUserId);
      await appendAuditEvent({
        actor: request.user!.sub,
        action: "auth.mfa.disabled",
        entity: "mfa_settings",
        entityId: targetUserId,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      });
      return { status: "ok" };
    }
  );

  app.post(
    "/api/auth/change-password",
    { preHandler: requireCsrf },
    async (request, reply) => {
      const body = validateBody(changePasswordSchema, request.body) as Required<ChangePasswordBody>;
      const user = await pool.query<{ password_hash: string }>(
        "select password_hash from users where id = $1 and status = 'active'",
        [request.user!.sub]
      );
      if (!user.rows[0] || !(await argon2.verify(user.rows[0].password_hash, body.currentPassword))) {
        return reply.code(401).send({ code: "PASSWORD_INVALID", message: "Current password is incorrect" });
      }
      const passwordHash = await argon2.hash(body.newPassword, { type: argon2.argon2id });
      await pool.query("update users set password_hash = $2, updated_at = now() where id = $1", [
        request.user!.sub,
        passwordHash
      ]);
      await pool.query("update sessions set revoked_at = now() where user_id = $1 and id <> $2 and revoked_at is null", [
        request.user!.sub,
        request.user!.sid
      ]);
      await appendAuditEvent({
        actor: request.user!.sub,
        action: "auth.password.changed",
        entity: "user",
        entityId: request.user!.sub,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      });
      return { status: "ok" };
    }
  );

  app.post(
    "/api/auth/alpha-accept",
    { preHandler: requireCsrf },
    async (request) => {
      await pool.query("update users set alpha_accepted_at = now(), updated_at = now() where id = $1", [
        request.user!.sub
      ]);
      const user = await getUserById(request.user!.sub);
      return user ? { user: publicUser(user) } : { user: null };
    }
  );

  app.get(
    "/api/auth/mfa/status",
    { preHandler: requireAuth },
    async (request) => ({
      enabled: await isMfaEnabled(request.user!.sub),
      recoveryCodes: await getRecoveryCodeStatus(request.user!.sub)
    })
  );

  app.post(
    "/api/auth/mfa/recovery-codes",
    { preHandler: requireCsrf },
    async (request, reply) => {
      if (!(await isMfaEnabled(request.user!.sub))) {
        return reply.code(409).send({ code: "MFA_NOT_ENABLED", message: "MFA must be enabled first" });
      }
      const recoveryCodes = await regenerateRecoveryCodes(request.user!.sub);
      await appendAuditEvent({
        actor: request.user!.sub,
        action: "auth.mfa.recovery_codes_regenerated",
        entity: "mfa_settings",
        entityId: request.user!.sub,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      });
      return { recoveryCodes };
    }
  );

  app.get(
    "/api/auth/me",
    { preHandler: requirePermission("assessment.view") },
    async (request) => ({
      user: publicUser(request.user!)
    })
  );

  const preferencesSchema = z.object({
    language: z.enum(["English", "Deutsch"]).optional(),
    theme: z.enum(["System", "Light", "Dark"]).optional(),
    notificationsEnabled: z.boolean().optional(),
    defaultView: z.string().trim().min(1).max(40).optional(),
    tableDensity: z.enum(["Comfortable", "Compact"]).optional(),
    exportFormat: z.enum(["CSV", "JSON"]).optional(),
    tooltipsEnabled: z.boolean().optional()
  });

  app.get(
    "/api/user/preferences",
    { preHandler: requireAuth },
    async (request) => {
      const result = await pool.query(
        `select language, theme, notifications_enabled, default_view, table_density, export_format, tooltips_enabled
         from user_preferences where user_id = $1`,
        [request.user!.sub]
      );
      const row = result.rows[0];
      return {
        preferences: {
          language: row?.language ?? "English",
          theme: row?.theme ?? "System",
          notificationsEnabled: row?.notifications_enabled ?? true,
          defaultView: row?.default_view ?? "Dashboard",
          tableDensity: row?.table_density ?? "Comfortable",
          exportFormat: row?.export_format ?? "CSV",
          tooltipsEnabled: row?.tooltips_enabled ?? true
        }
      };
    }
  );

  app.put(
    "/api/user/preferences",
    { preHandler: requireCsrf },
    async (request) => {
      const body = validateBody(preferencesSchema, request.body);
      await pool.query(
        `insert into user_preferences (user_id, language, theme, notifications_enabled, default_view, table_density, export_format, tooltips_enabled, updated_at)
         values ($1, coalesce($2, 'English'), coalesce($3, 'System'), coalesce($4, true), coalesce($5, 'Dashboard'), coalesce($6, 'Comfortable'), coalesce($7, 'CSV'), coalesce($8, true), now())
         on conflict (user_id) do update set
           language = coalesce($2, user_preferences.language),
           theme = coalesce($3, user_preferences.theme),
           notifications_enabled = coalesce($4, user_preferences.notifications_enabled),
           default_view = coalesce($5, user_preferences.default_view),
           table_density = coalesce($6, user_preferences.table_density),
           export_format = coalesce($7, user_preferences.export_format),
           tooltips_enabled = coalesce($8, user_preferences.tooltips_enabled),
           updated_at = now()`,
        [
          request.user!.sub,
          body.language ?? null,
          body.theme ?? null,
          body.notificationsEnabled ?? null,
          body.defaultView ?? null,
          body.tableDensity ?? null,
          body.exportFormat ?? null,
          body.tooltipsEnabled ?? null
        ]
      );
      return { status: "ok" };
    }
  );
}
