'use strict';
// جميع الإعدادات تُقرأ من متغيرات البيئة (ملف .env أو docker-compose)
const path = require('node:path');
const fs = require('node:fs');

// تحميل ملف .env بسيط إن وُجد (بدون مكتبات إضافية)
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);

module.exports = {
  port: Number(env('PORT', 3000)),
  dataDir: path.resolve(env('DATA_DIR', path.join(__dirname, '..', 'data'))),
  sessionSecret: env('SESSION_SECRET', 'change-me-please-' + require('node:os').hostname()),
  secureCookies: env('SECURE_COOKIES', '0') === '1',

  admin: {
    username: env('ADMIN_USERNAME', 'admin'),
    password: env('ADMIN_PASSWORD', 'admin123'),
  },

  mqtt: {
    url: env('MQTT_URL', 'mqtt://localhost:1883'),
    username: env('MQTT_USERNAME', ''),
    password: env('MQTT_PASSWORD', ''),
    clientId: env('MQTT_CLIENT_ID', 'arakom-dashboard-' + Math.random().toString(16).slice(2, 8)),
    // المواضيع (Topics) - تُعدّل حسب ملفات المصنع. علامة + تمثل الرقم التسلسلي للجهاز
    topicResult: env('MQTT_TOPIC_RESULT', 'device/+/result'),
    topicHeartbeat: env('MQTT_TOPIC_HEARTBEAT', 'device/+/heartbeat'),
    // موضوع إرسال أمر فتح البوابة. {serial} يُستبدل بالرقم التسلسلي
    topicCommand: env('MQTT_TOPIC_COMMAND', 'device/{serial}/command'),
    // نص أمر فتح البوابة (JSON). {serial} و {ts} و {id} تُستبدل تلقائياً
    openGatePayload: env('MQTT_OPEN_GATE_PAYLOAD', '{"cmd":"open_gate","serialno":"{serial}","id":"{id}","ts":{ts}}'),
  },

  embeddedBroker: env('EMBEDDED_BROKER', '0') === '1',
  embeddedBrokerPort: Number(env('EMBEDDED_BROKER_PORT', 1883)),
  offlineAfterSec: Number(env('DEVICE_OFFLINE_AFTER_SEC', 120)),
  keepReadsDays: Number(env('KEEP_READS_DAYS', 90)),
};
