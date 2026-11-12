'use strict';
// جميع الإعدادات من متغيرات البيئة (ملف .env في جذر المشروع أو docker-compose)
const path = require('node:path');
const fs = require('node:fs');

for (const f of [path.join(__dirname, '..', '.env'), path.join(__dirname, '..', '..', '.env')]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const isProd = env('NODE_ENV', 'development') === 'production';

const config = {
  isProd,
  port: Number(env('PORT', 4000)),
  timezone: env('TZ_NAME', 'Asia/Riyadh'),
  databaseUrl: env('DATABASE_URL', 'postgres://arakom:arakom@localhost:5432/arakom'),
  jwtSecret: env('SESSION_SECRET', isProd ? '' : 'dev-secret-change-me'),
  secureCookies: env('SECURE_COOKIES', isProd ? '1' : '0') === '1',
  // نطاق الكوكيز (مثال: .arakom.sa) لا حاجة له عادة لأن كل نطاق فرعي له جلسته
  cookieDomain: env('COOKIE_DOMAIN', ''),
  adminHost: env('ADMIN_HOST', 'admin.arakom.sa'),
  appHost: env('APP_HOST', 'app.arakom.sa'),
  mediaDir: path.resolve(env('MEDIA_DIR', path.join(__dirname, '..', 'media'))),
  keepLogsDays: Number(env('KEEP_LOGS_DAYS', 180)),
  keepImagesDays: Number(env('KEEP_IMAGES_DAYS', 60)),

  mqtt: {
    url: env('MQTT_URL', 'mqtt://localhost:1883'),
    username: env('MQTT_USERNAME', ''),
    password: env('MQTT_PASSWORD', ''),
    clientId: env('MQTT_CLIENT_ID', 'arakom-backend'),
    // موضوع التسجيل الثابت في بروتوكول المصنع (القسم 1.6)
    registerTopic: env('MQTT_REGISTER_TOPIC', '/serverAll'),
    // المواضيع التي يستمع لها الخادم. arakom/gates/{gate_id}/readings هو الموضوع المعتمد للقراءات،
    // و aiot/# هو الموضوع الافتراضي للكاميرات قبل إعادة ضبطها
    subscribe: env('MQTT_SUBSCRIBE', 'arakom/gates/+/readings,arakom/gates/+/readings/+,aiot/#').split(',').map((s) => s.trim()).filter(Boolean),
    // موضوع أمر الفتح الموحد (لأي ريليه خارجي يستمع لأراكم)
    gateCommandTopic: env('MQTT_GATE_COMMAND_TOPIC', 'arakom/gates/{gate_id}/command'),
    // إرسال أمر iooutput بصيغة المصنع لموضوع الكاميرا نفسها (الكاميرا تتحكم بالريليه عبر منفذ IO)
    sendCameraIoCommand: env('MQTT_SEND_CAMERA_IO', '1') === '1',
    // الكاميرا تعتبر منقطعة إن لم يصل منها شيء خلال هذه المدة (النبض الافتراضي كل 30 ثانية)
    offlineAfterSec: Number(env('CAMERA_OFFLINE_AFTER_SEC', 90)),
  },

  // الرابط العام للوحات العملاء (يُبنى منه رابط كل عميل: {appUrl}/c/{token})
  appUrl: env('APP_URL', isProd ? `https://${env('APP_HOST', 'app.arakom.sa')}` : 'http://localhost:4000'),
  adminUrl: env('ADMIN_URL', isProd ? `https://${env('ADMIN_HOST', 'admin.arakom.sa')}` : 'http://localhost:4000/admin'),

  seedAdmin: {
    username: env('ADMIN_USERNAME', 'admin'),
    password: env('ADMIN_PASSWORD', ''),
  },
};

if (isProd && (!config.jwtSecret || config.jwtSecret.length < 32)) {
  console.error('SESSION_SECRET مطلوب ويجب أن يكون 32 حرفاً على الأقل في بيئة الإنتاج');
  process.exit(1);
}

module.exports = config;
