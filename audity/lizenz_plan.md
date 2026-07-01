# Audity – Lizenz-Plan (Free / Pro / Enterprise / Demo)

> **Status:** ✅ **Struktur umgesetzt & lokal deployed** (2026-06-29). Backend
> (LicenseService, Entitlement, Routes, Migration `011`, Signing-Tool), Frontend
> (Provider, `<FeatureTag>`, `<DemoWatermark>`, Admin-„Lizenz"-Seite, Nav-Eintrag)
> und Demo-Seeder (Kunde A/B/C) sind gebaut, typecheck-sauber, api+web-Container neu
> gebaut. Läuft im **Free-Modus** (kein Token) → keine Verhaltensänderung.
> **Offen (nächster Schritt Hersteller):** die **Feature → Tier-Zuordnung** im
> Feature-Katalog `apps/api/src/license/catalog.ts` (FEATURES/LIMITS) — bis dahin
> ist nichts gesperrt und Demo-Tags zeigen „Free". Siehe §6 / §14.
>
> **Letzte Aktualisierung:** 2026-06-29

---

## 0. Ziel & Geltungsbereich

Audity bekommt ein **lokal verifiziertes Lizenzmodell** mit vier Stufen:
**Free, Pro, Enterprise** und eine spezielle **Demo**-Lizenz für Vertriebsvorführungen.

Anforderungen (vom Hersteller):
- Lizenz wird **lokal/offline** verifiziert (kein Zwangs-Phone-home) – passt zum
  portablen, self-hosted, „läuft-auf-jeder-IP/Domain"-Design von Audity.
- Der Hersteller entscheidet zentral, **welche Funktion free ist und welche eine
  Lizenz braucht**.
- **Demo-Lizenz:** erzeugt **Fake-Kundendaten** (3 Muster-Kunden A/B/C), schaltet
  **alle Features frei**, und markiert jedes Feature mit einem **kleinen farbigen
  Tag**, das den Tier zeigt (Free/Pro/Enterprise) – damit man im Demo sieht, was
  wo hingehört.
- **Lizenz-Aktivierung im Admin-Menü:** Als **letzter Eintrag** im Admin-Menü gibt
  es einen neuen Punkt **„Lizenz"**, über den ein Instance Admin ein Lizenz-Token
  einfügt/aktiviert (paste → verifizieren → persistieren → anwenden).

### Getroffene Entscheidungen (Stand jetzt)

| # | Frage | Entscheidung |
|---|---|---|
| 1 | Demo-Laufzeit | **Keine Zeitbegrenzung** |
| 2 | Demo-Daten-Purge beim Wechsel | **Nicht nötig** (Hersteller betreibt dedizierten Demo-Server) |
| 3 | Demo neben Echtdaten? | **Dedizierter Demo-Server** – Seed-Daten trotzdem `is_demo`-markiert (für Reset) |
| 4 | Tag-Farben | **Free = grün · Pro = blau · Enterprise = lila** |
| 5 | Free | **Keine Lizenz nötig** (kein Token = Free-Tier) |

---

## 1. Die ehrliche Ausgangslage (Threat Model, kein Security-Theater)

Audity läuft **auf dem Server des Kunden**. Der Betreiber hat damit **root, die
Datenbank, die Docker-Images und den lesbaren JS/TS-Code**. Daraus folgt:

> **Für self-hosted Software ist „der User kann es technisch nicht umgehen" nicht
> 100 % erreichbar.** Jeder Check, der auf *seiner* Hardware läuft, ist von einem
> entschlossenen, technischen Betreiber patchbar.

**Real erreichbar** und damit das Ziel dieses Designs:

1. **Unfälschbarkeit** – ohne den privaten Signaturschlüssel kann niemand eine
   gültige Lizenz erzeugen (Ed25519). *(hart, gelöst)*
2. **Umgehen ist teuer und bricht etwas** – v. a. Updates/Support sind
   anbieterseitig gekoppelt (§10). *(stärkster realer Hebel)*
3. **Manipulation ist erkennbar** – Lizenz-Events landen in den bereits
   vorhandenen **unveränderlichen Audit-Logs**.
4. **Rechtliche Abschreckung** – im Token eingebettete Kundenidentität macht
   Cracks rückverfolgbar (EULA).

Der **einzige** wirklich umgehungssichere Weg wäre, den Wert anbieterseitig zu
hosten – das bricht aber Auderys self-hosted/Offline-Datensouveränität und ist
für ein Compliance-Tool kontraproduktiv → **nicht für den Kern empfohlen.**

**Demo-spezifisch:** Da der **Hersteller** den Demo-Server selbst betreibt (nicht
an Kunden verteilt), ist der „Demo = alles an, ohne Ablauf"-Bypass-Vektor
**irrelevant** – es ist die eigene Vertriebs-Box.

---

## 2. Architektur-Überblick

```
        ┌─────────────────────────────────────────────┐
        │  Hersteller (offline)                        │
        │  ───────────────────────────────────────────│
        │  Ed25519 PRIVATE KEY  ──►  signLicense-Tool  │
        │                            │                 │
        └────────────────────────────┼────────────────┘
                                      │ signiertes Token (Datei/.env)
                                      ▼
   ┌───────────────────────────────────────────────────────────┐
   │  Kunden-Server (Docker)                                     │
   │  ─────────────────────────────────────────────────────────│
   │  API + Worker  (Ed25519 PUBLIC KEY eingebettet)             │
   │    └─ LicenseService: laden → verifizieren → cachen         │
   │         └─ EntitlementEngine: istBerechtigt / featureTier   │
   │              ├─ Feature-Katalog (Tiers)                     │
   │              ├─ Durchsetzung (preHandler requireFeature)    │
   │              └─ GET /api/license/state  ──►  Web-Frontend   │
   │  Web (Browser, NICHT vertrauenswürdig → nur Anzeige/UX)     │
   │    ├─ useEntitlement()  (Sperren/Banner)                    │
   │    └─ <FeatureTag/>      (farbige Tier-Tags im Demo)        │
   └───────────────────────────────────────────────────────────┘
```

**Kernprinzipien:**
- Durchsetzung **serverseitig** (API/Worker). Web spiegelt nur den Zustand.
- Lizenz wird beim Boot, periodisch und an privilegierten Mutationen geprüft.
- Verifizierung mit eingebettetem **Public-Key**; Private-Key nie im Repo.
- **Ein einziger Update-Stream für alle Tiers** (eine Codebasis, ein Build/Kanal).
  Neue Features werden an **alle** ausgeliefert, aber per Lizenz/Katalog nur für
  die berechtigten Tiers **sichtbar/aktiviert** („dark ship, light up per Tier").
  → **keine** tier-spezifischen Builds, kein Branch-Wildwuchs.

---

## 3. Lizenz-Tiers

| Tier | Lizenz nötig? | Ablauf | Daten | Funktionsumfang |
|---|---|---|---|---|
| **Free** | Nein (Default ohne Token) | — | echte Daten | reduziert + Limits |
| **Pro** | Ja (signiert) | optional | echte Daten | mittel |
| **Enterprise** | Ja (signiert) | optional | echte Daten | voll + à-la-carte-Addons |
| **Demo** | Ja (signiert) | **keine** | **Fake-Seed-Daten** | **alles an** + Tier-Tags + Watermark |

`tierRank: free(0) < pro(1) < enterprise(2)`. Demo ist ein **Sonderzustand**
(orthogonal zum Rang): `demoMode = true` ⇒ alle Features an.

---

## 4. Das Lizenz-Token (Ed25519)

### 4.1 Format

Kompaktes, signiertes Envelope (JWS-ähnlich, aber schlank):

```
<base64url(payload-json)> "." <base64url(ed25519-signature)>
```

- `payload-json` = die Claims (UTF-8 JSON, kanonisch serialisiert).
- Signatur = Ed25519 über die exakten Payload-Bytes (vor dem base64url).
- Verifizierung: Payload dekodieren → Signatur gegen **Public-Key** prüfen →
  Claims auswerten.

### 4.2 Claims

```jsonc
{
  "v": 1,                         // Schema-Version
  "licenseId": "uuid",            // eindeutige Lizenz-ID (für Audit/Widerruf)
  "customer": "Acme GmbH",        // Lizenznehmer (im Token sichtbar → rückverfolgbar)
  "tier": "free|pro|enterprise|demo",
  "features": ["public_api"],     // optionale à-la-carte-Addons über das Tier hinaus
  "limits": {                     // null/fehlend = unbegrenzt (bzw. Tier-Default)
    "customers": 10,
    "seats": 25
  },
  "issuedAt": "2026-06-29T00:00:00Z",
  "notBefore": "2026-06-29T00:00:00Z",
  "expiresAt": null,              // null = kein Ablauf (z. B. Demo, Punkt 1)
  "instanceBinding": "<encryption-key-fingerprint>|null",
  "demo": { "seedData": true, "watermark": true }   // nur bei tier=demo
}
```

### 4.3 Instanz-Bindung

- Gebunden an `encryption_key_meta.fingerprint` (existiert bereits, stabil pro
  Instanz). Verhindert Mehrfachnutzung einer Lizenz über viele Deployments.
- `instanceBinding: null` ⇒ ungebunden (z. B. für interne/Demo-Lizenzen).
- **Ehrlich:** Wer die *komplette* Instanz klont (Key + Lizenz), umgeht die
  Bindung – sie stoppt casual sharing, nicht Klonen.

### 4.4 Verifizierungs-Ergebnis → `LicenseState`

```ts
type LicenseState = {
  valid: boolean;
  tier: "free" | "pro" | "enterprise";   // demo wird auf "enterprise"-Baseline + demoMode abgebildet
  demoMode: boolean;
  features: string[];                     // à-la-carte
  limits: { customers?: number; seats?: number };
  customer: string | null;
  expiresAt: string | null;
  watermark: boolean;                     // Demo-Watermark anzeigen?
  reason?: string;                        // bei invalid: warum (für Logs/Banner)
};
```

Ungültig/abgelaufen/kein Token ⇒ `{ valid:false, tier:"free", demoMode:false }`
(= Free-Baseline, **keine** Sperrung der App).

---

## 4a. Laufzeit, Zahlung & Erneuerung

**Empfehlung (passt zu offline + Admin-Aktivierung): Jahres-Laufzeit-Lizenz.**

- Token trägt `expiresAt` = Ende der bezahlten Laufzeit (z. B. +12 Monate).
  Demo: `expiresAt = null`. Free: kein Token.
- **Erneuerung = neues signiertes Token.** Kunde zahlt → Hersteller stellt neues
  Token mit neuem `expiresAt` aus → Kunde aktiviert es auf der **„Lizenz"-Admin-
  Seite** (genau der Eintrag aus §11.6). `licenseId`/`instanceBinding` bleiben über
  Erneuerungen stabil.
**Verbindliche Ablauf-Regeln (bestätigt):**

1. **Grace-Period nach Ablauf, bevor degradiert wird** — konfigurierbar
   (`license_grace_days`, **Default 30**, Bereich 14–30). Innerhalb der Grace
   bleibt der **bezahlte Tier voll aktiv**; es erscheint nur ein Hinweis-Banner.
   Schützt zahlende Kunden, deren Verlängerung ein paar Tage hängt.
2. **Bei (Grace-)Ablauf → graceful auf Free.** Premium read-only/ausgeblendet,
   persistentes Banner **„Lizenz abgelaufen – bitte erneuern"**. **Keine Daten
   gehen verloren**, der Voll-**Export bleibt** jederzeit möglich (Audit-Tool;
   auch rechtlich zwingend).
3. **Clock-Rollback-Schutz** (der Ablauf zählt jetzt): bei jeder erfolgreichen
   Verifizierung wird `last_validated_at` (+ monotoner Zähler) persistiert. Ist
   die Systemzeit beim Check **vor** `last_validated_at` (− kleine Toleranz), gilt
   das als **Uhr-Manipulation** → Entitlement wird **nicht** verlängert, Wechsel
   in limitierten/Grace-Modus, Eintrag ins Audit-Log. Verhindert „Systemzeit
   zurückdrehen, um den Ablauf zu umgehen".

### Zahlungs-Anbindung – zwei Modelle

| Modell | Wie | Offline? | Auto-Renew | Mid-Term-Widerruf |
|---|---|---|---|---|
| **A) Offline-Jahreslizenz** *(empfohlen, Default)* | Zahlung → Hersteller signiert Token (neuer `expiresAt`) → Kunde fügt es in Admin-UI ein | **Ja** | nein (jährlich neues Token) | **nein** (offline nicht erzwingbar) |
| **B) Online-Subscription** *(optional, z. B. Enterprise)* | App-Heartbeat zu eurem Lizenz-Server validiert/erneuert/widerruft Abo-Status | nein | ja | ja |

**Ehrliche Einschränkung von A:** Rein offline kann der Hersteller eine Lizenz
**nicht mitten in der Laufzeit widerrufen** (z. B. Chargeback) – das ginge nur mit
Online-Check (B) oder einer abrufbaren Sperrliste (CRL); beides braucht
Konnektivität. Der jährliche Ablauf erzwingt Nichtzahlung aber automatisch.

### Automatisierung (skalierbar, später)
- **Billing-Portal**: Stripe/Paddle → Webhook bei Zahlung → **automatisches
  Signing** (das `signLicense`-Tool als Service) → Token per E-Mail / Kundenportal.
  Start manuell möglich, später automatisieren. Mit Modell B könnte die App das
  neue Token **automatisch ziehen** (kein Copy-Paste).

### Lizenz vs. Wartung/Updates
- Verbreitete Alternative bei self-hosted: **perpetual Nutzungsrecht + jährliche
  Wartung/Updates**. Da Updates ohnehin **anbieterseitig an die Lizenz gekoppelt**
  sind (§10), erzwingt ein abgelaufener Wartungs-Term automatisch „keine Updates
  mehr" – starker, legitimer Renew-Anreiz, ohne die laufende Nutzung zu sperren.
- **Default-Empfehlung:** Jahres-Abo (Nutzung + Updates gebündelt, `expiresAt`-
  basiert) – am einfachsten und passt zum Admin-Aktivierungs-Flow.

---

## 5. Schlüssel-Management (kritisch)

- **Ed25519-Keypair** wird **einmal offline** erzeugt (Node `crypto.generateKeyPairSync('ed25519')`).
- **Public-Key**: eingebettet im API-/Worker-Build via Env
  `AUDITY_LICENSE_PUBLIC_KEY` (oder als Konstante im Build). Unkritisch.
- **Private-Key**: **NIEMALS** ins Repo/Image. Aufbewahrung beim Hersteller
  (Passwortmanager/HSM/CI-Secret). Nur das `signLicense`-Tool nutzt ihn.
- `.gitignore`-Eintrag für jeglichen Private-Key-Pfad (z. B. `*.license-key`,
  `keys/license_ed25519`).
- Schlüsselrotation: neuer Public-Key in neuem Release; alte Lizenzen brauchen
  Neuausstellung (selten, dokumentiert).

---

## 6. Feature-Katalog (die „Speisekarte" – einzige Wahrheit)

Eine zentrale Registry im Server-Build. Treibt **Durchsetzung + Demo-Tags +
Pricing-Seite** aus *einer* Quelle (kein Drift).

```ts
// apps/api/src/license/catalog.ts  (Beispiel-STRUKTUR; Tiers = vom Hersteller später)
export type Tier = "free" | "pro" | "enterprise";

export type FeatureDef = {
  id: string;            // stabiler Key, z. B. "log_archive_remote"
  label: string;         // Anzeigename
  category?: string;     // Gruppierung (UI/Pricing)
  tier: Tier;            // Mindest-Tier  ← DAS trägst du in Schritt 3 ein
};

export type LimitDef = {
  id: string;            // z. B. "customers"
  label: string;
  byTier: Record<Tier, number | null>;   // null = unbegrenzt
};

// Wird mit PLATZHALTER-Tiers ausgeliefert; nach dem Bau pflegt der Hersteller die Werte.
export const FEATURES: FeatureDef[] = [
  // { id: "log_archive_remote", label: "Remote Log-Archiv (SFTP/FTP/S3)", category: "Backup", tier: "pro" },
  // { id: "ai_enrichment",      label: "KI-Enrichment",                   category: "AI",     tier: "pro" },
  // { id: "public_api",         label: "Public API",                      category: "API",    tier: "enterprise" },
  // ... (vom Hersteller zu füllen)
];

export const LIMITS: LimitDef[] = [
  // { id: "customers", label: "Kunden", byTier: { free: 1, pro: 10, enterprise: null } },
  // { id: "seats",     label: "Seats",  byTier: { free: 2, pro: 25, enterprise: null } },
];
```

**Default-Regel:** Features, die *nicht* im Katalog stehen oder `tier:"free"`
haben, sind **free**. Paid-Features brauchen den passenden Tier/Anspruch.

---

## 7. Entitlement-Engine

```ts
// apps/api/src/license/entitlement.ts
const RANK = { free: 0, pro: 1, enterprise: 2 } as const;

function isEntitled(featureId: string, s: LicenseState): boolean {
  if (s.demoMode) return true;                       // Demo = ALLES an
  const def = catalog.byId(featureId);
  if (!def || def.tier === "free") return true;      // free / unbekannt → erlaubt
  return RANK[s.tier] >= RANK[def.tier]              // Tier hoch genug …
      || s.features.includes(featureId);             // … oder à-la-carte-Addon
}

function featureTier(featureId: string): Tier {      // für die Demo-Tags
  return catalog.byId(featureId)?.tier ?? "free";
}

function withinLimit(limitId: string, current: number, s: LicenseState): boolean {
  if (s.demoMode) return true;
  const max = limitForTier(limitId, s.tier, s.limits);
  return max == null || current < max;               // null = unbegrenzt
}
```

---

## 8. Durchsetzung & Degradation (datensicher)

**Wo durchgesetzt wird:**
- **API**: Fastify-preHandler `requireFeature("…")` an Premium-Endpoints; Limit-
  Checks (`withinLimit`) bei Create-Operationen.
- **Worker**: gated Background-Jobs (z. B. Premium-Connector-Sync) prüfen ebenso.
- **Web**: `useEntitlement()` **blendet nicht-berechtigte Features komplett aus**
  (aufgeräumt, **kein** Lock/Upsell im Normal-Modus) – **nur UX**, die echte Sperre
  ist serverseitig. *(Ausnahme: Demo zeigt alles + farbigen Tier-Tag.)*

**Verhalten bei fehlender Berechtigung / abgelaufener Lizenz:**
- **Degradieren, nie zerstören.** Premium-Features read-only / gesperrt, Banner,
  Limits greifen. **Niemals** Daten löschen/aussperren – Export bleibt immer
  möglich (Audit-Tool, auch rechtlich wichtig).
- Kein Token ⇒ Free-Baseline (App voll nutzbar im Free-Umfang).
- **Wichtig für den Strukturbau:** Da der Katalog zunächst **leere/Platzhalter-
  Tiers** hat, ist anfangs **nichts gesperrt** – die Mechanik liegt bereit und
  greift erst, wenn der Hersteller Tiers einträgt.

**Mehrfach-Checkpoints:** Boot + periodische Re-Verifizierung (z. B. stündlich) +
inline an privilegierten Mutationen, damit das Entfernen eines einzelnen Checks
nicht reicht.

**Clock-Schutz (für Lizenzen mit Ablauf):** `last_validated_at` + monotoner
Zähler persistieren; Uhr-Rücksprung ⇒ Manipulationsverdacht ⇒ limitierter Modus.
(Für Demo irrelevant, da kein Ablauf.)

---

## 9. Demo-Modus im Detail

### 9.1 Aktivierung
- Token mit `tier:"demo"` ⇒ `demoMode = true`, **kein Ablauf** (Entscheidung #1).
- Läuft auf einem **dedizierten Demo-Server** des Herstellers (Entscheidung #2/3).
- Sichtbares **„DEMO"-Watermark** in der UI (Header-Badge).

### 9.2 Fake-Daten-Seed – die drei Muster-Kunden

Beim Boot mit Demo-Lizenz seedet die API (analog `seedRolesAndPermissions`),
**idempotent** (Flag `demo_seeded` in `settings`) und mit `is_demo = true` auf
den erzeugten Kunden (verwandte Datensätze hängen am Kunden → Reset per Cascade).

> Inhalt realistisch genug für eine überzeugende Vorführung: je 1 Assessment auf
> Basis eines vorhandenen Frameworks, mit Controls, Evidence, Findings, Risks,
> Roadmap und (wo passend) Report.

**Kunde A – „Muster GmbH" — fertiges Audit (~100 %)**
- Assessment komplett, alle Controls bewertet (`applicability` gesetzt,
  `review_status = approved`, `evidence_quality_score` vergeben).
- Evidence-Requests alle `closed`/`validated`, Evidence gemappt.
- Findings: wenige, alle `closed`/`resolved`, Management-Response + Remediation
  abgeschlossen, Retest bestanden.
- Risiken: geringes Restrisiko. Roadmap: erledigt. **Report erstellt + signiert.**
- *Story: der fertige Deliverable.*

**Kunde B – „Beispiel AG" — halbfertiges Audit (~50 %)**
- Phase „Fieldwork". ~Hälfte der Controls bewertet, Rest `draft`/offen.
- Evidence-Requests teils `open`/`requested`, einige `received`, wenige validiert.
- Ein paar Findings in `draft`/`management_response`. Kein Report.
- Risiken gemischt. *Story: Work in progress.*

**Kunde C – „Problem KG" — fast fertig, viele Probleme (~85–90 %)**
- Phase „Reporting/Closure", aber **viele offene Findings** (mehrere
  `critical`/`high`), **viele Evidence-Gaps**, überfällige Evidence-Requests.
- Hohe/kritische Risiken, überfällige Roadmap-Items. Report-Entwurf in Review.
- *Story: „Seht, wie viel das Tool aufdeckt" – das überzeugende Verkaufsbild.*

### 9.3 Reset / Re-Seed
- Befehl (CLI/Console + ggf. Admin-Button): **„Demo-Daten zurücksetzen"** →
  löscht alle `is_demo`-Kunden (Cascade) und setzt `demo_seeded = false`, dann
  neu seeden. Billig, praktisch für saubere Demos.

### 9.4 Alles aktiviert
- `demoMode` ⇒ `isEntitled()`/`withinLimit()` immer `true`. Keine Sperren/Limits.

### 9.5 Farbige Tier-Tags (nur im Demo)

```tsx
// apps/web/src/components/FeatureTag.tsx (Konzept)
function FeatureTag({ featureId }: { featureId: string }) {
  const { demoMode, featureTier } = useLicense();      // aus /api/license/state
  if (!demoMode) return null;                           // außerhalb Demo: nichts
  const tier = featureTier(featureId);                  // "free" | "pro" | "enterprise"
  const map = {
    free:       { label: "Free",       cls: "bg-audity-success/15 text-audity-success" },   // grün
    pro:        { label: "Pro",        cls: "bg-audity-primary/15 text-audity-primary" },   // blau
    enterprise: { label: "Enterprise", cls: "bg-purple-500/15 text-purple-300" },           // lila
  }[tier];
  return <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${map.cls}`}>{map.label}</span>;
}
```

- **Platzierung:** an Nav-Einträgen, Buttons und Sektions-Headern der jeweiligen
  Features.
- **Doppelnutzen:** im Verkaufsgespräch direkt **Upsell-Signposting** („dieses
  Feature ist Enterprise").
- Farben: **Free = grün, Pro = blau, Enterprise = lila** (Entscheidung #4) –
  über eure Design-Tokens, lila als zusätzlicher Akzent.

### 9.6 Watermark
- Persistenter „DEMO"-Badge im App-Header (aus `LicenseState.watermark`).

---

## 10. Anti-Bypass-Schichten (ehrlich nach realer Stärke)

| Stärke | Mechanismus |
|---|---|
| **Hoch** | **Ed25519-Signatur** – Pro/Enterprise-Ansprüche nicht fälschbar; Paid-Features nur mit signiertem Anspruch freischaltbar. *(Die verbleibenden echten Zähne.)* |
| **Hoch** | **Support an die Lizenz koppeln** (Pro/Ent = Support, Free/gecrackt = keiner). **Wichtig:** Updates sind **NICHT** tier-gegated – **ein Stream für alle Tiers** (Produktentscheidung, §2). „Updates vorenthalten" ist damit *kein* Hebel gegen Cracks; optional ließe sich der Update-Abruf an *irgendeine* gültige Lizenz koppeln, um den Hebel zurückzuholen (widerspricht aber „Free = keine Lizenz"). |
| **Mittel** | Instanz-Bindung (kein Sharing); Verifizierung in echten Feature-Pfad „load-bearing" einweben |
| **Mittel (detektiv)** | Lizenz-Events in unveränderliche Audit-Logs; optional Online-Attestation |
| **Niedrig (Deterrent)** | mehrere Checkpoints, Integritäts-Selfcheck, EULA, rückverfolgbare Kunden-ID |

---

## 11. Konkrete technische Umsetzung

### 11.1 Datenbank (neue Migration, z. B. `011_license.sql`)
- `settings`-Eintrag `demo_seeded` (bool, default false).
- `customers.is_demo boolean not null default false` (+ Index). Verwandte Daten
  hängen am Kunden → Reset per `delete from customers where is_demo` (Cascade).
- Optional `license_state`-Tabelle/Settings-Row für UI-Anzeige (Cache des zuletzt
  verifizierten Zustands; kein Vertrauensanker – die Wahrheit ist das Token).
- Lizenz-Events laufen über bestehende `audit_logs` (z. B.
  `license.validated`, `license.invalid`, `license.tier_changed`).

### 11.2 API-Module (neu)
```
apps/api/src/license/
  ├─ keys.ts          // Public-Key laden (Env), Signaturprüfung
  ├─ token.ts         // Token parsen/verifizieren → Claims
  ├─ catalog.ts       // FEATURES + LIMITS (Tiers vom Hersteller)
  ├─ entitlement.ts   // isEntitled / featureTier / withinLimit
  ├─ service.ts       // LicenseService: laden, cachen, periodisch re-verifizieren, Audit-Log
  ├─ routes.ts        // GET /api/license/state  (+ ggf. Admin-Infos)
  ├─ requireFeature.ts// Fastify preHandler-Factory
  └─ demoSeed.ts      // Seeder Kunde A/B/C + Reset
apps/api/src/scripts/
  └─ signLicense.ts   // Hersteller-Tool (nutzt PRIVATE KEY, nicht im Repo)
```
- **Boot-Wiring** in `server.ts`: `LicenseService.init()` vor den Routen;
  `demoSeed()` nach Migrationen, wenn `demoMode && !demo_seeded`.
- **Worker**: `LicenseService` (read-only) für gated Jobs.

### 11.3 API-Endpoints
- `GET /api/license/state` *(auth)* → `LicenseState` + `features`-Tier-Map
  (für Gating + Tags). Unkritisch (Preisstruktur, kein Geheimnis).
- `GET /api/admin/license` *(Instance Admin)* → aktueller Lizenz-Status/Diagnose.
- `POST /api/admin/license/activate` *(Instance Admin, CSRF)* → Token im Body →
  Signatur + Bindung prüfen → bei gültig **persistieren (DB)** und sofort anwenden;
  bei ungültig 400 mit Grund. Aktivierung wird ins Audit-Log geschrieben.
- `POST /api/admin/license/deactivate` *(Instance Admin, CSRF)* → gespeichertes
  Token entfernen → zurück auf Free (bzw. Env/Datei-Fallback).
- (optional) `POST /api/admin/demo/reset` *(Instance Admin, nur demoMode)*.

### 11.4 Frontend (neu)
```
apps/web/src/license/
  ├─ LicenseProvider.tsx  // lädt /api/license/state, Context
  ├─ useLicense.ts        // { tier, demoMode, isEntitled, featureTier, watermark }
  └─ useEntitlement.ts    // Komfort-Hook: nicht-berechtigte Features komplett ausblenden
apps/web/src/components/
  ├─ FeatureTag.tsx       // farbiges Tier-Chip (nur Demo)
  └─ DemoWatermark.tsx    // Header-Badge
```

### 11.5 Lizenz-Auslieferung & Aktivierung
- **Aktivierung über Admin-UI (primär):** Instance Admin fügt das Token auf der
  neuen **„Lizenz"**-Seite ein → API verifiziert → **persistiert in DB**
  (`settings.license_token` o. ä.) → sofort aktiv. **Vorrang** vor Env/Datei.
- **Bootstrap-Fallback:** Token via `AUDITY_LICENSE` (Env) **oder** gemountete
  Datei (wie sealed-secrets) – für vorkonfigurierte/Demo-Instanzen.
- Lade-Reihenfolge im `LicenseService`: **DB (UI-aktiviert) → Env → Datei → Free**.
- `LicenseService` lädt beim Boot, verifiziert, cached, re-verifiziert periodisch.

### 11.6 Admin-Menü-Eintrag „Lizenz" (letzter Eintrag)
- Neuer `<NavLink to="/admin/license">` als **letzter Eintrag** im Admin-`<nav>`
  in `apps/web/src/components/AppLayout.tsx` (nach „Archive", Zeile ~708).
- **Sichtbarkeit: nur Instance Admin** (analog „Backup":
  `user?.role === "Instance Admin"`) – Aktivierung ist eine instanzweite,
  privilegierte Aktion.
- Label „Lizenz" (DE) / „License" (EN), eigenes Nav-Icon.
- Route `/admin/license` → `LicenseAdminPage`: aktuellen Status zeigen, Token
  einfügen/aktivieren/deaktivieren; im Demo zusätzlich Hinweis auf Demo-Modus &
  Button „Demo-Daten zurücksetzen".

---

## 12. Hersteller-Workflow

**„Welche Funktion ist free / lizenzpflichtig?"** – zwei Stellschrauben:
- **Global (Policy):** `tier` eines Features im **Katalog** setzen → gilt für alle
  Instanzen, kommt mit einem Release.
  - ⚠️ Free→Paid: bestehende Kunden ohne Anspruch verlieren Zugriff beim Update →
    **Grandfathering** (Stichtags-Flag in Altlizenzen) einplanen.
- **Pro Kunde (kommerziell):** Edition/Feature-Flags/Limits in der **signierten
  Lizenz** → kein Release nötig.

**Lizenz ausstellen** (`signLicense`-Tool, offline, mit Private-Key):
```
node signLicense.js --tier pro --customer "Acme GmbH" \
    --limit customers=10 --limit seats=25 \
    --feature public_api --bind <fingerprint|none> --expires <date|none>
# → gibt das signierte Token aus (in AUDITY_LICENSE / Datei beim Kunden ablegen)

node signLicense.js --tier demo --customer "Audity Demo" --bind none   # Demo: alles an, kein Ablauf
```

---

## 13. Bau-Phasen (nach Freigabe)

1. **Keypair + `signLicense`-Tool** (Private-Key aus Git raus).
2. **Token-Verifizierung + LicenseService** (laden/cachen/re-verifizieren) + Boot-Wiring.
3. **Entitlement-Engine + Katalog-Gerüst (leere Tiers)** + `GET /api/license/state`.
4. **`requireFeature`-preHandler + Limit-Checks** (greifen erst mit gesetzten Tiers).
5. **Frontend:** `LicenseProvider`, `useEntitlement`, `<FeatureTag>`, `<DemoWatermark>`,
   **`LicenseAdminPage` + Admin-Menü-Eintrag „Lizenz" (letzter Eintrag) + Route `/admin/license`**.
6. **Demo-Seeder** (A/B/C, `is_demo`, idempotent, Reset).
7. **Update/Support-Kopplung** (anbieterseitiger Lizenz-Check beim Update) – §10.
8. **Audit-Log-Events + (optional) Clock-Schutz**.

> Reihenfolge-Empfehlung: erst Backend-Gerüst (1–4), zur Review zeigen, dann
> Frontend + Seeder (5–6), zuletzt 7–8.

---

## 14. Offen / spätere Schritte (Hersteller)

- **Feature → Tier-Zuordnung** im Katalog (§6) – *der ausdrückliche nächste
  Schritt nach dem Strukturbau.*
- Konkrete **Limits** pro Tier (customers/seats/…).
- Pricing-/Marketing-Seite aus dem Katalog generieren (optional).
- EULA-Text + Lizenz-Widerruf-Prozess (optional).
- **Zahlungsmodell bestätigen** (§4a): A) Offline-Jahreslizenz *(empfohlen)* vs.
  B) Online-Subscription vs. perpetual + Wartung. **Grace-Period-Dauer** festlegen.

---

## 15. Entscheidungs-Log

| Datum | Entscheidung |
|---|---|
| 2026-06-29 | Lokal verifizierte Lizenz (Ed25519, offline) als Kern gewählt. |
| 2026-06-29 | Vier Tiers: Free/Pro/Enterprise/Demo. |
| 2026-06-29 | Demo: keine Zeitbegrenzung, dedizierter Hersteller-Server, kein Auto-Purge, Free = keine Lizenz, Tag-Farben grün/blau/lila. |
| 2026-06-29 | Feature→Tier-Zuordnung erfolgt nach dem Strukturbau durch den Hersteller. |
| 2026-06-29 | Lizenz-Aktivierung über neuen Admin-Menü-Eintrag „Lizenz" (letzter Eintrag, Instance-Admin-only); Token wird in DB persistiert (Vorrang vor Env/Datei). |
| 2026-06-29 | Zahlungsmodell: **Jahres-Laufzeit-Lizenz** mit `expiresAt` empfohlen; Erneuerung = neues Token über die Admin-„Lizenz"-Seite. (Bestätigung offen, §4a/§14.) |
| 2026-06-29 | **Ein Update-Stream für alle Tiers**; Features per Lizenz/Katalog nur für berechtigte Tiers sichtbar/aktiviert („dark ship, light up"). Updates **nicht** tier-gegated → Anti-Bypass-Hebel = Signatur + Support-Kopplung (§10). |
| 2026-06-29 | **Verbindliche Ablauf-Regeln** (§4a): Grace-Period `license_grace_days` Default 30 (14–30); bei Ablauf graceful → Free (Banner, kein Datenverlust, Export bleibt); Clock-Rollback-Schutz via `last_validated_at`. |
| 2026-06-29 | Nicht-berechtigte Features im Normal-Modus **komplett ausgeblendet** (kein Lock/Upsell); Demo zeigt alles + farbigen Tier-Tag. |
| 2026-06-29 | Erste Feature→Tier-Zuordnung: **AI = Pro** (Free hat kein AI; Demo zeigt AI mit „Pro"-Tag). Gegated: `/api/admin/llm/*`, Import-Enrichment (Free → `provider:"none"` → TODO-Platzhalter), AI-Nav-Eintrag. Lokal deployed. |
| 2026-06-29 | **Connectors = Enterprise** (nur Enterprise + Demo). Gegated: alle `/api/admin/connectors*`-Routen, der In-API Auto-Sync-Worker (kein Sync ohne Berechtigung), Connector-Nav-Eintrag (+ Demo-Tag „Enterprise"). Lokal deployed. |
| 2026-06-29 | **Kundenlimit pro Tier**: Free 25 / Pro 50 / Enterprise unbegrenzt (Demo unbegrenzt) — Limit `customers`. Durchgesetzt bei `POST /api/customers` + Bulk-Import (per Zeile), angezeigt auf der Kundenliste als „X/Y Kunden" (rot bei Erreichen). Zählt aktive (`archived_at is null`), nicht-Demo-Kunden. |
| 2026-06-29 | **Nutzerlimit pro Tier**: Free 5 / Pro 15 / Enterprise unbegrenzt (Demo unbegrenzt) — Limit `users` im Katalog. Durchgesetzt beim Anlegen (`POST /api/admin/users/invite` → 403 `USER_LIMIT_REACHED`), angezeigt im User Management als „X/Y Nutzer aktiviert" (rot bei Erreichen). Zählt aktive Nutzer (`status='active'`). |
| 2026-06-29 | **Customer Acknowledgment = Enterprise**. Zentral: `isFeatureEnabled()` ist entitlement-aware (Free/Pro → Feature komplett aus: keine Ack-Pflicht beim Close, keine Token-Ausgabe). Gegated: 7 Admin-Routen (settings/tokens/issue/revoke/receipt) mit `requireFeature("customer_ack")` — NICHT der Close-Endpoint, NICHT das öffentliche Portal. Frontend: Admin-Nav + Workflow-`CustomerAckPanel` (Magic-Link) ausgeblendet, im Demo mit „Enterprise"-Tag. Lokal deployed. |
