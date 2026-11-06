const pool = require('../config/db');
const { anomaliesDetectedTotal } = require('../middleware/metrics');

const THRESHOLDS = {
  TEMP_CRITICAL: 90,
  BATTERY_LOW: 10,
  SIGNAL_LOST: -120,
};

let alertQueueCached = null;
function getAlertQueue() {
  if (!alertQueueCached) {
    try {
      const q = require('./telemetryQueue');
      alertQueueCached = q.alertQueue;
    } catch (_) {}
  }
  return alertQueueCached;
}

async function checkAnomaly({ satellite_id, temperature, battery, signal_strength }) {
  const alertQueue = getAlertQueue();

  const alerts = [];

  if (temperature > THRESHOLDS.TEMP_CRITICAL) {
    alerts.push({ type: 'TEMP_CRITICAL', value: temperature, threshold: THRESHOLDS.TEMP_CRITICAL });
  }
  if (battery < THRESHOLDS.BATTERY_LOW) {
    alerts.push({ type: 'BATTERY_LOW', value: battery, threshold: THRESHOLDS.BATTERY_LOW });
  }
  if (signal_strength < THRESHOLDS.SIGNAL_LOST) {
    alerts.push({ type: 'SIGNAL_LOST', value: signal_strength, threshold: THRESHOLDS.SIGNAL_LOST });
  }

  for (const alert of alerts) {
    const insertResult = await pool.query(
      `INSERT INTO alerts (satellite_id, type, value, threshold) VALUES ($1, $2, $3, $4) RETURNING id`,
      [satellite_id, alert.type, alert.value, alert.threshold]
    );

    await alertQueue.add(
      'process-alert',
      { alertId: insertResult.rows[0].id, satellite_id, ...alert },
      { priority: 1 }
    );
    anomaliesDetectedTotal.inc({ type: alert.type });

    console.log(`🚨 Alert queued: ${alert.type} for satellite ${satellite_id}`);
  }

  return alerts;
}

module.exports = { checkAnomaly, THRESHOLDS };