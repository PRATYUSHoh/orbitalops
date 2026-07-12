const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');

async function migrate() {
  try {
    const files = ['001_init.sql', '002_alerts.sql'];
    for (const file of files) {
      const sqlPath = path.join(__dirname, file);
      if (fs.existsSync(sqlPath)) {
        const sql = fs.readFileSync(sqlPath, 'utf8');
        await pool.query(sql);
        console.log(`✅ Ran ${file}`);
      } else {
        console.log(`⚠️ Skipped ${file} — not found`);
      }
    }
    console.log('✅ Migration successful');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
