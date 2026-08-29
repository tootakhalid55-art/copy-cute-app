#!/usr/bin/env bash
# Update deploy for Canar Accounting — run on the VPS (root) or via the
# GitHub Actions workflow. Pulls the branch, rebuilds, restarts the service,
# and verifies the app answers locally before reporting success.
set -euo pipefail

APP_DIR="/opt/canar-accounting"
SERVICE="canar-accounting"
BRANCH="${DEPLOY_BRANCH:-main}"

cd "$APP_DIR"
echo "== Fetching $BRANCH"
# .env is tracked in the repo with placeholder values; the server copy holds
# the real secrets — preserve it across the hard reset.
cp "$APP_DIR/.env" /tmp/canar-env-backup 2>/dev/null || true
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"
if [ -s /tmp/canar-env-backup ]; then
  cp /tmp/canar-env-backup "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
fi

echo "== Install & build"
npm ci
npm run build

echo "== Restart"
systemctl restart "$SERVICE"
sleep 4

code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/ || echo 000)
echo "Local HTTP: $code"
if [ "$code" != "200" ]; then
  echo "!! App did not answer 200 after restart"
  journalctl -u "$SERVICE" --no-pager --lines=30
  exit 1
fi
echo "== Deployed $(git rev-parse --short HEAD) OK"
