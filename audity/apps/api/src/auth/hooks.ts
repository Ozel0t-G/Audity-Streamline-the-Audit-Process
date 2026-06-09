import type { FastifyReply, FastifyRequest } from "fastify";
import { getUserById, isCsrfTokenValid, isSessionActive, type AuthUser } from "./service.js";
import { verifyAccessToken, type AccessTokenPayload } from "./tokens.js";

export type AuthenticatedUser = AuthUser & Pick<AccessTokenPayload, "sid" | "sub">;

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

export async function requireCsrf(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await requireAuth(request, reply);
  if (reply.sent) {
    return;
  }
  const token = request.headers["x-csrf-token"];
  const csrfToken = Array.isArray(token) ? token[0] : token;
  if (!request.user || !(await isCsrfTokenValid(request.user.sid, csrfToken))) {
    await reply
      .code(403)
      .send({ code: "CSRF_INVALID", message: "CSRF token is invalid" });
  }
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token) {
    await reply
      .code(401)
      .send({ code: "AUTH_REQUIRED", message: "Authentication required" });
    return;
  }
  try {
    const payload = verifyAccessToken(token);
    if (!(await isSessionActive(payload.sid))) {
      await reply
        .code(401)
        .send({ code: "SESSION_REVOKED", message: "Session is no longer active" });
      return;
    }
    const user = await getUserById(payload.sub);
    if (!user) {
      await reply
        .code(401)
        .send({ code: "USER_INACTIVE", message: "User is no longer active" });
      return;
    }
    request.user = { ...user, sub: user.id, sid: payload.sid };
  } catch {
    if (!reply.sent) {
      await reply
        .code(401)
        .send({ code: "TOKEN_INVALID", message: "Access token is invalid" });
    }
  }
}

export function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await requireAuth(request, reply);
    if (reply.sent) {
      return;
    }
    if (!request.user?.permissions.includes(permission)) {
      await reply
        .code(403)
        .send({ code: "PERMISSION_DENIED", message: "Permission denied" });
    }
  };
}

export function requireCsrfPermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await requireCsrf(request, reply);
    if (reply.sent) {
      return;
    }
    if (!request.user?.permissions.includes(permission)) {
      await reply
        .code(403)
        .send({ code: "PERMISSION_DENIED", message: "Permission denied" });
    }
  };
}
