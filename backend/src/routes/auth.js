'use strict';
/*
 * تسجيل الدخول
 * - بالبريد الإلكتروني أو رقم الجوال (أو اسم المستخدم) + كلمة المرور
 * - أو برمز يُرسل إلى البريد: يستخدم العميل نفس البريد المسجل في متجر أراكم على سلة
 */
const express = require('express');
const crypto = require('node:crypto');
const config = require('../config');
const { one, query, audit } = require('../db');
const { h, fail } = require('../http');
const { verifyPassword, hashPassword } = require('../services/passwords');
const { setSessionCookie, clearSessionCookie } = require('../services/auth');
const { findUser } = require('../services/identity');
const mailer = require('../services/mailer');

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

const codesEnabled = () => mailer.enabled() || (!config.isProd && config.devLoginCodes);

async function checkAccount(u, portal) {
  if (portal === 'admin' && u.role !== 'super_admin') fail(403, 'هذه البوابة خاصة بإدارة أراكم. ادخل من app.arakom.sa');
  if (portal === 'app' && u.role === 'super_admin') fail(403, 'حساب الإدارة يدخل من admin.arakom.sa');
  if (!u.active) fail(403, 'الحساب موقوف');
  if (u.role !== 'super_admin') {
    const t = await one('SELECT status FROM tenants WHERE id = $1', [u.tenant_id]);
    if (t?.status !== 'active') fail(403, 'حساب المجمع موقوف، تواصل مع إدارة أراكم');
  }
}

async function startSession(req, res, u, method) {
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [u.id]);
  setSessionCookie(res, u);
  await audit(u, 'login', { ip: req.ip, method });
  return { ok: true, role: u.role };
}

router.get('/options', (_req, res) => res.json({ emailCode: codesEnabled() }));

// الدخول بكلمة المرور
router.post('/login', h(async (req, res) => {
  const bad = guard(`pw:${req.ip}`);
  const { identifier, username, password, portal } = req.body || {};
  const u = await findUser(identifier ?? username);
  if (!u || !verifyPassword(password || '', u.password_hash)) {
    bad();
    fail(401, 'البريد/الجوال أو كلمة المرور غير صحيحة');
  }
  await checkAccount(u, portal);
  attempts.delete(`pw:${req.ip}`);
  return startSession(req, res, u, 'password');
}));

const hashCode = (code, userId) => crypto.createHmac('sha256', config.jwtSecret).update(`${userId}:${code}`).digest('hex');

// طلب رمز دخول إلى البريد. الرد واحد دائماً حتى لا يُعرف هل البريد مسجل أم لا
router.post('/code/request', h(async (req) => {
  if (!codesEnabled()) fail(400, 'الدخول بالرمز غير مفعل، استخدم كلمة المرور');
  const bad = guard(`code:${req.ip}`);
  bad(); // كل طلب يُحسب ضمن الحد
  const u = await findUser(req.body?.identifier);
  if (u?.email && u.active) {
    const recent = await one("SELECT 1 FROM login_codes WHERE user_id = $1 AND created_at > now() - interval '60 seconds'", [u.id]);
    if (!recent) {
      const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
      await query("INSERT INTO login_codes (user_id, code_hash, expires_at) VALUES ($1, $2, now() + interval '10 minutes')", [u.id, hashCode(code, u.id)]);
      await mailer.sendLoginCode(u.email, code).catch((e) => console.error('[mail]', e.message));
    }
  }
  return { ok: true, message: 'إن كان البريد أو الجوال مسجلاً لدينا فستصلك رسالة على البريد فيها رمز الدخول' };
}));

// التحقق من الرمز
router.post('/code/verify', h(async (req, res) => {
  const bad = guard(`verify:${req.ip}`);
  const { identifier, code, portal } = req.body || {};
  const u = await findUser(identifier);
  const row = u && await one(`SELECT * FROM login_codes WHERE user_id = $1 AND used_at IS NULL AND expires_at > now()
    ORDER BY id DESC LIMIT 1`, [u.id]);
  const given = String(code || '').replace(/\D/g, '');
  if (!row || row.attempts >= 5) { bad(); fail(401, 'الرمز غير صحيح أو انتهت صلاحيته، اطلب رمزاً جديداً'); }
  const ok = given.length === 6 && crypto.timingSafeEqual(Buffer.from(hashCode(given, u.id)), Buffer.from(row.code_hash));
  if (!ok) {
    await query('UPDATE login_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
    bad();
    fail(401, 'الرمز غير صحيح');
  }
  await query('UPDATE login_codes SET used_at = now() WHERE id = $1', [row.id]);
  await checkAccount(u, portal);
  return startSession(req, res, u, 'email_code');
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
  // من دخل برمز البريد ولا يملك كلمة مرور بعد يستطيع تعيينها مباشرة
  const hasPassword = String(u.password_hash).startsWith('scrypt$');
  if (hasPassword && !verifyPassword(current || '', u.password_hash)) fail(400, 'كلمة المرور الحالية غير صحيحة');
  if (!next || String(next).length < 8) fail(400, 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل');
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashPassword(next), req.user.id]);
  await audit(req.user, 'password_change');
  return { ok: true };
}));

module.exports = router;
