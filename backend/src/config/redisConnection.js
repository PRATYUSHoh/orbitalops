// Shared BullMQ/Redis connection config.
//
// Locally (docker-compose), Redis is reached via hostname 'redis' with
// separate host/port. In production (Upstash), REDIS_URL is a single
// rediss:// connection string (TLS) — so we prefer REDIS_URL when present,
// and fall back to host/port when REDIS_HOST is configured.

let warnedInvalidUrl = false;

function isValidRedisUrl(raw) {
  if (!raw || typeof raw !== 'string') return false;
  try {
    const url = new URL(raw);
    return url.protocol === 'redis:' || url.protocol === 'rediss:';
  } catch {
    return false;
  }
}

function isRedisConfigured() {
  if (process.env.REDIS_URL) {
    if (isValidRedisUrl(process.env.REDIS_URL)) {
      return true;
    }
    if (!warnedInvalidUrl) {
      warnedInvalidUrl = true;
      console.warn(
        '[redis] REDIS_URL must start with redis:// or rediss:// (got REST/invalid URL). Falling back to in-memory mode.'
      );
    }
    return Boolean(process.env.REDIS_HOST);
  }
  return Boolean(process.env.REDIS_HOST);
}

function getRedisConnection() {
  if (process.env.REDIS_URL && isValidRedisUrl(process.env.REDIS_URL)) {
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

  if (process.env.REDIS_HOST) {
    return {
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT) || 6379,
      maxRetriesPerRequest: null,
    };
  }

  return null;
}

module.exports = { getRedisConnection, isRedisConfigured, isValidRedisUrl };