const { Queue } = require('bullmq');

const { getRedisConnection } = require('../config/redisConnection');
const connection = getRedisConnection();

const telemetryQueue = new Queue('telemetry-queue', { connection });
const telemetryDLQ = new Queue('telemetry-dlq', { connection });
const alertQueue = new Queue('alert-queue', { connection });

module.exports = { telemetryQueue, telemetryDLQ, alertQueue };
