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
  grep "^${key}=" .env 2>/dev/null | tail -n 1 | cut -d= -f2- || true
}

is_placeholder() {
  case "$1" in
    ""|change-me|change-me-now|replace-me|replace-with-*) return 0 ;;
    *change-me*|*replace-with*) return 0 ;;
    *) return 1 ;;
  esac
}

env_or_default() {
  key="$1"
  default_value="$2"
  eval "shell_value=\${$key:-}"
  if [ -n "$shell_value" ]; then
    printf '%s' "$shell_value"
    return
  fi
  current_value="$(env_value "$key")"
  if ! is_placeholder "$current_value"; then
    printf '%s' "$current_value"
    return
  fi
  printf '%s' "$default_value"
}

need_command docker
need_command openssl
need_command perl
need_command curl

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required. Install Docker Engine with the compose plugin." >&2
  exit 1
fi

if [ ! -f .env ] && docker volume inspect audity_audity-db-data >/dev/null 2>&1; then
  echo "Existing Audity database volume found, but .env is missing." >&2
  echo "Refusing to generate new database credentials because they would not match the existing database user." >&2
  echo "Restore the original .env, or intentionally remove/recreate the Docker volumes before a fresh install." >&2
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

postgres_password="$(env_or_default AUDITY_POSTGRES_PASSWORD "$(secret_hex)")"
storage_access_key="$(env_or_default AUDITY_STORAGE_ACCESS_KEY "audity$(openssl rand -hex 8)")"
storage_secret_key="$(env_or_default AUDITY_STORAGE_SECRET_KEY "$(secret_hex)")"

set_env AUDITY_ENV "$(env_or_default AUDITY_ENV production)"
set_env AUDITY_IMAGE_REGISTRY "$(env_or_default AUDITY_IMAGE_REGISTRY ghcr.io/ozel0t-g)"
set_env AUDITY_VERSION "$(env_or_default AUDITY_VERSION latest)"
set_env AUDITY_UPDATE_REPOSITORY "$(env_or_default AUDITY_UPDATE_REPOSITORY Ozel0t-G/Audity-Streamline-the-Audit-Process)"
set_env AUDITY_UPDATE_BRANCH "$(env_or_default AUDITY_UPDATE_BRANCH production)"
set_env AUDITY_UPDATE_CHANNEL "$(env_or_default AUDITY_UPDATE_CHANNEL production)"
set_env AUDITY_UPDATE_MANIFEST_PATH "$(env_or_default AUDITY_UPDATE_MANIFEST_PATH audity/update-channel.json)"
set_env AUDITY_UPDATE_CHECK_URL "$(env_or_default AUDITY_UPDATE_CHECK_URL "")"
set_env AUDITY_UPDATER_URL "$(env_or_default AUDITY_UPDATER_URL http://audity-updater:3099)"
set_env AUDITY_UPDATER_TOKEN "$(env_or_default AUDITY_UPDATER_TOKEN "$(secret_hex)")"
set_env AUDITY_HOST_PROJECT_DIR "$(env_or_default AUDITY_HOST_PROJECT_DIR "$(pwd)")"
set_env AUDITY_PUBLIC_URL "$(env_or_default AUDITY_PUBLIC_URL http://localhost)"
set_env AUDITY_WEB_PORT "$(env_or_default AUDITY_WEB_PORT 80)"
set_env AUDITY_API_PORT "$(env_or_default AUDITY_API_PORT 3000)"
set_env AUDITY_MINIO_API_PORT "$(env_or_default AUDITY_MINIO_API_PORT 9000)"
set_env AUDITY_MINIO_CONSOLE_PORT "$(env_or_default AUDITY_MINIO_CONSOLE_PORT 9001)"
set_env AUDITY_APP_SECRET "$(env_or_default AUDITY_APP_SECRET "$(secret_hex)")"
set_env AUDITY_ENCRYPTION_KEY "$(env_or_default AUDITY_ENCRYPTION_KEY "$(secret_base64_32)")"
set_env AUDITY_POSTGRES_DB "$(env_or_default AUDITY_POSTGRES_DB audity)"
set_env AUDITY_POSTGRES_USER "$(env_or_default AUDITY_POSTGRES_USER audity)"
set_env AUDITY_POSTGRES_PASSWORD "$postgres_password"
set_env AUDITY_DATABASE_URL "postgres://$(env_value AUDITY_POSTGRES_USER):${postgres_password}@audity-db:5432/$(env_value AUDITY_POSTGRES_DB)"
set_env AUDITY_STORAGE_ACCESS_KEY "$storage_access_key"
set_env AUDITY_STORAGE_SECRET_KEY "$storage_secret_key"
public_url="$(env_value AUDITY_PUBLIC_URL)"
case "$public_url" in
  *://*)
    public_scheme="${public_url%%://*}"
    public_host="${public_url#*://}"
    ;;
  *)
    public_scheme="http"
    public_host="$public_url"
    ;;
esac
public_host="${public_host%%/*}"
public_host="${public_host%%:*}"
set_env AUDITY_STORAGE_PUBLIC_ENDPOINT "$(env_or_default AUDITY_STORAGE_PUBLIC_ENDPOINT "${public_scheme}://${public_host}:$(env_value AUDITY_MINIO_API_PORT)")"
set_env AUDITY_FRAMEWORK_YAML_DIR "$(env_or_default AUDITY_FRAMEWORK_YAML_DIR frameworks)"
set_env AUDITY_FRAMEWORK_YAML_SYNC_INTERVAL_SECONDS "$(env_or_default AUDITY_FRAMEWORK_YAML_SYNC_INTERVAL_SECONDS 10)"
set_env AUDITY_SEED_ADMIN_EMAIL "$(env_or_default AUDITY_SEED_ADMIN_EMAIL admin@audity.local)"
set_env AUDITY_SEED_ADMIN_PASSWORD "$(env_or_default AUDITY_SEED_ADMIN_PASSWORD "$(secret_hex)")"

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
