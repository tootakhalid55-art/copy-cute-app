#!/usr/bin/env bash
# Update deploy for Canar Accounting — run on the VPS (root) or via the
# GitHub Actions workflow. Pulls the branch, rebuilds, restarts the service,
# and verifies the app answers locally before reporting success.
set -euo pipefail

APP_DIR="/opt/canar-accounting"
SERVICE="canar-accounting"
BRANCH="${DEPLOY_BRANCH:-main}"
LOG="/tmp/canar-deploy.log"

# Mirror everything to a log and, on exit, publish a redacted tail to the
# running app's static dir so the deploy outcome is readable remotely at
# https://<site>/deploy-status.txt (secrets filtered; the sandbox that
# develops this app cannot SSH in to read journalctl).
exec > >(tee "$LOG") 2>&1
publish_status() {
  local rc=$?
  local out="$APP_DIR/.output/public/deploy-status.txt"
  if [ -d "$APP_DIR/.output/public" ]; then
    {
      echo "exit_code=$rc"
      echo "finished_at=$(date -u +%FT%TZ)"
      echo "head=$(git -C "$APP_DIR" rev-parse HEAD 2>/dev/null || echo '?')"
      echo "---- last 80 log lines ----"
      tail -n 80 "$LOG" | grep -viE 'key|secret|token|password'
    } > "$out" 2>/dev/null || true
  fi
}
trap publish_status EXIT

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
