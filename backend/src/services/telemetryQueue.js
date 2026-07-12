const { Queue } = require('bullmq');

const connection = {
  host: process.env.REDIS_HOST || 'redis',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null,
};

const telemetryQueue = new Queue('telemetry-queue', { connection });
const telemetryDLQ = new Queue('telemetry-dlq', { connection });
const alertQueue = new Queue('alert-queue', { connection });

module.exports = { telemetryQueue, telemetryDLQ, alertQueue };
