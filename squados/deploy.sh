#!/bin/bash
set -e

echo "==> Build da imagem Docker..."
docker build --no-cache -t s3:latest .

echo "==> Atualizando serviço..."
docker service update --image s3:latest --force squad_squad

echo "==> Status do serviço:"
docker service ps squad_squad
