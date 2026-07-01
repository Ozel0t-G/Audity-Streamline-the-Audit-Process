# Audity License Generator

Eigenständige, **vendor-interne** Web-Anwendung zum Erzeugen signierter Audity-
Lizenz-Token (Free / Pro / Enterprise / Demo). Getrennt von der Kunden-App, weil
dieses Tool den **privaten Signaturschlüssel** hält. Keine npm-Abhängigkeiten —
nur Node-Standardbibliothek.

## ⚠ Sicherheit
- Hält den **Ed25519 Private-Key** → **niemals** öffentlich/über ein Netzwerk
  erreichbar machen. Standardmäßig nur an `127.0.0.1` gebunden.
- Die Kunden-App bekommt ausschließlich den **Public-Key**
  (`AUDITY_LICENSE_PUBLIC_KEY` in deren `.env`).
- Optionaler Passwortschutz über `LICENSE_GEN_TOKEN`.

## Starten (lokal)
```bash
cd license-generator
docker compose up -d --build
# → http://127.0.0.1:4000
```
Der Schlüssel wird read-only aus `../Keys` gemountet
(`license_signing.pem` / `license_signing.pub.pem`). Existiert noch kein Schlüssel,
einmalig im Hauptprojekt erzeugen (oder den Mount kurz auf `rw` stellen und im UI
„Schlüsselpaar erzeugen" klicken).

## Benutzung
1. Formular ausfüllen: Tier, Kunde, Ablaufdatum (leer = nie), optional
   Instanz-Bindung, Features, Limits.
2. **Token erzeugen** → das Token kopieren.
3. In der Kunden-App: **Admin → Lizenz** → Token einfügen → aktivieren.

Den angezeigten **Public-Key** trägst du in der Kunden-App als
`AUDITY_LICENSE_PUBLIC_KEY` ein (einmalig pro Schlüssel).

## Endpunkte
- `GET /` — Formular
- `POST /sign` — signiert ein Token
- `GET /pubkey` — Public-Key (base64) für die Kunden-`.env`
- `GET /healthz` — Health + ob ein Key vorhanden ist
- `POST /keygen` — erzeugt ein Schlüsselpaar, falls keins existiert (Mount muss rw sein)

## Verhältnis zu den anderen Tools
Gleiche Signaturlogik wie `scripts/sign-license.mjs` (CLI) und
`apps/api/src/scripts/signLicense.ts` — nur eben als bequeme, dockerisierte
Web-Oberfläche.
