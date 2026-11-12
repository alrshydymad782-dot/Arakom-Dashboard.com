'use strict';
// إرسال البريد (رموز الدخول): من حساب Outlook المربوط (الأولوية)، أو عبر SMTP لأي مزود آخر
const config = require('../config');
const outlook = require('./outlook');

let transport = null;
const smtpEnabled = () => !!(config.smtp.host && config.smtp.from);
const enabled = () => outlook.connected() || smtpEnabled();

function getTransport() {
  if (!transport) {
    const nodemailer = require('nodemailer');
    transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transport;
}

async function sendLoginCode(to, code) {
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:16px">
    <h2 style="color:#0c365e;margin:0 0 8px">رمز الدخول إلى أراكم</h2>
    <p style="color:#475569">استخدم هذا الرمز لتسجيل الدخول. صالح لمدة 10 دقائق.</p>
    <div style="font-size:34px;letter-spacing:10px;font-weight:bold;color:#0c365e;background:#e7f8f7;border-radius:12px;padding:14px;text-align:center;direction:ltr">${code}</div>
    <p style="color:#94a3b8;font-size:12px;margin-top:16px">إن لم تطلب هذا الرمز فتجاهل الرسالة.</p></div>`;
  const subject = `رمز الدخول إلى أراكم: ${code}`;
  if (outlook.connected()) return outlook.sendMail(to, subject, html);
  if (!smtpEnabled()) {
    // بيئة التطوير فقط: يُطبع الرمز في سجل الخادم
    if (!config.isProd) console.log(`[mail:dev] رمز الدخول إلى ${to}: ${code}`);
    return;
  }
  await getTransport().sendMail({ from: config.smtp.from, to, subject: `رمز الدخول إلى أراكم: ${code}`, html, text: `رمز الدخول إلى أراكم: ${code} (صالح 10 دقائق)` });
}

// رسالة تجربة من لوحة الإدارة
async function sendTest(to) {
  const html = '<div dir="rtl" style="font-family:Tahoma,Arial"><h3 style="color:#0c365e">تجربة بريد أراكم</h3><p>البريد يعمل بنجاح ✅</p></div>';
  if (outlook.connected()) return outlook.sendMail(to, 'تجربة بريد أراكم', html);
  if (!smtpEnabled()) throw Object.assign(new Error('لا يوجد بريد مربوط'), { status: 400 });
  return getTransport().sendMail({ from: config.smtp.from, to, subject: 'تجربة بريد أراكم', html });
}

module.exports = { enabled, sendLoginCode, sendTest };
