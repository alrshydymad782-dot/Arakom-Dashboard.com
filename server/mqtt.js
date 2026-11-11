'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mqtt = require('mqtt');
const config = require('./config');
const { db, audit } = require('./db');
const { parseResult, parseHeartbeat } = require('./parser');
const { parsePlate } = require('./plates');
const events = require('./events');

let client = null;
const state = { connected: false, lastMessageAt: null, messages: 0, lastError: null };

// يحوّل نمط الموضوع (device/+/result) إلى تعبير نمطي لاستخراج الرقم التسلسلي
function topicMatcher(pattern) {
  const re = '^' + pattern.split('/').map((p) => (p === '+' ? '([^/]+)' : p === '#' ? '(.+)' : p.replace(/[.*?^${}()|[\]\\]/g, '\\$&'))).join('/') + '$';
  return new RegExp(re);
}
const resultRe = topicMatcher(config.mqtt.topicResult);
const heartbeatRe = topicMatcher(config.mqtt.topicHeartbeat);

function touchDevice(serial, ip) {
  const now = Date.now();
  let dev = db.prepare('SELECT * FROM devices WHERE serial=?').get(serial);
  if (!dev) {
    // جهاز جديد يظهر تلقائياً في لوحة المدير ليتم ربطه بعميل
    db.prepare('INSERT INTO devices (serial,name,created_at,last_seen,ip) VALUES (?,?,?,?,?)').run(serial, `كاميرا ${serial}`, now, now, ip || null);
    dev = db.prepare('SELECT * FROM devices WHERE serial=?').get(serial);
    events.publish('device_new', { serial }, null);
  } else {
    const wasOffline = !dev.last_seen || now - dev.last_seen > config.offlineAfterSec * 1000;
    db.prepare('UPDATE devices SET last_seen=?, ip=COALESCE(?,ip) WHERE id=?').run(now, ip || null, dev.id);
    if (wasOffline) events.publish('device_status', { id: dev.id, serial, online: true }, dev.customer_id);
  }
  return db.prepare('SELECT * FROM devices WHERE serial=?').get(serial);
}

function saveImage(base64) {
  try {
    const clean = base64.replace(/^data:image\/\w+;base64,/, '');
    const buf = Buffer.from(clean, 'base64');
    if (buf.length < 100) return null;
    const d = new Date();
    const dir = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    fs.mkdirSync(path.join(config.dataDir, 'images', dir), { recursive: true });
    const name = `${dir}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`;
    fs.writeFileSync(path.join(config.dataDir, 'images', name), buf);
    return name;
  } catch {
    return null;
  }
}

function listStatus(customerId, key) {
  if (!customerId) return 'unknown';
  const row = db.prepare('SELECT kind, valid_until FROM plate_lists WHERE customer_id=? AND plate_key=?').get(customerId, key);
  if (!row) return 'unknown';
  if (row.kind === 'allow' && row.valid_until && new Date(row.valid_until + 'T23:59:59') < new Date()) return 'expired';
  return row.kind;
}

function shouldOpen(device, status) {
  if (device.gate_mode === 'whitelist') return status === 'allow';
  if (device.gate_mode === 'all') return status !== 'block';
  return false;
}

function handleResult(topicSerial, payload) {
  const r = parseResult(topicSerial, payload);
  if (!r) return;
  const device = touchDevice(r.serial);
  const plate = parsePlate(r.plate);
  const status = listStatus(device.customer_id, plate.key);
  const open = device.customer_id ? shouldOpen(device, status) : false;
  if (open) sendOpenGate(device, null, `auto:${plate.key}`);

  const image = r.imageBase64 ? saveImage(r.imageBase64) : null;
  const info = db.prepare(`INSERT INTO plate_reads
    (device_id,customer_id,serial,plate_raw,plate_key,plate_display,plate_display_ar,country,confidence,color,direction,list_status,gate_opened,image,ts)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    device.id, device.customer_id, device.serial, plate.raw, plate.key, plate.display, plate.displayAr, plate.country,
    r.confidence, r.color, r.direction, status, open ? 1 : 0, image, r.time);

  const read = db.prepare(`SELECT r.*, d.name AS device_name, d.location FROM plate_reads r
    LEFT JOIN devices d ON d.id=r.device_id WHERE r.id=?`).get(info.lastInsertRowid);
  events.publish('read', read, device.customer_id);
}

function onMessage(topic, payload) {
  state.messages++;
  state.lastMessageAt = Date.now();
  try {
    let m = topic.match(resultRe);
    if (m) return handleResult(m[1], payload);
    m = topic.match(heartbeatRe);
    if (m) {
      const hb = parseHeartbeat(m[1], payload);
      return touchDevice(hb.serial, hb.ip);
    }
  } catch (err) {
    console.error('[mqtt] خطأ في معالجة الرسالة', topic, err);
  }
}

function sendOpenGate(device, user, reason = 'manual') {
  if (!client || !state.connected) throw new Error('غير متصل بخادم MQTT');
  const id = crypto.randomUUID();
  const fill = (s) => s.replaceAll('{serial}', device.serial).replaceAll('{ts}', String(Math.floor(Date.now() / 1000))).replaceAll('{id}', id);
  const topic = fill(config.mqtt.topicCommand);
  client.publish(topic, fill(config.mqtt.openGatePayload), { qos: 1 });
  audit(user, 'open_gate', { serial: device.serial, reason }, { customer_id: device.customer_id, device_id: device.id });
  events.publish('gate', { device_id: device.id, serial: device.serial, reason, by: user?.name || 'النظام', ts: Date.now() }, device.customer_id);
  return { topic, id };
}

function start() {
  const opts = { clientId: config.mqtt.clientId, reconnectPeriod: 3000, clean: true };
  if (config.mqtt.username) {
    opts.username = config.mqtt.username;
    opts.password = config.mqtt.password;
  }
  client = mqtt.connect(config.mqtt.url, opts);
  client.on('connect', () => {
    state.connected = true;
    state.lastError = null;
    console.log(`[mqtt] متصل بـ ${config.mqtt.url}`);
    client.subscribe([config.mqtt.topicResult, config.mqtt.topicHeartbeat], { qos: 1 });
  });
  client.on('close', () => { state.connected = false; });
  client.on('error', (e) => { state.lastError = e.message; console.error('[mqtt]', e.message); });
  client.on('message', onMessage);
}

module.exports = { start, sendOpenGate, state, handleResult, topicMatcher };
