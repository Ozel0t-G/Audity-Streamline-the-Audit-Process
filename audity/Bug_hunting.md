# Bug Hunting

Fortlaufende Dokumentation der beim systematischen Code-Review gefundenen und behobenen Bugs.

---

## Bug #1 — Verfrühter Idle-Logout bei ungültigem Session-Timeout-Wert ✅ ERLEDIGT (verifiziert 2026-06-24)

- **Datum/Uhrzeit:** 2026-06-24 16:40 CEST
- **Datei:** `apps/web/src/components/layout/useIdleLogout.ts`
- **Schweregrad:** Mittel (Usability / Session-Handling)

### Beschreibung
`useIdleLogout` übernahm den vom Endpoint `/api/system/session-timeout` gelieferten Wert
ungeprüft: `timeoutMinutes = payload.sessionIdleTimeoutMinutes;`

Der Backend-Endpoint (`apps/api/src/notifications/routes.ts`) gibt
`Number(result.rows[0]?.value ?? 30)` zurück. Ist der gespeicherte Setting-Wert
nicht-numerisch, ergibt `Number(...)` ein `NaN`, das beim JSON-Serialisieren zu `null`
wird. Im Frontend führte das zu:

- `timeoutMinutes = null` → `Math.max(1, Math.min(180, null))` = **1 Minute** (statt 30) → verfrühter Logout.
- Fehlendes Feld (`undefined`) → `Math.max(1, Math.min(180, undefined))` = **NaN** → `setTimeout(fn, NaN)` feuert **sofort** → quasi-sofortiger Logout.

Der vorhandene `.catch`-Fallback griff nur bei Netzwerk-/Non-2xx-Fehlern, **nicht** bei
einer erfolgreichen 200-Antwort mit ungültigem Wert. Es ist exakt die Fehlerklasse
"premature session termination", die das Team laut Commit `c467daf` adressieren wollte,
im Frontend aber nicht abgesichert hatte.

### Behebung
Wert wird jetzt validiert und fällt bei nicht-endlichen oder nicht-positiven Werten
robust auf 30 Minuten zurück:

```ts
const minutes = Number(payload.sessionIdleTimeoutMinutes);
timeoutMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 30;
```

### Verifikation
- `npx tsc --noEmit` im `apps/web`-Projekt: keine Fehler.

### Geprüft, aber unauffällig (in diesem Durchgang)
- `apps/api/src/customers/routes.ts` — `saveCustomerFrameworks` (Hinzufügen/Entfernen, leeres Array löscht alles): korrekt.
- `apps/web/src/components/ui/MultiCombobox.tsx` — Tastatur-Navigation/`toggle`/`remove`: korrekt.
- `apps/api/src/cockpit/actions.ts` — Overdue-/Ablauf-Datumsmathematik: korrekt.
- `apps/web/src/api/client.ts` — CSRF-Header `method !== "GET"` ist case-sensitive (latent, aktuell nicht getriggert, da nirgends lowercase-Methoden verwendet werden).
- `apps/api/src/secure/routes.ts` & `apps/api/src/admin/routes.ts` — CSV-/Formula-Injection-Guard: konsistent und korrekt.
- `apps/api/src/evidence/routes.ts` — Truncation-Check (`file.file.truncated`) vor dem Speichern: korrekt.
- `apps/web/src/components/CustomerContextProvider.tsx` — Routen-Regex inkl. Tab-Views: korrekt.

---

## Bug #2 — Umgehbares Limit für offene Customer-Ack-Tokens (inkonsistente E-Mail-Normalisierung) ✅ ERLEDIGT (verifiziert 2026-06-24)

- **Datum/Uhrzeit:** 2026-06-24 17:06 CEST
- **Datei:** `apps/api/src/customerAck/tokens.ts` (`issueToken`)
- **Schweregrad:** Mittel (Logik-/Sicherheitsbug — Rate-Limit umgehbar)

### Beschreibung
Die Prüfung auf die maximale Anzahl gleichzeitig offener Tokens
(`MAX_CONCURRENT_PENDING`) suchte mit `input.recipientEmail.toLowerCase()` —
**ohne** `.trim()`. Der anschließende INSERT speicherte die Empfänger-E-Mail jedoch
mit `input.recipientEmail.toLowerCase().trim()` (**getrimmt**).

Dadurch war die Normalisierung zwischen Limit-Prüfung und gespeichertem Wert
inkonsistent: Bei einer E-Mail mit führenden/abschließenden Leerzeichen
(z. B. `" kunde@example.com "`) suchte die Prüfung nach dem ungetrimmten Wert und
fand die bereits gespeicherten (getrimmten) Tokens nicht. Folge: Das Limit von
gleichzeitig offenen Ack-Tokens ließ sich umgehen, indem man Varianten derselben
E-Mail mit Whitespace verschickte — beliebig viele offene Tokens für denselben
Empfänger.

### Behebung
Die E-Mail wird jetzt **einmal** normalisiert und sowohl in der Limit-Prüfung als
auch im INSERT konsistent verwendet:

```ts
const recipientEmail = input.recipientEmail.toLowerCase().trim();
// ... pending-Query nutzt recipientEmail
// ... INSERT nutzt recipientEmail
```

### Verifikation
- `npx tsc --noEmit` im `apps/api`-Projekt: keine Fehler.

---

## Bug #3 — Expiry-Job kann die manipulationssichere Audit-Log-Hash-Chain korrumpieren ✅ ERLEDIGT (verifiziert 2026-06-24)

- **Datum/Uhrzeit:** 2026-06-24 17:28 CEST
- **Dateien:** `apps/api/src/customerAck/expiryJob.ts` (`runExpiryJob`), `apps/api/src/admin/routes.ts` (`eventHash`-Verifizierer)
- **Schweregrad:** Hoch (Daten-/Audit-Integrität)

### Beschreibung
Der zentrale Service `appendActivityEvent` (`apps/api/src/activity/service.ts`) sichert
die append-only Hash-Chain der `user_activity_logs` ab durch:
1. eine Transaktion,
2. einen **Advisory-Lock** `pg_advisory_xact_lock(hashtext('audity_user_activity_logs'))`,
3. **monoton steigende** Zeitstempel (`nextTimestamp`), damit `order by created_at asc, id asc`
   die echte Einfüge-Reihenfolge widerspiegelt.

Der stündliche `runExpiryJob` schrieb seine Audit-Einträge dagegen mit **eigener**,
ungeschützter Hash-Chain-Logik:
- **Kein Advisory-Lock:** Lief der Job gleichzeitig mit einem `appendActivityEvent`
  (aus einem normalen API-Request), lasen beide denselben Chain-Head und fügten zwei
  Einträge mit **identischem `prev_hash`** ein. Der Verifizierer
  (`/api/admin/activity-logs/verify`) meldet das korrekt als `prev_hash_mismatch` →
  **`valid: false`** (falsch-positive Manipulationswarnung).
- **Nicht-monotone Zeitstempel:** Bei gleichem Millisekunden-`created_at` brach die
  per `(created_at, id)` sortierte Reihenfolge → ebenfalls `prev_hash_mismatch`.
- **Actor-Inkonsistenz:** Der Hash wurde mit dem Literal `"SYSTEM"` gebildet, die Spalte
  `user_id` aber als `null` gespeichert (Spalte ist `uuid`, kann „SYSTEM" gar nicht
  speichern). Der Verifizierer rekonstruiert den Hash aus `row.user_id` (null → `"null"`),
  sodass die Neuberechnung **jedes** Expiry-Events fehlschlug (`recomputeWarnings`).

### Behebung
1. `runExpiryJob`: jeder Eintrag wird jetzt in einer Transaktion **mit demselben
   Advisory-Lock** und **monotonen Zeitstempeln** (`nextTimestamp`) wie
   `appendActivityEvent` geschrieben; zusätzlich ein Re-Check innerhalb des Locks, ob das
   Token bereits geloggt wurde (gegen Doppel-Einträge bei Nebenläufigkeit).
2. Actor-Konsistenz: System-Events hashen den Actor-Slot als `""` (Spalte bleibt `null`),
   und der Verifizierer rekonstruiert mit `(row.user_id ?? "")`. Für alle echten Events
   mit non-null `user_id` ist diese Verifizierer-Änderung ein **No-Op**; sie behebt nur
   die `recomputeWarnings` der System-Events.

### Verifikation
- `npx tsc --noEmit` im `apps/api`-Projekt: keine Fehler.
- Verifizierer-Änderung ist beweisbar neutral für non-null `user_id` (alle regulären Events).

---

## Iteration 4 — Review-Durchgang (kein neuer Bug)

- **Datum/Uhrzeit:** 2026-06-24 17:53 CEST

Gründliche Prüfung sicherheitskritischer und kürzlich geänderter Module; alle als korrekt
bestätigt, kein Fix erforderlich:

- `apps/api/src/productivity/routes.ts` — `/api/search`: Zugriffsscoping (`${access}`) auf
  Customers/Assessments/Risks/Findings/Reports korrekt; `workbench_records` ist durch
  Permission `settings.manage` gegated (kein Leak für reguläre Nutzer). Workbench
  Update/Delete/Bulk konsistent admin-gegated.
- `apps/api/src/frameworks/csvParser.ts` — RFC4180-Parser, Delimiter-Erkennung, Header-/
  Pflichtfeld-Validierung, `weight`-/`tags`-Parsing: robust, kein Undefined-Zugriff.
- `apps/api/src/console/{commands,grant,routes}.ts` — Maintenance-Console: Allowlist + fixer
  Switch + kein Shell; `validateService`-Allowlist; `lines` geklammert; Updater token-gated;
  Run-Endpoint prüft Grant (IP-Binding, aktive Session, frischer Instance-Admin-Check).
- `apps/api/src/server.ts` — Origin-/CSRF-PreHandler: Same-Origin-Fallback
  (`new URL(origin).host === host`) erlaubt beliebige IP/Domain, weist echte Cross-Site-
  Requests ab — konsistent mit dem Portabilitäts-Memory.
- `apps/api/src/workflow/routes.ts` — lokaler `parseCsv` + Risk-CSV-Import (dedup via
  `lower(title)`): korrekt.
- `apps/api/src/workflow/autoConvert.ts` — Findings→Risks: transaktions- und advisory-lock-
  geschützt gegen Doppel-Einträge: korrekt.
- `apps/api/src/utils/crypto.ts` — AES-256-GCM (Random-IV + Auth-Tag), `sha256`,
  `randomToken`: korrekt.
- `apps/api/src/auth/service.ts` — `isCsrfTokenValid`: Vergleich über gehashten Tokenwert
  (`csrf_token_hash = sha256(token)`), timing-unkritisch: korrekt.

---

## Iteration 5 — Review-Durchgang (kein neuer Bug; 2 Beobachtungen)

- **Datum/Uhrzeit:** 2026-06-24 18:19 CEST

Geprüft und als korrekt bzw. bewusst-so-gewollt bestätigt:

- `apps/api/src/archive/files.ts` — Spool-Move/Restore: dokumentierte, bewusste
  Transaktions-Semantik (Spool bleibt bei Fehler für Retry erhalten).
- `apps/worker/src/worker.ts` — eigene `appendActivityEvent`-Kopie nutzt Advisory-Lock +
  monotone Zeitstempel + echten `userId` (im Backup-Flow per `if (jobData.userId)` geguarded,
  also kein null/leerer Actor → kein INSERT-Fehler, kein Chain-Problem wie in Bug #3).
- `apps/api/src/connectors/routes.ts` — SSRF-Guard `assertSafeProviderUrl` (Protokoll-Check,
  `lookup({all})`, `redirect:"error"`, Timeout) und `isBlockedAddress` (IPv4 privat/loopback/
  link-local/CGNAT/multicast + IPv6 loopback/link-local/ULA + `::ffff:`-Mapping): solide;
  bekannte DNS-Rebinding-Grenze ist dokumentiert.
- `apps/web/src/components/{NextActionBell,AppLayout}.tsx` — Timer/EventSource mit korrektem
  `clearInterval`/`removeEventListener`/`close` im Cleanup.
- Codebasis-weite Suche nach `forEach(async …)`, `reduce(async …)` und Loose-Equality (`==`):
  keine Treffer (sehr sauber).

### Beobachtungen (bewusst NICHT geändert — brauchen Kontext/Entscheidung)

1. **`restoreEvidenceObjects` (`apps/worker/src/worker.ts`, ~Z.439)** löscht via
   `listStorageObjects(storageBucket)` **alle** Objekte des Storage-Buckets und stellt danach
   nur die **Evidence**-Objekte aus dem Backup wieder her. Liegen im selben Bucket auch
   Nicht-Evidence-Objekte (z. B. Report-PDFs), gingen sie beim Restore verloren. Ob das ein
   echter Datenverlust ist, hängt vom Bucket-Layout / der restlichen Restore-Orchestrierung ab
   (Reports evtl. separat gesichert/regeneriert) — daher zunächst nur als Hinweis.
2. **EventSource-Auth (`apps/web/src/components/AppLayout.tsx`, ~Z.144)** übergibt den
   `accessToken` als **URL-Query-Parameter** (`/api/notifications/stream?token=…`). Tokens in
   URLs können in Server-/Proxy-Logs landen.
   → **In Iteration 6 verifiziert:** Der Stream-Endpoint
   (`apps/api/src/notifications/routes.ts`) authentifiziert per `verifyAccessToken(query.token)`,
   und die App-Auth ist **Bearer-Token-basiert** (Access-Token im `Authorization`-Header, kein
   Auth-Cookie). Da EventSource keine Header setzen kann, ist der Query-Token eine **bewusste
   Notwendigkeit** (kein einfacher Bug). Echte Härtung bräuchte ein dediziertes kurzlebiges
   Stream-Token oder fetch-basiertes SSE — größere Designentscheidung, daher hier nicht geändert.

---

## Iteration 6 — Review-Durchgang (kein neuer Bug)

- **Datum/Uhrzeit:** 2026-06-24 18:44 CEST

- Beobachtung #2 aus Iteration 5 verifiziert (siehe oben): Design-Constraint, kein Bug.
- `apps/api/src/customerAck/{routes,tokens}.ts` — Token-Redemption: `markTokenRedeemed` claimt
  das Token **atomar** (guarded UPDATE `where redeemed_at is null and revoked_at is null and
  expires_at > now()` + rowCount-Check), `revokeToken` analog. Kein Replay/Doppel-Sign-off.
- `apps/web/src/pages/{audit/AuditCenterPage,DashboardPage,admin/FrameworkImportReviewPage,
  frameworks/FrameworkLibraryPage}.tsx` — alle Prozent-/Durchschnittsberechnungen gegen
  Division-durch-Null geschützt (`Math.max(1, …)`, `total === 0 ? 0 : …`, `length ? … : "0.0"`).
- `apps/api/src/frameworks/yamlImporter.ts` — Zod-validiert, deterministische `stableUuid`,
  Unknown-Key-Erkennung: solide strukturiert.

---

## Iteration 7 — Review-Durchgang (kein neuer Bug)

- **Datum/Uhrzeit:** 2026-06-24 19:07 CEST

Auth-/MFA-/Recovery-Flow (security-kritisch) durchgängig geprüft — korrekt:

- `apps/api/src/auth/routes.ts` — Login: MFA-Gate **vor** Session-Erstellung
  (`isMfaEnabled` → signierter `challengeToken`, keine Session ohne 2. Faktor); fehlgeschlagene
  Logins werden auditiert; Login/Refresh/Setup rate-limited.
- `/api/auth/mfa/challenge` — verifiziert den signierten Challenge-Token, dann TOTP, dann
  Recovery-Code-Fallback; `code` ist per Schema Pflicht (6–12 Zeichen) → kein
  Undefined-Crash in nachgelagerten Vergleichen.
- `apps/api/src/auth/mfa.ts` — `verifyTotp` via otplib `authenticator.check`
  (konstanter Zeitvergleich + Zeitfenster); `consumeRecoveryCode` via `argon2.verify` +
  `select … for update` Row-Lock + atomares Entfernen des verbrauchten Codes (kein Replay).
- `apps/api/src/cockpit/inboxPagination.ts` — `decodeCursor`: `JSON.parse` in try/catch **und**
  vollständige Feldtyp-Validierung → malformter (user-kontrollierter) Cursor liefert `null`,
  kein 500.
- Alle 16 `JSON.parse`-Stellen in `apps/api`/`apps/worker` in Request-Pfaden sind gegen
  malformten Input abgesichert (try/catch, Array-Guards oder Fallback).

### Zwischenstand nach 7 Iterationen
3 echte Bugs behoben (Iter. 1–3), 4 saubere Review-Durchgänge (Iter. 4–7). Alle
security-kritischen Pfade (CSRF, SSRF, MFA, Token-Redemption, Audit-Log-Integrität,
Console-Command-Execution) korrekt implementiert. Die Rendite weiterer Durchgänge sinkt
deutlich — die Codebasis ist ausgereift.

---

## Iteration 8 — Review-Durchgang (kein neuer Bug)

- **Datum/Uhrzeit:** 2026-06-24 19:29 CEST

- `apps/api/src/frameworks/importJobs.ts` — LLM-Enrichment-Schleife: per-Control `try/catch`
  mit `_todo`-Markierung bei Fehler, korrekter Fortschritt (`enriched`/`total`),
  Token-/Kosten-Akkumulation: robust.
- `apps/api/src/customerAck/receiptPdf.ts` — `safeText` ist nur ein Leer-Fallback („—"), kein
  Sanitizer; user-kontrollierte Felder (`signerName`/`comment`) sind per Zod begrenzt
  (`signerName` 2–120, `comment` ≤2000) und werden über pdfkit `.text()` sicher eingebettet
  (kein Injection-Vektor). Kein Bug.
- **Hygiene-Check:** voller `tsc --noEmit` für `apps/api` **und** `apps/web` → beide exit 0.
  Alle Fixes aus Iter. 1–3 kompilieren konsistent zusammen.

---

## Iteration 9 — Review-Durchgang (kein neuer Bug)

- **Datum/Uhrzeit:** 2026-06-24 19:52 CEST

- `apps/api/src/secure/routes.ts` — Paket-Import: `decryptZipPackage` entschlüsselt via
  `decryptText` (**AES-256-GCM**, authentifiziert) — Tampering scheitert am Auth-Tag *vor* der
  Checksum, daher ist das `if (payload.checksum && …)`-Skipping unkritisch. Paket mit
  Instanz-Schlüssel verschlüsselt (Zip-Bomb nur selbst-induzierbar) + 50 MB Upload-Limit +
  alle `JSON.parse` in try/catch. Solide.
- `apps/api/src/llm/provider.ts` — `parseEnrichedJson`: Code-Fence-Stripping, doppeltes
  `try/catch` mit `{…}`-Block-Fallback, Degradation zu TODO-Platzhaltern statt Crash. Robust.

### Hinweis zum Loop-Stand (nach 9 Iterationen)
3 echte Bugs behoben, 6 saubere Review-Durchgänge. Alle wesentlichen Module und
security-kritischen Pfade sind geprüft und korrekt. Weitere allgemeine Durchgänge haben
sehr geringe Rendite — empfehlenswert wäre, den Loop entweder zu stoppen oder gezielt auf
eine konkrete Datei/Feature zu richten.

---

## Bug #4 — Pre-Release-Versionen sehen das stabile Release nicht als Update ✅ ERLEDIGT (verifiziert 2026-06-24)

- **Datum/Uhrzeit:** 2026-06-24 20:14 CEST
- **Datei:** `apps/api/src/admin/updateService.ts` (`parseSemver`, `compareVersions`)
- **Schweregrad:** Niedrig–Mittel (Update-Benachrichtigung; relevant bei Alpha-/Pre-Release-Versionen)

### Beschreibung
`parseSemver` matchte zwar `X.Y.Z-prerelease`, verwarf den Pre-Release-Teil aber
(`(?:[-+].*)?` wurde nicht ausgewertet) und gab nur `[X, Y, Z]` zurück. Dadurch lieferte
`compareVersions("1.2.3", "1.2.3-rc1")` **0 (gleich)**, obwohl nach SemVer §11.3
`1.2.3-rc1 < 1.2.3` gilt.

Folge: `updateAvailable = compareVersions(latest, current) > 0`. Wer eine Pre-Release-Version
(z. B. `0.2.4-rc1`) installiert hatte, bekam das passende stabile Release (`0.2.4`) **nie** als
verfügbares Update angezeigt — der Vergleich ergab Gleichstand. Bei einem Alpha-Produkt, in
dem Pre-Release-Builds vorkommen, ist das ein realer Fehler.

### Behebung
- `parseSemver` gibt jetzt `{ core: [major, minor, patch], prerelease: string | null }` zurück
  (Build-Metadaten `+…` weiterhin ignoriert).
- `compareVersions` vergleicht bei gleichem Core nun die Pre-Release-Präzedenz: ein normales
  Release (kein Pre-Release) rangiert höher als ein Pre-Release desselben Cores; zwei
  Pre-Releases werden deterministisch per `localeCompare` geordnet.
- Der **Release-vs-Release-Pfad bleibt unverändert** (Core-Vergleich identisch, gleiche
  Releases ergeben weiterhin 0). Alle `parseSemver`-Aufrufer nutzen nur Truthiness oder liegen
  in `compareVersions` — Rückgabeform-Änderung ist sicher.

### Verifikation
- `npx tsc --noEmit` im `apps/api`-Projekt: keine Fehler (exit 0).

---

## Iteration 11 — Review-Durchgang (kein neuer Bug)

- **Datum/Uhrzeit:** 2026-06-24 20:37 CEST

- `apps/api/src/cockpit/routes.ts` — Readiness (`answered/questions`), Durchschnitts-Readiness
  und Pagination-`limit` alle gegen Division-durch-Null/NaN geschützt (`questions > 0 ? … : 0`,
  `Math.min/Math.max`, `Number.isFinite`).
- `apps/api/src/archive/bundle.ts` — `decodeBundle`: Längen-Check (`< 4+4+IV+TAG`), Magic- und
  Versions-Validierung, AES-256-GCM-Auth (`decipher.final()` in try/catch); nachgelagerter
  `JSON.parse` des Manifests ist durch die GCM-Authentifizierung geschützt.
- `apps/api/src/reports/routes.ts` — HTML-/PDF-Report: alle dynamischen Felder über
  `escapeHtml` (deckt `& < > "` ab, `&` zuerst); kein unescaptes user-Feld im Template →
  injection-sicher.

---

## Bug #5 — Framework-Import ist nicht atomar (halb-importierte Frameworks bei Fehler) ✅ ERLEDIGT (verifiziert 2026-06-24)

- **Datum/Uhrzeit:** 2026-06-24 20:59 CEST
- **Datei:** `apps/api/src/frameworks/routes.ts` (`POST /api/frameworks` Import-Handler)
- **Schweregrad:** Mittel (Daten-Integrität)

### Beschreibung
Der Import eines tenant-publizierten Frameworks fügte nacheinander die `frameworks`-Zeile,
dann pro Control die `framework_domains`-, `framework_controls`- und
`question_control_mappings`-Zeilen ein — **alle über `pool.query` ohne Transaktion**.

Schlug ein beliebiger Insert mitten in der Schleife fehl (Constraint-Verletzung, zu langes
Feld, DB-Hickup), blieben die bereits eingefügten Zeilen bestehen: ein **halb-importiertes
Framework** — in der Library sichtbar, aber mit fehlenden Domains/Controls. Anders als
`saveCustomerFrameworks`/`appendActivityEvent` (transaktional) hatte dieser Pfad keine
Atomarität.

### Behebung
Die gesamten Inserts (Framework + Domains + Controls + Mappings) laufen jetzt über einen
dedizierten Client in **einer Transaktion** (`begin` → Inserts → `commit`; bei Fehler
`rollback` + re-throw, `release` im `finally`). Ein Fehler hinterlässt damit **gar kein**
Framework statt eines unvollständigen. Die nachgelagerte Veröffentlichung an Kunden
(`publishFrameworkToActiveCustomers`) läuft bewusst nach dem Commit (separate, retrybare
Folgeaktion — schlägt sie fehl, existiert das Framework dennoch vollständig).

### Verifikation
- `npx tsc --noEmit` im `apps/api`-Projekt: keine Fehler (exit 0) — try/catch/finally-Block
  ist syntaktisch ausgeglichen.

---

## Iteration 13 — Systematischer Audit der Bug-Klasse aus #5 (kein neuer Fix; 2 Beobachtungen)

- **Datum/Uhrzeit:** 2026-06-24 21:09 CEST

Gezielte Suche nach weiteren nicht-atomaren Multi-Insert/Update-Operationen (gleiche Klasse
wie Bug #5) über alle Dateien mit ≥2 `insert into`. Ergebnis: #5 war die einzige klare,
fixbare Instanz. Die übrigen sind selbstheilend oder designbedingt nicht-transaktional:

- `apps/api/src/frameworks/yamlImporter.ts` — nicht-transaktional, aber **idempotente Upserts**
  (`on conflict (id) do update`) mit deterministischen `stableUuid` + Re-Sync beim Boot →
  selbstheilend (gebündelte Frameworks, kein User-Request). Kein Fix nötig.
- `apps/api/src/audit-center/routes.ts` `ensureAuditDefaults` — `audit_plans` und
  `audit_control_profiles` nutzen `on conflict … do nothing` und laufen bei jedem Overview-Load
  idempotent nach; nur der Scope-Seed (gated `count===0`) ist nicht selbstheilend, aber geringer
  Impact (Items user-editierbar, simple Inserts). Kein klarer Bug.
- `apps/api/src/workflow/suggestions.ts` — Findings/Risks-Vorschläge mit
  `on conflict … do nothing/update` → idempotent.
- `apps/api/src/archive/service.ts` — siehe Beobachtung #4.

### Beobachtungen (kritische Pfade — bewusst NICHT autonom geändert)

3. **Customer-Ack-Redemption-Atomarität (`apps/api/src/customerAck/routes.ts`, ~Z.569)** —
   `markTokenRedeemed` (atomarer Claim) und der darauffolgende `insert into audit_signoffs`
   laufen in **zwei separaten** `pool.query`-Aufrufen. Schlägt der Signoff-Insert *nach*
   erfolgreichem Claim fehl (transienter DB-Fehler), ist das Token verbraucht, aber **kein
   Sign-off** vorhanden — der Kunde kann nicht erneut bestätigen. Sauberer Fix: beide
   Statements in **einer** Transaktion (das guarded UPDATE serialisiert via Row-Lock weiterhin
   konkurrierende Redeems). Niedrige Wahrscheinlichkeit, aber rechtlich relevanter Pfad —
   sollte mit End-to-End-Test der Portal-Redemption umgesetzt werden, nicht blind.
4. **Archiv-DB-Updates (`apps/api/src/archive/service.ts`)** — Kunden-Archivierung mischt
   Filesystem-/MinIO-Move mit mehreren `update`/`insert` (customers, assessments,
   archive_index). Schlägt ein DB-Update nach dem File-Move fehl, ist der Zustand teil-
   inkonsistent. Eine Transaktion kann den FS-Move nicht umspannen; der Code nutzt bewusst ein
   manuelles Recovery-Modell (Spool bleibt erhalten). Zumindest die **DB-Updates** (customers/
   assessments/archive_index) könnten in eine Transaktion geklammert werden — Bewertung
   erfordert Verständnis der gesamten Archiv-/Restore-Orchestrierung.

---

## Iteration 14 — RBAC-/Auth-Audit + Bug #6

- **Datum/Uhrzeit:** 2026-06-24 21:34 CEST

### Geprüft und korrekt (kein Bug)
- **Auth-Gating aller Routen:** systematischer Scan aller `app.get/post/put/patch/delete` ohne
  unmittelbaren Auth-Marker → alle Treffer sind entweder bewusst öffentlich (Health-Checks,
  `setup-status`, Token-authentifizierter Notifications-Stream, auth-freier `logout` der nur
  das eigene Cookie revoked) oder entfernte Features (410). Sensible Endpoints (admin/console/
  archive) sind korrekt permission-gegated. **Kein Auth-Bypass.**
- **Privilege-Escalation-Abwehr (User-Update, `admin/routes.ts`):** vollständig —
  `canAssignRole` blockt das Vergeben von Admin-Rollen durch Tenant Admins; Zeile ~1218 blockt,
  dass Nicht-Instance-Admins **bestehende** Admin-Konten modifizieren (kein Herabstufen eines
  Instance Admins); plus Selbst-Deaktivierungs- und Last-Instance-Admin-Lockout-Schutz; das
  Deaktivieren revoked Sessions.
- **Role-Permissions-Endpoint:** `requireInstanceAdminCsrf`-gated — nur Instance Admins (nicht
  Tenant Admins) können Rollen-Permissions ändern; Selbst-Lockout-Schutz (eigene Rolle muss
  `roles.manage` behalten).

---

## Bug #6 — Rollen-Permission-Rewrite nicht atomar (Risiko: Admin-Lockout) ✅ ERLEDIGT (verifiziert 2026-06-24)

- **Datum/Uhrzeit:** 2026-06-24 21:34 CEST
- **Datei:** `apps/api/src/admin/routes.ts` (`PATCH /api/admin/roles/:id/permissions`)
- **Schweregrad:** Mittel–Hoch (Daten-/Authorization-Integrität; potenzieller Admin-Lockout)

### Beschreibung
Beim Aktualisieren der Permissions einer Rolle wurde zunächst
`delete from role_permissions where role_id = $1` ausgeführt und danach in einer Schleife die
neuen Permissions eingefügt — **ohne Transaktion** (`pool.query`).

Da dies die **Authorization-Tabelle** ist, wäre ein Fehler *nach* dem Delete und *während* der
Insert-Schleife (transienter DB-Fehler, Verbindungsabbruch) hochkritisch: die Rolle bliebe mit
**partiellen oder gar keinen** Permissions zurück. Trifft es die Instance-Admin-Rolle, könnte
diese `roles.manage` (und andere Permissions) verlieren → **niemand kann Rollen mehr
verwalten** (Lockout). Gleiche Bug-Klasse wie #5, aber auf einer security-kritischen Tabelle.

### Behebung
Delete + Insert-Schleife laufen jetzt über einen dedizierten Client in **einer Transaktion**
(`begin` → delete → inserts → `commit`; bei Fehler `rollback` + re-throw, `release` im
`finally`). Schlägt etwas fehl, bleiben die **alten** Permissions vollständig erhalten statt
eines kaputten Teilzustands.

### Verifikation
- `npx tsc --noEmit` im `apps/api`-Projekt: keine Fehler (exit 0).

---

## Iteration 15 — Zwei Bug-Klassen vollständig abgeschlossen (kein neuer Bug)

- **Datum/Uhrzeit:** 2026-06-24 21:59 CEST

### A) „delete-then-reinsert ohne Transaktion" — vollständiger Sweep
Alle `delete from`-Stellen (außerhalb Migrations) geprüft. **#5 und #6 waren die einzigen
gefährlichen `delete-ALL`-Instanzen** (Zero-State-Fenster). Alle übrigen sind sicher:
- `apps/api/src/rbac/seed.ts` — **gezielter** Delete (`permission_id <> all($2)`): entfernt nur
  de-assignte Permissions, nie die gewünschten → kein Zero-State-Fenster; selbstheilend beim
  Re-Seed. (Kontrast, der zeigt, warum #6 mit `delete ALL` ein echter Bug war.)
- `apps/api/src/customers/routes.ts` `saveCustomerFrameworks` — gezielter Delete
  (`not (framework_id = any($2))`) + idempotenter Insert: kein Zero-State für behaltene
  Frameworks, retrybar. Sicher (kein Bug).
- `apps/api/src/frameworks/yamlImporter.ts` — Cleanup-Deletes im idempotenten Sync.
- Übrige Deletes (customer/contact/scope-item/mapping/link/roadmap) sind Einzel-Deletes ohne
  Reinsert.

### B) „floating Promise / fehlendes await" auf DB-Writes
Alle `pool.query`/`client.query` in Statement-Position geprüft: sämtliche freistehenden
Treffer sind **SELECTs innerhalb `await Promise.all([...])`** (korrekt kollektiv awaited).
Keine floating `appendActivityEvent`/`appendAuditEvent`. **Keine missing-await-Bugs.**

---

## Iteration 16 — Security-Audit: IDOR & Path-Traversal (kein neuer Bug)

- **Datum/Uhrzeit:** 2026-06-24 22:23 CEST

### A) IDOR / fehlende `canAccess`-Checks
Systematischer Vergleich aller `:id`-Routen gegen `canAccessAssessment`/`canAccessCustomer`.
Alle scheinbaren Lücken waren **False Positives** (Check knapp außerhalb des Grep-Fensters
oder bewusst global/admin-gegatete Ressourcen):
- `reports/routes.ts` — alle assessment-Routen prüfen `canAccessAssessment` (auch
  `/api/jobs/:id/status` löst die assessmentId auf und prüft Zugriff, Z.406).
- `secure/routes.ts` — alle assessment-Routen (send/export/email-job-status) prüfen Zugriff;
  email-settings/import sind permission-gegatet.
- `archive/routes.ts` — customer-Routen via `canAccessCustomer`/`canViewCustomerIncludingArchived`;
  alle `/api/admin/archive/*` via `archive.approve`. **Kein IDOR.**

### B) Path-Traversal in datei-basierten Endpoints
- `safeBundleFilename` (`archive/routes.ts`) — Regex `^[0-9A-Za-z._-]+\.audity-archive$`
  (kein `/`/`\`) **plus** `..`-Reject → Download/Inspect/Upload sicher.
- Bundle-Restore (`/api/admin/archive/bundles/import`) — Entry-Pfade (`rel`) werden gegen `..`
  geguarded (Z.311). `month`/`customerId` aus dem Manifest sind nicht separat validiert, aber
  das Bundle ist **AES-GCM-authentifiziert** (extern nicht fälschbar) und die eigentlichen
  Pfad-Inputs sind geschützt → kein extern ausnutzbarer Traversal.

**Fazit:** Autorisierung und Datei-Pfad-Handling sind durchgängig konsistent und sicher.

---

## Iteration 17 — Business-Logik & Access-Control-Funktionen (kein neuer Bug)

- **Datum/Uhrzeit:** 2026-06-24 22:47 CEST

- `apps/api/src/cockpit/transitions.ts` — Audit-Aktivierung: korrekte State-Machine (nur aus
  `draft`/`imported`, 409 bei `active`/falschem Status, 422 bei Gate-Failures).
  `checkActiveGate` verlangt Audit-Plan **mit** `kickoff_at` + `audit_owner` **und** ≥1
  in-scope-Item. Suggestion-Deprecate ist auf `customer_id` + `framework_id` gescoped
  (kein IDOR) und prüft `canAccessCustomer`.
- `apps/api/src/customers/access.ts` — alle Zugriffsfunktionen korrekt:
  - `canAccessCustomer`/`canAccessAssessment` — Creator **oder** aktive Share **oder** Admin,
    mit `archived_at is null`-Filter.
  - `canManageCustomerAccess` — nur Creator/Admin (keine geteilten Nutzer).
  - `customerAccessRecipients` — Creator + aktive Shares (`revoked_at is null`), per `union`
    dedupliziert, auf `customer_id` gescoped → **kein Notification-Leak** an Unbefugte/revozierte
    Shares.
- `notifyScopeChange` schließt den auslösenden Actor korrekt aus der Empfängerliste aus.

---

## Bug #7 — IDOR: Stuck-Thresholds fremder Assessments änderbar ✅ ERLEDIGT (verifiziert 2026-06-24)

- **Datum/Uhrzeit:** 2026-06-24 23:09 CEST
- **Datei:** `apps/api/src/cockpit/adminThresholds.ts` (`PUT /api/assessments/:id/stuck-thresholds`)
- **Schweregrad:** Mittel (IDOR / fehlender Objekt-Zugriffscheck)

### Beschreibung
Der Endpoint war nur über `requireCsrfPermission("assessment.edit")` gegated — die Permission
prüft, **ob** ein Nutzer Audits bearbeiten darf, aber **nicht**, ob er auf *dieses konkrete*
Assessment zugreifen darf. Ein `canAccessAssessment`-Check fehlte vollständig (die ganze Datei
hatte 0 Objekt-Zugriffschecks).

Folge: Jeder authentifizierte Nutzer mit `assessment.edit` konnte die `stuck_thresholds`
**beliebiger** Assessments setzen — auch solcher **anderer Kunden**, auf die er keinen Zugriff
hat. Das beeinflusst die „Stuck-Audit"-Erkennung im Cockpit (`evaluateStuck`) fremder Audits und
verrät über 404-vs-200 die Existenz von Assessment-IDs. Alle Schwester-Endpoints (reports,
secure, audit-center, workflow) prüfen `canAccessAssessment` — hier war es ein Versäumnis.

### Behebung
`canAccessAssessment(request.user!, request.params.id)` wird jetzt als erster Schritt im Handler
geprüft; bei fehlendem Zugriff `404 ASSESSMENT_NOT_FOUND` (kein 403 → verrät die Existenz
nicht). Import von `canAccessAssessment` aus `../customers/access.js` ergänzt. Die übrigen
Routen der Datei (`/api/admin/frameworks/...`) sind korrekt `settings.manage`-gated und
operieren auf globalen Framework-IDs (kein per-Kunde-Check nötig).

### Verifikation
- `npx tsc --noEmit` im `apps/api`-Projekt: keine Fehler (exit 0).
- Konsistent mit dem Zugriffsmuster aller anderen assessment-scoped Endpoints.

---

## Bug #8 — Nested IDOR in Risk-Finding-Links (Read-Leak + Write) ✅ ERLEDIGT (verifiziert 2026-06-24)

- **Datum/Uhrzeit:** 2026-06-24 23:32 CEST
- **Datei:** `apps/api/src/workflow/links.ts` (alle 4 Handler)
- **Schweregrad:** Mittel–Hoch (IDOR mit Daten-Leak)

### Beschreibung
Alle vier Endpoints (`GET …/risks/:riskId/findings`, `GET …/findings/:findingId/risks`,
`POST …/risks/:riskId/findings`, `DELETE …/risks/:riskId/findings/:findingId`) prüften
`canAccessAssessment(:id)` — aber **keiner** verifizierte, dass die per Pfad/Body referenzierte
**Risk/Finding tatsächlich zum Assessment `:id` gehört**.

Folge (nested IDOR): Ein Nutzer mit Zugriff auf Assessment A konnte sein zugängliches
`:id = A` zusammen mit einer `riskId`/`findingId` aus Assessment B (anderer Kunde) übergeben:
- **GET**: liest Titel/Status/Priorität/Rating der mit B's Risk/Finding **verlinkten** Findings/
  Risks → **Daten-Leak** über fremde Audits.
- **POST/DELETE**: legt Links in fremden Assessments an bzw. löscht sie → unautorisierte Writes.

Die UUIDs sind zwar nicht erratbar, aber einmal bekannte IDs (z. B. nach entzogenem Share)
genügen. Alle anderen Sub-Resource-Handler (findings/risks/reports/scope/contacts) verifizieren
die Parent-Zugehörigkeit (`before.assessmentId === :id` bzw. `… and assessment_id = $2` im
SQL) — in diesem File fehlte es durchgängig.

### Behebung
Zwei Helfer ergänzt — `riskBelongsToAssessment` / `findingBelongsToAssessment` (prüfen
`id = $1 and assessment_id = $2`). In jedem Handler wird nach `canAccessAssessment` zusätzlich
verifiziert, dass die referenzierte Risk (Pfad) bzw. Finding (Pfad/Body) zum Assessment gehört;
sonst `404` (kein 403 → verrät Existenz nicht). Beim POST werden **beide** Enden geprüft.

### Verifikation
- `npx tsc --noEmit` im `apps/api`-Projekt: keine Fehler (exit 0).
- Konsistent mit dem Parent-Scoping-Muster aller anderen Sub-Resource-Endpoints.

### Hinweis zum IDOR-Sweep
Eine erschöpfende programmatische Prüfung aller `:id`-Routen bestätigte: nach #7 und #8 haben
**alle** per-Object- und Sub-Resource-Endpoints einen Objekt-Zugriffscheck (canAccess +
Parent-Scoping) oder sind admin/permission-gegatet bzw. No-op-410. Die IDOR-Klasse ist
vollständig abgedeckt.

---

## Iteration 20 — Status-Transition-Graphen (kein Fix; 1 Beobachtung)

- **Datum/Uhrzeit:** 2026-06-25 00:00 CEST

`apps/api/src/workflow/transitions.ts` geprüft — alle Graphen + Validatoren korrekt:
- `isLegalFindingTransition`/`isLegalRiskTransition`/`isLegalRoadmapTransition`: Self-Transition
  erlaubt, unbekannter Quellstatus blockt alle Übergänge, terminale Zustände korrekt.
- `phaseDatesFor` (NaN-Anchor-Guard) und `normalisePhaseLabel` (Legacy-Label-Mapping, keine
  falschen Substring-Matches): korrekt.

### Beobachtung #5 — Transition-Validierung wird inkonsistent erzwungen
- `isLegalFindingTransition` wird **nur** beim **Single**-Finding-Update erzwungen
  (`workflow/routes.ts:530`).
- Das **Bulk**-Finding-Update (`workflow/routes.ts` ~Z.604) setzt `status = coalesce($3, status)`
  **ohne** Graph-Prüfung.
- `isLegalRiskTransition` ist importiert (`workflow/routes.ts:14`), hat aber **null
  Aufrufstellen** — Risk-Status-Updates umgehen den Graphen.
- `isLegalRoadmapTransition` ist definiert, wird aber **nirgends** genutzt.

Folge: Ein edit-berechtigter Nutzer kann (innerhalb seines zugänglichen Assessments) Risk-/
Roadmap-/Bulk-Finding-Status auf Werte setzen, die der „autoritative" Graph verbietet (z. B.
Risk `closed`→`accepted`). **Kein Security-/Crash-Risiko** (Zugriff überall geprüft, Werte per
Zod-Enum begrenzt) — reine Workflow-Integrität. Bewusst **nicht** autonom geändert: das
Nachrüsten der Validierung ändert das Verhalten und könnte UI-Flows brechen, die der Graph
verbietet → mit Frontend-Abgleich/Test umsetzen (oder den ungenutzten Import entfernen, falls
die Lockerung gewollt ist).

---

## Iteration 21 — Portal-Token-Scoping & Evidence-IDOR (kein neuer Bug)

- **Datum/Uhrzeit:** 2026-06-25 00:21 CEST

- `apps/api/src/customerAck/routes.ts` — öffentliche Portal-Endpoints (`/api/portal/ack/:token*`):
  nehmen **nur** `:token`, exponieren den **pinned snapshot** (zum Issue-Zeitpunkt eingefroren,
  keine attacker-kontrollierbaren IDs, kein Live-Join) → strukturell auf das Token-Assessment
  gescoped. Status-Gating (revoked/expired/redeemed → 410), Rate-Limit, Receipt nur nach
  Redemption. Branding ist global/nicht-sensibel. **Kein Cross-Assessment-Leak.**
- `apps/api/src/evidence/routes.ts` — List/Download/Delete prüfen `canAccessAssessment` **und**
  `where id = $1 and assessment_id = $2` (Parent-Scoping). Kein Download-/Delete-IDOR — genau
  das Muster, das in `links.ts` (#8) fehlte und dort nachgerüstet wurde.

---

## Iteration 22 — Connector-Secret-Handling (kein neuer Bug; 1 Minor-Beobachtung)

- **Datum/Uhrzeit:** 2026-06-25 00:43 CEST

- `apps/api/src/connectors/routes.ts` — Secrets werden **nie** an Clients zurückgegeben:
  `publicConnector` baut die Response feldweise (kein `...row`-Spread) und exponiert nur
  `hasSecrets`-Booleans (Anwesenheit, nicht Wert). Secrets werden encrypted gespeichert,
  beim Senden nur in den `Authorization`-Header gelegt. Fehlermeldungen stammen aus
  `providerFetch` (truncated Provider-Body) / SSRF-Guard — keine Secrets/URLs.

### Minor-Beobachtung #6 (sehr niedrige Severity, nicht geändert)
Bei einem Netzwerkfehler eines **Webhook**-Connectors (Slack/Teams — dort ist die `webhookUrl`
selbst das Secret) könnte Node-`fetch` die Ziel-URL in `err.cause` führen, die via
`log.error({ err, … })` (Z.572) in die Applikations-Logs gelangt. In der Praxis ist
`err.message` (was in `last_message`/DB landet) meist nur „fetch failed" ohne URL; Logs und
`last_message` sind ohnehin nur für Operatoren/Admins einsehbar, die die Secrets selbst gesetzt
haben → **kein extern ausnutzbarer Leak**. Sanitisierung wäre komplex und niedrigwertig.

---

## Bug #9 — Frontend: Stale-Response-Race in Finding-/Risk-Detail-Panels ✅ ERLEDIGT (verifiziert 2026-06-25)

- **Datum/Uhrzeit:** 2026-06-25 01:05 CEST
- **Dateien:** `apps/web/src/pages/workflow/AssessmentWorkflowPage.tsx` (2 Effects),
  `apps/web/src/pages/workflow/FindingSlideover.tsx` (1 Effect)
- **Schweregrad:** Niedrig (UX / falsche transiente Anzeige)

### Beschreibung
Die `useEffect`-Hooks, die beim Wechsel der Auswahl (`selectedFinding?.id` / `selectedRisk?.id`
bzw. das `finding`-Prop des Slideovers) die History + Comments nachladen, hatten **keinen
Stale-Response-Guard**. Klickt ein Nutzer schnell Finding A und dann B, kann die langsamere
Antwort von A **nach** der von B eintreffen und `setFindingHistory`/`setComments` mit A's Daten
überschreiben → es wird A's History/Comments unter dem ausgewählten B angezeigt. Andere Stellen
der Codebasis (`CustomerContextProvider`, `NextActionBell`) nutzen konsistent `cancelled`-Guards;
diese drei Effects fehlten.

### Behebung
In allen drei Effects ein `let cancelled = false;` eingeführt, alle `setState`-Aufrufe in
`if (!cancelled)` gekapselt und `return () => { cancelled = true; };` als Cleanup ergänzt — so
ignoriert ein veraltetes Response (oder dessen Fehler) sein Ergebnis, sobald die Auswahl
gewechselt hat. Verhaltensneutral außer dem Verwerfen stale Antworten.

### Verifikation
- `npx tsc --noEmit` im `apps/web`-Projekt: keine Fehler (exit 0).

### Nicht geändert
`pages/customers/phases/PhaseLayout.tsx:50` (deps `[id]`) hat dasselbe Muster, aber der
`id`-Wechsel entspricht einer vollen Customer-Navigation (Remount, kein schnelles Toggeln) →
deutlich geringere Race-Wahrscheinlichkeit; zudem birgt ein Eingriff dort Risiko für die
Audit-Auto-Auswahl-Logik. Bewusst belassen.

### Nachtrag (Iteration 24): vierte Instanz derselben Klasse behoben
`apps/web/src/components/AppLayout.tsx` — Command-Palette-Suche (`/api/command-palette`):
Der 120ms-Debounce cancelt nur den *pending* Timer; eine bereits laufende Fetch für eine
ältere Query konnte bei langsamem Netz nach einer neueren auflösen und die Suchergebnisse
überschreiben (stale Treffer beim Tippen). Gleicher `cancelled`-Guard ergänzt. `tsc` grün.
Damit ist die Stale-Response-Race-Klasse in allen auswahl-/eingabe-getriebenen Fetch-Effekten
abgedeckt (übrige Kandidaten: stabile Deps wie `[token]` oder Mount-only, kein Race).

---

## Iteration 25 — Deep-Links ↔ Routen (kein neuer Bug; 1 Beobachtung)

- **Datum/Uhrzeit:** 2026-06-25 01:51 CEST

### Geprüft und konsistent
- Alle backend-generierten Deep-Links (`cockpit/actions.ts` etc.) matchen Frontend-Routen:
  `/customers/:id/{controls,findings,report}`, `/customers/:id`, `/admin/{connectors,workbench}`,
  `/customers/my`. `/portal/ack/:token/receipt` ist ein direkter API-Link (Receipt-PDF). Keine
  kaputte Navigation.
- Alle Filter-Query-Werte werden vom Frontend erkannt: `remediation_overdue`/`response_pending`
  (FindingsPhasePage), `contradiction`/`ready_for_review` (ControlsPhasePage).

### Beobachtung #7 — Deep-Link-Param `tab=requests` wird ignoriert
Der Cockpit-Deep-Link für **überfällige Evidence-Requests**
(`/customers/:id/controls?audit=…&tab=requests`, `cockpit/actions.ts`) übergibt `tab=requests`.
`ControlsPhasePage.tsx` liest aber `focus` (Z.20) — **und verwendet diesen Wert nirgends**
(dead read) — und liest `tab` gar nicht. Folge: Der „Next Action"-Button navigiert korrekt zur
Controls-Seite, fokussiert aber **nicht** auf die überfälligen Evidence-Requests (diese liegen
dort per-Control; es existiert keine Requests-Fokus-Ansicht). Kein sauberer Ein-Zeilen-Fix
(Param-Rename hilft nicht, da `focus` ungenutzt ist) — benötigt eine UX-Entscheidung/Frontend-
Feature (Requests-Fokus implementieren oder das `focus`-Feature reaktivieren). Bewusst **nicht**
autonom geändert.

---

## Iteration 26 — Public-API-Token-Feature (kein Bug; 1 Beobachtung)

- **Datum/Uhrzeit:** 2026-06-25 02:14 CEST

### Beobachtung #8 — „Public API Tokens" sind unvollständig (Tokens werden nie validiert)
`apps/api/src/productivity/routes.ts` bietet Verwaltung für `public_api_tokens`:
- **Create** (`POST /api/admin/productivity/api-tokens`) — generiert `audity_<random>`, speichert
  `sha256`-Hash + 14-Zeichen-Prefix + `scopes`, gibt das Roh-Token **einmalig** zurück. Sauber.
- **List** (Metadaten, ohne Hash) und **Revoke** (`revoked_at = now()`).

Aber: **Es gibt nirgends einen Konsumenten/Validator.** Eine codebasis-weite Suche findet keinen
`where token_hash = …`-Lookup auf `public_api_tokens`, keine Auth-Middleware, die ein
präsentiertes Token prüft, und **keine `scopes`-Durchsetzung**; es existiert auch keine separate
Public-API-Surface. Die geminteten Tokens gewähren also **keinerlei Zugriff**.

**Einordnung:** Kein Security-Bug (ein geleaktes Token ist wertlos; Storage ist korrekt
gehasht), sondern eine **unvollständige/irreführende Funktion** — Admins können „API-Tokens"
erzeugen, die nirgends funktionieren. Vermutlich bewusst (Management-UI vor der eigentlichen
Public API ausgeliefert). **Hinweis für die spätere Implementierung des Validators:** zwingend
`revoked_at is null` **und** `expires_at is null or expires_at > now()` prüfen, `last_used_at`
aktualisieren und die gespeicherten `scopes` durchsetzen. Bewusst nicht autonom implementiert
(wäre Feature-Arbeit, kein Bugfix).

---

## Iteration 27 — Legal Holds & Retention Policies (kein Bug; 1 Beobachtung)

- **Datum/Uhrzeit:** 2026-06-25 02:37 CEST

### Beobachtung #9 — Legal Holds / Retention Policies werden nicht durchgesetzt (Compliance)
`apps/api/src/productivity/routes.ts` verwaltet `legal_holds` (Create mit `status='active'`-Default,
List) und `retention_policies` (Create, List), aber:
- **Kein Enforcement:** `legal_hold` kommt codebasis-weit **nur** in productivity/routes.ts vor.
  Weder der Customer-Delete (`customers/routes.ts`) noch die Archivierung (`archive/service.ts`)
  prüfen auf einen aktiven Legal Hold. Ein Admin kann also einen Kunden/ein Assessment **trotz**
  aktivem Legal Hold löschen/archivieren — was den Zweck des Compliance-Features unterläuft.
- **Kein Release-Endpoint** für Legal Holds (nur Create/List) und **kein automatischer
  Retention-Purge-Job**, der `retention_policies` durchsetzt. (Die `retention_days` in
  `admin/routes.ts` betreffen ein anderes Konzept — System-/Backup-Retention.)

**Einordnung:** Kein Auto-Datenverlust-Risiko (es gibt keinen Purge-Job), aber eine
compliance-relevante Lücke — gleiche „Management-UI ohne Enforcement"-Klasse wie #8 (zusammen
ein kohärenter Satz unvollständiger Data-Governance-Features, konsistent mit dem Alpha-Stadium).
**Empfohlener Fix (koordiniert, nicht blind):** vor Delete/Archive von Customer/Assessment
`select 1 from legal_holds where (customer_id=$1 or assessment_id=$2) and status='active' and (expires_at is null or expires_at > now())`
prüfen → 409 blocken; **plus** Release-Endpoint (sonst werden Kunden unter Hold dauerhaft
un-löschbar). Bewusst **nicht** autonom erzwungen, da isolierte Teil-Durchsetzung ohne
Release-Mechanismus operative Probleme schafft.

---

## Bug #10 — Ungültiges Datum in Risk/Roadmap-Feldern → 500 statt 400 ✅ ERLEDIGT (verifiziert 2026-06-25)

- **Datum/Uhrzeit:** 2026-06-25 03:00 CEST
- **Datei:** `apps/api/src/workflow/routes.ts` (riskSchema/roadmapSchema/bulkRiskSchema)
- **Schweregrad:** Niedrig (Defensive / Robustheit — nicht via UI triggerbar)

### Beschreibung
`dueDate` und `acceptanceExpiresAt` waren als `z.string().nullable().optional()` validiert —
**ohne** Datumsprüfung. Die Werte fließen in SQL-Casts `nullif($, '')::date`
(z. B. Z.993/999/1095). Ein nicht-leerer, **ungültiger** Datums-String (z. B. `"2026-13-45"`
oder Freitext via direktem API-Call) lässt den `::date`-Cast werfen → Postgres-Fehler →
**500** statt eines sauberen **400**.

Über die UI nicht auslösbar (`<input type="date">` liefert nur `YYYY-MM-DD` oder leer; ein
untouched ISO-Datetime aus der API wird von `::date` toleriert) — also eine defensive Lücke im
API-Vertrag. (Der ältere Risk-CSV-Import mit demselben Cast ist **toter Code**, `if (false)`,
und der Route-Endpoint gibt `410 FEATURE_REMOVED` — kein Live-Pfad.)

### Behebung
Wiederverwendbarer Validator `optionalDateString` ergänzt:
```ts
const optionalDateString = z.string()
  .refine((v) => v === "" || !Number.isNaN(Date.parse(v)), { message: "Invalid date" })
  .nullable().optional();
```
Bewusst **lenient** (akzeptiert sowohl `YYYY-MM-DD` als auch ISO-Datetime → **kein Regression**
für legitime Frontend-Werte), blockt aber un-parsebaren Müll → sauberes 400. Angewandt auf alle
`dueDate`/`acceptanceExpiresAt`-Felder der Risk-/Roadmap-/Bulk-Schemas.

### Verifikation
- `npx tsc --noEmit` im `apps/api`-Projekt: keine Fehler (exit 0).
- Grep bestätigt: keine ungeschützten Datumsfelder mehr in `workflow/routes.ts`.

### Iteration 29 — vollständiger Sweep der Klasse
`optionalDateString` in den Shared-Util `apps/api/src/utils/validation.ts` verschoben (DRY) und
auf **alle** Datumsfelder der API angewandt, die in date-/`::date`-Spalten fließen:
- `workflow/routes.ts` — risk/roadmap/bulk (jetzt via Import).
- `audit-center/routes.ts` — `kickoffAt`, `fieldworkStart`/`fieldworkEnd`, `reportDueDate`,
  `closureDueDate`, evidence-request `dueDate`, `interviewAt`, `remediationDueDate`,
  report-review `dueDate`.
- `productivity/routes.ts` — workbench `dueDate`, automation `nextRunDate`, legal-hold/api-token
  `expiresAt`.
- `assessments/routes.ts` — `targetDate`.
- `npx tsc --noEmit` exit 0; Grep bestätigt: **keine** ungeschützten Datumsfelder mehr in der
  gesamten `apps/api`. Klasse vollständig abgedeckt.

---

## Iteration 30 — Numerische Validierung & Risk-/Severity-Scoring (kein neuer Bug)

- **Datum/Uhrzeit:** 2026-06-25 03:52 CEST

- `workflow/routes.ts` — `likelihood`/`impact` via `z.number().int().min(1).max(5)`,
  `frameworks/routes.ts` control-`score` via `z.number().int().min(0).max(5)`: sauber validiert.
- `ratingFor(likelihood=1, impact=1)` (`workflow/suggestions.ts`) — NaN-sicher (Default-Params);
  die Handler lösen fehlende Werte mit `body.x ?? before.x ?? 3` auf → kein `undefined*undefined`.
  Create verlangt valide 1–5 (sonst 400 `INVALID_RISK_SCORE`).
- **Severity-Bänder vereinheitlicht (20/14/7)** über Risk-Rating (`ratingFor`),
  Finding-Severity (`audit-center/routes.ts:184`) und Customer-Portal
  (`customerAck/tokens.ts:164`) — gleiches L×I ergibt überall denselben Tier. Ein früherer
  Band-Bug (20/12/5, der 5/6/12/13 fehl-labelte) ist laut Code-Kommentar bereits behoben.

---

## Iteration 31 — Pagination & Cache-Key-Scoping (kein neuer Bug)

- **Datum/Uhrzeit:** 2026-06-25 04:15 CEST

- `cockpit/inboxPagination.ts` `paginate` — korrekte Cursor-Pagination: stabiler **Total-Order**-
  Sort (severity→overdueBy→customerId→**id** als eindeutiger Tiebreaker), strikter Cursor-Filter
  (`compareCursors(...) > 0` → kein Duplikat des Cursor-Items), `hasMore`/`nextCursor` korrekt →
  keine übersprungenen/duplizierten Items an Seitengrenzen. `decodeCursor` (Iter. 7) ist
  try/catch- + typvalidiert.
- `cockpit/routes.ts` — beide Redis-Cache-Keys sind **user-scoped**: Cockpit-Payload
  `cockpitCacheKey(id, user.sub)` (per Customer+User), Inbox-Actions
  `inboxCacheKey(user.sub):overdue=…` (per User+Filter). `deriveNextActions(user)` respektiert
  den Nutzer-Zugriff → **kein Cross-User-Cache-Leak**. Pagination-`limit` via `Number.isFinite`
  + `Math.min/max` geklammert.

---

## Iteration 32 — Brute-Force-Abwehr, Rate-Limit & Proxy/IP-Handling (kein neuer Bug)

- **Datum/Uhrzeit:** 2026-06-25 04:37 CEST

- `auth/service.ts` — Passwort-Login: Dummy-`argon2.verify` mit `timingEqualizerHash()` für
  nicht-existente/disabled Accounts (kein Timing-Enumeration), argon2 = konstanter Zeitvergleich,
  generische Fehlermeldung „Invalid email or password" (kein Content-Enumeration).
- `auth/routes.ts` — `authRateLimit = {max:5, timeWindow:"1 minute"}` auf Login/Setup/MFA-Setup/
  MFA-Challenge/Recovery-Verify; refresh 120/min; global 200/min. Strikter, angemessener
  Brute-Force-Schutz (kein Account-Lockout — bewusste Wahl, vermeidet Lockout-DoS).
- `server.ts:64` — `trustProxy: "loopback, linklocal, uniquelocal"`: vertraut X-Forwarded-For
  **nur** von privaten/Loopback-Adressen (dem nginx-Container), nicht von externen Clients
  (kein IP-Spoofing). nginx (`web/nginx/default.conf.template`) setzt `X-Forwarded-For`/
  `X-Real-IP`. ⇒ `request.ip` ist die **echte Client-IP** → per-IP-Rate-Limit, Audit-Log-IPs,
  Console-Grant-IP-Binding und CSRF-Origin-Check arbeiten korrekt (kein Proxy-IP-Kollaps).

---

## Iteration 33 — Session-/Cookie-Sicherheit & Token-Rotation (kein neuer Bug)

- **Datum/Uhrzeit:** 2026-06-25 04:59 CEST

- `auth/routes.ts` `setRefreshCookie` — Refresh-Cookie vorbildlich konfiguriert:
  `httpOnly:true` (kein XSS-Diebstahl), `sameSite:"strict"` (CSRF), `secure` an HTTPS gekoppelt,
  `path:"/api/auth"` (Exposition minimiert), `maxAge` = Token-TTL; `clearCookie` mit passendem
  Path beim Logout.
- `auth/service.ts` `refreshSession` — **Refresh-Token-Rotation**: alte Session wird revoked,
  neue mit frischem Token erstellt (Single-Use; ein gestohlener/wiederverwendeter Token schlägt
  fehl, da die Query `revoked_at is null` verlangt). Tokens sind via `hashRefreshToken` gehasht
  gespeichert (kein Klartext in der DB). Logout/`revokeRefreshToken` revoken korrekt.

### Hinweis zum Audit-Fortschritt
Iterationen 30–33 (Scoring, Pagination, Cache-Scoping, Brute-Force/Proxy, Session/Cookie) haben
alle Korrektheit bestätigt. Die security- und logik-kritische Oberfläche ist sehr umfassend
geprüft; die Rendite weiterer Durchgänge ist niedrig (Stand: 10 behobene Bugs, 9 Beobachtungen).

---

## Iteration 34 — Maintenance-Console-Session (kein autonom behebbarer Bug; 1 Beobachtung)

- **Datum/Uhrzeit:** 2026-06-25 05:21 CEST

### Beobachtung #10 — `ConsoleSession` ist implementiert, aber nicht verdrahtet
`apps/api/src/console/session.ts` implementiert eine `ConsoleSession`-Klasse (Insert in
`console_sessions`, size-capped Transcript, Start/End-Audit-Events und eine Benachrichtigung an
**alle Instance Admins** „Maintenance console session started", laut Docstring „so console use is
never silent"). Aber: `new ConsoleSession`, `.begin()`, `.end()`, `.record()` haben **keine
Call-Sites** — die Klasse wird nie instanziiert. Gleiches „gebaut, aber nicht verdrahtet"-Muster
wie #8/#9.

**Folge:** Die proaktive „Console geöffnet"-Benachrichtigung an alle Admins und die
Session-Transcript-Zeile entstehen nie. **Aber:** Die **Per-Command-Auditierung**
(`console.command` via `appendActivityEvent` im `/run`-Handler) läuft separat und funktioniert —
ausgeführte Befehle sind also im Activity-Log protokolliert (kein Audit-Gap, nur die proaktive
Push-Benachrichtigung fehlt). Severity daher niedrig–moderat.

**Latenter Code-Bug darin (Z.54):** `this.chunks.push(direction === "in" ? data : data)` — beide
Ternary-Zweige sind identisch (`data : data`, ein No-Op), obwohl der Kommentar „Prefix input
lines" verspricht. Folgt nur, wenn `record()` jemals verdrahtet wird.

**Empfehlung (nicht autonom umgesetzt — security-kritischer Flow, nicht testbar):**
`ConsoleSession` im authorize-Endpoint instanziieren + `begin()`, die Session-ID im Grant-Payload
(Redis) ablegen, im `/end`-Endpoint `end()` aufrufen, und den Input-Präfix in `record()`
definieren.

---

## Iteration 35 — i18n & WorkflowProgress (kein neuer Bug)

- **Datum/Uhrzeit:** 2026-06-25 05:44 CEST

- `apps/web/src/i18n.ts` — `translate(label) = translations[lang]?.[label] ?? label`: graceful
  Fallback auf das (englische) Label, **keine Roh-Key-Anzeige** bei fehlender Übersetzung.
  Label-basiert (Key = englischer Text), Englisch-Map leer. Minimal, aber korrekt.
- `apps/web/src/components/ui/WorkflowProgress.tsx` — `completed = steps.filter(done).length`,
  Anzeige `X / Y steps`; keine Division/Prozent → keine Div-durch-Null. Korrekt.

---

## Iteration 36 — Schema-Konsistenz: `on conflict`-Targets vs. Constraints (kein neuer Bug)

- **Datum/Uhrzeit:** 2026-06-25 06:06 CEST

Alle `insert … on conflict (cols)`-Klauseln im Code gegen die Migrations-Constraints geprüft —
**jede** hat einen passenden Unique-Constraint/PK (sonst Runtime-Fehler „no unique or exclusion
constraint matching the ON CONFLICT specification"):
- `risk_finding_links (risk_id, finding_id)` → `primary key (risk_id, finding_id)`.
- `customer_frameworks (customer_id, framework_id)` → composite PK.
- `audit_control_profiles (assessment_id, assessment_question_id)` → `unique (…)` (001:878).
- `control_answers (assessment_question_id)` / `question_control_mappings (…)` → unique indexes.
- `roles (name)` / `permissions (name)` → `text not null unique`; `settings (key)` → PK;
  `(id)`-Targets → Primary Keys.
- Schema↔Code konsistent.

---

## Bug #11 — Kunden mit E-Mail-/Archiv-Historie konnten nicht gelöscht werden (FK-Violation) ✅ ERLEDIGT (verifiziert 2026-06-25)

- **Datum/Uhrzeit:** 2026-06-25 06:29 CEST
- **Datei:** `apps/api/src/customers/routes.ts` (`DELETE /api/customers/:id`)
- **Schweregrad:** Mittel (Daten-Integrität / Usability — Löschen schlägt mit 500 fehl)

### Beschreibung
Der Handler löschte den Kunden mit einem einzelnen `delete from customers where id = $1` und
verließ sich auf ON-DELETE-CASCADE. `assessments` cascadet von `customers` (001:117) und
`reports` von `assessments`. **Aber** drei FKs haben **kein** Cascade:
- `email_delivery_log.assessment_id → assessments(id)` (001:327)
- `email_delivery_log.report_id → reports(id)` (001:326)
- `archive_index.customer_id` / `archive_restore_requests.customer_id → customers(id)`
  (001:1067/1085)

Folge: Sobald für ein Assessment des Kunden je ein Report **gemailt** wurde (Zeile in
`email_delivery_log`) oder der Kunde **archiviert** war, blockierte die FK-Constraint die
Cascade — `delete from customers` schlug mit „update or delete … violates foreign key
constraint" fehl → **500, Kunde un-löschbar**.

### Behebung
Der Delete läuft jetzt in **einer Transaktion** mit Vorab-Cleanup der Nicht-Cascade-Referenzen:
`email_delivery_log.{assessment_id,report_id}` werden auf `null` gesetzt (Compliance-Log bleibt
erhalten), `archive_restore_requests`/`archive_index` des Kunden gelöscht, dann
`delete from customers` (cascadet den Rest). Bei Fehler `rollback`.

### Verifikation
- `npx tsc --noEmit` im `apps/api`-Projekt: keine Fehler (exit 0).
- Bewusst als **Handler-Fix** statt Schema-Migration umgesetzt: der Migrations-Runner führt alle
  `.sql` bei **jedem Boot** aus → eine fehlerhafte FK-Migration hätte hohen Blast-Radius
  (Startup-Bruch), nicht testbar. **Follow-up-Empfehlung:** zusätzlich die FKs per Migration auf
  `on delete set null` (email_delivery_log) bzw. `on delete cascade` (archive-Tabellen) setzen,
  damit auch ein direkter Assessment-/Report-Delete abgedeckt ist.

---

## Durchgang — Abarbeitung der „bewusst NICHT geänderten" Beobachtungen (#1–#11)

- **Datum/Uhrzeit:** 2026-06-25
- **Kontext:** Systematische Abarbeitung der zuvor mit „Kontext/Entscheidung nötig" markierten
  Punkte. Verhaltensändernde/feature-artige Punkte wurden vorab mit dem Nutzer abgestimmt.
- **Verifikation gesamt:** `npx tsc --noEmit` in `apps/api` **und** `apps/web` jeweils exit 0.

1. **Evidence-Restore-Bucket-Wipe (`apps/worker/src/worker.ts`)** — *kein Bug.* Der Snapshot
   (`listEvidenceObjects`, kein Prefix-Filter) erfasst den **ganzen** Bucket; der Restore-Wipe ist
   korrekte Full-PIT-Semantik + Pre-Restore-Safety-Backup. Nur **klärender Kommentar** ergänzt
   (Invariante: Wipe nur sicher, solange der Snapshot bucket-weit ist).

2. **EventSource-Token im URL-Query (`AppLayout.tsx` + `notifications/routes.ts`)** — neuer
   `GET /api/notifications/stream-ticket` (Bearer-auth) mintet ein 60s-`purpose:"notif_stream"`-Ticket;
   der Stream verifiziert nur noch dieses Ticket. **Bonus:** `verifyAccessToken` lehnt jetzt jedes
   purpose-behaftete Token ab (schließt MFA-Challenge-als-Access-Token-Lücke). Frontend mit Stale-Guard.

3. **Customer-Ack-Redemption-Atomarität (`customerAck/routes.ts` + `tokens.ts`)** — `markTokenRedeemed`
   nimmt jetzt einen optionalen Executor; Claim + `audit_signoffs`-Insert laufen in **einer
   Transaktion** (kein verbranntes Token ohne Sign-off mehr). Claim bleibt atomar (1 Winner).

4. **Archiv-DB-Updates (`archive/service.ts`)** — `archiveCustomer` (customers/assessments/archive_index)
   und `approveRestoreRequest` (4 Writes) klammern ihre DB-Writes nach der FS-Operation jeweils in
   **eine Transaktion** → kein halb-archivierter/orphaned Zustand.

5. **Transition-Validierung (`workflow/routes.ts`)** — Graph-Check (`isLegalRiskTransition` /
   `isLegalRoadmapTransition`) bei **Risk- und Roadmap-Single-PUT** ergänzt (422 bei illegalem
   Übergang). Bulk bewusst unverändert (Nutzer-Entscheidung). `isLegalRoadmapTransition` jetzt importiert/genutzt.

6. **Webhook-URL in Logs (`connectors/routes.ts`)** — Auto-Sync-Fehler loggen nur noch
   `name/message/stack`, nie das rohe Error-Objekt (vermeidet Serialisierung der `cause`, die die
   Webhook-URL echoen könnte). Niedrige Severity.

7. **Deep-Link `tab=requests` (`ControlsPhasePage.tsx`)** — Seite liest jetzt `tab`; bei
   `tab=requests` werden Controls auf solche mit **überfälligen** Evidence-Requests gefiltert
   (Banner + Clear-Link). Toter `focus`-Read entfernt. Nutzt vorhandene Daten, kein neuer Endpoint.

8. **Public API Tokens ohne Validator** — neues Modul `publicApi/routes.ts`: `requireApiToken(scope)`
   (Bearer `audity_…` → sha256-Lookup, revoked/expired/scope-Enforcement, `last_used_at`-Bump) +
   read-only Surface `GET /api/public/v1/{customers,assessments}`. Tokens gewähren jetzt echten Zugriff.

9. **Legal Holds ohne Enforcement** — Helper `customerHasActiveLegalHold`; Customer-**Delete** und
   **Archive** blocken mit **409** bei aktivem Hold (Customer oder dessen Assessments). Neuer
   **Release-Endpoint** `POST /api/admin/productivity/legal-holds/:id/release`. (Kein direkter
   Assessment-Delete vorhanden → via Customer-Cascade abgedeckt.)

10. **ConsoleSession nicht verdrahtet (`console/`)** — voll verdrahtet: `begin()` bei `authorize`
    (console_sessions-Row + Admin-Notification + `session_started` mit echter Session-ID),
    `appendConsoleTranscript` pro `/run`, `endConsoleSession` bei `/end`. Platzhalter-`entityId:"1"`
    durch echte Session-ID ersetzt; Duplicate-Notify/Event entfernt. **Latenter No-op Z.54**
    (`data : data`) auf Input-Prefixing korrigiert.

11. **Stale-Response-Guard (`phases/PhaseLayout.tsx`)** — `cancelled`-Guard im Daten-Lade-Effect
    ergänzt (analog Bug #9), damit eine späte Antwort nach Customer-Wechsel/Unmount die aktuellen
    Daten nicht überschreibt.

### Nachtrag #8 — Public-API Read-Surface ausgebaut (Phase 1+2)

- Granulare Scopes mit `read`-Alias (Bestandskompat): `read:customers`, `read:findings`,
  `read:evidence`, `read:reports`.
- Endpoints (alle read-only, feste Spalten-Whitelist, `?limit` cap 500):
  `GET /api/public/v1/customers[/:id]`, `/assessments[/:id]` (inkl. Framework-Scope),
  `/assessments/:id/{findings,risks,evidence,reports}`. Evidence/Reports nur **Metadaten**
  (kein `object_key`, kein Report-`content`).
- Frontend (`WorkbenchPage.tsx`): Scope-Checkbox-Auswahl statt hardcoded `["read","write"]`.
- Kein Write (bewusste Entscheidung). `tsc --noEmit` api+web exit 0.
