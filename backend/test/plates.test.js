'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parsePlate } = require('../src/services/plates');

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



