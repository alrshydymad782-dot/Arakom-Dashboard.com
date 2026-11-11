'use strict';
const mqtt = require('mqtt');
const config = require('../config');
const { query } = require('../db');
const realtime = require('../realtime');

const state = { connected: false, since: null, lastMessageAt: null, received: 0, sent: 0, lastError: null };
let client = null;

// تسجيل حدث في سجل MQTT (يظهر مباشرة في لوحة الإدارة)
async function logEvent(event, { level = 'info', sn = null, topic = null, details = null } = {}) {
  const row = { level, event, camera_sn: sn, topic, details, created_at: new Date().toISOString() };
  realtime.emitAdmins('mqtt:event', row);
  await query('INSERT INTO mqtt_events (level, event, camera_sn, topic, details) VALUES ($1,$2,$3,$4,$5)',
    [level, event, sn, topic, details]).catch(() => {});
}

function connect(onMessage) {
  // clean: false = جلسة دائمة: إن توقف الخادم يحتفظ Mosquitto بالرسائل (QoS 1) ويسلمها عند عودته
  const opts = { clientId: config.mqtt.clientId, reconnectPeriod: 3000, clean: false, keepalive: 30 };
  if (config.mqtt.username) Object.assign(opts, { username: config.mqtt.username, password: config.mqtt.password });
  client = mqtt.connect(config.mqtt.url, opts);

  client.on('connect', () => {
    state.connected = true;
    state.since = new Date().toISOString();
    state.lastError = null;
    const topics = [config.mqtt.registerTopic, ...config.mqtt.subscribe];
    client.subscribe(topics, { qos: 1 }, (err) => {
      if (err) logEvent('subscribe_failed', { level: 'error', details: { error: err.message } });
    });
    console.log(`[mqtt] متصل بـ ${config.mqtt.url} — يستمع إلى: ${topics.join(' , ')}`);
    logEvent('broker_connected', { details: { url: config.mqtt.url, topics } });
    realtime.emitAdmins('mqtt:status', { ...state });
  });
  client.on('close', () => {
    if (state.connected) {
      logEvent('broker_disconnected', { level: 'error' });
      realtime.emitAdmins('mqtt:status', { ...state, connected: false });
    }
    state.connected = false;
  });
  client.on('error', (e) => { state.lastError = e.message; console.error('[mqtt]', e.message); });
  client.on('message', (topic, payload) => {
    state.received++;
    state.lastMessageAt = new Date().toISOString();
    Promise.resolve(onMessage(topic, payload)).catch((err) => {
      console.error('[mqtt] خطأ في معالجة رسالة', topic, err);
      logEvent('handler_error', { level: 'error', topic, details: { error: err.message } });
    });
  });
  return client;
}

function publish(topic, payload, qos = 1) {
  if (!client || !state.connected) throw Object.assign(new Error('الخادم غير متصل بوسيط MQTT حالياً'), { status: 503 });
  client.publish(topic, typeof payload === 'string' ? payload : JSON.stringify(payload), { qos });
  state.sent++;
}

async function close() {
  if (client) await client.endAsync().catch(() => {});
}

module.exports = { connect, publish, state, logEvent, close };
