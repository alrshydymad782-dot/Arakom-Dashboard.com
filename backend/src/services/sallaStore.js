'use strict';
/*
 * الاتصال بمتجر أراكم على سلة (Merchant API)
 * ------------------------------------------------------------
 * - صلاحية الوصول (Access Token) ترسلها سلة تلقائياً بحدث app.store.authorize عند تثبيت تطبيق أراكم على متجرك
 * - البحث عن عميل في المتجر: GET /customers?keyword=... (يبحث في الجوال والاسم والبريد)
 * - تجديد الصلاحية قبل انتهائها عبر refresh_token
 */
const config = require('../config');
const { one, query } = require('../db');
const { phoneKey, normEmail, toLatinDigits } = require('./identity');

async function getTokenRow() {
  return one('SELECT * FROM salla_tokens WHERE id = 1');
}

async function saveTokens({ access_token: accessToken, refresh_token: refreshToken, expires, scope, merchantId, merchantName }) {
  // expires من سلة: وقت انتهاء بالثواني (unix)، أو عدد ثوانٍ متبقية
  let expiresAt = null;
  const e = Number(expires);
  if (Number.isFinite(e) && e > 0) expiresAt = new Date(e > 1e9 ? e * 1000 : Date.now() + e * 1000);
  await query(`INSERT INTO salla_tokens (id, merchant_id, merchant_name, access_token, refresh_token, scope, expires_at, updated_at)
    VALUES (1, $1, $2, $3, $4, $5, $6, now())
    ON CONFLICT (id) DO UPDATE SET merchant_id = COALESCE(EXCLUDED.merchant_id, salla_tokens.merchant_id),
      merchant_name = COALESCE(EXCLUDED.merchant_name, salla_tokens.merchant_name), access_token = EXCLUDED.access_token,
      refresh_token = COALESCE(EXCLUDED.refresh_token, salla_tokens.refresh_token), scope = COALESCE(EXCLUDED.scope, salla_tokens.scope),
      expires_at = EXCLUDED.expires_at, updated_at = now()`,
  [merchantId ? String(merchantId) : null, merchantName || null, accessToken, refreshToken || null, scope || null, expiresAt]);
}

async function refreshIfNeeded(row) {
  const soon = row.expires_at && new Date(row.expires_at).getTime() - Date.now() < 24 * 3600e3;
  if (!soon || !row.refresh_token || !config.salla.clientId || !config.salla.clientSecret) return row;
  const res = await fetch(config.salla.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: row.refresh_token,
      client_id: config.salla.clientId, client_secret: config.salla.clientSecret,
    }),
  });
  if (!res.ok) {
    console.error('[salla] فشل تجديد صلاحية الوصول للمتجر', res.status);
    return row;
  }
  const t = await res.json();
  await saveTokens({ access_token: t.access_token, refresh_token: t.refresh_token, expires: t.expires_in, scope: t.scope });
  return getTokenRow();
}

async function connected() {
  return !!(await getTokenRow());
}

// ذاكرة مؤقتة قصيرة لتقليل الطلبات على سلة
const cache = new Map();
const CACHE_MS = 5 * 60e3;

/**
 * البحث عن عميل في متجر أراكم بالبريد أو الجوال (مطابقة تامة)
 * @returns {Promise<{id,name,email,phone}|null>} أو يرمي خطأ إن تعذر الاتصال بسلة
 */
async function findCustomer(identifier) {
  const raw = toLatinDigits(String(identifier || '').trim());
  const email = normEmail(raw);
  const key = email ? null : phoneKey(raw);
  if (!email && !key) return null;
  const cacheKey = email || key;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.t < CACHE_MS) return hit.v;

  let row = await getTokenRow();
  if (!row) throw Object.assign(new Error('متجر سلة غير مربوط بعد'), { status: 503, code: 'SALLA_NOT_CONNECTED' });
  row = await refreshIfNeeded(row);

  const url = `${config.salla.apiUrl}/customers?${new URLSearchParams({ keyword: email || key })}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${row.access_token}`, Accept: 'application/json' } });
  if (!res.ok) {
    console.error('[salla] فشل البحث عن العميل', res.status);
    throw Object.assign(new Error('تعذر التحقق من حسابك في المتجر حالياً، حاول بعد قليل'), { status: 503 });
  }
  const body = await res.json();
  const list = Array.isArray(body.data) ? body.data : [];
  // البحث في سلة جزئي، لذلك نتحقق من المطابقة التامة للبريد أو الجوال
  const c = list.find((x) => (email && normEmail(x.email) === email)
    || (key && phoneKey(`${x.mobile_code || ''}${x.mobile || ''}`) === key));
  const v = c ? {
    id: String(c.id),
    name: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.name || null,
    email: normEmail(c.email),
    phone: c.mobile ? `${c.mobile_code || ''}${c.mobile}` : null,
  } : null;
  cache.set(cacheKey, { t: Date.now(), v });
  return v;
}

async function status() {
  const row = await getTokenRow();
  if (!row) return { connected: false };
  return { connected: true, merchant_id: row.merchant_id, merchant_name: row.merchant_name, expires_at: row.expires_at, scope: row.scope, updated_at: row.updated_at, can_refresh: !!(config.salla.clientId && row.refresh_token) };
}

module.exports = { saveTokens, findCustomer, connected, status, _cache: cache };
