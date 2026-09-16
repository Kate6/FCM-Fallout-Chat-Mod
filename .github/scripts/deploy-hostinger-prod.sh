#!/usr/bin/env bash
set -euo pipefail
commit_sha=${1:?commit SHA required}
root=${2:-/opt/fcm-cutover/prod}
test -f "$root/HOSTINGER_AUTODEPLOY_ACTIVE" || { echo 'Hostinger auto-deploy disabled locally.'; exit 0; }
test -f "$root/.env" && test -f "$root/docker-compose.yml"
[[ "$commit_sha" =~ ^[0-9a-f]{40}$ ]]
image="fcm-hostinger-prod-backend:$commit_sha"
previous=$(sed -n 's/^FCM_BACKEND_IMAGE=//p' "$root/.env" | head -1)
test -n "$previous"
mkdir -p "$root/checkpoints"
printf '{"status":"building","commitSha":"%s","previousImage":"%s"}\n' "$commit_sha" "$previous" > "$root/checkpoints/auto-deploy.json"
docker build --pull=false -f backend/Dockerfile -t "$image" .
sed -i "s|^FCM_BACKEND_IMAGE=.*|FCM_BACKEND_IMAGE=$image|" "$root/.env"
rollback() {
  sed -i "s|^FCM_BACKEND_IMAGE=.*|FCM_BACKEND_IMAGE=$previous|" "$root/.env"
  (cd "$root" && docker compose up -d --no-deps backend)
}
trap rollback ERR
(cd "$root" && docker compose config --quiet && docker compose up -d --no-deps backend)
for _ in $(seq 1 24); do
  curl -fsS --max-time 5 http://127.0.0.1:27676/api/health >/dev/null && break
  sleep 5
done
curl -fsS --max-time 5 http://127.0.0.1:27676/api/health >/dev/null
printf '{"status":"healthy","commitSha":"%s","previousImage":"%s","candidateImage":"%s"}\n' "$commit_sha" "$previous" "$image" > "$root/checkpoints/auto-deploy.json"
trap - ERR
