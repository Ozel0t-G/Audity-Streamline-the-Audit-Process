<img width="771" height="280" alt="audity-lockup-dark" src="https://github.com/user-attachments/assets/c0db9260-437c-4860-ab6d-270197e4b040" />

# Audity — Self-Hosted Audit & GRC Assessment Platform

**Audity takes a security/compliance audit from first scoping to the customer's final signature — in one place, on your own infrastructure.**

It is built for security consultants, GRC professionals, CISOs, and internal audit teams who run real assessments against real frameworks and need the result to be traceable, defensible, and private.

---

## Why I built Audity

Running a security audit is not one task — it is a dozen tangled ones. You scope the engagement, pull the right control set for the framework, ask the questions, collect evidence, write findings, score risks, build a remediation roadmap, write the report, and finally get the customer to acknowledge it. In most shops this happens across a spreadsheet here, a Word template there, an email thread for evidence, and a separate file for the risk register.

That approach has three problems I kept running into:

1. **Nothing is connected.** A finding lives in one document, the control it relates to in another, the risk it feeds in a third, and the roadmap action in a fourth. Keeping them consistent is manual, and manual means drift and mistakes.
2. **It doesn't scale across customers or frameworks.** The moment you serve several clients, or map one client against ISO 27001 *and* NIS2, the spreadsheet model collapses.
3. **The data is sensitive — and it ends up everywhere.** Audit data is some of the most sensitive a company holds (its weaknesses, in writing). Pushing it into yet another SaaS cloud is exactly what most clients don't want.

**Audity solves this by giving the whole audit lifecycle a single, connected structure that you host yourself.** You pick a customer, pick (or create) an audit, and from there one tabbed workspace carries you through every phase — scope, controls & evidence, findings, risk register, roadmap, report & sign-off, and evidence/reports. Each step feeds the next, every change is recorded in a tamper-evident log, and nothing leaves your servers.

> Audity is an **assessment** platform, not a certification authority. It won't declare anyone "ISO 27001 certified." It helps you run a thorough, traceable assessment and produce documentation a professional can stand behind.

![Customer Audit Center](docs/screenshots/customer-audit-center.png)
*The Customer Audit Center: customer master data, contacts, and every audit for that customer in one hub.*

---

## Security & Data Protection

Audity holds an organization's weaknesses in writing, so security is not a feature — it is the foundation. This section is intentionally detailed.

### Authentication & sessions

- **Password hashing with Argon2id** everywhere a secret is stored: account login, password changes, and MFA recovery codes. No reversible storage, no fast hashes.
- **Admin-provisioned one-time passwords.** When an admin invites a user, the backend generates a 24-character password from a CSPRNG with guaranteed complexity (upper/lower/digit/symbol) and shows it exactly once. Admins cannot set a weak starter password from the UI.
- **JWT access tokens (HS256)** signed with the application secret, short-lived (**15 min**), carrying only `sub` and session id.
- **Refresh-token rotation.** Refresh tokens live **30 days**, are stored only as SHA-256 hashes, and are **single-use**: every refresh revokes the old token and issues a new one. Concurrent refreshes are de-duplicated client-side so a burst of requests can't trip the rotation and force a spurious logout.
- **Cookies are `httpOnly` + `SameSite=strict`** for the refresh token; the access token is kept in memory only.
- **Multi-factor authentication (TOTP)** with QR enrolment, plus **single-use recovery codes** (Argon2id-hashed, consumed under a row lock so a code can't be redeemed twice). The MFA challenge token is its own short-lived (5 min), purpose-scoped JWT.

### Authorization & multi-tenancy

- **Role-based access control** with seven roles (Instance Admin, Tenant Admin, Assessment Manager, Auditor, Contributor, Reviewer, Viewer) and fine-grained permissions enforced on every mutating route.
- **Per-customer / per-assessment access control.** Beyond the role check, every customer- and assessment-scoped route runs `canAccessCustomer` / `canAccessAssessment`: access requires being the owner or holding an explicit, non-revoked share (`customer_shares`). Admins are scoped explicitly. This prevents horizontal (IDOR-style) access across tenants.
- **CSRF protection.** All state-changing requests require a session-bound CSRF token (`X-CSRF-Token`) validated server-side; the SPA attaches it automatically.
- **Sensitive admin actions are gated to Instance Admin + CSRF** — e.g. triggering an in-app update.

### Rate limiting & abuse resistance

- **Redis-backed rate limiting** on authentication, token refresh, and the public customer-acknowledgement portal, to blunt brute-force and token-guessing.

### Data at rest & secrets

- **AES-256-GCM** for secrets and sensitive payloads at rest (e.g. stored SMTP credentials, encrypted export packages) — authenticated encryption, so tampering is detected via the GCM auth tag.
- **Key separation is enforced.** In production Audity **refuses to start** if `AUDITY_APP_SECRET` or `AUDITY_ENCRYPTION_KEY` are missing, default, weak (< 32 chars), or identical to each other. Insecure defaults are only tolerated outside production and can't slip into a real deployment.

### Input handling & injection resistance

- **Parameterized SQL throughout.** No string-built queries; user input never reaches the query text. Identifier-scoped updates always bind both the resource id **and** its parent (e.g. `where id = $1 and assessment_id = $2`) so sub-resources can't be addressed across assessments.
- **Schema validation with Zod** on request bodies.
- **No `eval`, no `child_process`/shell execution** in the application code.
- **No raw HTML injection** on the frontend — no `dangerouslySetInnerHTML` / `innerHTML`; user-supplied text in generated emails is HTML-escaped.

### Integrity & auditability

- **Tamper-evident activity log.** Every event is hash-chained (`event_hash = sha256(timestamp + actor + action + entity + payload + prev_hash)`) and appended under a Postgres advisory lock so the chain can't fork under concurrency. Altering or removing a past entry breaks the chain and is detectable.
- **Audit sign-offs carry their own event hash**, binding the signer, statement, report version, and timestamp.
- **Atomic imports.** Importing an audit package writes the customer, assessment, findings, risks, roadmap, reports, and evidence inside a single database transaction — a partial failure rolls back cleanly instead of leaving orphaned records.
- **Mandatory off-database log archival.** The audit log and activity log are archived automatically **every 24 hours** into an AES-256-GCM-encrypted, HMAC-signed, hash-chained `.audity-logs` bundle. It is wired into API boot and **cannot be disabled** by any user or admin — only the destination (local WORM dir, SFTP, S3-compatible, or FTP/FTPS) can be changed, and that change is itself audited. So even a full database loss or a compromised admin account can't erase the trail. See `DEPLOYMENT.md`.
- **Idempotent, versioned migrations** applied deterministically on boot.

### Customer-acknowledgement portal

The public sign-off portal (magic link) is hardened independently:

- Tokens are **random 256-bit values, stored only as SHA-256 hashes**, with an **expiry**, a **revoke** path, and a **max number of concurrent pending tokens** per recipient.
- Redemption is **single-use and atomic** — the token is claimed with a guarded `UPDATE` so two concurrent submits can't both produce a sign-off.
- Each token pins an **immutable snapshot** of the report at issue time, so the customer signs exactly what they were shown.

### Encrypted export / import & backups

- Assessment and report packages are exported as **AES-256-GCM-encrypted containers** with a **SHA-256 integrity checksum**; import verifies both before touching the database.
- Backup/restore is permission-gated and tracked in the audit log.

### Transport & web hardening

- The web tier ships strict response headers (`X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, a restrictive `Permissions-Policy`), serves JS/CSS/HTML with `no-cache` to avoid stale-bundle issues, and blocks direct access to source maps and config files.

### Supply chain & updates

- **Dependency hygiene:** advisories are tracked and patched; transitive risks are pinned via npm `overrides`. `npm audit` is kept clean.
- **Self-update** is Instance-Admin-only + CSRF, validates the update manifest's channel/branch, and delegates the actual image rollout to a separate, token-authenticated updater service — the app never shells out.

### Self-hosting = data residency by default

Audity runs entirely on your own infrastructure (Docker). Client audit data — findings, evidence, risks, reports — never leaves your servers. There is no vendor cloud in the path.

---

## What you can do, and how

### 1. Set up a customer

Open the **Customer Audit Center** for a customer. Here you maintain the customer's master data (industry, regulatory context, address, website, notes) and **structured contacts** (name, role, email, phone), and you see every audit that exists for that customer. Click an audit to enter it.

### 2. Work the audit through one tabbed workspace

Inside an audit, a single tab bar carries the whole lifecycle — the currently selected audit is always shown by an **"Active audit"** badge:

| Tab | What you do |
|-----|-------------|
| **Plan & Scope** | Timeline, audit owner, reviewer, scope items. Gate: kickoff + owner set, ≥1 in-scope item. |
| **Controls & Evidence** | Domain-based control questions with 0–5 maturity scoring, evidence mapping, sampling, interviews. |
| **Findings** | Lifecycle, severity, management response, remediation, re-test. |
| **Risk Register** | 5×5 likelihood × impact matrix, treatment, findings linked to risks. Below it: a simple findings list (finding · L · I · mapped control + its description · free-text note) — **exportable, together with the register, as one Excel workbook**. |
| **Roadmap** | Sequenced remediation actions across Now / Soon / Mid / Long, drag-to-reprioritize and delete. |
| **Report & Sign-off** | Modular report builder, Statement of Applicability, branded PDF export, signatures. |
| **Evidence & Reports** | Evidence file management and report assets. |

![Risk Register](docs/screenshots/risk-register.png)
*Risk Register tab: the 5×5 matrix on top, the collapsible findings list (L/I, mapped control, notes, Excel export) below.*

![Findings](docs/screenshots/findings.png)
*Findings: lifecycle, severity matrix, management response, remediation and re-test.*

### 3. Use the right framework

Audity ships **32+ control frameworks** as versioned YAML, including ISO/IEC 27001:2022 Annex A, NIST CSF 2.0, NIST SP 800-53 / 800-171, CIS Controls v8.1, EU NIS2, EU DORA, EU GDPR, EU AI Act, HIPAA Security Rule, PCI DSS 4.0.1, BSI C5 / IT-Grundschutz, OWASP ASVS/SAMM, MITRE ATT&CK/D3FEND, and many national baselines. You can **import your own** framework via YAML or CSV (with auto-delimiter detection and comment support), and optionally use **AI-assisted enrichment** to draft control questions/guidance (LLM provider is optional and falls back to clearly-marked TODO placeholders).

### 4. Deliver and get sign-off

Export a branded PDF report, deliver it over encrypted SMTP, and send the customer a **magic-link acknowledgement portal** where they review a pinned snapshot and e-sign — producing a receipt and a tamper-evident sign-off record.

### 5. Run the instance (Admin)

User management (RBAC), framework library, stuck-assessment thresholds, AI & integrations, connectors, branding, email settings (SMTP + per-event notification routing), system monitor, backup/restore, archive, in-app updates, and full activity/audit logs.

![Admin — User Management](docs/screenshots/admin-user-management.png)
*Admin: role-based user management and per-event email notification routing.*

---

## Roles

| Role | Typical use |
|------|-------------|
| **Instance Admin** | Full platform control, updates, backups, all tenants. |
| **Tenant Admin** | Manage users, settings and customers within a tenant. |
| **Assessment Manager** | Owns audits end-to-end. |
| **Auditor** | Executes assessments, records findings/risks. |
| **Contributor** | Adds evidence and answers. |
| **Reviewer** | Reviews and approves controls/findings. |
| **Viewer** | Read-only. |

---

## Architecture & tech stack

Monorepo (npm workspaces) deployed as a Docker Compose stack:

- **`audity-web`** — React + Vite + React Router + Tailwind SPA, served by hardened nginx.
- **`audity-api`** — Node.js + Fastify REST API (Argon2id, JWT, Zod, exceljs, pdfkit, nodemailer).
- **`audity-worker`** — BullMQ background jobs (report rendering, email, exports).
- **`audity-db`** — PostgreSQL (system of record).
- **`audity-redis`** — sessions/rate-limiting/job queue.
- **`audity-storage`** — MinIO (S3-compatible) for evidence & report artifacts.

---

## Quick start

> Prerequisites: Docker + Docker Compose. All commands run from the `audity/` directory.

```bash
# 1. Generate secure secrets and a .env (app secret, encryption key, DB/storage creds)
./scripts/install.sh

# 2. Build and start the full stack
docker compose up -d --build

# 3. Database schema is applied automatically on API start.
#    To run migrations manually:
docker compose exec audity-api node dist/db/migrate.js
```

The web app is then reachable on the configured port; create the first Instance Admin via the setup screen.

For local development with hot reload, use `docker-compose.dev.yml`.

> **Production note:** Audity refuses to start in production with default/weak/identical secrets. `./scripts/install.sh` generates strong, distinct values for `AUDITY_APP_SECRET` and `AUDITY_ENCRYPTION_KEY` for you.

![Login](docs/screenshots/login.png)
*Sign-in (MFA-aware).*

---

## Screenshots

Place images in `docs/screenshots/` with these names so they render above:

- `login.png` — login screen
- `customer-audit-center.png` — customer hub (master data, contacts, audits)
- `risk-register.png` — Risk Register tab (matrix + findings list)
- `findings.png` — Findings tab
- `admin-user-management.png` — admin user management
- *(optional)* `dashboard.png`, `report-signoff.png`

---

## Status & license

Audity is under active development (current version `0.2.3`). See the repository for license terms.
