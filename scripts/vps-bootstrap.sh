#!/usr/bin/env bash
# ============================================================
# One-time VPS bootstrap for Canar Accounting
# Target: Ubuntu 22.04/24.04 as root on 69.164.245.35
#
# Usage (as root):
#   bash vps-bootstrap.sh
#
# What it does:
#   1. Installs Node.js 22, git, nginx, certbot
#   2. Clones the repo to /opt/canar-accounting and builds it
#   4. Creates .env from the template (edit it when prompted)
#   5. Installs the systemd service + nginx vhost + SSL certificate
#   6. Generates a key for GitHub Actions auto-deploy (prints private
#      key ONCE; paste it into repo Settings -> Secrets -> VPS_SSH_KEY)
# ============================================================
set -euo pipefail

REPO_URL="https://github.com/tootakhalid55-art/copy-cute-app.git"
APP_DIR="/opt/canar-accounting"
DOMAIN="accounting.canarmodern.com"
SERVICE="canar-accounting"
NODE_MAJOR=22

say() { printf '\n\033[1;32m== %s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "Run as root"; exit 1; }

say "1/6 System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git nginx certbot python3-certbot-nginx ca-certificates
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
node -v && npm -v

say "2/6 Clone & build"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone --branch claude/open-app-jqqvl9 "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"
git fetch origin && git checkout claude/open-app-jqqvl9 && git pull

# NOTE: the repo ships a committed .env with only public keys, so its mere
# presence does not mean the server is configured — check for the secret.
if [ "${NONINTERACTIVE:-}" = "1" ]; then
  # CI mode: (re)write the full env from the workflow-provided environment.
  CRON="${CRON_HOOK_SECRET:-$(openssl rand -hex 32)}"
  if [ -f "$APP_DIR/.env" ] && grep -q '^CRON_HOOK_SECRET=..*' "$APP_DIR/.env" && [ -z "${CRON_HOOK_SECRET:-}" ]; then
    CRON="$(grep '^CRON_HOOK_SECRET=' "$APP_DIR/.env" | cut -d= -f2-)"
  fi
  : "${SUPABASE_URL:?SUPABASE_URL is required in CI mode}"
  : "${SUPABASE_PUBLISHABLE_KEY:?SUPABASE_PUBLISHABLE_KEY is required in CI mode}"
  : "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required in CI mode}"
  PROJECT_REF="${SUPABASE_PROJECT_ID:-$(echo "$SUPABASE_URL" | sed -E 's#https://([^.]+)\..*#\1#')}"
  cat > "$APP_DIR/.env" <<ENVEOF
SUPABASE_PROJECT_ID=${PROJECT_REF}
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_PUBLISHABLE_KEY=${SUPABASE_PUBLISHABLE_KEY}
VITE_SUPABASE_PROJECT_ID=${PROJECT_REF}
VITE_SUPABASE_URL=${SUPABASE_URL}
VITE_SUPABASE_PUBLISHABLE_KEY=${SUPABASE_PUBLISHABLE_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
CRON_HOOK_SECRET=${CRON}
LOVABLE_API_KEY=${LOVABLE_API_KEY:-}
ENVEOF
  chmod 600 "$APP_DIR/.env"
elif ! grep -q '^SUPABASE_SERVICE_ROLE_KEY=..*' "$APP_DIR/.env" 2>/dev/null; then
  [ -f "$APP_DIR/.env" ] || cp "$APP_DIR/scripts/env.production.example" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  echo
  echo ">>> افتح الملف $APP_DIR/.env واملأ القيم (خاصة SUPABASE_SERVICE_ROLE_KEY و CRON_HOOK_SECRET)"
  read -r -p "اضغط Enter بعد تعبئة .env ... " _
fi

npm ci
npm run build

say "3/6 systemd service"
cat > "/etc/systemd/system/${SERVICE}.service" <<UNIT
[Unit]
Description=Canar Accounting (TanStack Start / Nitro node-server)
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
Environment=PORT=3000
Environment=HOST=127.0.0.1
Environment=NODE_ENV=production
ExecStart=/usr/bin/node ${APP_DIR}/.output/server/index.mjs
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now "$SERVICE"
sleep 3
systemctl --no-pager --lines=5 status "$SERVICE" || true
curl -s -o /dev/null -w "Local app HTTP: %{http_code}\n" http://127.0.0.1:3000/ || true

say "4/6 nginx + SSL (${DOMAIN})"
cat > "/etc/nginx/sites-available/${DOMAIN}" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
NGINX
ln -sf "/etc/nginx/sites-available/${DOMAIN}" "/etc/nginx/sites-enabled/${DOMAIN}"
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
# SSL — requires the DNS A record of ${DOMAIN} to point at this server first.
if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect; then
  echo "SSL OK"
else
  echo "!! فشل إصدار الشهادة — تأكد أن سجل DNS للنطاق ${DOMAIN} يشير إلى هذا الخادم ثم نفّذ:"
  echo "   certbot --nginx -d ${DOMAIN} --redirect"
fi

say "5/6 GitHub Actions auto-deploy key"
if [ "${NONINTERACTIVE:-}" = "1" ]; then
  echo "(CI mode: future deploys reuse the same workflow credentials — no key printed)"
elif [ ! -f /root/.ssh/canar_actions ]; then
  ssh-keygen -t ed25519 -N "" -f /root/.ssh/canar_actions -C "canar-actions-deploy"
  cat /root/.ssh/canar_actions.pub >> /root/.ssh/authorized_keys
  chmod 600 /root/.ssh/authorized_keys
  echo
  echo ">>> أضف المفتاح الخاص التالي في GitHub: Settings -> Secrets and variables -> Actions -> New secret"
  echo ">>> Name: VPS_SSH_KEY   (يُعرض مرة واحدة هنا — لا تشاركه مع أي جهة أخرى)"
  echo "--------------------------------------------------------------"
  cat /root/.ssh/canar_actions
  echo "--------------------------------------------------------------"
  echo
fi

if [ "${NONINTERACTIVE:-}" = "1" ] && [ -n "${SUPABASE_DB_URL:-}" ]; then
  say "6/6 Database migrations + Vault secrets"
  SUPABASE_DB_URL="$SUPABASE_DB_URL" bash "$APP_DIR/scripts/apply-migrations.sh"
fi

say "تم! التطبيق يعمل على https://${DOMAIN}"
if [ "${NONINTERACTIVE:-}" != "1" ]; then
  echo "خطوة متبقية على قاعدة بيانات Supabase (مرة واحدة):"
  echo "  bash ${APP_DIR}/scripts/apply-migrations.sh   # يطبّق آخر الهجرات ويضبط أسرار Vault"
fi
