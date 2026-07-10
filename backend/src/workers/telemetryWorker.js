const { Worker } = require('bullmq');
const pool = require('../config/db');

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
    const { jobId } = job.data;

    await pool.query(`UPDATE jobs SET status = 'processing' WHERE id = $1`, [jobId]);

    if (FORCE_FAILURE_RATE > 0 && Math.random() < FORCE_FAILURE_RATE) {
      throw new Error('Injected test failure');
    }

    // Simulate whatever real processing you want here (currently just marks done)
    await pool.query(`UPDATE jobs SET status = 'done' WHERE id = $1`, [jobId]);

    const duration = Date.now() - start;
    console.log(`Job ${job.id} (db job ${jobId}) done in ${duration}ms`);
  },
  { connection, concurrency: 10 }
);

worker.on('failed', async (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
  const { jobId } = job.data;
  await pool.query(
    `UPDATE jobs SET status = 'failed', retries = retries + 1 WHERE id = $1`,
    [jobId]
  );
});

console.log('Telemetry worker started');

module.exports = worker;