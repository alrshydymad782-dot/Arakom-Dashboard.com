'use strict';
/*
 * بروتوكول MQTT الخاص بالمصنع (MQTT Communication Protocol V4.x)
 * ----------------------------------------------------------------
 * - الحمولة: JSON بترميز UTF-8، وكل رسالة فيها cmd و msg_id
 * - msg_id: 20 خانة = 13 رقماً (الوقت بالميلي ثانية) + 7 أحرف/أرقام عشوائية
 * - الكاميرا ترسل التسجيل (camera_register) إلى الموضوع الثابت "/serverAll"
 *   وتخبرنا فيه بموضوع استقبالها (subtopic) وموضوع نشرها (pubtopic)
 * - الردود والأوامر من الخادم تُرسل دائماً إلى subtopic الخاص بالكاميرا
 */
const crypto = require('node:crypto');

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function newMsgId() {
  const bytes = crypto.randomBytes(7);
  let rand = '';
  for (const b of bytes) rand += ALNUM[b % ALNUM.length];
  return String(Date.now()).padStart(13, '0').slice(-13) + rand;
}

const utcNow = () => Math.floor(Date.now() / 1000);

// الأوامر الواردة من الكاميرا (Uplink)
const UPLINK = {
  REGISTER: 'camera_register',      // 2.1.1
  OFFLINE: 'offline',               // 2.1.2 (رسالة الوصية Will)
  HEARTBEAT: 'mqtt_herat',          // 2.1.3 (الكلمة مكتوبة خطأ في البروتوكول عمداً)
  RESULT: 'result',                 // 7.1.1 نتيجة قراءة اللوحة
  IMAGE_RESULT: 'image_result',     // 7.1.1 الصور عند إرسالها منفصلة
  IO_INPUT: 'ioinput',              // 3.1.4
};

// بناء الرسائل الصادرة إلى الكاميرا (Downlink)
const build = {
  registerRsp: (msgId, status = 'ok') => ({ cmd: 'camera_register_rsp', status, msg_id: msgId }),
  resultRsp: (msgId, status = 'ok') => ({ cmd: 'result_rsp', status, msg_id: msgId }),
  // 3.2.3 فتح/إغلاق البوابة. ionum ثابت = 1 حسب البروتوكول
  ioOutput: (action = 'on', ionum = 1) => ({ cmd: 'iooutput', msg_id: newMsgId(), ionum, action, utc_ts: utcNow() }),
  // 7.2.11 فحص اتصال الكاميرا
  checkOnline: () => ({ cmd: 'checkOnline', msg_id: newMsgId() }),
  // 3.2.4 حالة الذراع
  barrierState: () => ({ cmd: 'barrieState', msg_id: newMsgId() }),
  // 2.2.1 إعادة تشغيل الكاميرا
  restart: () => ({ cmd: 'dev_restart', msg_id: newMsgId() }),
  // 2.2.2 ضبط وقت الكاميرا. رموز المنطقة الزمنية في البروتوكول معكوسة الإشارة:
  // مثال المصنع يستخدم 20 ("GMT-8") للصين أي UTC+8، لذلك السعودية UTC+3 = 15
  syncTime: (timeZoneCode = 15) => ({ cmd: 'syncSysTime', msg_id: newMsgId(), time_zone: timeZoneCode, time_stamp: String(utcNow()) }),
  // 7.2.9 تغيير إعدادات MQTT في الكاميرا (لتوحيد المواضيع وطريقة رفع الصور)
  setMqttParam: (fields) => ({ cmd: 'set_mqtt_param', msg_id: newMsgId(), ...fields }),
};

function localTime(d = new Date(), tz = 'Asia/Riyadh') {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}/${p.month}/${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

function decode(payload) {
  try {
    const obj = JSON.parse(Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload));
    return obj && typeof obj === 'object' ? obj : null;
  } catch {
    return null;
  }
}

// استخراج الرقم التسلسلي: من الحمولة أولاً، ثم من آخر جزء في الموضوع (مثل aiot/plate/{sn})
function serialFrom(msg, topic) {
  if (msg?.sn) return String(msg.sn).trim();
  if (msg?.device_name && msg.cmd === UPLINK.OFFLINE) return null;
  const parts = String(topic || '').split('/').filter(Boolean);
  if (parts[0] === 'aiot' && parts.length >= 3) return parts[parts.length - 1];
  if (parts[0] === 'arakom' && parts[1] === 'gates' && parts.length === 5) return parts[4];
  return null;
}

// رمز البوابة من الموضوع arakom/gates/{gate_id}/readings
function gateCodeFrom(topic) {
  const m = String(topic || '').match(/^arakom\/gates\/([^/]+)\/readings(?:\/|$)/);
  return m ? m[1] : null;
}

// تحويل وقت القراءة: utc_ts بالثواني، وإن كانت ساعة الكاميرا غير مضبوطة نستخدم وقت الخادم
function readingTime(msg) {
  const t = Number(msg?.utc_ts) * 1000;
  if (!Number.isFinite(t) || t <= 0 || Math.abs(t - Date.now()) > 3 * 864e5) return new Date();
  return new Date(t);
}

// مواضيع أراكم الموحدة التي ننصح بضبط الكاميرات عليها
const arakomTopics = (gateCode, sn) => ({
  pubtopic: `arakom/gates/${gateCode}/readings/${sn}`,
  subtopic: `arakom/devices/${sn}`,
});

module.exports = { newMsgId, utcNow, UPLINK, build, decode, serialFrom, gateCodeFrom, readingTime, arakomTopics, localTime };
