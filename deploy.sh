#!/bin/bash
set -e
cd /volume1/docker/process-web
git pull
export BUILDX_GIT_INFO=0
sudo docker compose build nextjs
sudo docker compose stop nextjs
sudo docker compose up -d nextjs
echo "배포 완료!"
