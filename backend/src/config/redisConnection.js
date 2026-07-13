// Shared BullMQ/Redis connection config.
//
// Locally (docker-compose), Redis is reached via hostname 'redis' with
// separate host/port. In production (Upstash), REDIS_URL is a single
// rediss:// connection string (TLS) — so we prefer REDIS_URL when present,
// and fall back to host/port for local development.

function getRedisConnection() {
  if (process.env.REDIS_URL) {
    const url = new URL(process.env.REDIS_URL);
    const isTLS = url.protocol === 'rediss:';

    return {
      host: url.hostname,
      port: Number(url.port) || 6379,
      username: url.username || undefined,
      password: url.password || undefined,
      maxRetriesPerRequest: null,
      ...(isTLS ? { tls: { servername: url.hostname } } : {}),
    };
  }

  return {
    host: process.env.REDIS_HOST || 'redis',
    port: process.env.REDIS_PORT || 6379,
    maxRetriesPerRequest: null,
  };
}

module.exports = { getRedisConnection };