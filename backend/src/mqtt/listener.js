'use strict';
/*
 * سكربت الاستماع لرسائل الكاميرات عبر MQTT
 * يستقبل: التسجيل، النبض، الانقطاع، نتائج قراءة اللوحات، الصور، وردود الأوامر
 */
const config = require('../config');
const { one, query, many } = require('../db');
const { UPLINK, build, decode, serialFrom, gateCodeFrom, readingTime } = require('./protocol');
const mq = require('./client');
const access = require('../services/access');
const { saveBase64Jpeg } = require('../services/media');
const realtime = require('../realtime');

const cameraPublic = (c) => ({
  id: c.id, sn: c.sn, gate_id: c.gate_id, direction: c.direction, is_online: c.is_online, last_seen_at: c.last_seen_at,
});

async function tenantOfCamera(cam) {
  if (!cam.gate_id) return null;
  return (await one('SELECT tenant_id FROM gates WHERE id = $1', [cam.gate_id]))?.tenant_id ?? null;
}

// تحديث "آخر ظهور" للكاميرا وإنشاؤها تلقائياً إن كانت جديدة
async function touchCamera(sn, extra = {}) {
  const before = await one('SELECT * FROM cameras WHERE sn = $1', [sn]);
  const cam = await one(`INSERT INTO cameras (sn, is_online, last_seen_at) VALUES ($1, true, now())
    ON CONFLICT (sn) DO UPDATE SET is_online = true, last_seen_at = now(), ip = COALESCE($2, cameras.ip)
    RETURNING *`, [sn, extra.ip ?? null]);
  if (!before) {
    await mq.logEvent('camera_discovered', { level: 'warn', sn, details: { note: 'كاميرا جديدة تحتاج ربطاً ببوابة' } });
    realtime.emitAdmins('camera:new', cameraPublic(cam));
  } else if (!before.is_online) {
    realtime.emit('camera:status', cameraPublic(cam), await tenantOfCamera(cam));
  }
  return cam;
}

// موضوع إرسال الأوامر للكاميرا: المسجّل في رسالة التسجيل، وإلا الصيغة الافتراضية للمصنع
const replyTopic = (cam) => cam.subtopic || `device/plate/${cam.sn}`;

async function onRegister(msg, topic) {
  const sn = serialFrom(msg, topic);
  if (!sn) return;
  await touchCamera(sn);
  const cam = await one(`UPDATE cameras SET subtopic = COALESCE($2, subtopic), pubtopic = COALESCE($3, pubtopic),
      model = COALESCE($4, model), mac = COALESCE($5, mac), software_version = COALESCE($6, software_version),
      registered_at = now()
    WHERE sn = $1 RETURNING *`,
  [sn, msg.subtopic || null, msg.pubtopic || null, msg.model || null, msg.mac || null, msg.softwareVersion || msg.softVersion || null]);
  mq.publish(replyTopic(cam), build.registerRsp(msg.msg_id));
  await mq.logEvent('camera_registered', { sn, topic, details: { subtopic: cam.subtopic, pubtopic: cam.pubtopic, model: cam.model } });
}

async function onOffline(msg, topic) {
  const sn = serialFrom(msg, topic) || msg.device_name;
  if (!sn) return;
  const cam = await one('UPDATE cameras SET is_online = false WHERE sn = $1 OR (sn = $2) RETURNING *', [sn, msg.sn || sn]);
  await mq.logEvent('camera_offline', { level: 'warn', sn, topic });
  if (cam) realtime.emit('camera:status', cameraPublic(cam), await tenantOfCamera(cam));
}

// في وضع "الرفع المنفصل" تصل الصور برسالة image_result لاحقة بدون sn، فنربطها بآخر قراءة لنفس الوقت
async function onImageResult(msg, topic) {
  const sn = serialFrom(msg, topic);
  const at = readingTime(msg);
  const plateImage = saveBase64Jpeg(msg.plate_pic, 'plate');
  const fullImage = saveBase64Jpeg(msg.full_pic, 'full');
  if (!plateImage && !fullImage) return;
  const gateCode = gateCodeFrom(topic);
  const row = await one(`UPDATE access_logs SET plate_image = COALESCE(plate_image, $1), full_image = COALESCE(full_image, $2)
    WHERE id = (
      SELECT l.id FROM access_logs l LEFT JOIN gates g ON g.id = l.gate_id
      WHERE l.source = 'camera' AND l.plate_image IS NULL AND l.full_image IS NULL
        AND l.occurred_at BETWEEN $3::timestamptz - interval '5 seconds' AND $3::timestamptz + interval '5 seconds'
        AND ($4::text IS NULL OR l.camera_sn = $4) AND ($5::text IS NULL OR g.code = $5)
      ORDER BY l.occurred_at DESC LIMIT 1)
    RETURNING id, tenant_id, plate_image, full_image`, [plateImage, fullImage, at.toISOString(), sn, gateCode]);
  if (row) realtime.emit('access:image', row, row.tenant_id);
}

async function onResult(msg, topic) {
  const sn = serialFrom(msg, topic);
  if (!sn) return mq.logEvent('result_without_sn', { level: 'warn', topic });
  const cam = await touchCamera(sn);
  // الرد على الكاميرا بأن النتيجة استُلمت (القسم 7.1.1.2)
  mq.publish(replyTopic(cam), build.resultRsp(msg.msg_id));

  // تنبيه إن وصلت القراءة على موضوع بوابة لا تطابق ربط الكاميرا
  const topicGate = gateCodeFrom(topic);
  if (topicGate && cam.gate_id) {
    const g = await one('SELECT code FROM gates WHERE id = $1', [cam.gate_id]);
    if (g && g.code !== topicGate) {
      await mq.logEvent('gate_topic_mismatch', { level: 'warn', sn, topic, details: { assigned_gate: g.code, topic_gate: topicGate } });
    }
  }

  await access.handlePlateReading(cam, msg, {
    occurredAt: readingTime(msg),
    plateImage: saveBase64Jpeg(msg.plate_pic, 'plate'),
    fullImage: saveBase64Jpeg(msg.full_pic, 'full'),
  });
}

async function onMessage(topic, payload) {
  const msg = decode(payload);
  if (!msg || !msg.cmd) return mq.logEvent('invalid_payload', { level: 'warn', topic, details: { size: payload.length } });

  switch (msg.cmd) {
    case UPLINK.REGISTER: return onRegister(msg, topic);
    case UPLINK.HEARTBEAT: {
      const sn = serialFrom(msg, topic);
      if (sn) await touchCamera(sn);
      return;
    }
    case UPLINK.OFFLINE: return onOffline(msg, topic);
    case UPLINK.RESULT: return onResult(msg, topic);
    case UPLINK.IMAGE_RESULT: return onImageResult(msg, topic);
    default: {
      const sn = serialFrom(msg, topic);
      if (sn) await touchCamera(sn);
      // ردود الأوامر (iooutput_rsp, checkOnline_rsp, set_mqtt_param_rsp ...)
      if (String(msg.cmd).trim().endsWith('_rsp')) {
        const ok = msg.status === 'ok';
        await mq.logEvent(`reply:${String(msg.cmd).trim()}`, { level: ok ? 'info' : 'warn', sn, topic, details: { status: msg.status, msg_id: msg.msg_id } });
        return;
      }
      await mq.logEvent(`unhandled:${msg.cmd}`, { sn, topic });
    }
  }
}

// تحديد الكاميرات المنقطعة (لم يصل منها نبض خلال المدة المحددة)
async function sweepOffline() {
  const rows = await many(`UPDATE cameras SET is_online = false
    WHERE is_online AND (last_seen_at IS NULL OR last_seen_at < now() - make_interval(secs => $1))
    RETURNING *`, [config.mqtt.offlineAfterSec]);
  for (const cam of rows) {
    await mq.logEvent('camera_timeout', { level: 'warn', sn: cam.sn, details: { after_sec: config.mqtt.offlineAfterSec } });
    realtime.emit('camera:status', cameraPublic(cam), await tenantOfCamera(cam));
  }
}

function start() {
  mq.connect(onMessage);
  const t = setInterval(() => sweepOffline().catch(() => {}), 15000);
  t.unref();
}

// أوامر الإدارة للكاميرا
async function sendToCamera(cameraId, payload) {
  const cam = await one('SELECT * FROM cameras WHERE id = $1', [cameraId]);
  if (!cam) throw Object.assign(new Error('الكاميرا غير موجودة'), { status: 404 });
  mq.publish(replyTopic(cam), payload);
  await mq.logEvent(`command:${payload.cmd}`, { sn: cam.sn, topic: replyTopic(cam), details: { msg_id: payload.msg_id } });
  return { topic: replyTopic(cam), msg_id: payload.msg_id };
}

module.exports = { start, onMessage, sweepOffline, sendToCamera, replyTopic };

// تشغيل المستمع وحده: node src/mqtt/listener.js
if (require.main === module) {
  start();
  query('SELECT 1').then(() => console.log('[listener] قاعدة البيانات متصلة'));
}
