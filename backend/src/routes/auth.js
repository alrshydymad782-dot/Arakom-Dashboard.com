'use strict';
/*
 * الدخول
 *  - الإدارة: اسم المستخدم وكلمة المرور (لوحة admin.arakom.sa)
 *  - العميل: رابطه الخاص فقط (app.arakom.sa/c/{token}) — بدون اسم مستخدم أو كلمة مرور
 */
const express = require('express');
const { one, query, audit } = require('../db');
const { h, fail } = require('../http');
const { verifyPassword, hashPassword } = require('../services/passwords');
const { setAdminSession, setTenantSession, clearAdminSession, clearTenantSession } = require('../services/auth');

const router = express.Router();

// حماية من التخمين: 10 محاولات خاطئة لكل IP خلال 15 دقيقة
const attempts = new Map();
setInterval(() => {
  const cutoff = Date.now() - 15 * 60e3;
  for (const [k, v] of attempts) if (v.t < cutoff) attempts.delete(k);
}, 60e3).unref();
function guard(key) {
  const a = attempts.get(key) || { n: 0, t: Date.now() };
  if (a.n >= 10) fail(429, 'محاولات كثيرة، حاول بعد 15 دقيقة');
  return () => { a.n++; attempts.set(key, a); };
}

// دخول الإدارة
router.post('/login', h(async (req, res) => {
  const bad = guard(`pw:${req.ip}`);
  const { username, password } = req.body || {};
  const u = await one("SELECT * FROM users WHERE username = $1 AND role = 'super_admin'", [String(username || '').trim().toLowerCase()]);
  if (!u || !verifyPassword(password || '', u.password_hash)) { bad(); fail(401, 'اسم المستخدم أو كلمة المرور غير صحيحة'); }
  if (!u.active) fail(403, 'الحساب موقوف');
  attempts.delete(`pw:${req.ip}`);
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [u.id]);
  setAdminSession(res, u);
  await audit(u, 'login', { ip: req.ip });
  return { ok: true };
}));

// فتح لوحة العميل من رابطه الخاص
router.post('/link', h(async (req, res) => {
  const bad = guard(`link:${req.ip}`);
  const token = String(req.body?.token || '');
  const t = /^[a-f0-9]{20,64}$/.test(token) ? await one('SELECT id, name, access_token FROM tenants WHERE access_token = $1', [token]) : null;
  if (!t) { bad(); fail(404, 'الرابط غير صحيح أو تم تغييره. تواصل مع أراكم للحصول على رابطك'); }
  setTenantSession(res, t);
  return { ok: true, tenant_name: t.name };
}));

router.post('/logout', (req, res) => {
  if (req.query.portal === 'app') clearTenantSession(res); else clearAdminSession(res);
  res.json({ ok: true });
});

// portal=admin للإدارة، portal=app للعميل
router.get('/me', h(async (req) => {
  const u = req.query.portal === 'app' ? req.tenantUser : req.adminUser;
  if (!u) fail(401, 'يجب تسجيل الدخول');
  const { id, username, full_name, role, tenant_id, tenant_name } = u;
  return { id, username, full_name, role, tenant_id, tenant_name };
}));

// تغيير كلمة مرور الإدارة
router.post('/password', h(async (req) => {
  if (!req.adminUser) fail(401, 'يجب تسجيل الدخول');
  const { current, next } = req.body || {};
  const u = await one('SELECT password_hash FROM users WHERE id = $1', [req.adminUser.id]);
  if (!verifyPassword(current || '', u.password_hash)) fail(400, 'كلمة المرور الحالية غير صحيحة');
  if (!next || String(next).length < 10) fail(400, 'كلمة المرور الجديدة 10 أحرف على الأقل');
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashPassword(next), req.adminUser.id]);
  await audit(req.adminUser, 'password_change');
  return { ok: true };
}));

module.exports = router;
