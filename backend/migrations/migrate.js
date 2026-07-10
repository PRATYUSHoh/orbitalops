const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');

async function migrate() {
  try {
    const sqlPath = path.join(__dirname, '001_init.sql'); // same folder as this script
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(sql);
    console.log('✅ Migration successful');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();