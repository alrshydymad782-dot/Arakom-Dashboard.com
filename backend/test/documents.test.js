'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { sniff } = require('../src/services/documents');

test('التعرف على نوع ملف صورة اللوحة من محتواه', () => {
  assert.strictEqual(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), 'image/jpeg');
  assert.strictEqual(sniff(Buffer.from('%PDF-1.7 aaaaaaa')), 'application/pdf');
  assert.strictEqual(sniff(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])), 'image/png');
  assert.strictEqual(sniff(Buffer.from('<html><script>xx')), null);
});
