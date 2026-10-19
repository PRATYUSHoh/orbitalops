// In-memory queue processor for telemetry and alerts, conforming to Phase 2.2
// (Background Jobs) of the web migration reference.

const pool = require('../config/db');
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

  // Lazy load anomaly detector to prevent circular dependencies
  const { checkAnomaly } = require('./anomalyDetector');
  const alerts = await checkAnomaly({ satellite_id, temperature, battery, signal_strength });
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
    waitingCount++;
    queueDepth.set(waitingCount);

    const generatedJobId = opts.jobId || `job-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    // Asynchronous dispatch to simulate realistic queue processing
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
  getWaitingCount: async () => waitingCount,
};

const telemetryDLQ = {
  add: async (name, data) => {
    dlqJobsTotal.inc();
    console.log(`💀 [DLQ] Job routed to dead-letter queue:`, data);
    return { id: `dlq-${Date.now()}` };
  },
};

const alertQueue = {
  add: async (name, data) => {
    console.log(`🔔 [alertQueue] Alert queued: ${data.type} for satellite ${data.satellite_id}`);
    return { id: `alert-job-${Date.now()}` };
  },
};

module.exports = { telemetryQueue, telemetryDLQ, alertQueue };
