'use strict';
const crypto = require('node:crypto');
const config = require('./config');
const { db } = require('./db');

const COOKIE = 'arakom_session';
const MAX_AGE = 30 * 864e5; // 30 يوماً

function sign(data) {
  return crypto.createHmac('sha256', config.sessionSecret).update(data).digest('base64url');
}

function createToken(userId) {
  const body = Buffer.from(JSON.stringify({ u: userId, e: Date.now() + MAX_AGE })).toString('base64url');
  return `${body}.${sign(body)}`;
}

function readToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const exp = sign(body);
  if (!sig || sig.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.e > Date.now() ? p.u : null;
  } catch {
    return null;
  }
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* تجاهل */ }
    }
  }
  return out;
}

function setSession(res, userId) {
  res.cookie(COOKIE, createToken(userId), {
    httpOnly: true, sameSite: 'lax', secure: config.secureCookies, maxAge: MAX_AGE,
  });
}

function clearSession(res) {
  res.clearCookie(COOKIE);
}

function loadUser(req, _res, next) {
  const uid = readToken(parseCookies(req.headers.cookie)[COOKIE]);
  if (uid) {
    const u = db.prepare(`SELECT u.id,u.username,u.name,u.role,u.customer_id,u.active,
        c.name AS customer_name, c.active AS customer_active
      FROM users u LEFT JOIN customers c ON c.id=u.customer_id WHERE u.id=?`).get(uid);
    if (u && u.active && (u.role === 'admin' || u.customer_active)) req.user = u;
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'صلاحية المدير مطلوبة' });
  next();
}

module.exports = { setSession, clearSession, loadUser, requireAuth, requireAdmin };
