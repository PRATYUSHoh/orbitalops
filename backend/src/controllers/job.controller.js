const pool = require('../config/db');

exports.getJobs = async (req, res, next) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;

    const limitNum = parseInt(limit, 10);
    const offsetNum = parseInt(offset, 10);

    if (!Number.isFinite(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({ error: 'limit must be a number between 1 and 100' });
    }
    if (!Number.isFinite(offsetNum) || offsetNum < 0) {
      return res.status(400).json({ error: 'offset must be a non-negative number' });
    }

    const validStatuses = ['pending', 'processing', 'done', 'failed'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
    }

    let query = 'SELECT * FROM jobs';
    const params = [];
    if (status) {
      params.push(status);
      query += ` WHERE status = $${params.length}`;
    }
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limitNum, offsetNum);

    const result = await pool.query(query, params);
    res.json({ jobs: result.rows, limit: limitNum, offset: offsetNum });
  } catch (err) {
    next(err);
  }
};