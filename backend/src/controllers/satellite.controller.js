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
    // DISTINCT ON (s.id) + ORDER BY timestamp DESC = "latest telemetry row
    // per satellite" in a single query, rather than N+1 queries per dot.
    // Same thresholds as anomalyDetector.js — duplicated here rather than
// imported, since this is a read-only status derivation for display, not
// the actual detection pipeline (which runs on ingest, writes real alert
// rows). Keeping them in sync manually is an accepted tradeoff for now.
const TEMP_CRITICAL = 90;
const BATTERY_LOW = 10;
const SIGNAL_LOST = -120;

// GET /api/satellites — now also returns each satellite's CURRENT status,
// derived from its most recent telemetry row. Why: the frontend used to
// default every dot to "normal" on page load and only update it from live
// Socket.io events — meaning a reload silently lost all anomaly state even
// though the backend still had it. This makes dot color persist correctly
// across reloads, not just within a single live session.
const result = await pool.query(`
      SELECT DISTINCT ON (s.id)
        s.id, s.name, s.orbit_type,
        t.temperature, t.battery, t.signal_strength
      FROM satellites s
      LEFT JOIN telemetry_events t ON t.satellite_id = s.id
      ORDER BY s.id, t.timestamp DESC
    `);

    const satellites = result.rows.map((row) => {
      let status = 'normal';
      if (row.temperature == null) {
        status = 'normal'; // no telemetry yet — nothing to flag as anomalous
      } else if (
        row.temperature > TEMP_CRITICAL ||
        row.battery < BATTERY_LOW ||
        row.signal_strength < SIGNAL_LOST
      ) {
        status = 'anomaly';
      }
      return { id: row.id, name: row.name, orbit_type: row.orbit_type, status };
    });

    res.json(satellites);
  } catch (err) {
    next(err);
  }
};