'use strict';
/*
 * محاكي كاميرات ANPR يتبع بروتوكول المصنع حرفياً (MQTT Communication Protocol V4.x)
 * يحاكي بوابة كاملة: كاميرا دخول + كاميرا خروج
 *
 * الاستخدام (من مجلد backend):
 *   node ../tools/camera-simulator.js --sn ENTRY0000000001,EXIT00000000001 --every 4 [--image car.jpg] [--plates "ABJ 1234,ح ب ا 5555"]
 *
 * ما يفعله:
 *   - يرسل camera_register إلى /serverAll ويضبط رسالة وصية (offline) عند الانقطاع
 *   - يرسل نبضاً (mqtt_herat) كل 30 ثانية
 *   - يرسل نتائج قراءة لوحات (cmd=result) على pubtopic
 *   - يستقبل الأوامر على subtopic: iooutput (فتح الذراع)، set_mqtt_param، checkOnline ... ويرد عليها
 */
const fs = require('node:fs');
const path = require('node:path');
const mqtt = require(path.join(__dirname, '..', 'backend', 'node_modules', 'mqtt'));

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return a;
}, []));

const url = args.url || process.env.MQTT_URL || 'mqtt://localhost:1883';
const sns = String(args.sn || 'SIMENTRY0000001,SIMEXIT00000001').split(',');
const every = Number(args.every || 5) * 1000;
const image = args.image ? fs.readFileSync(args.image).toString('base64') : null;
const plates = String(args.plates || '1234 ABJ,ح ب ا ٧٧٧٧,5821 KSD,٩٠١٠ ل ا و,4410 RNJ,3003 TXG').split(',');

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const msgId = () => String(Date.now()) + Array.from({ length: 7 }, () => ALNUM[Math.floor(Math.random() * ALNUM.length)]).join('');
const localTime = () => new Date().toISOString().replace('T', ' ').slice(0, 19).replace(/-/g, '/');
let seq = 0;

function startCamera(sn, index) {
  const inout = index % 2 === 0 ? 'in' : 'out';
  let pubtopic = `aiot/plate/${sn}`;
  let subtopic = `device/plate/${sn}`;
  const tag = `[${inout === 'in' ? 'دخول' : 'خروج'} ${sn}]`;

  const client = mqtt.connect(url, {
    clientId: `cam-${sn}`,
    username: process.env.CAMERA_MQTT_USERNAME || undefined,
    password: process.env.CAMERA_MQTT_PASSWORD || undefined,
    will: { topic: '/serverAll', payload: JSON.stringify({ cmd: 'offline', msg_id: msgId(), sn, device_name: sn }), qos: 1 },
  });
  const send = (topic, obj) => client.publish(topic, JSON.stringify(obj), { qos: 1 });
  const register = () => send('/serverAll', {
    cmd: 'camera_register', msg_id: msgId(), sn, subtopic, pubtopic, model: 'SIM_LPR', mac: '90706617C2' + String(index).padStart(2, '0'),
    softwareVersion: '20.0.423', direction: inout === 'in' ? 1 : 2,
    ability: { video: true, voice: false, plateRecognition: true, faceRecognition: false, icCard: false, doorControl: true, bluetooth: false, wifi: false },
    supportedCmdList: ['result', 'mqtt_herat', 'offline', 'iooutput', 'checkOnline', 'set_mqtt_param', 'dev_restart', 'syncSysTime'],
  });

  client.on('connect', () => {
    client.subscribe(subtopic, { qos: 1 });
    register();
    console.log(`${tag} متصل، يستمع على ${subtopic}`);
  });

  client.on('message', (topic, buf) => {
    const m = JSON.parse(buf.toString());
    switch (m.cmd) {
      case 'camera_register_rsp': console.log(`${tag} تم التسجيل: ${m.status}`); break;
      case 'result_rsp': break;
      case 'iooutput':
        console.log(`${tag} >>> فتح الذراع (IO ${m.ionum} = ${m.action}) <<<`);
        send(pubtopic, { cmd: 'iooutput_rsp', status: 'ok', msg_id: m.msg_id, type: m.action, sn });
        break;
      case 'checkOnline': send(pubtopic, { cmd: 'checkOnline_rsp', status: 'ok', msg_id: m.msg_id, sn }); break;
      case 'dev_restart': send(pubtopic, { cmd: 'dev_restart_rsp', status: 'ok', msg_id: m.msg_id, sn }); break;
      case 'syncSysTime': send(pubtopic, { cmd: 'syncSysTime_rsp', status: 'ok', msg_id: m.msg_id, sn }); break;
      case 'set_mqtt_param': {
        send(pubtopic, { cmd: 'set_mqtt_param_rsp', status: 'ok', msg_id: m.msg_id, sn });
        client.unsubscribe(subtopic);
        if (m.pubtopic) pubtopic = m.pubtopic;
        if (m.subtopic) subtopic = m.subtopic;
        client.subscribe(subtopic, { qos: 1 });
        console.log(`${tag} مواضيع جديدة: نشر=${pubtopic} استقبال=${subtopic}`);
        register();
        break;
      }
      default: console.log(`${tag} أمر: ${m.cmd}`);
    }
  });

  setInterval(() => send(pubtopic, { cmd: 'mqtt_herat', msg_id: msgId(), sn }), 30000);
  setTimeout(() => setInterval(() => {
    const plate = plates[Math.floor(Math.random() * plates.length)];
    const msg = {
      cmd: 'result', msg_id: msgId(), type: 'online', plate_num: plate, plate_encryption_state: 0, plate_color: '白色',
      plate_val: true, confidence: 20 + Math.floor(Math.random() * 9), car_logo: '丰田', car_color: '白色', vehicle_type: '小型车',
      utc_ts: Math.floor(Date.now() / 1000), local_time: localTime(), inout, trigger_type: 'video', plate_number: ++seq,
      plate_type: 10, sn,
      ...(image ? { plate_pic: image, plate_pic_len: image.length, full_pic: image, full_pic_len: image.length } : {}),
    };
    send(pubtopic, msg);
    console.log(`${tag} قرأ اللوحة: ${plate}`);
  }, every), index * 1500);
}

sns.forEach(startCamera);
