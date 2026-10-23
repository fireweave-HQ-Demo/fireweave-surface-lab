#!/usr/bin/env bash
# Restart the images already on the host. No build, no registry pull.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/clinic-os}"
cd "$APP_DIR"

dc() {
  docker compose -f infra/compose.prod.yml --env-file .env "$@"
}

if [[ ! -f .env ]]; then
  echo "missing $APP_DIR/.env — write secrets before deploying" >&2
  exit 1
fi

if ! docker image inspect ghcr.io/fireweave-hq-demo/clinic-node:prod >/dev/null 2>&1; then
  echo "clinic-node:prod is not on this host" >&2
  exit 1
fi

SERVICES="postgres minio temporal api worker console sandbox-ehr sandbox-payer agent-worker"
if docker image inspect ghcr.io/fireweave-hq-demo/clinic-browser:prod >/dev/null 2>&1; then
  SERVICES="$SERVICES browser-runner"
fi

dc up -d --remove-orphans --no-build --pull never $SERVICES

for _ in $(seq 1 20); do
  if curl -fsS --max-time 2 "http://127.0.0.1/login" >/dev/null 2>&1; then
    dc exec -T api ./node_modules/.bin/tsx src/seed.ts
    echo "healthy"
    exit 0
  fi
  sleep 1
done

echo "console did not become ready on :80"
dc ps
exit 1
