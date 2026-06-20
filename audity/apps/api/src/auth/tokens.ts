import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { loadConfig } from "../config.js";

const accessTokenTtlSeconds = 15 * 60;
const refreshTokenTtlDays = 30;
const SIGNING_ALGORITHM = "HS256" as const;

export type AccessTokenPayload = {
  sub: string;
  sid: string;
};

export type MfaChallengePayload = {
  sub: string;
  purpose: "mfa_challenge";
};

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, loadConfig().appSecret, {
    algorithm: SIGNING_ALGORITHM,
    expiresIn: accessTokenTtlSeconds,
    issuer: "audity"
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, loadConfig().appSecret, {
    algorithms: [SIGNING_ALGORITHM],
    issuer: "audity"
  }) as AccessTokenPayload;
}

export function signMfaChallengeToken(userId: string): string {
  return jwt.sign({ sub: userId, purpose: "mfa_challenge" }, loadConfig().appSecret, {
    algorithm: SIGNING_ALGORITHM,
    expiresIn: 5 * 60,
    issuer: "audity"
  });
}

export function verifyMfaChallengeToken(token: string): MfaChallengePayload {
  const payload = jwt.verify(token, loadConfig().appSecret, {
    algorithms: [SIGNING_ALGORITHM],
    issuer: "audity"
  }) as MfaChallengePayload;
  if (payload.purpose !== "mfa_challenge") {
    throw new Error("Invalid MFA challenge token");
  }
  return payload;
}

export function createRefreshToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function refreshExpiry(): Date {
  const date = new Date();
  date.setDate(date.getDate() + refreshTokenTtlDays);
  return date;
}
