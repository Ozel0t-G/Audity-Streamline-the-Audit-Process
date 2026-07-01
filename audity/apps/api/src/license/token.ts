import { verifyLicenseSignature } from "./keys.js";
import type { LicenseClaims } from "./types.js";

// Token-Format:  base64url(payload-json) "." base64url(ed25519-signature)
// Die Signatur deckt exakt die payload-Bytes ab.

function b64urlDecode(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/**
 * Parst + verifiziert ein Lizenz-Token. Gibt die Claims zurück oder null
 * (ungültiges Format / Signaturfehler / kaputtes JSON).
 */
export function parseAndVerifyToken(token: string): LicenseClaims | null {
  const parts = token.trim().split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const payloadBytes = b64urlDecode(parts[0]);
  const signature = b64urlDecode(parts[1]);
  if (!verifyLicenseSignature(payloadBytes, signature)) return null;
  try {
    const claims = JSON.parse(payloadBytes.toString("utf8")) as LicenseClaims;
    if (!claims || typeof claims !== "object" || typeof claims.tier !== "string") return null;
    return claims;
  } catch {
    return null;
  }
}
