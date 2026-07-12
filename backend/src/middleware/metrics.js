const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const jobsProcessedTotal = new client.Counter({
  name: 'jobs_processed_total',
  help: 'Total number of jobs processed, by status',
  labelNames: ['status'],
  registers: [register],
});

const jobProcessingDuration = new client.Histogram({
  name: 'job_processing_duration_seconds',
  help: 'Job processing duration in seconds',
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [register],
});

const queueDepth = new client.Gauge({
  name: 'queue_depth',
  help: 'Current number of jobs waiting in the queue',
  registers: [register],
});

const anomaliesDetectedTotal = new client.Counter({
  name: 'anomalies_detected_total',
  help: 'Total anomalies detected, by type',
  labelNames: ['type'],
  registers: [register],
});

const retryAttemptsTotal = new client.Counter({
  name: 'retry_attempts_total',
  help: 'Total retry attempts across all jobs',
  registers: [register],
});

const dlqJobsTotal = new client.Counter({
  name: 'dlq_jobs_total',
  help: 'Total jobs moved to the dead-letter queue',
  registers: [register],
});

module.exports = {
  register,
  jobsProcessedTotal,
  jobProcessingDuration,
  queueDepth,
  anomaliesDetectedTotal,
  retryAttemptsTotal,
  dlqJobsTotal,
};