#!/usr/bin/env bash
# Apply the new (2026-08-29) migrations to the hosted Supabase database and
# store the cron secrets in Vault. Run once from the VPS after bootstrap.
#
# Needs SUPABASE_DB_URL: Supabase dashboard -> Project Settings -> Database
# -> Connection string (URI, "session" mode), including the password, e.g.
#   postgresql://postgres.wwiclujwhdejdijynkht:PASSWORD@aws-0-...pooler.supabase.com:5432/postgres
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN_URL="https://accounting.canarmodern.com"

if ! command -v psql >/dev/null; then
  apt-get update -y && apt-get install -y postgresql-client
fi

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  read -r -s -p "الصق SUPABASE_DB_URL (لن يُعرض): " SUPABASE_DB_URL; echo
fi

# CRON_HOOK_SECRET from the app .env (must match what the server uses)
CRON_SECRET="$(grep -E '^CRON_HOOK_SECRET=' "$APP_DIR/.env" | cut -d= -f2- || true)"
if [ -z "$CRON_SECRET" ]; then
  echo "!! CRON_HOOK_SECRET فارغ في $APP_DIR/.env — عبّئه أولاً"; exit 1
fi

echo "== Applying migrations (2026-08-29 set)"
for f in "$APP_DIR"/supabase/migrations/20260829*.sql; do
  echo "-- $f"
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$f"
done

echo "== Vault secrets for pg_cron hooks"
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name='cron_hook_secret') THEN
    PERFORM vault.update_secret((SELECT id FROM vault.secrets WHERE name='cron_hook_secret'), '$CRON_SECRET');
  ELSE
    PERFORM vault.create_secret('$CRON_SECRET', 'cron_hook_secret');
  END IF;
  IF EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name='app_base_url') THEN
    PERFORM vault.update_secret((SELECT id FROM vault.secrets WHERE name='app_base_url'), '$DOMAIN_URL');
  ELSE
    PERFORM vault.create_secret('$DOMAIN_URL', 'app_base_url');
  END IF;
END \$\$;
SQL

echo "== Done. cron jobs now target $DOMAIN_URL with the shared secret."
