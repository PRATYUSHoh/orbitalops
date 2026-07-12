# OrbitalOps

Satellite telemetry event processing engine with fault-tolerant job queuing, anomaly detection, and observability — built as a backend systems portfolio project.

## What it does

OrbitalOps ingests satellite telemetry events (temperature, battery, signal strength) through a queue-backed pipeline that detects anomalies, retries transient failures, and routes permanently failed events to a dead-letter queue. It exposes REST APIs for satellite health, job status, and alert history, with full Prometheus/Grafana observability into queue depth, processing latency, and failure rates.

## Architecture

```
┌──────────┐     ┌───────┐     ┌────────┐     ┌────────┐     ┌──────────────────┐
│ Producer │────▶│ Redis │────▶│ BullMQ │────▶│ Worker │────▶│ Anomaly Detection │
│ (API)    │     │       │     │ Queue  │     │        │     │                  │
└──────────┘     └───────┘     └────────┘     └────────┘     └──────────────────┘
                                                    │                   │
                                                    ▼                   ▼
                                          ┌──────────────────┐   ┌────────────┐
                                          │ Retry (3x, exp    │   │   Alerts   │
                                          │ backoff) → DLQ    │   │   Table    │
                                          └──────────────────┘   └────────────┘
                                                    │
                                                    ▼
                                          ┌──────────────────┐     ┌─────────┐
                                          │ Prometheus       │────▶│ Grafana │
                                          │ (/metrics :3002) │     │         │
                                          └──────────────────┘     └─────────┘
```

Producer and worker run as separate Docker containers/processes. The worker exposes its own `/metrics` endpoint on a dedicated port (3002) — since Prometheus's Node.js client keeps metrics in an in-memory registry scoped to a single process, a metric incremented in the worker is invisible to the app container's registry and vice versa. Prometheus is configured with two scrape targets (`app:3001` and `worker:3002`) to capture both halves of the pipeline.

## Tech stack

- **Runtime:** Node.js, Express
- **Database:** PostgreSQL (raw SQL, no ORM — deliberate choice for direct query control and predictable performance under load)
- **Queue:** Redis + BullMQ
- **Observability:** Prometheus (prom-client) + Grafana
- **Infra:** Docker Compose (app, worker, postgres, redis, prometheus, grafana — 6 services)
- **Frontend:** Three.js satellite globe visualization (cosmetic, one-way push via Socket.io — separate from the core backend pipeline)

## Benchmarks (local Docker — not Railway)

**Hardware:** Ryzen 7 7425HS, 24GB RAM, RTX 4050 6GB VRAM (125W TGP)

### Seed data
50 satellites, 100,000 telemetry events seeded directly into Postgres via batched multi-row inserts: **100,000 rows in 3.0s**.

### Queue throughput (10,000 jobs pushed directly onto BullMQ, 3 runs)

| Run | Duration (s) | Events/min | Failed |
|---|---|---|---|
| 1 | 10.18 | 58,933.3 | 0 |
| 2 | 10.76 | 55,746.5 | 0 |
| 3 | *see `benchmarks/benchmark_results.json`* | *see `benchmarks/benchmark_results.json`* | 0 |
| **Min** | 10.18 | 55,746.5 | — |
| **Avg** | 10.55 | 56,890.3 | — |
| **Max** | 10.76 | 58,933.3 | — |

Zero failures across 30,000 total jobs processed at concurrency 10.

### Retry reliability (1,000-event baseline comparison)
- **Without retry:** 137/1,000 events failed (13.7% failure rate)
- **With retry (3 attempts, exponential backoff):** 4/1,000 events failed (0.4% failure rate)
- **Result: 97% reduction in failure rate**

### HTTP load test (Artillery — 200 concurrent users, 60s ramp)

6,030 total requests, **0 failures**, across a 60-second ramp from 1 to 200 concurrent users/sec.

| Endpoint | Requests | p50 | p95 | p99 |
|---|---|---|---|---|
| `/api/satellites/:id/health` | 3,071 | 26.8ms | 34.8ms | 53ms |
| `/api/alerts?limit=20&offset=0` | 2,959 | 3ms | 4ms | 8.9ms |

The latency gap between the two endpoints reflects real query cost differences: `/health` joins satellite metadata, latest telemetry, job status counts, and recent alerts in one response, while `/alerts` is a simpler filtered/paginated query. One outlier request hit 918ms during the very first metrics window (likely a cold DB connection pool / query plan cache miss on the first hit) — every subsequent window's max stayed under 120ms, so this reads as a one-time warm-up cost, not a sustained latency problem.

### BullMQ metrics snapshot (Redis Insight, post-10K run)
*Pending — screenshot to be added showing success rate, avg processing time, and DLQ count from Redis Insight.*

## Anomaly detection design decision

Anomaly detection uses fixed rule-based thresholds rather than a statistical or ML-based approach:

- **Temperature:** critical above 90°C
- **Battery:** low below 10%
- **Signal strength:** lost below -120dBm

This was a deliberate choice given the project's scope and timeline. Rule-based thresholds are transparent, testable, and match how real telemetry systems commonly define hard operational limits (a satellite battery below 10% is unambiguously a problem regardless of historical baseline). An ML-based anomaly detection layer was considered and explicitly rejected — it would have added training/data requirements disproportionate to the project's goals and introduced non-determinism that complicates interview explanations and test coverage.

## How to run locally

```bash
git clone https://github.com/PRATYUSHoh/orbitalops.git
cd orbitalops/backend
docker compose up --build -d

# Run database migrations
docker exec -it backend-app-1 node migrations/migrate.js

# Seed a test satellite (required — job/telemetry rows have a FK constraint on satellites)
docker exec -it backend-postgres-1 psql -U postgres -d orbitalops \
  -c "INSERT INTO satellites (name, orbit_type) VALUES ('TestSat-1', 'LEO');"

# Optional: seed 50 satellites + 100K telemetry events for realistic demo/benchmark data
docker exec -it backend-app-1 node scripts/seed.js
```

- App: `http://localhost:3001`
- Worker metrics: internal only, scraped by Prometheus at `worker:3002/metrics`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3000`

### Running the benchmarks

```bash
# Queue throughput benchmark (run 3x for min/avg/max)
docker exec -it backend-app-1 node benchmarks/benchmark.js
```

## Grafana dashboard

*Pending — 6 panels to be added: Telemetry Ingestion Rate, Job Processing Latency (p50/p95), Anomaly Alert Frequency, Signal Loss Events/min, Retry Attempts Over Time, DLQ Accumulation Rate. Screenshots from a live 10K-job run to be added to `/docs/grafana/`.*

## Known limitations

- In-memory deduplication (100ms time buckets) does not scale across multiple worker instances — noted as a known constraint, not yet solved.
- Frontend globe uses fake `setInterval` flashes in early development; real Socket.io wiring from the worker is a later-stage addition, isolated from the core backend deliverable so slippage on the frontend doesn't affect backend completion.