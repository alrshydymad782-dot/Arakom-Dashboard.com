'use strict';
/*
 * لوحة الإدارة (admin.arakom.sa) — إدارة لوحات تحكم العملاء:
 *   العملاء ورابط كل عميل، أيام الاشتراك (قفل تلقائي عند الانتهاء)، البوابات (عمود أو عمودان)،
 *   الكاميرات، السيارات، السجلات، ومراقبة النظام
 */
const express = require('express');
const crypto = require('node:crypto');
const config = require('../config');
const { one, many, query, tx, audit } = require('../db');
const { h, fail, requireRole, pickFields, updateSql, intParam } = require('../http');
const { hashPassword } = require('../services/passwords');
const logs = require('../services/logs');
const subs = require('../services/subscriptions');
const access = require('../services/access');
const vehicles = require('../services/vehicles');
const documents = require('../services/documents');
const mq = require('../mqtt/client');
const listener = require('../mqtt/listener');
const { build, arakomTopics } = require('../mqtt/protocol');

const router = express.Router();
router.use(requireRole('super_admin'));

const linkOf = (token) => `${config.appUrl.replace(/\/$/, '')}/c/${token}`;
const newToken = () => crypto.randomBytes(18).toString('hex');

// ---------- النظرة العامة ----------
router.get('/overview', h(async () => {
  const [counts, today, hours, events, expiring] = await Promise.all([
    one(`SELECT
        (SELECT COUNT(*) FROM tenants)::int AS tenants,
        (SELECT COUNT(*) FROM tenant_access_state WHERE can_access)::int AS active_tenants,
        (SELECT COUNT(*) FROM gates)::int AS gates,
        (SELECT COUNT(*) FROM cameras)::int AS cameras,
        (SELECT COUNT(*) FROM cameras WHERE is_online)::int AS cameras_online,
        (SELECT COUNT(*) FROM cameras WHERE gate_id IS NULL)::int AS cameras_unassigned,
        (SELECT COUNT(*) FROM vehicles)::int AS vehicles,
        (SELECT COUNT(*) FROM vehicles WHERE plate_key IS NULL)::int AS pending_plates`),
    logs.todayStats(null),
    logs.hourly(null),
    many('SELECT * FROM mqtt_events ORDER BY id DESC LIMIT 15'),
    // عملاء تنتهي اشتراكاتهم خلال 7 أيام أو انتهت (لوحاتهم مقفلة)
    many(`SELECT t.id, t.name, s.ends_at, (s.ends_at - CURRENT_DATE) AS days_left FROM tenants t
      LEFT JOIN subscriptions s ON s.tenant_id = t.id
      WHERE t.status = 'active' AND (s.id IS NULL OR s.ends_at <= CURRENT_DATE + 7)
      ORDER BY s.ends_at NULLS FIRST LIMIT 15`),
  ]);
  return { counts, today, hours, mqtt: mq.state, events, expiring };
}));

// ---------- العملاء ----------
const TENANT_FIELDS = ['name', 'contact_name', 'phone', 'city', 'notes', 'status'];

router.get('/tenants', h(async () => (await many(`SELECT t.id, t.name, t.contact_name, t.phone, t.city, t.status, t.access_token, t.created_at,
    s.ends_at, (s.ends_at - CURRENT_DATE) AS days_left, COALESCE(st.can_access, false) AS can_access,
    (SELECT COUNT(*) FROM gates g WHERE g.tenant_id = t.id)::int AS gates,
    (SELECT COUNT(*) FROM vehicles v WHERE v.tenant_id = t.id)::int AS vehicles,
    (SELECT COUNT(*) FROM cameras c JOIN gates g ON g.id = c.gate_id WHERE g.tenant_id = t.id AND c.is_online)::int AS cameras_online,
    (SELECT COUNT(*) FROM cameras c JOIN gates g ON g.id = c.gate_id WHERE g.tenant_id = t.id)::int AS cameras
  FROM tenants t LEFT JOIN subscriptions s ON s.tenant_id = t.id LEFT JOIN tenant_access_state st ON st.tenant_id = t.id
  ORDER BY t.id DESC`)).map(({ access_token: tok, ...t }) => ({ ...t, link: linkOf(tok) }))));

router.get('/tenants/:id', h(async (req) => {
  const id = intParam(req.params.id);
  const t = await one('SELECT * FROM tenants WHERE id = $1', [id]);
  if (!t) fail(404, 'العميل غير موجود');
  const [subscription, gates, vcount] = await Promise.all([
    subs.get(id),
    many(`SELECT g.*, (SELECT json_agg(c ORDER BY c.direction) FROM cameras c WHERE c.gate_id = g.id) AS cameras
      FROM gates g WHERE g.tenant_id = $1 ORDER BY g.id`, [id]),
    one('SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE plate_key IS NULL)::int AS pending FROM vehicles WHERE tenant_id = $1', [id]),
  ]);
  const { access_token: tok, ...tenant } = t;
  return { tenant, link: linkOf(tok), subscription, gates, vehicles: vcount.n, pending_plates: vcount.pending };
}));

// إضافة عميل: الاسم + عدد أيام الاشتراك (مثلاً 30) ← يُنشأ رابط لوحته تلقائياً
router.post('/tenants', h(async (req) => {
  const b = req.body || {};
  if (!String(b.name || '').trim()) fail(400, 'اسم العميل مطلوب');
  const f = pickFields(b, TENANT_FIELDS.filter((k) => k !== 'status'));
  const t = await tx(async (c) => {
    const cols = [...Object.keys(f), 'access_token'];
    const row = (await c.query(`INSERT INTO tenants (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
      [...Object.values(f), newToken()])).rows[0];
    if (intParam(b.days)) await subs.addDays(c, row.id, intParam(b.days));
    return row;
  });
  await audit(req.user, 'tenant_create', { name: t.name, days: b.days }, t.id);
  return { id: t.id, name: t.name, link: linkOf(t.access_token) };
}));

router.patch('/tenants/:id', h(async (req) => {
  const f = pickFields(req.body, TENANT_FIELDS);
  if (f.status && !['active', 'suspended'].includes(f.status)) fail(400, 'الحالة غير صحيحة');
  const q = updateSql('tenants', { ...f, updated_at: new Date() }, 'id = $1', [intParam(req.params.id)]);
  const t = await one(q.text, q.values);
  if (!t) fail(404, 'العميل غير موجود');
  await audit(req.user, f.status ? `tenant_${f.status}` : 'tenant_update', f, t.id);
  return { ok: true };
}));

router.delete('/tenants/:id', h(async (req) => {
  const t = await one('DELETE FROM tenants WHERE id = $1 RETURNING id, name', [intParam(req.params.id)]);
  if (!t) fail(404, 'العميل غير موجود');
  await audit(req.user, 'tenant_delete', { name: t.name });
  return { ok: true };
}));

// رابط جديد للعميل: الرابط القديم يتوقف فوراً (مثلاً إن انتشر الرابط)
router.post('/tenants/:id/link', h(async (req) => {
  const t = await one('UPDATE tenants SET access_token = $2, updated_at = now() WHERE id = $1 RETURNING access_token', [intParam(req.params.id), newToken()]);
  if (!t) fail(404, 'العميل غير موجود');
  await audit(req.user, 'tenant_link_regenerated', {}, intParam(req.params.id));
  return { link: linkOf(t.access_token) };
}));

// ---------- الاشتراك (بالأيام) ----------
router.post('/tenants/:id/subscription/days', h(async (req) => {
  const id = intParam(req.params.id);
  const s = await tx((c) => subs.addDays(c, id, req.body?.days));
  await audit(req.user, 'subscription_add_days', { days: req.body?.days }, id);
  return s;
}));

// تعديل تاريخ الانتهاء يدوياً
router.patch('/tenants/:id/subscription', h(async (req) => {
  const id = intParam(req.params.id);
  const endsAt = req.body?.ends_at;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(endsAt || ''))) fail(400, 'اختر تاريخ الانتهاء');
  const s = await one(`INSERT INTO subscriptions (tenant_id, starts_at, ends_at) VALUES ($1, LEAST(CURRENT_DATE, $2::date), $2::date)
    ON CONFLICT (tenant_id) DO UPDATE SET ends_at = $2::date, starts_at = LEAST(subscriptions.starts_at, $2::date), updated_at = now()
    RETURNING *`, [id, endsAt]);
  await audit(req.user, 'subscription_set_end', { ends_at: endsAt }, id);
  return s;
}));

// إنهاء الاشتراك الآن (تُقفل اللوحة فوراً)
router.delete('/tenants/:id/subscription', h(async (req) => {
  await query('DELETE FROM subscriptions WHERE tenant_id = $1', [intParam(req.params.id)]);
  await audit(req.user, 'subscription_end_now', {}, intParam(req.params.id));
  return { ok: true };
}));

// ---------- البوابات ----------
router.get('/gates', h(() => many(`SELECT g.id, g.code, g.name, g.columns, g.tenant_id, t.name AS tenant_name
  FROM gates g JOIN tenants t ON t.id = g.tenant_id ORDER BY t.name, g.name`)));

// columns: 1 = عمود دخول فقط ، 2 = عمودا دخول وخروج
router.post('/tenants/:id/gates', h(async (req) => {
  const tenantId = intParam(req.params.id);
  const b = req.body || {};
  if (!String(b.name || '').trim()) fail(400, 'اسم البوابة مطلوب');
  const columns = Number(b.columns) === 1 ? 1 : 2;
  // رمز البوابة يُستخدم في مواضيع MQTT: arakom/gates/{code}/...
  const code = String(b.code || '').trim() || `t${tenantId}-${crypto.randomBytes(3).toString('hex')}`;
  const g = await one('INSERT INTO gates (tenant_id, code, name, columns) VALUES ($1,$2,$3,$4) RETURNING *', [tenantId, code, b.name.trim(), columns]);
  await audit(req.user, 'gate_create', { name: g.name, columns }, tenantId);
  return g;
}));

router.patch('/gates/:id', h(async (req) => {
  const f = pickFields(req.body, ['name', 'columns']);
  if (f.columns !== undefined) {
    f.columns = Number(f.columns) === 1 ? 1 : 2;
    // تحويل البوابة لعمود واحد: تُفك كاميرا الخروج
    if (f.columns === 1) await query("UPDATE cameras SET gate_id = NULL, direction = NULL WHERE gate_id = $1 AND direction = 'out'", [intParam(req.params.id)]);
  }
  const q = updateSql('gates', f, 'id = $1', [intParam(req.params.id)]);
  if (!q) fail(400, 'لا توجد تعديلات');
  const g = await one(q.text, q.values);
  if (!g) fail(404, 'البوابة غير موجودة');
  return g;
}));

router.delete('/gates/:id', h(async (req) => {
  await query('DELETE FROM gates WHERE id = $1', [intParam(req.params.id)]);
  return { ok: true };
}));

router.post('/gates/:id/open', h(async (req) => {
  const gate = await one('SELECT columns FROM gates WHERE id = $1', [intParam(req.params.id)]);
  if (!gate) fail(404, 'البوابة غير موجودة');
  const direction = req.body?.direction === 'out' && gate.columns === 2 ? 'out' : 'in';
  return { ok: true, log: await access.manualOpen(req.user, intParam(req.params.id), direction) };
}));

router.post('/gates/:id/open-all', h(async (req) => {
  const g = await access.setOpenAll(req.user, intParam(req.params.id), String(req.body?.mode || ''));
  await audit(req.user, 'gate_open_all', { gate_id: g.id, mode: req.body?.mode }, g.tenant_id);
  return g;
}));

// ---------- الكاميرات ----------
router.get('/cameras', h((req) => {
  const where = [];
  if (req.query.filter === 'unassigned') where.push('c.gate_id IS NULL');
  if (req.query.filter === 'offline') where.push('NOT c.is_online');
  return many(`SELECT c.*, g.name AS gate_name, g.code AS gate_code, g.columns, t.id AS tenant_id, t.name AS tenant_name
    FROM cameras c LEFT JOIN gates g ON g.id = c.gate_id LEFT JOIN tenants t ON t.id = g.tenant_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.gate_id NULLS FIRST, c.id`);
}));

router.post('/cameras', h(async (req) => {
  const b = req.body || {};
  if (!b.sn) fail(400, 'الرقم التسلسلي مطلوب');
  const c = await one('INSERT INTO cameras (sn, name) VALUES ($1,$2) RETURNING *', [String(b.sn).trim(), b.name || null]);
  await audit(req.user, 'camera_create', { sn: c.sn });
  return c;
}));

// ربط الكاميرا بعمود: الدخول (in) أو الخروج (out — للبوابة ذات العمودين فقط)
router.patch('/cameras/:id', h(async (req) => {
  const f = pickFields(req.body, ['gate_id', 'direction', 'name']);
  if (f.gate_id === null) f.direction = null;
  if (f.gate_id) {
    const gate = await one('SELECT columns FROM gates WHERE id = $1', [intParam(f.gate_id)]);
    if (!gate) fail(404, 'البوابة غير موجودة');
    if (!['in', 'out'].includes(f.direction)) fail(400, 'اختر عمود الدخول أو عمود الخروج');
    if (f.direction === 'out' && gate.columns === 1) fail(400, 'هذه البوابة عمود دخول فقط');
  }
  const q = updateSql('cameras', f, 'id = $1', [intParam(req.params.id)]);
  if (!q) fail(400, 'لا توجد تعديلات');
  let c;
  try {
    c = await one(q.text, q.values);
  } catch (e) {
    if (e.code === '23505') fail(409, 'هذا العمود مربوط بكاميرا أخرى');
    throw e;
  }
  if (!c) fail(404, 'الكاميرا غير موجودة');
  await audit(req.user, 'camera_assign', { sn: c.sn, gate_id: c.gate_id, direction: c.direction });
  return c;
}));

router.delete('/cameras/:id', h(async (req) => {
  await query('DELETE FROM cameras WHERE id = $1', [intParam(req.params.id)]);
  return { ok: true };
}));

router.post('/cameras/:id/command', h(async (req) => {
  const id = intParam(req.params.id);
  const type = req.body?.type;
  let payload;
  if (type === 'check_online') payload = build.checkOnline();
  else if (type === 'restart') payload = build.restart();
  else if (type === 'sync_time') payload = build.syncTime();
  else if (type === 'open') payload = build.ioOutput('on', 1);
  else if (type === 'barrier_state') payload = build.barrierState();
  else if (type === 'apply_topics') {
    const cam = await one('SELECT c.sn, g.code FROM cameras c JOIN gates g ON g.id = c.gate_id WHERE c.id = $1', [id]);
    if (!cam) fail(400, 'اربط الكاميرا ببوابة أولاً');
    payload = build.setMqttParam({ ...arakomTopics(cam.code, cam.sn), pushtype: 1, platepush: 1, fullpush: 1, alonepush: 0, heart_enable: 1, heart_time: 30 });
  } else fail(400, 'أمر غير معروف');
  const r = await listener.sendToCamera(id, payload);
  await audit(req.user, `camera_${type}`, { camera_id: id });
  return { ok: true, ...r };
}));

// ---------- سيارات العملاء ----------
router.get('/tenants/:id/vehicles', h(async (req) => ({ rows: await vehicles.list(intParam(req.params.id), req.query) })));
// سيارات سُجلت بصورة/PDF فقط وتنتظر كتابة رقم اللوحة
router.get('/vehicles/pending', h(() => many(`SELECT v.id, v.tenant_id, t.name AS tenant_name, v.document_type, v.document_name,
    v.document_uploaded_at, v.created_at
  FROM vehicles v JOIN tenants t ON t.id = v.tenant_id WHERE v.plate_key IS NULL ORDER BY v.created_at`)));
router.patch('/vehicles/:id', h(async (req) => {
  const v = await one('SELECT tenant_id FROM vehicles WHERE id = $1', [intParam(req.params.id)]);
  if (!v) fail(404, 'السيارة غير موجودة');
  const row = await vehicles.update(v.tenant_id, intParam(req.params.id), { plate: req.body?.plate });
  await audit(req.user, 'vehicle_plate_set', { plate: row.plate_key }, v.tenant_id);
  return row;
}));
router.delete('/vehicles/:id', h(async (req) => {
  const v = await one('DELETE FROM vehicles WHERE id = $1 RETURNING tenant_id, plate_key, document_path', [intParam(req.params.id)]);
  if (!v) fail(404, 'السيارة غير موجودة');
  documents.removeFile(v.document_path);
  await audit(req.user, 'vehicle_delete', { plate: v.plate_key }, v.tenant_id);
  return { ok: true };
}));
router.get('/vehicles/:id/document', h(async (req, res) => {
  const v = await one('SELECT document_path, document_type, document_name FROM vehicles WHERE id = $1', [intParam(req.params.id)]);
  await documents.send(res, v);
}));

// ---------- السجلات ----------
router.get('/logs', h((req) => logs.search(req.query, null)));
router.get('/logs/export.csv', h(async (req, res) => {
  const rows = await logs.exportRows(req.query, null);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="arakom-logs-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(logs.toCsv(rows, { withTenant: true }));
}));
router.get('/logs/report', h(async (req) => ({ rows: await logs.exportRows(req.query, null) })));

// ---------- حسابات الإدارة ----------
router.get('/admins', h(() => many("SELECT id, username, full_name, active, last_login_at FROM users WHERE role = 'super_admin' ORDER BY id")));
router.post('/admins', h(async (req) => {
  const b = req.body || {};
  const username = String(b.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._@-]{3,40}$/.test(username)) fail(400, 'اسم المستخدم: حروف إنجليزية وأرقام فقط');
  if (!b.password || String(b.password).length < 10) fail(400, 'كلمة المرور 10 أحرف على الأقل');
  return one(`INSERT INTO users (username, full_name, password_hash, role) VALUES ($1,$2,$3,'super_admin') RETURNING id, username, full_name`,
    [username, b.full_name || null, hashPassword(b.password)]);
}));

// ---------- مراقبة النظام ----------
router.get('/system', h(async () => {
  const [db, tables, events] = await Promise.all([
    one('SELECT pg_database_size(current_database())::bigint AS bytes, version() AS version'),
    many(`SELECT relname AS table, n_live_tup::bigint AS rows, pg_total_relation_size(relid)::bigint AS bytes
      FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC`),
    many('SELECT * FROM mqtt_events ORDER BY id DESC LIMIT 200'),
  ]);
  return { mqtt: mq.state, db, tables, events, uptime: process.uptime(), node: process.version };
}));

router.get('/audit', h(() => many(`SELECT a.*, u.username, t.name AS tenant_name FROM audit_log a
  LEFT JOIN users u ON u.id = a.user_id LEFT JOIN tenants t ON t.id = a.tenant_id ORDER BY a.id DESC LIMIT 300`)));

module.exports = router;
