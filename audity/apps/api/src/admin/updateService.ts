import { AUDITY_VERSION } from "@audity/shared";
import { appendActivityEvent } from "../activity/service.js";
import { pool } from "../db/client.js";
import { createNotification } from "../notifications/service.js";

export type UpdateStatus = {
  currentVersion: string;
  configuredImageTag: string;
  imageRegistry: string;
  repository: string;
  updateBranch: string;
  updateChannel: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  checkedAt: string | null;
  checkError: string | null;
  updaterConfigured: boolean;
};

export type UpdaterJob = {
  id: string;
  status: "idle" | "running" | "succeeded" | "failed";
  requestedVersion: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  log: string[];
};

const updateCacheKey = "update_status_cache";
const updateCacheMaxAgeMs = 6 * 60 * 60 * 1000;

function imageRegistry() {
  return process.env.AUDITY_IMAGE_REGISTRY ?? "ghcr.io/ozel0t-g";
}

function configuredImageTag() {
  return process.env.AUDITY_VERSION ?? "latest";
}

function currentVersion() {
  const configured = process.env.AUDITY_VERSION;
  return parseSemver(configured) ? configured! : AUDITY_VERSION;
}

function repository() {
  return process.env.AUDITY_UPDATE_REPOSITORY ?? "Ozel0t-G/Audity-Streamline-the-Audit-Process";
}

function updateBranch() {
  return process.env.AUDITY_UPDATE_BRANCH ?? "production";
}

function updateChannel() {
  return process.env.AUDITY_UPDATE_CHANNEL ?? "production";
}

function manifestPath() {
  return process.env.AUDITY_UPDATE_MANIFEST_PATH ?? "audity/update-channel.json";
}

function checkUrl() {
  return process.env.AUDITY_UPDATE_CHECK_URL || `https://raw.githubusercontent.com/${repository()}/${updateBranch()}/${manifestPath()}`;
}

function cleanVersion(value: string | null | undefined) {
  return (value ?? "").trim().replace(/^v/i, "");
}

function parseSemver(value: string | null | undefined) {
  const match = cleanVersion(value).match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])] as const;
}

function compareVersions(left: string, right: string) {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) return cleanVersion(left).localeCompare(cleanVersion(right));
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function newestVersion(values: string[]) {
  const versions = values.filter((value) => parseSemver(value));
  if (!versions.length) return null;
  return versions.sort((a, b) => compareVersions(b, a))[0];
}

async function cachedStatus(): Promise<UpdateStatus | null> {
  const result = await pool.query<{ value: UpdateStatus; updated_at: Date }>(
    "select value, updated_at from settings where key = $1",
    [updateCacheKey]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...row.value,
    currentVersion: currentVersion(),
    configuredImageTag: configuredImageTag(),
    imageRegistry: imageRegistry(),
    repository: repository(),
    updateBranch: updateBranch(),
    updateChannel: updateChannel(),
    updaterConfigured: updaterConfigured(),
    checkedAt: row.value.checkedAt ?? row.updated_at.toISOString()
  };
}

async function saveStatus(status: UpdateStatus): Promise<void> {
  await pool.query(
    `insert into settings (key, value, updated_at)
     values ($1, $2::jsonb, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [updateCacheKey, JSON.stringify(status)]
  );
}

async function fetchLatestVersion(): Promise<string | null> {
  const response = await fetch(checkUrl(), {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Audity-Update-Checker"
    }
  });
  if (!response.ok) {
    throw new Error(`Update check failed: ${response.status}`);
  }
  const payload = await response.json() as unknown;
  if (Array.isArray(payload)) {
    throw new Error("Production update manifest expected, but update source returned a list");
  }
  if (payload && typeof payload === "object") {
    const object = payload as Record<string, unknown>;
    const manifestChannel = typeof object.channel === "string" ? object.channel : null;
    const manifestBranch = typeof object.branch === "string" ? object.branch : null;
    if (manifestChannel && manifestChannel !== updateChannel()) {
      throw new Error(`Update manifest channel mismatch: expected ${updateChannel()}, got ${manifestChannel}`);
    }
    if (manifestBranch && manifestBranch !== updateBranch()) {
      throw new Error(`Update manifest branch mismatch: expected ${updateBranch()}, got ${manifestBranch}`);
    }
    if (typeof object.latestVersion === "string") return object.latestVersion;
    if (typeof object.version === "string") return object.version;
    if (typeof object.imageTag === "string") return object.imageTag;
    if (typeof object.tag_name === "string") return object.tag_name;
  }
  return null;
}

export function updaterConfigured() {
  return Boolean(process.env.AUDITY_UPDATER_URL && process.env.AUDITY_UPDATER_TOKEN);
}

export async function checkForUpdates(force = false): Promise<UpdateStatus> {
  const cached = await cachedStatus();
  const checkedAt = cached?.checkedAt ? new Date(cached.checkedAt).getTime() : 0;
  if (!force && cached && Date.now() - checkedAt < updateCacheMaxAgeMs) {
    return cached;
  }

  const base = {
    currentVersion: currentVersion(),
    configuredImageTag: configuredImageTag(),
    imageRegistry: imageRegistry(),
    repository: repository(),
    updateBranch: updateBranch(),
    updateChannel: updateChannel(),
    updaterConfigured: updaterConfigured()
  };

  try {
    const latestVersion = await fetchLatestVersion();
    const status: UpdateStatus = {
      ...base,
      latestVersion,
      updateAvailable: Boolean(latestVersion && compareVersions(latestVersion, currentVersion()) > 0),
      checkedAt: new Date().toISOString(),
      checkError: null
    };
    await saveStatus(status);
    if (status.updateAvailable) {
      await notifyAdminsAboutUpdate(status);
    }
    return status;
  } catch (error) {
    const status: UpdateStatus = {
      ...base,
      latestVersion: cached?.latestVersion ?? null,
      updateAvailable: cached?.updateAvailable ?? false,
      checkedAt: new Date().toISOString(),
      checkError: error instanceof Error ? error.message : "Update check failed"
    };
    await saveStatus(status);
    return status;
  }
}

export async function ensureUpdateNotificationForAdmin(): Promise<void> {
  const status = await checkForUpdates(false);
  if (status.updateAvailable) {
    await notifyAdminsAboutUpdate(status);
  }
}

async function adminRecipients() {
  const result = await pool.query<{ id: string }>(
    `select distinct u.id
     from users u
     join roles r on r.id = u.role_id
     left join role_permissions rp on rp.role_id = r.id
     left join permissions p on p.id = rp.permission_id
     where u.status = 'active'
       and (r.name in ('Instance Admin', 'Tenant Admin') or p.name = 'settings.manage')`
  );
  return result.rows.map((row) => row.id);
}

export async function notifyAdminsAboutUpdate(status: UpdateStatus): Promise<void> {
  if (!status.latestVersion) return;
  const recipients = await adminRecipients();
  for (const recipientUserId of recipients) {
    const existing = await pool.query(
      `select id from notifications
       where recipient_user_id = $1
         and type = 'system_update_available'
         and entity_type = 'system_update'
         and entity_id = $2
       limit 1`,
      [recipientUserId, status.latestVersion]
    );
    if (existing.rows[0]) continue;
    await createNotification({
      recipientUserId,
      type: "system_update_available",
      title: "Audity update available",
      message: `Version ${status.latestVersion} is available. Open System Monitor to review and update.`,
      entityType: "system_update",
      entityId: status.latestVersion
    });
  }
}

async function updaterRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = process.env.AUDITY_UPDATER_URL;
  const token = process.env.AUDITY_UPDATER_TOKEN;
  if (!url || !token) {
    throw new Error("Updater service is not configured");
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers
  });
  const payload = await response.json().catch(() => null) as T & { message?: string };
  if (!response.ok) {
    throw new Error(payload?.message ?? `Updater request failed: ${response.status}`);
  }
  return payload;
}

export async function getUpdaterJob(): Promise<UpdaterJob | null> {
  if (!updaterConfigured()) return null;
  const payload = await updaterRequest<{ job: UpdaterJob }>("/status");
  return payload.job;
}

export async function startUpdate(version: string | undefined, actorUserId: string): Promise<UpdaterJob> {
  const payload = await updaterRequest<{ job: UpdaterJob }>("/run", {
    method: "POST",
    body: JSON.stringify({ version }),
    headers: { "Content-Type": "application/json" }
  });
  await appendActivityEvent({
    userId: actorUserId,
    action: "system.update.started",
    entityType: "system_update",
    entityId: version ?? configuredImageTag(),
    before: null,
    after: { version: version ?? configuredImageTag(), jobId: payload.job.id }
  });
  const recipients = await adminRecipients();
  for (const recipientUserId of recipients) {
    await createNotification({
      recipientUserId,
      type: "system_update_started",
      title: "Audity update started",
      message: `Update ${version ?? configuredImageTag()} was started from System Monitor.`,
      entityType: "system_update",
      entityId: payload.job.id,
      createdByUserId: actorUserId
    });
  }
  return payload.job;
}
