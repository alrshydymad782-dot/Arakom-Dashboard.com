'use strict';
/*
 * نقطة ربط الويب هوك مع متجر "سلة"
 * POST /api/webhooks/salla
 * ------------------------------------------------------------
 * - التحقق من التوقيع: سلة ترسل الترويسة X-Salla-Signature = HMAC-SHA256(جسم الطلب الخام، مفتاح الويب هوك)
 * - ربط الدفعة بالمجمع: بمعرّف عميل سلة، ثم البريد، ثم رقم الجوال
 * - ربط المنتج بالباقة: عبر SKU المنتج = plans.salla_sku (المدة بالأشهر × الكمية)
 * - إن كان التجديد التلقائي مفعلاً للمجمع: يُمدد الاشتراك فوراً
 *   وإلا: تُحفظ الدفعة "بانتظار موافقة الإدارة"
 * - كل طلب يُعالج مرة واحدة فقط (order_id فريد)
 */
const express = require('express');
const crypto = require('node:crypto');
const config = require('../config');
const { one, query, tx } = require('../db');
const { fail } = require('../http');
const subs = require('../services/subscriptions');
const realtime = require('../realtime');

const router = express.Router();

function verifySignature(rawBody, signature) {
  if (!config.salla.webhookSecret) return !config.isProd; // في التطوير فقط يُسمح بدون مفتاح
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', config.salla.webhookSecret).update(rawBody).digest('hex');
  const a = Buffer.from(String(signature).trim().toLowerCase());
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const digits = (s) => String(s || '').replace(/\D/g, '');
// آخر 9 أرقام تكفي لمطابقة الجوال السعودي بغض النظر عن 966+ أو 05
const phoneTail = (s) => digits(s).slice(-9);

function extractOrder(body) {
  const d = body.data || {};
  const c = d.customer || {};
  const items = Array.isArray(d.items) ? d.items : [];
  const statusSlug = d.status?.slug || d.status?.customized?.slug || d.payment_status || (typeof d.status === 'string' ? d.status : '');
  return {
    orderId: String(d.id ?? d.order_id ?? ''),
    referenceId: d.reference_id ? String(d.reference_id) : null,
    status: String(statusSlug || '').toLowerCase(),
    amount: Number(d.amounts?.total?.amount ?? d.total?.amount ?? d.amount ?? 0) || null,
    currency: d.amounts?.total?.currency ?? d.currency ?? 'SAR',
    customer: {
      id: c.id != null ? String(c.id) : null,
      name: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.name || null,
      phone: c.mobile ? `${c.mobile_code || ''}${c.mobile}` : c.phone || null,
      email: c.email || null,
    },
    items: items.map((i) => ({ sku: i.sku ? String(i.sku) : null, quantity: Number(i.quantity) || 1, name: i.name })),
  };
}

async function findTenant(cust) {
  if (cust.id) {
    const t = await one('SELECT * FROM tenants WHERE salla_customer_id = $1', [cust.id]);
    if (t) return t;
  }
  if (cust.email) {
    const t = await one('SELECT * FROM tenants WHERE lower(email) = lower($1) LIMIT 1', [cust.email]);
    if (t) return t;
  }
  const tail = phoneTail(cust.phone);
  if (tail.length === 9) {
    const t = await one("SELECT * FROM tenants WHERE right(regexp_replace(coalesce(phone,''), '\\D', '', 'g'), 9) = $1 LIMIT 1", [tail]);
    if (t) return t;
  }
  return null;
}

async function findPlan(items) {
  for (const it of items) {
    if (!it.sku) continue;
    const p = await one('SELECT * FROM plans WHERE salla_sku = $1 AND active', [it.sku]);
    if (p) return { plan: p, quantity: it.quantity, sku: it.sku };
  }
  return null;
}

// تطبيق دفعة محفوظة على مجمع (يُستخدم من الويب هوك ومن لوحة الإدارة)
async function applyPayment(paymentId, tenantId, monthsOverride) {
  return tx(async (c) => {
    const p = (await c.query('SELECT * FROM payments WHERE id = $1 FOR UPDATE', [paymentId])).rows[0];
    if (!p) fail(404, 'الدفعة غير موجودة');
    if (p.status === 'applied') fail(409, 'هذه الدفعة طُبقت مسبقاً');
    const tId = tenantId || p.tenant_id;
    if (!tId) fail(400, 'حدد المجمع');
    const plan = p.sku ? (await c.query('SELECT * FROM plans WHERE salla_sku = $1', [p.sku])).rows[0] : null;
    const qty = Number(p.raw?.data?.items?.find((i) => String(i.sku) === p.sku)?.quantity) || 1;
    const months = monthsOverride || (plan ? plan.duration_months * qty : null);
    if (!months) fail(400, 'حدد عدد الأشهر (المنتج غير مرتبط بباقة)');
    const sub = await subs.extend(c, tId, months, { maxVehicles: plan?.max_vehicles ?? null, planId: plan?.id ?? null });
    await c.query("UPDATE payments SET status = 'applied', tenant_id = $2, months_added = $3 WHERE id = $1", [paymentId, tId, months]);
    // حفظ معرّف عميل سلة لربط الدفعات القادمة تلقائياً
    const custId = p.raw?.data?.customer?.id;
    if (custId) await c.query('UPDATE tenants SET salla_customer_id = $2 WHERE id = $1 AND salla_customer_id IS NULL', [tId, String(custId)]).catch(() => {});
    realtime.emit('subscription:renewed', { tenant_id: tId, ends_at: sub.ends_at, months }, tId);
    return { ok: true, subscription: sub, months };
  });
}

router.post('/', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const signature = req.get('x-salla-signature');
  if (!verifySignature(raw, signature)) return res.status(401).json({ error: 'invalid signature' });

  let body;
  try { body = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).json({ error: 'invalid json' }); }

  const event = String(body.event || '');
  if (!config.salla.paidEvents.includes(event)) return res.json({ ok: true, ignored: 'event' });

  const o = extractOrder(body);
  if (!o.orderId) return res.status(400).json({ error: 'missing order id' });
  if (!config.salla.paidStatuses.includes(o.status)) return res.json({ ok: true, ignored: 'status', status: o.status });

  try {
    const [tenant, planMatch] = await Promise.all([findTenant(o.customer), findPlan(o.items)]);
    const sub = tenant ? await one('SELECT auto_renew FROM subscriptions WHERE tenant_id = $1', [tenant.id]) : null;
    const status = !tenant || !planMatch ? 'unmatched' : (sub?.auto_renew ? 'applied' : 'pending');

    // order_id فريد: إن وصلت نفس الدفعة مرة ثانية لا تُطبّق مرتين
    const p = await one(`INSERT INTO payments (tenant_id, event, order_id, reference_id, amount, currency, customer_name, customer_phone,
        customer_email, sku, status, raw)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (provider, order_id) DO NOTHING RETURNING id`,
    [tenant?.id ?? null, event, o.orderId, o.referenceId, o.amount, o.currency, o.customer.name, o.customer.phone,
      o.customer.email, planMatch?.sku ?? o.items[0]?.sku ?? null, status === 'applied' ? 'pending' : status, body]);
    if (!p) return res.json({ ok: true, duplicate: true });

    let result = { status };
    if (status === 'applied') result = { status, ...(await applyPayment(p.id, tenant.id)) };
    realtime.emitAdmins('payment:new', { id: p.id, status, tenant_id: tenant?.id ?? null, order_id: o.orderId });
    return res.json({ ok: true, payment_id: p.id, ...result });
  } catch (e) {
    console.error('[salla]', e);
    // نعيد 500 لتعيد سلة المحاولة لاحقاً
    return res.status(500).json({ error: 'processing failed' });
  }
});

module.exports = { router, applyPayment, verifySignature, extractOrder };
