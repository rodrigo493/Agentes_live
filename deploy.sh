#!/bin/bash
set -euo pipefail

IMAGE="squad:latest"
SERVICE="squad_squad"
CTX="./squados"

echo "==> git HEAD: $(git rev-parse --short HEAD) ($(git log -1 --pretty=%s))"

echo "==> Building Docker image ${IMAGE}..."
docker build --no-cache -t "${IMAGE}" "${CTX}"

echo "==> Updating Docker Swarm service ${SERVICE}..."
docker service update --force --image "${IMAGE}" "${SERVICE}"

echo "==> Service state:"
docker service ps "${SERVICE}" --no-trunc | head -5

echo "==> Deploy complete."
