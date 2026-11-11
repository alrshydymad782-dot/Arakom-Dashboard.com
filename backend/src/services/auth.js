'use strict';
const crypto = require('node:crypto');
const config = require('../config');
const { one } = require('../db');

const COOKIE = 'arakom_session';
const MAX_AGE_MS = 14 * 864e5;

const sign = (data) => crypto.createHmac('sha256', config.jwtSecret).update(data).digest('base64url');

function createToken(user) {
  const body = Buffer.from(JSON.stringify({ u: user.id, r: user.role, e: Date.now() + MAX_AGE_MS })).toString('base64url');
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

async function loadUser(id) {
  const u = await one(`SELECT u.id, u.username, u.full_name, u.role, u.tenant_id, u.active,
      t.name AS tenant_name, t.status AS tenant_status
    FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id WHERE u.id = $1`, [id]);
  if (!u || !u.active) return null;
  return u;
}

async function userFromCookieHeader(header) {
  const p = readToken(parseCookies(header)[COOKIE]);
  return p ? loadUser(p.u) : null;
}

function setSessionCookie(res, user) {
  res.cookie(COOKIE, createToken(user), {
    httpOnly: true, sameSite: 'lax', secure: config.secureCookies, maxAge: MAX_AGE_MS, path: '/',
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { path: '/', ...(config.cookieDomain ? { domain: config.cookieDomain } : {}) });
}

module.exports = { COOKIE, createToken, readToken, parseCookies, loadUser, userFromCookieHeader, setSessionCookie, clearSessionCookie };
