#!/usr/bin/env bash
# Pull the node image Actions just published, then restart console/api/worker on it.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/clinic-assistent}"
IMAGE="${CLINIC_NODE_IMAGE:-ghcr.io/fireweave-hq-demo/clinic-node:prod}"
cd "$APP_DIR"

dc() {
  docker compose -f infra/compose.prod.yml --env-file .env "$@"
}

if [[ ! -f .env ]]; then
  echo "missing $APP_DIR/.env — write secrets before deploying" >&2
  exit 1
fi

if [[ -z "${GH_TOKEN:-}" ]]; then
  echo "GH_TOKEN is required to pull $IMAGE" >&2
  exit 1
fi

echo "${GH_TOKEN}" | docker login ghcr.io -u "${GH_USER:-x-access-token}" --password-stdin
docker pull "$IMAGE"

SERVICES="postgres minio temporal api worker console sandbox-ehr sandbox-payer agent-worker"
if docker image inspect ghcr.io/fireweave-hq-demo/clinic-browser:prod >/dev/null 2>&1; then
  SERVICES="$SERVICES browser-runner"
fi

dc up -d --remove-orphans --no-build --pull never $SERVICES
dc up -d --no-build --pull never --force-recreate console api worker

for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 "http://127.0.0.1/login" >/dev/null 2>&1; then
    dc exec -T api ./node_modules/.bin/tsx src/seed.ts
    font=$(curl -sS -o /dev/null -w "%{http_code}" "http://127.0.0.1/fonts/instrument-sans-400.woff2")
    if [[ "$font" != "200" ]]; then
      echo "console is up but /fonts returned $font — image is stale" >&2
      exit 1
    fi
    echo "healthy"
    exit 0
  fi
  sleep 1
done

echo "console did not become ready on :80"
dc ps
exit 1
