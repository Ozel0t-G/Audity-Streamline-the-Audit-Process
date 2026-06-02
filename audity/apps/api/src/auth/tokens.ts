import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { loadConfig } from "../config.js";

const accessTokenTtlSeconds = 15 * 60;
const refreshTokenTtlDays = 30;

export type AccessTokenPayload = {
  sub: string;
  sid: string;
  email: string;
  role: string;
  permissions: string[];
};

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, loadConfig().appSecret, {
    expiresIn: accessTokenTtlSeconds,
    issuer: "audity"
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, loadConfig().appSecret, {
    issuer: "audity"
  }) as AccessTokenPayload;
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
