#!/bin/bash
# Aperture local dev — no Docker needed
# Requires: postgres running, go, node, python3

set -e

echo "=== Aperture Local Dev ==="

# Check deps
command -v go >/dev/null 2>&1 || { echo "go required"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "node required"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "python3 required"; exit 1; }
pg_isready >/dev/null 2>&1 || { echo "postgres not running. Start it: brew services start postgresql@15"; exit 1; }

# DB setup
export DATABASE_URL="postgresql://localhost:5432/aperture?sslmode=disable"

echo "→ Creating database if needed..."
psql postgres://localhost:5432 -tc "SELECT 1 FROM pg_database WHERE datname = 'aperture'" | grep -q 1 || \
  psql postgres://localhost:5432 -c "CREATE DATABASE aperture"

echo "→ Running migrations..."
for f in db/migrations/*.sql; do
  echo "  $f"
  psql "$DATABASE_URL" -f "$f" >/dev/null
done

echo "→ Seeding..."
for f in db/seeds/*.sql; do
  [ -f "$f" ] && psql "$DATABASE_URL" -f "$f" >/dev/null
done

# Install Go deps
echo "→ Building API..."
cd services/api
go mod tidy
go build -o ../../bin/api . &
API_PID=$!
cd ../..

# Install web deps
echo "→ Building web..."
cd services/web
npm install --silent
npm run build --silent 2>/dev/null || true
cd ../..

# Start Next.js dev server
cd services/web
npm run dev &
WEB_PID=$!
cd ../..

# Install worker deps
echo "→ Starting worker..."
cd worker
python3 -m pip install -q -r requirements.txt
cd ..

python3 worker/main.py &
WORKER_PID=$!

sleep 2

echo ""
echo "╔════════════════════════════════════════╗"
echo "║  Aperture running locally              ║"
echo "╠════════════════════════════════════════╣"
echo "║  Dashboard: http://localhost:3000      ║"
echo "║  API:       http://localhost:8000      ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "API health:"
curl -s http://localhost:8000/health || echo "  (API still starting...)"
echo ""
echo "Press Ctrl-C to stop"

# Trap to kill all on exit
trap "kill $API_PID $WEB_PID $WORKER_PID 2>/dev/null; exit" INT TERM EXIT
wait
