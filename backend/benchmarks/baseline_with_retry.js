const telemetryQueue = require('../src/services/telemetryQueue');
const pool = require('../src/config/db');
const fs = require('fs');
const path = require('path');

async function run() {
  const TOTAL = 1000;
  console.log(`Pushing ${TOTAL} jobs (3 retries, forced 15% failure)...`);

  for (let i = 0; i < TOTAL; i++) {
    const jobRow = await pool.query(
      `INSERT INTO jobs (type, status) VALUES ('process-telemetry', 'pending') RETURNING id`
    );
    await telemetryQueue.add(
      'process-telemetry',
      { jobId: jobRow.rows[0].id, satellite_id: 1, temperature: 50, battery: 80, signal_strength: -80 },
      { attempts: 3, backoff: { type: 'exponential', delay: 1000 } }
    );
  }

  console.log('All jobs pushed. Waiting 90s for processing + retries to settle...');
  await new Promise((r) => setTimeout(r, 90000));

  const failedResult = await pool.query(`SELECT COUNT(*) FROM jobs WHERE status = 'failed'`);
  const failed = parseInt(failedResult.rows[0].count, 10);

  const result = { total: TOTAL, failed, timestamp: new Date().toISOString() };
  fs.writeFileSync(
    path.join(__dirname, 'baseline_with_retry.json'),
    JSON.stringify(result, null, 2)
  );
  console.log('Result:', result);
  process.exit(0);
}

run();