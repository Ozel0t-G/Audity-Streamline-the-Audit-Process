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

---

## Iteration 37 — Audit neuer/wenig geprüfter Module + 3 widerlegte Kandidaten (1 Robustheits-Fix)

- **Datum/Uhrzeit:** 2026-06-29 (Loop-Iteration 3)

Schwerpunkt diesmal: **kürzlich hinzugefügter / bisher nicht geprüfter Code**, da die
security-/API-Kernpfade über die vorherigen ~36 Iterationen erschöpfend abgedeckt sind.
Geprüft und **korrekt befunden**:

- **`apps/api/src/logArchive/*`** (komplettes neues Feature: `bundle.ts`, `service.ts`,
  `scheduler.ts`, `routes.ts`, `destinations/{local,sftp,s3,ftp,index}.ts`,
  Migration `009`): AES-256-GCM + HMAC-signiertes, hash-verkettetes Bundle (gleiche
  robuste Struktur wie `archive/bundle.ts`); `runLogArchive` mit
  `pg_try_advisory_xact_lock` + Transaktion; Watermark-Advance per stream-getrenntem
  `coalesce` (leerer Stream lässt seine Watermark stehen); Heartbeat-Run ohne
  Chain-Link; Secrets verschlüsselt gespeichert, nie im Public-View. Routes Instance-Admin-
  + CSRF-gegatet, Zod-`discriminatedUnion`. **Kein Bug.**
- **`apps/api/src/auth/encryptionKeyMeta.ts` + `printRecoveryPhrase.ts` + `auth/routes.ts`**
  (Refactor-Commit `64a16e7`, Phrase-Seal): `consumePhraseReveal` ist ein atomares
  Single-Reveal-UPDATE (`where phrase_revealed_at is null`); `refreshSession` wurde von
  SELECT-then-UPDATE auf ein atomares `update … returning` umgebaut — **behebt** ein
  latentes TOCTOU bei Refresh-Token-Reuse (Verbesserung). Der gelöschte HTTP-Endpoint
  `GET /api/auth/recovery-phrase` hat **keine** verbliebenen Frontend-Caller (nur
  `/fingerprint`, `/acknowledge`, `/verify` existieren noch und werden genutzt). **Kein Bug.**
- **`apps/worker/src/worker.ts`** (voller Durchgang, 1259 Z.): Backup/Restore-Transaktionen,
  Snapshot-Wipe-Invariante, `appendActivityEvent`-Kopie (Advisory-Lock + monotone TS) alle
  korrekt; `pg_dump`/`pg_restore`/`spawn` ohne Shell. **Kein Bug.**
- **`apps/console-runner`, `apps/updater`, console-Commands (`prune` etc.), `packages/shared`,
  `SetupPage.tsx`, `DashboardPage/DataTable/GuidedQuestionsPage` (localStorage-Parse)**:
  alle defensiv (try/catch + Fallback), Tokens konstant-zeitverglichen, `execFile` ohne Shell,
  `is_downloadable_zip` wird gesetzt. `AUDITY_VERSION="0.2.3"` ist konsistent über alle
  package.json + bewusster Dev-Fallback (`runtimeVersion()` nutzt zur Laufzeit `$AUDITY_VERSION`).
  Migrations-Dateinamen 3-stellig zero-padded → lexikografische `.sort()` == numerische
  Reihenfolge. **Keine Bugs.**

### Drei widerlegte Bug-Kandidaten (empirisch per Repro, nicht aus dem Bauch)

1. **console-runner `/pty` Auth-Bypass?** Vermutung: `preValidation` sendet 401 **ohne**
   `return reply` (anders als der Updater, der genau davor warnt) → Handler läuft trotzdem
   → unauth. PTY-Shell. **Widerlegt:** Mit Fastify **v5.8.5** + `@fastify/websocket` **v11.2.0**
   bricht `await reply.send()` den Lifecycle **auch ohne `return`** korrekt ab (Repro:
   `handlerRan=false`, 401, kein Upgrade). Kein Bypass.
2. **„send-without-return"-Bugklasse** (laut Updater-Kommentar) für normale HTTP-Routen?
   **Widerlegt:** Fastify v5 bricht auch bei HTTP-`preHandler` ohne `return` ab
   (Repro via `app.inject`: `handlerRan=false`). Der `return` im Updater ist harmlos, aber
   für v5 nicht nötig; **keine** solche Bugklasse in der Codebase.
3. **BullMQ-Worker-Crash bei Redis-Fehler** (kein `.on("error")`)? **Widerlegt:** BullMQ
   **v5.78.0** lässt einen unbehandelten Worker-`'error'` **nicht** als
   `uncaughtException`/`unhandledRejection` durchschlagen (Repro: `tripped process handler:
   false`) → **kein** `process.exit(1)`. Also **kein Crash-Bug**.

### Fix — BullMQ-`'error'`-Listener (Robustheit/Observability, kein Crash)

- **Dateien:** `apps/worker/src/worker.ts` (4 `Worker`), `apps/api/src/jobs/queue.ts` (5 `Queue`)
- **Schweregrad:** Niedrig (Observability/Konsistenz — **kein** funktionaler Fehler, **kein** Crash)

**Beschreibung:** BullMQ `Worker`/`Queue` sind EventEmitter. Die o. g. 9 Instanzen waren die
**einzigen** Fehler-Emitter der Codebase **ohne** `.on("error", …)` — jeder andere Emitter
(`pg` `pool` in API **und** Worker, `redis`, `cockpitCache`, console-`grant`-Client) hat einen.
Folge (im Repro bestätigt): ein transienter Redis-Fehler wird als **roher Stacktrace auf stderr**
ausgegeben statt über das strukturierte Logging zu laufen — eine Observability-Lücke, die im
Widerspruch zum sonst durchgängigen Muster der Codebase steht (und BullMQ-Doku-Best-Practice).

**Behebung:** Helper `logWorkerErrors(worker, queue)` im Worker (Stil wie `pool.on("error")` dort,
`console.error("[worker-bullmq] …")`); analog eine Schleife in `queue.ts`
(`console.error("[bullmq] …")`). Rein additiv — kein Verhaltenswechsel außer dem Logging;
ioredis reconnectet weiterhin selbst.

**Verifikation:** `npx tsc -p tsconfig.json --noEmit` in `apps/worker` **und** `apps/api` je exit 0.

---

## Iteration 38 — Bug #12: Stale-Response-Race im Audit-Center-Datenladen (Frontend)

- **Datum/Uhrzeit:** 2026-06-29 (Loop-Iteration 4)
- **Schweregrad:** Mittel-niedrig (echte Race Condition → potenziell falsche/veraltete Daten in der UI)

**Fokus:** größte bislang ungeprüfte Fläche = Web-Frontend. Division/`NaN`-Klasse zuerst
gesweept — alle Prozent-/Schnitt-Berechnungen sind sauber gegated
(`Math.max(1, …)`, `total === 0 ? 0 : …`, `evidenceQualityScores.length ? … : "0.0"`).
**Kein** Division-Bug.

**Gefundener Bug:** Die App nutzt durchgängig (12+ Stellen: `AppLayout`, `DashboardPage`,
`AdminDashboardPage`, `AssessmentWorkflowPage`, `PhaseLayout`, `FindingSlideover`,
`CustomerContextProvider`, …) das Muster `let cancelled = false; … return () => { cancelled = true; }`,
um Async-Fetches gegen Stale-Responses/Unmount abzusichern. **Drei** zentrale Lade-Pfade
verletzten diese Konvention — ohne jeden Guard:

1. **`apps/web/src/pages/customers/phases/useAuditOverview.ts`** — gemeinsamer Hook von
   `ControlsPhasePage`, `FindingsPhasePage`, `ReportPhasePage`. `assessmentId`-Wechsel bzw.
   `reload()` konnten sich überholen → langsamere ältere Antwort überschreibt neuere Daten.
2. **`apps/web/src/pages/audit/AuditCenterPage.tsx`** (`load()`, Effect `[id]`) — `id` kommt aus
   `useParams()`; Navigieren zwischen Assessments wechselt `id`, **während die Komponente
   gemountet bleibt** → `load()` läuft neu, Race nachweislich erreichbar.
3. **`apps/web/src/pages/customers/CustomerAuditCenterPage.tsx`** (`load()`, Effect `[id]`) —
   identisches Muster (Route-Param `id` → Cockpit-Fetch), zusätzlich Reload aus ~6 Handlern.

**Behebung:** Request-Sequenz-Guard per `useRef` (`requestRef`/`loadSeqRef`): jeder Aufruf
inkrementiert die Sequenz, nur die jüngste Antwort darf State schreiben
(`if (ref.current !== requestId) return;` vor jedem `setX`, inkl. `finally`/`setLoading`).
Deckt **sowohl** den Effect-getriebenen Param-Wechsel **als auch** Reload-Races ab (sauberer
als ein per-Effect-`cancelled`, da `load`/`reload` geteilt sind). Rein additiv, keine
Verhaltensänderung im Erfolgsfall.

**Bewusst NICHT geändert:** ~22 weitere Fetch-Komponenten ohne Guard (z. B. `CustomerListPage`,
`ConnectorAdminPage`, `FrameworkLibraryPage`, `AssessmentAssetsPage`, …) laden ganz überwiegend
**mount-only** (`useEffect(…, [])`) oder auf einem Param, der einen Remount auslöst — dort ist der
Race **nicht erreichbar** (in React 18 ist ein setState-nach-Unmount ein stiller No-op). Ein
flächendeckendes Nachrüsten wäre spekulativer Churn ohne Funktionsgewinn; bei gewünschter
vollständiger Konventions-Treue gezielt in einem eigenen Pass nachziehen.

**Verifikation:** `npx tsc -p tsconfig.json --noEmit` in `apps/web` exit 0.

---

## Iteration 39 — Bug-Hunt im neuen Lizenz-Modul + Regressions-Check

- **Datum/Uhrzeit:** 2026-06-29 (Loop-Iteration, Fokus: Lizenz)

Gezielte Prüfung des frisch gebauten Lizenz-Codes (`license/*`, gating in
`admin/routes`, `connectors/routes`, `customerAck`, `customers/routes`, Limits).

**Geprüft & als KEIN Bug bestätigt (Regressions-Check):**
- **`isFeatureEnabled()` entitlement-aware → Portal-Regression?** NEIN. Die
  öffentlichen Ack-Portal-Routen rufen `isFeatureEnabled()` **nicht** auf (nur
  Close-Endpoint + Admin-Routen). Bereits versendete Magic-Links bleiben einlösbar. ✓
- **`CustomerAckPanel` `if (!entitled) return null` → Rules-of-Hooks?** NEIN. Alle
  Hooks (Z. 34–67) liegen vor dem Early-Return (Z. 154). ✓
- **`preHandler: [requirePermission, requireFeature]` → Double-Send?** NEIN. Per
  Repro bestätigt: Fastify v5 ruft den 2. preHandler **nicht** auf, wenn der 1.
  bereits geantwortet hat (final 403, kein Fehler). ✓

**Gefundene & behobene Bugs:**
- **#13 — Demo-Seed Race (Doppel-Seeding).** `ensureDemoSeeded()` konnte bei
  gleichzeitigen Triggern (Boot + lazy `/api/license/state`-Fetch, mehrere Tabs)
  zweimal seeden (beide passieren den Flag-Check vor `seedAll`). Fix:
  In-Flight-Promise-Lock (`seedingInFlight`) in `demoSeed.ts`. *(Single-Instance;
  Multi-Replica wäre via Advisory-Lock — für den Demo-Server nicht nötig.)*
- **#14 — `requireFeature` doppelte Authentifizierung.** Lief als 2. preHandler
  `requireAuth` erneut (Token-Verify + 2 DB-Lookups doppelt pro gated Request).
  Fix: `if (!request.user)` -Guard. Zusätzlich die 403-Meldung von Deutsch auf
  Englisch übersetzt (war beim i18n-Pass übersehen).
- **Nachtrag i18n:** `catalog.ts` Limit-Label „Kunden" → „Customers".

**Bewusst NICHT geändert:** `admin/routes.ts:1492` („Bitte eine CSV-Datei
hochladen.") ist eine **vorbestehende, nicht-lizenz-bezogene** deutsche Meldung
(CSV-Upload) — kein durch die Lizenz-Einführung entstandener Bug; separat
übersetzbar, falls gewünscht.

**Verifikation:** `npx tsc -p tsconfig.json --noEmit` apps/api exit 0; api-Container neu gebaut & *healthy*; `/api/license/state` → 401 (Route aktiv). Repro-Dateien entfernt.

---

## Iteration 40 — Lizenz-Kern re-verifiziert (kein neuer Bug)

- **Datum/Uhrzeit:** 2026-06-29 (Loop, Fortsetzung Lizenz-Fokus)

Tiefe Re-Verifikation der logik-lastigsten Pfade (nach den Fixes aus Iter. 39):
- **`service.ts computeState`**: Reihenfolge notBefore → Instanz-Bindung →
  Ablauf/Grace → Demo → Tier korrekt; `base.valid=true` nur für Erfolgspfade,
  sonst `FREE_STATE` (valid=false) mit Grund. Demo (expiresAt=null) läuft nie ab. ✓
- **`refresh`**: `effectiveNow = max(now, storedMs)` + vorwärts-only Persistenz
  verhindert Ablauf-Umgehung per Uhr-Rückdrehen; `changed`-Vergleich vor
  `cached = next`, `state_changed`-Audit korrekt. ✓
- **`withinLimit`/`effectiveLimit`**: Lizenz-Override > Tier-Default, `null` =
  unbegrenzt, Demo = unbegrenzt; Limit-Math ohne Off-by-one (Free: genau 5 Nutzer
  / 25 Kunden, der nächste blockiert). Count-Queries (`status='active'`,
  `archived_at is null and not is_demo`) korrekt. ✓
- **Frontend-Entitlement** spiegelt die Backend-RANK-Logik. ✓

**Ergebnis: kein neuer Bug.** Die zwei echten Bugs (Iter. 39) waren die Ausbeute.

**Bewusst NICHT „gefixt" (dokumentierte, proportionale Edges):**
- **Limit-TOCTOU:** count-then-insert ist nicht atomar → bei *gleichzeitigen*
  Create-Requests theoretisch +1 Überschreitung. Auf einer admin-getriebenen,
  menschlich getakteten Instanz praktisch nicht erreichbar; ein harter Fix
  (DB-Constraint/Advisory-Lock) wäre für ein weiches Business-Limit unverhältnismäßig.
- **Demo-Reset vs. lazy `ensureDemoSeeded`:** nur bei parallelem Multi-Tab-Polling
  *während* eines Resets; auf dem Single-Presenter-Demo-Server nicht relevant.

→ Empfehlung im Log: die Lizenz-Module sind nach Iter. 39/40 stabil; weitere
allgemeine Lizenz-Durchgänge haben geringe Rendite.

---

## Iteration 41 — Regressions-/Integrations-Check (kein neuer Bug); Lizenz-Hunt abgeschlossen

- **Datum/Uhrzeit:** 2026-06-29 (Loop, Lizenz-Fokus, Abschluss)

Fokus auf die **bestehenden Dateien**, die das Lizenz-Gating verändert hat
(Regressions-Risiko):
- **AI-Settings-Seite bei gegateter `/api/admin/llm/config` (403 für Free):**
  kein Crash — `if (!draft || !config) return <Loading…>` (Z. 179) fängt den
  Null-Zustand ab; Nav ist ohnehin ausgeblendet. **Keine Regression.** ✓
- **Connector-/Customer-Ack-Seiten:** gleiches Codebase-Muster (`let cancelled`
  + `.catch`), degradieren statt zu crashen. ✓
- **`GET /api/customers*` mit zusätzlichem `customerCount`/`customerLimit`:**
  additive Felder, brechen keine bestehenden Consumer. ✓
- **`AdminDashboardPage.loadUsers` / `CustomerListPage`:** optionale Felder mit
  Fallback; entitled-User unverändert. ✓
- **Kein Test-Suite vorhanden** (der „test framework"-Commit meinte Audit-
  *Frameworks/Controls*, keine Unit-Tests) → `tsc` (grün) + Healthcheck +
  Code-Review sind das Regressions-Gate.

**Ergebnis: kein neuer Bug; keine Regression.** Die Lizenz-Einführung ist nach
drei fokussierten Durchgängen (Iter. 39: 2 Bugs gefixt · 40: Kern verifiziert ·
41: Integrationen/Regressionen verifiziert) **sauber**. Da der Code seither
unverändert ist, würden weitere statische Durchgänge nur „kein neuer Bug"
wiederholen — der Lizenz-Bug-Hunt ist damit **abgeschlossen**. Nächste sinnvolle
Stufe wäre Laufzeit-Test der Gates (eingeloggte Session / Demo-Aktivierung) oder
ein anderer Modul-Fokus.

---

## Iteration 42 — Breiter Hunt (neuer Auftrag „lasse nichts aus"): SQL-Sweep + weitere Stale-Response-Races

- **Datum/Uhrzeit:** 2026-06-29 (Loop, breiter Auftrag)

**SQL-Injection-Sweep (gesamte API):** sauber. Einzige String-Interpolation in
Queries ist `customers/routes.ts:151/157` — interpoliert eine **konstante**
SQL-Fragment via `customerSelect(...)`, User-Wert geht über `$1`. Alles andere
parametrisiert. ✓

**Bug #12-Klasse (Stale-Response-Race) — weitere Treffer behoben:** Re-Scan nach
route-param-getriebenen Fetches ohne Guard ergab 6 Kandidaten; 5 sind echte Races
(Portal `[token]` nicht — Token ist pro Besuch fix). Diese Iteration **3 gefixt**
(Request-Sequenz-Guard `loadSeqRef`, wie bei Bug #12):
- `reports/AssessmentAssetsPage.tsx` (`[id]`)
- `customers/phases/CustomerAckPanel.tsx` (`[assessmentId]`)
- `customers/phases/FindingsSummaryList.tsx` (`[assessmentId]`)

**Für nächste Iteration(en) eingeplant** (gleiche Klasse/gleicher Fix):
`customers/phases/PlanPhasePage.tsx` (`[auditId]`),
`customers/CustomerDetailsPanel.tsx` (`[customerId]`),
`frameworks/GuidedQuestionsPage.tsx` (`[id]`).

**Verifikation:** `tsc` apps/web exit 0; web-Container neu gebaut & *healthy*.

---

## Iteration 43 — Abschluss der Stale-Race-Restliste (Bug #12-Klasse) + Lizenz-Kern-Audit

- **Datum/Uhrzeit:** 2026-06-30 (Loop, Fortsetzung „lasse nichts aus")

### A) Die 3 aus Iteration 42 eingeplanten Dateien verifiziert (Request-Sequenz-Guard)

Alle drei Dateien hatten den `loadSeqRef`-Guard bereits angewandt. Gegen das **kanonische
Referenzmuster** (`useAuditOverview.ts`, der ursprüngliche Bug #12-Fix) geprüft — dort wird
**jeder** State-Write nach einem `await` per `if (requestRef.current === requestId)` geschützt,
**inklusive** `catch` (stale Error) **und** `finally`/`setLoading`:

- **`customers/CustomerDetailsPanel.tsx`** — vollständig & korrekt. Daten-Guard (Z.62) vor allen
  Settern; `catch` per `if (… === requestId)` geschützt (Z.77); kein `setLoading`. ✓
- **`frameworks/GuidedQuestionsPage.tsx`** — Erfolgspfad (die eigentliche Daten-Overwrite-Race)
  korrekt geschützt: Guard (Z.124) vor `setPayload` und allen Folge-Settern. ✓ (Der Error-Pfad
  liegt im `useEffect`-`.catch` außerhalb von `load()` — `requestId` dort nicht im Scope; nur ein
  transienter stale Error-Banner möglich, sehr niedrige Severity, bewusst belassen.)
- **`customers/phases/PlanPhasePage.tsx`** — Daten-Guard (Z.105) war da, der Fix war aber
  **unvollständig** gegenüber dem kanonischen Muster → **2 Lücken behoben:**
  1. `catch`-Toast (Z.128) und `finally { setLoading(false) }` (Z.130) waren **ungeguarded** →
     eine stale Antwort, die nach einer neueren ankommt, feuerte einen falschen Error-Toast für
     das **verlassene** Audit und löschte vorzeitig den Lade-Spinner des **aktuellen** Requests.
     Jetzt jeweils `if (loadSeqRef.current === requestId) …` (exakt wie `useAuditOverview`).
  2. **Zweiter await-Punkt** (Z.119–126, Auto-Convert-Flag-Fetch): `setAutoConvert(flag.enabled)`
     / `setAutoConvert(false)` waren **ungeguarded**. Ein stale `load`, der den Z.105-Guard noch
     passiert hat, konnte hier nach dem Start eines neueren `load` auflösen und den
     **Auto-Convert-Toggle des falschen Audits** auf die aktuelle Ansicht schreiben (dieselbe
     Bug #12-Klasse, nur am inneren Fetch). Beide Zweige jetzt geguarded.

  Damit ist **jeder** State-Write nach **jedem** `await` in `PlanPhasePage.load()` geschützt —
  voll konsistent mit dem kanonischen Muster.

### B) Lizenz-Modul tiefen-auditiert (security-/logik-kritisch) — KEIN neuer Bug

Schwerpunkt: die Signatur-/Verifikations-**Krypto** (forge-a-license wäre kritisch) — in den
Iter. 39–41 als „Lizenz-Logik" abgehakt, aber die Krypto-Primitive selbst hier erstmals
einzeln durchgegangen:

- **`token.ts` `parseAndVerifyToken`** — die Ed25519-Signatur deckt **exakt die dekodierten
  payload-Bytes** ab, und `JSON.parse` läuft über **dieselben** Bytes (`payloadBytes.toString`).
  → Kein Re-Serialisierungs-Bypass (der klassische „signiert wird X, geparst wird Y"-Angriff ist
  strukturell ausgeschlossen). Format strikt (`parts.length !== 2`), Claims-Typcheck
  (`typeof claims.tier === "string"`). ✓
- **`keys.ts` `verifyLicenseSignature`** — `crypto.verify(null, payload, key, signature)` ist der
  **korrekte** Ed25519-Aufruf (Algorithmus `null`); Public-Key aus `AUDITY_LICENSE_PUBLIC_KEY`
  (SPKI-PEM, base64). **Fail-closed:** kein/kaputter Key → `false` → keine Lizenz verifizierbar →
  Free. Ein Nicht-Ed25519-Key ließe `crypto.verify(null,…)` werfen → `catch` → `false`. ✓
- **`service.ts computeState`/`refresh`** (re-verifiziert): Reihenfolge notBefore → Instanz-Bindung
  → Ablauf/Grace; **Forward-only-Clock** `effectiveNow = max(now, storedMs)` + nur-vorwärts-
  Persistenz verhindert Ablauf-Umgehung per Uhr-Rückdrehung; `inGrace`-Math korrekt. (Robustheits-
  Notiz, **nicht** ausnutzbar, da Claims signiert: ein *malformter* `expiresAt`/`notBefore` → `NaN`
  → Block wird übersprungen, d. h. „kein Ablauf"; rein hersteller-seitig, kein Angriffsvektor.) ✓
- **`entitlement.ts`** — `isEntitled`: Demo→true, unbekanntes/Free-Feature→true (bewusst),
  sonst `TIER_RANK[tier] >= TIER_RANK[def.tier] || features.includes`. `withinLimit`:
  `current < max` ⇒ **exakte** Limit-Semantik (genau N erlaubt, N+1 blockt); Lizenz-Override >
  Tier-Default; `null`/unbekannt = unbegrenzt. ✓
- **`requireFeature.ts`** — `reply.sent`-Guard + `if (!request.user)`-Guard (Bug #14-Fix gegen
  Doppel-Auth) vorhanden. ✓
- **`demoSeed.ts` `ensureDemoSeeded`** — In-Flight-Promise-Lock (Bug #13-Fix) korrekt: der
  IIFE-Rückgabe-Promise ist zugewiesen, **bevor** `ensureDemoSeeded` zurückkehrt (kein await davor),
  daher kann kein zweiter Caller im selben Prozess den Flag-Check doppelt passieren. ✓
  (Bekannte, akzeptierte Edge: partielles `seedAll`-Scheitern *vor* `setFlag(true)` → Retry
  dupliziert die erfolgreichen Profile; demo-only, Single-Instance, proportional nicht fix-würdig —
  konsistent mit der Iter.-40-Bewertung.)

**Ergebnis B:** Lizenz-Krypto, State-Machine, Entitlement-Enforcement und Demo-Seed sind solide;
**kein neuer Bug** (deckt sich mit Iter. 39–41).

### Verifikation
- `npx tsc -p tsconfig.json --noEmit` in `apps/web` → **exit 0** (mit beiden PlanPhasePage-Guards).
- Ausbeute dieser Iteration: **1 Vervollständigungs-Fix** (PlanPhasePage, 2 Lücken der Bug #12-
  Klasse) + bestätigte Korrektheit der 2 übrigen geplanten Dateien + sauberer Lizenz-Kern-Audit.

---

## Bug #15 — LicenseProvider: stale `/api/license/state`-Antwort stellt nach Logout den Lizenzzustand des Vor-Nutzers wieder her ✅ ERLEDIGT (verifiziert 2026-06-30)

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 44, Fokus: Frontend-Lizenz-Layer)
- **Datei:** `apps/web/src/license/LicenseProvider.tsx` (`load`)
- **Schweregrad:** Niedrig–Mittel (Frontend-Entitlement-Korrektheit; **kein** Security-Boundary — das Backend erzwingt Gating serverseitig)

### Beschreibung
`LicenseProvider.load()` nutzt einen Request-Sequenz-Guard (`reqRef`) gegen Stale-Responses —
**aber** der frühe Rückkehr-Zweig `if (!accessToken) { setState(FREE_STATE); … return; }`
(Z. 63–67) **inkrementierte `reqRef.current` nicht**.

Das kanonische Referenzmuster (`useAuditOverview.ts`, Z. 88) bumpt die Sequenz **genau in
diesem Leer-Guard-Zweig** (`requestRef.current += 1`), um eine bereits laufende Anfrage zu
invalidieren. Hier fehlte das. Folge (echte Race derselben Bug #12-Klasse):

1. Nutzer ist eingeloggt → `load` (requestId=1) holt `/api/license/state`, Fetch in flight.
2. **Logout** → `accessToken` wird `null`. `load` (useCallback-dep `accessToken`) wird neu
   erzeugt, der Effekt feuert den Null-Zweig → `setState(FREE_STATE)`, **ohne** `reqRef`-Bump.
   `reqRef.current` bleibt `1`.
3. Die alte In-Flight-Antwort (requestId=1) löst auf: Guard `reqRef.current (1) !== requestId (1)`
   → **false** → läuft durch → `setState(payload.state)` ⇒ **der lizenzierte Zustand des
   abgemeldeten Nutzers wird über FREE_STATE zurückgeschrieben.**

Sichtbar als kurzes „Wieder-Auftauchen" von entitled Nav-Items / `FeatureTag`s / Demo-Watermark
nach dem Logout (bis zum Remount/Redirect). Kein Datenleck und keine echte Rechte-Erweiterung
(jeder API-Call erzwingt das Gating serverseitig), aber eine reale UI-Korrektheits-Race genau
der Klasse, die der Loop systematisch schließt.

### Behebung
Im `!accessToken`-Zweig wird `reqRef.current` jetzt **inkrementiert**, bevor auf `FREE_STATE`
zurückgesetzt wird — exakt wie im kanonischen `useAuditOverview`-Muster. Damit scheitert der
Guard jeder vor-Logout gestarteten Antwort (`reqRef.current` ist bereits weitergezählt) und sie
kann den `FREE_STATE` nicht mehr überschreiben. Rein additiv, im Erfolgsfall verhaltensneutral.

### Verifikation
- `npx tsc -p tsconfig.json --noEmit` in `apps/web` → **exit 0**.
- Konsistent mit dem Stale-Response-Guard-Muster der gesamten Codebasis (Bug #9/#12-Klasse).

### Geprüft, aber unauffällig (in diesem Durchgang)
- `apps/web/src/components/DemoWatermark.tsx` — rendert nur bei `state.watermark`; korrekt.
- `apps/web/src/components/FeatureTag.tsx` — `TAGS` deckt alle 3 Tiers ab, `featureTier()` liefert
  immer `free|pro|enterprise` → `tag` nie `undefined`; rendert nur im Demo-Modus. Korrekt.
- `LicenseProvider.isEntitled` (Memo) spiegelt die Backend-`entitlement.ts`-Logik (Demo→true,
  unbekannt/Free→true, sonst RANK-Vergleich ∨ `features`-Liste). Default-Context fail-open
  (`isEntitled: () => true`) ist bewusst — Gating ist UX, Enforcement serverseitig. Konsistent.

---

## Iteration 45 — Regressions-Sweep: Lizenz-Gating in bestehenden API-Routen (kein neuer Bug)

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 45)
- **Fokus:** Hat die Lizenz-Einführung in den *bestehenden* (per `git diff` geänderten) API-Routen
  Regressionen eingebaut? Systematisch alle Gating-Call-Sites geprüft.

**Geprüft & als KEIN Bug / KEINE Regression bestätigt:**

- **Kunden-Limit (`customers/routes.ts`)** — `customerUsage()` zählt `count(*) … where archived_at
  is null and not is_demo`; Create blockt mit `customerCount >= customerLimit` (Z. 297). Das ist
  **semantisch identisch** zu `withinLimit`s `current < max` (Free: genau 25, der 26. blockt),
  schließt Demo + archivierte korrekt aus. **Bulk-Import** (Z. 362,
  `customerCount + insertedThisBatch >= limit`) ohne Off-by-one. Neu erzeugte Kunden haben
  `is_demo=false` (Default) → zählen mit. ✓
- **Customer-Ack öffentliche Portal-Routen (`customerAck/routes.ts`)** — `requireFeature("customer_ack")`
  hängt **nur** an den authentifizierten Admin-/Intern-Routen (Z. 229/238/263/276/345/377/774),
  **nicht** an den öffentlichen `/api/portal/ack/:token{,/redeem,/snapshot.pdf,/receipt}`
  (Z. 448/531/645/693). Bereits versendete Magic-Links bleiben nach einem Downgrade einlösbar —
  bewusstes Design (deckt sich mit Iter. 39). ✓
- **Audit-Close-Gate (`/api/assessments/:id/close`)** — **nicht** `requireFeature`-gegatet (Schließen
  muss lizenz-unabhängig möglich sein); die „Customer-Ack vor Close erforderlich"-Warnung (409
  `MISSING_CUSTOMER_ACK`) greift nur, wenn `isFeatureEnabled()` true ist → bei Free/Pro korrekt
  übersprungen, kein fälschliches Blockieren. ✓
- **Connector-Auto-Sync-Gate (`connectors/routes.ts:566`)** — `if (!isEntitled("connectors")) return
  { skipped: "not_licensed" }` **vor** der Connector-Schleife → ein nicht-berechtigter License
  markiert **keinen** Connector als `error` (keine Status-Verschmutzung), Sync wird sauber
  übersprungen. ✓
- **AI-Enrichment-Gate (`frameworks/importJobs.ts`)** — bei fehlender `ai`-Berechtigung wird
  `config.provider = "none"` erzwungen. `createLlmProvider` fällt bei `"none"` durch alle
  ollama/anthropic/openai-Zweige → liefert den **No-op-TODO-Provider** (`kind="none"`, kein Throw);
  `estimateCostCents("none", …)` → 0 (kein NaN). `"none"` ist ein gültiger `LlmProviderKind`. ✓
- **Nutzer-Limit (`admin/routes.ts:1145`)** — zählt `users where status='active'`, blockt via
  `withinLimit("users", count, state)`. **Kein Pending-Invite-Bypass:** `users.status` hat
  DB-Default `'active'` (`001_core_schema.sql:27`), und Invite vergibt sofort ein Einmal-Passwort
  (kein Accept-Flow) → jeder eingeladene Nutzer zählt **sofort** als aktiv. ✓
  (Das count-then-insert-TOCTOU bleibt bestehen, ist aber der in Iter. 40 dokumentierte, akzeptierte
  Edge eines weichen, admin-getriebenen Limits — kein neuer Befund.)

**Ergebnis: kein neuer Bug.** Die Integration des Lizenz-Gatings in die bestehenden Routen ist
sauber — keine Regression in Limit-Zählung, Portal-Verfügbarkeit, Close-Logik, Connector-Status
oder AI-Degradation. (Nicht jede Iteration liefert einen Bug — Bug #15 war die Ausbeute der
vorigen; dies ist die Absicherung, dass das Gating nichts Bestehendes gebrochen hat.)

---

## Iteration 46 — Nicht-Lizenz-Frontend-Änderungen + neue Admin-UI (kein neuer Bug)

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 46)
- **Fokus:** die am stärksten geänderten Frontend-Dateien (`git diff`) außerhalb des reinen
  Lizenz-Layers, plus die neue Lizenz-Admin-Seite.

**Geprüft & als KEIN Bug bestätigt:**

- **`AppLayout.tsx` (+84 Z.)** — neue `notificationTarget(notification)`-Funktion (mappt jede
  Notification auf eine Zielroute, vorher navigierten nur customer-/system_update-Notifications):
  - **Alle** Zielrouten existieren real (gegen `main.tsx` verifiziert):
    Customer-Sub-Routen `/customers/:id/{findings,evidence,controls,risk,roadmap}` (Z. 73–78) +
    Admin-Routen `/admin/{system,backup,connectors,frameworks,frameworks/imports/:importId,
    maintenance,users,workbench}` + Default `/inbox` (Z. 65). Kein Navigieren ins Leere; Catch-all
    `*`→`/dashboard` fängt Unbekanntes.
  - `admin` korrekt via `isAdminRole(user?.role)` (Z. 82) abgeleitet → Non-Admin-Fallback
    (`target.startsWith("/admin") && !admin → /inbox`) funktioniert. Unbekannte entityTypes fallen
    graceful auf Customer-Seite bzw. `/inbox` zurück.
  - `openNotification` neu: navigiert **sofort**, markiert Read im Hintergrund
    (`void api(...).then(load).catch()`) — Navigation hängt nicht mehr am PATCH. Verbesserung.
  - Nav-Gating (`aiEntitled`/`connectorsEntitled`/`customerAckEntitled` + `<FeatureTag>`) konsistent
    mit dem Backend-Gating; neuer `/admin/license`-Link nur für Instance Admin. ✓
- **`AdminDashboardPage.tsx`** — neuer „aktive Nutzer / Limit"-Badge. Der Fallback
  `payload.activeUserCount ?? payload.users.length` ist nur defensiv: das Backend
  (`admin/routes.ts:1067`) sendet `activeUserCount` (zählt `status='active'`) **immer** mit → der
  `users.length`-Fallback (der inaktive mitzählen würde) greift in der Praxis nie. Rot-Logik
  (`activeUserCount >= userLimit`) und `userLimit ?? "∞"` korrekt. ✓
- **`main.tsx`** — `LicenseProvider` korrekt **innerhalb** `AuthProvider` montiert (braucht
  `accessToken`/`useApi`) und umschließt die Routes; `/admin/license` ist `instanceAdminOnly`. ✓
- **`LicenseAdminPage.tsx` (NEU)** — Activate/Deactivate/Reset-Demo: gemeinsames `busy`-Flag
  verhindert Doppel-Submit/Parallel-Ops (Buttons `disabled={busy …}`), alle drei mit try/finally +
  Error-Toast, `reload()` nach Erfolg; alle Anzeige-Lookups (`TIER_LABEL`/`REASON_LABEL`) mit
  `?? fallback`. Sauber strukturiert. ✓

**Ergebnis: kein neuer Bug.** Die gesamte Frontend-Seite der Lizenz-Einführung (Provider, Gating,
Notification-Routing, Admin-UI) ist solide. Damit ist das Lizenz-Feature **end-to-end** (Backend
Iter. 39–43, Frontend-Provider Iter. 44 → Bug #15, Gating-Regression Iter. 45, Frontend-UI Iter. 46)
abgedeckt.

---

## Bug #16 — Malformter `AUDITY_LICENSE_GRACE_DAYS` deaktiviert die Lizenz-Ablaufprüfung still (Fail-Open) ✅ ERLEDIGT (verifiziert 2026-06-30)

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 47, Pivot: Boot-Wiring/Config)
- **Datei:** `apps/api/src/license/service.ts` (`graceMs`)
- **Schweregrad:** Niedrig–Mittel (Lizenz-Enforcement-Robustheit; Fail-Open bei Config-Tippfehler)

### Beschreibung
`config.ts` lädt `licenseGraceDays: Number(process.env.AUDITY_LICENSE_GRACE_DAYS ?? 30)`. Ist die
Env-Variable **gesetzt, aber nicht-numerisch** (Tippfehler wie `30days`, `"30 "`-Sonderfälle,
Freitext), liefert `Number(...)` ein **`NaN`** — `validateProductionConfig` prüft diesen Wert
nicht.

Einziger Konsument ist `graceMs()` (`service.ts:33`), genutzt in der Ablaufprüfung (`service.ts:95`):
```ts
if (effectiveNow > exp + graceMs()) { /* expired → FREE_STATE */ }
```
Mit `graceMs() = NaN` gilt `exp + NaN = NaN` und `effectiveNow > NaN` ist **immer `false`** →
der Expired-Zweig wird **nie** betreten. Folge: Eine **abgelaufene** (aber gültig signierte) Lizenz
**läuft nie ab** — die Ablauf-Enforcement ist durch einen bloßen Env-Tippfehler **still
deaktiviert** (kein Fehler, kein Log). `base.inGrace = effectiveNow > exp` bliebe zwar `true`, aber
der harte Ablauf greift nicht mehr.

Dies ist dieselbe **NaN-aus-Config**-Klasse wie Bug #1 (Session-Timeout) und die
„validate-before-use"-Klasse von Bug #10 — hier auf der **Enforcement-Grenze** des Lizenzmodells,
wo Fail-**Open** das falsche Verhalten ist. Der realistische Auslöser ist ein versehentlicher
Tippfehler (Operator glaubt, Lizenzen laufen ab — tun sie aber nicht).

### Behebung
`graceMs()` validiert den Wert jetzt am sicherheitsrelevanten Konsumenten und fällt bei
nicht-endlichen/negativen Werten **fail-safe** auf den 30-Tage-Default zurück:
```ts
const days = loadConfig().licenseGraceDays;
return (Number.isFinite(days) && days >= 0 ? days : 30) * 24 * 60 * 60 * 1000;
```
Bewusst **am Konsumenten** gehärtet (nicht im codebasis-weiten `Number(env ?? default)`-Muster der
`config.ts`, das für alle Numerics gilt) — so bleibt der Fix zielgerichtet auf die Stelle mit
Fail-Open-Sicherheitsimpact, ohne das einheitliche Config-Muster anzufassen. Negative Werte (die
einen *früheren* Ablauf, also Fail-Closed, ergäben) werden derselben Sicherung halber ebenfalls
auf 30 normalisiert.

### Verifikation
- `npx tsc -p tsconfig.json --noEmit` in `apps/api` → **exit 0**.
- `graceMs` ist (per Grep bestätigt) der **einzige** Konsument von `licenseGraceDays` → kein
  Nebeneffekt an anderer Stelle.

### Geprüft, aber unauffällig (in diesem Durchgang)
- **`server.ts` Boot-Wiring** — `await licenseService.init()` läuft **vor** der Routen-Registrierung
  → Lizenzzustand ist beim ersten Request gecacht (kein Stale-at-first-request). Demo-Seed korrekt
  hinter `getState().demoMode` nach `init()` gegatet, mit `.catch`-Logging. ✓
- **`jobs/queue.ts`** — der diff ist der Iter.-37-BullMQ-`'error'`-Listener-Fix (alle 5 Queues),
  rein additiv. ✓
- **`config.ts`** — der restliche `Number(env ?? default)`-Stil ist konsistent mit der Codebasis;
  nur `licenseGraceDays` hat einen Fail-Open-Sicherheitsimpact und wurde daher am Konsumenten
  gehärtet (s. o.).

---

## Iteration 48 — Zwei bisher ungesweepte Bug-Klassen: Unbounded Queries + Lost-Update-Concurrency (kein neuer Bug; 1 Beobachtung)

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 48)
- **Fokus:** Klassen, die das 47-Iterationen-Log noch nicht explizit abgedeckt hatte.

### A) Unbounded Queries (DoS/OOM über große, append-only Tabellen)
- **`/api/admin/activity-logs`** (Liste, Hot-Path) → `limit 250`. ✓ Begrenzt.
- **`/api/admin/activity-logs/export`** (CSV) und **`/verify`** (Hash-Chain) lesen **ohne `limit`** —
  aber das ist **inhärent**: eine Hash-Chain ist nur ab Genesis (`prev_hash=""`) am Stück
  verifizierbar, und ein Voll-Export ist per Definition vollständig. Beide sind admin-gegatet und
  kein Request-Hot-Path. Ein Streaming-Rewrite wäre unverhältnismäßig.
- **Widerlegte Hypothese (per Code-Repro):** „Log-Archival pruned die Tabelle → `/verify` meldet
  am Prune-Rand fälschlich `prev_hash_mismatch`." **Falsch:** `logArchive/service.ts`
  (`fetchNewActivityRows`) ist **Watermark-basiert** (`where (created_at, id) > (last…)` +
  Watermark-Advance), **löscht nie** Zeilen. Die Tabelle bleibt vollständig → `/verify` liest die
  echte Chain ab Genesis korrekt. **Kein Korrektheits-Bug.**

### B) Lost-Update / Read-Modify-Write-Concurrency
- Sweep nach `select → JSON.parse → modify → update`-Mustern (wo nebenläufige Writes Daten
  *korrumpieren*, nicht nur last-write-wins): **keine** gefunden. Die API schreibt durchweg
  **Voll-Werte** (`set col = $bodyValue`) — nebenläufige PUTs sind sauberes last-write-wins (korrekte
  REST-Semantik), keine Teil-Merge-Verluste.
- `assessments/routes.ts:199` (`update … set scope = template.scope`) läuft auf einer **gerade
  erzeugten** Assessment-Zeile (frische UUID Z.180) → keine bestehenden Daten überschreibbar. ✓

### C) Bonus-Verifikation: Legal-Hold-Enforcement (neu, compliance-kritisch)
- `customerHasActiveLegalHold` (`productivity/legalHolds.ts`): blockt bei aktivem, nicht-abgelaufenem
  Hold auf den **Customer ODER irgendein Assessment** des Customers; `expires_at is null or >=
  current_date`; Default `false`. Im Delete-Handler (`customers/routes.ts:675`) korrekt **vor** der
  Lösch-Transaktion geprüft → **409 mit `return`** (kein Fall-through). ✓

### Beobachtung #12 (Scalability, bewusst NICHT gefixt)
Da das Audit-/Activity-Log **nie** lokal gepruned wird (Archival ist nur Watermark-Copy nach
extern), wachsen `/api/admin/activity-logs/{export,verify}` über die Lebensdauer einer Instanz
**unbegrenzt** und laden die gesamte Tabelle in den Node-Speicher. Auf einer lange laufenden Instanz
mit Millionen Events → potenziell OOM/langsam. **Kein Korrektheits-Bug** (admin-getriggert, selten),
aber ein proportionaler Hardening-Kandidat wäre: `/verify` chunked/streaming über einen
Server-Cursor (laufender Hash statt `result.rows` im RAM) und `/export` als gestreamte CSV. Bewusst
**nicht** autonom umgesetzt (größerer Umbau, nicht testbar ohne großen Datenbestand).

**Ergebnis: kein neuer Bug.** Beide Ziel-Klassen sind sauber; eine Scalability-Beobachtung notiert.

---

## Bug #17 — Nested IDOR in Audit-Center: Evidence-Mapping/-Request verifizieren die referenzierte Control/Finding/Risk nicht (Bug #8-Klasse) ✅ ERLEDIGT (verifiziert 2026-06-30)

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 49, End-to-End-Trace des Evidence→Control-Flows)
- **Datei:** `apps/api/src/audit-center/routes.ts` (Evidence-Mapping-POST ~Z.663; Evidence-Request-POST ~Z.630)
- **Schweregrad:** Niedrig–Mittel (Daten-Integrität + latente Cross-Assessment-IDOR; **kein** aktiver Leak)

### Beschreibung
Beim End-to-End-Trace des Evidence-Flows (genau die Klasse von Bug #8, dort für Risk-Finding-Links
behoben): Der **Evidence-Mapping-POST** prüft per `select … from evidence_items where id = $1 and
assessment_id = $2`, dass die **Evidence** zum Assessment `:id` gehört — verifiziert aber **nicht**,
dass die ebenfalls per Body übergebenen `assessmentQuestionId` / `findingId` / `riskId` zum selben
Assessment gehören. Der **Evidence-Request-POST** hatte dieselbe Lücke für `assessmentQuestionId`.

Folge (nested IDOR): Ein Nutzer mit Zugriff auf Assessment A konnte A's Evidence an eine
**Control/Finding/Risk eines fremden Assessments B** hängen (UUIDs aus B, z. B. nach entzogenem
Share). Die erzeugte Mapping-/Request-Zeile lebt zwar in A (`assessment_id = A`), referenziert aber
B's IDs.

**Severity-Einordnung (empirisch geprüft, nicht geraten):**
- **Kein aktiver Daten-Leak:** Die Overview liest Mappings via `select * … where assessment_id = $1`
  und gibt die rohen Zeilen zurück (Z.320/418) — die Fremd-IDs kommen als **opake UUIDs** zurück,
  **kein** Join, der B's Titel/Daten auflöst. Der Report-Build (Z.462) filtert Mappings per
  `mapping.assessmentQuestionId === control.assessmentQuestionId` (A's Controls) → Fremd-Mappings
  fallen **raus**. Der `audit_control_profiles`-UPDATE (Z.708) ist auf `assessment_id = A` gescoped
  → 0 Treffer für B's Frage (kein Cross-Write).
- **Realer Impact:** Datenmüll (Orphan-Mappings/-Requests mit Fremd-IDs in A) **und** eine **latente
  IDOR** — sobald irgendein künftiger Pfad diese `finding_id`/`risk_id` cross-scope joint, würde es
  zum Leak. Genau dagegen etablierte Bug #8 die Parent-Validierung als durchgängige Regel; hier war
  sie inkonsistent (Evidence geprüft, die anderen drei Referenzen nicht).

### Behebung
In **beiden** Handlern nach der Evidence-Prüfung (bzw. nach `parseBody`) zusätzlich verifiziert,
dass `assessmentQuestionId` (via `assessment_questions where id=$1 and assessment_id=$2`), `findingId`
(via `findings …`) und `riskId` (via `risks …`) — **wenn übergeben** — zum Assessment `:id` gehören;
sonst `404` (kein 403 → verrät Existenz nicht). Spiegelt exakt den bereits vorhandenen Evidence-Check
und das Parent-Scoping-Muster aus Bug #8.

### Verifikation
- `npx tsc -p tsconfig.json --noEmit` in `apps/api` → **exit 0** (`reply` in beiden Handlern im Scope).
- **Geprüft & korrekt (kein Fix nötig):** Der Control-Profile-PATCH (~Z.577) validiert seine
  `:questionId` bereits über die URL-Params + `where aq.id=$1 and aq.assessment_id=$2`. Die
  Mapping-/Profile-/Scope-Inserts aus `ensureAuditDefaults` nutzen Assessment-eigene Fragen
  (`join … on aq.assessment_id`). Signoff-Update (~Z.906) ist `assessment_id`-gescoped.

### Für nächste Iteration eingeplant (gleiche Klasse, Rest-Sweep)
Verbleibende Body-Referenz-Inserts in `audit-center/routes.ts` auf dasselbe Parent-Scoping prüfen:
`audit_interviews` (~Z.730), `audit_samples` (~Z.763), `audit_report_reviews` (~Z.867, `report_id`!)
und `audit_signoffs` (~Z.901, `entityId`). Report-Review `report_id` ist der wahrscheinlichste
nächste echte Treffer (Report eines fremden Assessments referenzierbar?).

---

## Iteration 50 — Bug #17 Rest-Sweep abgeschlossen: 5 weitere Cross-Assessment-Referenzen gehärtet

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 50, Fortsetzung Bug #17-Klasse)

Der in Bug #17 geplante Rest-Sweep über alle Body-Referenz-Inserts/-Updates in
`audit-center/routes.ts`. **5 weitere Instanzen derselben Klasse** gefunden und behoben (alle:
„Sub-Resource per Body referenziert, aber nicht gegen `:id`-Assessment validiert"):

1. **Report-Review POST** (`report.export`) — `body.reportId` → jetzt `select 1 from reports where
   id=$1 and assessment_id=$2`, sonst 404. (`reports.assessment_id` existiert, 001:288.)
2. **Report-Review PATCH** — der Row-Scope (`where id=reviewId and assessment_id=:id`) war da, aber
   der **neue** `report_id`-Wert war ungeprüft → gleiche `reports`-Validierung ergänzt. *(Höchster
   Impact des Sweeps: `report_id` referenziert ein herunterladbares Artefakt. Der eigentliche
   Download geht zwar über `reports`-Endpoints mit eigenem `canAccessAssessment` — aber die
   Referenz selbst gehört konsistent gescoped.)*
3. **Interview POST** — `body.linkedQuestionId` → `assessment_questions`-Validierung.
4. **Interview PATCH** — neuer `linkedQuestionId`-Wert → gleiche Validierung.
5. **Finding-Audit PATCH** — `body.retestEvidenceId` → `evidence_items where id=$1 and
   assessment_id=$2 and deleted_at is null` (Retest-Evidence eines fremden Assessments war setzbar).

**Geprüft & bewusst NICHT geändert:**
- **`audit_samples` POST/PATCH** — `sampleSchema` enthält **keine** Entity-Referenz (nur
  name/population/selected_items-JSON). Kein Cross-Assessment-Ref → kein Gap.
- **`audit_signoffs` POST** — `entityId` ist per Schema ein **freier String** (1–120 Zeichen,
  **kein** UUID einer konkreten Tabelle); je nach `entityType` deutet er auf Control/Finding/Risk/
  Report. Eine generische Tabellen-Validierung ist hier nicht sinnvoll. Der nachgelagerte
  `audit_control_profiles`-UPDATE ist bereits `assessment_id`-gescoped (0 Treffer bei Fremd-ID,
  kein Cross-Write); die Signoff-Zeile selbst ist eine append-only Attestation in `:id`. Kein
  validierbarer Ref-Gap.
- **Control-Profile PATCH** — `:questionId` kommt aus den **URL-Params** und wird gegen
  `assessment_questions where id=$1 and assessment_id=$2` geprüft (bereits korrekt).

### Verifikation
- `npx tsc -p tsconfig.json --noEmit` in `apps/api` → **exit 0** (alle 5 Guards, `reply`/`body` im Scope).
- **Stilkonsistenz-Hinweis:** Alle 7 Guards des Bug #17-Komplexes (2 aus Iter. 49 + 5 aus Iter. 50)
  sind bewusst **inline** (`if (body.x) { select 1 … ; 404 }`), ohne SQL-String-Interpolation und
  ohne neue Abstraktion — konsistent mit dem vorhandenen Evidence-Check und dem „keine
  Query-Interpolation"-Prinzip der Codebasis. Damit ist die **Parent-Scoping-Abdeckung in
  `audit-center/routes.ts` vollständig** (alle Body-übergebenen Sub-Resource-Referenzen validiert).

### Status der Bug #17-Klasse
**Abgeschlossen.** Gesamt 7 Cross-Assessment-Referenz-Stellen in audit-center gehärtet. Zusammen mit
Bug #7/#8 (cockpit/workflow) sind damit die nested-IDOR-/Parent-Scoping-Pfade über alle
assessment-scoped Sub-Resource-Endpoints abgedeckt.

---

## Iteration 51 — End-to-End-Trace: Report-Versand → E-Mail → Delivery + Secure-Import (kein neuer Bug)

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 51)
- **Fokus:** zwei komplexe, bisher nicht durchgängig getracte Flows.

### A) Report-Versand → E-Mail-Worker → Delivery-Log (`secure/routes.ts` + `worker.ts`)
- **`POST /api/assessments/:id/reports/:reportId/send`** — `canAccessAssessment(:id)` ✓ **und**
  `reportPackage(:id, :reportId)` mit `where r.id=$1 and r.assessment_id=$2` (Z.129) → ein
  **fremder Report** (anderes Assessment) liefert `null` → 404. **Kein Cross-Assessment-Report-Leak
  per E-Mail** (das wäre der gefährlichste Fall gewesen: Exfiltration fremder Report-Inhalte an
  eine attacker-gewählte Adresse — ist sauber verhindert). `sendReportSchema`: `recipient`
  `.email()`-validiert + `warningAccepted: literal(true)` (explizite Bestätigung erzwungen).
- **Job-Status (`/api/email-jobs/:id/status`)** und **Export** re-prüfen `canAccessAssessment`. ✓
- **Worker `sendSecureReportEmail`** — `storageBucket` ist im Worker eine **String-Konstante**
  (Z.80, `AUDITY_STORAGE_BUCKET ?? "audity-evidence"`), in der API ein **Funktions**-Aufruf
  `storageBucket()` (`storage/service.ts:60` → `config.storageBucket`, gleiche Env, gleicher
  Default) → **konsistenter Bucket** über beide Services (kein „API legt ab, Worker findet nicht").
  SMTP-Send hinter `AUDITY_SMTP_ENABLED==='true' && smtp_host` gegated; `decryptText` für das
  SMTP-Passwort; Delivery-Log + `appendActivityEvent` (mit non-null `userId`) korrekt. ✓
  *(Anfangsverdacht „`getObject(storageBucket, …)` ohne `()`" per Definition widerlegt — im Worker
  ist es absichtlich eine Konstante, kein vergessenes `()`.)*

### B) Secure-Package-Import (`POST /api/assessments/import`)
- Upload-Limit 50 MB + `truncated`-Check → 413 (statt irreführendem „invalid"); `JSON.parse` +
  `decryptZipPackage` (AES-256-GCM, Checksum) in try/catch mit differenzierten Codes. ✓
- **Atomar:** der gesamte Multi-Insert (customers → assessments → findings → risks → roadmap →
  reports → evidence) läuft in **einer Transaktion** (`begin` Z.468, mit Kommentar zur FS-vs-DB-
  Grenze) → kein Orphan-„(Imported)"-Customer/Halb-Assessment bei Teilfehler. **Bug #5-Klasse hier
  bereits adressiert.** ✓

**Ergebnis: kein neuer Bug.** Beide Flows sind durchgängig zugriffs-gescoped, validiert und (beim
Import) transaktional. Der Report-Versand-Pfad — der riskanteste (E-Mail-Exfiltration) — ist sauber.

---

## Iteration 52 — End-to-End-Trace: Öffentlicher Customer-Ack-Portal-Flow (Token → Redeem → Receipt) (kein neuer Bug; 1 Mini-Beobachtung)

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 52)
- **Fokus:** der public-facing, rechtlich relevante Sign-off-Flow (`customerAck/routes.ts` +
  `tokens.ts`), end-to-end von Token-Lookup bis Receipt-PDF.

**Geprüft & als KEIN Bug bestätigt:**
- **Token-Lookup (`findTokenByPlain`)** — `where token_hash = $1` mit `hashToken(token)` (Z.297–300):
  Tokens sind **gehasht** gespeichert, Lookup per Hash → kein Klartext in der DB, kein Timing-Probe
  auf den Plain-Token. ✓
- **Redeem (`POST /portal/ack/:token/redeem`)** — rate-limited, `redeemBody`-validiert, Status-Gate
  (`!= "pending"` → 410). **Claim + `audit_signoffs`-Insert in EINER Transaktion** (Z.575–608); der
  Claim (`markTokenRedeemed`, conditional UPDATE) ist atomar → bei Doppel-Submit genau **ein**
  Gewinner, der Verlierer bekommt 410 + Rollback (kein verbranntes Token ohne Sign-off). Das ist die
  „Durchgang #3"-Härtung, hier verifiziert. `signer_ip`/`user_agent` (auf 500 Z. gekappt) erfasst. ✓
- **Receipt (`GET /portal/ack/:token/receipt`)** — Gate `redeemedAt && redeemedSignoffId` → 409
  `NOT_REDEEMED` (Receipt erst NACH Redemption); lädt **nur** den eigenen Sign-off
  (`mapped.redeemedSignoffId`, kein beliebiger Fetch → kein IDOR); `pinned_snapshot` ist
  token-gebunden (eingefroren). Branding global/nicht-sensibel. ✓
- **Snapshot-PDF** — gleiche Token-Auth, nur pinned snapshot (keine Live-Daten).

**Mini-Beobachtung (kein Bug, NICHT geändert):** Der `audit_signoffs.event_hash` wird aus
`signoffId|assessmentId|tokenId|signerName|Date.now()` gebildet (Z.564). Das `Date.now()` wird
**nicht** gespeichert (die Zeile nutzt DB-Default `created_at`), und ein codebasis-weiter Grep findet
**keinen** Verifizierer/Recompute für `audit_signoffs.event_hash`. ⇒ Der Hash ist faktisch ein
**eindeutiger Fingerprint/Referenzwert** auf dem Receipt, **kein** rekompierbarer Integritätsbeweis —
der Kommentar „tamper-evident" verspricht etwas mehr, als der Mechanismus einlöst. **Kein
funktionaler Bug** (nichts schlägt fehl, da nichts rekomputiert), und als eindeutige Receipt-Referenz
erfüllt er seinen Zweck. Eine echte Tamper-Evidenz bräuchte (a) einen gespeicherten Zeitstempel im
Hash-Input **und** (b) einen Verifizierer — beides Feature-/Designentscheidung, daher bewusst nicht
autonom umgebaut (rechtlich relevantes Artefakt; konsistent mit der „no security theater"-Linie:
lieber ehrlich benennen als einen Pseudo-Beweis zementieren).

**Ergebnis: kein neuer Bug.** Der Portal-Flow ist sauber: gehashte Tokens, atomarer Claim+Sign-off,
post-Redemption-gegatetes token-scoped Receipt ohne IDOR.

---

## Bug #18 — Archivierung: DB-Fehler nach dem Datei-Move strandet die Evidence/Reports des AKTIVEN Kunden ✅ ERLEDIGT (verifiziert 2026-06-30)

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 53, End-to-End-Trace Archiv/Restore-Orchestrierung)
- **Datei:** `apps/api/src/archive/service.ts` (`archiveCustomer`)
- **Schweregrad:** Mittel (Daten-Integrität — verwaiste/„verschwundene" Evidence-/Report-Blobs eines aktiven Kunden)

### Beschreibung
`archiveCustomer` macht zuerst den **Objekt-Storage-Move** (`moveCustomerArtifactsToSpool`,
**vor** der DB-Transaktion und **außerhalb** ihres try/catch) und dann die DB-Transaktion
(`update customers/assessments set archived_at`, `insert archive_index`). Der Move ist destruktiv:
`moveBlobs` (`archive/files.ts:49`) streamt jedes Objekt in den Spool (FS) und **löscht danach das
Original** aus dem Object-Storage (`removeObject`, Z.58).

Realistischer Fehlerfall — **Move erfolgreich, DB-`commit` schlägt fehl** (DB-Hickup/Verbindungs-
abbruch): Die DB wird zurückgerollt → der Kunde bleibt **aktiv** (kein `archived_at`, **kein**
`archive_index`-Row), aber die Evidence-/Report-Objekte sind bereits **aus dem Storage entfernt**
(liegen nur noch im Spool). Folge: Der aktive Kunde referenziert in `evidence_items`/`reports`
Objekt-Keys, die im Storage **nicht mehr existieren** → Downloads/Previews **404**. Der Kommentar
(„On failure the spool is retained for retry") unterschätzt das: Es gibt **keinen `archive_index`-
Zeiger** auf den Spool und **keine** automatische Erholung — die Evidence des aktiven Kunden ist
effektiv gestrandet (manuelle Recovery nur über den deterministischen Spool-Pfad).

### Behebung
Im `catch` von `archiveCustomer` (nach dem `rollback`) wird der Move jetzt **best-effort rückgängig
gemacht**: `restoreCustomerArtifactsFromSpool({ customerId, spoolPath })` lädt die Blobs aus dem
Spool zurück an ihre **Original-Keys** (die Umkehrung des Moves; löscht den Spool) → der aktive
Kunde bleibt **voll konsistent** (aktiv **und** Dateien am Originalort). Schlägt auch das Restore
fehl, wird der Spool (inkl. `manifest.json`) für **manuelle** Recovery behalten und **beide** Fehler
werden in einer aussagekräftigen Meldung gebündelt geworfen. Die `restoreCustomerArtifactsFromSpool`-
Funktion ist bereits bewährt (Restore-Request-Pfad). **Der Erfolgspfad bleibt unverändert** (rein
additive Fehlerpfad-Erholung).

### Verifikation
- `npx tsc -p tsconfig.json --noEmit` in `apps/api` → **exit 0** (`spoolPath`/`opts.customerId`/Import im Scope).
- Nutzt die existierende, im Restore-Request-Flow erprobte Inverse-Operation.

### Beobachtung #13 (Spiegel-Fall, bewusst NICHT autonom geändert)
`approveRestoreRequest` hat dasselbe Muster in der **sichereren** Richtung: `restoreCustomerArtifacts
FromSpool` (re-upload an Original-Keys **und** Spool-Löschung, Z.~335) läuft **vor** der DB-Transaktion
(un-archive + `delete archive_index`). Schlägt die DB fehl, sind die **Dateien zurück am Originalort
(kein Datenverlust)**, aber der Kunde bleibt in der DB „archived" und der Spool ist weg → ein **Retry
über den Normal-Flow scheitert** (kein Spool/Manifest mehr) → „stuck archived". Kein Datenverlust,
daher niedrigere Severity; sauberer Fix wäre hier eine **Umkehr der Reihenfolge** (DB-Transaktion
zuerst, FS-Restore danach) — größere Verhaltensänderung an einem datenkritischen Pfad, daher als
Beobachtung notiert statt blind umgebaut. Auch der **Partial-Move-Fehler** in `moveBlobs` (wirft
mittendrin, `manifest.json` wird erst **nach** dem Move geschrieben → Spool ohne Manifest →
`restore` nicht möglich) gehört zu dieser Klasse; empfohlener Folge-Fix: `manifest.json` **vor**
dem Move schreiben + `restore` tolerant gegen fehlende Spool-Blobs.

---

## Iteration 54 — Archiv-Robustheits-Klasse abgeschlossen (Folge-Fixes aus Beobachtung #13)

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 54, Fortsetzung Bug #18)
- **Datei:** `apps/api/src/archive/files.ts` (`moveCustomerArtifactsToSpool`, `restoreCustomerArtifactsFromSpool`)

Die in Beobachtung #13 empfohlenen, gezielten Folge-Fixes zum Schließen der Partial-Move-Lücke —
beide **erfolgspfad-neutral** (der normale Archiv-/Restore-Flow verhält sich identisch):

### Fix 1 — `manifest.json` VOR dem Move schreiben
Bisher wurde das Manifest **nach** `moveBlobs` geschrieben. Da `moveBlobs` jedes Original direkt
nach dem Spoolen aus dem Storage **löscht**, hinterließ ein **mittendrin abbrechender** Move einen
Spool **ohne Manifest** → die bereits gespoolten Blobs ließen sich nicht mehr auf ihre Original-Keys
zurückmappen (Recovery unmöglich). Das Manifest wird jetzt **zuerst** geschrieben (es listet die
vollständige, vorab bekannte Key-Menge) → auch ein Teil-Move hinterlässt immer einen Recovery-Anker.

### Fix 2 — `restore` tolerant gegen fehlende Spool-Blobs (aber **ohne** Datenverlust zu maskieren)
Neuer Helfer `restoreOneBlob(key, src)`: Fehlt die Spool-Datei eines Manifest-Keys, ist das **nur**
nach einem Teil-Move legitim (das Original wurde nie entfernt). Daher wird per
`storageClient.statObject` geprüft, ob das **Original noch im Storage** liegt:
- Original vorhanden → **überspringen** (nichts zu restoren — der Key wurde nie bewegt). ✓
- Original **auch** weg → der Blob ist **echt verloren** → **laut fehlschlagen** (kein stilles,
  verlustbehaftetes Restore). ✓

Damit funktioniert die manuelle Recovery nach einem Teil-Move (Manifest da, gemovte Blobs zurück,
nicht-gemovte übersprungen), **ohne** die Fail-Loud-Semantik des Normal-Restores bei echtem
Blob-Verlust aufzuweichen (genau die Sorge, die ein naives „skip if missing" gehabt hätte).

### Verifikation
- `npx tsc -p tsconfig.json --noEmit` in `apps/api` → **exit 0** (`statObject` ist auf dem minio-
  `Client`-Typ vorhanden; Helfer im Scope).
- **Erfolgspfad unverändert:** Bei vollständigem Move sind alle Blobs im Spool → `restore` lädt alle
  hoch (kein Skip-Zweig), exakt wie zuvor. Nur Fehler-/Teil-Pfade gewinnen Robustheit.

### Status der Archiv-Robustheits-Klasse
**Abgeschlossen.** (1) Voll-Move + DB-Fehler → `archiveCustomer` self-heilt (Bug #18). (2) Teil-Move-
Abbruch → Manifest-Anker (Fix 1) + tolerantes, nicht-maskierendes Restore (Fix 2). (3) `approveRestore
Request`-Reihenfolge (DB-zuerst) bleibt als bewusst nicht-autonome Beobachtung #13 offen (kein
Datenverlust, nur „stuck archived"; sauberer Fix = Reordering, größere Verhaltensänderung).

---

## Bug #19 — Cockpit „Next Actions": überfällige Evidence wird bei >50 offenen Requests unterberichtet ✅ ERLEDIGT (verifiziert 2026-06-30)

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 55, End-to-End-Trace `deriveNextActions`)
- **Datei:** `apps/api/src/cockpit/actions.ts` (`deriveNextActions`, Evidence-Overdue-Block)
- **Schweregrad:** Niedrig–Mittel (Dashboard-/Inbox-Korrektheit bei Skalierung — überfällige Evidence „verschwindet")

### Beschreibung
Alle „Next Action"-Ableitungen (Findings-Response, Remediation-Overdue, Contradictions, Sign-offs,
Customer-Ack) aggregieren **in SQL** per `group by assessment_id` (vollständig, kein Zeilenlimit) —
**außer** der Evidence-Overdue-Block: der holte **rohe Zeilen mit `limit 50`** (`order by due_date asc`)
und aggregierte erst in JS pro Assessment.

Folge auf einer Instanz mit **>50 offenen Evidence-Requests** über die aktiven Audits: Es werden nur
die 50 ältesten geladen. Assessments, deren überfällige Requests **außerhalb** dieser Top-50 liegen,
erscheinen **gar nicht** mehr mit einer „evidence overdue"-Aktion — der Auditor sieht auf Dashboard
**und** im (aus `deriveNextActions` gespeisten) Inbox **keine** überfällige Evidence für diese Kunden,
obwohl sie existiert. Stilles Under-Reporting genau im überlasteten Zustand, in dem es am meisten
zählt. Inkonsistent zu allen Schwester-Ableitungen.

### Behebung
Der Evidence-Block aggregiert jetzt **in SQL** (gleiche Form wie die Findings-Query direkt darunter):
`count(*) filter (where <overdue>)` + `max(<od>) filter (where <overdue>)` `group by assessment_id`,
**ohne Zeilenlimit**. Der Overdue-Ausdruck ist **unverändert** übernommen
(`extract(day from (now() at utc) - due_date::timestamp) > 0` ≡ das alte `od <= 0 → skip`), die
JS-`Map`-Aggregation entfällt. Ergebnis: identische Werte für den <50-Fall, **vollständige** Meldung
für alle Assessments im >50-Fall.

### Verifikation
- `npx tsc -p tsconfig.json --noEmit` in `apps/api` → **exit 0** (NextAction-Shape + Aggregat-Query ok).
- Semantik-Äquivalenz für den Normalfall manuell geprüft (gleicher `extract(day …) > 0`-Filter,
  `count`/`max` statt JS-Schleife).

### Geprüft, aber unauffällig (in diesem Durchgang)
- Restliche `deriveNextActions`-Blöcke: Findings (`count(*) filter`, `group by`), Contradictions
  (ready-Control ohne mapped Evidence via left-join `em.id is null`), Sign-offs, Customer-Ack
  (Stunden-Restberechnung + Severity <24/<72) — alle korrekt, vollständig aggregiert, Severity-Sort
  (critical<warning<info, dann `overdueBy` desc) korrekt.
- `computePhase` — Substring-Heuristik mit bewusster Reihenfolge („review"→Fieldwork **vor**
  „report"→Report, da „review" hier die Fieldwork-Control-Review meint); konsistent mit der in
  Iteration 20 geprüften `normalisePhaseLabel`. Kein Bug.
- `isStuck` — Backwards-Compat-Wrapper um `evaluateStuck` (thresholds, Iter. 17/Bug #7). Korrekt.

---

## Bug #20 — Frontend zählt bereits eingegangene („received") Evidence-Requests als „überfällig" (inkonsistent zum Backend) ✅ ERLEDIGT (verifiziert 2026-06-30)

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 56, Frontend-Trace `ControlsPhasePage`)
- **Datei:** `apps/web/src/pages/customers/phases/ControlsPhasePage.tsx` (`overdueRequestQuestionIds`)
- **Schweregrad:** Niedrig–Mittel (UI-Korrektheit — irreführende „overdue evidence"-Markierung)

### Beschreibung
Direkter Anschluss an Bug #19 (gleicher Evidence-Overdue-Bereich, andere Seite). Die
`tab=requests`-Filterlogik (`overdueRequestQuestionIds`) wertete einen Request als „überfällig",
wenn `due < today` **und** sein Status in `["open", "requested", "received"]` liegt.

Aber: **`received` bedeutet, dass die Evidence bereits eingegangen ist.** Das Backend behandelt
`received`/`validated` konsistent als *vorhandene* Evidence — `audit-center/routes.ts:345` zählt ein
Control nur dann als „braucht noch Evidence", wenn der Status **nicht** in `["validated","received"]`
liegt; Z.378/408 zählen `received` als „mapped or received evidence" (= erledigt). Und das Backend-
Pendant (`deriveNextActions`, Bug #19) nutzt korrekt nur `status in ('open','requested')`.

Folge: Ein Request, dessen Evidence **eingegangen** ist (`received`), aber dessen ursprüngliches
Fälligkeitsdatum überschritten wurde, wurde im Frontend-Filter fälschlich als „overdue evidence
request" markiert. Der Auditor sieht Controls als „Evidence überfällig", obwohl die Evidence längst
da ist — widerspricht sowohl dem Backend als auch dem eigenen Kommentar des Blocks („not yet
resolved"). Über-Reporting (Spiegelbild zum Backend-Under-Reporting aus Bug #19).

### Behebung
`received` aus dem „noch offen"-Set entfernt → `new Set(["open", "requested"])`, exakt wie die
(korrekte) Backend-Definition. Kommentar ergänzt, der die Begründung (received/validated = Evidence
da = resolved) und die Konsistenz mit dem Cockpit-Next-Action festhält.

### Verifikation
- `npx tsc -p tsconfig.json --noEmit` in `apps/web` → **exit 0**.
- Frontend-Filter und Backend-`deriveNextActions` nutzen jetzt **dieselbe** Overdue-Definition
  (`open`/`requested`), konsistent mit der `evidenceStatus`-Behandlung (`received`/`validated` =
  vorhanden) in `audit-center/routes.ts`.

### Anmerkung
Bug #19 (Backend, Under-Reporting via `limit 50`) und Bug #20 (Frontend, Over-Reporting via
`received`) wurden beide durch den durchgehenden Cockpit→ControlsPhase-Trace (Iter. 55→56) gefunden —
zwei gegenläufige Fehler in derselben „überfällige Evidence"-Semantik, jetzt beidseitig auf die
korrekte Definition (`open`/`requested`, vollständig aggregiert) gebracht.

---

## Bug #21 — Frontend markiert HEUTE fällige Remediations als „überfällig" (Date-vs-Datetime, inkonsistent zum Backend) ✅ ERLEDIGT (verifiziert 2026-06-30)

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 57, Cross-Layer-Overdue-Konsistenz, Fortsetzung #19/#20)
- **Datei:** `apps/web/src/pages/customers/phases/FindingsPhasePage.tsx` (`remediation_overdue`-Filter)
- **Schweregrad:** Niedrig–Mittel (UI-Korrektheit / Off-by-one am Tagesrand)

### Beschreibung
Dritter Treffer im Cross-Layer-Overdue-Thread. Der `filter=remediation_overdue`-Filter wertete eine
Remediation als überfällig mit `new Date(due) < new Date()`. `due` ist ein **Datum** (z. B.
„2026-06-30"); `new Date("2026-06-30")` ergibt **Mitternacht UTC**, `new Date()` ist der **aktuelle
Zeitpunkt**. Damit ist eine **heute** fällige Remediation, sobald die Uhr Mitternacht UTC passiert
hat, „kleiner als jetzt" → **fälschlich als überfällig** markiert.

Das Backend (`deriveNextActions`, Bug #19) nutzt dagegen `remediation_due_date < now()::date` —
einen **reinen Datumsvergleich**: heute fällig ist **noch nicht** überfällig. Gleiche Off-by-one-
Klasse wie #20, nur über die Datum-vs-Zeitpunkt-Falle. (Die Status-Ausnahme `["implemented","closed"]`
stimmt mit dem Backend überein — nur der Datumsvergleich war falsch.)

### Behebung
Auf reinen **UTC-Datumsvergleich** umgestellt (wie der Backend-`::date`-Vergleich und das
ControlsPhase-Muster aus Bug #20): `due.slice(0,10) < new Date().toISOString().slice(0,10)`. Heute
fällig (`due == today`) ist damit **nicht** mehr überfällig. Verhaltensänderung nur am Tagesrand
(heute-fällige Items), sonst identisch.

### Verifikation
- `npx tsc -p tsconfig.json --noEmit` in `apps/web` → **exit 0**.
- **Sweep:** codebasis-weite Suche nach weiteren `new Date(x) < new Date()`-Overdue-Vergleichen im
  Frontend → **keine** weiteren Treffer (Bug #21 war isoliert).

### Cluster-Fazit (Bugs #19/#20/#21)
Der durchgehende Cockpit→ControlsPhase→FindingsPhase-Trace deckte **drei** Inkonsistenzen in der
„überfällig"-Semantik auf: Backend-Under-Reporting (#19, `limit 50`), Frontend-Over-Reporting via
`received` (#20), Frontend-Over-Reporting via Date-vs-Datetime (#21). Alle drei jetzt auf die
**eine** korrekte Definition gebracht: Status `open`/`requested` (Evidence) bzw. Exclude
`implemented`/`closed` (Remediation), **reiner UTC-Datumsvergleich**, **vollständig aggregiert**.

---

## Iteration 58 — Cross-Layer-Konsistenz (Readiness, Acceptance-Expiry): kein autonomer Fix; 2 Beobachtungen

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 58)
- **Fokus:** weitere Werte, die Backend berechnet und Frontend/andere Views re-derivieren oder
  durchsetzen sollten. Zwei echte Lücken gefunden — beide **produktentscheidungs-bedürftig**
  (verhaltensändernd/feature-artig), daher **bewusst nicht autonom** geändert (analog zur Behandlung
  von #8/#9, die erst nach Nutzer-Abstimmung umgesetzt wurden).

### Beobachtung #14 — „Readiness" wird an zwei Stellen unterschiedlich berechnet
- **`cockpit/routes.ts:105`** (Dashboard-Übersicht): `readinessScore = round(answered/questions*100)`
  — reine **Beantwortungs-Quote**.
- **`audit-center/routes.ts:381`** (Audit-Detail): `readinessScore` = **gewichtetes Composite**
  (35% approved Controls + 35% evidence-mapped + 20% (1 − openFindings-Quote) + 10% reportFinal).

Beide Felder heißen `readinessScore` und werden im Frontend vermutlich beide als „Readiness"
angezeigt. Für **dasselbe** Audit kann das Dashboard also einen **anderen** Readiness-Wert zeigen als
die Detail-Ansicht → verwirrend/inkonsistent. **Keine** der beiden Formeln ist *für sich* fehlerhaft
(beide korrekt geklammert/division-sicher); es ist eine **Vereinheitlichungs-/Produktentscheidung**
(welche Formel ist „die" Readiness?). Daher Beobachtung, kein autonomer Fix (Vereinheitlichen würde
das angezeigte Verhalten ändern und ggf. die schlankere Cockpit-Query verteuern).

### Beobachtung #15 — Risk-Acceptance-Expiry wird gespeichert, aber NIE durchgesetzt
`risks.acceptance_expires_at` wird gesetzt/validiert/exportiert/angezeigt (25 Fundstellen) — aber ein
codebasis-weiter Grep findet **keinen** `acceptance_expires_at < now()`-Vergleich. D. h. läuft die
Akzeptanz-Frist eines „accepted" Risks ab, passiert **nichts**: das Risk bleibt unbegrenzt akzeptiert,
obwohl der Sinn des Felds die **erneute Bewertung nach Ablauf** ist. Gleiche „Management-UI ohne
Enforcement"-Klasse wie Public-API-Tokens (#8) und Legal-Holds (#9, das im Durchgang **nach
Nutzer-Abstimmung** Enforcement bekam).

**Empfohlener (koordinierter, nicht autonomer) Fix:** entweder (a) eine Cockpit-„Next Action"
`acceptance_expired` (additiv, ändert keinen Status — überfällige Akzeptanzen sichtbar machen, analog
zu den anderen Overdue-Ableitungen), und/oder (b) ein Job/Read-Time-Flag, das abgelaufene Akzeptanzen
zur Re-Review zurücksetzt/markiert. Welches Verhalten gewünscht ist (nur anzeigen vs. Status
zurücksetzen), ist eine Produktentscheidung — daher hier nur dokumentiert.

**Ergebnis: kein neuer Code-Fix.** Zwei reale, dokumentierte Governance-/Konsistenz-Lücken, bewusst
zur Nutzer-Entscheidung vorgemerkt (verhaltensändernd). Die Readiness-Formeln **je für sich** und die
cockpit-Division sind korrekt; die Overdue-Semantik ist nach #19/#20/#21 konsistent.

---

## Bug #22 — `ensureAutomaticRiskRegister`: nebenläufige Control-Answer-Saves erzeugen doppelte Auto-Risks ✅ ERLEDIGT (verifiziert 2026-06-30)

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 59, Trace Control-Answer-Save-Flow)
- **Datei:** `apps/api/src/workflow/suggestions.ts` (`ensureAutomaticRiskRegister`)
- **Schweregrad:** Mittel (Daten-Integrität — doppelte Auto-Risks im Register bei aktivem Beantworten)

### Beschreibung
Der Control-Answer-Save-Handler (`PUT /api/assessments/:id/questions/:controlId/answer`,
`frameworks/routes.ts:608`) ist sonst sauber — `canAccessAssessment` (kein IDOR), Parent-Scoping der
Frage auf Assessment+Framework, Score-Validierung (0–5), atomarer `on conflict`-Upsert der Antwort.
**Aber** er ruft am Ende `ensureAutomaticRiskRegister(:id)` (Z.700) — **bei jedem Save**.

`ensureAutomaticRiskRegister` (`suggestions.ts`) ist ein **check-then-insert ohne Schutz**:
1. Kandidaten-Query: Findings **ohne** verknüpftes Risk (`left join risks r on r.finding_id = f.id …
   where r.id is null`).
2. Pro Kandidat ein `insert into risks (… finding_id …)` — **ohne Advisory-Lock, ohne `on conflict`**.

`risks.finding_id` ist eine **deprecated Legacy-Spalte ohne Unique-Constraint** (001:238; das
006-Redesign führte `risk_finding_links` als M:N ein, ließ `finding_id` aber als Legacy stehen).
Folge bei **gleichzeitigen** Saves (schnelles Beantworten, mehrere Tabs, parallele Requests): Zwei
`ensureAutomaticRiskRegister`-Läufe sehen dasselbe Finding als „noch kein Risk" und fügen **beide**
ein → **zwei identische Auto-Risks** für ein Finding. Genau die Bug-Klasse, die der **autoConvert**-
Pfad (Iter. 4) per Advisory-Lock vermeidet — dieser Pfad war ungeschützt.

### Behebung
Kandidaten-Query + Insert-Loop laufen jetzt in **einer Transaktion mit transaktions-scoped
Advisory-Lock** `pg_advisory_xact_lock(hashtext('audity_risk_register:' || :id))` (gleiches Muster
wie `autoConvert`/`appendActivityEvent`/`runExpiryJob`). Nebenläufige Aufrufer für dasselbe
Assessment **serialisieren**: der zweite wartet, sieht dann die vom ersten eingefügten Risks
(`r.id is not null`) und überspringt sie → **keine Doppel-Einträge**. `ensureSuggestedFindings`
(Z.77, bereits idempotent via `on conflict`, Iter. 13) bleibt davor — korrekt, da die Risk-Erzeugung
allein der kritische Abschnitt ist. Sequenzieller Erfolgspfad unverändert.

### Verifikation
- `npx tsc -p tsconfig.json --noEmit` in `apps/api` → **exit 0**.
- Konsistent mit dem Advisory-Lock-Muster aller anderen nebenläufigkeits-kritischen Insert-Pfade.

### Geprüft, aber unauffällig
- Der Control-Answer-Handler selbst: `canAccessAssessment` (614) + Frage-Parent-Scoping
  (`aq.assessment_id=$1 and fd.framework_id=$3`, 634–643) + Score 0–5 (624–632) + atomarer Antwort-
  Upsert (`on conflict (assessment_question_id)`, 667). Sauber. N/A zählt als beantwortet
  (`answer_state !== "unknown"`, Z.502) → cockpit-Readiness erreicht 100% (kein N/A-Off-by-one).

---

## Iteration 60 — Sweep der „check-then-insert ohne Lock/on-conflict"-Klasse (Geschwister von Bug #22): #22 war der einzige Hot-Path-Treffer

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 60)
- **Fokus:** Bug #22 ist „SELECT-Existenzprüfung → INSERT ohne Lock/on-conflict". Systematische Suche
  nach weiteren Instanzen (alle `ensure*`/auto-/seed-Funktionen + inline `select exists/count → insert`).

**Geprüft & als SICHER bestätigt:**
- **`ensureSuggestedFindings`** (`suggestions.ts:20`) — `on conflict (assessment_id, framework_control_id)
  where framework_control_id is not null do update`; der Inner-Join garantiert non-null
  `framework_control_id` → partieller Unique-Index greift → **idempotent**. ✓
- **`ensureAssessmentQuestions`** (`assessmentQuestions.ts:64`) — deterministische `stableUuid` +
  `on conflict (assessment_id, question_id) do update` → **idempotent** (auch im Hot-Path des
  Answer-Saves, der diese Funktion aufruft). ✓
- **`ensureDemoSeeded`** — In-Flight-Promise-Lock (Bug #13). ✓
- **`ensureKeyMeta`** — atomar (Iter. 37). ✓
- **`ensureAutomaticRiskRegister`** — **war** der Treffer (Bug #22), jetzt Advisory-Lock-geschützt. ✓

**Beobachtung #16 (niedrige Severity, NICHT gefixt):** `notifyAdminsAboutUpdate`
(`updateService.ts:275`) ist ein check-then-insert pro Admin (`select id from notifications where … and
entity_id = version` → skip, sonst `createNotification`) **ohne** Unique-Constraint/Lock. Aufrufpfad
ist u. a. der Notifications-Fetch (`notifications/routes.ts:92`, lazy Update-Check), also potenziell
nebenläufig (mehrere Admins/Tabs). Folge im Race: **doppelte „Update verfügbar"-Notifications** für
denselben Version-String. Severity sehr niedrig: rein **kosmetisch** (verwerfbar), Trigger **eng**
(nur wenn *gleichzeitig* gepollt wird **und** gerade eine neue Version vorliegt — seltenes Release-
Event). Sauberer Fix = Unique-Index `(recipient_user_id, type, entity_type, entity_id)` + `on conflict
do nothing` — aber ein Unique-Index-Migration **scheitert beim Anlegen, falls bereits Duplikate
existieren** (Boot-Bruch-Risiko, vgl. Bug #11), bräuchte also vorheriges Dedupe. Daher bewusst nur
notiert (Advisory-Lock wäre migrationsfrei, aber für ein kosmetisches, selten getriggertes Race
unverhältnismäßige Ceremony — „no security theater").

**Bekannt (Iter. 13):** Audit-Center Scope-Seed (`audit-center/routes.ts:257`, gated `count===0`) ist
ebenfalls check-then-insert, aber geringer Impact (user-editierbare Items) — unverändert.

**Ergebnis: kein neuer Code-Fix.** Die check-then-insert-Klasse ist abgedeckt: **#22 war die einzige
Instanz mit echtem (Hot-Path-) Impact**; der Rest ist on-conflict/deterministisch/gelockt oder
nachweislich niedrig-severity (Beobachtung #16).

---

## Iteration 61 — Konsolidierungs-/Regressions-Pass über alle Session-Änderungen (Iter. 43–60)

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 61)
- **Fokus:** Nach ~8 Fixes + Härtungen sicherstellen, dass alle Änderungen **zusammen** kompilieren
  und sich nichts gegenseitig gebrochen hat.

**Verifikation:**
- **`npx tsc -p tsconfig.json --noEmit` in `apps/api` → exit 0.**
- **`npx tsc -p tsconfig.json --noEmit` in `apps/web` → exit 0.**
- `git diff --stat` über die tracked-Quellen reviewt: die Session-Edits sind lokalisiert und additiv
  (Guards/Locks/Validierung/Aggregation). Keine neuen cross-modul-Imports → ESM-Resolution-Risiko
  gering (und ohnehin von `tsc` abgedeckt). Die Lizenz-Layer-Fixes (#15 `LicenseProvider`, #16
  `graceMs`) liegen in **untracked** Dateien (`apps/web/src/license/`, `apps/api/src/license/`) →
  erscheinen nicht in `git diff HEAD`, sind aber von `tsc` mitvalidiert (exit 0).

**Session-Fixes (Iter. 43–60), die jetzt gemeinsam grün kompilieren:**
- Backend: #16 `license/service.ts`, #17 `audit-center/routes.ts` (7 Handler), #18 `archive/service.ts`
  + `archive/files.ts` (+ manifest-first/restore-tolerance), #19 `cockpit/actions.ts`, #22
  `workflow/suggestions.ts`.
- Frontend: #15 `license/LicenseProvider.tsx`, #20 `ControlsPhasePage.tsx`, #21 `FindingsPhasePage.tsx`,
  PlanPhasePage-Vervollständigung (Iter. 43).

**Empfehlung (nicht autonom im Loop ausgeführt — schwergewichtig):** vor einem Release zusätzlich
`docker compose build api web` + Healthcheck (wie in Iter. 39/42), als stärkere Laufzeit-Verifikation
über `tsc` hinaus. `tsc` ist das etablierte Gate (kein Unit-Test-Framework, vgl. Iter. 41); die
Änderungen sind additiv und ohne neue Importpfade, daher ist das Build-Risiko niedrig.

**Ergebnis: kein neuer Bug; saubere Konsolidierung.** Alle Session-Änderungen kohärent & grün.

---

## Bug #23 — Dashboard-KPI „Critical Risks" zählt auch GESCHLOSSENE kritische Risks mit (Status-Asymmetrie) ✅ ERLEDIGT (verifiziert 2026-06-30)

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 62, Trace DashboardPage-Metriken)
- **Datei:** `apps/api/src/dashboard/routes.ts` (`risk_stats`-CTE)
- **Schweregrad:** Niedrig–Mittel (Dashboard-Korrektheit — überzählte „Critical Risks", KPI sinkt nicht beim Schließen)

### Beschreibung
Beim Trace der DashboardPage-Metriken zuerst die Stacked-Bar `["High", max(0, high − critical)]`
(`DashboardPage.tsx:477`) als **korrekt** bestätigt: `openHighRisks` ist backend-seitig **kumulativ**
(`rating in ('High','Critical')`, Z.186), also ergibt `high − critical` die reinen High-Risks. ✓

Dabei aber eine **Status-Asymmetrie in derselben Query** (`risk_stats`-CTE) gefunden:
- `open_high_risks`: `r.status not in ('closed','deleted')` — schließt **closed** aus. ✓
- `open_findings`: `f.status <> 'dismissed'` — schließt dismissed aus. ✓
- `critical_risks`: `r.status <> 'deleted'` — schließt **nur** deleted aus → **closed kritische Risks
  zählen mit.** ✗

Folge: Die Dashboard-Kachel „Critical Risks" (`totals.critical`) zählt **gelöste/geschlossene**
kritische Risks mit. Schließt ein Nutzer ein kritisches Risk, **sinkt die Zahl nicht** — die KPI
überberichtet dauerhaft und unterläuft den „Risks schließen → Dashboard wird grün"-Workflow. Bei
allen anderen aktuellen Dashboard-KPIs (open high, open findings) werden erledigte Items korrekt
ausgeschlossen — die Asymmetrie ist ein klares Versehen (vergessenes `'closed'` im Filter), kein
Design.

### Behebung
`critical_risks`-Filter auf `r.status not in ('closed','deleted')` gebracht — **konsistent** mit
`open_high_risks`. Damit zählt die KPI nur **offene** kritische Risks (die handlungsrelevanten).

### Verifikation
- `npx tsc -p tsconfig.json --noEmit` in `apps/api` → **exit 0**.
- Konsistenz: kritische und High-Risk-Counts der Dashboard-Query nutzen jetzt **denselben**
  Status-Ausschluss; ein geschlossenes kritisches Risk verschwindet aus beiden KPIs.

### Geprüft, aber unauffällig
- DashboardPage-Aggregationen (`totals`-`reduce` mit `?? 0`; Framework-Progress
  `progress / Math.max(1, count)`; `ProgressBar`-Clamp `Math.max(0, Math.min(100, …))`) — alle
  division-/NaN-sicher (deckt sich mit Iter. 6). `high − critical` korrekt (s. o.).
- **Kontext-Hinweis:** „Critical risks" wird je Feature unterschiedlich definiert — Workbench
  (`productivity/routes.ts:235`) zählt `rating='Critical'` **ohne** Status-Filter (bewusst „alle" im
  Risk-Workbench). Das ist ein **anderes** Feature mit anderer Intention; nur die **Dashboard**-KPI
  (aktueller Zustand, neben open-high/open-findings) war inkonsistent und wurde angeglichen.

---

## Bug #24 — „Open Findings" an 3 Stellen unterschiedlich (& je unvollständig) definiert — Dual-Status-Modell (`status` vs `lifecycle_status`) ✅ ERLEDIGT (verifiziert 2026-06-30)

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 63, Sweep Status-Filter-Asymmetrien nach Bug #23)
- **Dateien:** `apps/api/src/dashboard/routes.ts`, `apps/api/src/cockpit/routes.ts`, `apps/api/src/audit-center/routes.ts`
- **Schweregrad:** Mittel (KPI-Korrektheit — „offene Findings"-Zahl falsch, in beide Richtungen je nach View)

### Beschreibung
Findings haben **zwei** Status-Spalten: das **Legacy** `status` (`not null default 'suggested'`,
Werte u. a. `suggested`/`open`/`dismissed`) und das per 006-Redesign eingeführte
`lifecycle_status` (`not null default 'draft'`, Enum `draft…verified/closed`). Die Auflösungs-
/Resolution-Logik (`confirmed→…→verified/closed`) wird **nur** über `lifecycle_status` gepflegt
(`audit-center` Finding-PATCH Z.839 setzt **nur** `lifecycle_status`, nie `status`). Dismissal läuft
über `status='dismissed'`.

„Open Findings" war an **drei** Stellen **unterschiedlich** und **je unvollständig** definiert:
- **Dashboard** (`routes.ts:192`): `f.status <> 'dismissed'` → schließt dismissed aus, **zählt aber
  lifecycle-closed/verified als offen** (KPI sinkt nicht, wenn man ein Finding via Lifecycle schließt).
- **Cockpit** (`routes.ts:142`): `coalesce(lifecycle_status, status, 'open') not in
  ('closed','verified')` — da `lifecycle_status` **nie null** ist, ist der `coalesce`-Fallback **toter
  Code**; effektiv `lifecycle_status not in (...)` → **zählt dismissed-Findings als offen**.
- **Audit-Center** (`routes.ts:367/379`, Gaps-Liste + `openFindings`-Count → Readiness):
  `lifecycle_status not in ('closed','verified')` → **zählt dismissed als offen** (und als „Process
  Gap").

**Demo-Beweis:** Acme („completed audit") hat 2 **dismissed** Findings (lifecycle bleibt 'draft').
Dashboard zeigt korrekt **0** offen; Cockpit/Audit-Center zeigen fälschlich **2** offen → ein
„abgeschlossenes" Audit erscheint dort als „2 offene Findings". Umgekehrt erscheint ein via Lifecycle
**geschlossenes** Finding im Dashboard weiter als offen. Jede Stelle hatte die jeweils **andere**
Hälfte der korrekten Bedingung.

### Behebung
**Einheitliche** Definition überall: ein Finding ist offen ⇔
`status <> 'dismissed' AND lifecycle_status not in ('closed','verified')` (beide Spalten non-null →
kein coalesce nötig).
- Dashboard-SQL + Cockpit-SQL entsprechend angepasst (Cockpit: kaputtes `coalesce` ersetzt).
- Audit-Center: der identische Filter-Lambda an Gaps-Liste (367) **und** `openFindings`-Count (379)
  per `replace_all` um `String(finding.status) !== "dismissed" &&` ergänzt.

### Verifikation
- `npx tsc -p tsconfig.json --noEmit` in `apps/api` → **exit 0**.
- Jetzt zeigen Dashboard, Cockpit und Audit-Center **dieselbe** „offene Findings"-Zahl; dismissed
  **und** lifecycle-closed/verified Findings sind überall ausgeschlossen. Acme-Demo → überall 0 offen.

### Geprüft, aber unauffällig
- Andere Status-gefilterten Counts der `dashboard`-Query nach Bug #23 konsistent: `open_high_risks`
  & `critical_risks` (`not in ('closed','deleted')`), `overdue_items` (`not in ('closed','done')` +
  date-only `< current_date`), `evidence_gaps` (`score<=2 and evidence_status not in
  ('received','validated')`). ✓
- Workbench-Findings-Count (`productivity/routes.ts:239`, `status not in ('approved','dismissed')`) ist
  ein **anderes** Feature/Modell (Workbench-Records) — separat, nicht Teil der Audit-Findings-KPI.

---

## Bug #25 — „Beantwortet/Fortschritt"-Metrik: Cockpit-`readinessScore` weicht von Dashboard-`progressPercent` ab (fehlende `score`-Klausel) ✅ ERLEDIGT (verifiziert 2026-06-30)

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 64, Cross-View-Metrik-Sweep, Fortsetzung #24)
- **Datei:** `apps/api/src/cockpit/routes.ts` (`answered_count`)
- **Schweregrad:** Niedrig (KPI-Konsistenz; enger Datenfall)

### Beschreibung
Dieselbe „Anteil beantworteter Fragen"-Metrik wird an drei Stellen berechnet — die Definition von
„beantwortet" wich beim Cockpit ab:
- **Dashboard** `answered_questions` (`routes.ts:183`): `ca.score is not null or ca.answer_state <> 'unknown'`.
- **FrameworkLibrary** (`frameworks/routes.ts:502`): `score !== null || answer_state !== 'unknown'`. (identisch)
- **Cockpit** `answered_count` (`routes.ts:139`): **nur** `ca.answer_state <> 'unknown'` — **ohne** die
  `score is not null OR`-Klausel.

Folge: Eine **mit Score** versehene, aber explizit `answer_state='unknown'` markierte Frage zählt im
Dashboard-`progressPercent` **und** in der FrameworkLibrary als beantwortet, im Cockpit-
`readinessScore` aber **nicht** → die beiden Fortschritts-KPIs derselben Assessment weichen ab
(Cockpit unterberichtet). Enger Datenfall (Score gesetzt **und** Status „unknown"), daher niedrige
Severity — aber dieselbe systemische „Metrik mehrfach, leicht abweichend definiert"-Klasse wie #24.

### Behebung
Cockpit-`answered_count` an die **2-von-3-Mehrheit** (Dashboard + FrameworkLibrary) angeglichen:
`where … and (ca.score is not null or ca.answer_state <> 'unknown')`. Da `control_answers` pro Frage
**unique** ist (Upsert `on conflict (assessment_question_id)`), ist das `count(*)` des Cockpits
äquivalent zum `count(distinct …)` des Dashboards (keine Doppelzählung). Jetzt liefern alle drei
Stellen dieselbe „beantwortet"-Definition.

### Verifikation
- `npx tsc -p tsconfig.json --noEmit` in `apps/api` → **exit 0**.

### Hinweis (systemisch, siehe #24)
Erneut eine **duplizierte Metrik-Definition**, die gedriftet ist. Bestätigt die Empfehlung aus #24:
die Kern-Metriken (open findings, open/critical risks, overdue, answered/progress, readiness) sollten
in **einer geteilten Definition** (SQL-View oder Helper) zentralisiert werden, statt in
Dashboard/Cockpit/Audit-Center/Frontend je neu formuliert. `evidence_gaps` ist **nicht** betroffen
(nur im Dashboard berechnet, nicht dupliziert).

---

## Iteration 65 — Cross-View-Metrik-Seam abgeschlossen (overdue-roadmap + Risk-Counts single-source; kein neuer Bug)

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 65)
- **Fokus:** die letzten potenziell duplizierten Metriken prüfen → Seam schließen.

**Geprüft & als single-source (keine Drift) bestätigt:**
- **overdueRoadmapItems** — nur im Dashboard berechnet (`roadmap_stats.overdue_items`:
  `status not in ('closed','done') and due_date < current_date`, **date-only**, korrekt). `workflow/
  routes.ts:363` ist nur ein Einzel-Item-Load; **RoadmapPhasePage** re-derivt überfällig **nicht**
  (kein Frontend-Pendant). Keine Drift. ✓
- **critical/high Risk-Counts** — nur im Dashboard (`risk_stats`, nach #23 konsistent
  `not in ('closed','deleted')`). Cockpit `criticalCount` (Z.419/443) zählt **Next-Actions mit
  Severity 'critical'** (anderes Konzept, keine Risk-Zählung). Audit-Center liefert die Risk-**Liste**,
  keinen separaten Critical-Count. Keine Drift. ✓
- **evidence_gaps** — Dashboard-only (Iter. 64). ✓

**Fazit des Metrik-Seams (Iter. 55–65):** Die „Metrik mehrfach/abweichend definiert"-Klasse ist
abgearbeitet. Behoben: #19 (overdue evidence, Backend), #20 (received-evidence-overdue, Frontend),
#21 (remediation date-vs-datetime, Frontend), #23 (critical risks zählt closed), #24 (open findings,
3 Views), #25 (answered/progress, 3 Views). Verbleibend als **bewusste Beobachtung #14**: Readiness
= answered/questions (Cockpit) vs gewichtetes Composite (Audit-Center) — Produktentscheidung, kein
Bug. **Empfehlung weiterhin:** Kern-Metriken in eine geteilte Definition zentralisieren (verhindert
künftige Drift).

**Ergebnis: kein neuer Bug; Seam geschlossen.**

---

## Iteration 66 — Enum-Konsistenz Frontend-Dropdown ↔ Backend-Zod (kein neuer Bug; 1 Beobachtung)

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 66)
- **Fokus:** Bieten die Frontend-Status-Dropdowns Werte an, die das Backend per Zod-Enum ablehnt
  (oder umgekehrt)? Cross-Layer-Konsistenz.

**Geprüft & als KONSISTENT bestätigt:** Alle **12** Audit-Center-/Frameworks-Enums stimmen exakt mit
den Frontend-Arrays überein — `applicability`, `reviewStatus`, `readinessStatus`, request-`status`,
`lifecycleStatus`, `managementResponseStatus`, `remediationStatus`, `retestStatus`, report-`status`
(ControlsPhase/FindingsPhase/ReportPhase/AuditCenterPage) sowie `answerState`, `evidenceStatus`,
`confidenceLevel` (GuidedQuestionsPage). Saubere FE↔BE-Enum-Parität im neuen Code. ✓

### Beobachtung #17 (niedrige Severity, NICHT gefixt) — Legacy-Workflow-Schemas ohne Enum
Die **Legacy** Risk-/Finding-Schemas in `workflow/routes.ts` validieren `status`/`treatmentOption`
nur als `z.string().optional()` (Z. 92/102/106 sowie Bulk 133/139/142) — **kein** Enum, anders als
die strikten Audit-Center-Schemas. Das Frontend bietet feste Dropdowns (`riskStatuses
["open","in_treatment","accepted","closed"]`, `treatmentOptions`, `findingStatuses`), aber ein
direkter API-Call könnte beliebige Strings setzen.

**Severity niedrig, weil:** (a) der **Single**-Risk-PUT ist bereits durch den Legal-Transition-Graph
geschützt (`isLegalRiskTransition`, Durchgang #5 → 422 bei illegalem Ziel-/Quellstatus); (b) Daten
sind assessment-gescoped (eigene Daten, kein Cross-Tenant); (c) über die UI nie auslösbar (Dropdowns
senden nur valide Werte). Realer Rest-Gap nur am **Bulk**-Pfad (kein Graph, kein Enum): ein dort per
Direkt-Call gesetzter Junk-Status würde das Risk für Single-PUT-Transitionen **sperren** (unbekannter
Quellstatus blockt alle Übergänge) — recoverbar nur per erneutem Bulk. Kein Crash, kein Security-
Impact.

**Empfohlener Fix (nicht autonom):** die Legacy-Schemas auf Enums passend zu den FE-Dropdowns
tightenen (analog Bug #10 defensiv) — **erst** nach vollständiger Kartierung des legitimen
Status-Wertebereichs (inkl. interner Werte wie `'deleted'` aus dem Soft-Delete), um keine bestehende
Flow zu brechen. Wegen niedriger Severity + Regressionsrisiko an Legacy-Code bewusst als Beobachtung
notiert statt blind getightened.

**Ergebnis: kein neuer Bug.** FE↔BE-Enum-Parität im Kern (Audit-Center/Frameworks) ist exzellent; nur
die Legacy-Workflow-Schemas sind lose typisiert (niedrig-severity, dokumentiert).

---

## Iteration 67 — N+1-Query-Sweep (Performance-Klasse, neu): Read-Pfade sauber, kein N+1

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 67)
- **Fokus:** frische Klasse — Schleifen, die **pro Element** eine DB-Query absetzen (N+1) in
  Request-Read-Pfaden.

**Methode + Ergebnis:**
- Alle `for (… of …rows)` / `.map(async` / `.forEach(async` in `apps/api` durchgegangen.
- **Gezielter Grep** nach der N+1-Signatur (Query parametrisiert mit einer **Singular-Loop-Variable**:
  `query(…, [row.id|item.id|…])` in Read-Pfaden) → **0 Treffer.**
- Stichprobe der größten Read-Endpoints bestätigt das **Bulk-fetch-then-join**-Muster:
  - **Connector-Export** (`connectors/routes.ts:250–284`): 3 Bulk-Queries via `Promise.all`, danach
    rein **in-memory**-Gruppierung in Maps (`risksByAssessment`/`findingsByAssessment`/…) — **kein**
    Per-Row-Query. ✓
  - **Dashboard** (lateral joins), **Cockpit** (Subqueries), **Audit-Center-Overview**
    (`Promise.all([~20 Bulk-Queries])`, Iter. 49), **Customer-List** (`customerSelect` Single-Query):
    alle bulk. ✓
- Die per-Element-Query-Schleifen sind ausschließlich **Write-Pfade** (`rbac/seed`, `demoSeed`,
  `saveCustomerFrameworks`, Bulk-Customer-Import [limit-gegated], `ensureAuditDefaults`/
  `ensureAssessmentQuestions` [on-conflict], Archive-Bundle [admin/Hintergrund]) — inhärent und
  bounded, kein Request-Hot-Path-N+1.

**Ergebnis: kein neuer Bug.** Die Performance-/N+1-Klasse ist sauber — Read-Pfade nutzen durchgängig
Bulk-Queries + In-Memory-Joins (gute Architektur).

---

## Iteration 68 — Laufzeit-Verifikation: Docker-Build der Session-Änderungen (PASS)

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 68)
- **Fokus:** Die in Iter. 61 empfohlene stärkere Verifikation tatsächlich ausführen — bauen die
  ~13 Session-Edits in den echten Docker-Images (über `tsc` hinaus: Dockerfile-Schritte, vite-Bundle)?

**Durchführung & Ergebnis:**
- `docker` v29.5.2 vorhanden, Compose-Config valide (6 Services).
- `docker compose build audity-api audity-web` (im Hintergrund) → **exit 0**:
  `Image audity-audity-api Built`, `Image audity-audity-web Built`.
- Damit bestätigt: alle Session-Fixes (#15–#25, Archiv-Härtung, PlanPhasePage) **kompilieren und
  bundeln** in den produktiven Images — npm-Install, `tsc`-Build (api) und vite-Build (web) laufen
  fehlerfrei durch. Stärkste verfügbare Verifikation ohne vollständigen Stack-Run.

**Ergebnis: kein Bug; Laufzeit-Build der gesamten Session grün.** (Ein voller `compose up` +
Healthcheck über alle Services bliebe der finale Pre-Release-Schritt, braucht aber das komplette
Laufzeit-Umfeld — DB/Redis/Storage.)

---

## Iteration 69 — Frische Klassen: Regex (ReDoS/Injection) + Sort-Komparatoren — beide sauber

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 69; via 11:02-Fallback fortgesetzt, kein Doppel-Fire)
- **Fokus:** zwei bisher ungesweepte Klassen.

**A) Regex:**
- `new RegExp(…)` (dynamische Konstruktion aus User-Input) → **0 Treffer** codebasis-weit → kein
  Regex-Injection/ReDoS-from-input.
- ReDoS-typische verschachtelte Quantoren in Literalen → **0 Treffer**. Statische Regexes sind feste,
  entwickler-kontrollierte Muster (z. B. `^[a-f0-9]{64}$` für Hashes). ✓

**B) Sort-Komparatoren:**
- **Generischer `DataTable.compare`** (`components/ui/DataTable.tsx:43`) — korrekt: Empties (`null`/`""`)
  zuerst; `number`-Paare per `a-b`; sonst `localeCompare(…, { numeric: true, sensitivity: "base" })`
  → **natürliche** Sortierung (kein „1,10,2"-String-Bug). Deckt alle Tabellen ab. ✓
- Übrige Komparatoren: ISO-Datums-/Timestamp-Strings (`localeCompare`/lexikografisch korrekt für
  YYYY-MM-DD…), `Number(a)-Number(b)`, `compareVersions` (Semver), Severity-Sort (Iter. 55) — alle
  korrekt. Einzige Mini-Note: `DashboardPage:431` sortiert `String(a.targetDate)` — `null`-Dates
  würden als „null" einsortiert (kosmetische Randlage, keine echte Fehlfunktion).

**Ergebnis: kein neuer Bug.** Beide Klassen sauber.

---

## Iteration 70 — `useEffect`-Cleanup-Sweep (Memory-Leak-Klasse): sauber

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 70)
- **Fokus:** Effects, die Timer/Listener/EventSource/Subscriptions aufsetzen, **ohne** Cleanup-`return`
  (Memory-Leak + Handler-Feuern-nach-Unmount).

**Methode (count-basiert pro Datei):** `addEventListener` vs `removeEventListener`, `setInterval`/
`setTimeout` vs `clear*`, `new EventSource` vs `.close()`. **Nur eine Datei** mit Mismatch:
- **`AppLayout.tsx`** (`add=6 rem=5`) — vollständig erklärt: Z.164 `source.addEventListener(...)` hängt
  am **EventSource** und wird via `source.close()` (close=2) aufgeräumt, nicht per `removeEventListener`.
  Die 5 window/document-Listener (Command-Palette Z.99, Notifications-Dropdown Z.113,
  visibilitychange Z.197, Mobile-Nav open/toggle Z.611/612) haben **alle** ein passendes
  `removeEventListener` im Cleanup (Mobile-Nav-Effekt Z.613–616 hier verifiziert; Rest in Iter. 9
  geprüft). **Kein Leak.**

Alle übrigen Dateien (AuthProvider-Timer, NextActionBell-Interval, Modal/Toast/Slideover/Confirm-
keydown, MultiCombobox-mousedown, useUserTheme/useTooltips-Listener) sind **count-balanciert**
(Setup == Cleanup). ✓

**Ergebnis: kein neuer Bug.** Effect-Cleanup durchgängig korrekt.

> **Stand nach Iter. 70:** seit Bug #25 (Iter. 64) sechs aufeinanderfolgende **saubere** Sweeps
> (Enum, N+1, Docker-Build, Regex, Sort, Effect-Cleanup). Die Codebasis ist über alle geprüften
> Klassen robust; die Bug-Ausbeute ist erwartungsgemäß auf null gesunken (gesättigtes Audit).

---

## Iteration 71 — i18n-Key-Konsistenz: sauber (graceful Fallback)

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 71)
- **Fokus:** Zeigt eine fehlende Übersetzung dem Nutzer einen kaputten Roh-Key?

**Ergebnis:** Nein — `i18n.ts` `translate(label, lang)` = `translations[lang]?.[label] ?? label`.
Die **Keys sind die englischen Strings** selbst; English ist die Quelle (`{}` → gibt den Key zurück),
Deutsch übersetzt aus einer Map, sonst Fallback auf **lesbares Englisch**. Ein „kaputter Key"
(`page.foo.bar`) ist strukturell **unmöglich**. Ungültige Sprache → graceful Fallback. `currentLanguage`
validiert gegen `SUPPORTED`. **Kein Bug.**

**Mini-Beobachtung (kein Bug):** Die Deutsch-Map enthält nur ~48 Strings (v. a. Navigation/
Settings) — große Teile der UI erscheinen für deutsche Nutzer auf Englisch. Das ist eine
**Übersetzungs-Vollständigkeit** (Feature-/Übersetzungsaufwand), kein Korrektheits-Bug; das
Fallback-Verhalten ist korrekt.

**Ergebnis: kein neuer Bug** (7. saubere Iteration in Folge seit #25).

---

## Iteration 72 — Vollständigkeits-Re-Check der eigenen Session-Fixes → 4. #24-Stelle gefunden & behoben

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 72, 20-min-Kadenz)
- **Fokus:** Statt einer weiteren Sättigungs-Sweep: die **eigenen** Session-Fixes (#19–#25) codebasis-
  weit gegenprüfen — gibt es eine Stelle, die eine vereinheitlichte Metrik noch in der **alten**
  Definition verwendet?

### Treffer: `ensureAutomaticRiskRegister` nutzte die unvollständige Open-Finding-Definition
`workflow/suggestions.ts:107` (Kandidaten-Query für Auto-Risks) filterte Findings nur per
`f.status <> 'dismissed'` — **ohne** den Lifecycle-Ausschluss aus Bug #24. Folge: Für ein bereits
**aufgelöstes** Finding (`lifecycle_status` ∈ `closed`/`verified`), das zufällig **noch kein** Risk
hat (`r.id is null`), wäre beim nächsten Control-Answer-Save ein **neues Auto-Risk** erzeugt worden —
ein „offenes" Risk für ein erledigtes Finding. Niedrige Severity (enger Fall: resolved-Finding ohne
Risk), aber eine echte Inkonsistenz zur #24-Vereinheitlichung.

**Fix:** `and f.lifecycle_status not in ('closed', 'verified')` zur Kandidaten-Query ergänzt → die
Auto-Risk-Erzeugung nutzt jetzt **dieselbe** „offenes Finding"-Definition wie Dashboard/Cockpit/
Audit-Center (#24). `tsc` apps/api → **exit 0**.

### Mini-Beobachtung (Frontend, niedrige Severity, nicht gefixt)
`RiskLinkedFindings.tsx:86` filtert die zum Verlinken angebotenen Findings nur per
`f.status !== "dismissed"` — bietet also auch lifecycle-aufgelöste Findings zum Verknüpfen an. Sehr
niedrige Severity (Verlinken eines erledigten Findings an ein Risk ist ungewöhnlich, aber harmlos —
reine Referenz; „sollen resolved Findings verlinkbar sein?" ist eher eine Produkt-/Traceability-
Frage). Notiert, nicht autonom geändert.

### Bestätigt vollständig (alle anderen #24-Stellen korrekt)
Dashboard (192), Cockpit (142), Audit-Center (367/379) — alle mit der vereinheitlichten Definition;
`productivity/routes.ts:239` (Workbench) und `FindingsKanban.tsx:32` (Status-gruppiertes Board) sind
bewusst andere Konzepte. **Damit ist die #24-Klasse jetzt wirklich an allen 5 relevanten Stellen
konsistent.**

**Wert dieser Iteration:** der „eigene Fixes gegenprüfen"-Pass hat eine real übersehene Stelle
gefunden — bestätigt, dass Vollständigkeits-Re-Checks nach Cross-Cutting-Fixes sich lohnen.

---

## Iteration 73 — Vollständigkeits-Re-Check der Overdue-Fixes (#19/#20/#21): vollständig & konsistent

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 73, 20-min-Kadenz)

Nach dem #24-Treffer (Iter. 72) dieselbe Methode auf die Overdue-Definitionen angewandt:
- **#21-Klasse (Date-vs-Datetime auf Datums-Feldern):** codebasis-weiter Grep nach
  `new Date(x) < new Date()` → genau **1** Treffer (`customerAck/routes.ts:800`), und der ist auf
  `expires_at` — ein **echter Zeitstempel** (Token läuft zu einem präzisen Moment ab, kein
  Tagesrand) → Datetime-Vergleich **korrekt**, **nicht** der #21-Bug. ✓ Keine weitere Stelle.
- **Backend-Overdue:** alle date-only + korrekte Status-Sets — Remediation `< now()::date` (mit
  Status-Guard), Evidence `extract(day …) > 0` (#19-Fix), Roadmap `< current_date` +
  `not in ('closed','done')`, Workbench-Risk `< current_date` + `not in ('closed','accepted')`. ✓
- **Frontend:** berechnet Overdue **nicht** selbst — `InboxPage` reicht `overdueOnly` ans Backend
  (filtert auf `overdueBy > 0`), übrige Stellen zeigen nur Backend-Counts oder sind Eingabefelder.
  Der einzige eigene Frontend-Overdue-Filter (FindingsPhase, #21) ist date-only gefixt. ✓

**Ergebnis: kein neuer Bug.** Die #19/#20/#21-Klasse ist an **allen** Stellen konsistent (anders als
#24, das in Iter. 72 noch eine 4. Stelle hatte). Damit sind die Cross-Cutting-Fixes der Session
(#17 Iter. 50, #22 Iter. 60, #18 Iter. 54, #24 Iter. 72, #19/#20/#21 hier) vollständigkeits-geprüft.

---

## Iteration 74 — Trace `AuditCenterPage` (Legacy) → noch 2 #24-Stellen im **Frontend** gefunden & behoben

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 74, 20-min-Kadenz)
- **Datei:** `apps/web/src/pages/audit/AuditCenterPage.tsx` (Legacy-Audit-Seite, Route `/audit-center-legacy`)

Beim Trace der großen Legacy-Seite: Sie berechnet „offene Findings" **selbst** (im Gegensatz zur
aktuellen `CustomerAuditCenterPage`, die `openFindingCount` fertig vom Backend bezieht — dort nur
ein Typ-Feld, Z.48, **korrekt**). Drei Stellen nutzten die **alte** #24-Definition (nur
`lifecycleStatus`, ohne `status='dismissed'`-Ausschluss):
- **`openFindingCount`** (Z.662) und der inline „Open findings"-MiniStat (Z.915): zählten dismissed
  Findings als offen → über-berichtet. **Fix** (replace_all): `text(finding.status) !== "dismissed"
  &&` ergänzt. `finding.status` ist verfügbar (Overview mappt `select * from findings` → camelCase).
- **`findingsDone`** (Z.632, Workflow-Schritt „alle Findings erledigt?"): `every(lifecycle ∈
  closed/verified)` → ein voll **dismisster** Audit galt fälschlich als „nicht fertig". **Fix:**
  `|| text(finding.status) === "dismissed"` ergänzt (dismissed = erledigt).

### Verifikation
- `npx tsc -p tsconfig.json --noEmit` in `apps/web` → **exit 0**.
- **`CustomerAuditCenterPage` (aktuell) bezieht den Count vom Backend** (#24-korrekt) → keine Drift
  auf der Hauptseite; nur die Legacy-Seite hatte eine eigene (falsche) Berechnung.

### Status #24 — jetzt wirklich vollständig
Backend: Dashboard, Cockpit, Audit-Center-Overview (Iter. 63) + Auto-Risk-Kandidaten (Iter. 72).
Frontend: Legacy-`AuditCenterPage` (hier); `CustomerAuditCenterPage` nutzt Backend-Count. Die übrigen
Finding-Counts der Legacy-Seite (highSeverity/activeRemediation/readyRetest) sind andere Konzepte
(Severity/Remediation/Retest-Status), kein Open-Count. **Damit ist die #24-„offene Findings"-Definition
end-to-end (BE+FE) einheitlich.**

---

## Iteration 75 — Umfassender Frontend-Metrik-Re-Derivation-Sweep: #24 vollständig, Rest sauber/ambig-by-design

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 75, 20-min-Kadenz)
- **Fokus:** alle `overview.{findings,risks,controls,evidenceRequests}.filter(...)`-Count-
  Re-Derivationen im Frontend gegen die vereinheitlichten Backend-Definitionen prüfen (nach den
  #24-Funden in Iter. 72/74).

**Ergebnis:**
- **Open-Findings (#24):** alle Re-Derivationen gefixt (`AuditCenterPage` 662/915, Backend
  Dashboard/Cockpit/Audit-Center, Auto-Risk). `CustomerAuditCenterPage` nutzt Backend-Count. ✓
- **Übrige `AuditCenterPage`-Counts korrekt:** `reviewedControlCount`/`approvedControlCount`/
  `controlsWithEvidence`/`controlsWithJustification` (Control-Status), `activeRemediationCount`/
  `readyRetestCount` (inhärent aktive Status), „responded"-Count. ✓
- **Andere Pages:** `ControlsPhasePage`/`FindingsPhasePage`-Filter sind Tab-/Filter-Views
  (overdue #20/#21 bereits gefixt), keine driftenden Counts.

**Mini-Beobachtungen (Legacy-only, ambig, NICHT geändert):** Zwei Legacy-`AuditCenterPage`-Metriken
**ohne Backend-Pendant** (also keine Drift zu einer vereinheitlichten Definition):
`highSeverityFindingCount` (Z.663) zählt high/critical Findings **inkl. erledigter**, und
`openRequestCount` (Z.666, `!['closed','cancelled']`) zählt received/validated als „offen". Beide
sind eigenständige Legacy-Anzeige-Entscheidungen mit **ambiger** „richtiger" Definition (Severity-
Verteilung vs. aktuelle Last; „offen" = nicht-terminal vs. noch-wartend) — bewusst nur notiert, nicht
autonom an Legacy-Anzeige-Semantik geändert.

**Ergebnis: kein neuer klarer Bug.** Die #24-Metrik ist end-to-end konsistent; sonstige
Re-Derivationen sind korrekt oder bewusst-ambig (Legacy).

---

## Iteration 76 — Trace `AdminDashboardPage` (größte Seite, 2234 Z.): sauber

- **Datum/Uhrzeit:** 2026-06-30 (Loop-Iteration 76, 20-min-Kadenz)
- **Fokus:** die letzte große, nicht tief getracte Seite (Admin: User/Rollen/Backup/System).

**Geprüft & sauber:**
- **Rollen-Permission-Editing** (sicherheitsrelevantestes Stück): Drafts werden korrekt aus den
  aktuellen Permissions initialisiert (Z.400), der Permission-Toggle (Z.693–697) ist ein
  Standard-Immutable-`Set`-Add/Remove. `saveRolePermissions` sendet den Draft; Backend erzwingt, wer
  Rollen editieren darf + welche Permissions zuweisbar sind (Iter. 46/55). ✓
- **Übrige Handler** (loadUsers/inviteUser/resetUserPassword/updateUser/saveBranding/saveEmail/
  saveLogArchiveDestination/verifyHashChain/exportCsv) sind dünne Wrapper über backend-erzwungene
  Operationen. Defensives Laden (Log-Archival separat, graceful bei älterer API). ✓
- **Format-Helfer** (`formatBytes`/`formatUptime`) korrekt. (Mini-Note: Port-Parse Z.483
  `Number(f.port.trim())` kann NaN ans Backend senden bei nicht-numerischer Eingabe → Backend
  validiert; niedrigste Severity, UX.)

**Ergebnis: kein neuer Bug.** Die Seite ist ein dünnes Frontend über backend-erzwungene Admin-Ops.

> **Stand nach Iter. 76:** Jede große Seite ist getract, jede Bug-Klasse gesweept, alle Cross-Cutting-
> Fixes vollständigkeits-geprüft, der Docker-Build verifiziert. Das Audit ist **erschöpfend
> abgeschlossen** — 11 distinkte Bugs (#15–#25) behoben, #24 über 6 BE+FE-Stellen vereinheitlicht,
> Archiv-Härtung, 6 Beobachtungen (#12–#17) zur Nutzer-Entscheidung. Es gibt aktuell keine
> produktiven Hunting-Ziele mehr.

---

## Post-Abschluss Spot-Checks (Iter. 77+, 30-min-Kadenz, Loop läuft per Nutzer-Wunsch weiter)

Nur noch kurze Einzeiler — das Audit ist abgeschlossen, dies sind reine Bestätigungs-Checks
verbleibender Kleinst-Dateien:

- **Iter. 77 — `utils/format.ts` (app-weite Formatter):** sauber. `formatDate`/`formatDateTime`/
  `formatRelative` mit Null- **und** Invalid-Date-Guards (`Number.isNaN(getTime())` → `-`/`""`),
  locale-aware `Intl` (de-DE/en-GB), Standard-Relative-Buckets. Robust. ✓
- **Iter. 78 — `api/client.ts` (zentraler Fetch-Wrapper, von jedem Request genutzt):** sauber.
  Korrekte Bearer-/CSRF-Header (CSRF nur bei non-GET), Token-Refresh + **einmaliger** Retry bei
  401/`CSRF_INVALID`, intelligenter Logout **nur** bei echtem Session-Tod (`refreshFailed`), nicht
  bei per-Endpoint-403; `tokenRef` gegen Stale-Closures bei identitäts-stabilem Callback; graceful
  Body-Parse (204/non-JSON → null). ✓
- **Iter. 79 — `auth/AuthProvider.tsx` (Token-Refresh/Session):** sauber. **Single-Flight-Refresh**
  (`refreshInFlight`-Ref dedupt nebenläufige 401-Refreshes → macht den api-client-Refresh
  concurrency-sicher), Session-Clear bei Refresh-Fehler, proaktiver 12-min-Refresh-Timer mit Cleanup,
  Initial-Session-Restore beim Mount, MFA-bewusster Login. ✓ → Core-Infra-Trio (format/api-client/
  auth) durchweg robust.
- **Iter. 80 — `apps/api/src/utils/crypto.ts` (Krypto-Helfer):** sauber/textbook. **AES-256-GCM**
  (authentifiziert) mit zufälligem 12-Byte-IV pro Aufruf (keine Nonce-Reuse), Auth-Tag-Verify beim
  Decrypt (`final()` wirft bei Manipulation), SHA-256-Hashing, CSPRNG-`randomBytes` für Tokens;
  Key per SHA-256 aus dem Config-Secret abgeleitet (ok bei High-Entropy-Input). Kein Bug. ✓
- **Iter. 81 — `components/ui/ErrorBoundary.tsx`:** sauber/textbook. `getDerivedStateFromError` +
  `componentDidCatch`, Retry(`reset`)+Reload, `role="alert"`, zeigt nur `error.message` (kein
  Full-Stack-Leak in die UI). ✓
- **Iter. 82 — Working-Tree-Review der Session-Edits:** sauber. 11 tracked Edit-Dateien (genau die
  Bug-Fix-/Härtungs-/Vollständigkeits-Files), **keine** Debug-Leftovers (kein `console.log`/`debugger`/
  echtes TODO; der einzige „TODO"-Treffer ist beschreibender Kommentar in vorbestehendem
  Lizenz-Gating-Code). Untracked Lizenz-Files tragen #15/#16. Tree ist aufgeräumt & intentional
  (kein Commit ohne Nutzer-Auftrag). ✓
- **Iter. 83 — `components/ui/Toast.tsx` (Timer-Auto-Dismiss):** sauber. Per-Toast-Timer im
  `timers`-Ref, geclippt bei Dismiss **und** Provider-Unmount; eindeutige IDs; `durationMs===0` →
  persistent (kein Timer). Kein Leak. ✓
- **Iter. 84 — `components/ui/DataTable.tsx` (Pagination, alle Tabellen):** sauber. Korrekter Slice
  `(page-1)*pageSize`, `totalPages = max(1, ceil(len/pageSize))`, Reset-auf-Seite-1 bei
  Daten-/Size-/Sort-Wechsel, Page-Nav **doppelt geklammert** (`disabled` an Grenzen + `Math.min/max`)
  → `page` nie out-of-bounds; korrekte „X–Y von Z"-Anzeige; sort/pageSize persistiert (nicht page).
  (Compare-Fn schon Iter. 69 geprüft.) Kein Bug. ✓
- **Iter. 85 — `pages/LoginPage.tsx` (Auth-Entry + MFA):** sauber. Setup-Status-Redirect, Login→MFA-
  Conditional-Flow (`onSubmit` schaltet Handler via `challengeToken`), Error-/Loading-States (Buttons
  `disabled` → kein Doppel-Submit), korrekte autocomplete-Attribute, `challengeToken` ephemeral im
  State. Echte Auth in AuthProvider (Iter. 79). (UX-Note ohne Bug: kein „zurück zum Login" bei
  MFA-Challenge-Ablauf, aber Reload erholt sich.) Kein Bug. ✓
- **Iter. 86 — Batch-Scan Div-by-Zero/NaN (gesamtes Frontend):** sauber. Codebasis-weiter Grep nach
  Division durch potenziell-0-Nenner (`.length`/count/total/size) ohne Guard → **0 Treffer** (alle
  per `Math.max(1, …)`/`|| 1`/Ternär abgesichert). Schließt die Arithmetik-Safety-Klasse über **alle**
  Frontend-Dateien ab (auch nicht einzeln gelesene). Effizienter als Datei-für-Datei. ✓
  → **Restfläche pattern-seitig abgedeckt; es verbleiben keine ungeprüften Logik-Muster.**
- **Iter. 87 — Migrations-Idempotenz (frischer Winkel, restart-relevant):** sauber. Da der
  Migrations-Runner **jede** `.sql` bei **jedem** Boot ausführt (Kontext Bug #11), wäre ein
  nicht-idempotentes Statement ein Boot-Killer. Sweep: **alle** `create table`/`create (unique) index`/
  `add column` mit `if not exists`; **alle** 3 Daten-INSERTs (risk_finding_links-Backfill 006:23,
  settings 001:1007, log_archive_settings 009:42) mit `on conflict … do nothing`. Voll idempotent →
  Restart-sicher, keine PK-Violation beim Re-Run. Kein Bug. ✓
