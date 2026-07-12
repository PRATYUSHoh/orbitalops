const express = require('express');
const { Worker } = require('bullmq');
const pool = require('../config/db');
const { checkAnomaly } = require('../services/anomalyDetector');
const circuitBreaker = require('../services/circuitBreaker');
const { createPublisher } = require('../services/socketPubSub');
const publisher = createPublisher();
const { telemetryDLQ, telemetryQueue } = require('../services/telemetryQueue');
const {
  register,
  jobsProcessedTotal,
  jobProcessingDuration,
  queueDepth,
  retryAttemptsTotal,
  dlqJobsTotal,
} = require('../middleware/metrics');

// --- Worker's own metrics server ---
// The worker runs in a SEPARATE Node process/container from the Express app,
// so it has its own in-memory Prometheus registry. The app's /metrics endpoint
// only sees counters incremented inside the app process — it can NEVER see
// what the worker increments. So the worker needs to expose its own /metrics
// endpoint too, and Prometheus scrapes BOTH targets separately.
const metricsApp = express();
metricsApp.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
metricsApp.listen(3002, () => console.log('Worker metrics server listening on :3002'));

const { getRedisConnection } = require('../config/redisConnection');
const connection = getRedisConnection();

const FORCE_FAILURE_RATE = process.env.FORCE_FAILURE_RATE
  ? parseFloat(process.env.FORCE_FAILURE_RATE)
  : 0;

const worker = new Worker(
  'telemetry-queue',
  async (job) => {
    const start = Date.now();
    const { jobId, satellite_id, temperature, battery, signal_strength } = job.data;

    if (circuitBreaker.isOpen()) {
      throw new Error('Circuit breaker open — DB unhealthy, pausing processing');
    }

    try {
      await pool.query(`UPDATE jobs SET status = 'processing' WHERE id = $1`, [jobId]);
      circuitBreaker.recordSuccess();
    } catch (err) {
      circuitBreaker.recordError();
      throw err;
    }

    if (FORCE_FAILURE_RATE > 0 && Math.random() < FORCE_FAILURE_RATE) {
      throw new Error('Injected test failure');
    }

    await pool.query(`UPDATE jobs SET status = 'done' WHERE id = $1`, [jobId]);

    // checkAnomaly returns the array of alerts fired for this event —
    // reuse that to derive isAnomaly instead of calling detection logic twice.
    const alerts = await checkAnomaly({ satellite_id, temperature, battery, signal_strength });
    const isAnomaly = alerts.length > 0;

    // Publish to Redis — the app container's Socket.io server is subscribed
    // to this channel and will re-broadcast to connected browser clients.
    publisher.publish({ satellite_id, isAnomaly });

    const durationMs = Date.now() - start;
    jobsProcessedTotal.inc({ status: 'done' });
    jobProcessingDuration.observe(durationMs / 1000);

    console.log(`Job ${job.id} (db job ${jobId}) done in ${durationMs}ms`);
  },
  { connection, concurrency: 10 }
);

const alertWorker = new Worker(
  'alert-queue',
  async (job) => {
    console.log(`🔔 Processing alert job ${job.id}:`, job.data.type, 'for satellite', job.data.satellite_id);
  },
  { connection, concurrency: 5 }
);

// Poll queue depth every 5 seconds and update the gauge
setInterval(async () => {
  try {
    const waiting = await telemetryQueue.getWaitingCount();
    queueDepth.set(waiting);
  } catch (err) {
    console.error('Failed to poll queue depth:', err.message);
  }
}, 5000);

worker.on('failed', async (job, err) => {
  console.error(`Job ${job.id} failed permanently:`, err.message);
  const { jobId } = job.data;

  try {
    await pool.query(
      `UPDATE jobs SET status = 'failed', retries = retries + 1 WHERE id = $1`,
      [jobId]
    );
  } catch (dbErr) {
    circuitBreaker.recordError();
  }

  jobsProcessedTotal.inc({ status: 'failed' });
  retryAttemptsTotal.inc();

  if (job.attemptsMade >= job.opts.attempts) {
    await telemetryDLQ.add('dead-letter', { ...job.data, failedReason: err.message });
    dlqJobsTotal.inc();
    console.log(`💀 Job ${job.id} moved to DLQ`);
  }
});

console.log('Telemetry worker + alert worker started');

module.exports = { worker, alertWorker };