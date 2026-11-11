'use strict';
// وسيط MQTT صغير للتجربة على جهازك فقط (في الإنتاج نستخدم Mosquitto)
// التشغيل: cd backend && npm run broker:dev
const path = require('node:path');
const aedes = require(path.join(__dirname, '..', 'backend', 'node_modules', 'aedes'))();
const port = Number(process.env.BROKER_PORT || 1883);

require('node:net').createServer(aedes.handle).listen(port, () => console.log(`[broker] وسيط MQTT تجريبي على المنفذ ${port}`));
aedes.on('client', (c) => console.log(`[broker] اتصل: ${c.id}`));
aedes.on('clientDisconnect', (c) => console.log(`[broker] انقطع: ${c.id}`));
