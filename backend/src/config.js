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

  salla: {
    // مفتاح التوقيع من لوحة شركاء سلة (Webhook Secret)
    webhookSecret: env('SALLA_WEBHOOK_SECRET', ''),
    // أحداث سلة التي تعني دفعة ناجحة
    paidEvents: env('SALLA_PAID_EVENTS', 'order.payment.updated,order.created,order.status.updated').split(','),
    paidStatuses: env('SALLA_PAID_STATUSES', 'paid,completed,delivered,in_progress').split(','),
    // بيانات تطبيق أراكم في بوابة شركاء سلة (لتجديد صلاحية الوصول للمتجر تلقائياً)
    clientId: env('SALLA_CLIENT_ID', ''),
    clientSecret: env('SALLA_CLIENT_SECRET', ''),
    apiUrl: env('SALLA_API_URL', 'https://api.salla.dev/admin/v2'),
    tokenUrl: env('SALLA_TOKEN_URL', 'https://accounts.salla.sa/oauth2/token'),
    // رابط المتجر: يظهر لمن يحاول الدخول وهو غير مسجل في المتجر
    storeUrl: env('SALLA_STORE_URL', ''),
    // 1 = لا يدخل عملاء المجمعات إلا إذا كان حسابهم موجوداً في متجر أراكم
    storeLoginOnly: env('STORE_LOGIN_ONLY', '1') === '1',
  },

  // البريد لإرسال رموز الدخول (اختياري — بدونه يكون الدخول بكلمة المرور فقط)
  smtp: {
    host: env('SMTP_HOST', ''),
    port: Number(env('SMTP_PORT', 587)),
    user: env('SMTP_USER', ''),
    pass: env('SMTP_PASS', ''),
    from: env('SMTP_FROM', ''),
  },
  // في التطوير: إظهار خيار الدخول بالرمز حتى بدون SMTP (الرمز يُطبع في سجل الخادم)
  devLoginCodes: env('DEV_LOGIN_CODES', '0') === '1',

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
