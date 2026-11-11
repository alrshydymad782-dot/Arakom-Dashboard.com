'use strict';
// مسارات لوحة تحكم العميل/المجمع (app.arakom.sa)
const express = require('express');
const { one, many, query, audit } = require('../db');
const { h, fail, requireRole, intParam } = require('../http');
const vehicles = require('../services/vehicles');
const logs = require('../services/logs');
const subs = require('../services/subscriptions');
const access = require('../services/access');
const { hashPassword } = require('../services/passwords');

const router = express.Router();
router.use(requireRole('tenant_admin', 'tenant_guard'));
const adminOnly = requireRole('tenant_admin');
const tid = (req) => req.user.tenant_id;

// ---------- الصفحة الرئيسية ----------
router.get('/dashboard', h(async (req) => {
  const [today, hours, gates, sub, vcount] = await Promise.all([
    logs.todayStats(tid(req)),
    logs.hourly(tid(req)),
    gatesWithCameras(tid(req)),
    subs.get(tid(req)),
    one('SELECT COUNT(*)::int AS n FROM vehicles WHERE tenant_id = $1', [tid(req)]),
  ]);
  const recent = await logs.search({ limit: 20 }, tid(req));
  return { today, hours, gates, subscription: sub, vehicles: vcount.n, recent: recent.rows, tenant_name: req.user.tenant_name };
}));

async function gatesWithCameras(tenantId) {
  return many(`SELECT g.id, g.code, g.name, g.auto_open, g.relay_id,
      (SELECT json_agg(json_build_object('id', c.id, 'sn', c.sn, 'direction', c.direction, 'is_online', c.is_online,
          'last_seen_at', c.last_seen_at) ORDER BY c.direction) FROM cameras c WHERE c.gate_id = g.id) AS cameras
    FROM gates g WHERE g.tenant_id = $1 ORDER BY g.id`, [tenantId]);
}
router.get('/gates', h((req) => gatesWithCameras(tid(req))));

// فتح البوابة يدوياً عن بُعد
router.post('/gates/:id/open', h(async (req) => {
  const gate = await one('SELECT id FROM gates WHERE id = $1 AND tenant_id = $2', [intParam(req.params.id), tid(req)]);
  if (!gate) fail(404, 'البوابة غير موجودة');
  const direction = req.body?.direction === 'out' ? 'out' : 'in';
  const log = await access.manualOpen(req.user, gate.id, direction);
  await audit(req.user, 'gate_manual_open', { gate_id: gate.id, direction });
  return { ok: true, log };
}));

// تشغيل/إيقاف الفتح التلقائي للبوابة
router.patch('/gates/:id', adminOnly, h(async (req) => {
  const fields = {};
  if (typeof req.body?.auto_open === 'boolean') fields.auto_open = req.body.auto_open;
  if (req.body?.name) fields.name = String(req.body.name).slice(0, 80);
  if (!Object.keys(fields).length) fail(400, 'لا توجد تعديلات');
  const keys = Object.keys(fields);
  const g = await one(`UPDATE gates SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')}
    WHERE id = $${keys.length + 1} AND tenant_id = $${keys.length + 2} RETURNING *`, [...Object.values(fields), intParam(req.params.id), tid(req)]);
  if (!g) fail(404, 'البوابة غير موجودة');
  await audit(req.user, 'gate_update', fields);
  return g;
}));

// ---------- السيارات المسموح لها ----------
router.get('/vehicles', h(async (req) => {
  const [rows, sub] = await Promise.all([vehicles.list(tid(req), req.query), subs.get(tid(req))]);
  return { rows, max_vehicles: sub?.max_vehicles ?? 0 };
}));
router.post('/vehicles', adminOnly, h(async (req) => {
  const v = await vehicles.create(tid(req), req.body || {});
  await audit(req.user, 'vehicle_add', { plate: v.plate_key });
  return v;
}));
router.patch('/vehicles/:id', adminOnly, h(async (req) => {
  const v = await vehicles.update(tid(req), intParam(req.params.id), req.body || {});
  await audit(req.user, 'vehicle_update', { plate: v.plate_key, status: v.status });
  return v;
}));
router.delete('/vehicles/:id', adminOnly, h(async (req) => {
  const v = await one('DELETE FROM vehicles WHERE id = $1 AND tenant_id = $2 RETURNING plate_key', [intParam(req.params.id), tid(req)]);
  if (!v) fail(404, 'السيارة غير موجودة');
  await audit(req.user, 'vehicle_delete', { plate: v.plate_key });
  return { ok: true };
}));
// استيراد جماعي: الواجهة تقرأ ملف CSV/Excel وترسل الصفوف
router.post('/vehicles/import', adminOnly, h(async (req) => {
  const r = await vehicles.importRows(tid(req), req.body?.rows);
  await audit(req.user, 'vehicle_import', { created: r.created, updated: r.updated, errors: r.errors.length });
  return r;
}));

// ---------- السجلات ----------
router.get('/logs', h((req) => logs.search(req.query, tid(req))));
router.get('/logs/export.csv', h(async (req, res) => {
  const rows = await logs.exportRows(req.query, tid(req));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="arakom-logs-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(logs.toCsv(rows));
}));
// للتصدير بصيغة PDF: الواجهة تطلب الصفوف وتطبع تقريراً منسقاً بالعربي
router.get('/logs/report', h(async (req) => ({ rows: await logs.exportRows(req.query, tid(req)), tenant_name: req.user.tenant_name })));

// ---------- حسابات موظفي المجمع (الحراس) ----------
router.get('/users', adminOnly, h((req) => many(`SELECT id, username, full_name, phone, role, active, last_login_at, created_at
  FROM users WHERE tenant_id = $1 ORDER BY id`, [tid(req)])));
router.post('/users', adminOnly, h(async (req) => {
  const b = req.body || {};
  const username = String(b.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._@-]{3,40}$/.test(username)) fail(400, 'اسم المستخدم: حروف إنجليزية وأرقام فقط (3 أحرف على الأقل)');
  if (!b.password || String(b.password).length < 8) fail(400, 'كلمة المرور 8 أحرف على الأقل');
  const role = b.role === 'tenant_admin' ? 'tenant_admin' : 'tenant_guard';
  const u = await one(`INSERT INTO users (tenant_id, username, full_name, phone, password_hash, role) VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING id, username, full_name, role, active`, [tid(req), username, b.full_name || null, b.phone || null, hashPassword(b.password), role]);
  await audit(req.user, 'user_add', { username, role });
  return u;
}));
router.patch('/users/:id', adminOnly, h(async (req) => {
  const id = intParam(req.params.id);
  const target = await one('SELECT id FROM users WHERE id = $1 AND tenant_id = $2', [id, tid(req)]);
  if (!target) fail(404, 'المستخدم غير موجود');
  const b = req.body || {};
  if (b.password) {
    if (String(b.password).length < 8) fail(400, 'كلمة المرور 8 أحرف على الأقل');
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashPassword(b.password), id]);
  }
  if (typeof b.active === 'boolean') {
    if (id === req.user.id) fail(400, 'لا يمكنك إيقاف حسابك');
    await query('UPDATE users SET active = $1 WHERE id = $2', [b.active, id]);
  }
  if (b.full_name !== undefined) await query('UPDATE users SET full_name = $1 WHERE id = $2', [b.full_name, id]);
  await audit(req.user, 'user_update', { id, active: b.active, password: !!b.password });
  return { ok: true };
}));
router.delete('/users/:id', adminOnly, h(async (req) => {
  const id = intParam(req.params.id);
  if (id === req.user.id) fail(400, 'لا يمكنك حذف حسابك');
  const r = await one('DELETE FROM users WHERE id = $1 AND tenant_id = $2 RETURNING id', [id, tid(req)]);
  if (!r) fail(404, 'المستخدم غير موجود');
  return { ok: true };
}));

router.get('/subscription', h((req) => subs.get(tid(req))));

module.exports = router;
