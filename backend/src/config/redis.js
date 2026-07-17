// ioredis client — single instance, reused everywhere.
// Uses the SAME parsing logic as redisConnection.js (getRedisConnection)
// rather than passing the raw REDIS_URL string directly to `new Redis()`.
// Passing the raw string let ioredis do its own URL parsing, which was
// silently mishandling the rediss:// scheme in production (Upstash) and
// falling back to treating it as a Unix socket path — hence the
// "ENOENT //host" errors. Going through getRedisConnection() ensures both
// this client and BullMQ's connections parse the URL identically.
const Redis = require('ioredis');
const { getRedisConnection } = require('./redisConnection');

const redis = new Redis(getRedisConnection());

redis.on('error', (err) => {
  console.error('[redis] connection error', err);
});

module.exports = redis;