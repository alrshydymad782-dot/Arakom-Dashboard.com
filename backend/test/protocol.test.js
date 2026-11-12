'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { newMsgId, build, serialFrom, gateCodeFrom, decode } = require('../src/mqtt/protocol');

test('msg_id حسب البروتوكول: 20 خانة، أول 13 هي الوقت بالميلي ثانية', () => {
  const id = newMsgId();
  assert.strictEqual(id.length, 20);
  assert.match(id, /^\d{13}[A-Za-z0-9]{7}$/);
  assert.ok(Math.abs(Number(id.slice(0, 13)) - Date.now()) < 1000);
});

test('أمر فتح البوابة بصيغة المصنع iooutput', () => {
  const m = build.ioOutput('on');
  assert.strictEqual(m.cmd, 'iooutput');
  assert.strictEqual(m.ionum, 1);
  assert.strictEqual(m.action, 'on');
  assert.ok(Number.isInteger(m.utc_ts));
});

test('ردود التسجيل والنتيجة تعيد نفس msg_id', () => {
  assert.deepStrictEqual(build.registerRsp('X'), { cmd: 'camera_register_rsp', status: 'ok', msg_id: 'X' });
  assert.deepStrictEqual(build.resultRsp('Y'), { cmd: 'result_rsp', status: 'ok', msg_id: 'Y' });
});

test('ضبط الوقت: السعودية رمزها 15 في البروتوكول', () => {
  const m = build.syncTime();
  assert.strictEqual(m.cmd, 'syncSysTime');
  assert.strictEqual(m.time_zone, 15);
  assert.strictEqual(typeof m.time_stamp, 'string');
});

test('استخراج الرقم التسلسلي من الحمولة أو الموضوع', () => {
  assert.strictEqual(serialFrom({ sn: 'ABC' }, 'x'), 'ABC');
  assert.strictEqual(serialFrom({}, 'aiot/plate/1b7e812009cad088'), '1b7e812009cad088');
  assert.strictEqual(serialFrom({}, 'arakom/gates/G1/readings/SN9'), 'SN9');
  assert.strictEqual(serialFrom({}, 'arakom/gates/G1/readings'), null);
});

test('استخراج رمز البوابة من الموضوع', () => {
  assert.strictEqual(gateCodeFrom('arakom/gates/GATE-A/readings'), 'GATE-A');
  assert.strictEqual(gateCodeFrom('arakom/gates/GATE-A/readings/SN1'), 'GATE-A');
  assert.strictEqual(gateCodeFrom('aiot/plate/SN1'), null);
});

test('رسالة غير JSON تُرفض بأمان', () => {
  assert.strictEqual(decode(Buffer.from('not json')), null);
});
