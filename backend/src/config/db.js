// pg Pool — created ONCE here, reused everywhere else via require/import.
// Never create a new Pool per request; the pool manages a set of reusable
// connections so you're not opening/closing a TCP connection per query.
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Without this, an idle client erroring (e.g. Postgres container restarts)
// would throw an UNHANDLED error and crash the whole Node process.
// This keeps the pool alive and just logs it instead — relevant to o1t8.
pool.on('error', (err) => {
  console.error('[db] unexpected error on idle client', err);
});

module.exports = pool;