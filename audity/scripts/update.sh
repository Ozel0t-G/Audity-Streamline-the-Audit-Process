#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo ".env is missing. Run ./scripts/install.sh first." >&2
  exit 1
fi

echo "Rebuilding and restarting Audity..."
docker compose up --build -d

echo "Running migration and seed..."
docker compose run --rm audity-api node apps/api/dist/db/migrate.js
docker compose run --rm audity-api node apps/api/dist/db/seed.js

./scripts/healthcheck.sh

echo "Audity update is complete."
