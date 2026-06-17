#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

compose_file="${AUDITY_COMPOSE_FILE:-docker-compose.yml}"
api_port="${AUDITY_API_PORT:-3000}"
healthcheck_url="${AUDITY_HEALTHCHECK_URL:-}"
if [ -f .env ]; then
  api_port="$(grep '^AUDITY_API_PORT=' .env | tail -n 1 | cut -d= -f2- || printf '3000')"
  api_port="${api_port:-3000}"
fi
healthcheck_url="${healthcheck_url:-http://127.0.0.1:${api_port}/health}"

echo "Waiting for Docker services..."
i=0
while [ "$i" -lt 60 ]; do
  if docker compose -f "$compose_file" ps --status running >/dev/null 2>&1; then
    if curl -fsS "$healthcheck_url" >/dev/null 2>&1; then
      echo "API health: ok"
      docker compose -f "$compose_file" ps
      exit 0
    fi
  fi
  i=$((i + 1))
  sleep 2
done

echo "Audity did not become healthy in time." >&2
docker compose -f "$compose_file" ps >&2 || true
docker compose -f "$compose_file" logs --tail=120 audity-api >&2 || true
exit 1
