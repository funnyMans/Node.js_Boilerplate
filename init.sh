#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

COMPOSE_FILE="infra/docker-compose.dev.yml"

printf '\n==> Stopping any existing stack\n'
docker compose -f "$COMPOSE_FILE" down --remove-orphans --volumes || true

printf '\n==> Building images\n'
docker compose -f "$COMPOSE_FILE" build --no-cache

printf '\n==> Starting stack\n'
docker compose -f "$COMPOSE_FILE" up -d

printf '\n==> Container status\n'
docker compose -f "$COMPOSE_FILE" ps

printf '\n==> Recent logs\n'
docker compose -f "$COMPOSE_FILE" logs --no-color --tail=200
