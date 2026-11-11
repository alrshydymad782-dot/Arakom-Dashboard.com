'use strict';
/*
 * محاكي كاميرات: يرسل قراءات لوحات ونبضات وهمية إلى خادم MQTT للتجربة
 * الاستخدام: npm run simulate -- [عدد الأجهزة] [الفاصل بالثواني]
 * يستخدم نفس متغيرات البيئة (MQTT_URL, MQTT_TOPIC_RESULT ...)
 */
const mqtt = require('mqtt');
const config = require('../server/config');

const count = Number(process.argv[2] || 2);
const intervalSec = Number(process.argv[3] || 5);
const serials = Array.from({ length: count }, (_, i) => `SIM-CAM-${String(i + 1).padStart(3, '0')}`);
const LETTERS = 'ABJDRSXTEGKLZNHUV';
const AR = { A: 'ا', B: 'ب', J: 'ح', D: 'د', R: 'ر', S: 'س', X: 'ص', T: 'ط', E: 'ع', G: 'ق', K: 'ك', L: 'ل', Z: 'م', N: 'ن', H: 'ه', U: 'و', V: 'ى' };
// مجموعة ثابتة من اللوحات لتكرار ظهورها
const fleet = Array.from({ length: 12 }, () => {
  const l = Array.from({ length: 3 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
  return { l, d: String(1 + Math.floor(Math.random() * 9998)) };
});

const opts = config.mqtt.username ? { username: config.mqtt.username, password: config.mqtt.password } : {};
const client = mqtt.connect(config.mqtt.url, opts);
const topic = (pattern, serial) => pattern.replace('+', serial);

client.on('connect', () => {
  console.log(`[sim] متصل بـ ${config.mqtt.url} — ${count} جهاز، كل ${intervalSec} ث`);
  client.subscribe(config.mqtt.topicCommand.replace('{serial}', '+'));
  const beat = () => serials.forEach((s) => client.publish(topic(config.mqtt.topicHeartbeat, s), JSON.stringify({ serialno: s, ip: '192.168.1.' + (10 + serials.indexOf(s)) })));
  beat();
  setInterval(beat, 30e3);
  setInterval(() => {
    const s = serials[Math.floor(Math.random() * serials.length)];
    const p = fleet[Math.floor(Math.random() * fleet.length)];
    // نصف الرسائل بصيغة شائعة لدى كاميرات LPR والنصف الآخر بصيغة بسيطة
    const arabic = [...p.l].reverse().map((c) => AR[c]).join('');
    const msg = Math.random() < 0.5
      ? { AlarmInfoPlate: { serialno: s, result: { PlateResult: { license: `${p.l} ${p.d}`, confidence: 85 + Math.floor(Math.random() * 15), timeStamp: { Timeval: { sec: Math.floor(Date.now() / 1000) } } } } } }
      : { serialno: s, plate: `${arabic} ${p.d}`, confidence: 0.9 + Math.random() / 10, timestamp: Date.now() };
    client.publish(topic(config.mqtt.topicResult, s), JSON.stringify(msg));
    console.log(`[sim] ${s} → ${p.l} ${p.d}`);
  }, intervalSec * 1000);
});
client.on('message', (t, m) => console.log(`[sim] ⬅ أمر مستلم ${t}: ${m}`));
client.on('error', (e) => console.error('[sim]', e.message));
