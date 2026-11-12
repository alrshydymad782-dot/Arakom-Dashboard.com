'use strict';
/*
 * المساحة المستخدمة
 *  - لكل عميل: صور/PDF السيارات المسجلة + صور الكاميرات (اللوحة والمشهد)
 *  - للسيرفر: المساحة الكلية والمتبقية على القرص
 */
const fs = require('node:fs');
const config = require('../config');
const { one, many } = require('../db');
const { mediaPath } = require('./media');

const cache = new Map(); // tenantId -> { t, v }
const CACHE_MS = 10 * 60e3;

function fileSize(rel) {
  const p = rel && mediaPath(rel);
  if (!p) return 0;
  try { return fs.statSync(p).size; } catch { return 0; }
}

async function tenantUsage(tenantId, { fresh = false } = {}) {
  const hit = cache.get(tenantId);
  if (!fresh && hit && Date.now() - hit.t < CACHE_MS) return hit.v;

  const docs = await one(`SELECT COUNT(*) FILTER (WHERE document_path IS NOT NULL)::int AS files,
      COALESCE(SUM(document_size), 0)::bigint AS bytes, COUNT(*)::int AS vehicles
    FROM vehicles WHERE tenant_id = $1`, [tenantId]);

  // صور الكاميرات المحفوظة (تُحذف تلقائياً بعد مدة الحفظ)
  const rows = await many(`SELECT plate_image, full_image FROM access_logs
    WHERE tenant_id = $1 AND (plate_image IS NOT NULL OR full_image IS NOT NULL)`, [tenantId]);
  let camBytes = 0;
  let camFiles = 0;
  for (const r of rows) {
    for (const f of [r.plate_image, r.full_image]) {
      if (!f) continue;
      const s = fileSize(f);
      if (s) { camBytes += s; camFiles++; }
    }
  }
  const v = {
    vehicles: docs.vehicles,
    documents: { files: docs.files, bytes: Number(docs.bytes) },
    camera_images: { files: camFiles, bytes: camBytes, keep_days: config.keepImagesDays },
    total_bytes: Number(docs.bytes) + camBytes,
    checked_at: new Date().toISOString(),
  };
  cache.set(tenantId, { t: Date.now(), v });
  return v;
}

// مساحة القرص على السيرفر
function disk() {
  try {
    fs.mkdirSync(config.mediaDir, { recursive: true });
    const s = fs.statfsSync(config.mediaDir);
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    return { total, free, used: total - free };
  } catch {
    return null;
  }
}

module.exports = { tenantUsage, disk };
