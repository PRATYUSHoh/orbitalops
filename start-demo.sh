#!/bin/bash
# start-demo.sh — one command to bring up the full OrbitalOps demo.
# Run from anywhere: bash ~/projects/orbitalops/start-demo.sh

set -e

echo "Starting backend (app, worker, postgres, redis, prometheus, grafana)..."
cd ~/projects/orbitalops/backend
docker compose up -d

echo ""
echo "Starting frontend static server..."
cd ~/projects/orbitalops/frontend
npx serve . > /tmp/orbitalops-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend server started (PID $FRONTEND_PID) — check /tmp/orbitalops-frontend.log for its actual URL"

sleep 3

echo ""
echo "=== OrbitalOps is up ==="
echo "Backend health:  http://localhost:3001/health"
echo "Grafana:         http://localhost:3000  (dashboard: OrbitalOps Monitoring)"
echo "Prometheus:      http://localhost:9090"
echo "Frontend:        see /tmp/orbitalops-frontend.log for the exact port npx serve picked"
echo ""
echo "To stop everything: cd ~/projects/orbitalops/backend && docker compose down"
echo "                    and: kill $FRONTEND_PID  (stops the frontend server)"