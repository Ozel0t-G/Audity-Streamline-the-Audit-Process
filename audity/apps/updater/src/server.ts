import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";

type UpdateJob = {
  id: string;
  status: "idle" | "running" | "succeeded" | "failed";
  requestedVersion: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  log: string[];
};

const token = process.env.AUDITY_UPDATER_TOKEN ?? "";
const port = Number(process.env.PORT ?? 3099);
const workdir = process.env.AUDITY_UPDATE_WORKDIR ?? "/audity";
const script = process.env.AUDITY_UPDATE_SCRIPT ?? "./scripts/update.sh";
const maxLogLines = Number(process.env.AUDITY_UPDATE_LOG_LINES ?? 500);

let currentJob: UpdateJob = {
  id: "idle",
  status: "idle",
  requestedVersion: null,
  startedAt: null,
  finishedAt: null,
  exitCode: null,
  log: []
};

const runSchema = z.object({
  version: z.string().trim().min(1).max(80).optional()
});

function appendLog(line: string) {
  const lines = line.split(/\r?\n/).filter(Boolean);
  currentJob.log.push(...lines);
  if (currentJob.log.length > maxLogLines) {
    currentJob.log = currentJob.log.slice(currentJob.log.length - maxLogLines);
  }
}

async function requireToken(request: FastifyRequest, reply: FastifyReply) {
  if (!token) {
    await reply.code(503).send({ code: "UPDATER_NOT_CONFIGURED", message: "Updater token is not configured" });
    return;
  }
  const header = request.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (bearer !== token) {
    await reply.code(401).send({ code: "UPDATER_AUTH_REQUIRED", message: "Updater token is invalid" });
  }
}

function startUpdate(version?: string) {
  currentJob = {
    id: randomUUID(),
    status: "running",
    requestedVersion: version ?? null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    log: []
  };

  const args = version ? [script, version] : [script];
  const child = spawn("sh", args, {
    cwd: workdir,
    env: {
      ...process.env,
      AUDITY_COMPOSE_FILE: process.env.AUDITY_COMPOSE_FILE ?? "docker-compose.prod.yml"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => appendLog(chunk.toString()));
  child.stderr.on("data", (chunk) => appendLog(chunk.toString()));
  child.on("error", (error) => {
    appendLog(`Updater failed to start: ${error.message}`);
    currentJob.status = "failed";
    currentJob.exitCode = -1;
    currentJob.finishedAt = new Date().toISOString();
  });
  child.on("close", (code) => {
    currentJob.exitCode = code ?? -1;
    currentJob.status = code === 0 ? "succeeded" : "failed";
    currentJob.finishedAt = new Date().toISOString();
  });
}

const app = fastify({ logger: true });

app.get("/health", async () => ({
  status: "ok",
  running: currentJob.status === "running"
}));

app.get("/status", { preHandler: requireToken }, async () => ({
  job: currentJob
}));

app.post<{ Body: unknown }>("/run", { preHandler: requireToken }, async (request, reply) => {
  if (currentJob.status === "running") {
    return reply.code(409).send({ code: "UPDATE_RUNNING", message: "An Audity update is already running", job: currentJob });
  }
  const parsed = runSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    return reply.code(400).send({ code: "VALIDATION_FAILED", message: "Invalid update request" });
  }
  startUpdate(parsed.data.version);
  return reply.code(202).send({ job: currentJob });
});

app.listen({ host: "0.0.0.0", port }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  app.log.error({ reason }, "Unhandled promise rejection in updater");
});
process.on("uncaughtException", (error) => {
  app.log.fatal({ err: error }, "Uncaught exception in updater — exiting");
  setTimeout(() => process.exit(1), 100).unref();
});
process.once("SIGTERM", () => {
  app.log.info("Updater received SIGTERM");
  void app.close().finally(() => process.exit(0));
});
process.once("SIGINT", () => {
  app.log.info("Updater received SIGINT");
  void app.close().finally(() => process.exit(0));
});
