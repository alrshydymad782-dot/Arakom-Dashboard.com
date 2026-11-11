'use strict';
// إدارة قائمة السيارات المسموح لها مع احترام الحد الأقصى في الاشتراك
const { one, many, tx } = require('../db');
const { parsePlate } = require('./plates');
const { fail } = require('../http');

const FIELDS = ['owner_name', 'unit_number', 'phone', 'car_make', 'car_color', 'status', 'valid_until', 'notes'];

function normalize(body) {
  const p = parsePlate(body.plate ?? body.plate_en ?? body.plate_ar ?? '');
  if (!p.key || p.key.length < 2) fail(400, `رقم اللوحة غير صحيح: ${body.plate ?? ''}`);
  const out = { plate_key: p.key, plate_ar: p.displayAr || null, plate_en: p.display || null };
  for (const f of FIELDS) if (body[f] !== undefined) out[f] = body[f] === '' ? null : String(body[f]).trim();
  if (out.status && !['active', 'blocked'].includes(out.status)) fail(400, 'الحالة يجب أن تكون نشط أو محظور');
  return out;
}

async function limits(client, tenantId) {
  const r = await client.query(`SELECT s.max_vehicles, (SELECT COUNT(*)::int FROM vehicles WHERE tenant_id = $1) AS used
    FROM subscriptions s WHERE s.tenant_id = $1`, [tenantId]);
  return r.rows[0] || { max_vehicles: 0, used: 0 };
}

async function create(tenantId, body) {
  const v = normalize(body);
  return tx(async (c) => {
    // قفل صف الاشتراك لتجنب تجاوز الحد عند الإضافة المتزامنة
    await c.query('SELECT 1 FROM subscriptions WHERE tenant_id = $1 FOR UPDATE', [tenantId]);
    const lim = await limits(c, tenantId);
    if (lim.used >= lim.max_vehicles) fail(409, `وصلت للحد الأقصى من السيارات في اشتراكك (${lim.max_vehicles})`);
    const cols = ['tenant_id', ...Object.keys(v)];
    const vals = [tenantId, ...Object.values(v)];
    const r = await c.query(`INSERT INTO vehicles (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, vals);
    return r.rows[0];
  });
}

async function update(tenantId, id, body) {
  const v = body.plate !== undefined ? normalize(body) : Object.fromEntries(FIELDS.filter((f) => body[f] !== undefined).map((f) => [f, body[f] === '' ? null : body[f]]));
  if (v.status && !['active', 'blocked'].includes(v.status)) fail(400, 'الحالة غير صحيحة');
  const keys = Object.keys(v);
  if (!keys.length) fail(400, 'لا توجد تعديلات');
  const row = await one(`UPDATE vehicles SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')}, updated_at = now()
    WHERE id = $${keys.length + 1} AND tenant_id = $${keys.length + 2} RETURNING *`, [...Object.values(v), id, tenantId]);
  if (!row) fail(404, 'السيارة غير موجودة');
  return row;
}

// استيراد جماعي: يحدّث الموجود ويضيف الجديد في حدود الاشتراك
async function importRows(tenantId, rows) {
  if (!Array.isArray(rows) || !rows.length) fail(400, 'الملف فارغ');
  if (rows.length > 5000) fail(400, 'الحد الأقصى 5000 سيارة في الملف الواحد');
  const errors = [];
  let created = 0;
  let updated = 0;
  await tx(async (c) => {
    await c.query('SELECT 1 FROM subscriptions WHERE tenant_id = $1 FOR UPDATE', [tenantId]);
    let { used, max_vehicles: max } = await limits(c, tenantId);
    for (const [i, raw] of rows.entries()) {
      let v;
      try { v = normalize(raw); } catch (e) { errors.push({ row: i + 2, error: e.message }); continue; }
      const exists = (await c.query('SELECT id FROM vehicles WHERE tenant_id = $1 AND plate_key = $2', [tenantId, v.plate_key])).rows[0];
      if (!exists && used >= max) { errors.push({ row: i + 2, error: `تجاوز الحد الأقصى (${max})` }); continue; }
      const cols = ['tenant_id', ...Object.keys(v)];
      const vals = [tenantId, ...Object.values(v)];
      const set = Object.keys(v).filter((k) => k !== 'plate_key').map((k) => `${k} = EXCLUDED.${k}`).join(', ');
      await c.query(`INSERT INTO vehicles (${cols.join(',')}) VALUES (${cols.map((_, j) => `$${j + 1}`).join(',')})
        ON CONFLICT (tenant_id, plate_key) DO UPDATE SET ${set}, updated_at = now()`, vals);
      if (exists) updated++; else { created++; used++; }
    }
  });
  return { created, updated, errors };
}

async function list(tenantId, q = {}) {
  const params = [tenantId];
  const where = ['v.tenant_id = $1'];
  if (q.status) { params.push(q.status); where.push(`v.status = $${params.length}`); }
  if (q.q) {
    params.push(`%${parsePlate(q.q).key || q.q}%`, `%${q.q}%`);
    where.push(`(v.plate_key LIKE $${params.length - 1} OR v.owner_name ILIKE $${params.length} OR v.unit_number ILIKE $${params.length} OR v.phone ILIKE $${params.length})`);
  }
  return many(`SELECT v.*, (SELECT MAX(occurred_at) FROM access_logs l WHERE l.tenant_id = v.tenant_id AND l.plate_key = v.plate_key) AS last_seen_at
    FROM vehicles v WHERE ${where.join(' AND ')} ORDER BY v.created_at DESC LIMIT 2000`, params);
}

module.exports = { create, update, importRows, list };
