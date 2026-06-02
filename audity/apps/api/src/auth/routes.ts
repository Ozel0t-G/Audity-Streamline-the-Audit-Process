import type { FastifyInstance, FastifyReply } from "fastify";
import { loadConfig } from "../config.js";
import { requirePermission } from "./hooks.js";
import { verifyAccessToken } from "./tokens.js";
import {
  createInstanceAdmin,
  getUserCount,
  loginWithPassword,
  refreshSession,
  revokeRefreshToken,
  revokeSession
} from "./service.js";

const refreshCookieName = "audity_refresh";

type SetupBody = {
  email?: string;
  name?: string;
  password?: string;
};

type LoginBody = {
  email?: string;
  password?: string;
};

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
  app.post<{ Body: SetupBody }>("/api/auth/setup", async (request, reply) => {
    if (!hasCredentials(request.body)) {
      return reply
        .code(400)
        .send({ code: "INVALID_INPUT", message: "Email and password are required" });
    }
    const count = await getUserCount();
    if (count > 0) {
      return reply
        .code(409)
        .send({ code: "SETUP_CLOSED", message: "Initial setup is already complete" });
    }
    const user = await createInstanceAdmin({
      email: request.body.email,
      name: request.body.name ?? "Instance Admin",
      password: request.body.password
    });
    const session = await loginWithPassword(request.body.email, request.body.password);
    if (!session) {
      return reply
        .code(500)
        .send({ code: "SETUP_SESSION_FAILED", message: "Setup session failed" });
    }
    setRefreshCookie(reply, session.refreshToken);
    return { accessToken: session.accessToken, user };
  });

  app.post<{ Body: LoginBody }>("/api/auth/login", async (request, reply) => {
    if (!hasCredentials(request.body)) {
      return reply
        .code(400)
        .send({ code: "INVALID_INPUT", message: "Email and password are required" });
    }
    const session = await loginWithPassword(request.body.email, request.body.password);
    if (!session) {
      return reply
        .code(401)
        .send({ code: "LOGIN_FAILED", message: "Invalid email or password" });
    }
    setRefreshCookie(reply, session.refreshToken);
    return { accessToken: session.accessToken, user: session.user };
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
      } catch {
        // Invalid tokens are already logged out from the caller perspective.
      }
    }
    reply.clearCookie(refreshCookieName, { path: "/api/auth" });
    return { status: "ok" };
  });

  app.post("/api/auth/refresh", async (request, reply) => {
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
    return { accessToken: session.accessToken, user: session.user };
  });

  app.get(
    "/api/auth/me",
    { preHandler: requirePermission("assessment.view") },
    async (request) => ({
      user: request.user
    })
  );
}
