<img width="203" height="254" alt="grc_template_repo_logo_clean_transparent" src="https://github.com/user-attachments/assets/53b3e596-f962-4029-b83f-09dd9f943466" />


# Audity — Self-Hosted Audit & GRC Assessment Platform

Audity is a self-hosted audit and security assessment platform for security consultants, GRC professionals, CISOs, and internal security teams. It takes you from assessment planning through findings, risk register, remediation roadmap, and final report — without sending your client's data to someone else's cloud.

---

## What Audity does for you

Security assessments involve a lot of moving parts: scope definition, control questions, evidence collection, findings, risk scoring, roadmap items, and a professional report at the end. Most consultants manage this across a mix of spreadsheets, Word documents, and whatever their firm's template looks like this year. It works, but it doesn't scale well, and it makes consistency hard.

Audity gives that process a proper structure. You work through a guided workflow — scope and context first, then domain-based control questions with maturity scoring, finding review, risk register, roadmap planning, and finally a branded report export. Each step feeds into the next. The system keeps track of what changed and when, so you can always reconstruct the reasoning behind an assessment result.

It is not a compliance certification tool. Audity will not tell you that your client is ISO 27001 certified. What it does is help you run a thorough, traceable assessment and produce documentation that a professional can stand behind.

**The guided workflow looks like this:**

```
Setup → Scope & Context → Guided Questions → Finding Review → Risk Register → Roadmap → Report
```

**Key capabilities:**

- Domain-based control questions with 0–5 maturity scoring
- Framework support for ISO 27001 readiness, NIST CSF 2.0, NIS2, CIS Controls, MITRE ATT&CK, NSM Grunnprinsipper, and custom frameworks
- Finding review with accept / edit / dismiss workflow
- Risk register with likelihood × impact scoring and treatment tracking
- Remediation roadmap with phase-based prioritization (30 / 90 / 180 / 365 days)
- Branded PDF report export with modular report sections
- Encrypted report delivery via SMTP
- Evidence file management
- Project export and import in an encrypted `.cisoassess` container
- Full activity and audit logging

---

## Who it is for

- Security consultants running assessments for multiple clients
- CISOs managing internal security programs
- GRC professionals working with ISO 27001, NIS2, or NIST frameworks
- Internal security teams that need structured, repeatable assessment processes
- Managed security service providers that want to keep client data off shared platforms
- Auditors who need a traceable record of assessment decisions

---

## Self-hosted by design

Audity runs as a Docker Compose stack. There is no hosted backend. Your data stays on your infrastructure — your PostgreSQL database, your object storage, your encryption keys.

The deployment model is intentionally one stack per client or organization:

```
audity-artemis/   ← your client's dedicated stack
├── docker-compose.yml
├── .env
└── volumes/
    ├── postgres/
    ├── storage/
    └── backups/
```

Each stack has its own database, storage, secrets, encryption keys, and logs. There is no shared multi-tenant database that a misconfigured permission could leak across. If you have five clients, you run five independent stacks. This is more operational overhead than a shared platform, and that tradeoff is deliberate.

---

## Security architecture

This section is intentionally detailed. The platform handles assessment data — which means it handles security weaknesses, control gaps, infrastructure details, risk ratings, and remediation plans. That data needs to be protected seriously.

### Passwords

Passwords are hashed with Argon2id with a unique salt per password. The option for a pepper stored outside the database is included. Plaintext passwords are never stored, never logged, and never sent back to a client. Password reset tokens are single-use, time-limited, and stored hashed.

### Multi-factor authentication

MFA via TOTP is required for production deployments. QR code enrollment, recovery codes, admin reset flow, and tenant-wide MFA enforcement are all included. Every MFA event — enabled, disabled, reset, bypassed — is written to the audit log.

### Session security

Sessions use HTTP-only secure cookies with SameSite policy and CSRF protection. Idle timeout, session expiration, refresh token rotation, logout from all devices, and admin-initiated session revocation are all part of the model.

### Data encryption

Sensitive fields are encrypted at the application layer — assessment notes, answers, findings, risks, evidence notes, report drafts, and customer infrastructure details. The storage layer (MinIO or mounted volume) is encrypted. The master encryption key is configured through an environment variable or secret file, never baked into the container image, never committed to Git.

```env
AUDITY_ENCRYPTION_KEY=base64-encoded-32-byte-key
AUDITY_APP_SECRET=replace-with-secure-random-secret
```

If the encryption key is lost, encrypted customer data is not recoverable. Backup your key.

### Role-based access control

Every API request checks who the user is, which tenant they belong to, what role they hold, and whether they are allowed to perform the requested action on the requested resource.

Roles: Instance Admin, Tenant Admin, Assessment Manager, Auditor, Contributor, Reviewer, Viewer.

Permissions are granular — `finding.approve`, `risk.accept`, `report.export`, `evidence.upload`, `auditlog.view`, and so on. Standard users cannot access audit logs or activity logs. They cannot change branding, email settings, or tenant configuration.

### Immutable activity logging

Every assessment-relevant action is written to an append-only activity log with before/after values:

```json
{
  "action": "control_answer.updated",
  "field": "maturityScore",
  "before": 1,
  "after": 3,
  "userId": "usr_123",
  "assessmentId": "assess_456",
  "timestamp": "2026-05-15T12:00:00Z"
}
```

The application layer has no update or delete operation on activity log records. The database user running the application does not have those permissions. Optional hash chaining links each event to the previous one, so a gap or modification in the log is detectable.

The Tenant Admin UI can filter logs by user, assessment, action type, date range, and entity, and can export the full log. High-risk actions — accepting a risk, reducing a maturity score, exporting a report, disabling MFA — are highlighted.

### Secure report delivery

Reports are packaged into an encrypted `.auditysecure` container before sending. The package contains the PDF report, optional risk register export, a metadata file, and a checksum. The encryption key is delivered through a separate channel. No plaintext report is left in temporary directories after sending. Every email action is logged with recipient, report ID, encryption method, and SMTP delivery status.

### Evidence security

Evidence uploads have file size limits and file type restrictions. There are no public object storage buckets. Download URLs are short-lived and signed. Every upload, download, delete, and export action is logged.

---

## Framework support

Audity supports frameworks in different modes depending on licensing:

| Framework | Mode |
|---|---|
| NIST Cybersecurity Framework 2.0 | Built-in |
| NIS2 | Built-in legal requirement mapping |
| MITRE ATT&CK | Built-in detection mapping |
| HIPAA Security Rule | Built-in requirement mapping |
| NSM Grunnprinsipper | Built-in or referenced |
| ISO/IEC 27001:2022 | Audity readiness workflow + user-provided licensed content |
| Custom frameworks | User-created or imported |

ISO 27001 deserves a specific note: Audity includes original assessment questions for ISO 27001 readiness coverage — ISMS scope, risk assessment, access control, incident management, supplier security, and so on. It does not include the official ISO standard text, control catalogue, or ISO implementation guidance. Those are copyrighted materials that require a license from ISO. If your organization has a license, you can import that content. Audity stores it locally under your tenant and marks it as user-imported, not redistributed by Audity.

Audity uses readiness language throughout: "coverage," "potential gap," "assessment result," "framework mapping." Not "certified," "fully compliant," or "audit-proof."

---

## Minimum requirements

| Setup | CPU | RAM | Storage |
|---|---|---|---|
| Test / lab | 2 vCPU | 4 GB | 40–60 GB SSD |
| Production (≤25 users) | 4 vCPU | 8 GB | 100–200 GB SSD |
| Active consulting team | 4–8 vCPU | 16 GB | 250–500 GB NVMe |

OS: Linux. Runtime: Docker + Docker Compose.

---

## Stack overview

```
audity-web       React + TypeScript frontend (served by NGINX)
audity-api       Node.js + TypeScript API (Fastify/NestJS)
audity-worker    Background jobs — PDF generation, email delivery, backups
audity-db        PostgreSQL 16
audity-redis     Redis 7 — queues, rate limiting, session cache
audity-storage   MinIO or local volume — evidence files, report packages
audity-ai        Optional, disabled by default — tenant-local LLM runtime
```

---

## Getting started

```bash
git clone https://github.com/your-org/audity
cd audity-yourtenantname
cp .env.example .env
# Edit .env — set AUDITY_APP_SECRET, AUDITY_ENCRYPTION_KEY, database credentials
docker compose up -d
```

See the [deployment guide](./docs/deployment.md) for full setup instructions, TLS configuration, and backup setup.

---

## Backup and key management

Run daily PostgreSQL backups, daily evidence storage backups, and weekly full archives. Keep your `AUDITY_ENCRYPTION_KEY` backed up separately from the database — if you lose it, the encrypted data is gone. Test your restore procedure before you need it.

Recommended monitoring: Uptime Kuma or Prometheus + Grafana for container health, Loki for log aggregation, Docker health checks for all services.

---

## Implementation status

| Phase | Description | Status |
|---|---|---|
| 1 | Docker foundation — frontend/backend split, PostgreSQL, Docker Compose | In progress |
| 2 | Authentication — password hashing, TOTP MFA, sessions, RBAC, audit logging | Done |
| 3 | Data persistence — customers, assessments, framework engine, findings, risks | In progress |
| 4 | Traceability — immutable activity log, before/after tracking, tamper-evident hashing | Done |
| 5 | Reporting — branded templates, modular report builder, PDF export | In progress |
| 6 | Secure email — SMTP, encrypted packages, delivery audit trail | Done |
| 7 | Evidence and export hardening — file uploads, `.cisoassess` packages | In progress |
| 8 | Platform hardening — field-level encryption, backup/restore, rate limiting | In progress |
| 9 | Optional AI — tenant-local runtime, AI job queue, per-tenant vector store | Future |

---

## Alpha limitations

Audity does not provide legal advice. It does not certify compliance with any standard or regulation. Framework mappings in the alpha are initial and not certification-grade. Professional review is required before any formal audit conclusions.

Operators are responsible for securing their own deployment — host hardening, TLS, firewall configuration, secret rotation, backup strategy, and key management. The platform gives you the structure. The operational security is yours to maintain.

---

## License

Community Edition is released under [MIT License](./LICENSE).

---

<img width="1015" height="473" alt="Bildschirmfoto 2026-06-04 um 15 34 49" src="https://github.com/user-attachments/assets/f1887c8c-a390-4f24-8dd7-d3fe2bc32d1f" />
<img width="1015" height="473" alt="Bildschirmfoto 2026-06-04 um 15 35 00" src="https://github.com/user-attachments/assets/69811fe1-698c-42cd-86e0-78b62c76308b" />
<img width="1015" height="473" alt="Bildschirmfoto 2026-06-04 um 15 34 34" src="https://github.com/user-attachments/assets/d0b1931c-3af9-4f0c-b3d8-00a524406a6f" />

