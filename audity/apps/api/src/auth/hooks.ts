import type { FastifyReply, FastifyRequest } from "fastify";
import { isSessionActive } from "./service.js";
import { verifyAccessToken, type AccessTokenPayload } from "./tokens.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AccessTokenPayload;
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
    request.user = verifyAccessToken(token);
    if (!(await isSessionActive(request.user.sid))) {
      await reply
        .code(401)
        .send({ code: "SESSION_REVOKED", message: "Session is no longer active" });
    }
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
