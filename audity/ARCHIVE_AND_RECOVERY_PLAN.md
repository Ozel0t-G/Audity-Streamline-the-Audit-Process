# Audity Archive-System + Recovery-Phrase — Final Plan

**Status:** approved, ready for implementation
**Date:** 2026-06-21
**Owner:** maintainer

All recommendations from prior planning rounds are committed below.

---

## 0. Locked-in Decisions (from prior planning rounds)

| # | Decision | Choice |
|---|---|---|
| 1 | DB-vs-Volume split | **Hybrid**: DB rows stay with `archived_at`, evidence + reports move to volume |
| 2 | ZIP encryption | **AES-256-GCM with instance `AUDITY_ENCRYPTION_KEY`** |
| 3 | Cascade on archive | **Yes**: customer archive cascades to all its assessments |
| 4 | Cron for monthly bundle | **02:00 UTC on day 1 of following month** + manual "Force bundle" button |
| 5 | Restore approval permission | **Instance Admin only** (Tenant Admin can be added later via setting) |
| 6 | Recovery key path | **Option B**: BIP-39 24-word phrase shown once in setup wizard, mandatory acknowledgement checkbox |
| 7 | Per-bundle passphrase | Not in v1 (master-key only) |
| 8 | Key rotation | Not in v1 (documented limitation) |
| 9 | Schema versioning in ZIPs | `manifest.json` carries `audityVersion` + `schemaVersion` |
| 10 | Volume-at-rest encryption | Operator responsibility (LUKS / dm-crypt on mount point) |

---

## 1. Architecture

```
┌─────────────────┐       ┌──────────────────────────────────────────┐
│   Postgres      │       │  /app/archive/  (Docker volume)          │
│                 │       │                                          │
│ customers       │       │  spool/<customer-uuid>/                  │
│  └ archived_at  │       │   ├ manifest.json                        │
│  └ archived_by  │       │   ├ evidence/<object-key>                │
│  └ archive_     │       │   └ reports/<report-id>.pdf              │
│      reason     │       │                                          │
│                 │       │  bundles/                                │
│ assessments     │       │   ├ audity-archive-2026-04.zip.enc       │
│  └ archived_at  │       │   ├ audity-archive-2026-05.zip.enc       │
│                 │       │   └ ...                                  │
│ archive_index   │◄──────┤                                          │
│ archive_restore │       └──────────────────────────────────────────┘
│   _requests     │
│ encryption_key  │       ┌──────────────────────────────────────────┐
│   _meta         │       │  MinIO (audity-evidence bucket)          │
└─────────────────┘       │  ▶ Only ACTIVE evidence files            │
                          │  (archived files moved to volume)        │
                          └──────────────────────────────────────────┘
```

**Hybrid principle:**
- DB rows for archived customers/assessments stay in Postgres with `archived_at != NULL`. They become read-only and disappear from default views.
- Heavy artefacts (evidence files, generated PDF reports) move from MinIO into the volume.
- Monthly ZIPs contain both the file payload AND a JSON snapshot of the related DB rows — usable for full off-site disaster recovery.

---

## 2. Database schema

```sql
-- Customers + Assessments
alter table customers add column if not exists archived_by uuid references users(id);
alter table customers add column if not exists archive_reason text;
alter table assessments add column if not exists archived_at timestamptz;
alter table assessments add column if not exists archived_by uuid references users(id);
create index if not exists idx_customers_archived_at on customers(archived_at);
create index if not exists idx_assessments_archived_at on assessments(archived_at);

-- Where is each archived customer
create table if not exists archive_index (
  customer_id      uuid primary key references customers(id),
  archived_at      timestamptz not null,
  archived_by      uuid not null references users(id),
  archive_month    text not null,                -- 'YYYY-MM' bucket
  archive_state    text not null,                -- 'spool' | 'bundled' | 'exported'
  spool_path       text,                         -- /app/archive/spool/<id>/  (NULL when not on volume)
  bundle_filename  text,                         -- 'audity-archive-YYYY-MM.zip.enc'
  bundle_checksum  text,                         -- SHA-256 of the encrypted bundle (hex)
  manifest_json    jsonb not null,               -- summary so the UI can list without reading ZIP
  size_bytes       bigint not null default 0,
  exported_at      timestamptz,                  -- when admin downloaded + marked exported
  notes            text
);
create index if not exists idx_archive_index_month on archive_index(archive_month);
create index if not exists idx_archive_index_state on archive_index(archive_state);

-- User restore requests → admin approval
create table if not exists archive_restore_requests (
  id              uuid primary key,
  customer_id     uuid not null references customers(id),
  requested_by    uuid not null references users(id),
  reason          text not null,
  status          text not null default 'pending',  -- 'pending'|'approved'|'denied'|'completed'
  requested_at    timestamptz not null default now(),
  resolved_by     uuid references users(id),
  resolved_at     timestamptz,
  resolution_note text
);
create index if not exists idx_archive_restore_status on archive_restore_requests(status);

-- Recovery-key metadata
create table if not exists encryption_key_meta (
  id               int primary key default 1,
  fingerprint      text not null,                -- first 8 hex bytes of SHA-256(key)
  setup_at         timestamptz not null default now(),
  acknowledged_at  timestamptz,                  -- when operator confirmed they saved the phrase
  acknowledged_by  uuid references users(id),
  check (id = 1)
);
```

---

## 3. Volume layout & compose

`docker-compose.yml` + `docker-compose.prod.yml`:
```yaml
services:
  audity-api:
    volumes:
      - audity-archive:/app/archive
  audity-worker:
    volumes:
      - audity-archive:/app/archive
volumes:
  audity-archive:
```

Operator override (for moving to bigger disk):
```yaml
volumes:
  audity-archive:
    driver_opts:
      type: none
      device: /mnt/big-disk/audity-archive
      o: bind
```

Inside the container:
```
/app/archive/
├── spool/<customer-uuid>/
│   ├── manifest.json
│   ├── evidence/<object-key>
│   └── reports/<report-id>.pdf
└── bundles/
    └── audity-archive-YYYY-MM.zip.enc
```

`manifest.json` (per customer) contains:
```json
{
  "audityVersion": "0.1.5",
  "schemaVersion": 1,
  "customerId": "uuid",
  "customerName": "...",
  "archivedAt": "2026-04-15T11:23:00Z",
  "archivedBy": "admin@audity.local",
  "reason": "...",
  "evidenceCount": 23,
  "reportCount": 4,
  "assessmentIds": ["uuid-1", "uuid-2"],
  "fingerprint": "a89f2c11e37841b2"
}
```

---

## 4. Workflows

### 4.1 Archive a customer

1. User opens Customer Detail → 3-dot menu → "Archive customer..."
2. Slideover requires `reason` (free text)
3. `POST /api/customers/:id/archive { reason }` — synchronous response, async worker job for the file move
4. Worker job:
   1. `customers.archived_at = now()`, `archived_by`, `archive_reason`
   2. **Cascade**: `assessments.archived_at = now()` for all assessments of this customer
   3. Stream every evidence object from MinIO → `spool/<id>/evidence/<key>`
   4. Stream every report blob → `spool/<id>/reports/<id>.pdf`
   5. Delete the MinIO objects (volume is now source of truth)
   6. Write `spool/<id>/manifest.json`
   7. `INSERT archive_index (state='spool', archive_month=YYYY-MM)`
   8. `appendActivityEvent('customer.archived')` + `publishEmailTopic('archive.customer.archived')`
5. Customer disappears from default lists, appears in `/archive`

### 4.2 Monthly bundle (cron + manual)

- Cron in worker: daily at **02:00 UTC**, runs only if `day == 1`
- Manual: `POST /api/admin/archive/bundle/:month` (Instance Admin)
- Logic:
  1. `SELECT customer_id FROM archive_index WHERE archive_state='spool' AND archive_month=<target>`
  2. For each customer:
     - Read `spool/<id>/` recursively
     - Dump related DB rows (customer, assessments, control_answers, risks, findings, evidence meta, reports meta, customer_shares) → gzipped SQL inside the ZIP
     - Pipe into ZIP stream
  3. AES-256-GCM encrypt with `AUDITY_ENCRYPTION_KEY` → `bundles/audity-archive-<month>.zip.enc`
  4. SHA-256 of the encrypted file
  5. `UPDATE archive_index SET archive_state='bundled', bundle_filename=..., bundle_checksum=...`
  6. Delete `spool/<id>/` for all bundled customers
  7. `publishEmailTopic('archive.bundle_created')`

### 4.3 Admin downloads bundle

- `GET /api/admin/archive/bundles/:month/download` returns a signed URL (10 min TTL) for the encrypted ZIP
- Admin can click "Mark as exported" → `archive_state='exported'`, `exported_at=now()`, delete local file

### 4.4 User requests restore

1. `/archive` → Customer card → "Request restore" → reason modal
2. `POST /api/customers/:id/restore-request { reason }` → `INSERT archive_restore_requests (status='pending')`
3. `publishEmailTopic('archive.restore_requested')` → Admin gets email
4. UI shows "Restore pending approval" with timestamp

### 4.5 Admin approves restore — three paths

`POST /api/admin/archive/restore-requests/:id/approve`:

- **State `spool`**: copy `spool/<id>/evidence/*` → MinIO; copy `spool/<id>/reports/*` → MinIO; set `customers.archived_at = NULL`; set all `assessments.archived_at = NULL`; `DELETE FROM archive_index`; `DELETE` spool folder; `archive_restore_requests.status='completed'`; `publishEmailTopic('archive.restore_approved')`.
- **State `bundled`** (ZIP still on volume): worker decrypts `bundles/<month>.zip.enc` → temp folder → then like spool case → cleanup temp.
- **State `exported`** (ZIP off-site): API responds `409 ARCHIVE_OFFLINE` with message naming the bundle filename. Admin must re-upload first.

### 4.6 Admin re-imports an off-site ZIP

1. `/admin/archive` → Tab "Import ZIP" → file upload
2. `POST /api/admin/archive/import` (multipart):
   1. AES-256-GCM decrypt with current `AUDITY_ENCRYPTION_KEY` — fails fast if key doesn't match
   2. Compute SHA-256 of incoming file
   3. Look up `archive_index` rows by filename: if checksum matches recorded one, accept
   4. If no DB entry exists (orphan ZIP from earlier instance), parse manifests inside and offer "Adopt" mode that recreates `archive_index` rows
   5. Write file to `bundles/`
   6. `UPDATE archive_index SET archive_state='bundled'` for all customers in that bundle
   7. `publishEmailTopic('archive.zip_import_completed')`
3. Pending restore requests for those customers can now be approved.

---

## 5. UI components

### 5.1 New user sidebar entry — `/archive`

Position: between "Shared Customers" and the conditional "Active customer" section.

- Card list of all archived customers the user has access to (owned + shared)
- Per card: name, archived at, archived by, reason, state badge (`In volume` / `Bundled` / `Off-site`)
- Actions:
  - **Open (read-only)** → customer detail in read-only mode
  - **Request restore** → reason modal
- If a restore request is pending: yellow pill "Restore requested 2 days ago, awaiting admin"

### 5.2 Customer / Assessment detail — read-only mode

When `archived_at != NULL`:
- Yellow banner at top: "This customer is archived (read-only). Archived 2026-04-15 by Tom Lehmann — Reason: Audit cycle 2026 closed. [Request restore]"
- All write controls disabled with tooltip "Customer is archived"
- Evidence downloads continue to work — fetched from spool or extracted from ZIP on demand

### 5.3 New admin page — `/admin/archive`

Four tabs:

1. **Restore Requests** — pending list, approve/deny actions, customer-link
2. **Monthly Bundles** — bundle list with filename, size, checksum (short), customer count, state. Per row: Download, Mark exported, Force re-bundle, View included customers
3. **Import ZIP** — file upload, validation preview before commit ("Customer X (4 assessments, 23 evidence files) — checksum matches")
4. **Index** — full archive_index table with filter (month / state / customer name / date range), CSV export of metadata only

Permission: `archive.approve` (new). Default assignment: Instance Admin only.

---

## 6. Recovery-key (Option B)

### 6.1 First-time setup wizard

Inserted as a new step between the existing Step "Encryption check" and "Create admin user":

```
Step 3 of 5 — Encryption Recovery Phrase

Audity encrypts sensitive data with a master key. Without this key,
encrypted archives and backups cannot be restored after a fresh install.

Write the 24 words below down NOW. Store them in a password manager,
safe, or printed envelope. Audity will NEVER show them again.

  1. forest    2. velvet    3. mountain   4. coral
  5. lantern   6. oxygen    7. bridge     8. apricot
  9. garnet   10. silver   11. pioneer   12. echo
 13. lattice  14. orchard  15. fragment  16. quartz
 17. trellis  18. domino   19. cascade   20. ember
 21. notation 22. willow   23. vellum    24. resolute

Fingerprint:  a8 9f 2c 11 e3 78 41 b2  (also shown in System Monitor)

☐ I've saved this phrase in a secure location and understand
  that losing it makes all encrypted Audity data unrecoverable.

[Print this page]  [Copy to clipboard]      [Continue →]
```

- Continue button stays disabled until checkbox is ticked
- On continue: `INSERT encryption_key_meta { fingerprint, acknowledged_at=now(), acknowledged_by=user.sub }`
- Phrase is the BIP-39 encoding of the existing `AUDITY_ENCRYPTION_KEY` (deterministic — same key = same phrase)
- Print uses a minimal print-stylesheet (only phrase + fingerprint visible)

### 6.2 Restore-from-phrase wizard

Surfaced on the login page **only when the instance has no users yet** (fresh install):

```
Restore Audity from Recovery Phrase

Enter the 24-word recovery phrase from your previous instance. Audity
will set up encryption so you can import archived data and backups
from your old installation.

  Word 1:  [forest    ]    Word 13: [lattice  ]
  Word 2:  [velvet    ]    Word 14: [orchard  ]
  ...
  Word 12: [echo      ]    Word 24: [resolute ]

Expected fingerprint (optional, for verification):
  [_ _ _ _ _ _ _ _]

[← Cancel]                                  [Restore key →]
```

- Each word input has BIP-39 wordlist autocomplete to prevent typos
- On submit: decode phrase → key bytes → write `AUDITY_ENCRYPTION_KEY` to a runtime override (or instruct operator to update `.env` and restart)
- If optional fingerprint is filled in, verify before commit and block on mismatch
- After restore: operator lands in empty Audity that can decrypt the old ZIPs

### 6.3 CLI for existing instances

```
docker exec audity-api node apps/api/dist/scripts/print-recovery-phrase.js
```

Output:
```
Audity instance recovery phrase
================================

  1. forest    2. velvet    3. mountain   4. coral
  ...

Fingerprint:  a8 9f 2c 11 e3 78 41 b2

⚠  This is a one-time print. Store it securely.
```

### 6.4 Fingerprint display

`Admin Panel → System Monitor → Server status` adds a row:

```
Encryption-Key Fingerprint:  a8 9f 2c 11 e3 78 41 b2
                             (matches recovery phrase from 2026-04-15)
```

Operator can visually verify after a restore that the right phrase was entered.

---

## 7. Email topics (reuse #17 infra)

| Topic ID | Default subscribers | Trigger |
|---|---|---|
| `archive.customer.archived` | (none by default) | Customer archived |
| `archive.restore_requested` | Instance Admin | User submitted restore request |
| `archive.restore_approved` | requester | Admin approved |
| `archive.restore_denied` | requester | Admin denied (with note) |
| `archive.bundle_created` | Instance Admin | Monthly bundle finished |
| `archive.zip_import_completed` | Instance Admin | Off-site ZIP successfully re-imported |

All topics flow through `publishEmailTopic()` in `apps/api/src/notifications/emailTopics.ts`.

---

## 8. Security

- Volume permissions: api/worker user (uid 1000) reads/writes only; container-external access requires sudo/SSH
- ZIP encryption: AES-256-GCM with `AUDITY_ENCRYPTION_KEY` derived key; per-ZIP IV in header
- Checksum: SHA-256 of the encrypted file stored in `archive_index.bundle_checksum`. Re-import verifies before accepting
- Write-guard: new middleware `requireActiveCustomer` rejects writes against archived customers with `409 ARCHIVED_READ_ONLY`. Applied to ~15 endpoints (customers, assessments, control answers, risks, findings, evidence, reports, roadmap)
- Audit trail: archive / restore / hard-delete / ZIP-export / phrase-acknowledge are unmodifiable activity events in `audit_logs`
- Volume-at-rest: documented operator responsibility — recommend LUKS / dm-crypt on the mount point in DEPLOYMENT.md

---

## 9. Limitations (documented in DEPLOYMENT.md)

- **No key rotation** in v1. If `AUDITY_ENCRYPTION_KEY` is compromised, the only remediation is a fresh instance + re-import of data with the new key. ZIPs from the old instance remain decryptable with the old key.
- **No tenant-isolated encryption keys** — instance-wide single key.
- **Volume contents are not encrypted at rest by Audity**. Only the bundle ZIPs are encrypted. Spool folders are plaintext on disk. Recommend mounting the volume on an encrypted filesystem (LUKS, FileVault, BitLocker).
- **No automatic retention deletion** in v1. Bundles stay on the volume until the admin manually marks them exported. Cron-based auto-delete with prior email warning is planned for v2.
- **Schema migration**: ZIP manifests carry `audityVersion` + `schemaVersion`. Restore supports the current and previous major version. Older ZIPs surface a "Please upgrade through intermediate Audity version first" error.

---

## 10. Implementation phases

| Phase | Scope | LoC | Days |
|---|---|---:|---:|
| **P1** | Recovery-Phrase infra: `encryption_key_meta` migration, BIP-39 ↔ key converter, Fingerprint compute, CLI script | 240 | 2 |
| **P2** | Setup-wizard pages: "Save phrase" (with checkbox gate, print stylesheet) + "Restore from phrase" (with BIP-39 autocomplete) + Fingerprint row in System Monitor | 450 | 2 |
| **P3** | Archive DB schema (migrations) + backend endpoints: archive, restore-request, list, admin-approve, admin-deny, bundle, download, import, mark-exported | 780 | 4 |
| **P4** | File-move engine: MinIO ↔ volume, ZIP-encrypt / ZIP-decrypt, spool layout, manifest.json | 400 | 2 |
| **P5** | User-UI `/archive` (list + restore-request modal) + read-only banners in Customer-Detail and Audit-Center + write-guard middleware on all relevant routes | 550 | 2.5 |
| **P6** | Admin-UI `/admin/archive` tabs 1 (Restore Requests) + 4 (Index) | 400 | 2 |
| **P7** | Monthly-bundle cron in worker + Tab 2 (Bundles + download + mark-exported + force re-bundle) | 270 | 2 |
| **P8** | ZIP re-import + Tab 3 (Import ZIP with validation preview) | 230 | 1.5 |
| **P9** | Email topics + activity events + DEPLOYMENT.md "Disaster Recovery" chapter + tests + polish | 250 | 1.5 |

**Total:** ~3570 LoC, ~17.5 person-days, ~3.5 weeks full-time.

**Ship order intent:**
- P1 + P2 ship together as a first deployable: recovery phrase is live, no archive feature yet. Operators can secure their key immediately.
- P3 + P4 + P5 ship together: customers can archive and request restore; admin approves manually from DB or via P6.
- P6 + P7 + P8 ship together: full admin UX including monthly bundles and re-import.
- P9 closes the loop.

---

## 11. What works after this plan / what doesn't

### ✅ Works

- Archive a customer through UI; cascade to all its assessments; files move into volume
- Separate Docker volume that the admin can mount on bigger storage
- Monthly ZIP bundles auto-created at 02:00 UTC on day 1 (+ force-bundle button)
- Bundles are AES-256-GCM encrypted with instance key
- User sidebar lists their archived customers, can submit restore requests
- Admin sees requests, approves, system auto-fetches from volume or asks for ZIP re-upload
- Off-site ZIPs can be re-imported with checksum verification
- DB index tracks every customer's archive location precisely
- Recovery phrase shown once at setup; restore-from-phrase wizard re-establishes the key on a fresh instance
- Fingerprint visible in System Monitor for visual verification

### 🟡 Caveats

- Cross-customer sharing: archiving customer X also archives its presence in everyone else's "shared" view
- Very large customers (>10 GB evidence) take minutes to archive; runs in background with progress
- Schema migration over versions: supports current + previous major; older ZIPs surface a clear error
- Concurrent admins: first approve wins, second receives 409

### 🔴 Out of scope for v1

- Key rotation
- Tenant-isolated encryption keys
- Volume-at-rest encryption (operator concern)
- Automatic retention-based deletion
- Per-bundle additional passphrase

---

## 12. Ready to execute

This document is the canonical plan. All open decisions are closed. The implementation can proceed in phase order P1 → P9. Recovery phrase (P1 + P2) is the first deliverable; the rest builds on top.
