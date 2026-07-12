const pool = require('../config/db');

exports.getAlerts = async (req, res, next) => {
  try {
    const { severity, from, to, limit = 20, offset = 0 } = req.query;

    const limitNum = parseInt(limit, 10);
    const offsetNum = parseInt(offset, 10);

    if (!Number.isFinite(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({ error: 'limit must be a number between 1 and 100' });
    }
    if (!Number.isFinite(offsetNum) || offsetNum < 0) {
      return res.status(400).json({ error: 'offset must be a non-negative number' });
    }

    if (from && isNaN(Date.parse(from))) {
      return res.status(400).json({ error: 'from must be a valid ISO date' });
    }
    if (to && isNaN(Date.parse(to))) {
      return res.status(400).json({ error: 'to must be a valid ISO date' });
    }

    let query = 'SELECT * FROM alerts WHERE 1=1';
    const params = [];

    // "severity" maps to alert type here — TEMP_CRITICAL/BATTERY_LOW treated as critical
    if (severity === 'critical') {
      params.push(['TEMP_CRITICAL', 'BATTERY_LOW']);
      query += ` AND type = ANY($${params.length})`;
    }
    if (from) {
      params.push(from);
      query += ` AND triggered_at >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      query += ` AND triggered_at <= $${params.length}`;
    }

    query += ` ORDER BY triggered_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limitNum, offsetNum);

    const result = await pool.query(query, params);
    res.json({ alerts: result.rows, limit: limitNum, offset: offsetNum });
  } catch (err) {
    next(err);
  }
};