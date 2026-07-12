const { Worker } = require('bullmq');
const pool = require('../config/db');
const { checkAnomaly } = require('../services/anomalyDetector');
const circuitBreaker = require('../services/circuitBreaker');
const { telemetryDLQ } = require('../services/telemetryQueue');

const connection = {
  host: process.env.REDIS_HOST || 'redis',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null,
};

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
    await checkAnomaly({ satellite_id, temperature, battery, signal_strength });

    console.log(`Job ${job.id} (db job ${jobId}) done in ${Date.now() - start}ms`);
  },
  { connection, concurrency: 10 }
);

// New: dedicated worker for alert jobs (separate queue, own concurrency)
const alertWorker = new Worker(
  'alert-queue',
  async (job) => {
    console.log(`🔔 Processing alert job ${job.id}:`, job.data.type, 'for satellite', job.data.satellite_id);
    // Placeholder for real alert-handling logic (e.g. notify, escalate)
  },
  { connection, concurrency: 5 }
);

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

  console.log(`DEBUG: job.attemptsMade=${job.attemptsMade}, job.opts.attempts=${job.opts?.attempts}`);

  if (job.attemptsMade >= job.opts.attempts) {
    await telemetryDLQ.add('dead-letter', { ...job.data, failedReason: err.message });
    console.log(`💀 Job ${job.id} moved to DLQ`);
  }
});

console.log('Telemetry worker + alert worker started');

module.exports = { worker, alertWorker };