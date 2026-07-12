const pool = require('../config/db');
const { telemetryQueue } = require('../services/telemetryQueue');

// In-memory dedup cache: satellite_id -> last-seen 100ms bucket.
// NOTE: this is per-process memory — fine for a single app instance demo,
// but won't work correctly if you ever scale to multiple app instances
// (each instance would have its own map). A production version would use
// Redis SETNX with a short TTL instead, shared across instances.
const recentBuckets = new Map();

exports.createTelemetry = async (req, res, next) => {
  try {
    const { satellite_id, temperature, battery, signal_strength } = req.body;

    if (
      satellite_id === undefined ||
      temperature === undefined ||
      battery === undefined ||
      signal_strength === undefined
    ) {
      return res.status(400).json({
        error: 'Missing required field(s): satellite_id, temperature, battery, signal_strength',
      });
    }

    if (
      !Number.isFinite(Number(temperature)) ||
      !Number.isFinite(Number(battery)) ||
      !Number.isFinite(Number(signal_strength))
    ) {
      return res.status(400).json({
        error: 'temperature, battery, and signal_strength must be numbers',
      });
    }

    // --- Deduplication check happens BEFORE any DB write ---
    const bucket = Math.floor(Date.now() / 100) * 100;
    const dedupJobId = `${satellite_id}-${bucket}`;

    if (recentBuckets.get(satellite_id) === bucket) {
      return res.status(200).json({
        deduplicated: true,
        message: 'Duplicate event within 100ms window ignored',
      });
    }
    recentBuckets.set(satellite_id, bucket);
    // ---------------------------------------------------------

    const insertResult = await pool.query(
      `INSERT INTO telemetry_events (satellite_id, temperature, battery, signal_strength)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [satellite_id, temperature, battery, signal_strength]
    );
    const eventId = insertResult.rows[0].id;

    const jobResult = await pool.query(
      `INSERT INTO jobs (type, status) VALUES ($1, 'pending') RETURNING id`,
      ['process-telemetry']
    );
    const jobId = jobResult.rows[0].id;

    const isCritical = Number(temperature) > 90 || Number(battery) < 10;
    const priority = isCritical ? 1 : 10;

    await telemetryQueue.add(
      'process-telemetry',
      { eventId, jobId, satellite_id, temperature, battery, signal_strength },
      {
        priority,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        jobId: dedupJobId, // also protects at the BullMQ level as a second layer
      }
    );

    res.status(201).json({ eventId, jobId, priority: isCritical ? 'critical' : 'normal' });
  } catch (err) {
    next(err);
  }
};