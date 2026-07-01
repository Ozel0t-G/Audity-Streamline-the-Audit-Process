#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────────────
// Audity Lizenz-Schlüssel-Generator (HERSTELLER-Tool, offline).
//
// Erzeugt ein signiertes Lizenz-Token mit dem PRIVATE Ed25519-Key. Läuft direkt
// auf dem Host (kein Build nötig). Der Private-Key bleibt beim Hersteller und
// darf NIE auf einen Kunden-Server / nach GitHub.
//
// Aufruf (aus dem Verzeichnis audity/):
//   node scripts/sign-license.mjs --tier pro --customer "Acme GmbH" --expires 2027-06-29
//   node scripts/sign-license.mjs --tier demo --customer "Audity Demo"
//   node scripts/sign-license.mjs --tier enterprise --customer "Big Corp" \
//        --limit customers=unlimited --feature public_api --expires 2027-06-29
//
// Das ausgegebene Token fügt der Kunde in Admin → Lizenz ein (aktivieren).
// Schlüssel-Pfad überschreibbar via AUDITY_LICENSE_PRIVATE_KEY_FILE.
// ──────────────────────────────────────────────────────────────────────────
import crypto, { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const defaultKey = join(here, "..", "Keys", "license_signing.pem");

function arg(name) {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const idx = process.argv.indexOf(`--${name}`);
  const next = process.argv[idx + 1];
  if (idx >= 0 && next && !next.startsWith("--")) return next;
  return undefined;
}
function multiArg(name) {
  const out = [];
  process.argv.forEach((a, i) => {
    if (a === `--${name}` && process.argv[i + 1]) out.push(process.argv[i + 1]);
    else if (a.startsWith(`--${name}=`)) out.push(a.slice(name.length + 3));
  });
  return out;
}
const b64url = (b) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const keyFile = process.env.AUDITY_LICENSE_PRIVATE_KEY_FILE ?? defaultKey;
const tier = arg("tier") ?? "pro";
const customer = arg("customer") ?? "Unnamed";
const bind = arg("bind");
const expires = arg("expires");
const out = arg("out");

if (!["free", "pro", "enterprise", "demo"].includes(tier)) {
  console.error(`Ungültiger --tier "${tier}". Erlaubt: free | pro | enterprise | demo`);
  process.exit(1);
}

const limits = {};
for (const entry of multiArg("limit")) {
  const [k, v] = entry.split("=");
  if (k) limits[k] = v === "" || v === "unlimited" ? null : Number(v);
}

const now = new Date().toISOString();
const claims = {
  v: 1,
  licenseId: randomUUID(),
  customer,
  tier,
  features: multiArg("feature"),
  limits,
  issuedAt: now,
  notBefore: now,
  expiresAt: tier === "demo" ? null : expires ?? null,
  instanceBinding: bind && bind !== "none" ? bind : null,
  ...(tier === "demo" ? { demo: { seedData: true, watermark: true } } : {})
};

let privateKey;
try {
  privateKey = crypto.createPrivateKey({ key: readFileSync(keyFile, "utf8"), format: "pem", type: "pkcs8" });
} catch (error) {
  console.error(`Konnte Private-Key nicht laden (${keyFile}): ${error.message}`);
  console.error("Tipp: aus dem audity/-Verzeichnis ausführen, oder AUDITY_LICENSE_PRIVATE_KEY_FILE setzen.");
  process.exit(1);
}

const payload = Buffer.from(JSON.stringify(claims), "utf8");
const signature = crypto.sign(null, payload, privateKey);
const token = `${b64url(payload)}.${b64url(signature)}`;

console.error(`\nLizenz erzeugt — tier=${tier}  customer="${customer}"  expires=${claims.expiresAt ?? "nie"}\n`);
if (out) {
  writeFileSync(out, token);
  console.error(`Token geschrieben nach: ${out}\n`);
}
console.log(token);
