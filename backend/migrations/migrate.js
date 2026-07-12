const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');

async function migrate() {
  const files = ['001_init.sql', '002_alerts.sql'];

  for (const file of files) {
    const sqlPath = path.join(__dirname, file);
    if (!fs.existsSync(sqlPath)) {
      console.log(`⚠️ Skipped ${file} — not found`);
      continue;
    }
    try {
      const sql = fs.readFileSync(sqlPath, 'utf8');
      await pool.query(sql);
      console.log(`✅ Ran ${file}`);
    } catch (err) {
      // "already exists" errors are expected on re-runs against a DB that
      // already has some tables — don't let one failed file block the rest.
      console.log(`⚠️ ${file} error (likely already applied): ${err.message}`);
    }
  }

  await pool.end();
  console.log('✅ Migration run complete');
}

migrate();
