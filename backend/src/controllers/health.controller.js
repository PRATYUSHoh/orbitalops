const pool = require('../config/db');
const redis = require('../config/redis');

// GET /health — checks db and redis INDEPENDENTLY. If Postgres is down,
// we still want to correctly report Redis's real status, not let one
// failed check throw before the other even runs.
exports.getHealth = async (req, res) => {
  const result = {
    db: 'error',
    redis: 'error',
    uptime: `${process.uptime().toFixed(1)}s`,
  };

  try {
    await pool.query('SELECT 1'); // cheapest possible query — just proves the connection works
    result.db = 'ok';
  } catch (err) {
    console.error('[health] db check failed', err.message);
  }

  try {
    await redis.ping();
    result.redis = 'ok';
  } catch (err) {
    console.error('[health] redis check failed', err.message);
  }

  // If a core dependency is down, report 503 (service unavailable) instead
  // of 200 — this is what o1t8 is testing: kill Postgres mid-request and
  // confirm the app degrades gracefully instead of crashing.
  const statusCode = result.db === 'ok' && result.redis === 'ok' ? 200 : 503;
  res.status(statusCode).json(result);
};