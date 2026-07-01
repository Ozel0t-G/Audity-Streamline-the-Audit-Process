import crypto from "node:crypto";

// Ed25519 PUBLIC key, eingebettet via Env AUDITY_LICENSE_PUBLIC_KEY (base64 der
// SPKI-PEM). Der PRIVATE key liegt NIE im Repo/Image — nur das signLicense-Tool
// nutzt ihn (siehe lizenz_plan.md §5).

let cached: crypto.KeyObject | null | undefined;

function loadPublicKey(): crypto.KeyObject | null {
  if (cached !== undefined) return cached;
  const b64 = process.env.AUDITY_LICENSE_PUBLIC_KEY?.trim();
  if (!b64) {
    cached = null;
    return null;
  }
  try {
    const pem = Buffer.from(b64, "base64").toString("utf8");
    cached = crypto.createPublicKey({ key: pem, format: "pem", type: "spki" });
  } catch {
    cached = null;
  }
  return cached;
}

/** Ist ein gültiger Public-Key konfiguriert? (sonst: keine Lizenz verifizierbar → Free) */
export function licensePublicKeyConfigured(): boolean {
  return loadPublicKey() !== null;
}

/** Verifiziert eine Ed25519-Signatur über die exakten payload-Bytes. */
export function verifyLicenseSignature(payload: Buffer, signature: Buffer): boolean {
  const key = loadPublicKey();
  if (!key) return false;
  try {
    return crypto.verify(null, payload, key, signature);
  } catch {
    return false;
  }
}

// Nur für Tests/Reset (z. B. nach Env-Wechsel im selben Prozess).
export function resetLicenseKeyCache(): void {
  cached = undefined;
}
