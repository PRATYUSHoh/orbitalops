/**
 * seed.js
 *
 * Seeds the database with 50 satellites and 100,000 telemetry events
 * for benchmark and demo purposes.
 *
 * This inserts DIRECTLY into Postgres — it does NOT go through the API
 * or BullMQ queue. That's intentional: this script's job is just to
 * populate realistic-looking data so /api/satellites/:id/health and
 * /api/alerts have something meaningful to query against. The actual
 * queue/worker throughput benchmark is a separate script (benchmark.js)
 * that pushes real jobs through BullMQ.
 *
 * Run with: node seed.js
 * (run from inside the backend container, or with DB env vars pointing
 * at your local Postgres — see README for exact invocation)
 */

const { faker } = require('@faker-js/faker');
const pool = require('../src/config/db'); // adjust path if run from a different location

const NUM_SATELLITES = 50;
const NUM_TELEMETRY_EVENTS = 100_000;
const BATCH_SIZE = 1000;

// Thresholds copied from anomalyDetector.js — used here only to seed a
// realistic minority of anomalous readings, not to run detection logic.
const TEMP_CRITICAL = 90;
const BATTERY_LOW = 10;
const SIGNAL_LOST = -120;

const ORBIT_TYPES = ['LEO', 'MEO', 'GEO', 'SSO'];

function randomTimestampWithinLastDays(days) {
  const now = Date.now();
  const past = now - days * 24 * 60 * 60 * 1000;
  const randomMs = past + Math.random() * (now - past);
  return new Date(randomMs).toISOString();
}

function generateTelemetryRow(satelliteId) {
  // ~5% of readings are seeded as anomalous so anomaly-detection-dependent
  // endpoints (/api/alerts) have real data, not just uniformly nominal values.
  const isAnomalous = Math.random() < 0.05;

  let temperature, battery, signal_strength;

  if (isAnomalous) {
    // Randomly pick which single dimension is anomalous, keep the others nominal
    const anomalyType = Math.floor(Math.random() * 3);
    temperature = anomalyType === 0
      ? faker.number.float({ min: TEMP_CRITICAL + 0.1, max: 120, fractionDigits: 1 })
      : faker.number.float({ min: 20, max: 60, fractionDigits: 1 });
    battery = anomalyType === 1
      ? faker.number.float({ min: 0, max: BATTERY_LOW - 0.1, fractionDigits: 1 })
      : faker.number.float({ min: 40, max: 100, fractionDigits: 1 });
    signal_strength = anomalyType === 2
      ? faker.number.float({ min: -160, max: SIGNAL_LOST - 0.1, fractionDigits: 1 })
      : faker.number.float({ min: -90, max: -40, fractionDigits: 1 });
  } else {
    temperature = faker.number.float({ min: 20, max: 60, fractionDigits: 1 });
    battery = faker.number.float({ min: 40, max: 100, fractionDigits: 1 });
    signal_strength = faker.number.float({ min: -90, max: -40, fractionDigits: 1 });
  }

  return {
    satellite_id: satelliteId,
    temperature,
    battery,
    signal_strength,
    timestamp: randomTimestampWithinLastDays(30),
  };
}

async function seedSatellites() {
  console.log(`Seeding ${NUM_SATELLITES} satellites...`);
  const ids = [];

  for (let i = 0; i < NUM_SATELLITES; i++) {
    const name = `${faker.science.chemicalElement().name}Sat-${i + 1}`;
    const orbitType = ORBIT_TYPES[Math.floor(Math.random() * ORBIT_TYPES.length)];

    const result = await pool.query(
      `INSERT INTO satellites (name, orbit_type) VALUES ($1, $2) RETURNING id`,
      [name, orbitType]
    );
    ids.push(result.rows[0].id);
  }

  console.log(`Seeded ${ids.length} satellites (ids ${ids[0]}–${ids[ids.length - 1]})`);
  return ids;
}

async function seedTelemetryEvents(satelliteIds) {
  console.log(`Seeding ${NUM_TELEMETRY_EVENTS} telemetry events in batches of ${BATCH_SIZE}...`);

  const totalBatches = Math.ceil(NUM_TELEMETRY_EVENTS / BATCH_SIZE);
  const start = Date.now();

  for (let batch = 0; batch < totalBatches; batch++) {
    const rows = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
      const satelliteId = satelliteIds[Math.floor(Math.random() * satelliteIds.length)];
      rows.push(generateTelemetryRow(satelliteId));
    }

    // Build a single multi-row INSERT for this batch
    const values = [];
    const placeholders = rows.map((row, idx) => {
      const base = idx * 5;
      values.push(row.satellite_id, row.temperature, row.battery, row.signal_strength, row.timestamp);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
    });

    await pool.query(
      `INSERT INTO telemetry_events (satellite_id, temperature, battery, signal_strength, timestamp)
       VALUES ${placeholders.join(', ')}`,
      values
    );

    if ((batch + 1) % 10 === 0 || batch === totalBatches - 1) {
      const done = Math.min((batch + 1) * BATCH_SIZE, NUM_TELEMETRY_EVENTS);
      console.log(`  ${done}/${NUM_TELEMETRY_EVENTS} events inserted...`);
    }
  }

  const durationSec = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Done. Inserted ${NUM_TELEMETRY_EVENTS} telemetry events in ${durationSec}s.`);
}

async function main() {
  try {
    const satelliteIds = await seedSatellites();
    await seedTelemetryEvents(satelliteIds);
    console.log('Seeding complete.');
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();