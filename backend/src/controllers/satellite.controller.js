const pool = require('../config/db');

exports.getSatelliteHealth = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: 'satellite id must be a valid integer' });
    }

    const satRes = await pool.query('SELECT * FROM satellites WHERE id = $1', [id]);
    if (satRes.rows.length === 0) {
      return res.status(404).json({ error: 'satellite not found' });
    }

    const latestTelemetry = await pool.query(
      `SELECT * FROM telemetry_events WHERE satellite_id = $1 ORDER BY timestamp DESC LIMIT 1`,
      [id]
    );

    const jobCounts = await pool.query(
      `SELECT status, COUNT(*) FROM jobs GROUP BY status`
    );

    const alertHistory = await pool.query(
      `SELECT * FROM alerts WHERE satellite_id = $1 ORDER BY triggered_at DESC LIMIT 10`,
      [id]
    );

    res.json({
      satellite: satRes.rows[0],
      latest_telemetry: latestTelemetry.rows[0] || null,
      last_seen: latestTelemetry.rows[0]?.timestamp || null,
      job_status_counts: jobCounts.rows,
      recent_alerts: alertHistory.rows,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/satellites — lightweight list, just enough for the frontend to
// build real dots instead of inventing fake client-side IDs. Deliberately
// NOT reusing getSatelliteHealth's heavier query (telemetry/alerts/jobs) —
// this only needs id/name/orbit_type, called once on page load for all 50.
exports.listSatellites = async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, name, orbit_type FROM satellites ORDER BY id ASC'
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};