'use strict';
/*
 * محوّل رسائل المصنع (Adapter)
 * ------------------------------------------------------------
 * هذا هو الملف الوحيد الذي يحتاج تعديلاً عند استلام ملفات MQTT من المصنع.
 * يستقبل رسالة MQTT الخام ويعيد كائناً موحداً:
 *   { serial, plate, confidence, color, direction, imageBase64, time }
 *
 * حالياً يتعرف تلقائياً على الصيغ الشائعة لكاميرات LPR الصينية
 * (مثل AlarmInfoPlate / PlateResult / ivs_result) وعلى صيغة JSON بسيطة.
 */

function pick(obj, paths) {
  for (const p of paths) {
    let cur = obj;
    for (const k of p.split('.')) {
      if (cur == null) break;
      cur = cur[k];
    }
    if (cur !== undefined && cur !== null && cur !== '') return cur;
  }
  return undefined;
}

// يبحث بشكل متكرر عن أول مفتاح يطابق أحد الأسماء
function deepFind(obj, names, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 6) return undefined;
  for (const [k, v] of Object.entries(obj)) {
    if (names.includes(k.toLowerCase()) && v !== null && v !== '' && typeof v !== 'object') return v;
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') {
      const r = deepFind(v, names, depth + 1);
      if (r !== undefined) return r;
    }
  }
  return undefined;
}

function decodePayload(buf) {
  const text = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf);
  try {
    return JSON.parse(text);
  } catch {
    return { _text: text.trim() };
  }
}

function parseResult(topicSerial, payloadBuf) {
  const msg = decodePayload(payloadBuf);

  // رسالة نصية بسيطة تحتوي رقم اللوحة فقط
  if (msg._text !== undefined) {
    return msg._text ? { serial: topicSerial, plate: msg._text, time: Date.now() } : null;
  }

  const plate =
    pick(msg, [
      'AlarmInfoPlate.result.PlateResult.license',
      'PlateResult.license',
      'plate_result.license',
      'result.PlateResult.license',
      'plate', 'plateNumber', 'plate_number', 'license', 'licensePlate', 'plateNo',
    ]) ?? deepFind(msg, ['license', 'plate', 'platenumber', 'plate_number', 'plateno', 'licenseplate', 'plate_num']);

  if (!plate) return null;

  const serial =
    pick(msg, ['AlarmInfoPlate.serialno', 'serialno', 'serial', 'sn', 'deviceId', 'device_id', 'devId']) ??
    deepFind(msg, ['serialno', 'sn', 'deviceid', 'device_id']) ?? topicSerial;

  let confidence = deepFind(msg, ['confidence', 'score', 'conf']);
  if (confidence !== undefined) {
    confidence = Number(confidence);
    if (confidence > 1) confidence = confidence / 100;
  }

  const imageBase64 = deepFind(msg, ['imagefile', 'image', 'imagebase64', 'image_base64', 'img', 'picture', 'fullimage', 'pic']);
  const color = deepFind(msg, ['colortype', 'color', 'platecolor', 'plate_color']);
  const direction = deepFind(msg, ['direction', 'dir']);
  let time = deepFind(msg, ['timestamp', 'time', 'ts', 'capturetime']);
  if (time && typeof time === 'object') time = undefined;
  let t = Number(time);
  if (!Number.isFinite(t) || t <= 0) t = Date.parse(time) || Date.now();
  if (t < 1e12) t = t * 1000; // ثواني -> ميلي ثانية
  if (Math.abs(t - Date.now()) > 7 * 864e5) t = Date.now(); // ساعة الجهاز غير مضبوطة

  return {
    serial: String(serial),
    plate: String(plate),
    confidence: Number.isFinite(confidence) ? confidence : null,
    color: color != null ? String(color) : null,
    direction: direction != null ? String(direction) : null,
    imageBase64: typeof imageBase64 === 'string' && imageBase64.length > 100 ? imageBase64 : null,
    time: t,
  };
}

function parseHeartbeat(topicSerial, payloadBuf) {
  const msg = decodePayload(payloadBuf);
  const serial = (msg && typeof msg === 'object' && deepFind(msg, ['serialno', 'sn', 'deviceid', 'device_id', 'serial'])) || topicSerial;
  return { serial: String(serial), ip: deepFind(msg, ['ip', 'ipaddr', 'ip_address']) || null };
}

module.exports = { parseResult, parseHeartbeat, decodePayload };
