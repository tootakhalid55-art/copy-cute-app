#!/usr/bin/env bash
# ============================================================
# One-command full setup, run DIRECTLY ON THE VPS as root:
#
#   export SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxxxxxxxxxxx
#   curl -fsSL https://raw.githubusercontent.com/tootakhalid55-art/copy-cute-app/main/scripts/vps-full-setup.sh | bash
#
# Creates a fresh Supabase project (once — reuses it on re-runs),
# applies all migrations, fetches the API keys, then installs and
# deploys the app with nginx + SSL on accounting.canarmodern.com.
#
# To relink to an EXISTING project instead:  export SUPABASE_PROJECT_REF=xxxx CREATE_PROJECT=0
# To force provisioning a brand-new project: export FORCE_NEW=1
# ============================================================
set -euo pipefail

: "${SUPABASE_ACCESS_TOKEN:?export SUPABASE_ACCESS_TOKEN=sbp_... first}"
[ "$(id -u)" -eq 0 ] || { echo "Run as root"; exit 1; }

APP_DIR="/opt/canar-accounting"
BRANCH="main"
REPO_URL="https://github.com/tootakhalid55-art/copy-cute-app.git"
PROVISION_OUT="/root/.canar-supabase.env"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y >/dev/null
apt-get install -y git curl jq openssl ca-certificates >/dev/null

if [ ! -d "$APP_DIR/.git" ]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

if [ -f "$PROVISION_OUT" ] && [ "${FORCE_NEW:-}" != "1" ] && [ -z "${SUPABASE_PROJECT_REF:-}" ]; then
  echo "== Reusing existing provisioned project ($PROVISION_OUT). Set FORCE_NEW=1 to create another."
else
  PROVISION_OUT="$PROVISION_OUT" bash scripts/supabase-provision.sh
fi

set -a
. "$PROVISION_OUT"
set +a

NONINTERACTIVE=1 bash scripts/vps-bootstrap.sh

echo
echo "=================================================================="
echo "  اكتمل الإعداد."
echo "  المشروع: ${SUPABASE_PROJECT_ID}  (${SUPABASE_URL})"
echo "  الموقع:  https://accounting.canarmodern.com"
echo "  تذكير: احذف الـ Access Token من صفحة Tokens في Supabase الآن."
echo "=================================================================="
