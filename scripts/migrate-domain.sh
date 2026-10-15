#!/usr/bin/env bash
# ============================================================
# One-time domain migration, run automatically by vps-deploy.sh:
#   accounting.canarmodern.com  →  accounting.canarmodern.online
#
# Safe-by-design:
#   - does nothing until the NEW domain's DNS points at this server
#     (avoids burning Let's Encrypt failed-validation rate limits),
#   - brings the new domain fully up (vhost + SSL) BEFORE touching the old,
#   - only then removes the old vhost and its certificate,
#   - marker file makes it run once; delete the marker to re-run.
# ============================================================
set -euo pipefail

NEW_DOMAIN="accounting.canarmodern.online"
OLD_DOMAIN="accounting.canarmodern.com"
MARKER="/root/.canar-domain-migrated-online"
APP_DIR="/opt/canar-accounting"
SERVICE="canar-accounting"

[ -f "$MARKER" ] && exit 0
[ "$(id -u)" -eq 0 ] || { echo "migrate-domain: must run as root"; exit 0; }

# 1) Wait for DNS: the new domain must resolve to this server's public IP.
SERVER_IP="$(curl -s --max-time 10 https://api.ipify.org || echo "")"
NEW_IP="$(getent ahostsv4 "$NEW_DOMAIN" 2>/dev/null | awk '{print $1; exit}' || echo "")"
if [ -z "$NEW_IP" ] || { [ -n "$SERVER_IP" ] && [ "$NEW_IP" != "$SERVER_IP" ]; }; then
  echo "migrate-domain: waiting for DNS — ${NEW_DOMAIN} resolves to '${NEW_IP:-nothing}' (server: ${SERVER_IP:-?}). Will retry on the next deploy."
  exit 0
fi
echo "migrate-domain: DNS OK (${NEW_DOMAIN} -> ${NEW_IP}) — migrating"

# 2) New vhost (HTTP first, certbot upgrades it to HTTPS with redirect).
cat > "/etc/nginx/sites-available/${NEW_DOMAIN}" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${NEW_DOMAIN};

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
NGINX
ln -sf "/etc/nginx/sites-available/${NEW_DOMAIN}" "/etc/nginx/sites-enabled/${NEW_DOMAIN}"
nginx -t && systemctl reload nginx

# 3) SSL for the new domain. On failure keep the old domain untouched.
if ! certbot --nginx -d "$NEW_DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect; then
  echo "migrate-domain: certbot failed for ${NEW_DOMAIN} — old domain left in place; will retry on the next deploy."
  exit 0
fi

# 4) Point the app's own base URL at the new domain.
if [ -f "$APP_DIR/.env" ] && grep -q "$OLD_DOMAIN" "$APP_DIR/.env"; then
  sed -i "s|${OLD_DOMAIN}|${NEW_DOMAIN}|g" "$APP_DIR/.env"
  systemctl restart "$SERVICE"
fi

# 5) Remove the old domain: vhost + certificate.
rm -f "/etc/nginx/sites-enabled/${OLD_DOMAIN}" "/etc/nginx/sites-available/${OLD_DOMAIN}"
nginx -t && systemctl reload nginx
certbot delete --cert-name "$OLD_DOMAIN" --non-interactive || true

touch "$MARKER"
echo "migrate-domain: DONE — serving https://${NEW_DOMAIN}; ${OLD_DOMAIN} removed."
echo "migrate-domain: REMINDER — update Supabase Vault app_base_url so AI-scan cron hooks call the new domain."
