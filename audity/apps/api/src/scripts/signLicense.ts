import crypto, { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

// ──────────────────────────────────────────────────────────────────────────
// HERSTELLER-TOOL (offline). Signiert ein Audity-Lizenz-Token mit dem PRIVATE
// Ed25519-Key. NICHT auf dem Kunden-Server ausführen; der Private-Key bleibt
// beim Hersteller. Siehe lizenz_plan.md §5/§12.
//
// Beispiele:
//   AUDITY_LICENSE_PRIVATE_KEY_FILE=Keys/license_signing.pem \
//     node dist/scripts/signLicense.js --tier pro --customer "Acme GmbH" \
//       --limit customers=10 --limit seats=25 --feature public_api --expires 2027-06-29
//   node dist/scripts/signLicense.js --tier demo --customer "Audity Demo"   (alles an, kein Ablauf)
// ──────────────────────────────────────────────────────────────────────────

function arg(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const idx = process.argv.indexOf(`--${name}`);
  const next = process.argv[idx + 1];
  if (idx >= 0 && next && !next.startsWith("--")) return next;
  return undefined;
}

function multiArg(name: string): string[] {
  const out: string[] = [];
  process.argv.forEach((a, i) => {
    if (a === `--${name}` && process.argv[i + 1]) out.push(process.argv[i + 1]);
    else if (a.startsWith(`--${name}=`)) out.push(a.slice(name.length + 3));
  });
  return out;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const keyFile = process.env.AUDITY_LICENSE_PRIVATE_KEY_FILE ?? "Keys/license_signing.pem";
const tier = (arg("tier") ?? "pro") as "free" | "pro" | "enterprise" | "demo";
const customer = arg("customer") ?? "Unnamed";
const bind = arg("bind");
const expires = arg("expires");

const limits: Record<string, number | null> = {};
for (const entry of multiArg("limit")) {
  const [k, v] = entry.split("=");
  if (k) limits[k] = v === "" || v === "unlimited" ? null : Number(v);
}

const claims = {
  v: 1,
  licenseId: randomUUID(),
  customer,
  tier,
  features: multiArg("feature"),
  limits,
  issuedAt: new Date().toISOString(),
  notBefore: new Date().toISOString(),
  expiresAt: tier === "demo" ? null : expires ?? null,
  instanceBinding: bind && bind !== "none" ? bind : null,
  ...(tier === "demo" ? { demo: { seedData: true, watermark: true } } : {})
};

const payload = Buffer.from(JSON.stringify(claims), "utf8");
const privateKey = crypto.createPrivateKey({
  key: readFileSync(keyFile, "utf8"),
  format: "pem",
  type: "pkcs8"
});
const signature = crypto.sign(null, payload, privateKey);
const token = `${b64url(payload)}.${b64url(signature)}`;

process.stderr.write(`\nAudity license — tier=${tier} customer="${customer}" expires=${claims.expiresAt ?? "never"}\n\n`);
process.stdout.write(token + "\n");
