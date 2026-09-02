#!/usr/bin/env bash
# ============================================================
# One-time installer for pull-based auto-deploy on the VPS.
#
#   curl -fsSL https://raw.githubusercontent.com/tootakhalid55-art/copy-cute-app/main/scripts/install-auto-deploy.sh | bash
#
# Installs a systemd timer that checks origin/main every 2 minutes and,
# when a new commit lands, runs scripts/vps-deploy.sh (build + restart +
# health check). No inbound access or GitHub secrets required.
#
#   Status:   systemctl status canar-autodeploy.timer
#   Logs:     journalctl -u canar-autodeploy.service -n 50
#   Disable:  systemctl disable --now canar-autodeploy.timer
# ============================================================
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Run as root"; exit 1; }

APP_DIR="/opt/canar-accounting"
[ -d "$APP_DIR/.git" ] || { echo "App not found at $APP_DIR — run the bootstrap first"; exit 1; }

cat > /usr/local/bin/canar-autodeploy <<'RUNNER'
#!/usr/bin/env bash
set -euo pipefail
APP_DIR="/opt/canar-accounting"
LOCK="/run/canar-autodeploy.lock"
exec 9>"$LOCK"
flock -n 9 || { echo "another deploy is running — skipping"; exit 0; }

cd "$APP_DIR"
git fetch -q origin main
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0
fi
echo "New commit on origin/main ($LOCAL -> $REMOTE) — deploying"
DEPLOY_BRANCH=main bash "$APP_DIR/scripts/vps-deploy.sh"
RUNNER
chmod +x /usr/local/bin/canar-autodeploy

cat > /etc/systemd/system/canar-autodeploy.service <<'UNIT'
[Unit]
Description=Canar Accounting auto-deploy (pull from origin/main)
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/canar-autodeploy
TimeoutStartSec=1800
UNIT

cat > /etc/systemd/system/canar-autodeploy.timer <<'UNIT'
[Unit]
Description=Check origin/main every 2 minutes and deploy new commits

[Timer]
OnBootSec=2min
OnUnitActiveSec=2min
RandomizedDelaySec=20

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now canar-autodeploy.timer

echo "== Auto-deploy installed. Running the first check now =="
/usr/local/bin/canar-autodeploy || true
echo
systemctl --no-pager status canar-autodeploy.timer | head -5
curl -s -o /dev/null -w "app: %{http_code}\n" http://127.0.0.1:3001/ || true
echo "تم — أي تحديث يُدفع إلى main سيُنشر تلقائياً خلال دقيقتين."
