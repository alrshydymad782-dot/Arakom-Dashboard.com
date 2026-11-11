'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parsePlate } = require('../server/plates');
const { parseResult } = require('../server/parser');

test('لوحة لاتينية', () => {
  const p = parsePlate('ABJ 1234');
  assert.strictEqual(p.key, 'ABJ1234');
  assert.strictEqual(p.country, 'SA');
  assert.strictEqual(p.lettersAr, 'ح ب ا');
});

test('لوحة عربية بأرقام هندية تعطي نفس المفتاح اللاتيني الرسمي', () => {
  // عربي "ح ب ا" بترتيب القراءة = لاتيني "ABJ"
  assert.strictEqual(parsePlate('ح ب ا ١٢٣٤').key, 'ABJ1234');
  assert.strictEqual(parsePlate('ا ب ح 1234').key, 'JBA1234');
});

test('لوحة مختلطة (عربي + لاتيني) لا تتكرر أحرفها أو أرقامها', () => {
  assert.strictEqual(parsePlate('ح ب ا ١٢٣٤ ABJ 1234').key, 'ABJ1234');
});

test('هاء بالتطويل', () => {
  assert.strictEqual(parsePlate('هـ 55').key, 'H55');
});

test('لوحة غير سعودية', () => {
  assert.strictEqual(parsePlate('DXB 12345').country, 'OTHER');
});

test('تحليل صيغة AlarmInfoPlate', () => {
  const r = parseResult('X', JSON.stringify({ AlarmInfoPlate: { serialno: 'CAM1', result: { PlateResult: { license: 'KSA 99', confidence: 92 } } } }));
  assert.strictEqual(r.serial, 'CAM1');
  assert.strictEqual(r.plate, 'KSA 99');
  assert.strictEqual(r.confidence, 0.92);
});

test('تحليل صيغة بسيطة والرقم التسلسلي من الموضوع', () => {
  const r = parseResult('CAM9', JSON.stringify({ plate: 'ABJ 1' }));
  assert.strictEqual(r.serial, 'CAM9');
  assert.strictEqual(r.plate, 'ABJ 1');
});

test('رسالة نصية فقط', () => {
  assert.strictEqual(parseResult('CAM9', Buffer.from('ABJ 1')).plate, 'ABJ 1');
});
