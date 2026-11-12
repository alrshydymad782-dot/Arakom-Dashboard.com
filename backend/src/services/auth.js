'use strict';
/*
 * الجلسات
 *  - الإدارة (أنت): اسم مستخدم + كلمة مرور ← كوكي arakom_admin
 *  - العميل: يفتح رابطه الخاص app.arakom.sa/c/{token} ← كوكي arakom_tenant
 *    إن أعادت الإدارة توليد الرابط، تتوقف كل الجلسات القديمة للعميل فوراً
 */
const crypto = require('node:crypto');
const config = require('../config');
const { one } = require('../db');

const ADMIN_COOKIE = 'arakom_admin';
const TENANT_COOKIE = 'arakom_tenant';
const ADMIN_MAX_AGE = 14 * 864e5;
const TENANT_MAX_AGE = 365 * 864e5;

const sign = (data) => crypto.createHmac('sha256', config.jwtSecret).update(data).digest('base64url');
// بصمة الرابط: تتغير عند توليد رابط جديد فتُلغى الجلسات القديمة
const linkStamp = (token) => crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 16);

function makeToken(payload, maxAge) {
  const body = Buffer.from(JSON.stringify({ ...payload, e: Date.now() + maxAge })).toString('base64url');
  return `${body}.${sign(body)}`;
}

function readToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = sign(body);
  if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.e > Date.now() ? p : null;
  } catch {
    return null;
  }
}

function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* تجاهل */ }
    }
  }
  return out;
}

const cookieOpts = (maxAge) => ({ httpOnly: true, sameSite: 'lax', secure: config.secureCookies, maxAge, path: '/' });

async function adminFromToken(token) {
  const p = readToken(token);
  if (!p?.u) return null;
  const u = await one("SELECT id, username, full_name, role, active FROM users WHERE id = $1 AND role = 'super_admin'", [p.u]);
  return u?.active ? { ...u, tenant_id: null } : null;
}

// العميل يُمثَّل كمستخدم افتراضي مرتبط بمجمعه
async function tenantFromToken(token) {
  const p = readToken(token);
  if (!p?.t) return null;
  const t = await one('SELECT id, name, status, access_token FROM tenants WHERE id = $1', [p.t]);
  if (!t || linkStamp(t.access_token) !== p.s) return null;
  return { id: null, role: 'tenant_admin', tenant_id: t.id, tenant_name: t.name, tenant_status: t.status, full_name: t.name, username: null };
}

async function usersFromCookieHeader(header) {
  const c = parseCookies(header);
  const [admin, tenant] = await Promise.all([adminFromToken(c[ADMIN_COOKIE]), tenantFromToken(c[TENANT_COOKIE])]);
  return { admin, tenant };
}

function setAdminSession(res, user) {
  res.cookie(ADMIN_COOKIE, makeToken({ u: user.id }, ADMIN_MAX_AGE), cookieOpts(ADMIN_MAX_AGE));
}
function setTenantSession(res, tenant) {
  res.cookie(TENANT_COOKIE, makeToken({ t: tenant.id, s: linkStamp(tenant.access_token) }, TENANT_MAX_AGE), cookieOpts(TENANT_MAX_AGE));
}
const clearAdminSession = (res) => res.clearCookie(ADMIN_COOKIE, { path: '/' });
const clearTenantSession = (res) => res.clearCookie(TENANT_COOKIE, { path: '/' });

module.exports = { usersFromCookieHeader, setAdminSession, setTenantSession, clearAdminSession, clearTenantSession, parseCookies };
