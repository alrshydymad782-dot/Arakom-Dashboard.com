'use strict';
// مستند لوحة السيارة: صورة (JPG/PNG/WEBP) أو PDF، بحد أقصى 5 ميجابايت
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('../config');
const { one, tx } = require('../db');
const { parsePlate } = require('./plates');
const { fail } = require('../http');

const MAX_BYTES = 5 * 1024 * 1024;
const DOCS_DIR = path.join(config.mediaDir, 'documents');
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

// نتحقق من نوع الملف من محتواه الفعلي، لا من اسمه
function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}

const absPath = (rel) => {
  const p = path.resolve(DOCS_DIR, rel);
  return p.startsWith(DOCS_DIR + path.sep) ? p : null;
};

function removeFile(rel) {
  const p = rel && absPath(rel);
  if (p) fs.rm(p, { force: true }, () => {});
}

async function save(tenantId, vehicleId, buf, originalName) {
  if (!Buffer.isBuffer(buf) || !buf.length) fail(400, 'لم يتم إرسال ملف');
  if (buf.length > MAX_BYTES) fail(413, 'حجم الملف أكبر من 5 ميجابايت');
  const type = sniff(buf);
  if (!type) fail(400, 'الملف يجب أن يكون صورة (JPG / PNG / WEBP) أو PDF');

  const v = await one('SELECT id, document_path FROM vehicles WHERE id = $1 AND tenant_id = $2', [vehicleId, tenantId]);
  if (!v) fail(404, 'السيارة غير موجودة');

  const rel = `${tenantId}/${vehicleId}-${crypto.randomBytes(6).toString('hex')}.${EXT[type]}`;
  fs.mkdirSync(path.join(DOCS_DIR, String(tenantId)), { recursive: true });
  fs.writeFileSync(absPath(rel), buf);

  const name = String(originalName || `plate.${EXT[type]}`).replace(/[\\/\0\r\n]/g, '_').slice(0, 120);
  const row = await one(`UPDATE vehicles SET document_path = $1, document_type = $2, document_name = $3, document_size = $4,
      document_uploaded_at = now(), updated_at = now() WHERE id = $5 RETURNING *`, [rel, type, name, buf.length, vehicleId]);
  removeFile(v.document_path); // حذف المستند القديم بعد الاستبدال
  return row;
}

// تسجيل سيارة جديدة مع مستندها في خطوة واحدة (رقم اللوحة اختياري)
async function createWithDocument(tenantId, buf, originalName, plateText) {
  if (!Buffer.isBuffer(buf) || !buf.length) fail(400, 'لم يتم إرسال ملف');
  if (buf.length > MAX_BYTES) fail(413, 'حجم الملف أكبر من 5 ميجابايت');
  const type = sniff(buf);
  if (!type) fail(400, 'الملف يجب أن يكون صورة (JPG / PNG / WEBP) أو PDF');

  let plate = null;
  if (String(plateText || '').trim()) {
    plate = parsePlate(plateText);
    if (!plate.key || plate.key.length < 2) fail(400, 'رقم اللوحة غير صحيح');
  }
  const rel = `${tenantId}/new-${crypto.randomBytes(8).toString('hex')}.${EXT[type]}`;
  fs.mkdirSync(path.join(DOCS_DIR, String(tenantId)), { recursive: true });
  fs.writeFileSync(absPath(rel), buf);
  const name = String(originalName || `plate.${EXT[type]}`).replace(/[\\/\0\r\n]/g, '_').slice(0, 120);
  try {
    return await tx(async (c) => {
      await c.query('SELECT 1 FROM tenants WHERE id = $1 FOR UPDATE', [tenantId]);
      const lim = (await c.query(`SELECT s.max_vehicles, (SELECT COUNT(*)::int FROM vehicles WHERE tenant_id = $1) AS used
        FROM tenants t LEFT JOIN subscriptions s ON s.tenant_id = t.id WHERE t.id = $1`, [tenantId])).rows[0];
      if (lim?.max_vehicles != null && lim.used >= lim.max_vehicles) fail(409, `وصلت للحد الأقصى من السيارات (${lim.max_vehicles})`);
      const r = await c.query(`INSERT INTO vehicles (tenant_id, plate_key, plate_ar, plate_en, document_path, document_type, document_name,
          document_size, document_uploaded_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now()) RETURNING *`,
      [tenantId, plate?.key ?? null, plate?.displayAr || null, plate?.display || null, rel, type, name, buf.length]);
      return r.rows[0];
    });
  } catch (e) {
    removeFile(rel);
    if (e.code === '23505') fail(409, 'هذه اللوحة مسجلة مسبقاً');
    throw e;
  }
}

async function remove(tenantId, vehicleId) {
  const cur = await one('SELECT plate_key FROM vehicles WHERE id = $1 AND tenant_id = $2', [vehicleId, tenantId]);
  if (!cur) fail(404, 'السيارة غير موجودة');
  if (!cur.plate_key) fail(400, 'لا يمكن حذف المستند قبل إدخال رقم اللوحة. احذف السيارة بدلاً من ذلك');
  const v = await one(`UPDATE vehicles v SET document_path = NULL, document_type = NULL, document_name = NULL, document_size = NULL,
      document_uploaded_at = NULL FROM (SELECT document_path AS old FROM vehicles WHERE id = $1 AND tenant_id = $2) o
    WHERE v.id = $1 AND v.tenant_id = $2 RETURNING o.old`, [vehicleId, tenantId]);
  if (!v) fail(404, 'السيارة غير موجودة');
  removeFile(v.old);
}

// إرسال المستند للمتصفح (يُعرض داخل الصفحة: صورة أو PDF)
async function send(res, vehicle) {
  if (!vehicle?.document_path) fail(404, 'لا يوجد مستند لهذه السيارة');
  const p = absPath(vehicle.document_path);
  if (!p || !fs.existsSync(p)) fail(404, 'الملف غير موجود');
  res.setHeader('Content-Type', vehicle.document_type);
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(vehicle.document_name || 'document')}`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  // منع تنفيذ أي محتوى نشط داخل الملف
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; object-src 'self'; plugin-types application/pdf");
  fs.createReadStream(p).pipe(res);
}

module.exports = { save, remove, send, removeFile, createWithDocument, MAX_BYTES, sniff };
