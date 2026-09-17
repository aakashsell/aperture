#!/bin/sh
set -eu
: "${DATABASE_URL:?Set DATABASE_URL}"
MIGRATIONS_DIR=${MIGRATIONS_DIR:-/migrations}
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c 'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())'
for f in "$MIGRATIONS_DIR"/*.sql; do
  migration_name=$(basename "$f")
  case "$migration_name" in *[!a-zA-Z0-9_.-]*) echo 'Invalid migration filename'; exit 1;; esac
  applied=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -Atc "SELECT count(*) FROM schema_migrations WHERE name='$migration_name'")
  if [ "$applied" = 0 ]; then
    echo "Applying $migration_name"
    { printf 'BEGIN;\n'; cat "$f"; printf "\nINSERT INTO schema_migrations(name) VALUES ('%s');\nCOMMIT;\n" "$migration_name"; } | psql "$DATABASE_URL" -v ON_ERROR_STOP=1
  fi
done
