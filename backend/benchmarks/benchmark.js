/**
 * benchmark.js
 *
 * Pushes 10,000 jobs DIRECTLY onto the BullMQ 'telemetry-queue' (bypassing
 * HTTP entirely) and measures wall-clock time from the first job enqueued
 * to the 10,000th job completing (or failing). This isolates pure
 * queue + worker throughput, separate from the Artillery HTTP-layer test
 * which measures p50/p95/p99 through the Express layer.
 *
 * Run 3 times to get min/avg/max — each run appends its result to
 * benchmark_results.json and prints the running min/avg/max across
 * all runs recorded in that file so far.
 *
 * Run with: node scripts/benchmark.js
 * (run inside the app or worker container — needs both Postgres and
 * Redis reachable, same as the live app)
 */

const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');
const { telemetryQueue } = require('../src/services/telemetryQueue');

const NUM_JOBS = 10_000;
const BATCH_SIZE = 1000;
const RESULTS_FILE = path.join(__dirname, 'benchmark_results.json');

function randomTelemetryValues() {
  // Nominal-range values — this benchmark measures throughput, not
  // anomaly detection correctness, so we keep readings mostly normal.
  return {
    temperature: +(20 + Math.random() * 40).toFixed(1),
    battery: +(40 + Math.random() * 60).toFixed(1),
    signal_strength: +(-90 + Math.random() * 50).toFixed(1),
  };
}

async function getSatelliteIds() {
  const result = await pool.query(`SELECT id FROM satellites`);
  if (result.rows.length === 0) {
    throw new Error('No satellites found — run seed.js first.');
  }
  return result.rows.map((r) => r.id);
}

async function insertJobRows(count) {
  console.log(`Inserting ${count} job rows (status=pending)...`);
  const ids = [];
  const totalBatches = Math.ceil(count / BATCH_SIZE);

  for (let batch = 0; batch < totalBatches; batch++) {
    const rowsInBatch = Math.min(BATCH_SIZE, count - batch * BATCH_SIZE);
    const placeholders = [];
    const values = [];

    for (let i = 0; i < rowsInBatch; i++) {
      values.push('process-telemetry');
      placeholders.push(`($${values.length})`);
    }

    const result = await pool.query(
      `INSERT INTO jobs (type) VALUES ${placeholders.join(', ')} RETURNING id`,
      values
    );
    ids.push(...result.rows.map((r) => r.id));
  }

  console.log(`Inserted ${ids.length} job rows (ids ${ids[0]}–${ids[ids.length - 1]})`);
  return ids;
}

async function pollUntilAllResolved(minId, maxId, totalJobs) {
  const POLL_INTERVAL_MS = 500;
  while (true) {
    const result = await pool.query(
      `SELECT status, COUNT(*) FROM jobs WHERE id BETWEEN $1 AND $2 GROUP BY status`,
      [minId, maxId]
    );
    const counts = {};
    for (const row of result.rows) counts[row.status] = parseInt(row.count, 10);

    const done = counts.done || 0;
    const failed = counts.failed || 0;
    const resolved = done + failed;

    if (resolved >= totalJobs) {
      return { completed: done, failed };
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

async function runBenchmark() {
  const satelliteIds = await getSatelliteIds();
  const jobIds = await insertJobRows(NUM_JOBS);
  const minId = jobIds[0];
  const maxId = jobIds[jobIds.length - 1];

  console.log(`Enqueuing ${NUM_JOBS} jobs onto telemetry-queue...`);

  const start = Date.now();

  // Enqueue in batches to avoid holding 10,000 promises in flight at once
  for (let batch = 0; batch < Math.ceil(NUM_JOBS / BATCH_SIZE); batch++) {
    const batchJobIds = jobIds.slice(batch * BATCH_SIZE, (batch + 1) * BATCH_SIZE);
    await Promise.all(
      batchJobIds.map((jobId) => {
        const satellite_id = satelliteIds[Math.floor(Math.random() * satelliteIds.length)];
        const values = randomTelemetryValues();
        return telemetryQueue.add('telemetry-event', {
          jobId,
          satellite_id,
          ...values,
        });
      })
    );
  }

  const enqueueDurationMs = Date.now() - start;
  console.log(`All ${NUM_JOBS} jobs enqueued in ${(enqueueDurationMs / 1000).toFixed(1)}s. Polling DB for completion...`);

  const { completed: completedCount, failed: failedCount } = await pollUntilAllResolved(minId, maxId, NUM_JOBS);
  const totalDurationMs = Date.now() - start;

  const durationSec = totalDurationMs / 1000;
  const eventsPerMin = (NUM_JOBS / durationSec) * 60;

  const resultEntry = {
    timestamp: new Date().toISOString(),
    numJobs: NUM_JOBS,
    completed: completedCount,
    failed: failedCount,
    durationSec: +durationSec.toFixed(2),
    eventsPerMin: +eventsPerMin.toFixed(1),
  };

  console.log('\n=== Run result ===');
  console.log(resultEntry);

  return resultEntry;
}

function loadResults() {
  if (!fs.existsSync(RESULTS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveResults(results) {
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
}

function printSummary(results) {
  const durations = results.map((r) => r.durationSec);
  const rates = results.map((r) => r.eventsPerMin);

  const min = (arr) => Math.min(...arr);
  const max = (arr) => Math.max(...arr);
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

  console.log(`\n=== Summary across ${results.length} run(s) ===`);
  console.log(
    `Duration (s):    min ${min(durations).toFixed(2)}  avg ${avg(durations).toFixed(2)}  max ${max(durations).toFixed(2)}`
  );
  console.log(
    `Events/min:      min ${min(rates).toFixed(1)}  avg ${avg(rates).toFixed(1)}  max ${max(rates).toFixed(1)}`
  );
}

async function main() {
  try {
    const result = await runBenchmark();
    const results = loadResults();
    results.push(result);
    saveResults(results);
    printSummary(results);
  } catch (err) {
    console.error('Benchmark failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
    process.exit(); // BullMQ connections can keep the process alive otherwise
  }
}

main();