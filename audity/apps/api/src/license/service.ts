import { readFile } from "node:fs/promises";
import { pool } from "../db/client.js";
import { loadConfig } from "../config.js";
import { fingerprintFromKey } from "../auth/recoveryPhrase.js";
import { appendAuditEvent } from "../audit/service.js";
import { parseAndVerifyToken } from "./token.js";
import { licensePublicKeyConfigured } from "./keys.js";
import type { LicenseClaims, LicenseState } from "./types.js";

const TOKEN_SETTING = "license_token";
const LAST_VALIDATED_SETTING = "license_last_validated_at";
// Toleranz für Uhr-Rücksprung, bevor wir Manipulation annehmen.
const CLOCK_TOLERANCE_MS = 5 * 60 * 1000;
const RECHECK_INTERVAL_MS = 60 * 60 * 1000; // stündlich re-verifizieren

const FREE_STATE: LicenseState = {
  valid: false,
  tier: "free",
  demoMode: false,
  features: [],
  limits: {},
  customer: null,
  licenseId: null,
  expiresAt: null,
  inGrace: false,
  watermark: false,
  reason: "no_license"
};

let cached: LicenseState = { ...FREE_STATE };

function graceMs(): number {
  // Guard a malformed AUDITY_LICENSE_GRACE_DAYS: Number("30days") → NaN, and a NaN
  // grace makes the expiry check `now > exp + NaN` always false — silently disabling
  // expiry (an expired license would never expire). Fail safe to the 30-day default.
  const days = loadConfig().licenseGraceDays;
  return (Number.isFinite(days) && days >= 0 ? days : 30) * 24 * 60 * 60 * 1000;
}

async function getSetting(key: string): Promise<string | null> {
  const r = await pool.query<{ value: unknown }>("select value from settings where key = $1", [key]);
  const v = r.rows[0]?.value;
  if (v == null) return null;
  return typeof v === "string" ? v : String(v);
}

async function setSetting(key: string, value: string | null): Promise<void> {
  if (value === null) {
    await pool.query("delete from settings where key = $1", [key]);
    return;
  }
  await pool.query(
    `insert into settings (key, value) values ($1, to_jsonb($2::text))
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, value]
  );
}

async function loadTokenString(): Promise<string | null> {
  const fromDb = await getSetting(TOKEN_SETTING);
  if (fromDb) return fromDb;
  const fromEnv = process.env.AUDITY_LICENSE?.trim();
  if (fromEnv) return fromEnv;
  const file = process.env.AUDITY_LICENSE_FILE?.trim();
  if (file) {
    try {
      const content = (await readFile(file, "utf8")).trim();
      if (content) return content;
    } catch {
      /* keine Datei → weiter */
    }
  }
  return null;
}

function computeState(claims: LicenseClaims, fingerprint: string, effectiveNow: number): LicenseState {
  const base: LicenseState = {
    valid: true,
    tier: "free",
    demoMode: false,
    features: Array.isArray(claims.features) ? claims.features : [],
    limits: claims.limits ?? {},
    customer: claims.customer ?? null,
    licenseId: claims.licenseId ?? null,
    expiresAt: claims.expiresAt ?? null,
    inGrace: false,
    watermark: false
  };

  if (claims.notBefore && effectiveNow < Date.parse(claims.notBefore)) {
    return { ...FREE_STATE, reason: "not_yet_valid" };
  }
  if (claims.instanceBinding && claims.instanceBinding !== fingerprint) {
    return { ...FREE_STATE, reason: "instance_mismatch" };
  }
  if (claims.expiresAt) {
    const exp = Date.parse(claims.expiresAt);
    if (Number.isFinite(exp)) {
      if (effectiveNow > exp + graceMs()) {
        return { ...FREE_STATE, reason: "expired", customer: claims.customer ?? null, licenseId: claims.licenseId ?? null, expiresAt: claims.expiresAt };
      }
      base.inGrace = effectiveNow > exp;
    }
  }

  if (claims.tier === "demo") {
    // Demo: alles an (enterprise-Baseline) + Watermark; kein Ablauf nötig.
    base.tier = "enterprise";
    base.demoMode = true;
    base.watermark = claims.demo?.watermark ?? true;
    return base;
  }

  base.tier = claims.tier === "pro" || claims.tier === "enterprise" ? claims.tier : "free";
  return base;
}

async function audit(action: string, payload: Record<string, unknown>): Promise<void> {
  await appendAuditEvent({
    actor: null,
    action,
    entity: "license",
    entityId: cached.licenseId ?? "license",
    payload
  }).catch(() => undefined);
}

async function refresh(): Promise<LicenseState> {
  const fingerprint = fingerprintFromKey(loadConfig().encryptionKey);
  const now = Date.now();
  const storedRaw = await getSetting(LAST_VALIDATED_SETTING);
  const storedMs = storedRaw ? Number(storedRaw) : 0;
  const effectiveNow = Math.max(now, Number.isFinite(storedMs) ? storedMs : 0);

  if (Number.isFinite(storedMs) && storedMs - now > CLOCK_TOLERANCE_MS) {
    await audit("license.clock_rollback_detected", { storedMs, now }).catch(() => undefined);
  }

  const tokenStr = await loadTokenString();
  let next: LicenseState;
  if (!tokenStr) {
    next = { ...FREE_STATE };
  } else {
    const claims = parseAndVerifyToken(tokenStr);
    next = claims
      ? computeState(claims, fingerprint, effectiveNow)
      : { ...FREE_STATE, reason: licensePublicKeyConfigured() ? "invalid_signature" : "no_public_key" };
  }

  // Vorwärts-only: verhindert, dass Zurückdrehen der Uhr den Ablauf umgeht.
  if (now > storedMs) {
    await setSetting(LAST_VALIDATED_SETTING, String(now)).catch(() => undefined);
  }

  const changed =
    next.tier !== cached.tier || next.demoMode !== cached.demoMode || next.valid !== cached.valid;
  cached = next;
  if (changed) {
    await audit("license.state_changed", {
      tier: next.tier,
      valid: next.valid,
      demoMode: next.demoMode,
      inGrace: next.inGrace,
      reason: next.reason ?? null
    }).catch(() => undefined);
  }
  return next;
}

export const licenseService = {
  /** Beim Boot: ersten Zustand laden + stündliche Re-Verifizierung starten. */
  async init(): Promise<void> {
    await refresh().catch(() => undefined);
    const timer = setInterval(() => void refresh().catch(() => undefined), RECHECK_INTERVAL_MS);
    timer.unref();
  },

  /** Aktueller (gecachter) Zustand — synchron, für preHandler/Routes. */
  getState(): LicenseState {
    return { ...cached, features: [...cached.features], limits: { ...cached.limits } };
  },

  async reload(): Promise<LicenseState> {
    return refresh();
  },

  /** Token aktivieren (Admin-UI): verifizieren → bei gültig persistieren → anwenden. */
  async activate(token: string, actorUserId: string): Promise<LicenseState> {
    const claims = parseAndVerifyToken(token);
    if (!claims) {
      throw Object.assign(new Error("License token is invalid or the signature is wrong."), { statusCode: 400 });
    }
    const fingerprint = fingerprintFromKey(loadConfig().encryptionKey);
    const probe = computeState(claims, fingerprint, Date.now());
    if (!probe.valid) {
      throw Object.assign(new Error(`License not applicable: ${probe.reason}`), { statusCode: 400 });
    }
    await setSetting(TOKEN_SETTING, token.trim());
    const state = await refresh();
    await appendAuditEvent({
      actor: actorUserId,
      action: "license.activated",
      entity: "license",
      entityId: claims.licenseId ?? "license",
      payload: { tier: claims.tier, customer: claims.customer, expiresAt: claims.expiresAt ?? null }
    }).catch(() => undefined);
    return state;
  },

  /** Gespeichertes Token entfernen → zurück auf Free (bzw. Env/Datei-Fallback). */
  async deactivate(actorUserId: string): Promise<LicenseState> {
    await setSetting(TOKEN_SETTING, null);
    const state = await refresh();
    await appendAuditEvent({
      actor: actorUserId,
      action: "license.deactivated",
      entity: "license",
      entityId: "license",
      payload: {}
    }).catch(() => undefined);
    return state;
  }
};
