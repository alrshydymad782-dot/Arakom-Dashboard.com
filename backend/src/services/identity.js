'use strict';
// التعرف على المستخدم من البريد الإلكتروني أو رقم الجوال أو اسم المستخدم
const crypto = require('node:crypto');
const { one } = require('../db');

const toLatinDigits = (s) => String(s || '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));

// آخر 9 أرقام من الجوال: 0551234567 و +966551234567 و 966551234567 كلها = 551234567
function phoneKey(phone) {
  const d = toLatinDigits(phone).replace(/\D/g, '');
  return d.length >= 9 ? d.slice(-9) : null;
}

const normEmail = (e) => {
  const v = String(e || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
};

async function findUser(identifier) {
  const id = toLatinDigits(String(identifier || '').trim());
  if (!id) return null;
  const email = normEmail(id);
  if (email) return one('SELECT * FROM users WHERE lower(email) = $1', [email]);
  if (/^[+\d\s-]{9,}$/.test(id)) {
    const key = phoneKey(id);
    if (key) {
      const u = await one('SELECT * FROM users WHERE phone_key = $1', [key]);
      if (u) return u;
    }
  }
  return one('SELECT * FROM users WHERE username = $1', [id.toLowerCase()]);
}

// اسم مستخدم داخلي تلقائي (لا يحتاجه العميل لأنه يدخل بالبريد أو الجوال)
function autoUsername(email, phone) {
  const base = (email ? email.split('@')[0] : `u${phoneKey(phone) || ''}`).toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 24) || 'user';
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

// كلمة مرور غير قابلة للاستخدام: الحساب يدخل برمز البريد حتى يعيّن له المدير كلمة مرور
const NO_PASSWORD = 'none$';

module.exports = { phoneKey, normEmail, findUser, autoUsername, toLatinDigits, NO_PASSWORD };
