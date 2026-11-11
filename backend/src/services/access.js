'use strict';
/*
 * منطق التحقق والفتح التلقائي
 * ------------------------------------------------------------
 * عند وصول قراءة لوحة من كاميرا دخول أو خروج:
 *   1) نحدد البوابة والمجمع من الكاميرا
 *   2) نتحقق: المجمع نشط؟ الاشتراك ساري؟ اللوحة في القائمة المسموح لها وغير محظورة؟
 *   3) عند المطابقة: نرسل أمر الفتح ونسجل "تم الفتح"
 *      عند الرفض:   لا نرسل شيئاً ونسجل "مرفوض" مع السبب
 */
const config = require('../config');
const { one, query } = require('../db');
const { parsePlate } = require('./plates');
const { build } = require('../mqtt/protocol');
const mq = require('../mqtt/client');
const realtime = require('../realtime');

const REASONS_AR = {
  whitelisted: 'مسموح',
  manual: 'فتح يدوي',
  not_whitelisted: 'غير مسجل',
  blocked: 'محظور',
  expired_vehicle: 'انتهت صلاحية التصريح',
  subscription_expired: 'اشتراك المجمع منتهٍ',
  tenant_suspended: 'حساب المجمع موقوف',
  unassigned_camera: 'كاميرا غير مرتبطة ببوابة',
  auto_open_disabled: 'الفتح التلقائي معطل',
  no_plate: 'بدون لوحة',
  broker_offline: 'تعذر إرسال الأمر (MQTT غير متصل)',
};

async function evaluate({ tenantId, plateKey }) {
  const st = await one('SELECT status, can_access FROM tenant_access_state WHERE tenant_id = $1', [tenantId]);
  if (!st || st.status !== 'active') return { decision: 'denied', reason: 'tenant_suspended', vehicle: null };
  const vehicle = await one('SELECT * FROM vehicles WHERE tenant_id = $1 AND plate_key = $2', [tenantId, plateKey]);
  if (!st.can_access) return { decision: 'denied', reason: 'subscription_expired', vehicle };
  if (!vehicle) return { decision: 'denied', reason: 'not_whitelisted', vehicle: null };
  if (vehicle.status === 'blocked') return { decision: 'denied', reason: 'blocked', vehicle };
  if (vehicle.valid_until) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(new Date());
    if (vehicle.valid_until < today) return { decision: 'denied', reason: 'expired_vehicle', vehicle };
  }
  return { decision: 'opened', reason: 'whitelisted', vehicle };
}

// إرسال أمر الفتح:
//  1) الأمر الموحد لأراكم: arakom/gates/{gate_id}/command  ← { "action": "OPEN_BARRIER", "relay_id": 1 }
//  2) أمر المصنع iooutput إلى موضوع الكاميرا نفسها (الكاميرا تشغّل الريليه عبر منفذ IO رقم 1)
function sendOpen(gate, camera) {
  const topic = config.mqtt.gateCommandTopic.replace('{gate_id}', gate.code);
  mq.publish(topic, { action: 'OPEN_BARRIER', relay_id: gate.relay_id });
  if (config.mqtt.sendCameraIoCommand && camera?.subtopic) mq.publish(camera.subtopic, build.ioOutput('on', 1));
}

async function insertLog(row) {
  const cols = Object.keys(row);
  const vals = Object.values(row);
  const log = await one(`INSERT INTO access_logs (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})
    ON CONFLICT (camera_sn, camera_msg_id) WHERE camera_msg_id IS NOT NULL DO NOTHING RETURNING id`, vals);
  if (!log) return null; // رسالة مكررة من الكاميرا
  return one(`SELECT l.*, g.name AS gate_name, g.code AS gate_code, t.name AS tenant_name,
      v.owner_name, v.unit_number
    FROM access_logs l LEFT JOIN gates g ON g.id = l.gate_id LEFT JOIN tenants t ON t.id = l.tenant_id
    LEFT JOIN vehicles v ON v.id = l.vehicle_id WHERE l.id = $1`, [log.id]);
}

/**
 * معالجة قراءة لوحة من الكاميرا (رسالة cmd=result)
 * @param {object} camera صف الكاميرا من قاعدة البيانات
 * @param {object} msg رسالة result كما أرسلتها الكاميرا
 * @param {object} extra { occurredAt, plateImage, fullImage }
 */
async function handlePlateReading(camera, msg, extra = {}) {
  const gate = camera.gate_id ? await one('SELECT * FROM gates WHERE id = $1', [camera.gate_id]) : null;
  const rawPlate = String(msg.plate_num ?? '').trim();
  const plate = parsePlate(rawPlate === 'null' ? '' : rawPlate);
  const direction = camera.direction || (msg.inout === 'out' ? 'out' : msg.inout === 'in' ? 'in' : null);

  let result;
  if (!gate) result = { decision: 'denied', reason: 'unassigned_camera', vehicle: null };
  else if (!plate.key) result = { decision: 'denied', reason: 'no_plate', vehicle: null };
  else {
    result = await evaluate({ tenantId: gate.tenant_id, plateKey: plate.key });
    if (result.decision === 'opened' && !gate.auto_open) result = { ...result, decision: 'denied', reason: 'auto_open_disabled' };
  }

  // القراءات المتأخرة (type=offline) هي سجلات مخزنة أثناء انقطاع الاتصال: تُسجل فقط بدون فتح
  const isBacklog = msg.type === 'offline';
  const log = await insertLog({
    tenant_id: gate?.tenant_id ?? null,
    gate_id: gate?.id ?? null,
    camera_id: camera.id,
    vehicle_id: result.vehicle?.id ?? null,
    camera_sn: camera.sn,
    plate_raw: rawPlate || 'null',
    plate_key: plate.key || 'NONE',
    plate_ar: plate.displayAr || null,
    plate_en: plate.display || null,
    direction,
    decision: result.decision,
    reason: result.reason,
    source: 'camera',
    confidence: Number.isFinite(Number(msg.confidence)) ? Number(msg.confidence) : null,
    plate_color: msg.plate_color ?? null,
    car_color: msg.car_color ?? null,
    plate_image: extra.plateImage ?? null,
    full_image: extra.fullImage ?? null,
    camera_msg_id: msg.msg_id ?? null,
    occurred_at: extra.occurredAt ?? new Date(),
  });
  if (!log) return null;

  if (result.decision === 'opened' && !isBacklog) {
    try {
      sendOpen(gate, camera);
    } catch (e) {
      await query("UPDATE access_logs SET decision='denied', reason='broker_offline' WHERE id=$1", [log.id]);
      log.decision = 'denied';
      log.reason = 'broker_offline';
    }
  }
  realtime.emit('access:new', log, log.tenant_id);
  return log;
}

// فتح يدوي من لوحة العميل أو الإدارة
async function manualOpen(user, gateId, direction) {
  const gate = await one('SELECT * FROM gates WHERE id = $1', [gateId]);
  if (!gate) throw Object.assign(new Error('البوابة غير موجودة'), { status: 404 });
  const camera = await one('SELECT * FROM cameras WHERE gate_id = $1 AND direction = $2', [gate.id, direction])
    || await one('SELECT * FROM cameras WHERE gate_id = $1 ORDER BY id LIMIT 1', [gate.id]);
  sendOpen(gate, camera);
  const log = await insertLog({
    tenant_id: gate.tenant_id, gate_id: gate.id, camera_id: camera?.id ?? null, camera_sn: camera?.sn ?? null,
    plate_raw: 'MANUAL', plate_key: 'MANUAL', direction, decision: 'opened', reason: 'manual', source: 'manual',
    opened_by: user.id,
  });
  log.opened_by_name = user.full_name || user.username;
  realtime.emit('access:new', log, gate.tenant_id);
  return log;
}

module.exports = { evaluate, handlePlateReading, manualOpen, sendOpen, REASONS_AR };
