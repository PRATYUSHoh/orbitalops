// Hybrid BullMQ + In-Memory Queue for OrbitalOps.
// Uses real BullMQ queues backed by Redis when REDIS_URL (redis:// or rediss://)
// or REDIS_HOST is configured and reachable. Seamlessly falls back to an
// in-process async queue when Redis is unconfigured or temporarily offline.

const { Queue } = require('bullmq');
const pool = require('../config/db');
const { getRedisConnection, isRedisConfigured } = require('../config/redisConnection');
const redisClient = require('../config/redis');
const circuitBreaker = require('./circuitBreaker');
const { createPublisher } = require('./socketPubSub');
const publisher = createPublisher();
const {
  jobsProcessedTotal,
  jobProcessingDuration,
  queueDepth,
  retryAttemptsTotal,
  dlqJobsTotal,
} = require('../middleware/metrics');

let waitingCount = 0;

let realTelemetryQueue = null;
let realTelemetryDLQ = null;
let realAlertQueue = null;

function initBullMQQueues() {
  if (realTelemetryQueue) return true;
  const connection = getRedisConnection();
  if (!connection) return false;

  realTelemetryQueue = new Queue('telemetry-queue', { connection });
  realTelemetryDLQ = new Queue('telemetry-dlq', { connection });
  realAlertQueue = new Queue('alert-queue', { connection });

  const onErr = (name) => (err) => {
    console.warn(`[queue:${name}] BullMQ error:`, err.message);
  };
  realTelemetryQueue.on('error', onErr('telemetry'));
  realTelemetryDLQ.on('error', onErr('dlq'));
  realAlertQueue.on('error', onErr('alert'));

  console.log('[queue] BullMQ queues initialized with Redis');
  return true;
}

async function isBullMQActive() {
  if (!isRedisConfigured()) return false;
  const ready = await redisClient.waitForRedisReady();
  if (!ready) return false;
  return initBullMQQueues();
}

// Cached anomaly detector to prevent circular dependencies or teardown require warnings
let checkAnomalyCached = null;
function getCheckAnomaly() {
  if (!checkAnomalyCached) {
    try {
      const mod = require('./anomalyDetector');
      checkAnomalyCached = mod.checkAnomaly;
    } catch (_) {}
  }
  return checkAnomalyCached;
}

async function processTelemetryJob(jobData) {
  const start = Date.now();
  const { jobId, satellite_id, temperature, battery, signal_strength } = jobData;

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

  await pool.query(`UPDATE jobs SET status = 'done' WHERE id = $1`, [jobId]);

  const detector = getCheckAnomaly();
  const alerts = detector ? await detector({ satellite_id, temperature, battery, signal_strength }) : [];
  const isAnomaly = alerts.length > 0;

  // Broadcast to connected UI clients
  publisher.publish({ satellite_id, isAnomaly });

  const durationMs = Date.now() - start;
  jobsProcessedTotal.inc({ status: 'done' });
  jobProcessingDuration.observe(durationMs / 1000);

  console.log(`[queue] Job (db job ${jobId}) processed in ${durationMs}ms — anomaly=${isAnomaly}`);
}

const telemetryQueue = {
  add: async (name, data, opts = {}) => {
    if (await isBullMQActive()) {
      try {
        return await realTelemetryQueue.add(name, data, opts);
      } catch (err) {
        console.warn('[queue] BullMQ enqueue failed, using in-memory fallback:', err.message);
      }
    }

    waitingCount++;
    queueDepth.set(waitingCount);

    const generatedJobId = opts.jobId || `job-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    // Asynchronous dispatch for in-process fallback mode
    setTimeout(async () => {
      try {
        await processTelemetryJob(data);
      } catch (err) {
        console.error(`[queue] Job failed: ${err.message}`);
        jobsProcessedTotal.inc({ status: 'failed' });
        retryAttemptsTotal.inc();
        dlqJobsTotal.inc();
        await pool.query(
          `UPDATE jobs SET status = 'failed', retries = retries + 1 WHERE id = $1`,
          [data.jobId]
        ).catch(() => {});
      } finally {
        waitingCount = Math.max(0, waitingCount - 1);
        queueDepth.set(waitingCount);
      }
    }, 60);

    return { id: generatedJobId };
  },

  getWaitingCount: async () => {
    if (await isBullMQActive()) {
      try {
        return await realTelemetryQueue.getWaitingCount();
      } catch (_) {}
    }
    return waitingCount;
  },
};

const telemetryDLQ = {
  add: async (name, data, opts = {}) => {
    const dlqJobId = opts.jobId || `dlq-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    if (await isBullMQActive()) {
      try {
        const job = await realTelemetryDLQ.add(name, data, { ...opts, jobId: dlqJobId });
        return job;
      } catch (err) {
        console.warn('[dlq] BullMQ DLQ enqueue failed, using local fallback:', err.message);
      }
    }

    dlqJobsTotal.inc();
    console.log(`💀 [DLQ] Job routed to dead-letter queue:`, data);
    return { id: dlqJobId };
  },
};

const alertQueue = {
  add: async (name, data, opts = {}) => {
    if (await isBullMQActive()) {
      try {
        return await realAlertQueue.add(name, data, opts);
      } catch (err) {
        console.warn('[alertQueue] BullMQ enqueue failed, using local fallback:', err.message);
      }
    }

    console.log(`🔔 [alertQueue] Alert queued: ${data.type} for satellite ${data.satellite_id}`);
    return { id: `alert-job-${Date.now()}` };
  },
};

async function closeQueues() {
  await Promise.all([
    realTelemetryQueue?.close().catch(() => {}),
    realTelemetryDLQ?.close().catch(() => {}),
    realAlertQueue?.close().catch(() => {}),
    publisher.close().catch(() => {}),
  ]);
  realTelemetryQueue = null;
  realTelemetryDLQ = null;
  realAlertQueue = null;
}

module.exports = { telemetryQueue, telemetryDLQ, alertQueue, closeQueues };
