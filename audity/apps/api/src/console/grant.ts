import { Redis } from "ioredis";
import { loadConfig } from "../config.js";
import { randomToken, sha256 } from "../utils/crypto.js";

// Authorization for one console session (a series of allowlisted commands). Issued
// only after a fresh step-up (password + MFA). Stored server-side in Redis so it is
// revocable and bounded by a TTL; the raw token never touches the DB or a URL.
const TTL_SECONDS = 1800;

let client: Redis | null = null;
function redis(): Redis {
  if (!client) {
    client = new Redis(loadConfig().redisUrl, { maxRetriesPerRequest: null });
    client.on("error", () => undefined);
  }
  return client;
}

export type ConsoleGrant = {
  userId: string;
  sessionId: string; // the auth session (sid) this grant is bound to
  ip: string;
  userAgent: string;
};

function keyFor(token: string): string {
  return `console:grant:${sha256(token)}`;
}

export async function mintConsoleGrant(grant: ConsoleGrant): Promise<string> {
  const token = randomToken(32);
  await redis().set(keyFor(token), JSON.stringify(grant), "EX", TTL_SECONDS);
  return token;
}

// Validate a grant WITHOUT consuming it, so multiple commands can run within the same
// console session. The grant still expires by its Redis TTL.
export async function validateConsoleGrant(token: string | undefined): Promise<ConsoleGrant | null> {
  if (!token) return null;
  const raw = await redis().get(keyFor(token)).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ConsoleGrant;
  } catch {
    return null;
  }
}

// Explicitly revoke a grant (e.g. when the user closes the console).
export async function revokeConsoleGrant(token: string | undefined): Promise<void> {
  if (!token) return;
  await redis().del(keyFor(token)).catch(() => undefined);
}
