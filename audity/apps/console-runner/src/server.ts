import { createHash, timingSafeEqual } from "node:crypto";
import fastify, { type FastifyRequest } from "fastify";
import websocket from "@fastify/websocket";
import * as pty from "node-pty";
import type { WebSocket } from "ws";

// Dedicated, isolated PTY runner. The API server (and only the API, over the internal
// Docker network) connects here with a bearer token to open an interactive shell.
// This service is intentionally minimal and holds NO application secrets.

const port = Number(process.env.PORT ?? 3100);
const token = process.env.AUDITY_CONSOLE_RUNNER_TOKEN ?? "";
const shell = process.env.AUDITY_CONSOLE_SHELL ?? "/bin/sh";
const maxSessionSeconds = Number(process.env.AUDITY_CONSOLE_MAX_SESSION_SECONDS ?? 1800);

function tokensMatch(provided: string, expected: string): boolean {
  // Constant-time compare over fixed-length digests (no length leak, no timing leak).
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function authorized(request: FastifyRequest): boolean {
  if (!token) return false; // refuse if not configured
  const header = request.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  return tokensMatch(bearer, token);
}

// A deliberately minimal environment — never inherit the process env, which could
// otherwise leak anything mounted into this container.
function shellEnv(): Record<string, string> {
  return {
    PATH: process.env.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    TERM: "xterm-color",
    HOME: process.env.HOME ?? "/home/console",
    LANG: "C.UTF-8"
  };
}

const app = fastify({ logger: true });
await app.register(websocket, { options: { maxPayload: 1024 * 1024 } });

app.get("/health", async () => ({ status: "ok", process: "audity-console-runner" }));

app.get(
  "/pty",
  {
    websocket: true,
    preValidation: async (request, reply) => {
      if (!authorized(request)) {
        await reply.code(401).send({ code: "UNAUTHORIZED" });
      }
    }
  },
  (socket: WebSocket) => {
    const term = pty.spawn(shell, [], {
      name: "xterm-color",
      cols: 80,
      rows: 24,
      cwd: shellEnv().HOME,
      env: shellEnv()
    });

    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearTimeout(maxTimer);
      try {
        term.kill();
      } catch {
        /* already dead */
      }
      try {
        socket.close();
      } catch {
        /* already closed */
      }
    };

    // Hard cap on session length as defense-in-depth (the API enforces its own too).
    const maxTimer = setTimeout(cleanup, maxSessionSeconds * 1000);

    term.onData((data: string) => {
      try {
        socket.send(data);
      } catch {
        cleanup();
      }
    });
    term.onExit(() => cleanup());

    socket.on("message", (raw: Buffer) => {
      let msg: { type?: string; data?: string; cols?: number; rows?: number };
      try {
        msg = JSON.parse(raw.toString("utf8"));
      } catch {
        return;
      }
      if (msg.type === "input" && typeof msg.data === "string") {
        term.write(msg.data);
      } else if (msg.type === "resize" && typeof msg.cols === "number" && typeof msg.rows === "number") {
        try {
          term.resize(Math.max(1, msg.cols), Math.max(1, msg.rows));
        } catch {
          /* ignore bad sizes */
        }
      }
    });

    socket.on("close", cleanup);
    socket.on("error", cleanup);
  }
);

app.listen({ host: "0.0.0.0", port }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
