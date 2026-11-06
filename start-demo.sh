#!/bin/bash
# start-demo.sh — One-command startup for OrbitalOps (App, Worker, Postgres, Redis, Prometheus, Grafana).
# Can be run from any directory: ./start-demo.sh

set -e

# Dynamically resolve script directory (no hardcoded user paths)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🛰️  Starting OrbitalOps infrastructure..."
cd "$SCRIPT_DIR/backend"

# Auto-create .env.local if not present so Docker Compose never fails
if [ ! -f .env.local ]; then
  echo "Creating backend/.env.local..."
  cat <<EOF > .env.local
PORT=3001
NODE_ENV=development
POSTGRES_DB=orbitalops
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
REDIS_HOST=redis
REDIS_PORT=6379
EOF
fi

docker compose up --build -d

echo "Applying database schema migrations..."
docker compose exec -T app node migrations/migrate.js

echo "Seeding constellation satellites..."
docker compose exec -T app node scripts/seed.js

echo ""
echo "=========================================================="
echo "🚀 OrbitalOps Mission Control is fully online!"
echo "=========================================================="
echo "• 3D Mission Control & API:  http://localhost:3001"
echo "• Grafana Observability:     http://localhost:3000 (default: admin / admin)"
echo "• Prometheus Metrics:        http://localhost:9090"
echo "• Health Check:              http://localhost:3001/health"
echo "=========================================================="
echo ""
echo "To shut down: cd backend && docker compose down"