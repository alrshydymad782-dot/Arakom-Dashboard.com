'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { monthsFromProduct } = require('../src/services/subscriptions');
const { sniff } = require('../src/services/documents');

test('مدة الاشتراك من رمز المنتج SKU', () => {
  assert.strictEqual(monthsFromProduct({ sku: 'ARAKOM-1M' }), 1);
  assert.strictEqual(monthsFromProduct({ sku: 'ARAKOM-3M' }), 3);
  assert.strictEqual(monthsFromProduct({ sku: 'arakom-6m' }), 6);
  assert.strictEqual(monthsFromProduct({ sku: 'ARAKOM-12M' }), 12);
  assert.strictEqual(monthsFromProduct({ sku: 'ARAKOM-YEARLY' }), 12);
});

test('مدة الاشتراك من اسم المنتج بالعربي', () => {
  assert.strictEqual(monthsFromProduct({ name: 'اشتراك شهر' }), 1);
  assert.strictEqual(monthsFromProduct({ name: 'اشتراك شهري - أراكم' }), 1);
  assert.strictEqual(monthsFromProduct({ name: 'اشتراك 3 أشهر' }), 3);
  assert.strictEqual(monthsFromProduct({ name: 'اشتراك ثلاثة أشهر' }), 3);
  assert.strictEqual(monthsFromProduct({ name: 'اشتراك ٦ أشهر' }), 6);
  assert.strictEqual(monthsFromProduct({ name: 'اشتراك ستة شهور' }), 6);
  assert.strictEqual(monthsFromProduct({ name: 'اشتراك سنة' }), 12);
  assert.strictEqual(monthsFromProduct({ name: 'الاشتراك السنوي' }), 12);
  assert.strictEqual(monthsFromProduct({ name: '12 شهر' }), 12);
});

test('منتج غير معروف المدة', () => {
  assert.strictEqual(monthsFromProduct({ sku: 'CAMERA-X', name: 'كاميرا إضافية' }), null);
  assert.strictEqual(monthsFromProduct({}), null);
});

test('التعرف على نوع الملف من محتواه', () => {
  assert.strictEqual(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), 'image/jpeg');
  assert.strictEqual(sniff(Buffer.from('%PDF-1.7 aaaaaaa')), 'application/pdf');
  assert.strictEqual(sniff(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])), 'image/png');
  assert.strictEqual(sniff(Buffer.from('<html><script>xx')), null);
});
