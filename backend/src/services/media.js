'use strict';
// حفظ صور اللوحات القادمة من الكاميرا (BASE64) على القرص
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('../config');

function saveBase64Jpeg(b64, suffix) {
  if (typeof b64 !== 'string' || b64.length < 200) return null;
  try {
    const buf = Buffer.from(b64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    // ملف JPEG يبدأ دائماً بالبايتين FF D8
    if (buf.length < 200 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    const d = new Date();
    const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const dir = path.join(config.mediaDir, day);
    fs.mkdirSync(dir, { recursive: true });
    const name = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}-${suffix}.jpg`;
    fs.writeFileSync(path.join(dir, name), buf);
    return `${day}/${name}`;
  } catch {
    return null;
  }
}

const MEDIA_RE = /^\d{8}\/[\w-]+\.jpg$/;
const mediaPath = (rel) => (MEDIA_RE.test(String(rel)) ? path.join(config.mediaDir, rel) : null);

function purgeOldMedia(days) {
  if (!fs.existsSync(config.mediaDir)) return;
  const cutoff = new Date(Date.now() - days * 864e5);
  const cut = `${cutoff.getFullYear()}${String(cutoff.getMonth() + 1).padStart(2, '0')}${String(cutoff.getDate()).padStart(2, '0')}`;
  for (const d of fs.readdirSync(config.mediaDir)) {
    if (/^\d{8}$/.test(d) && d < cut) fs.rmSync(path.join(config.mediaDir, d), { recursive: true, force: true });
  }
}

module.exports = { saveBase64Jpeg, mediaPath, purgeOldMedia };
