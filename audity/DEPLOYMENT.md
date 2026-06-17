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

## Framework YAML Updates

Framework YAML files live in:

```bash
frameworks/*.yaml
```

The API container mounts this directory read-only and syncs changes automatically. Default interval:

```bash
AUDITY_FRAMEWORK_YAML_SYNC_INTERVAL_SECONDS=10
```

No container restart is required for normal YAML content changes.

## Backup

Use the in-app Admin backup page for application backups.

Volumes used by Docker:

- `audity-db-data`: PostgreSQL data
- `audity-storage-data`: MinIO object storage data

Before destructive server maintenance, create an Audity full backup and also snapshot Docker volumes if your hosting provider supports it.
