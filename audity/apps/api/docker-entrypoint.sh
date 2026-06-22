#!/bin/sh
# Entrypoint for the Audity API container.
#
# Two scenarios supported:
#
#   1. Container runs as root (no `user:` override in compose).
#      We fix ownership of volume-backed directories — which may be
#      root-owned on first mount when the named volume was created
#      externally — then drop privileges to `node` via su-exec.
#
#   2. Container runs as a non-root UID (compose sets `user: "1000:1000"`).
#      We cannot setgroups, so we just exec the command directly. The
#      volume must already have the right ownership; the Dockerfile chowns
#      /app/archive to node:node so freshly-created named volumes inherit
#      that. For pre-existing volumes that were already root-owned, run
#      `docker compose run --rm --user 0 audity-api chown -R node:node /app/archive`
#      once before bringing the stack back up.
set -e

if [ "$(id -u)" = "0" ]; then
  for dir in /app/archive /app/user_frameworks; do
    if [ -d "$dir" ]; then
      mkdir -p "$dir/spool" "$dir/bundled" 2>/dev/null || true
      chown -R node:node "$dir" 2>/dev/null || true
    fi
  done
  exec su-exec node "$@"
fi

# Non-root: best-effort directory creation, then exec.
for dir in /app/archive /app/user_frameworks; do
  [ -d "$dir" ] && mkdir -p "$dir/spool" "$dir/bundled" 2>/dev/null || true
done

exec "$@"
