// Shared BullMQ/Redis connection config.
//
// Locally (docker-compose), Redis is reached via hostname 'redis' with
// separate host/port. On Railway, the Redis plugin provides a single
// REDIS_URL connection string (redis://default:password@host:port) instead
// of separate host/port env vars — so we prefer REDIS_URL when present,
// and fall back to host/port for local development.

function getRedisConnection() {
  if (process.env.REDIS_URL) {
    const url = new URL(process.env.REDIS_URL);
    return {
      host: url.hostname,
      port: Number(url.port) || 6379,
      username: url.username || undefined,
      password: url.password || undefined,
      maxRetriesPerRequest: null,
    };
  }

  return {
    host: process.env.REDIS_HOST || 'redis',
    port: process.env.REDIS_PORT || 6379,
    maxRetriesPerRequest: null,
  };
}

module.exports = { getRedisConnection };
