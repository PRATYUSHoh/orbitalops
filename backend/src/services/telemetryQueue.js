const { Queue } = require('bullmq');

const connection = {
  host: process.env.REDIS_HOST || 'redis',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null, // required by BullMQ
};

const telemetryQueue = new Queue('telemetry-queue', { connection });

module.exports = telemetryQueue;