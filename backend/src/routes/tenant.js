'use strict';
/*
 * لوحة العميل (app.arakom.sa/c/{رابطه الخاص}) — مبسطة:
 *   1) البوابات: فتح يدوي لكل عمود + الفتح التلقائي لأي سيارة (ساعة / 6 / 12 / دائماً)
 *   2) السيارات: إضافة لوحة بكتابة الرقم أو برفع صورة/PDF
 * تُقفل اللوحة تلقائياً عند انتهاء أيام الاشتراك أو إيقاف العميل من الإدارة.
 */
const express = require('express');
const { one, many, audit } = require('../db');
const { h, fail, requireRole, intParam } = require('../http');
const vehicles = require('../services/vehicles');
const logs = require('../services/logs');
const subs = require('../services/subscriptions');
const access = require('../services/access');
const documents = require('../services/documents');

const router = express.Router();
router.use(requireRole('tenant_admin'));
const tid = (req) => req.user.tenant_id;

// حالة اللوحة: تعمل دائماً حتى لو كانت مقفلة (لعرض شاشة القفل)
router.get('/status', h(async (req) => {
  const [t, sub] = await Promise.all([one('SELECT name, status FROM tenants WHERE id = $1', [tid(req)]), subs.get(tid(req))]);
  const locked = t.status !== 'active' || !sub?.can_access;
  return {
    tenant_name: t.name,
    locked,
    reason: t.status !== 'active' ? 'suspended' : !sub ? 'no_subscription' : !sub.can_access ? 'expired' : null,
    ends_at: sub?.ends_at ?? null,
    days_left: sub?.days_left ?? null,
  };
}));

// القفل التلقائي: بعد انتهاء الاشتراك أو الإيقاف لا يعمل أي شيء آخر في لوحة العميل
router.use(async (req, _res, next) => {
  try {
    const st = await one(`SELECT t.status, COALESCE(s.can_access, false) AS can_access
      FROM tenants t LEFT JOIN tenant_access_state s ON s.tenant_id = t.id WHERE t.id = $1`, [tid(req)]);
    if (!st || st.status !== 'active' || !st.can_access) {
      return next(Object.assign(new Error('لوحة التحكم مقفلة: انتهت مدة الاشتراك. تواصل مع أراكم للتجديد'), { status: 403, extra: { locked: true } }));
    }
    next();
  } catch (e) {
    next(e);
  }
});

async function gatesWithCameras(tenantId) {
  return many(`SELECT g.id, g.name, g.columns, g.open_all_always, g.open_all_until,
      (SELECT json_agg(json_build_object('id', c.id, 'direction', c.direction, 'is_online', c.is_online, 'last_seen_at', c.last_seen_at)
        ORDER BY c.direction) FROM cameras c WHERE c.gate_id = g.id) AS cameras
    FROM gates g WHERE g.tenant_id = $1 ORDER BY g.id`, [tenantId]);
}

// الصفحة الرئيسية: البوابات + آخر الحركة
router.get('/dashboard', h(async (req) => {
  const [gates, recent, today] = await Promise.all([
    gatesWithCameras(tid(req)), logs.search({ limit: 8 }, tid(req)), logs.todayStats(tid(req)),
  ]);
  return { gates, recent: recent.rows, today };
}));

// فتح يدوي لعمود: in = عمود الدخول، out = عمود الخروج (للبوابة ذات العمودين فقط)
router.post('/gates/:id/open', h(async (req) => {
  const gate = await one('SELECT id, columns FROM gates WHERE id = $1 AND tenant_id = $2', [intParam(req.params.id), tid(req)]);
  if (!gate) fail(404, 'البوابة غير موجودة');
  const direction = req.body?.direction === 'out' ? 'out' : 'in';
  if (direction === 'out' && gate.columns === 1) fail(400, 'هذه البوابة عمود دخول فقط');
  const log = await access.manualOpen(req.user, gate.id, direction);
  await audit(req.user, 'gate_manual_open', { gate_id: gate.id, direction }, tid(req));
  return { ok: true, log };
}));

// الفتح التلقائي لأي سيارة: 1h / 6h / 12h / always / off
router.post('/gates/:id/open-all', h(async (req) => {
  const mode = String(req.body?.mode || '');
  const g = await access.setOpenAll(req.user, intParam(req.params.id), mode, tid(req));
  await audit(req.user, 'gate_open_all', { gate_id: g.id, mode }, tid(req));
  return { id: g.id, open_all_always: g.open_all_always, open_all_until: g.open_all_until };
}));

// ---------- السيارات ----------
router.get('/vehicles', h(async (req) => ({ rows: await vehicles.list(tid(req), req.query) })));
router.post('/vehicles', h(async (req) => {
  const v = await vehicles.create(tid(req), { plate: req.body?.plate });
  await audit(req.user, 'vehicle_add', { plate: v.plate_key }, tid(req));
  return v;
}));
router.patch('/vehicles/:id', h(async (req) => vehicles.update(tid(req), intParam(req.params.id), { plate: req.body?.plate })));
router.delete('/vehicles/:id', h(async (req) => {
  const v = await one('DELETE FROM vehicles WHERE id = $1 AND tenant_id = $2 RETURNING plate_key, document_path', [intParam(req.params.id), tid(req)]);
  if (!v) fail(404, 'السيارة غير موجودة');
  documents.removeFile(v.document_path);
  await audit(req.user, 'vehicle_delete', { plate: v.plate_key }, tid(req));
  return { ok: true };
}));

// إضافة سيارة برفع صورة أو PDF للوحة (رقم اللوحة اختياري في الترويسة X-Plate)
const rawFile = express.raw({ type: () => true, limit: documents.MAX_BYTES + 1024 });
const dec = (v) => { try { return decodeURIComponent(v || ''); } catch { return ''; } };
router.post('/vehicles/with-document', rawFile, h(async (req) => {
  const v = await documents.createWithDocument(tid(req), req.body, dec(req.get('x-file-name')), dec(req.get('x-plate')));
  await audit(req.user, 'vehicle_add_document', { plate: v.plate_key }, tid(req));
  return v;
}));
router.put('/vehicles/:id/document', rawFile, h(async (req) => documents.save(tid(req), intParam(req.params.id), req.body, dec(req.get('x-file-name')))));
router.get('/vehicles/:id/document', h(async (req, res) => {
  const v = await one('SELECT document_path, document_type, document_name FROM vehicles WHERE id = $1 AND tenant_id = $2', [intParam(req.params.id), tid(req)]);
  await documents.send(res, v);
}));

module.exports = router;
