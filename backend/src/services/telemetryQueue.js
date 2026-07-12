const { Worker } = require('bullmq');
const pool = require('../config/db');
const { checkAnomaly } = require('../services/anomalyDetector');
const circuitBreaker = require('../services/circuitBreaker');
const { Queue } = require('bullmq');

const connection = {
  host: process.env.REDIS_HOST || 'redis',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null,
};

const telemetryQueue = new Queue('telemetry-queue', { connection });
const telemetryDLQ = new Queue('telemetry-dlq', { connection });
const alertQueue = new Queue('alert-queue', { connection });
const FORCE_FAILURE_RATE = process.env.FORCE_FAILURE_RATE
  ? parseFloat(process.env.FORCE_FAILURE_RATE)
  : 0;

const worker = new Worker(
  'telemetry-queue',
  async (job) => {
    const start = Date.now();
    const { jobId, satellite_id, temperature, battery, signal_strength } = job.data;

    if (circuitBreaker.isOpen()) {
      console.warn(`⚠️ Circuit breaker open — delaying job ${job.id}`);
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

    try {
      await pool.query(`UPDATE jobs SET status = 'done' WHERE id = $1`, [jobId]);
      circuitBreaker.recordSuccess();
    } catch (err) {
      circuitBreaker.recordError();
      throw err;
    }

    // Run anomaly detection after successful processing
    await checkAnomaly({ satellite_id, temperature, battery, signal_strength });

    const duration = Date.now() - start;
    console.log(`Job ${job.id} (db job ${jobId}) done in ${duration}ms`);
  },
  { connection, concurrency: 10 }
);



worker.on('failed', async (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
  const { jobId } = job.data;
  try {
    await pool.query(
      `UPDATE jobs SET status = 'failed', retries = retries + 1 WHERE id = $1`,
      [jobId]
    );
  } catch (dbErr) {
    circuitBreaker.recordError();
    console.error('Failed to update job status after failure:', dbErr.message);
  }
});

console.log('Telemetry worker started');

module.exports = worker;
module.exports = { telemetryQueue, telemetryDLQ, alertQueue };