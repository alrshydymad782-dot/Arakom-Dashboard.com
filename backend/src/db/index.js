'use strict';
const { Pool, types } = require('pg');
const config = require('../config');

// إرجاع التواريخ (DATE) كنص YYYY-MM-DD بدلاً من كائن Date لتجنب مشاكل المنطقة الزمنية
types.setTypeParser(1082, (v) => v);
// إرجاع BIGINT و COUNT كأرقام
types.setTypeParser(20, (v) => Number(v));
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 15,
  options: `-c timezone=${config.timezone}`,
});
pool.on('error', (err) => console.error('[db] خطأ في الاتصال', err.message));

const query = (text, params) => pool.query(text, params);
const one = async (text, params) => (await pool.query(text, params)).rows[0] || null;
const many = async (text, params) => (await pool.query(text, params)).rows;

async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function audit(user, action, details = {}, tenantId = null) {
  await query('INSERT INTO audit_log (user_id, tenant_id, action, details) VALUES ($1,$2,$3,$4)',
    [user?.id ?? null, tenantId ?? user?.tenant_id ?? null, action, details]).catch(() => {});
}

module.exports = { pool, query, one, many, tx, audit };
