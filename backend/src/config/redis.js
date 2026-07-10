// ioredis client — single instance, reused everywhere.
const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL, {
  // ioredis retries forever by default; cap it so failures surface
  // instead of silently retrying indefinitely.
  maxRetriesPerRequest: 3,
});

redis.on('error', (err) => {
  console.error('[redis] connection error', err);
});

module.exports = redis;