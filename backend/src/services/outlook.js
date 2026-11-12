'use strict';
/*
 * إرسال البريد من حساب Outlook عبر Microsoft Graph
 * ------------------------------------------------------------
 * مايكروسوفت أوقفت الدخول بكلمة المرور للبرامج (SMTP Basic Auth)، والطريقة المعتمدة هي OAuth:
 *   1) المدير يضغط "ربط بريد Outlook" فيظهر رمز قصير
 *   2) يفتح microsoft.com/devicelogin ويسجل الدخول بحساب Outlook ويكتب الرمز (Device Code Flow)
 *   3) نحفظ "رمز التجديد" (refresh token) ونستخدمه لإرسال الرسائل؛ لا نحفظ أي كلمة مرور
 * يعمل مع حسابات Outlook.com/Hotmail الشخصية وحسابات Microsoft 365 للشركات.
 */
const config = require('../config');
const { one, query } = require('../db');

const KEY = 'outlook_mail';
const SCOPE = 'offline_access https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read';
const loginBase = () => `${config.outlook.loginUrl}/${config.outlook.tenant}/oauth2/v2.0`;

let cached = null; // { email, refresh_token } في الذاكرة
let accessToken = null;
let accessExpires = 0;
let pendingDevice = null; // جلسة الربط الجارية

async function load() {
  const row = await one('SELECT value FROM app_settings WHERE key = $1', [KEY]);
  cached = row?.value || null;
  return cached;
}
async function save(value) {
  await query(`INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [KEY, value]);
  cached = value;
}

const configured = () => !!config.outlook.clientId;
const connected = () => !!cached?.refresh_token;

async function postForm(url, params) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

// الخطوة 1: بدء الربط — يعيد الرمز ورابط مايكروسوفت
async function startConnect() {
  if (!configured()) throw Object.assign(new Error('أضف MS_CLIENT_ID في إعدادات السيرفر أولاً (من تسجيل التطبيق في Microsoft Entra)'), { status: 400 });
  const r = await postForm(`${loginBase()}/devicecode`, { client_id: config.outlook.clientId, scope: SCOPE });
  if (!r.ok) throw Object.assign(new Error(`تعذر بدء الربط مع مايكروسوفت: ${r.body.error_description || r.status}`), { status: 502 });
  pendingDevice = { device_code: r.body.device_code, expires: Date.now() + r.body.expires_in * 1000, interval: r.body.interval || 5 };
  return { user_code: r.body.user_code, verification_uri: r.body.verification_uri, expires_in: r.body.expires_in, interval: pendingDevice.interval };
}

// الخطوة 2: التحقق هل أكمل المدير الدخول في مايكروسوفت
async function pollConnect() {
  if (!pendingDevice) return { status: 'none' };
  if (Date.now() > pendingDevice.expires) { pendingDevice = null; return { status: 'expired' }; }
  const r = await postForm(`${loginBase()}/token`, {
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: config.outlook.clientId, device_code: pendingDevice.device_code,
  });
  if (!r.ok) {
    const err = r.body.error;
    if (err === 'authorization_pending' || err === 'slow_down') return { status: 'pending' };
    pendingDevice = null;
    if (err === 'expired_token') return { status: 'expired' };
    if (err === 'authorization_declined') return { status: 'declined' };
    return { status: 'error', message: r.body.error_description || err };
  }
  pendingDevice = null;
  accessToken = r.body.access_token;
  accessExpires = Date.now() + (r.body.expires_in - 120) * 1000;
  // معرفة عنوان البريد المربوط
  const me = await fetch(`${config.outlook.graphUrl}/me`, { headers: { Authorization: `Bearer ${accessToken}` } }).then((x) => x.json()).catch(() => ({}));
  const email = me.mail || me.userPrincipalName || null;
  await save({ email, name: me.displayName || null, refresh_token: r.body.refresh_token, connected_at: new Date().toISOString() });
  return { status: 'connected', email };
}

async function getAccessToken() {
  if (accessToken && Date.now() < accessExpires) return accessToken;
  if (!cached) await load();
  if (!cached?.refresh_token) throw new Error('بريد Outlook غير مربوط');
  const r = await postForm(`${loginBase()}/token`, {
    grant_type: 'refresh_token', client_id: config.outlook.clientId, refresh_token: cached.refresh_token, scope: SCOPE,
  });
  if (!r.ok) {
    // انتهت صلاحية الربط (مثلاً تغيرت كلمة مرور الحساب): يلزم إعادة الربط
    await save({ ...cached, refresh_token: null, error: r.body.error_description || r.body.error, failed_at: new Date().toISOString() });
    throw new Error(`انتهى ربط بريد Outlook، أعد الربط من لوحة الإدارة (${r.body.error || r.status})`);
  }
  accessToken = r.body.access_token;
  accessExpires = Date.now() + (r.body.expires_in - 120) * 1000;
  // مايكروسوفت قد تعطي رمز تجديد جديداً: نحفظه
  if (r.body.refresh_token && r.body.refresh_token !== cached.refresh_token) await save({ ...cached, refresh_token: r.body.refresh_token });
  return accessToken;
}

async function sendMail(to, subject, html, text) {
  const token = await getAccessToken();
  const res = await fetch(`${config.outlook.graphUrl}/me/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: { subject, body: { contentType: 'HTML', content: html }, toRecipients: [{ emailAddress: { address: to } }] },
      saveToSentItems: false,
    }),
  });
  if (res.status !== 202 && !res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error(`فشل إرسال البريد عبر Outlook: ${b.error?.message || res.status}`);
  }
  void text;
}

async function disconnect() {
  await query('DELETE FROM app_settings WHERE key = $1', [KEY]);
  cached = null;
  accessToken = null;
}

async function status() {
  if (!cached) await load();
  return {
    configured: configured(),
    connected: connected(),
    email: cached?.email || null,
    name: cached?.name || null,
    connected_at: cached?.connected_at || null,
    error: cached && !cached.refresh_token ? cached.error || 'انتهى الربط' : null,
  };
}

module.exports = { load, startConnect, pollConnect, sendMail, disconnect, status, connected };
