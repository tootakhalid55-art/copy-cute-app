#!/usr/bin/env bash
# ============================================================
# Provision (or re-link) the Supabase project for Canar Accounting.
# Runs on a GitHub Actions runner — needs only SUPABASE_ACCESS_TOKEN
# (a personal access token from supabase.com/dashboard/account/tokens).
#
# Env in:
#   SUPABASE_ACCESS_TOKEN   required
#   CREATE_PROJECT=1        create a brand-new project (default)
#   SUPABASE_PROJECT_REF    use this existing project instead (CREATE_PROJECT=0)
#   SUPABASE_ORG_ID         optional; defaults to the account's first org
#   SUPABASE_REGION         optional; default eu-central-1
#   APP_BASE_URL            default https://accounting.canarmodern.com
#
# Everything (migrations + Vault secrets) is applied through the
# Management API query endpoint, so no database password is needed.
#
# Env out (written to $PROVISION_OUT, default /tmp/supabase-provision.env):
#   SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / SUPABASE_SERVICE_ROLE_KEY /
#   SUPABASE_PROJECT_ID / CRON_HOOK_SECRET
# ============================================================
set -euo pipefail

API="https://api.supabase.com"
AUTH=(-H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is required}")
JSON=(-H "Content-Type: application/json")
OUT="${PROVISION_OUT:-/tmp/supabase-provision.env}"
APP_BASE_URL="${APP_BASE_URL:-https://accounting.canarmodern.com}"
MIGRATIONS_DIR="$(cd "$(dirname "$0")/.." && pwd)/supabase/migrations"

say() { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }

if ! command -v jq >/dev/null; then
  SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"
  $SUDO apt-get update -y >/dev/null; $SUDO apt-get install -y jq >/dev/null
fi

REF="${SUPABASE_PROJECT_REF:-}"
if [ "${CREATE_PROJECT:-1}" = "1" ] && [ -z "$REF" ]; then
  say "Creating a new Supabase project"
  ORG="${SUPABASE_ORG_ID:-$(curl -fsS "${AUTH[@]}" "$API/v1/organizations" | jq -r '.[0].id')}"
  [ -n "$ORG" ] && [ "$ORG" != "null" ] || { echo "No Supabase organization found for this token"; exit 1; }
  DB_PASS="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)"
  BODY=$(jq -n --arg org "$ORG" --arg pass "$DB_PASS" --arg region "${SUPABASE_REGION:-eu-central-1}" \
    '{name:"canar-accounting", organization_id:$org, db_pass:$pass, region:$region}')
  REF=$(curl -fsS -X POST "${AUTH[@]}" "${JSON[@]}" -d "$BODY" "$API/v1/projects" | jq -r '.id')
  echo "Project ref: $REF (org $ORG)"
  echo "(database password was generated randomly; reset it from the dashboard if you ever need direct psql access)"
fi
[ -n "$REF" ] || { echo "Set SUPABASE_PROJECT_REF or CREATE_PROJECT=1"; exit 1; }

say "Waiting for project to be healthy"
for i in $(seq 1 60); do
  STATUS=$(curl -fsS "${AUTH[@]}" "$API/v1/projects/$REF" | jq -r '.status')
  echo "  [$i] $STATUS"
  [ "$STATUS" = "ACTIVE_HEALTHY" ] && break
  sleep 10
done
[ "$STATUS" = "ACTIVE_HEALTHY" ] || { echo "Project did not become healthy in time"; exit 1; }

run_sql_file() {
  local file="$1"
  local payload rc response
  payload=$(jq -n --rawfile q "$file" '{query:$q}')
  response=$(curl -sS -X POST "${AUTH[@]}" "${JSON[@]}" -d "$payload" \
    -w '\n%{http_code}' "$API/v1/projects/$REF/database/query")
  rc=$(echo "$response" | tail -1)
  if [ "$rc" != "200" ] && [ "$rc" != "201" ]; then
    echo "!! SQL failed ($rc) in $file:"
    echo "$response" | head -5
    return 1
  fi
}

say "Applying all migrations ($(ls "$MIGRATIONS_DIR"/*.sql | wc -l) files)"
FAILED=0
for f in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  echo "-- $(basename "$f")"
  if ! run_sql_file "$f"; then
    FAILED=$((FAILED+1))
    # Tolerate re-runs against a project that already has part of the schema.
    echo "   (continuing)"
  fi
done
echo "Migrations done ($FAILED file(s) reported errors — 0 expected on a fresh project)"

say "Vault secrets for pg_cron hooks"
CRON="${CRON_HOOK_SECRET:-$(openssl rand -hex 32)}"
VAULT_SQL=$(cat <<SQL
DO \$\$
BEGIN
  IF EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name='cron_hook_secret') THEN
    PERFORM vault.update_secret((SELECT id FROM vault.secrets WHERE name='cron_hook_secret'), '${CRON}');
  ELSE
    PERFORM vault.create_secret('${CRON}', 'cron_hook_secret');
  END IF;
  IF EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name='app_base_url') THEN
    PERFORM vault.update_secret((SELECT id FROM vault.secrets WHERE name='app_base_url'), '${APP_BASE_URL}');
  ELSE
    PERFORM vault.create_secret('${APP_BASE_URL}', 'app_base_url');
  END IF;
END \$\$;
SQL
)
TMP_SQL=$(mktemp); printf '%s' "$VAULT_SQL" > "$TMP_SQL"
run_sql_file "$TMP_SQL"

say "Fetching API keys"
KEYS=$(curl -fsS "${AUTH[@]}" "$API/v1/projects/$REF/api-keys?reveal=true")
PUBLISHABLE=$(echo "$KEYS" | jq -r '[.[] | select(.type=="publishable")][0].api_key // empty')
[ -n "$PUBLISHABLE" ] || PUBLISHABLE=$(echo "$KEYS" | jq -r '[.[] | select(.name=="anon")][0].api_key // empty')
SECRET=$(echo "$KEYS" | jq -r '[.[] | select(.type=="secret")][0].api_key // empty')
[ -n "$SECRET" ] || SECRET=$(echo "$KEYS" | jq -r '[.[] | select(.name=="service_role")][0].api_key // empty')
[ -n "$PUBLISHABLE" ] && [ -n "$SECRET" ] || { echo "Could not fetch API keys"; exit 1; }

{
  echo "SUPABASE_PROJECT_ID=$REF"
  echo "SUPABASE_URL=https://$REF.supabase.co"
  echo "SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE"
  echo "SUPABASE_SERVICE_ROLE_KEY=$SECRET"
  echo "CRON_HOOK_SECRET=$CRON"
} > "$OUT"
chmod 600 "$OUT"
say "Provisioned. Outputs written to $OUT"
echo "Public values (safe to share): ref=$REF url=https://$REF.supabase.co"
