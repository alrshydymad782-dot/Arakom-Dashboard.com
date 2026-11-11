'use strict';
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const config = require('./config');
const { db, audit } = require('./db');
const { hashPassword, verifyPassword } = require('./auth-utils');
const { setSession, clearSession, loadUser, requireAuth, requireAdmin } = require('./auth');
const { parsePlate } = require('./plates');
const events = require('./events');
const mq = require('./mqtt');

if (config.embeddedBroker) {
  // خادم MQTT مدمج للتجربة فقط. في الإنتاج استخدم Mosquitto
  const aedes = require('aedes')();
  require('node:net').createServer(aedes.handle).listen(config.embeddedBrokerPort, () =>
    console.log(`[broker] خادم MQTT تجريبي مدمج على المنفذ ${config.embeddedBrokerPort}`));
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(loadUser);
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

const wrap = (fn) => (req, res) => {
  try {
    const out = fn(req, res);
    if (out !== undefined && !res.headersSent) res.json(out);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'القيمة موجودة مسبقاً' });
    console.error(err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'خطأ في الخادم' });
  }
};
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const isOnline = (d) => !!d.last_seen && Date.now() - d.last_seen < config.offlineAfterSec * 1000;
const withOnline = (d) => (d ? { ...d, online: isOnline(d) } : d);

// نطاق العميل: المدير يرى الكل (أو عميلاً محدداً)، العميل يرى بياناته فقط
function scope(req) {
  if (req.user.role === 'admin') return req.query.customer_id ? Number(req.query.customer_id) : null;
  return req.user.customer_id;
}
function getDeviceFor(req, id) {
  const d = db.prepare('SELECT * FROM devices WHERE id=?').get(Number(id));
  if (!d || (req.user.role !== 'admin' && d.customer_id !== req.user.customer_id)) throw bad('الجهاز غير موجود', 404);
  return d;
}

// ---------------- الدخول ----------------
const attempts = new Map();
app.post('/api/login', wrap((req, res) => {
  const ip = req.ip;
  const a = attempts.get(ip) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 15 * 60e3) { a.n = 0; a.t = Date.now(); }
  if (a.n >= 10) throw bad('محاولات كثيرة، حاول بعد 15 دقيقة', 429);
  const { username, password } = req.body || {};
  const u = db.prepare('SELECT u.*, c.active AS customer_active FROM users u LEFT JOIN customers c ON c.id=u.customer_id WHERE username=?')
    .get(String(username || '').trim().toLowerCase());
  if (!u || !verifyPassword(password || '', u.password_hash)) {
    a.n++; attempts.set(ip, a);
    throw bad('اسم المستخدم أو كلمة المرور غير صحيحة', 401);
  }
  if (!u.active || (u.role === 'customer' && !u.customer_active)) throw bad('الحساب موقوف، تواصل مع الدعم', 403);
  attempts.delete(ip);
  setSession(res, u.id);
  audit(u, 'login');
  return { ok: true, role: u.role };
}));
app.post('/api/logout', (_req, res) => { clearSession(res); res.json({ ok: true }); });
app.get('/api/me', requireAuth, (req, res) => res.json(req.user));
app.post('/api/me/password', requireAuth, wrap((req) => {
  const { current, next } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!verifyPassword(current || '', u.password_hash)) throw bad('كلمة المرور الحالية غير صحيحة');
  if (!next || String(next).length < 6) throw bad('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل');
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(next), u.id);
  return { ok: true };
}));

app.get('/api/events', requireAuth, events.subscribe);

// ---------------- الإحصائيات ----------------
app.get('/api/stats', requireAuth, wrap((req) => {
  const cid = scope(req);
  const where = cid ? 'WHERE customer_id=?' : 'WHERE 1=1';
  const args = cid ? [cid] : [];
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const today = db.prepare(`SELECT COUNT(*) n, SUM(gate_opened) opened, SUM(list_status='block') blocked,
    SUM(list_status='unknown') unknown FROM plate_reads ${where} AND ts>=?`).get(...args, startOfDay.getTime());
  const devices = db.prepare(`SELECT * FROM devices ${cid ? 'WHERE customer_id=?' : ''}`).all(...args);
  const hourly = db.prepare(`SELECT CAST((ts-?)/3600000 AS INTEGER) h, COUNT(*) n FROM plate_reads ${where} AND ts>=? GROUP BY h`)
    .all(startOfDay.getTime(), ...args, startOfDay.getTime());
  const hours = Array(24).fill(0);
  for (const r of hourly) if (r.h >= 0 && r.h < 24) hours[r.h] = r.n;
  const lists = db.prepare(`SELECT kind, COUNT(*) n FROM plate_lists ${where} GROUP BY kind`).all(...args);
  const out = {
    today: { reads: today.n || 0, opened: today.opened || 0, blocked: today.blocked || 0, unknown: today.unknown || 0 },
    devices: { total: devices.length, online: devices.filter(isOnline).length },
    hours,
    lists: Object.fromEntries(lists.map((l) => [l.kind, l.n])),
  };
  if (req.user.role === 'admin' && !cid) {
    out.customers = db.prepare('SELECT COUNT(*) n, SUM(active) active FROM customers').get();
    out.unassigned = devices.filter((d) => !d.customer_id).length;
    out.mqtt = mq.state;
  }
  return out;
}));

// ---------------- القراءات ----------------
function readsQuery(req) {
  const cid = scope(req);
  const w = []; const a = [];
  if (cid) { w.push('r.customer_id=?'); a.push(cid); }
  const { q, device_id: dev, status, from, to } = req.query;
  if (q) { w.push('(r.plate_key LIKE ? OR r.plate_raw LIKE ?)'); a.push(`%${parsePlate(q).key || q}%`, `%${q}%`); }
  if (dev) { w.push('r.device_id=?'); a.push(Number(dev)); }
  if (status) { w.push('r.list_status=?'); a.push(String(status)); }
  if (from) { w.push('r.ts>=?'); a.push(new Date(from).getTime()); }
  if (to) { w.push('r.ts<=?'); a.push(new Date(to).getTime() + 864e5 - 1); }
  return { where: w.length ? 'WHERE ' + w.join(' AND ') : '', args: a };
}
const READ_SELECT = `SELECT r.*, d.name AS device_name, d.location, c.name AS customer_name
  FROM plate_reads r LEFT JOIN devices d ON d.id=r.device_id LEFT JOIN customers c ON c.id=r.customer_id`;

app.get('/api/reads', requireAuth, wrap((req) => {
  const { where, args } = readsQuery(req);
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  const offset = Number(req.query.offset) || 0;
  const rows = db.prepare(`${READ_SELECT} ${where} ORDER BY r.ts DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) n FROM plate_reads r ${where}`).get(...args).n;
  return { rows, total };
}));

app.get('/api/reads.csv', requireAuth, wrap((req, res) => {
  const { where, args } = readsQuery(req);
  const rows = db.prepare(`${READ_SELECT} ${where} ORDER BY r.ts DESC LIMIT 50000`).all(...args);
  const st = { allow: 'مسموح', block: 'محظور', unknown: 'غير مسجل', expired: 'منتهي' };
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['التاريخ', 'اللوحة', 'اللوحة بالعربي', 'الجهاز', 'الموقع', 'الحالة', 'فتح البوابة', 'الدقة'].map(esc).join(',')];
  for (const r of rows) {
    lines.push([new Date(r.ts).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh' }), r.plate_display, r.plate_display_ar, r.device_name,
      r.location, st[r.list_status] || r.list_status, r.gate_opened ? 'نعم' : 'لا', r.confidence != null ? Math.round(r.confidence * 100) + '%' : ''].map(esc).join(','));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="plate-reads.csv"');
  res.send('﻿' + lines.join('\n'));
}));

app.get('/api/images/:dir/:file', requireAuth, (req, res) => {
  const name = `${req.params.dir}/${req.params.file}`;
  if (!/^\d{8}\/[\w-]+\.jpg$/.test(name)) return res.sendStatus(404);
  const row = db.prepare('SELECT customer_id FROM plate_reads WHERE image=?').get(name);
  if (!row || (req.user.role !== 'admin' && row.customer_id !== req.user.customer_id)) return res.sendStatus(404);
  res.sendFile(path.join(config.dataDir, 'images', name));
});

// ---------------- الأجهزة ----------------
app.get('/api/devices', requireAuth, wrap((req) => {
  const cid = scope(req);
  const rows = db.prepare(`SELECT d.*, c.name AS customer_name,
      (SELECT COUNT(*) FROM plate_reads r WHERE r.device_id=d.id AND r.ts>=?) AS reads_today
    FROM devices d LEFT JOIN customers c ON c.id=d.customer_id ${cid ? 'WHERE d.customer_id=?' : ''} ORDER BY d.id`)
    .all(new Date().setHours(0, 0, 0, 0), ...(cid ? [cid] : []));
  return rows.map(withOnline);
}));

app.post('/api/devices', requireAdmin, wrap((req) => {
  const { serial, name, customer_id, location, gate_mode } = req.body || {};
  if (!serial) throw bad('الرقم التسلسلي مطلوب');
  const info = db.prepare('INSERT INTO devices (serial,name,customer_id,location,gate_mode,created_at) VALUES (?,?,?,?,?,?)')
    .run(String(serial).trim(), name || `كاميرا ${serial}`, customer_id || null, location || null, gate_mode || 'whitelist', Date.now());
  audit(req.user, 'device_add', { serial });
  return withOnline(db.prepare('SELECT * FROM devices WHERE id=?').get(info.lastInsertRowid));
}));

app.patch('/api/devices/:id', requireAuth, wrap((req) => {
  const d = getDeviceFor(req, req.params.id);
  const b = req.body || {};
  const fields = ['name', 'location', 'gate_mode'];
  if (req.user.role === 'admin') fields.push('customer_id', 'serial');
  if (b.gate_mode && !['whitelist', 'all', 'manual'].includes(b.gate_mode)) throw bad('وضع البوابة غير صحيح');
  for (const f of fields) {
    if (b[f] !== undefined) db.prepare(`UPDATE devices SET ${f}=? WHERE id=?`).run(b[f] === '' ? null : b[f], d.id);
  }
  audit(req.user, 'device_update', b, { device_id: d.id, customer_id: d.customer_id });
  return withOnline(db.prepare('SELECT * FROM devices WHERE id=?').get(d.id));
}));

app.delete('/api/devices/:id', requireAdmin, wrap((req) => {
  db.prepare('DELETE FROM devices WHERE id=?').run(Number(req.params.id));
  audit(req.user, 'device_delete', { id: req.params.id });
  return { ok: true };
}));

app.post('/api/devices/:id/open', requireAuth, wrap((req) => {
  const d = getDeviceFor(req, req.params.id);
  try {
    return { ok: true, ...mq.sendOpenGate(d, req.user, 'manual') };
  } catch (e) {
    throw bad(e.message, 503);
  }
}));

// ---------------- قوائم اللوحات (مسموح / محظور) ----------------
function listCustomer(req, bodyCid) {
  if (req.user.role === 'admin') {
    const cid = Number(bodyCid || req.query.customer_id);
    if (!cid) throw bad('حدد العميل');
    return cid;
  }
  return req.user.customer_id;
}

app.get('/api/lists', requireAuth, wrap((req) => {
  const cid = scope(req);
  const w = []; const a = [];
  if (cid) { w.push('l.customer_id=?'); a.push(cid); }
  if (req.query.kind) { w.push('l.kind=?'); a.push(req.query.kind); }
  if (req.query.q) { w.push('(l.plate_key LIKE ? OR l.owner_name LIKE ?)'); a.push(`%${parsePlate(req.query.q).key}%`, `%${req.query.q}%`); }
  return db.prepare(`SELECT l.*, c.name AS customer_name,
      (SELECT MAX(ts) FROM plate_reads r WHERE r.customer_id=l.customer_id AND r.plate_key=l.plate_key) AS last_seen
    FROM plate_lists l LEFT JOIN customers c ON c.id=l.customer_id
    ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY l.created_at DESC`).all(...a).map((l) => ({ ...l, ...pick(parsePlate(l.plate_raw)) }));
}));
const pick = (p) => ({ display: p.display, display_ar: p.displayAr, country: p.country });

function upsertList(cid, b) {
  const p = parsePlate(b.plate);
  if (!p.key) throw bad('رقم اللوحة غير صحيح');
  if (!['allow', 'block'].includes(b.kind)) throw bad('النوع غير صحيح');
  db.prepare(`INSERT INTO plate_lists (customer_id,plate_key,plate_raw,kind,owner_name,phone,note,valid_until,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(customer_id,plate_key) DO UPDATE SET kind=excluded.kind, owner_name=excluded.owner_name, phone=excluded.phone,
      note=excluded.note, valid_until=excluded.valid_until, plate_raw=excluded.plate_raw`)
    .run(cid, p.key, String(b.plate).trim(), b.kind, b.owner_name || null, b.phone || null, b.note || null, b.valid_until || null, Date.now());
  return p;
}

app.post('/api/lists', requireAuth, wrap((req) => {
  const cid = listCustomer(req, req.body?.customer_id);
  const p = upsertList(cid, req.body || {});
  audit(req.user, 'list_upsert', { plate: p.key, kind: req.body.kind }, { customer_id: cid });
  return { ok: true, key: p.key };
}));

// استيراد جماعي: سطر لكل لوحة "اللوحة,اسم المالك,الجوال"
app.post('/api/lists/import', requireAuth, wrap((req) => {
  const cid = listCustomer(req, req.body?.customer_id);
  const kind = req.body?.kind === 'block' ? 'block' : 'allow';
  let n = 0; const errors = [];
  for (const line of String(req.body?.text || '').split(/\r?\n/)) {
    const [plate, owner_name, phone] = line.split(/[,;\t]/).map((s) => s?.trim());
    if (!plate) continue;
    try { upsertList(cid, { plate, owner_name, phone, kind }); n++; } catch { errors.push(plate); }
  }
  audit(req.user, 'list_import', { n, kind }, { customer_id: cid });
  return { ok: true, imported: n, errors };
}));

app.delete('/api/lists/:id', requireAuth, wrap((req) => {
  const l = db.prepare('SELECT * FROM plate_lists WHERE id=?').get(Number(req.params.id));
  if (!l || (req.user.role !== 'admin' && l.customer_id !== req.user.customer_id)) throw bad('غير موجود', 404);
  db.prepare('DELETE FROM plate_lists WHERE id=?').run(l.id);
  audit(req.user, 'list_delete', { plate: l.plate_key }, { customer_id: l.customer_id });
  return { ok: true };
}));

// ---------------- إدارة العملاء (للمدير فقط) ----------------
app.get('/api/admin/customers', requireAdmin, wrap(() => db.prepare(`SELECT c.*,
    (SELECT COUNT(*) FROM devices d WHERE d.customer_id=c.id) AS devices,
    (SELECT COUNT(*) FROM users u WHERE u.customer_id=c.id) AS users,
    (SELECT MAX(ts) FROM plate_reads r WHERE r.customer_id=c.id) AS last_read
  FROM customers c ORDER BY c.id DESC`).all()));

const CUSTOMER_FIELDS = ['name', 'phone', 'email', 'city', 'country', 'notes', 'active', 'subscription_until'];
app.post('/api/admin/customers', requireAdmin, wrap((req) => {
  const b = req.body || {};
  if (!b.name) throw bad('اسم العميل مطلوب');
  const info = db.prepare('INSERT INTO customers (name,phone,email,city,country,notes,subscription_until,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(b.name, b.phone || null, b.email || null, b.city || null, b.country || 'SA', b.notes || null, b.subscription_until || null, Date.now());
  const cid = Number(info.lastInsertRowid);
  // إنشاء حساب دخول للعميل مباشرة إن أُرسل اسم مستخدم
  if (b.username && b.password) createUser({ username: b.username, password: b.password, name: b.name, customer_id: cid });
  audit(req.user, 'customer_add', { name: b.name }, { customer_id: cid });
  return db.prepare('SELECT * FROM customers WHERE id=?').get(cid);
}));

app.patch('/api/admin/customers/:id', requireAdmin, wrap((req) => {
  const id = Number(req.params.id);
  for (const f of CUSTOMER_FIELDS) {
    if (req.body?.[f] !== undefined) db.prepare(`UPDATE customers SET ${f}=? WHERE id=?`).run(req.body[f] === '' ? null : req.body[f], id);
  }
  audit(req.user, 'customer_update', req.body, { customer_id: id });
  return db.prepare('SELECT * FROM customers WHERE id=?').get(id);
}));

app.delete('/api/admin/customers/:id', requireAdmin, wrap((req) => {
  db.prepare('DELETE FROM customers WHERE id=?').run(Number(req.params.id));
  audit(req.user, 'customer_delete', { id: req.params.id });
  return { ok: true };
}));

function createUser({ username, password, name, customer_id, role = 'customer' }) {
  const un = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9._@-]{3,40}$/.test(un)) throw bad('اسم المستخدم: حروف إنجليزية وأرقام فقط (3 أحرف على الأقل)');
  if (!password || String(password).length < 6) throw bad('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
  return db.prepare('INSERT INTO users (username,name,password_hash,role,customer_id,created_at) VALUES (?,?,?,?,?,?)')
    .run(un, name || un, hashPassword(password), role, role === 'admin' ? null : customer_id, Date.now());
}

app.get('/api/admin/users', requireAdmin, wrap(() => db.prepare(`SELECT u.id,u.username,u.name,u.role,u.customer_id,u.active,u.created_at,
    c.name AS customer_name FROM users u LEFT JOIN customers c ON c.id=u.customer_id ORDER BY u.id DESC`).all()));

app.post('/api/admin/users', requireAdmin, wrap((req) => {
  const b = req.body || {};
  if (b.role !== 'admin' && !b.customer_id) throw bad('حدد العميل');
  createUser(b);
  audit(req.user, 'user_add', { username: b.username, role: b.role });
  return { ok: true };
}));

app.patch('/api/admin/users/:id', requireAdmin, wrap((req) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  if (b.password) {
    if (String(b.password).length < 6) throw bad('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(b.password), id);
  }
  if (b.active !== undefined) {
    if (id === req.user.id) throw bad('لا يمكنك إيقاف حسابك');
    db.prepare('UPDATE users SET active=? WHERE id=?').run(b.active ? 1 : 0, id);
  }
  if (b.name !== undefined) db.prepare('UPDATE users SET name=? WHERE id=?').run(b.name, id);
  audit(req.user, 'user_update', { id, active: b.active, password: !!b.password });
  return { ok: true };
}));

app.delete('/api/admin/users/:id', requireAdmin, wrap((req) => {
  if (Number(req.params.id) === req.user.id) throw bad('لا يمكنك حذف حسابك');
  db.prepare('DELETE FROM users WHERE id=?').run(Number(req.params.id));
  return { ok: true };
}));

app.get('/api/admin/audit', requireAdmin, wrap(() => db.prepare(`SELECT a.*, u.username, c.name AS customer_name FROM audit_log a
  LEFT JOIN users u ON u.id=a.user_id LEFT JOIN customers c ON c.id=a.customer_id ORDER BY a.id DESC LIMIT 300`).all()));

app.get('/api/admin/system', requireAdmin, wrap(() => ({
  mqtt: { ...mq.state, url: config.mqtt.url, topics: { result: config.mqtt.topicResult, heartbeat: config.mqtt.topicHeartbeat, command: config.mqtt.topicCommand } },
  uptime: process.uptime(),
  node: process.version,
  dbSizeMB: +(fs.statSync(path.join(config.dataDir, 'arakom.db')).size / 1048576).toFixed(2),
  keepReadsDays: config.keepReadsDays,
})));

// ---------------- الواجهة ----------------
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));
app.get('/', (req, res) => res.redirect(!req.user ? '/login' : req.user.role === 'admin' ? '/admin' : '/app'));

// حذف القراءات والصور القديمة يومياً
function cleanup() {
  const cutoff = Date.now() - config.keepReadsDays * 864e5;
  for (const r of db.prepare('SELECT image FROM plate_reads WHERE ts<? AND image IS NOT NULL').all(cutoff)) {
    fs.rm(path.join(config.dataDir, 'images', r.image), { force: true }, () => {});
  }
  db.prepare('DELETE FROM plate_reads WHERE ts<?').run(cutoff);
}
setInterval(cleanup, 6 * 3600e3).unref();

// تنبيه عند انقطاع الأجهزة
const lastOnline = new Map();
setInterval(() => {
  for (const d of db.prepare('SELECT id,serial,customer_id,last_seen,name FROM devices').all()) {
    const on = isOnline(d);
    if (lastOnline.has(d.id) && lastOnline.get(d.id) !== on) events.publish('device_status', { id: d.id, serial: d.serial, name: d.name, online: on }, d.customer_id);
    lastOnline.set(d.id, on);
  }
}, 15e3).unref();

if (require.main === module) {
  mq.start();
  app.listen(config.port, () => console.log(`[web] لوحة التحكم تعمل على http://localhost:${config.port}`));
}

module.exports = app;
