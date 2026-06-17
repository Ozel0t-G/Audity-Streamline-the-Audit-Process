#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

need_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

env_value() {
  key="$1"
  grep "^${key}=" .env 2>/dev/null | tail -n 1 | cut -d= -f2- || true
}

set_env() {
  key="$1"
  value="$2"
  export AUDITY_SET_KEY="$key"
  export AUDITY_SET_VALUE="$value"
  if grep -q "^${key}=" .env; then
    perl -0pi -e 's/^\Q$ENV{AUDITY_SET_KEY}\E=.*/$ENV{AUDITY_SET_KEY}."=".$ENV{AUDITY_SET_VALUE}/me' .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

run_build_update() {
  echo "Running source-build update for local development..."
  docker compose up --build -d

  echo "Running migration and seed..."
  docker compose run --rm audity-api node apps/api/dist/db/migrate.js
  docker compose run --rm audity-api node apps/api/dist/db/seed.js

  AUDITY_COMPOSE_FILE=docker-compose.yml ./scripts/healthcheck.sh
  echo "Audity source-build update is complete."
}

if [ ! -f .env ]; then
  echo ".env is missing. Run ./scripts/install.sh first." >&2
  exit 1
fi

need_command docker
need_command curl
need_command perl

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required. Install Docker Engine with the compose plugin." >&2
  exit 1
fi

mode="${AUDITY_UPDATE_MODE:-image}"
if [ "${1:-}" = "--build" ]; then
  mode="build"
  shift
fi

if [ "$mode" = "build" ]; then
  run_build_update
  exit 0
fi

compose_file="${AUDITY_COMPOSE_FILE:-docker-compose.prod.yml}"
if [ ! -f "$compose_file" ]; then
  echo "$compose_file is missing. Cannot run image-based update." >&2
  exit 1
fi

compose() {
  docker compose -f "$compose_file" "$@"
}

current_version="$(env_value AUDITY_VERSION)"
current_registry="$(env_value AUDITY_IMAGE_REGISTRY)"
registry="${AUDITY_IMAGE_REGISTRY:-${current_registry:-ghcr.io/ozel0t-g}}"
requested_version="${1:-${AUDITY_VERSION:-${current_version:-latest}}}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
rollback_tag="rollback-${timestamp}"
backup_root="${AUDITY_UPDATE_BACKUP_DIR:-backups/updates}"
backup_dir="${backup_root}/${timestamp}"
rollback_ready="false"
rollback_count=0

export AUDITY_IMAGE_REGISTRY="$registry"
export AUDITY_VERSION="$requested_version"

echo "Audity image update"
echo "Compose file: $compose_file"
echo "Image registry: $registry"
echo "Current version: ${current_version:-not recorded}"
echo "Target version: $requested_version"
echo ""

if [ "${AUDITY_SKIP_PREUPDATE_BACKUP:-false}" != "true" ]; then
  db_user="$(env_value AUDITY_POSTGRES_USER)"
  db_name="$(env_value AUDITY_POSTGRES_DB)"
  db_user="${db_user:-audity}"
  db_name="${db_name:-audity}"

  echo "Creating pre-update backup in $backup_dir..."
  mkdir -p "$backup_dir"
  cp .env "$backup_dir/.env.before"
  compose config > "$backup_dir/docker-compose.config.before.yml"
  if ! compose exec -T audity-db pg_dump -U "$db_user" -d "$db_name" > "$backup_dir/postgres.sql"; then
    echo "Pre-update database dump failed. Update aborted before changing containers." >&2
    exit 1
  fi
else
  echo "Skipping pre-update backup because AUDITY_SKIP_PREUPDATE_BACKUP=true."
fi

tag_current_image() {
  container="$1"
  image_name="$2"
  image_id="$(docker inspect -f '{{.Image}}' "$container" 2>/dev/null || true)"
  if [ -n "$image_id" ]; then
    docker tag "$image_id" "${registry}/${image_name}:${rollback_tag}"
    rollback_count=$((rollback_count + 1))
  fi
}

echo "Capturing current running images for container rollback..."
tag_current_image audity-web audity-web
tag_current_image audity-api audity-api
tag_current_image audity-worker audity-worker
if [ "$rollback_count" -eq 3 ]; then
  rollback_ready="true"
else
  echo "Warning: captured ${rollback_count}/3 application images. Automatic rollback may be unavailable." >&2
fi

rollback() {
  if [ "$rollback_ready" != "true" ]; then
    echo "Rollback images were not captured. Manual intervention required." >&2
    return 1
  fi
  echo "Rolling containers back to local image tag ${rollback_tag}..."
  export AUDITY_VERSION="$rollback_tag"
  compose up -d audity-api audity-worker audity-web
  AUDITY_COMPOSE_FILE="$compose_file" ./scripts/healthcheck.sh || true
  echo "Container rollback attempted. Database changes are not automatically reverted; use $backup_dir/postgres.sql if a database restore is required." >&2
}

echo "Pulling target images..."
if [ "${AUDITY_SKIP_IMAGE_PULL:-false}" = "true" ]; then
  echo "Skipping image pull because AUDITY_SKIP_IMAGE_PULL=true."
else
  if ! compose pull audity-api audity-worker audity-web audity-updater; then
    echo "Image pull failed. Existing containers were not changed." >&2
    exit 1
  fi
fi

echo "Running migration and seed with target API image..."
if ! compose run --rm audity-api node apps/api/dist/db/migrate.js; then
  echo "Migration failed. Existing running containers were not restarted." >&2
  exit 1
fi
if ! compose run --rm audity-api node apps/api/dist/db/seed.js; then
  echo "Seed failed. Existing running containers were not restarted." >&2
  exit 1
fi

echo "Restarting Audity application services..."
if ! compose up -d audity-api audity-worker audity-web; then
  echo "Service restart failed." >&2
  rollback
  exit 1
fi

echo "Checking service health..."
if ! AUDITY_COMPOSE_FILE="$compose_file" ./scripts/healthcheck.sh; then
  echo "Healthcheck failed after update." >&2
  rollback
  exit 1
fi

set_env AUDITY_IMAGE_REGISTRY "$registry"
set_env AUDITY_VERSION "$requested_version"

echo ""
echo "Audity update is complete."
echo "Version: $requested_version"
if [ "${AUDITY_SKIP_PREUPDATE_BACKUP:-false}" != "true" ]; then
  echo "Pre-update backup: $backup_dir"
fi
