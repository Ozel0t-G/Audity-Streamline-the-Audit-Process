# Audity

Audity is a local Docker-based GRC assessment application for customer assessments, guided questions, findings, risk register, roadmap, evidence, report generation, secure report delivery, encrypted import/export, and backups.

## Quick Start

Recommended self-hosted install:

```bash
./scripts/install.sh
```

Manual Docker start:

```bash
docker compose up --build -d
docker compose run --rm audity-api node apps/api/dist/db/seed.js
```

Open:

- App: http://localhost
- API health: http://localhost:3000/health
- MinIO console: http://localhost:9001

Default manual local seed login:

- Email: `admin@audity.local`
- Password: `change-me-now`

The installer generates a unique initial admin password and prints it at the end.

If no user exists, the login page opens the first-start setup wizard. Create the initial Instance Admin account, optionally configure SMTP and report branding, then accept the alpha disclaimer before entering the app.

For a server installation guide, see [DEPLOYMENT.md](./DEPLOYMENT.md).

## Environment

Copy `.env.example` to `.env` and replace all placeholder secrets before any shared or internet-exposed deployment.

Important variables:

- `AUDITY_APP_SECRET`: JWT/session signing secret.
- `AUDITY_ENCRYPTION_KEY`: master key input for AES-256-GCM encryption.
- `AUDITY_PUBLIC_URL`: browser-facing URL, for example `https://audity.example.com`.
- `AUDITY_WEB_PORT`: host port for the web app, default `80`.
- `AUDITY_DATABASE_URL`: PostgreSQL connection string.
- `AUDITY_REDIS_URL`: Redis connection string for queues and rate limits.
- `AUDITY_STORAGE_*`: MinIO/S3-compatible evidence storage settings.
- `AUDITY_BACKUP_BUCKET`: MinIO/S3 bucket for database dumps and evidence manifests.
- `AUDITY_FRAMEWORK_YAML_*`: directory and polling interval for YAML-managed frameworks.
- `AUDITY_SMTP_*`: optional SMTP defaults; runtime SMTP settings are managed in Admin > Email Settings.

## Backup And Restore

Manual backup:

1. Log in as an Instance Admin.
2. Open Admin > Backup.
3. Select `Full`, `Database`, or `Evidence`.
4. Click `Trigger backup`.

API endpoints:

- `GET /api/admin/backup/status`
- `POST /api/admin/backup/trigger`

Backup trigger is restricted to Instance Admin accounts.

Backups are stored in the `AUDITY_BACKUP_BUCKET` bucket. A full backup creates:

- `database.dump`: PostgreSQL custom-format dump created with `pg_dump`.
- `evidence/`: copied evidence objects.
- `evidence-manifest.json`: snapshot manifest of evidence object keys, copied backup keys, and metadata.

Restore database example:

```bash
docker compose cp ./database.dump audity-db:/tmp/database.dump
docker compose exec audity-db pg_restore -U audity -d audity --clean --if-exists /tmp/database.dump
```

Evidence restore is object-storage based: use the manifest to verify expected object keys and copy matching objects from the backup bucket back into the evidence bucket.

## Update Process

```bash
./scripts/update.sh
```

Then verify:

```bash
./scripts/healthcheck.sh
```

## Beta Smoke Checklist

- `docker compose up --build -d`
- `docker compose ps` shows web, API, worker, database, Redis, and MinIO healthy.
- `curl http://localhost:3000/health` returns OK.
- First-start setup creates an Instance Admin when the user table is empty.
- First login requires alpha disclaimer acceptance.
- Admin-only menus and normal workflow actions are hidden without matching permissions.
- Backup status loads and Instance Admin can trigger a full backup.
