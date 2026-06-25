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

const streamTicketTtlSeconds = 60;

export type StreamTicketPayload = {
  sub: string;
  purpose: "notif_stream";
};

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, loadConfig().appSecret, {
    algorithm: SIGNING_ALGORITHM,
    expiresIn: accessTokenTtlSeconds,
    issuer: "audity"
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, loadConfig().appSecret, {
    algorithms: [SIGNING_ALGORITHM],
    issuer: "audity"
  }) as AccessTokenPayload & { purpose?: string };
  // Purpose-scoped tokens (MFA challenge, notification stream ticket) share the
  // same secret/issuer but must never be accepted as full access tokens.
  if (payload.purpose) {
    throw new Error("Token is not a valid access token");
  }
  return payload;
}

export function signStreamTicketToken(userId: string): string {
  return jwt.sign({ sub: userId, purpose: "notif_stream" }, loadConfig().appSecret, {
    algorithm: SIGNING_ALGORITHM,
    expiresIn: streamTicketTtlSeconds,
    issuer: "audity"
  });
}

export function verifyStreamTicketToken(token: string): StreamTicketPayload {
  const payload = jwt.verify(token, loadConfig().appSecret, {
    algorithms: [SIGNING_ALGORITHM],
    issuer: "audity"
  }) as StreamTicketPayload;
  if (payload.purpose !== "notif_stream") {
    throw new Error("Invalid notification stream ticket");
  }
  return payload;
}

export const streamTicketExpiresInSeconds = streamTicketTtlSeconds;

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
