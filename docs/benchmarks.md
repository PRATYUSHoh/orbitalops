# OrbitalOps Benchmark & Workload Methodology

All benchmark metrics documented in this project are derived from **synthetic workloads** designed to measure queue throughput, backpressure handling, database write overhead, and retry reliability under stress.

> **Notice:** All performance measurements, request rates, and telemetry values referenced below represent a **synthetic workload** running against simulated or benchmark-driven data feeds.

---

## 1. Workload Generation Architecture

OrbitalOps uses two distinct generation mechanisms depending on what layer is being evaluated:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SYNTHETIC WORKLOAD PIPELINE                     │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Direct Queue Benchmark (backend/benchmarks/benchmark.js):           │
│    Bypasses HTTP. Batches 10,000 synthetic jobs directly into BullMQ   │
│    to measure pure asynchronous queue + worker drain throughput.       │
│                                                                        │
│ 2. HTTP Load Testing (backend/artillery/load-test.yml):                │
│    Ramps up to 200 virtual concurrent users over 60s against Express   │
│    routes (/api/satellites/:id/health & /api/alerts) via Artillery.    │
│                                                                        │
│ 3. Database Pre-Seeding (backend/scripts/seed.js):                     │
│    Seeds 50 constellation satellites and 100,000 historical telemetry  │
│    events directly into PostgreSQL using multi-row batch inserts.      │
└────────────────────────────────────────────────────────────────────────┘
```

### Deterministic Seeding via `SEED` Environment Variable
Both `backend/scripts/seed.js` and `backend/benchmarks/benchmark.js` support an optional `SEED` environment variable (e.g., `SEED=42`). 
* When `SEED` is provided, Faker and the benchmark's linear congruential PRNG produce identical sequences of telemetry values, timestamps, and orbit types across test runs without altering metric semantics or throughput calculations.
* When omitted, standard pseudo-random distributions are used.

---

## 2. Telemetry Value Generation Specification

Every generated event models three primary physical telemetry vectors:

| Telemetry Vector | Nominal Range | Anomalous Range (5% Injection in Seed) | Unit | Threshold Limit |
|---|---|---|---|---|
| **Core Temperature** | `20.0°C` to `60.0°C` | `90.1°C` to `120.0°C` | Degrees Celsius (°C) | Critical if `> 90°C` |
| **Battery Level** | `40.0%` to `100.0%` | `0.0%` to `9.9%` | Percentage (%) | Low if `< 10%` |
| **Signal Strength (RSSI)** | `-90.0 dBm` to `-40.0 dBm` | `-160.0 dBm` to `-120.1 dBm` | Decibel-milliwatts (dBm) | Lost if `< -120 dBm` |

---

## 3. Failure Injection Methodology

Failure simulation is decoupled from normal nominal processing to stress-test retry policies and Dead-Letter Queue (DLQ) behavior:

### Rate and Mechanism
* **Location:** `backend/src/workers/telemetryWorker.js`
* **Trigger:** Controlled via the `FORCE_FAILURE_RATE` environment variable (defaults to `0` in production).
* **Failure Type:** Simulated transient unhandled runtime exception (`throw new Error('Injected test failure')`) thrown after job status transitions to `processing`, but before anomaly detection and database commit.
* **Baseline Stress Test Configuration:**
  - `FORCE_FAILURE_RATE=0.15` (forces a random 15% transient failure probability).

### Retry Comparison (1,000 Synthetic Events)
* **Without Retry (`baseline_no_retry.js`):**
  - Jobs enqueued with `{ attempts: 1 }`.
  - **Result (Synthetic Workload):** 137 out of 1,000 jobs permanently failed (**13.7% failure rate**).
* **With Exponential Backoff Retry (`baseline_with_retry.js`):**
  - Jobs enqueued with `{ attempts: 3, backoff: { type: 'exponential', delay: 1000 } }`.
  - Schedule: Attempt 1 at $t=0$, Retry 1 at $+1\text{s}$, Retry 2 at $+2\text{s}$, Retry 3 at $+4\text{s}$.
  - **Result (Synthetic Workload):** 4 out of 1,000 jobs exhausted all 3 attempts (**0.4% failure rate**).
  - **Reliability Delta:** 97% reduction in permanent failures. Permanently failed jobs were cleanly routed to `telemetryDLQ`.

---

## 4. Benchmark Specifications & Hardware Environment

### Test Machine Specifications
- **Processor:** AMD Ryzen 7 7425HS (8 Cores, 16 Threads @ up to 4.3 GHz)
- **Memory:** 24 GB DDR5 RAM
- **Graphics / Acceleration:** NVIDIA GeForce RTX 4050 Laptop GPU (6 GB VRAM, 125W TGP)
- **Storage:** PCIe 4.0 NVMe SSD
- **OS / Runtime:** Linux / Docker Engine 24.x, Node.js 20-alpine

### Queue Drain Throughput (Synthetic Workload)
Tested by pushing 10,000 synthetic jobs into BullMQ with a worker concurrency of 10:

| Run Number | Total Jobs | Wall-Clock Duration | Processing Rate (Events / Min) | Permanent Failures |
|---|---|---|---|---|
| Run 1 | 10,000 | 10.18s | 58,933.3 events/min | 0 |
| Run 2 | 10,000 | 10.76s | 55,746.5 events/min | 0 |
| Run 3 | 10,000 | 10.72s | 55,991.0 events/min | 0 |
| **Summary** | **30,000** | **Avg: 10.55s** | **Avg: 56,890.3 events/min** | **0 failures** |

### HTTP Ingestion & Health Query Latency (Synthetic Workload)
Load-tested using Artillery (`load-test.yml`) against Express API:
- **Duration:** 60-second ramp from 1 to 200 concurrent users/sec.
- **Total Requests:** 6,030 requests (0 HTTP errors).
- **`/api/satellites/:id/health` (p50 / p95 / p99):** `26.8ms` / `34.8ms` / `53.0ms`
- **`/api/alerts` (p50 / p95 / p99):** `3.0ms` / `4.0ms` / `8.9ms`

---

## 5. What Is NOT Modelled

To maintain transparency, the following production telemetry realities are intentionally not simulated:

1. **Doppler Shift & Radio Frequency Fading:**
   Satellite signal attenuation is modeled as a uniform scalar float between `-160 dBm` and `-40 dBm`. Atmospheric attenuation, solar flare scintillation, and Doppler frequency shifting are not simulated.
2. **Orbital Ephemeris Propagation (SGP4/TLE):**
   Satellite orbit types (`LEO`, `MEO`, `GEO`, `SSO`) are categorical properties. Orbital trajectory paths rendered on the 3D globe use Fibonacci spherical coordinate distributions rather than numerical SGP4 physics integration.
3. **Multi-Host Network Latency (Single-Host Container Network):**
   All benchmark throughput numbers reflect containerized networking on a single physical host (`app`, `redis`, `postgres`, `worker`). Multi-region round-trip WAN latencies (e.g. cross-datacenter transit) will decrease raw network throughput.
4. **Out-of-Order Packet Delivery (TCP-Assumed):**
   Telemetry ingestion assumes standard HTTP/JSON delivery. Raw UDP/CCSDS packet loss and byte-level frame reassembly are omitted in favor of standard enterprise application protocols.
