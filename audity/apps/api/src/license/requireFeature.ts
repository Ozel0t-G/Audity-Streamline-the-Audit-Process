import type { FastifyReply, FastifyRequest } from "fastify";
import { requireAuth } from "../auth/hooks.js";
import { licenseService } from "./service.js";
import { isEntitled } from "./entitlement.js";

/**
 * Fastify preHandler factory: blocks an endpoint when the feature is not in the
 * active license. Demo ⇒ always allowed; free features ⇒ always allowed. While
 * the catalog is empty this is effectively a no-op.
 */
export function requireFeature(featureId: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (reply.sent) return;
    // When chained after requirePermission/requireCsrfPermission the request is
    // already authenticated — skip a redundant token verify + DB lookups.
    if (!request.user) {
      await requireAuth(request, reply);
      if (reply.sent) return;
    }
    if (!isEntitled(featureId, licenseService.getState())) {
      await reply.code(403).send({
        code: "FEATURE_NOT_LICENSED",
        message: `Feature "${featureId}" is not included in your license.`
      });
    }
  };
}
