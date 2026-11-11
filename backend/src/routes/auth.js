'use strict';
const express = require('express');
const { one, query, audit } = require('../db');
const { h, fail } = require('../http');
const { verifyPassword, hashPassword } = require('../services/passwords');
const { setSessionCookie, clearSessionCookie } = require('../services/auth');

const router = express.Router();

// حماية بسيطة من تخمين كلمات المرور: 10 محاولات خاطئة لكل IP خلال 15 دقيقة
const attempts = new Map();
setInterval(() => {
  const cutoff = Date.now() - 15 * 60e3;
  for (const [k, v] of attempts) if (v.t < cutoff) attempts.delete(k);
}, 60e3).unref();

router.post('/login', h(async (req, res) => {
  const key = req.ip;
  const a = attempts.get(key) || { n: 0, t: Date.now() };
  if (a.n >= 10) fail(429, 'محاولات كثيرة، حاول بعد 15 دقيقة');

  const { username, password, portal } = req.body || {};
  const u = await one(`SELECT u.*, t.status AS tenant_status FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id
    WHERE u.username = $1`, [String(username || '').trim().toLowerCase()]);
  if (!u || !verifyPassword(password || '', u.password_hash)) {
    a.n++;
    attempts.set(key, a);
    fail(401, 'اسم المستخدم أو كلمة المرور غير صحيحة');
  }
  // كل بوابة دخول خاصة بنوع حسابها
  if (portal === 'admin' && u.role !== 'super_admin') fail(403, 'هذه البوابة خاصة بإدارة أراكم. ادخل من app.arakom.sa');
  if (portal === 'app' && u.role === 'super_admin') fail(403, 'حساب الإدارة يدخل من admin.arakom.sa');
  if (!u.active) fail(403, 'الحساب موقوف');
  if (u.role !== 'super_admin' && u.tenant_status !== 'active') fail(403, 'حساب المجمع موقوف، تواصل مع إدارة أراكم');

  attempts.delete(key);
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [u.id]);
  setSessionCookie(res, u);
  await audit(u, 'login', { ip: req.ip });
  return { ok: true, role: u.role };
}));

router.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', h(async (req) => {
  if (!req.user) fail(401, 'يجب تسجيل الدخول');
  const { id, username, full_name, role, tenant_id, tenant_name } = req.user;
  return { id, username, full_name, role, tenant_id, tenant_name };
}));

router.post('/password', h(async (req) => {
  if (!req.user) fail(401, 'يجب تسجيل الدخول');
  const { current, next } = req.body || {};
  const u = await one('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!verifyPassword(current || '', u.password_hash)) fail(400, 'كلمة المرور الحالية غير صحيحة');
  if (!next || String(next).length < 8) fail(400, 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل');
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashPassword(next), req.user.id]);
  await audit(req.user, 'password_change');
  return { ok: true };
}));

module.exports = router;
