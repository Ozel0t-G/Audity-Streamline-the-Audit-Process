import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyBaseLogger, FastifyReply, FastifyRequest } from "fastify";
import argon2 from "argon2";
import { authenticator } from "otplib";
import { createSession, getUserByEmail, type AuthUser } from "../auth/service.js";
import { loadConfig } from "../config.js";
import { pool } from "../db/client.js";
import { seedRolesAndPermissions } from "../rbac/seed.js";

const controlSessionMinutes = 15;
const settingsId = "default";

export type DemoSettings = {
  demoModeEnabled: boolean;
  publicLoginEnabled: boolean;
  resetEnabled: boolean;
  resetIntervalMinutes: number;
  nextResetAt: string | null;
  telemetryEnabled: boolean;
  collectIpAddress: boolean;
  collectIpHash: boolean;
  collectDeviceDetails: boolean;
  resetDataDeletionEnabled: boolean;
  demoLoginEmail: string;
  demoLoginRole: string;
  lastResetAt: string | null;
  updatedAt: string;
};

type SettingsRow = {
  demo_mode_enabled: boolean;
  public_login_enabled: boolean;
  reset_enabled: boolean;
  reset_interval_minutes: number;
  next_reset_at: string | null;
  telemetry_enabled: boolean;
  collect_ip_address: boolean;
  collect_ip_hash: boolean;
  collect_device_details: boolean;
  reset_data_deletion_enabled: boolean;
  demo_login_email: string;
  demo_login_role: string;
  last_reset_at: string | null;
  updated_at: string;
};

declare module "fastify" {
  interface FastifyRequest {
    demoControlSessionId?: string;
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

function clampResetMinutes(value: number): number {
  if (!Number.isFinite(value)) return 60;
  return Math.min(1440, Math.max(5, Math.round(value)));
}

function clientIp(request: FastifyRequest): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() || request.ip;
  }
  return request.ip;
}

function maskIp(ip: string): string {
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }
  if (ip.includes(":")) {
    return `${ip.split(":").slice(0, 4).join(":")}::`;
  }
  return "unknown";
}

function parseDevice(userAgent = "") {
  const lower = userAgent.toLowerCase();
  const deviceType = /mobile|android|iphone/.test(lower) ? "mobile" : /ipad|tablet/.test(lower) ? "tablet" : "desktop";
  const browser = lower.includes("edg/")
    ? "Edge"
    : lower.includes("chrome/")
      ? "Chrome"
      : lower.includes("firefox/")
        ? "Firefox"
        : lower.includes("safari/")
          ? "Safari"
          : "Unknown";
  const operatingSystem = lower.includes("windows")
    ? "Windows"
    : lower.includes("mac os") || lower.includes("macintosh")
      ? "macOS"
      : lower.includes("linux")
        ? "Linux"
        : lower.includes("android")
          ? "Android"
          : lower.includes("iphone") || lower.includes("ipad")
            ? "iOS"
            : "Unknown";
  return { browser, deviceType, operatingSystem };
}

function mapSettings(row: SettingsRow): DemoSettings {
  return {
    demoModeEnabled: row.demo_mode_enabled,
    publicLoginEnabled: row.public_login_enabled,
    resetEnabled: row.reset_enabled,
    resetIntervalMinutes: Number(row.reset_interval_minutes),
    nextResetAt: row.next_reset_at,
    telemetryEnabled: row.telemetry_enabled,
    collectIpAddress: row.collect_ip_address,
    collectIpHash: row.collect_ip_hash,
    collectDeviceDetails: row.collect_device_details,
    resetDataDeletionEnabled: row.reset_data_deletion_enabled,
    demoLoginEmail: row.demo_login_email,
    demoLoginRole: row.demo_login_role,
    lastResetAt: row.last_reset_at,
    updatedAt: row.updated_at
  };
}

export async function ensureDemoSettings(): Promise<DemoSettings> {
  const config = loadConfig();
  const resetMinutes = clampResetMinutes(config.demoDefaultResetMinutes);
  await pool.query(
    `insert into demo_control_settings
      (id, demo_mode_enabled, public_login_enabled, reset_enabled, reset_interval_minutes,
       next_reset_at, reset_data_deletion_enabled, demo_login_email, demo_login_role)
     values ($1,$2,$3,$4,$5, now() + ($5::integer || ' minutes')::interval, $6, lower($7), $8)
     on conflict (id) do nothing`,
    [
      settingsId,
      config.demoModeEnabled,
      config.demoPublicLoginEnabled,
      config.demoResetEnabled,
      resetMinutes,
      config.demoResetAllowDataDeletion,
      config.demoPublicLoginEmail,
      config.demoPublicLoginRole
    ]
  );
  const result = await pool.query<SettingsRow>(
    `update demo_control_settings
     set demo_mode_enabled = $2,
         demo_login_email = lower($3),
         demo_login_role = $4,
         reset_data_deletion_enabled = $5,
         updated_at = now()
     where id = $1
     returning *`,
    [settingsId, config.demoModeEnabled, config.demoPublicLoginEmail, config.demoPublicLoginRole, config.demoResetAllowDataDeletion]
  );
  return mapSettings(result.rows[0]);
}

export async function getDemoSettings(): Promise<DemoSettings> {
  await ensureDemoSettings();
  const result = await pool.query<SettingsRow>("select * from demo_control_settings where id = $1", [settingsId]);
  return mapSettings(result.rows[0]);
}

export async function updateDemoSettings(input: {
  publicLoginEnabled?: boolean;
  resetEnabled?: boolean;
  resetIntervalMinutes?: number;
  telemetryEnabled?: boolean;
  collectIpAddress?: boolean;
  collectDeviceDetails?: boolean;
}): Promise<DemoSettings> {
  const resetMinutes = input.resetIntervalMinutes === undefined ? null : clampResetMinutes(input.resetIntervalMinutes);
  const result = await pool.query<SettingsRow>(
    `update demo_control_settings
     set public_login_enabled = coalesce($2, public_login_enabled),
         reset_enabled = coalesce($3, reset_enabled),
         reset_interval_minutes = coalesce($4, reset_interval_minutes),
         telemetry_enabled = coalesce($5, telemetry_enabled),
         collect_ip_address = coalesce($6, collect_ip_address),
         collect_device_details = coalesce($7, collect_device_details),
         next_reset_at = case
           when $4::integer is null then next_reset_at
           else now() + ($4::integer || ' minutes')::interval
         end,
         updated_by = 'control',
         updated_at = now()
     where id = $1
     returning *`,
    [
      settingsId,
      input.publicLoginEnabled ?? null,
      input.resetEnabled ?? null,
      resetMinutes,
      input.telemetryEnabled ?? null,
      input.collectIpAddress ?? null,
      input.collectDeviceDetails ?? null
    ]
  );
  return mapSettings(result.rows[0]);
}

export async function ensurePublicDemoUser(): Promise<AuthUser | null> {
  const settings = await getDemoSettings();
  if (!settings.demoModeEnabled) return null;
  const config = loadConfig();
  await seedRolesAndPermissions();
  const role = await pool.query<{ id: string }>("select id from roles where name = $1", [settings.demoLoginRole]);
  if (!role.rows[0]) throw new Error("Configured demo role does not exist");
  const passwordHash = await argon2.hash(config.demoPublicLoginPassword, { type: argon2.argon2id });
  await pool.query(
    `insert into users (id, email, name, password_hash, role_id, status, alpha_accepted_at)
     values ($1, lower($2), $3, $4, $5, 'active', now())
     on conflict (email) do update
       set name = excluded.name,
           password_hash = excluded.password_hash,
           role_id = excluded.role_id,
           status = 'active',
           alpha_accepted_at = coalesce(users.alpha_accepted_at, now()),
           updated_at = now()`,
    [randomUUID(), settings.demoLoginEmail, config.demoPublicLoginName, passwordHash, role.rows[0].id]
  );
  const user = await getUserByEmail(settings.demoLoginEmail);
  return user && user.status === "active" ? user : null;
}

export async function createPublicDemoSession(request: FastifyRequest): Promise<{
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
}> {
  const settings = await getDemoSettings();
  if (!settings.demoModeEnabled || !settings.publicLoginEnabled) {
    throw Object.assign(new Error("Public demo login is disabled"), { statusCode: 403, code: "DEMO_LOGIN_DISABLED" });
  }
  const user = await ensurePublicDemoUser();
  if (!user) throw Object.assign(new Error("Demo user could not be loaded"), { statusCode: 500, code: "DEMO_USER_FAILED" });
  const tokens = await createSession(user);
  await recordDemoLoginEvent({ request, user, email: user.email, loginMethod: "public_demo" });
  return { user, ...tokens };
}

export async function recordDemoLoginEvent(input: {
  request: FastifyRequest;
  user?: AuthUser | null;
  email?: string | null;
  loginMethod: string;
}): Promise<void> {
  try {
    const settings = await getDemoSettings();
    if (!settings.demoModeEnabled || !settings.telemetryEnabled) return;
    const ip = clientIp(input.request);
    const userAgent = String(input.request.headers["user-agent"] ?? "");
    const device = parseDevice(userAgent);
    await pool.query(
      `insert into demo_login_events
        (id, user_id, email, login_method, ip_hash, ip_address, ip_masked, device_type, browser, operating_system, user_agent, accept_language)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        randomUUID(),
        input.user?.id ?? null,
        input.email ?? input.user?.email ?? null,
        input.loginMethod,
        settings.collectIpHash ? sha256(`${loadConfig().appSecret}:${ip}`) : null,
        settings.collectIpAddress ? ip : null,
        maskIp(ip),
        settings.collectDeviceDetails ? device.deviceType : null,
        settings.collectDeviceDetails ? device.browser : null,
        settings.collectDeviceDetails ? device.operatingSystem : null,
        settings.collectDeviceDetails ? userAgent : null,
        input.request.headers["accept-language"] ?? null
      ]
    );
  } catch {
    // Demo telemetry must never break authentication.
  }
}

async function appendControlAuditEvent(request: FastifyRequest, action: string, payload: Record<string, unknown> = {}) {
  const settings = await getDemoSettings();
  const ip = clientIp(request);
  await pool.query(
    `insert into demo_control_audit_events (id, action, ip_hash, ip_address, user_agent, payload)
     values ($1,$2,$3,$4,$5,$6::jsonb)`,
    [
      randomUUID(),
      action,
      settings.collectIpHash ? sha256(`${loadConfig().appSecret}:${ip}`) : null,
      settings.collectIpAddress ? ip : null,
      request.headers["user-agent"] ?? null,
      JSON.stringify(payload)
    ]
  );
}

function isIpAllowed(request: FastifyRequest): boolean {
  const allowlist = loadConfig().demoControlIpAllowlist;
  if (!allowlist.length) return true;
  const ip = clientIp(request);
  return allowlist.includes(ip);
}

async function verifyControlSecret(secret: string): Promise<boolean> {
  const hash = loadConfig().demoControlSecretHash;
  if (!hash) return false;
  if (hash.startsWith("$argon2")) return argon2.verify(hash, secret);
  return safeEqual(sha256(secret), hash.toLowerCase());
}

function verifyControlTotp(code?: string): boolean {
  const secret = loadConfig().demoControlTotpSecret;
  if (!secret) return true;
  if (!code) return false;
  return authenticator.check(code, secret);
}

export function controlPlaneStatus() {
  const config = loadConfig();
  return {
    configured: Boolean(config.demoControlSecretHash),
    totpRequired: Boolean(config.demoControlTotpSecret),
    ipAllowlistEnabled: config.demoControlIpAllowlist.length > 0,
    sessionMinutes: controlSessionMinutes
  };
}

export async function createControlSession(request: FastifyRequest, secret: string, totpCode?: string) {
  const settings = await getDemoSettings();
  if (!settings.demoModeEnabled) throw Object.assign(new Error("Demo mode is disabled"), { statusCode: 404, code: "DEMO_DISABLED" });
  if (!isIpAllowed(request)) {
    await appendControlAuditEvent(request, "control.login.denied_ip");
    throw Object.assign(new Error("Control login is not allowed from this IP"), { statusCode: 403, code: "CONTROL_IP_DENIED" });
  }
  if (!(await verifyControlSecret(secret)) || !verifyControlTotp(totpCode)) {
    await appendControlAuditEvent(request, "control.login.failed");
    throw Object.assign(new Error("Control credentials are invalid"), { statusCode: 401, code: "CONTROL_LOGIN_FAILED" });
  }
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + controlSessionMinutes * 60 * 1000);
  const ip = clientIp(request);
  const id = randomUUID();
  await pool.query(
    `insert into demo_control_sessions (id, token_hash, ip_hash, ip_address, user_agent, expires_at)
     values ($1,$2,$3,$4,$5,$6)`,
    [
      id,
      sha256(token),
      sha256(`${loadConfig().appSecret}:${ip}`),
      settings.collectIpAddress ? ip : null,
      request.headers["user-agent"] ?? null,
      expiresAt
    ]
  );
  await appendControlAuditEvent(request, "control.login.success");
  return { controlToken: token, expiresAt: expiresAt.toISOString() };
}

export async function requireDemoControl(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers["x-audity-control-token"];
  const token = Array.isArray(header) ? header[0] : header;
  if (!token) {
    await reply.code(401).send({ code: "CONTROL_AUTH_REQUIRED", message: "Control authentication required" });
    return;
  }
  const result = await pool.query<{ id: string }>(
    `select id from demo_control_sessions
     where token_hash = $1 and revoked_at is null and expires_at > now()`,
    [sha256(token)]
  );
  if (!result.rows[0]) {
    await reply.code(401).send({ code: "CONTROL_SESSION_INVALID", message: "Control session is invalid or expired" });
    return;
  }
  request.demoControlSessionId = result.rows[0].id;
  await pool.query("update demo_control_sessions set last_seen_at = now() where id = $1", [result.rows[0].id]);
}

export async function revokeControlSession(request: FastifyRequest) {
  if (!request.demoControlSessionId) return;
  await pool.query("update demo_control_sessions set revoked_at = now() where id = $1", [request.demoControlSessionId]);
  await appendControlAuditEvent(request, "control.logout");
}

export async function demoOverview() {
  const settings = await getDemoSettings();
  const [events, runs, audit, summary] = await Promise.all([
    pool.query("select * from demo_login_events order by created_at desc limit 50"),
    pool.query("select * from demo_reset_runs order by started_at desc limit 20"),
    pool.query("select * from demo_control_audit_events order by created_at desc limit 30"),
    pool.query(
      `select
         count(*)::int as total_logins,
         count(*) filter (where created_at > now() - interval '24 hours')::int as logins_24h,
         count(distinct ip_hash)::int as distinct_ip_hashes,
         count(*) filter (where login_method like '%failed%')::int as failed_logins
       from demo_login_events`
    )
  ]);
  return {
    settings,
    control: controlPlaneStatus(),
    telemetrySummary: summary.rows[0],
    recentLoginEvents: events.rows,
    resetRuns: runs.rows,
    controlAuditEvents: audit.rows
  };
}

async function seedDemoContent(demoUserId: string) {
  const customerId = randomUUID();
  const assessmentId = randomUUID();
  await pool.query(
    `insert into customers (id, name, created_by_user_id, industry, regulatory_context, business_criticality)
     values ($1, 'Demo Customer', $2, 'Technology', 'Public demo workspace', 'High')`,
    [customerId, demoUserId]
  );
  await pool.query(
    `insert into assessments (id, customer_id, type, audience, framework, language, status, scope)
     values ($1, $2, 'Demo Security Maturity Assessment', 'Demo users', 'NIST CSF', 'en', 'draft', $3::jsonb)`,
    [assessmentId, customerId, JSON.stringify({ demo: true, resetSeed: true })]
  );
}

export async function performDemoReset(triggerSource: "manual" | "scheduler", logger?: FastifyBaseLogger) {
  const settings = await getDemoSettings();
  const runId = randomUUID();
  await pool.query(
    "insert into demo_reset_runs (id, status, trigger_source, message) values ($1, 'running', $2, $3)",
    [runId, triggerSource, "Reset started"]
  );
  if (!settings.demoModeEnabled) {
    await pool.query("update demo_reset_runs set status = 'skipped', message = 'Demo mode is disabled', finished_at = now() where id = $1", [runId]);
    return { status: "skipped", message: "Demo mode is disabled" };
  }
  if (!settings.resetDataDeletionEnabled || !loadConfig().demoResetAllowDataDeletion) {
    const nextResetAt = new Date(Date.now() + settings.resetIntervalMinutes * 60 * 1000).toISOString();
    await pool.query(
      `update demo_control_settings
       set next_reset_at = $2, updated_at = now()
       where id = $1`,
      [settingsId, nextResetAt]
    );
    await pool.query(
      `update demo_reset_runs
       set status = 'skipped',
           message = 'Data deletion safety flag is disabled. Set AUDITY_DEMO_RESET_DANGEROUSLY_ALLOW_DATA_DELETION=true for the isolated demo stack.',
           finished_at = now()
       where id = $1`,
      [runId]
    );
    return { status: "skipped", message: "Data deletion safety flag is disabled" };
  }

  const client = await pool.connect();
  const counts: Record<string, number> = {};
  try {
    await client.query("begin");
    const demoUser = await client.query<{ id: string }>("select id from users where lower(email) = lower($1)", [settings.demoLoginEmail]);
    const demoUserId = demoUser.rows[0]?.id;
    if (demoUserId) {
      const del = async (label: string, sql: string, params: unknown[]) => {
        const result = await client.query(sql, params);
        counts[label] = result.rowCount ?? 0;
      };
      await del("sessions", "delete from sessions where user_id = $1", [demoUserId]);
      await del("notifications", "delete from notifications where recipient_user_id = $1 or created_by_user_id = $1", [demoUserId]);
      await del("customerShares", "delete from customer_shares where shared_with_user_id = $1 or shared_by_user_id = $1", [demoUserId]);
      await del("savedViews", "delete from saved_views where owner_user_id = $1", [demoUserId]);
      await del("publicApiTokens", "delete from public_api_tokens where created_by = $1", [demoUserId]);
      await del("webhooks", "delete from webhook_subscriptions where created_by = $1", [demoUserId]);
      await del("connectorRuns", "delete from connector_runs where created_by = $1", [demoUserId]);
      await del("workbenchRecords", "delete from workbench_records where created_by = $1 or updated_by = $1", [demoUserId]);
      await del("recurringAssessments", "delete from recurring_assessments where created_by = $1", [demoUserId]);
      await del("legalHolds", "delete from legal_holds where created_by = $1", [demoUserId]);
      await del("retentionPolicies", "delete from retention_policies where created_by = $1", [demoUserId]);
      await del("statusWorkflows", "delete from custom_status_workflows where created_by = $1", [demoUserId]);
      await del("customFields", "delete from custom_fields where created_by = $1", [demoUserId]);
      await del("approvalGates", "delete from approval_gates where created_by = $1", [demoUserId]);
      await del(
        "assessmentTemplates",
        `delete from assessment_templates
         where created_by = $1
           and id::text not in ('10000000-0000-4000-8000-000000000021','10000000-0000-4000-8000-000000000022')`,
        [demoUserId]
      );
      await del("reviewComments", "delete from review_comments where user_id = $1", [demoUserId]);
      await del("reports", "delete from reports where created_by = $1", [demoUserId]);
      await del("evidenceItems", "delete from evidence_items where uploaded_by = $1", [demoUserId]);
      await del("customers", "delete from customers where created_by_user_id = $1", [demoUserId]);
      await client.query("update connectors set enabled = false, config = '{}'::jsonb, secrets = '{}'::jsonb, status = 'not_configured', last_message = 'Reset by demo mode', updated_at = now()");
    }
    await client.query(
      `update demo_control_settings
       set last_reset_at = now(),
           next_reset_at = now() + ($2 || ' minutes')::interval,
           updated_at = now()
       where id = $1`,
      [settingsId, settings.resetIntervalMinutes]
    );
    await client.query(
      "update demo_reset_runs set status = 'completed', message = 'Demo reset completed', deleted_counts = $2::jsonb, finished_at = now() where id = $1",
      [runId, JSON.stringify(counts)]
    );
    await client.query("commit");
    const user = await ensurePublicDemoUser();
    if (user) await seedDemoContent(user.id);
    return { status: "completed", deletedCounts: counts };
  } catch (error) {
    await client.query("rollback");
    logger?.error(error, "Demo reset failed");
    await pool.query(
      "update demo_reset_runs set status = 'failed', message = $2, finished_at = now() where id = $1",
      [runId, error instanceof Error ? error.message : "Demo reset failed"]
    );
    throw error;
  } finally {
    client.release();
  }
}

export function startDemoResetWorker(logger: FastifyBaseLogger) {
  if (!loadConfig().demoModeEnabled) return;
  const tick = async () => {
    try {
      const settings = await getDemoSettings();
      if (!settings.demoModeEnabled || !settings.resetEnabled || !settings.nextResetAt) return;
      if (new Date(settings.nextResetAt).getTime() <= Date.now()) {
        await performDemoReset("scheduler", logger);
      }
    } catch (error) {
      logger.error(error, "Demo reset worker tick failed");
    }
  };
  const timer = setInterval(() => void tick(), 60_000);
  timer.unref();
  void tick();
}
