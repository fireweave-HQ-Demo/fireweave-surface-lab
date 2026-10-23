#!/usr/bin/env bash
# EC2 production deploy. Repo checkout is already at the triggering SHA.
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

if [[ -n "${GH_TOKEN:-}" ]]; then
  echo "$GH_TOKEN" | docker login ghcr.io -u "${GHCR_USER:-fireweave-HQ-Demo}" --password-stdin >/dev/null
fi

# 4 GB host: swap so Temporal + Chromium do not OOM on first extract.
if [[ ! -f /swapfile ]]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
elif ! swapon --show | grep -q /swapfile; then
  sudo swapon /swapfile || true
fi

# Arcade currently owns :80 on this box. Clinic OS needs that port (SG is 22/80).
if docker ps --format '{{.Names}}' | grep -q '^arcade-prod-app-1$'; then
  echo "stopping arcade so Clinic OS can bind :80"
  docker compose -f "$HOME/arcade/docker/compose.prod.yml" --env-file "$HOME/arcade/.env" down || true
fi

avail_kb="$(df -Pk / | awk 'NR==2 {print $4}')"
if [[ "${avail_kb}" -lt 2500000 ]]; then
  docker builder prune -af >/dev/null || true
  docker image prune -f >/dev/null || true
fi

export DOCKER_BUILDKIT=1
dc pull postgres minio temporal || true

if [[ -n "${GH_TOKEN:-}" ]]; then
  dc stop console api worker || true
  docker image rm -f ghcr.io/fireweave-hq-demo/clinic-node:prod clinic-node:prod || true
  docker pull ghcr.io/fireweave-hq-demo/clinic-node:prod
  docker pull ghcr.io/fireweave-hq-demo/clinic-sandbox:prod || true
  docker pull ghcr.io/fireweave-hq-demo/clinic-agent:prod || true
fi

if docker image inspect clinic-node:prod >/dev/null 2>&1; then
  docker tag clinic-node:prod ghcr.io/fireweave-hq-demo/clinic-node:prod
fi
if docker image inspect clinic-sandbox:prod >/dev/null 2>&1; then
  docker tag clinic-sandbox:prod ghcr.io/fireweave-hq-demo/clinic-sandbox:prod
fi
if docker image inspect clinic-agent:prod >/dev/null 2>&1; then
  docker tag clinic-agent:prod ghcr.io/fireweave-hq-demo/clinic-agent:prod
fi
if docker image inspect clinic-browser:prod >/dev/null 2>&1; then
  docker tag clinic-browser:prod ghcr.io/fireweave-hq-demo/clinic-browser:prod
fi

if ! docker image inspect ghcr.io/fireweave-hq-demo/clinic-node:prod >/dev/null 2>&1; then
  echo "clinic-node:prod is not on this host — load the image instead of building (8G disk)" >&2
  exit 1
fi

SERVICES="postgres minio temporal api worker console sandbox-ehr sandbox-payer agent-worker"
if docker image inspect ghcr.io/fireweave-hq-demo/clinic-browser:prod >/dev/null 2>&1 \
  || docker image inspect clinic-browser:prod >/dev/null 2>&1; then
  SERVICES="$SERVICES browser-runner"
else
  echo "skipping browser-runner — image not on host (8G disk). Extract still runs; chart write needs more disk."
fi
dc up -d --remove-orphans --no-build --pull never $SERVICES

for _ in $(seq 1 60); do
  if curl -fsS --max-time 2 "http://127.0.0.1/login" >/dev/null 2>&1; then
    dc exec -T api ./node_modules/.bin/tsx src/seed.ts
    if [[ -d .git ]]; then
      echo "healthy sha=$(git rev-parse --short HEAD)"
    else
      echo "healthy"
    fi
    exit 0
  fi
  sleep 2
done

echo "console did not become ready on :80"
dc ps
dc logs --tail=80 console api
exit 1
