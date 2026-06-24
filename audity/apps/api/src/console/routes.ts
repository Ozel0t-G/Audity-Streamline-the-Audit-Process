import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { loadConfig } from "../config.js";
import { requireCsrfPermission, requirePermission } from "../auth/hooks.js";
import { appendActivityEvent } from "../activity/service.js";
import { authenticateWithPasswordDetailed, getUserById, isSessionActive } from "../auth/service.js";
import { consumeRecoveryCode, getMfaSecret, isMfaEnabled, verifyTotp } from "../auth/mfa.js";
import { createNotification } from "../notifications/service.js";
import { pool } from "../db/client.js";
import { validateBody } from "../utils/validation.js";
import { mintConsoleGrant, revokeConsoleGrant, validateConsoleGrant } from "./grant.js";
import { COMMAND_ALLOWLIST, runCommand } from "./commands.js";

const authorizeSchema = z.object({
  password: z.string().min(1).max(256),
  totp: z.string().trim().min(1).max(64) // TOTP or recovery code
});

const runSchema = z.object({
  grant: z.string().min(1).max(256),
  command: z.string().min(1).max(64),
  args: z.record(z.string(), z.unknown()).optional()
});

const endSchema = z.object({ grant: z.string().min(1).max(256) });

async function notifyInstanceAdmins(message: string, byUserId: string): Promise<void> {
  const admins = await pool.query<{ id: string }>(
    `select u.id from users u join roles r on r.id = u.role_id where r.name = 'Instance Admin' and u.status = 'active'`
  );
  for (const admin of admins.rows) {
    await createNotification({
      recipientUserId: admin.id,
      type: "console_session",
      title: "Maintenance console used",
      message,
      entityType: "console_session",
      entityId: "1",
      createdByUserId: byUserId
    }).catch(() => undefined);
  }
}

export async function registerConsoleRoutes(app: FastifyInstance): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.consoleEnabled) return; // feature absent unless explicitly enabled

  // --- Step-up: password + MFA -> reusable session grant -------------------------
  app.post(
    "/api/admin/console/authorize",
    {
      preHandler: requireCsrfPermission("server.console"),
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } }
    },
    async (request, reply) => {
      const user = request.user!;
      if (user.role !== "Instance Admin") {
        return reply.code(403).send({ code: "CONSOLE_FORBIDDEN", message: "Instance Admin required" });
      }
      const body = validateBody(authorizeSchema, request.body, reply);
      if (!body) return;

      const outcome = await authenticateWithPasswordDetailed(user.email, body.password);
      if (!outcome.ok) {
        return reply.code(401).send({ code: "REAUTH_FAILED", message: "Password is incorrect" });
      }
      if (!(await isMfaEnabled(user.sub))) {
        return reply.code(412).send({ code: "MFA_REQUIRED", message: "Enable MFA before using the server console." });
      }
      const secret = await getMfaSecret(user.sub);
      const totpOk = Boolean(secret) && verifyTotp(secret as string, body.totp);
      const recoveryOk = !totpOk && (await consumeRecoveryCode(user.sub, body.totp));
      if (!totpOk && !recoveryOk) {
        return reply.code(401).send({ code: "MFA_FAILED", message: "MFA code is invalid" });
      }

      const grant = await mintConsoleGrant({
        userId: user.sub,
        sessionId: user.sid,
        ip: request.ip,
        userAgent: String(request.headers["user-agent"] ?? "")
      });
      await appendActivityEvent({
        userId: user.sub,
        action: "console.session_started",
        entityType: "console_session",
        entityId: "1",
        before: null,
        after: { ip: request.ip }
      }).catch(() => undefined);
      await notifyInstanceAdmins(`The maintenance console was opened from ${request.ip}.`, user.sub).catch(() => undefined);
      return { grant };
    }
  );

  // --- The allowlist (for the UI to render the command palette) -------------------
  // GET → permission only (no CSRF: browsers don't send a CSRF token on GET, and CSRF
  // protection is for state-changing methods anyway).
  app.get(
    "/api/admin/console/commands",
    { preHandler: requirePermission("server.console") },
    async () => ({ commands: COMMAND_ALLOWLIST })
  );

  // --- Run ONE allowlisted command ----------------------------------------------
  app.post(
    "/api/admin/console/run",
    { preHandler: requireCsrfPermission("server.console") },
    async (request, reply) => {
      const body = validateBody(runSchema, request.body, reply);
      if (!body) return;

      const grant = await validateConsoleGrant(body.grant);
      if (!grant) return reply.code(401).send({ code: "GRANT_INVALID", message: "Re-authenticate to continue" });
      if (grant.ip !== request.ip) return reply.code(403).send({ code: "IP_MISMATCH", message: "Session bound to another address" });
      if (!(await isSessionActive(grant.sessionId))) return reply.code(403).send({ code: "SESSION_REVOKED", message: "Session is no longer active" });
      const fresh = await getUserById(grant.userId);
      if (!fresh || fresh.role !== "Instance Admin" || !fresh.permissions.includes("server.console")) {
        return reply.code(403).send({ code: "NOT_AUTHORIZED", message: "Not authorized" });
      }
      if (!COMMAND_ALLOWLIST.some((c) => c.name === body.command)) {
        return reply.code(400).send({ code: "COMMAND_NOT_ALLOWED", message: `Command '${body.command}' is not in the allowlist` });
      }

      let result: { output: string };
      let ok = true;
      try {
        result = await runCommand(body.command, body.args ?? {}, {
          userId: grant.userId,
          userEmail: fresh.email,
          userName: fresh.name,
          userRole: fresh.role
        });
      } catch (error) {
        ok = false;
        result = { output: error instanceof Error ? error.message : "Command failed" };
      }
      await appendActivityEvent({
        userId: grant.userId,
        action: "console.command",
        entityType: "console_session",
        entityId: "1",
        before: null,
        after: { command: body.command, args: body.args ?? {}, ok }
      }).catch(() => undefined);

      // Always 200 for an executed command — `ok` carries success/failure so the UI
      // can show the command's own error output instead of a generic HTTP error.
      return reply.code(200).send({ ok, output: result.output });
    }
  );

  // --- End the session (revoke the grant) ----------------------------------------
  app.post(
    "/api/admin/console/end",
    { preHandler: requireCsrfPermission("server.console") },
    async (request, reply) => {
      const body = validateBody(endSchema, request.body, reply);
      if (!body) return;
      await revokeConsoleGrant(body.grant);
      return { ok: true };
    }
  );
}
