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

The installer creates `.env`, generates secrets, builds the containers, runs the database migration and seed, then performs a healthcheck.

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
```

For a public server, put TLS in front of Audity with a reverse proxy such as Caddy, Traefik, nginx, or a managed load balancer. The included web container serves the app on port `80` and proxies `/api/*` plus `/health` internally to the API container.

Do not expose MinIO ports publicly unless you know you need them. Prefer firewalling `9000` and `9001` to trusted admin IPs.

## Daily Operations

Start:

```bash
docker compose up -d
```

Stop:

```bash
docker compose down
```

Logs:

```bash
docker compose logs -f
```

Healthcheck:

```bash
./scripts/healthcheck.sh
```

Update after pulling new code:

```bash
./scripts/update.sh
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
