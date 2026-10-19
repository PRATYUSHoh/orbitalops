// In-memory mock database for OrbitalOps when PostgreSQL is offline or not configured.
// Implements the exact query patterns used by the controllers and seed data.

const SATELLITE_NAMES = [
  'HydrogenSat-1', 'HeliumSat-2', 'LithiumSat-3', 'BerylliumSat-4', 'BoronSat-5',
  'CarbonSat-6', 'NitrogenSat-7', 'OxygenSat-8', 'FluorineSat-9', 'NeonSat-10',
  'SodiumSat-11', 'MagnesiumSat-12', 'AluminumSat-13', 'SiliconSat-14', 'PhosphorusSat-15',
  'SulfurSat-16', 'ChlorineSat-17', 'ArgonSat-18', 'PotassiumSat-19', 'CalciumSat-20',
  'ScandiumSat-21', 'TitaniumSat-22', 'VanadiumSat-23', 'ChromiumSat-24', 'ManganeseSat-25',
  'IronSat-26', 'CobaltSat-27', 'NickelSat-28', 'CopperSat-29', 'ZincSat-30',
  'GalliumSat-31', 'GermaniumSat-32', 'ArsenicSat-33', 'SeleniumSat-34', 'BromineSat-35',
  'KryptonSat-36', 'RubidiumSat-37', 'StrontiumSat-38', 'YttriumSat-39', 'ZirconiumSat-40',
  'NiobiumSat-41', 'MolybdenumSat-42', 'TechnetiumSat-43', 'RutheniumSat-44', 'RhodiumSat-45',
  'PalladiumSat-46', 'SilverSat-47', 'CadmiumSat-48', 'IndiumSat-49', 'TinSat-50'
];

const ORBIT_TYPES = ['LEO', 'MEO', 'GEO', 'SSO'];

const satellites = SATELLITE_NAMES.map((name, i) => ({
  id: i + 1,
  name,
  orbit_type: ORBIT_TYPES[i % ORBIT_TYPES.length],
}));

let telemetryEvents = [];
let jobs = [];
let alerts = [];

let nextTelemetryId = 1;
let nextJobId = 1;
let nextAlertId = 1;

// Seed initial telemetry and jobs so the dashboard has rich data out of the box
const now = Date.now();
for (let i = 0; i < satellites.length; i++) {
  const satId = satellites[i].id;
  // Give satellite 12 and 26 anomalous initial readings to showcase the UI
  const isAnomaly = satId === 12 || satId === 26;
  const temp = isAnomaly ? (satId === 12 ? 96.4 : 92.1) : 35 + ((i * 7) % 30);
  const battery = isAnomaly && satId === 26 ? 7.2 : 65 + ((i * 5) % 35);
  const signal = isAnomaly && satId === 12 ? -128.5 : -75 - ((i * 3) % 25);

  const tEvent = {
    id: nextTelemetryId++,
    satellite_id: satId,
    temperature: temp,
    battery: battery,
    signal_strength: signal,
    timestamp: new Date(now - (i * 120000)).toISOString(),
  };
  telemetryEvents.push(tEvent);

  const job = {
    id: nextJobId++,
    type: 'process-telemetry',
    status: 'done',
    retries: 0,
    created_at: new Date(now - (i * 120000)).toISOString(),
  };
  jobs.push(job);

  if (isAnomaly) {
    if (temp > 90) {
      alerts.push({
        id: nextAlertId++,
        satellite_id: satId,
        type: 'TEMP_CRITICAL',
        value: temp,
        threshold: 90,
        triggered_at: new Date(now - (i * 120000)).toISOString(),
      });
    }
    if (battery < 10) {
      alerts.push({
        id: nextAlertId++,
        satellite_id: satId,
        type: 'BATTERY_LOW',
        value: battery,
        threshold: 10,
        triggered_at: new Date(now - (i * 120000)).toISOString(),
      });
    }
  }
}

async function query(sql, params = []) {
  const normalized = sql.trim().replace(/\s+/g, ' ');

  // Health check query
  if (/^SELECT 1/i.test(normalized)) {
    return { rows: [{ '?column?': 1 }] };
  }

  // List satellites with latest telemetry (listSatellites in satellite.controller.js)
  if (normalized.includes('SELECT DISTINCT ON (s.id)') || (normalized.includes('FROM satellites') && normalized.includes('telemetry_events'))) {
    const rows = satellites.map((s) => {
      // Find latest telemetry for satellite s
      const sEvents = telemetryEvents.filter(t => t.satellite_id === s.id);
      const latest = sEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
      return {
        id: s.id,
        name: s.name,
        orbit_type: s.orbit_type,
        temperature: latest ? latest.temperature : null,
        battery: latest ? latest.battery : null,
        signal_strength: latest ? latest.signal_strength : null,
      };
    });
    return { rows };
  }

  // Single satellite query
  if (/^SELECT \* FROM satellites WHERE id = \$1/i.test(normalized)) {
    const satId = parseInt(params[0], 10);
    const sat = satellites.find((s) => s.id === satId);
    return { rows: sat ? [sat] : [] };
  }

  // Latest telemetry for a satellite
  if (/^SELECT \* FROM telemetry_events WHERE satellite_id = \$1/i.test(normalized)) {
    const satId = parseInt(params[0], 10);
    const matching = telemetryEvents
      .filter((t) => t.satellite_id === satId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return { rows: matching.slice(0, 1) };
  }

  // Job counts group by status
  if (/SELECT status, COUNT\(\*\) FROM jobs GROUP BY status/i.test(normalized)) {
    const counts = {};
    for (const j of jobs) {
      counts[j.status] = (counts[j.status] || 0) + 1;
    }
    const rows = Object.entries(counts).map(([status, count]) => ({
      status,
      count: String(count),
    }));
    return { rows };
  }

  // Alert history for a satellite
  if (/SELECT \* FROM alerts WHERE satellite_id = \$1/i.test(normalized)) {
    const satId = parseInt(params[0], 10);
    const matching = alerts
      .filter((a) => a.satellite_id === satId)
      .sort((a, b) => new Date(b.triggered_at) - new Date(a.triggered_at));
    return { rows: matching.slice(0, 10) };
  }

  // Paginated/filtered alerts list (/api/alerts)
  if (/SELECT \* FROM alerts WHERE 1=1/i.test(normalized)) {
    let filtered = [...alerts];
    let pIdx = 0;

    if (normalized.includes('type = ANY')) {
      const allowedTypes = params[pIdx++];
      if (Array.isArray(allowedTypes)) {
        filtered = filtered.filter(a => allowedTypes.includes(a.type));
      }
    }
    if (normalized.includes('triggered_at >=')) {
      const fromDate = new Date(params[pIdx++]);
      filtered = filtered.filter(a => new Date(a.triggered_at) >= fromDate);
    }
    if (normalized.includes('triggered_at <=')) {
      const toDate = new Date(params[pIdx++]);
      filtered = filtered.filter(a => new Date(a.triggered_at) <= toDate);
    }

    filtered.sort((a, b) => new Date(b.triggered_at) - new Date(a.triggered_at));
    const limit = params[pIdx++] ?? 20;
    const offset = params[pIdx++] ?? 0;
    const sliced = filtered.slice(offset, offset + limit);
    return { rows: sliced };
  }

  // Paginated jobs list (/api/jobs)
  if (/SELECT \* FROM jobs/i.test(normalized)) {
    let filtered = [...jobs];
    let pIdx = 0;
    if (normalized.includes('WHERE status =')) {
      const statusVal = params[pIdx++];
      filtered = filtered.filter(j => j.status === statusVal);
    }
    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const limit = params[pIdx++] ?? 20;
    const offset = params[pIdx++] ?? 0;
    return { rows: filtered.slice(offset, offset + limit) };
  }

  // INSERT INTO telemetry_events
  if (/^INSERT INTO telemetry_events/i.test(normalized)) {
    const [satellite_id, temperature, battery, signal_strength] = params;
    const row = {
      id: nextTelemetryId++,
      satellite_id: Number(satellite_id),
      temperature: Number(temperature),
      battery: Number(battery),
      signal_strength: Number(signal_strength),
      timestamp: new Date().toISOString(),
    };
    telemetryEvents.push(row);
    return { rows: [{ id: row.id }] };
  }

  // INSERT INTO jobs
  if (/^INSERT INTO jobs/i.test(normalized)) {
    const [type] = params;
    const row = {
      id: nextJobId++,
      type: type || 'process-telemetry',
      status: 'pending',
      retries: 0,
      created_at: new Date().toISOString(),
    };
    jobs.push(row);
    return { rows: [{ id: row.id }] };
  }

  // INSERT INTO alerts
  if (/^INSERT INTO alerts/i.test(normalized)) {
    const [satellite_id, type, value, threshold] = params;
    const row = {
      id: nextAlertId++,
      satellite_id: Number(satellite_id),
      type,
      value: Number(value),
      threshold: Number(threshold),
      triggered_at: new Date().toISOString(),
    };
    alerts.push(row);
    return { rows: [{ id: row.id }] };
  }

  // UPDATE jobs
  if (/^UPDATE jobs SET status = 'processing'/i.test(normalized)) {
    const id = parseInt(params[0], 10);
    const job = jobs.find(j => j.id === id);
    if (job) job.status = 'processing';
    return { rowCount: 1 };
  }

  if (/^UPDATE jobs SET status = 'done'/i.test(normalized)) {
    const id = parseInt(params[0], 10);
    const job = jobs.find(j => j.id === id);
    if (job) job.status = 'done';
    return { rowCount: 1 };
  }

  if (/^UPDATE jobs SET status = 'failed'/i.test(normalized)) {
    const id = parseInt(params[0], 10);
    const job = jobs.find(j => j.id === id);
    if (job) {
      job.status = 'failed';
      job.retries = (job.retries || 0) + 1;
    }
    return { rowCount: 1 };
  }

  console.warn('[mockDb] Unhandled query:', normalized);
  return { rows: [] };
}

module.exports = {
  query,
  satellites,
  telemetryEvents,
  jobs,
  alerts,
};
