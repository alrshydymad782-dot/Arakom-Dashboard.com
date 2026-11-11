'use strict';
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const { one } = require('./db');
const { attachUser, errorHandler, h, fail } = require('./http');
const { mediaPath } = require('./services/media');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// الويب هوك يحتاج جسم الطلب الخام للتحقق من التوقيع، لذلك يُسجَّل قبل express.json
app.use('/api/webhooks/salla', require('./routes/salla').router);

app.use(express.json({ limit: '5mb' }));
app.use(attachUser);

app.get('/api/health', h(async () => ({ ok: true, db: !!(await one('SELECT 1 AS ok')) })));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/tenant', require('./routes/tenant'));

// صور اللوحات: الإدارة ترى الكل، والمجمع يرى صور سجلاته فقط
app.get('/api/media/:day/:file', h(async (req, res) => {
  if (!req.user) fail(401, 'يجب تسجيل الدخول');
  const rel = `${req.params.day}/${req.params.file}`;
  const file = mediaPath(rel);
  if (!file) fail(404, 'غير موجود');
  if (req.user.role !== 'super_admin') {
    const ok = await one('SELECT 1 FROM access_logs WHERE tenant_id = $1 AND (plate_image = $2 OR full_image = $2) LIMIT 1', [req.user.tenant_id, rel]);
    if (!ok) fail(404, 'غير موجود');
  }
  if (!fs.existsSync(file)) fail(404, 'غير موجود');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.sendFile(file);
}));

app.use('/api', (_req, res) => res.status(404).json({ error: 'غير موجود' }));

// تقديم الواجهة المبنية (frontend/dist) عند التشغيل بدون Caddy
const dist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use(errorHandler);

module.exports = app;
