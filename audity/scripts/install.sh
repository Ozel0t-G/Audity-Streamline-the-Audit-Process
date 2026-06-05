#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

compose() {
  docker compose "$@"
}

need_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

secret_hex() {
  openssl rand -hex 32
}

secret_base64_32() {
  openssl rand -base64 32 | tr -d '\n'
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

env_value() {
  key="$1"
  grep "^${key}=" .env | tail -n 1 | cut -d= -f2-
}

need_command docker
need_command openssl
need_command perl
need_command curl

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required. Install Docker Engine with the compose plugin." >&2
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

postgres_password="${AUDITY_POSTGRES_PASSWORD:-$(secret_hex)}"
storage_access_key="${AUDITY_STORAGE_ACCESS_KEY:-audity$(openssl rand -hex 8)}"
storage_secret_key="${AUDITY_STORAGE_SECRET_KEY:-$(secret_hex)}"

set_env AUDITY_ENV "${AUDITY_ENV:-production}"
set_env AUDITY_PUBLIC_URL "${AUDITY_PUBLIC_URL:-http://localhost}"
set_env AUDITY_WEB_PORT "${AUDITY_WEB_PORT:-80}"
set_env AUDITY_API_PORT "${AUDITY_API_PORT:-3000}"
set_env AUDITY_MINIO_API_PORT "${AUDITY_MINIO_API_PORT:-9000}"
set_env AUDITY_MINIO_CONSOLE_PORT "${AUDITY_MINIO_CONSOLE_PORT:-9001}"
set_env AUDITY_APP_SECRET "${AUDITY_APP_SECRET:-$(secret_hex)}"
set_env AUDITY_ENCRYPTION_KEY "${AUDITY_ENCRYPTION_KEY:-$(secret_base64_32)}"
set_env AUDITY_POSTGRES_DB "${AUDITY_POSTGRES_DB:-audity}"
set_env AUDITY_POSTGRES_USER "${AUDITY_POSTGRES_USER:-audity}"
set_env AUDITY_POSTGRES_PASSWORD "$postgres_password"
set_env AUDITY_DATABASE_URL "postgres://$(env_value AUDITY_POSTGRES_USER):${postgres_password}@audity-db:5432/$(env_value AUDITY_POSTGRES_DB)"
set_env AUDITY_STORAGE_ACCESS_KEY "$storage_access_key"
set_env AUDITY_STORAGE_SECRET_KEY "$storage_secret_key"
set_env AUDITY_FRAMEWORK_YAML_DIR "${AUDITY_FRAMEWORK_YAML_DIR:-frameworks}"
set_env AUDITY_FRAMEWORK_YAML_SYNC_INTERVAL_SECONDS "${AUDITY_FRAMEWORK_YAML_SYNC_INTERVAL_SECONDS:-10}"
set_env AUDITY_SEED_ADMIN_EMAIL "${AUDITY_SEED_ADMIN_EMAIL:-admin@audity.local}"
set_env AUDITY_SEED_ADMIN_PASSWORD "${AUDITY_SEED_ADMIN_PASSWORD:-$(secret_hex)}"

echo "Building and starting Audity..."
compose up --build -d

echo "Running database migration and seed..."
compose run --rm audity-api node apps/api/dist/db/migrate.js
compose run --rm audity-api node apps/api/dist/db/seed.js

echo "Checking service health..."
./scripts/healthcheck.sh

echo ""
echo "Audity installation is ready."
echo "App: $(env_value AUDITY_PUBLIC_URL)"
echo "Public health: $(env_value AUDITY_PUBLIC_URL)/health"
echo "Local API health: http://localhost:$(env_value AUDITY_API_PORT)/health"
echo "MinIO console: http://localhost:$(env_value AUDITY_MINIO_CONSOLE_PORT)"
echo "Initial admin email: $(env_value AUDITY_SEED_ADMIN_EMAIL)"
echo "Initial admin password: $(env_value AUDITY_SEED_ADMIN_PASSWORD)"
echo ""
echo "Store the generated .env securely. It contains production secrets."
