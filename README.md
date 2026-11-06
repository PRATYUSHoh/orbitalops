# OrbitalOps

**Satellite telemetry event processing engine with fault-tolerant job queuing, anomaly detection, real-time visualization, and full observability — built as an event-driven, multi-container backend systems project.**

🌐 **Live Demo:** [https://orbitalops.onrender.com/](https://orbitalops.onrender.com/)  
📊 **Detailed Benchmark Methodology:** [`docs/benchmarks.md`](docs/benchmarks.md)

---

## Problem Statement

Satellites generate high-velocity bursts of telemetry data (core temperature, battery charge level, and radio signal strength) during ground station orbital passes. If an API writes incoming high-frequency telemetry directly to a relational database synchronously:
1. **Database connection pools saturate immediately**, causing HTTP 504 gateway timeouts.
2. **Transient downstream connection spikes** drop telemetry frames permanently without retries.
3. **Malfunctioning sensors flood duplicate payloads**, triggering redundant alerting and wasted compute cycles.

**OrbitalOps** resolves this by decoupling ingestion from processing using an event-driven, multi-container architecture. Telemetry is acknowledged in ~10ms, queued in BullMQ with Redis, drained asynchronously by worker processes with exponential backoff and Dead-Letter Queue (DLQ) isolation, and streamed live to an interactive 3D Mission Control HUD via Redis Pub/Sub and WebSockets.

---

## Architecture

OrbitalOps is designed as an **event-driven, multi-container** system. In local Docker Compose and production, the ingestion API, queue workers, database, cache, and metrics scrapers run in isolated containers.

```mermaid
flowchart TD
    subgraph Ingestion ["Ingestion Tier (app:3001)"]
        Client["Satellite / Benchmark Client"] -->|HTTP POST /api/telemetry| Express["Express API"]
        Express -->|100ms Window| Dedup{"Deduplication Check"}
        Dedup -->|Duplicate| Ret200["200 OK (Ignored)"]
        Dedup -->|New Event| DBInit["Postgres: Insert Event & Pending Job"]
        DBInit -->|Enqueue Job| BullMQPusher["BullMQ Producer"]
    end

    subgraph Broker ["Message Broker & State Tier"]
        BullMQPusher -->|Job Push| RedisQueue[("Redis: telemetry-queue")]
        Worker -->|Cross-Process Pub/Sub| RedisPubSub[("Redis Pub/Sub Channel")]
    end

    subgraph Processing ["Worker Tier (worker:3002)"]
        RedisQueue -->|Pull Concurrent Batch| Worker["BullMQ Telemetry Worker"]
        Worker --> AnomalyCheck{"Rule-Based Thresholds"}
        AnomalyCheck -->|Anomaly Detected| AlertTable[("Postgres: alerts table")]
        AnomalyCheck -->|Healthy / Processed| JobDone[("Postgres: jobs status='done'")]
        
        Worker -->|Transient Failure| RetryLogic{"Attempt <= 3?"}
        RetryLogic -->|Yes| Backoff["Exponential Backoff (1s, 2s, 4s)"]
        Backoff -->|Re-queue| RedisQueue
        RetryLogic -->|No (Poison Pill)| DLQ[("Dead-Letter Queue (DLQ)")]
        
        Worker -->|Broadcast Result| RedisPubSub
    end

    subgraph RealTime ["Real-Time Visualization Tier"]
        RedisPubSub -->|Subscribe| SocketServer["Socket.io Server (app)"]
        SocketServer -->|WebSocket Stream| ThreeGlobe["Three.js 3D Mission Control HUD"]
    end

    subgraph Observability ["Observability Tier"]
        Express -->|/metrics :3001| PrometheusScraper["Prometheus (9090)"]
        Worker -->|/metrics :3002| PrometheusScraper
        PrometheusScraper -->|PromQL| GrafanaDash["Grafana Dashboard (:3000)"]
    end
```

### Multi-Container Process Isolation Decisions

1. **Dual Prometheus Scrape Targets:**  
   The Prometheus Node.js client (`prom-client`) maintains metrics in-memory per Node process. Because the API (`app:3001`) and the queue worker (`worker:3002`) run in separate memory spaces across containers, worker metrics (queue duration, retries, DLQ count) are invisible to the app process. The worker exposes its own HTTP server on port 3002, and `prometheus.yml` scrapes both endpoints independently.
2. **Cross-Container Socket.io Broadcasting:**  
   The background worker cannot directly access the Express server's WebSocket instances. To bridge containers, the worker publishes `{ satellite_id, isAnomaly }` to a Redis Pub/Sub channel; the API server subscribes and immediately broadcasts to browser clients.

---

## Tech Stack

- **Runtime & Framework:** Node.js 20, Express
- **Database:** PostgreSQL (raw parameterized SQL, no ORM for direct query optimization and predictable performance under stress)
- **Message Broker & Queue:** Redis 7 + BullMQ
- **Real-Time Communication:** Socket.io + Redis Pub/Sub
- **Observability:** Prometheus + Grafana (custom 6-panel dashboard)
- **Testing & CI:** Jest, Supertest, GitHub Actions (with Redis service container)
- **Frontend HUD:** Three.js, WebGL, Tailwind CSS, Space Mono typography
- **Deployment:** Multi-container Docker Compose (local), containerized full-stack deployment on Render

---

## Synthetic Benchmarks & Empirical Reliability

> **Note:** All benchmark figures reflect a **synthetic workload** run against a dedicated benchmark suite. See [`docs/benchmarks.md`](docs/benchmarks.md) for complete hardware specifications, tools, and reproducible methodology.

- **Queue Processing Throughput (Synthetic Workload):**  
  **56,890.3 events/min average** (up to 58,933.3 events/min) across 30,000 synthetic jobs at concurrency 10, with **0 dropped jobs**.
- **Retry & DLQ Reliability Delta (1,000-event stress baseline):**  
  - Without retries: **13.7% failure rate** (137/1,000 failed under a 15% transient error injection rate).  
  - With 3-attempt exponential backoff ($1\text{s} \to 2\text{s} \to 4\text{s}$): **0.4% failure rate** (4/1,000 permanently failed).  
  - **Result: 97% reduction in failure rate**, with exhausted failures cleanly isolated in the Dead-Letter Queue.
- **HTTP Stress Latency (Artillery — 200 concurrent users over 60s):**  
  6,030 total requests, **0 errors**.  
  - `/api/satellites/:id/health` (multi-table join): **p50: 26.8ms**, **p95: 34.8ms**, **p99: 53.0ms**  
  - `/api/alerts` (paginated indexed query): **p50: 3.0ms**, **p95: 4.0ms**, **p99: 8.9ms**

---

## Key Design Decisions

1. **Rule-Based Anomaly Thresholds vs. Machine Learning:**  
   Operational limits (`Core Temp > 90°C`, `Battery < 10%`, `Signal < -120 dBm`) use hard rule-based gates. In real satellite engineering, battery depletion below 10% is unambiguously critical regardless of baseline trends. Rule-based evaluation provides deterministic, zero-latency verification without ML training drift or opaque inference costs.
2. **Raw SQL over ORM:**  
   All queries use PostgreSQL parameterized prepared statements (`pg.Pool`). This prevents ORM abstraction overhead, avoids $N+1$ query cascades during burst ingestion, and allows fine-grained control over multi-row batch inserts (`100,000 rows in 3.0s`).
3. **Graceful Degradation Circuit Breakers:**  
   If PostgreSQL or Redis encounters transient disconnects, circuit-breaker fallbacks route jobs through an in-memory queue and mock storage. The 3D Mission Control frontend continues operating without 502/504 downtime.

---

## How to Run Locally

### Quickstart (One Command)
Run the automated startup script from the root of the repository:
```bash
git clone https://github.com/PRATYUSHoh/orbitalops.git
cd orbitalops
bash start-demo.sh
```

### Manual Setup (Step-by-Step)
```bash
git clone https://github.com/PRATYUSHoh/orbitalops.git
cd orbitalops/backend

# Create environment configuration
cp .env.example .env.local

# Build and start all 6 services (App, Worker, Postgres, Redis, Prometheus, Grafana)
docker compose up --build -d

# Run database schema migrations
docker compose exec app node migrations/migrate.js

# Seed 50 constellation satellites and telemetry data
docker compose exec app node scripts/seed.js
```

### Access Services
- **3D Mission Control & Full-Stack App:** `http://localhost:3001`
- **Grafana Observability Dashboard:** `http://localhost:3000` (default login: `admin` / `admin`)
- **Prometheus Scraper:** `http://localhost:9090`
- **Backend Health Check:** `http://localhost:3001/health`
- **Worker Internal Metrics:** `http://localhost:3002/metrics` (internal network)

---

## Automated Tests & Benchmarks

```bash
# Run unit, validation, idempotency, and DLQ test suites
cd backend
npm test

# Run queue throughput benchmark (synthetic workload)
docker compose exec app node benchmarks/benchmark.js
```

---

## Known Limitations

- **In-Memory Deduplication Window:**  
  The 100ms deduplication cache (`recentBuckets`) currently operates in-process memory. While fast for a single container instance, horizontally scaling the API across multiple host nodes would require migrating this state to Redis using atomic `SET key val NX PX 100`.
- **Cosmetic Orbit Rendering:**  
  The 50 satellite orbits displayed in the 3D WebGL HUD use spherical Fibonacci positioning and geometric inclinations. Real-world satellite physics require SGP4 orbit propagation using Two-Line Element (TLE) ephemeris sets.
- **Single-Host Container Networking:**  
  All reported benchmark latencies reflect container networking on a single physical host rather than geographically distributed ground stations with cross-region WAN transit delays.
