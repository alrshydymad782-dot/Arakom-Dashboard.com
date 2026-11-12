'use strict';
// نقطة تشغيل الخادم: قاعدة البيانات + API + Socket.io + مستمع MQTT
const http = require('node:http');
const config = require('./config');
const { pool, query } = require('./db');
const { migrate } = require('./db/migrate');
const { seedAdmin } = require('./db/seed-admin');
const realtime = require('./realtime');
const listener = require('./mqtt/listener');
const mq = require('./mqtt/client');
const { purgeOldMedia } = require('./services/media');
const app = require('./app');

async function housekeeping() {
  await query('DELETE FROM access_logs WHERE occurred_at < now() - make_interval(days => $1)', [config.keepLogsDays]);
  await query("DELETE FROM mqtt_events WHERE created_at < now() - interval '14 days'");
  purgeOldMedia(config.keepImagesDays);
}

async function main() {
  await migrate();
  await seedAdmin();
  await require('./services/outlook').load(); // تحميل ربط بريد Outlook إن وجد

  const server = http.createServer(app);
  realtime.attach(server);
  listener.start();

  server.listen(config.port, () => console.log(`[api] يعمل على المنفذ ${config.port}`));
  setInterval(() => housekeeping().catch((e) => console.error('[cleanup]', e.message)), 6 * 3600e3).unref();

  const shutdown = async () => {
    console.log('[api] إيقاف...');
    server.close();
    await mq.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => {
  console.error('[api] فشل التشغيل:', e.message);
  process.exit(1);
});
