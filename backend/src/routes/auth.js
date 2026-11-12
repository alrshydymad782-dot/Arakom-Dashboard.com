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
const sallaStore = require('../services/sallaStore');
const { tenantForStoreCustomer } = require('../services/provision');

const notInStore = () => Object.assign(new Error('هذا الحساب غير مسجل في متجر أراكم. سجّل في المتجر أولاً بنفس البريد أو الجوال ثم ادخل هنا'), {
  status: 404, extra: { not_in_store: true, store_url: config.salla.storeUrl || null },
});

/*
 * التحقق من أن العميل مسجل في متجر أراكم على سلة (نفس الحساب).
 * يُطبق على عملاء المجمعات فقط (الإدارة وحراس البوابات لا يحتاجون حساباً في المتجر).
 * يعيد عميل سلة أو null إن كان المتجر غير مربوط بعد (فيُسمح للحسابات الموجودة لدينا مؤقتاً).
 */
async function storeCustomerFor(identifier) {
  try {
    const cust = await sallaStore.findCustomer(identifier);
    if (!cust) throw notInStore();
    return cust;
  } catch (e) {
    if (e.code === 'SALLA_NOT_CONNECTED') return null;
    throw e;
  }
}

const maskEmail = (e) => {
  const [u, d] = String(e).split('@');
  return `${u.slice(0, 2)}${'*'.repeat(Math.max(1, u.length - 2))}@${d}`;
};

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

router.get('/options', (_req, res) => res.json({ emailCode: codesEnabled(), storeLogin: config.salla.storeLoginOnly, storeUrl: config.salla.storeUrl || null }));

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
  if (config.salla.storeLoginOnly && u.role === 'tenant_admin') await storeCustomerFor(u.email || u.phone);
  attempts.delete(`pw:${req.ip}`);
  return startSession(req, res, u, 'password');
}));

const hashCode = (code, userId) => crypto.createHmac('sha256', config.jwtSecret).update(`${userId}:${code}`).digest('hex');

// طلب رمز دخول (مثل الدخول في المتجر: البريد أو الجوال ثم رمز)
router.post('/code/request', h(async (req) => {
  if (!codesEnabled()) fail(400, 'الدخول بالرمز غير مفعل، استخدم كلمة المرور');
  guard(`code:${req.ip}`)(); // كل طلب يُحسب ضمن الحد
  const { identifier, portal } = req.body || {};
  let u = await findUser(identifier);
  let email = u?.email || null;

  if (portal !== 'admin' && config.salla.storeLoginOnly && (!u || u.role === 'tenant_admin')) {
    const cust = await storeCustomerFor(identifier);
    if (!cust && !u) throw notInStore();
    if (cust) {
      if (!u && !cust.email) fail(400, 'لا يوجد بريد إلكتروني في حسابك بالمتجر لإرسال رمز الدخول. أضف بريدك في حسابك بالمتجر ثم حاول مرة أخرى');
      // أول دخول لعميل المتجر: يُنشأ حسابه تلقائياً بنفس بياناته في المتجر
      if (!u) {
        await tenantForStoreCustomer(cust);
        u = await findUser(cust.email || identifier) || await findUser(identifier);
      }
      if (u && !u.email && cust.email) {
        await query('UPDATE users SET email = $2 WHERE id = $1 AND email IS NULL', [u.id, cust.email]).catch(() => {});
        u.email = cust.email;
      }
      email = u?.email || cust.email;
    }
  }

  // الإدارة: لا نكشف هل الحساب موجود
  if (!u || !u.active) return { ok: true, message: 'إن كان الحساب مسجلاً فستصلك رسالة على البريد فيها رمز الدخول' };
  if (!email) fail(400, 'لا يوجد بريد إلكتروني في حسابك لإرسال الرمز. أضف بريدك في حسابك بالمتجر ثم حاول مرة أخرى');

  const recent = await one("SELECT 1 FROM login_codes WHERE user_id = $1 AND created_at > now() - interval '60 seconds'", [u.id]);
  if (!recent) {
    const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
    await query("INSERT INTO login_codes (user_id, code_hash, expires_at) VALUES ($1, $2, now() + interval '10 minutes')", [u.id, hashCode(code, u.id)]);
    await mailer.sendLoginCode(email, code).catch((e) => console.error('[mail]', e.message));
  }
  return { ok: true, message: `أرسلنا رمز الدخول إلى بريدك ${maskEmail(email)}` };
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
