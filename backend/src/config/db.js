// pg Pool — created ONCE here, reused everywhere else via require/import.
// Never create a new Pool per request; the pool manages a set of reusable
// connections so you're not opening/closing a TCP connection per query.
const { Pool } = require('pg');

const isProduction = process.env.NODE_ENV === 'production';

function buildConnectionString() {
  if (!process.env.DATABASE_URL) return undefined;
  if (!isProduction) return process.env.DATABASE_URL;

  // Aiven's connection string includes ?sslmode=require, which recent pg
  // versions treat as an alias for verify-full — that tries to validate
  // Aiven's cert against Node's default CA store and fails with
  // "self-signed certificate in certificate chain". Strip sslmode from
  // the string and rely on the explicit `ssl` option below instead.
  const url = new URL(process.env.DATABASE_URL);
  url.search = '';
  return url.toString();
}

const pool = new Pool({
  connectionString: buildConnectionString(),
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

// Without this, an idle client erroring (e.g. Postgres container restarts)
// would throw an UNHANDLED error and crash the whole Node process.
// This keeps the pool alive and just logs it instead — relevant to o1t8.
pool.on('error', (err) => {
  console.error('[db] unexpected error on idle client', err);
});

module.exports = pool;