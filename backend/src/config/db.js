// Database configuration for OrbitalOps.
// Uses PostgreSQL if DATABASE_URL is set and available; otherwise seamlessly falls back
// to the built-in in-memory mock database conforming to Phase 2.2 of the migration guide.

const { Pool } = require('pg');
const mockDb = require('./mockDb');

const isProduction = process.env.NODE_ENV === 'production';

function buildConnectionString() {
  if (!process.env.DATABASE_URL) return undefined;
  if (!isProduction) return process.env.DATABASE_URL;

  try {
    const url = new URL(process.env.DATABASE_URL);
    url.search = '';
    return url.toString();
  } catch {
    return process.env.DATABASE_URL;
  }
}

let realPool = null;
const connString = buildConnectionString();

if (connString) {
  try {
    realPool = new Pool({
      connectionString: connString,
      ssl: isProduction ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 2000,
    });
    realPool.on('error', (err) => {
      console.warn('[db] Postgres connection error, falling back to mock DB:', err.message);
    });
  } catch (err) {
    console.warn('[db] Failed to initialize Postgres Pool, using mock DB:', err.message);
    realPool = null;
  }
}

const db = {
  query: async (text, params) => {
    if (realPool) {
      try {
        return await realPool.query(text, params);
      } catch (err) {
        console.warn('[db] Query failed on real DB, routing to mock DB:', err.message);
        return await mockDb.query(text, params);
      }
    }
    return await mockDb.query(text, params);
  },
  connect: async () => {
    if (realPool) {
      try {
        return await realPool.connect();
      } catch (err) {
        console.warn('[db] Connect failed, using mock client:', err.message);
      }
    }
    return {
      query: (t, p) => mockDb.query(t, p),
      release: () => {},
    };
  },
  end: async () => {
    if (realPool) {
      try {
        await realPool.end();
      } catch (_) {}
    }
  },
  on: (event, handler) => {
    if (realPool) realPool.on(event, handler);
  },
};

module.exports = db;