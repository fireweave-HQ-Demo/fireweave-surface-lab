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

# 4 GB host: swap so Temporal + Chromium do not OOM on first extract.
if [[ ! -f /swapfile ]]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

# Arcade currently owns :80 on this box. Clinic OS needs that port (SG is 22/80).
if docker ps --format '{{.Names}}' | grep -q '^arcade-prod-app-1$'; then
  echo "stopping arcade so Clinic OS can bind :80"
  docker compose -f "$HOME/arcade/docker/compose.prod.yml" --env-file "$HOME/arcade/.env" down || true
fi

avail_kb="$(df -Pk / | awk 'NR==2 {print $4}')"
if [[ "${avail_kb}" -lt 2500000 ]]; then
  docker builder prune -af >/dev/null || true
  docker image prune -af >/dev/null || true
fi

export DOCKER_BUILDKIT=1
dc build api sandbox-ehr browser-runner agent-worker
dc up -d --remove-orphans --no-build

for _ in $(seq 1 60); do
  if curl -fsS --max-time 2 "http://127.0.0.1/login" >/dev/null 2>&1; then
    dc exec -T api pnpm --filter @clinic/api exec tsx src/seed.ts
    echo "healthy sha=$(git rev-parse --short HEAD)"
    exit 0
  fi
  sleep 2
done

echo "console did not become ready on :80"
dc ps
dc logs --tail=80 console api
exit 1
