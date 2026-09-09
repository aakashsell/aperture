#!/bin/sh
set -e

# Aperture sequential migration runner
# Usage: migrate.sh [down]

for f in /migrations/*.sql; do
  echo "Applying $f"
  psql "$DATABASE_URL" -f "$f"
done

# Run seeds if they exist
for f in /seeds/*.sql; do
  if [ -f "$f" ]; then
    echo "Seeding $f"
    psql "$DATABASE_URL" -f "$f"
  fi
done

echo "Migrations complete"
