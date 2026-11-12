'use strict';
// إنشاء حسابات الدخول: يدخل المستخدم بالبريد أو الجوال (اسم المستخدم داخلي تلقائي)
const { pool } = require('../db');
const { fail } = require('../http');
const { hashPassword } = require('./passwords');
const { phoneKey, normEmail, autoUsername, NO_PASSWORD } = require('./identity');

/**
 * @param {object} c اتصال قاعدة البيانات (أو pool)
 * @param {object} p { tenantId, role, full_name, email, phone, password }
 * password اختيارية: بدونها يدخل المستخدم برمز يُرسل لبريده
 */
async function createUser(c, p) {
  const email = p.email ? normEmail(p.email) : null;
  if (p.email && !email) fail(400, 'البريد الإلكتروني غير صحيح');
  const key = p.phone ? phoneKey(p.phone) : null;
  if (p.phone && !key) fail(400, 'رقم الجوال غير صحيح');
  if (!email && !key) fail(400, 'أدخل البريد الإلكتروني أو رقم الجوال لتسجيل الدخول');
  if (p.password && String(p.password).length < 8) fail(400, 'كلمة المرور 8 أحرف على الأقل');
  if (!p.password && !email && !p.allowPasswordless) fail(400, 'بدون كلمة مرور يجب إدخال البريد الإلكتروني (لإرسال رمز الدخول)');

  const dupe = (await c.query('SELECT 1 FROM users WHERE ($1::text IS NOT NULL AND lower(email) = $1) OR ($2::text IS NOT NULL AND phone_key = $2)', [email, key])).rows[0];
  if (dupe) fail(409, 'يوجد حساب مسجل بنفس البريد أو الجوال');

  const r = await (c || pool).query(`INSERT INTO users (tenant_id, username, full_name, email, phone, phone_key, password_hash, role)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, username, full_name, email, phone, role, active`,
  [p.role === 'super_admin' ? null : p.tenantId, autoUsername(email, p.phone), p.full_name || null, email, p.phone || null, key,
    p.password ? hashPassword(p.password) : NO_PASSWORD, p.role]);
  return r.rows[0];
}

module.exports = { createUser };
