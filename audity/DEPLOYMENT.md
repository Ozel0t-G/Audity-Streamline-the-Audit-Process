# Audity Self-Hosted Deployment

This branch is prepared for a simple single-server Docker installation.

## Requirements

- Linux server or VM
- Docker Engine with Docker Compose v2
- `openssl`, `perl`, and `curl`
- Open inbound port `80` for the app, or set `AUDITY_WEB_PORT` in `.env`

## Install

```bash
git clone <repo-url>
cd Audity-Streamline-the-Audit-Process/audity
./scripts/install.sh
```

The installer creates `.env`, generates secrets, builds the initial containers, runs the database migration and seed, then performs a healthcheck.

Open:

- App: value of `AUDITY_PUBLIC_URL`
- Local API health: `http://localhost:3000/health`
- MinIO console: `http://localhost:9001`

The generated initial admin email and password are printed once at the end of the installer. Store `.env` securely.

## Configure Before Internet Exposure

Edit `.env`:

```bash
AUDITY_PUBLIC_URL=https://your-domain.example
AUDITY_WEB_PORT=80
AUDITY_API_PORT=3000
AUDITY_MINIO_API_PORT=9000
AUDITY_MINIO_CONSOLE_PORT=9001
AUDITY_STORAGE_PUBLIC_ENDPOINT=https://your-domain.example:9000
```

For a public server, put TLS in front of Audity with a reverse proxy such as Caddy, Traefik, nginx, or a managed load balancer. The included web container serves the app on port `80` and proxies `/api/*` plus `/health` internally to the API container.

Do not expose MinIO ports publicly unless you know you need them. Prefer firewalling `9000` and `9001` to trusted admin IPs.

Production startup refuses known placeholder values such as `change-me`, `replace-me`, and `replace-with-*`. This is intentional. Use `./scripts/install.sh` or replace all secrets manually before exposing the server.

## Daily Operations

Production start with published images:

```bash
docker compose -f docker-compose.prod.yml up -d
```

Stop:

```bash
docker compose -f docker-compose.prod.yml down
```

Logs:

```bash
docker compose -f docker-compose.prod.yml logs -f
```

Healthcheck:

```bash
AUDITY_COMPOSE_FILE=docker-compose.prod.yml ./scripts/healthcheck.sh
```

## Admin Update Process

Server admins do not need to build Docker images locally. Production updates use prebuilt images from GHCR.

Configure the image source in `.env`:

```bash
AUDITY_IMAGE_REGISTRY=ghcr.io/ozel0t-g
AUDITY_VERSION=latest
AUDITY_UPDATE_BRANCH=production
AUDITY_UPDATE_CHANNEL=production
AUDITY_UPDATE_MANIFEST_PATH=audity/update-channel.json
AUDITY_UPDATER_URL=http://audity-updater:3099
AUDITY_UPDATER_TOKEN=<generated-secret>
AUDITY_HOST_PROJECT_DIR=/opt/audity
```

Update to the configured version:

```bash
./scripts/update.sh
```

Update to a specific release tag:

```bash
./scripts/update.sh 1.4.0
```

The update script:

- creates a pre-update PostgreSQL dump under `backups/updates/<timestamp>/`
- tags the currently running web/API/worker images locally for container rollback
- pulls `audity-web`, `audity-api`, and `audity-worker`
- runs database migration and seed with the target API image
- restarts only the application services
- runs the healthcheck
- records the successful `AUDITY_VERSION` in `.env`

If the restart or healthcheck fails, the script attempts to roll the containers back to the locally tagged previous images. Database migrations are not automatically reverted; use the pre-update dump if a database restore is required.

For local development or emergency source builds, use:

```bash
AUDITY_UPDATE_MODE=build ./scripts/update.sh
```

## In-App Updates

Instance Admins can open Admin > System Monitor and use the Audity Update Panel.

The panel shows:

- installed application version
- configured image tag
- latest available release/tag from GitHub
- updater service status
- update job log

Audity also checks for updates when admin notifications are loaded. If the production manifest contains a newer SemVer version, admins receive an in-app notification in the notification bell.

Update discovery is locked to the `production` branch. The API reads:

```text
https://raw.githubusercontent.com/<repo>/production/audity/update-channel.json
```

The manifest must declare:

```json
{
  "channel": "production",
  "branch": "production",
  "version": "1.4.0"
}
```

Main branch changes do not create update notifications and do not publish production images. To release a new version, merge the approved code into `production`, bump `audity/update-channel.json`, and let GitHub Actions publish the images from that branch.

The `audity-updater` service is intentionally separate from the normal API. It has no public port and accepts requests only with `AUDITY_UPDATER_TOKEN`. It is the only service that mounts the Docker socket, and it runs `./scripts/update.sh` from `AUDITY_HOST_PROJECT_DIR`.

## Framework YAML Updates

Framework YAML files live in:

```bash
frameworks/catalog/**/*.yaml
```

The API container mounts `frameworks/` read-only and scans it recursively, so framework catalogs can be grouped in subfolders such as `catalog/public`, `catalog/audity-readiness`, or `catalog/yaml-managed`. The YAML files are the source of truth for shipped framework catalogs; no container restart is required for normal YAML content changes. Default interval:

```bash
AUDITY_FRAMEWORK_YAML_SYNC_INTERVAL_SECONDS=10
```

## Backup

Use the in-app Admin backup page for application backups.

Volumes used by Docker:

- `audity-db-data`: PostgreSQL data
- `audity-storage-data`: MinIO object storage data
- `audity-archive`: Archive spool and monthly encrypted bundles (`/app/archive` inside the api container)
- `audity-log-archive`: Tamper-evident audit/activity log archives written by the mandatory 24h Log Archival job (`/app/log-archive` inside the api container — only used when the destination is left at the default *Local server (WORM)* option)

Before destructive server maintenance, create an Audity full backup and also snapshot Docker volumes if your hosting provider supports it.

## Archive System

Audity ships a hybrid archive workflow for retiring customers without losing
audit trails. When a user archives a customer:

1. DB rows stay in place, marked `archived_at` (read-only for non-admins, fully
   accessible to admins).
2. Evidence + report blobs move from MinIO into the local archive volume
   (`/app/archive/spool/<YYYY-MM>/<customer-uuid>/`).
3. An entry appears in `archive_index` linking the customer to the spool
   directory and a generated manifest.

Once a month (1st of the month by default, configurable via
`AUDITY_ARCHIVE_BUNDLE_DAY`), the API container packages every customer
spooled in the previous month into a single encrypted bundle:

- File: `/app/archive/bundled/<YYYY-MM>.audity-archive`
- Format: 8-byte header (magic `AUDA` + u32 version) · 12-byte IV · 16-byte
  GCM tag · AES-256-GCM ciphertext of a ZIP body
- Encryption key: `sha256(AUDITY_ENCRYPTION_KEY)` — the same derivation used
  elsewhere in the app, so a single key protects everything.

Admins can also trigger a bundle on demand from **Admin → Archive →
Bundles → Bundle now**, download bundles for off-site storage, and re-import
them later via **Admin → Archive → Re-import**.

### Restore workflow

Non-admin owners see archived customers under **Archive** in the main
sidebar. They can request restoration with a justification; an Instance Admin
reviews the request under **Admin → Archive → Restore requests** and either
approves (which re-uploads evidence to MinIO, clears `archived_at`, and
notifies the requester) or denies with a reason.

### Disaster recovery

1. After provisioning a fresh Audity host, set `AUDITY_ENCRYPTION_KEY` to the
   **same** value the previous instance used (the human-readable form is
   available via the recovery phrase shown during first-time setup).
2. Restore the latest PostgreSQL backup so `customers`, `archive_index`,
   and friends contain the historical state.
3. Copy archived bundle files (`<month>.audity-archive`) into the
   `audity-archive` Docker volume's `bundled/` subdirectory, or upload each
   bundle via the **Admin → Archive → Re-import** form.
4. On re-import the bundle is decrypted with the current key. Mismatched key
   = decryption error: rotate `AUDITY_ENCRYPTION_KEY` back to the old value,
   re-import, then rotate forward in a controlled migration.
5. Approve restore requests to move evidence back into MinIO for individual
   customers as needed.

### Recovery phrase

Every Audity instance derives its encryption key from
`AUDITY_ENCRYPTION_KEY`. The setup wizard shows the corresponding **recovery
phrase** (72 hex characters in 6 groups of 12) plus a short fingerprint that
also appears on **Admin → System Monitor**.

- Treat the phrase like a master password — anyone with it can decrypt
  archives and backups.
- Store it outside the server (password manager, printed envelope).
- Re-display via `docker exec audity-api node apps/api/dist/scripts/printRecoveryPhrase.js`.
- Verify a stored phrase against the running instance from the login page
  (**"Verify your recovery phrase"** link below the form).
- The login page's verify form also flags **`matchesInstance: false`** if you
  ever rotate the key and need to confirm the old phrase still decodes a
  legacy bundle.

## Log Archival (Mandatory, Tamper-Evident)

Audity continuously archives its two immutable log streams — the **audit log**
(`audit_logs`) and the hash-chained **user activity log** (`user_activity_logs`)
— into encrypted, signed, hash-chained bundles. This subsystem is independent of
the general Backup feature described above and exists to satisfy retention and
non-repudiation requirements: the logs are exported off the live database on a
fixed schedule so that even a full database loss or a compromised admin account
cannot erase the trail.

### Guarantees

- **Always on and non-disableable.** The archival scheduler is wired
  unconditionally into the API boot sequence. There is **no enable/disable
  toggle**, no setting, and no API endpoint that can stop it. Neither a normal
  user nor any admin (including Instance Admin) can switch it off. Admins can
  only change *where* the archive is written.
- **Runs every 24 hours.** The scheduler ticks hourly and performs a run when the
  last successful archive is older than ~23 hours (the small margin absorbs tick
  drift so a day is never silently skipped). A run is also performed shortly
  after the API starts if one is already due.
- **Tamper-evident.** Each archive is an AES-256-GCM encrypted container whose
  manifest carries an HMAC signature, and whose SHA-256 checksum is chained into
  the *next* archive's manifest (`prevChecksum`). Altering, truncating, or
  removing any archive in the chain breaks verification of the following ones.
- **Append-only at every layer.** `audit_logs` and `user_activity_logs` are
  protected by database triggers that reject `UPDATE`/`DELETE`. The archival run
  history (`log_archive_runs`) is likewise append-only. The default local
  destination writes files with the exclusive `wx` flag, so an existing archive
  is never overwritten.
- **Incremental, no gaps, no duplicates.** Each run exports only the rows
  appended since the previous successful run (tracked by a watermark per log
  stream). If a run fails, the watermark is not advanced, so the next run
  re-exports the same rows — data is never lost, at worst a bundle is duplicated.

### Archive format

Bundles are named `audity-logs-<timestamp>.audity-logs` and have this layout:

```
bytes 0..3    magic "ALOG"
bytes 4..7    version (u32 LE)
bytes 8..19   AES-256-GCM IV (12 bytes)
bytes 20..35  AES-256-GCM auth tag (16 bytes)
bytes 36..    ciphertext (encrypted ZIP)
```

The encrypted ZIP contains:

- `manifest.json` — metadata: created-at, row counts, the id ranges covered, the
  previous archive's checksum (`prevChecksum`), and an HMAC `signature`.
- `audit.jsonl` — one `audit_logs` row per line.
- `activity.jsonl` — one `user_activity_logs` row per line.

The encryption key is derived as `sha256(AUDITY_ENCRYPTION_KEY)` — the **same key
as evidence, backups, and monthly archive bundles**. The recovery phrase
(see above) is therefore what you need to decrypt these archives. If you rotate
`AUDITY_ENCRYPTION_KEY`, archives written under the old key require the old key to
decrypt, and any saved remote-destination credentials (see below) must be
re-entered because they are stored encrypted under the same key.

### Destinations

The default destination is a tamper-resistant **local WORM directory** on the
application server. An Instance Admin can change the destination in
**Admin → Backup → Log Archival**. Four destination types are supported:

| Type | Use case | Required fields | Notes |
|------|----------|-----------------|-------|
| **Local server (WORM)** | Default. Same server the app runs on, or any NFS/SMB share **mounted at the OS level** so it appears as a path. | *Directory* (optional; defaults to `AUDITY_LOG_ARCHIVE_DIR`) | Files written with `wx` (no overwrite). Persisted via the `audity-log-archive` volume. Covers most NAS devices without protocol-specific configuration. |
| **SFTP** | Recommended for true remote targets. | Host, Port (default 22), Username, Password, Remote path | SSH file transfer; encrypted in transit; supported by virtually every NAS/server. |
| **S3-compatible** | MinIO, Synology, QNAP, Wasabi, AWS S3, etc. | Endpoint, Bucket, Access key, Secret key, Region (optional), Key prefix (optional), Use TLS | Reuses the bundled S3 client against a caller-supplied endpoint/bucket. The bucket is created if missing. |
| **FTP / FTPS** | Legacy NAS only. | Host, Port (default 21), Username, Password, Remote path, *Use FTPS* | Plain FTP is **unencrypted** — enable *Use FTPS* whenever the target supports it. |

Notes on NFS and SMB/CIFS: these are **not** spoken by the application directly.
Mount the share on the host/container (e.g. an `/etc/fstab` NFS mount or an SMB
mount) and point the **Local server (WORM)** destination at the mounted path
(either by overriding the directory field or by binding the mount to
`/app/log-archive`). This is more robust than an in-app NFS/SMB client and works
with any NAS.

### Configuration

- `AUDITY_LOG_ARCHIVE_DIR` (default `/app/log-archive`): filesystem path for the
  default *Local server (WORM)* destination inside the api container. Backed by
  the `audity-log-archive` named volume in the shipped compose files. The api
  container's entrypoint creates and `chown`s this directory on first start, the
  same way it handles `/app/archive`.
- To send archives to a host directory or an OS-mounted NAS share instead of the
  managed volume, replace the volume mount in your compose override, for example:

  ```yaml
  services:
    audity-api:
      volumes:
        - /mnt/nas/audity-log-archive:/app/log-archive
  ```

Remote-destination credentials (SFTP/FTP passwords, S3 secret keys) are stored
**encrypted at rest** (AES-256-GCM, same scheme as SMTP passwords) and are never
returned by the API — the UI only shows whether a secret is set and lets you
replace it.

### Operating it

- **UI:** Admin → Backup → **Log Archival**. The card shows an *Always on* badge,
  the last archived time, the last run's status and row counts, the destination
  form, **Test connection** / **Save destination** buttons, and a run-history
  table (time, status, total logs, bundle checksum prefix). Changing the
  destination is restricted to **Instance Admin** and is itself recorded in both
  the audit log and the activity log.
- **API endpoints:**
  - `GET /api/admin/log-archive/settings` — destination type, non-secret config,
    secret-presence flags, and last-run summary (`backup.manage`).
  - `GET /api/admin/log-archive/runs` — recent run history (`backup.manage`).
  - `PATCH /api/admin/log-archive/destination` — change the destination only
    (Instance Admin + CSRF). There is intentionally no field to disable archival.
  - `POST /api/admin/log-archive/test` — write-and-delete a probe object against
    a candidate destination without saving it (Instance Admin + CSRF).
- **Where it runs:** in-process inside the **api** container (mirroring the
  monthly Archive cron), not in the worker. No Redis or worker is required for
  archival to function.
- **Failure handling:** a failed run is recorded in `log_archive_runs` with the
  reason and triggers the `backup.failed` email topic (configure recipients in
  Admin → Email). Because the watermark only advances on success, the next tick
  retries automatically.

### Verifying and reading an archive

Archives are decrypted and verified with the instance encryption key. To inspect
one, copy it off the destination and decode it with the same key derivation
(`sha256(AUDITY_ENCRYPTION_KEY)`): parse the header, AES-256-GCM-decrypt the body
(GCM tag failure ⇒ tampering), unzip, then recompute the manifest HMAC and the
`prevChecksum` chain. A broken signature or a `prevChecksum` that does not match
the preceding archive's SHA-256 is direct evidence of tampering or a missing
archive in the sequence.
