'use strict';
// يطبّق ملفات SQL في مجلد migrations بالترتيب، مرة واحدة لكل ملف
const fs = require('node:fs');
const path = require('node:path');
const { pool } = require('./index');

async function migrate({ quiet = false } = {}) {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const done = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  for (const f of files) {
    if (done.has(f)) continue;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
      await client.query('COMMIT');
      if (!quiet) console.log(`[migrate] طُبّق ${f}`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw new Error(`فشل تطبيق ${f}: ${e.message}`);
    } finally {
      client.release();
    }
  }
}

if (require.main === module) {
  migrate().then(() => pool.end()).catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { migrate };
