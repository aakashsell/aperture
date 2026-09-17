#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
export DATABASE_URL=${DATABASE_URL:-postgresql://localhost:5432/aperture?sslmode=disable}
export JWT_SECRET=${JWT_SECRET:-local-development-only-secret-32-characters}
export API_URL=${API_URL:-http://localhost:8000}
export MIGRATIONS_DIR="$PWD/db/migrations"
sh scripts/migrate.sh
mkdir -p bin
(cd services/api && go build -o ../../bin/api .)
(cd services/web && npm ci)
python3 -m venv worker/.venv
worker/.venv/bin/pip install -r worker/requirements.txt
pids=()
trap 'kill "${pids[@]}" 2>/dev/null || true' EXIT INT TERM
./bin/api & pids+=($!)
worker/.venv/bin/python worker/main.py & pids+=($!)
(cd services/web && npm run dev) & pids+=($!)
echo 'Aperture: http://localhost:3000 — create an account to create your workspace.'
wait
