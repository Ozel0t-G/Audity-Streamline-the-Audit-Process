import http from "node:http";
import crypto, { randomUUID } from "node:crypto";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// ──────────────────────────────────────────────────────────────────────────
// Audity License Generator — eigenständige VENDOR-Anwendung.
//
// Hält den PRIVATE Ed25519-Key und signiert Lizenz-Token (Free/Pro/Enterprise/
// Demo). Läuft getrennt von der Kunden-App (das Kunden-Image bekommt nur den
// PUBLIC key). NIEMALS öffentlich exponieren — nur lokal/intern (127.0.0.1).
// Keine npm-Abhängigkeiten (nur Node-Standardbibliothek).
// ──────────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 4000);
const KEY_FILE = process.env.LICENSE_PRIVATE_KEY_FILE ?? "/keys/license_signing.pem";
const PUB_FILE = process.env.LICENSE_PUBLIC_KEY_FILE ?? "/keys/license_signing.pub.pem";
// Optionaler Schutz: wenn gesetzt, muss das Formular dieses Passwort mitsenden.
const ACCESS_TOKEN = process.env.LICENSE_GEN_TOKEN ?? "";

const b64url = (b) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function loadPrivateKey() {
  if (!existsSync(KEY_FILE)) return null;
  return crypto.createPrivateKey({ key: readFileSync(KEY_FILE, "utf8"), format: "pem", type: "pkcs8" });
}

function publicKeyB64() {
  const priv = loadPrivateKey();
  if (priv) return Buffer.from(crypto.createPublicKey(priv).export({ type: "spki", format: "pem" })).toString("base64");
  if (existsSync(PUB_FILE)) return Buffer.from(readFileSync(PUB_FILE, "utf8")).toString("base64");
  return null;
}

function generateKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  mkdirSync(dirname(KEY_FILE), { recursive: true });
  writeFileSync(KEY_FILE, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  writeFileSync(PUB_FILE, publicKey.export({ type: "spki", format: "pem" }));
}

function signToken(p) {
  const priv = loadPrivateKey();
  if (!priv) throw new Error(`Kein Private-Key unter ${KEY_FILE}. Erst „Schlüsselpaar erzeugen" klicken.`);
  const now = new Date().toISOString();
  const tier = ["free", "pro", "enterprise", "demo"].includes(p.tier) ? p.tier : "pro";
  const features = (p.features || "").split(",").map((s) => s.trim()).filter(Boolean);
  const limits = {};
  for (const line of (p.limits || "").split(/[\n,]/)) {
    const [k, v] = line.split("=").map((s) => (s == null ? s : s.trim()));
    if (k) limits[k] = v === "" || v == null || v === "unlimited" ? null : Number(v);
  }
  const claims = {
    v: 1,
    licenseId: randomUUID(),
    customer: p.customer || "Unnamed",
    tier,
    features,
    limits,
    issuedAt: now,
    notBefore: now,
    expiresAt: tier === "demo" ? null : p.expires || null,
    instanceBinding: p.bind && p.bind !== "none" ? p.bind : null,
    ...(tier === "demo" ? { demo: { seedData: true, watermark: true } } : {})
  };
  const payload = Buffer.from(JSON.stringify(claims), "utf8");
  const sig = crypto.sign(null, payload, priv);
  return { token: `${b64url(payload)}.${b64url(sig)}`, claims };
}

function layout(body) {
  const hasKey = Boolean(loadPrivateKey());
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Audity License Generator</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;background:#0b0f17;color:#e6edf3;font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  .wrap{max-width:760px;margin:0 auto;padding:32px 20px}
  h1{font-size:20px;margin:0 0 4px}
  .sub{color:#8b97a7;margin:0 0 20px}
  .warn{background:#3a1d1d;border:1px solid #7a2d2d;color:#ffb4b4;padding:10px 12px;border-radius:8px;margin-bottom:20px;font-size:13px}
  .card{background:#121826;border:1px solid #243044;border-radius:10px;padding:20px;margin-bottom:18px}
  label{display:block;font-size:12px;color:#8b97a7;margin:12px 0 4px}
  input,select,textarea{width:100%;box-sizing:border-box;background:#0b0f17;border:1px solid #243044;color:#e6edf3;border-radius:7px;padding:9px 10px;font:inherit}
  textarea{min-height:64px;font-family:ui-monospace,Menlo,monospace;font-size:12px}
  .row{display:flex;gap:12px}.row>div{flex:1}
  button{margin-top:16px;background:#2f6feb;color:#fff;border:0;border-radius:7px;padding:10px 16px;font:inherit;font-weight:600;cursor:pointer}
  button.ghost{background:transparent;border:1px solid #243044;color:#e6edf3}
  .token{word-break:break-all;background:#0b0f17;border:1px solid #243044;border-radius:7px;padding:12px;font-family:ui-monospace,Menlo,monospace;font-size:12px}
  .ok{color:#3fb950;font-weight:600}
  code{background:#0b0f17;border:1px solid #243044;border-radius:4px;padding:1px 5px}
  a{color:#58a6ff}
</style></head><body><div class="wrap">
<h1>Audity License Generator</h1>
<p class="sub">Vendor-internes Tool — signiert Lizenz-Token mit dem privaten Schlüssel.</p>
<div class="warn">⚠ Dieses Tool hält den <b>Private-Key</b>. Nur lokal/intern betreiben — niemals öffentlich erreichbar machen.${hasKey ? "" : " <b>Aktuell ist kein Private-Key vorhanden.</b>"}</div>
${body}
</div></body></html>`;
}

function formPage(msg = "") {
  const pub = publicKeyB64();
  return layout(`
${msg}
<form class="card" method="post" action="/sign">
  <h2 style="margin:0 0 8px;font-size:15px">Lizenz erzeugen</h2>
  ${ACCESS_TOKEN ? `<label>Zugriffs-Passwort</label><input name="access" type="password" required/>` : ""}
  <div class="row">
    <div><label>Tier</label><select name="tier">
      <option value="pro">Pro</option><option value="enterprise">Enterprise</option>
      <option value="demo">Demo (alles an, kein Ablauf)</option><option value="free">Free</option>
    </select></div>
    <div><label>Ablaufdatum (YYYY-MM-DD, leer = nie)</label><input name="expires" placeholder="2027-06-29"/></div>
  </div>
  <label>Kunde / Lizenznehmer</label><input name="customer" placeholder="Acme GmbH" required/>
  <label>Instanz-Bindung (Fingerprint, leer/none = ungebunden)</label><input name="bind" placeholder="none"/>
  <label>Features (kommagetrennt, optionale Add-ons)</label><input name="features" placeholder="public_api"/>
  <label>Limits (eine pro Zeile, z. B. customers=10 oder seats=unlimited)</label><textarea name="limits" placeholder="customers=10&#10;seats=25"></textarea>
  <button type="submit">Token erzeugen</button>
</form>
<div class="card">
  <h2 style="margin:0 0 8px;font-size:15px">Public-Key (für die Kunden-App)</h2>
  <p class="sub" style="margin:0 0 8px">In der <code>.env</code> der Kunden-App als <code>AUDITY_LICENSE_PUBLIC_KEY</code> setzen.</p>
  ${pub ? `<div class="token">${esc(pub)}</div>` : `<p>Kein Schlüssel vorhanden.</p><form method="post" action="/keygen"><button class="ghost">Schlüsselpaar erzeugen</button></form>`}
</div>`);
}

function resultPage(token, claims) {
  return layout(`
<div class="card">
  <p class="ok">✓ Lizenz erzeugt</p>
  <p class="sub">tier=<b>${esc(claims.tier)}</b> · customer=<b>${esc(claims.customer)}</b> · expires=<b>${esc(claims.expiresAt ?? "nie")}</b></p>
  <label>Token (in der Kunden-App: Admin → Lizenz → einfügen)</label>
  <div class="token">${esc(token)}</div>
</div>
<a href="/">← Weitere Lizenz erzeugen</a>`);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on("end", () => resolve(data));
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(formPage());
    }
    if (req.method === "GET" && req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ status: "ok", hasKey: Boolean(loadPrivateKey()) }));
    }
    if (req.method === "GET" && req.url === "/pubkey") {
      res.writeHead(200, { "content-type": "text/plain" });
      return res.end(publicKeyB64() ?? "");
    }
    if (req.method === "POST" && req.url === "/keygen") {
      if (!loadPrivateKey()) generateKeypair();
      res.writeHead(303, { location: "/" });
      return res.end();
    }
    if (req.method === "POST" && req.url === "/sign") {
      const params = Object.fromEntries(new URLSearchParams(await readBody(req)));
      if (ACCESS_TOKEN && params.access !== ACCESS_TOKEN) {
        res.writeHead(403, { "content-type": "text/html; charset=utf-8" });
        return res.end(formPage(`<div class="warn">Falsches Zugriffs-Passwort.</div>`));
      }
      const { token, claims } = signToken(params);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(resultPage(token, claims));
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  } catch (error) {
    res.writeHead(500, { "content-type": "text/html; charset=utf-8" });
    res.end(layout(`<div class="warn">Fehler: ${esc(error.message)}</div><a href="/">← Zurück</a>`));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Audity License Generator on http://0.0.0.0:${PORT}  (key: ${KEY_FILE}, present: ${Boolean(loadPrivateKey())})`);
});
