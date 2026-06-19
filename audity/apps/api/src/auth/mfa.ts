import { authenticator } from "otplib";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import QRCode from "qrcode";
import { pool } from "../db/client.js";
import { decryptText, encryptText, randomToken } from "../utils/crypto.js";

export type MfaSetup = {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
};

export async function createMfaSetup(email: string): Promise<MfaSetup> {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(email, "Audity", secret);
  return {
    secret,
    otpauthUrl,
    qrCodeDataUrl: await QRCode.toDataURL(otpauthUrl)
  };
}

export async function storePendingMfaSecret(
  userId: string,
  secret: string
): Promise<void> {
  await pool.query(
    `insert into mfa_settings (id, user_id, enabled, secret_encrypted)
     values ($1, $2, false, $3)
     on conflict (user_id) do update
       set enabled = false,
           secret_encrypted = excluded.secret_encrypted,
           updated_at = now()`,
    [randomUUID(), userId, encryptText(secret)]
  );
}

export async function getMfaSecret(userId: string): Promise<string | null> {
  const result = await pool.query<{ secret_encrypted: string | null }>(
    "select secret_encrypted from mfa_settings where user_id = $1",
    [userId]
  );
  const encrypted = result.rows[0]?.secret_encrypted;
  return encrypted ? decryptText(encrypted) : null;
}

export async function isMfaEnabled(userId: string): Promise<boolean> {
  const result = await pool.query<{ enabled: boolean }>(
    "select enabled from mfa_settings where user_id = $1",
    [userId]
  );
  return result.rows[0]?.enabled === true;
}

export function verifyTotp(secret: string, code: string): boolean {
  return authenticator.check(code, secret);
}

export async function enableMfa(userId: string): Promise<string[]> {
  const recoveryCodes = Array.from({ length: 10 }, () => randomToken(9));
  const hashedCodes = await Promise.all(
    recoveryCodes.map((code) => argon2.hash(code, { type: argon2.argon2id }))
  );
  await pool.query(
    `update mfa_settings
     set enabled = true,
         recovery_codes_hash = $2,
         verified_at = now(),
         updated_at = now()
     where user_id = $1`,
    [userId, JSON.stringify(hashedCodes)]
  );
  return recoveryCodes;
}

export async function disableMfa(userId: string): Promise<void> {
  await pool.query(
    `update mfa_settings
     set enabled = false,
         recovery_codes_hash = '[]'::jsonb,
         verified_at = null,
         updated_at = now()
     where user_id = $1`,
    [userId]
  );
}

export async function regenerateRecoveryCodes(userId: string): Promise<string[]> {
  const recoveryCodes = Array.from({ length: 10 }, () => randomToken(9));
  const hashedCodes = await Promise.all(
    recoveryCodes.map((code) => argon2.hash(code, { type: argon2.argon2id }))
  );
  const result = await pool.query(
    `update mfa_settings
     set recovery_codes_hash = $2,
         updated_at = now()
     where user_id = $1 and enabled = true`,
    [userId, JSON.stringify(hashedCodes)]
  );
  // If the update affected no rows, MFA was disabled between the route check
  // and this update. Refuse to return plaintext codes that are not stored.
  if (!result.rowCount) {
    throw Object.assign(new Error("MFA is not enabled"), { statusCode: 409, code: "MFA_NOT_ENABLED" });
  }
  return recoveryCodes;
}

export async function getRecoveryCodeStatus(userId: string): Promise<{ remaining: number; total: number }> {
  const result = await pool.query<{ recovery_codes_hash: string | string[] | null }>(
    "select recovery_codes_hash from mfa_settings where user_id = $1 and enabled = true",
    [userId]
  );
  const raw = result.rows[0]?.recovery_codes_hash;
  const codes = Array.isArray(raw) ? raw : typeof raw === "string" ? (JSON.parse(raw) as string[]) : [];
  return { remaining: codes.length, total: 10 };
}
