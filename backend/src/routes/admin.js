'use strict';
// مسارات لوحة الإدارة العليا (admin.arakom.sa)
const express = require('express');
const { one, many, query, tx, audit } = require('../db');
const { h, fail, requireRole, pickFields, updateSql, intParam } = require('../http');
const { hashPassword } = require('../services/passwords');
const logs = require('../services/logs');
const subs = require('../services/subscriptions');
const access = require('../services/access');
const mq = require('../mqtt/client');
const listener = require('../mqtt/listener');
const { build, arakomTopics } = require('../mqtt/protocol');
const { applyPayment } = require('./salla');

const router = express.Router();
router.use(requireRole('super_admin'));

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
        (SELECT COUNT(*) FROM payments WHERE status IN ('pending','unmatched'))::int AS payments_pending`),
    logs.todayStats(null),
    logs.hourly(null),
    many('SELECT * FROM mqtt_events ORDER BY id DESC LIMIT 15'),
    many(`SELECT t.id, t.name, s.ends_at, (s.ends_at - CURRENT_DATE) AS days_left FROM tenants t LEFT JOIN subscriptions s ON s.tenant_id = t.id
      WHERE t.status = 'active' AND (s.id IS NULL OR s.ends_at BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE + 14)
      ORDER BY s.ends_at NULLS FIRST LIMIT 10`),
  ]);
  return { counts, today, hours, mqtt: mq.state, events, expiring };
}));

// ---------- المجمعات / العملاء ----------
const TENANT_FIELDS = ['name', 'contact_name', 'phone', 'email', 'city', 'country', 'address', 'notes', 'status', 'salla_customer_id'];

router.get('/tenants', h(() => many(`SELECT t.*, s.ends_at, s.starts_at, s.max_vehicles, s.duration_months,
    (s.ends_at - CURRENT_DATE) AS days_left, st.can_access,
    (SELECT COUNT(*) FROM gates g WHERE g.tenant_id = t.id)::int AS gates,
    (SELECT COUNT(*) FROM vehicles v WHERE v.tenant_id = t.id)::int AS vehicles,
    (SELECT COUNT(*) FROM cameras c JOIN gates g ON g.id = c.gate_id WHERE g.tenant_id = t.id AND c.is_online)::int AS cameras_online,
    (SELECT COUNT(*) FROM cameras c JOIN gates g ON g.id = c.gate_id WHERE g.tenant_id = t.id)::int AS cameras
  FROM tenants t LEFT JOIN subscriptions s ON s.tenant_id = t.id LEFT JOIN tenant_access_state st ON st.tenant_id = t.id
  ORDER BY t.id DESC`)));

router.get('/tenants/:id', h(async (req) => {
  const id = intParam(req.params.id);
  const tenant = await one('SELECT * FROM tenants WHERE id = $1', [id]);
  if (!tenant) fail(404, 'المجمع غير موجود');
  const [subscription, gates, users, payments, vcount] = await Promise.all([
    subs.get(id),
    many(`SELECT g.*, (SELECT json_agg(c ORDER BY c.direction) FROM cameras c WHERE c.gate_id = g.id) AS cameras
      FROM gates g WHERE g.tenant_id = $1 ORDER BY g.id`, [id]),
    many('SELECT id, username, full_name, phone, role, active, last_login_at FROM users WHERE tenant_id = $1 ORDER BY id', [id]),
    many('SELECT * FROM payments WHERE tenant_id = $1 ORDER BY id DESC LIMIT 20', [id]),
    one('SELECT COUNT(*)::int AS n FROM vehicles WHERE tenant_id = $1', [id]),
  ]);
  return { tenant, subscription, gates, users, payments, vehicles: vcount.n };
}));

// إنشاء مجمع مع حساب مديره. الاشتراك لا يُنشأ هنا: يأتي من الدفع في سلة أو يضيفه المدير يدوياً
router.post('/tenants', h(async (req) => {
  const b = req.body || {};
  if (!b.name) fail(400, 'اسم المجمع مطلوب');
  const f = pickFields(b, TENANT_FIELDS);
  const result = await tx(async (c) => {
    const cols = Object.keys(f);
    const t = (await c.query(`INSERT INTO tenants (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, Object.values(f))).rows[0];
    if (b.admin_username) {
      const username = String(b.admin_username).trim().toLowerCase();
      if (!/^[a-z0-9._@-]{3,40}$/.test(username)) fail(400, 'اسم المستخدم: حروف إنجليزية وأرقام فقط');
      if (!b.admin_password || String(b.admin_password).length < 8) fail(400, 'كلمة مرور مدير المجمع 8 أحرف على الأقل');
      await c.query(`INSERT INTO users (tenant_id, username, full_name, phone, password_hash, role) VALUES ($1,$2,$3,$4,$5,'tenant_admin')`,
        [t.id, username, b.contact_name || b.name, b.phone || null, hashPassword(b.admin_password)]);
    }
    return t;
  });
  await audit(req.user, 'tenant_create', { name: result.name }, result.id);
  return result;
}));

router.patch('/tenants/:id', h(async (req) => {
  const f = pickFields(req.body, TENANT_FIELDS);
  if (f.status && !['active', 'suspended'].includes(f.status)) fail(400, 'الحالة غير صحيحة');
  const q = updateSql('tenants', { ...f, updated_at: new Date() }, 'id = $1', [intParam(req.params.id)]);
  const t = await one(q.text, q.values);
  if (!t) fail(404, 'المجمع غير موجود');
  await audit(req.user, f.status ? `tenant_${f.status}` : 'tenant_update', f, t.id);
  return t;
}));

router.delete('/tenants/:id', h(async (req) => {
  const t = await one('DELETE FROM tenants WHERE id = $1 RETURNING id, name', [intParam(req.params.id)]);
  if (!t) fail(404, 'المجمع غير موجود');
  await audit(req.user, 'tenant_delete', { name: t.name });
  return { ok: true };
}));

// ---------- الاشتراكات ----------
// إضافة مدة يدوياً (شهر / 3 / 6 / سنة) — مثلاً عند الدفع خارج سلة
router.post('/tenants/:id/subscription/extend', h(async (req) => {
  const months = intParam(req.body?.months);
  const s = await tx((c) => subs.extend(c, intParam(req.params.id), months));
  await audit(req.user, 'subscription_extend', { months }, intParam(req.params.id));
  return s;
}));

// تعديل يدوي: تاريخ الانتهاء، الحد الأقصى للسيارات (فارغ = بدون حد)، أيام السماح
router.patch('/tenants/:id/subscription', h(async (req) => {
  const id = intParam(req.params.id);
  const f = pickFields(req.body, ['ends_at', 'max_vehicles', 'grace_days']);
  if (f.ends_at === null) fail(400, 'تاريخ الانتهاء مطلوب');
  const q = updateSql('subscriptions', { ...f, updated_at: new Date() }, 'tenant_id = $1', [id]);
  const s = await one(q.text, q.values);
  if (!s) fail(404, 'لا يوجد اشتراك لهذا المجمع. أضف مدة أولاً');
  await audit(req.user, 'subscription_update', f, id);
  return s;
}));

// إلغاء الاشتراك (يوقف الفتح التلقائي فوراً)
router.delete('/tenants/:id/subscription', h(async (req) => {
  await query('DELETE FROM subscriptions WHERE tenant_id = $1', [intParam(req.params.id)]);
  await audit(req.user, 'subscription_delete', {}, intParam(req.params.id));
  return { ok: true };
}));

// ---------- البوابات ----------
router.get('/gates', h(() => many(`SELECT g.id, g.code, g.name, g.tenant_id, t.name AS tenant_name
  FROM gates g JOIN tenants t ON t.id = g.tenant_id ORDER BY t.name, g.name`)));
router.post('/tenants/:id/gates', h(async (req) => {
  const b = req.body || {};
  if (!b.name || !b.code) fail(400, 'اسم البوابة ورمزها مطلوبان');
  const g = await one('INSERT INTO gates (tenant_id, code, name, relay_id, auto_open) VALUES ($1,$2,$3,COALESCE($4,1),COALESCE($5,true)) RETURNING *',
    [intParam(req.params.id), String(b.code).trim(), b.name, intParam(b.relay_id), b.auto_open ?? null]);
  await audit(req.user, 'gate_create', { code: g.code }, g.tenant_id);
  return g;
}));
router.patch('/gates/:id', h(async (req) => {
  const q = updateSql('gates', pickFields(req.body, ['code', 'name', 'relay_id', 'auto_open']), 'id = $1', [intParam(req.params.id)]);
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
  const log = await access.manualOpen(req.user, intParam(req.params.id), req.body?.direction === 'out' ? 'out' : 'in');
  return { ok: true, log };
}));

// ---------- الكاميرات ----------
router.get('/cameras', h((req) => {
  const where = [];
  if (req.query.filter === 'unassigned') where.push('c.gate_id IS NULL');
  if (req.query.filter === 'offline') where.push('NOT c.is_online');
  return many(`SELECT c.*, g.name AS gate_name, g.code AS gate_code, t.id AS tenant_id, t.name AS tenant_name
    FROM cameras c LEFT JOIN gates g ON g.id = c.gate_id LEFT JOIN tenants t ON t.id = g.tenant_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.gate_id NULLS FIRST, c.id`);
}));

// إضافة كاميرا يدوياً بالرقم التسلسلي قبل تركيبها
router.post('/cameras', h(async (req) => {
  const b = req.body || {};
  if (!b.sn) fail(400, 'الرقم التسلسلي مطلوب');
  const c = await one('INSERT INTO cameras (sn, gate_id, direction, name) VALUES ($1,$2,$3,$4) RETURNING *',
    [String(b.sn).trim(), intParam(b.gate_id), b.direction || null, b.name || null]);
  await audit(req.user, 'camera_create', { sn: c.sn });
  return c;
}));

router.patch('/cameras/:id', h(async (req) => {
  const f = pickFields(req.body, ['gate_id', 'direction', 'name']);
  if (f.direction && !['in', 'out'].includes(f.direction)) fail(400, 'الاتجاه يجب أن يكون دخول أو خروج');
  if (f.gate_id && !f.direction && req.body.direction === undefined) fail(400, 'حدد اتجاه الكاميرا (دخول/خروج)');
  if (f.gate_id === null) f.direction = null;
  const q = updateSql('cameras', f, 'id = $1', [intParam(req.params.id)]);
  if (!q) fail(400, 'لا توجد تعديلات');
  let c;
  try {
    c = await one(q.text, q.values);
  } catch (e) {
    if (e.code === '23505') fail(409, 'هذه البوابة لديها كاميرا بنفس الاتجاه مسبقاً');
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

// أوامر للكاميرا عبر MQTT
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
    // ضبط الكاميرا لتنشر على arakom/gates/{gate}/readings ورفع الصور مع النتيجة
    const cam = await one('SELECT c.sn, g.code FROM cameras c JOIN gates g ON g.id = c.gate_id WHERE c.id = $1', [id]);
    if (!cam) fail(400, 'اربط الكاميرا ببوابة أولاً');
    payload = build.setMqttParam({ ...arakomTopics(cam.code, cam.sn), pushtype: 1, platepush: 1, fullpush: 1, alonepush: 0, heart_enable: 1, heart_time: 30 });
  } else fail(400, 'أمر غير معروف');
  // ملاحظة: لا نغيّر subtopic في قاعدة البيانات هنا؛ الكاميرا تعيد التسجيل بالمواضيع الجديدة فنحدّثها حينها
  const r = await listener.sendToCamera(id, payload);
  await audit(req.user, `camera_${type}`, { camera_id: id });
  return { ok: true, ...r };
}));

// ---------- المستخدمون ----------
router.post('/tenants/:id/users', h(async (req) => {
  const b = req.body || {};
  const username = String(b.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._@-]{3,40}$/.test(username)) fail(400, 'اسم المستخدم: حروف إنجليزية وأرقام فقط');
  if (!b.password || String(b.password).length < 8) fail(400, 'كلمة المرور 8 أحرف على الأقل');
  const role = b.role === 'tenant_guard' ? 'tenant_guard' : 'tenant_admin';
  return one(`INSERT INTO users (tenant_id, username, full_name, phone, password_hash, role) VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING id, username, full_name, role, active`, [intParam(req.params.id), username, b.full_name || null, b.phone || null, hashPassword(b.password), role]);
}));
router.get('/admins', h(() => many("SELECT id, username, full_name, active, last_login_at FROM users WHERE role = 'super_admin' ORDER BY id")));
router.post('/admins', h(async (req) => {
  const b = req.body || {};
  const username = String(b.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._@-]{3,40}$/.test(username)) fail(400, 'اسم المستخدم: حروف إنجليزية وأرقام فقط');
  if (!b.password || String(b.password).length < 10) fail(400, 'كلمة مرور الإدارة 10 أحرف على الأقل');
  return one(`INSERT INTO users (username, full_name, password_hash, role) VALUES ($1,$2,$3,'super_admin') RETURNING id, username, full_name`,
    [username, b.full_name || null, hashPassword(b.password)]);
}));
router.patch('/users/:id', h(async (req) => {
  const id = intParam(req.params.id);
  const b = req.body || {};
  if (b.password) {
    if (String(b.password).length < 8) fail(400, 'كلمة المرور 8 أحرف على الأقل');
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashPassword(b.password), id]);
  }
  if (typeof b.active === 'boolean') {
    if (id === req.user.id) fail(400, 'لا يمكنك إيقاف حسابك');
    await query('UPDATE users SET active = $1 WHERE id = $2', [b.active, id]);
  }
  await audit(req.user, 'user_update', { id, active: b.active, password: !!b.password });
  return { ok: true };
}));
router.delete('/users/:id', h(async (req) => {
  if (intParam(req.params.id) === req.user.id) fail(400, 'لا يمكنك حذف حسابك');
  await query('DELETE FROM users WHERE id = $1', [intParam(req.params.id)]);
  return { ok: true };
}));

// ---------- سيارات مجمع (للاطلاع والدعم) ----------
router.get('/tenants/:id/vehicles', h((req) => require('../services/vehicles').list(intParam(req.params.id), req.query)));
router.get('/vehicles/:id/document', h(async (req, res) => {
  const v = await one('SELECT document_path, document_type, document_name FROM vehicles WHERE id = $1', [intParam(req.params.id)]);
  await require('../services/documents').send(res, v);
}));

// ---------- مدفوعات سلة ----------
router.get('/payments', h(() => many(`SELECT p.id, p.tenant_id, p.event, p.order_id, p.reference_id, p.amount, p.currency, p.customer_name,
    p.customer_phone, p.customer_email, p.sku, p.product_name, p.status, p.months_added, p.created_at, t.name AS tenant_name
  FROM payments p LEFT JOIN tenants t ON t.id = p.tenant_id ORDER BY p.id DESC LIMIT 300`)));

// تطبيق دفعة معلقة يدوياً على مجمع (عند عدم التعرف التلقائي أو التجديد اليدوي)
router.post('/payments/:id/apply', h(async (req) => {
  const r = await applyPayment(intParam(req.params.id), intParam(req.body?.tenant_id), intParam(req.body?.months));
  await audit(req.user, 'payment_apply', { payment_id: req.params.id, tenant_id: req.body?.tenant_id }, intParam(req.body?.tenant_id));
  return r;
}));
router.post('/payments/:id/ignore', h(async (req) => {
  await query("UPDATE payments SET status = 'ignored' WHERE id = $1 AND status <> 'applied'", [intParam(req.params.id)]);
  return { ok: true };
}));

// ---------- السجلات ----------
router.get('/logs', h((req) => logs.search(req.query, null)));
router.get('/logs/export.csv', h(async (req, res) => {
  const rows = await logs.exportRows(req.query, null);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="arakom-all-logs-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(logs.toCsv(rows, { withTenant: true }));
}));
router.get('/logs/report', h(async (req) => ({ rows: await logs.exportRows(req.query, null) })));

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
