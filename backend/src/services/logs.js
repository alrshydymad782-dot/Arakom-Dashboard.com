'use strict';
// البحث في سجلات الدخول والخروج + التصدير
const config = require('../config');
const { many, one } = require('../db');
const { parsePlate } = require('./plates');
const { REASONS_AR } = require('./access');

// يبني شرط WHERE من الفلاتر. tenantId = null يعني كل المجمعات (للإدارة العليا)
function buildFilter(q, tenantId) {
  const where = [];
  const params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (tenantId) add('l.tenant_id = ?', tenantId);
  else if (q.tenant_id) add('l.tenant_id = ?', Number(q.tenant_id));
  if (q.q) {
    const key = parsePlate(q.q).key;
    params.push(`%${key || String(q.q).toUpperCase()}%`, `%${q.q}%`);
    where.push(`(l.plate_key LIKE $${params.length - 1} OR l.plate_raw ILIKE $${params.length} OR v.owner_name ILIKE $${params.length} OR v.unit_number ILIKE $${params.length})`);
  }
  if (q.direction === 'in' || q.direction === 'out') add('l.direction = ?', q.direction);
  if (q.decision === 'opened' || q.decision === 'denied') add('l.decision = ?', q.decision);
  if (q.reason) add('l.reason = ?', String(q.reason));
  if (q.gate_id) add('l.gate_id = ?', Number(q.gate_id));
  if (q.from) add(`l.occurred_at >= (?::date)::timestamp AT TIME ZONE '${config.timezone}'`, q.from);
  if (q.to) add(`l.occurred_at < ((?::date) + 1)::timestamp AT TIME ZONE '${config.timezone}'`, q.to);
  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

const SELECT = `SELECT l.*, g.name AS gate_name, g.code AS gate_code, t.name AS tenant_name,
    v.owner_name, v.unit_number, u.full_name AS opened_by_name
  FROM access_logs l
  LEFT JOIN gates g ON g.id = l.gate_id
  LEFT JOIN tenants t ON t.id = l.tenant_id
  LEFT JOIN vehicles v ON v.id = l.vehicle_id
  LEFT JOIN users u ON u.id = l.opened_by`;

async function search(q, tenantId) {
  const { where, params } = buildFilter(q, tenantId);
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
  const offset = Math.max(Number(q.offset) || 0, 0);
  const rows = await many(`${SELECT} ${where} ORDER BY l.occurred_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
  const { n } = await one(`SELECT COUNT(*)::int AS n FROM access_logs l LEFT JOIN vehicles v ON v.id = l.vehicle_id ${where}`, params);
  return { rows, total: n };
}

async function exportRows(q, tenantId) {
  const { where, params } = buildFilter(q, tenantId);
  return many(`${SELECT} ${where} ORDER BY l.occurred_at DESC LIMIT 20000`, params);
}

const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

function toCsv(rows, { withTenant = false } = {}) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['التاريخ والوقت', ...(withTenant ? ['المجمع'] : []), 'البوابة', 'الاتجاه', 'اللوحة', 'اللوحة (عربي)',
    'الحالة', 'السبب', 'المصدر'];
  const lines = [head.map(esc).join(',')];
  for (const r of rows) {
    lines.push([
      fmt.format(new Date(r.occurred_at)), ...(withTenant ? [r.tenant_name] : []), r.gate_name,
      r.direction === 'in' ? 'دخول' : r.direction === 'out' ? 'خروج' : '',
      r.source === 'manual' ? 'فتح يدوي' : (r.plate_en || r.plate_raw), r.plate_ar,
      r.decision === 'opened' ? 'تم الفتح' : 'مرفوض',
      REASONS_AR[r.reason] || r.reason, r.source === 'manual' ? `يدوي - ${r.opened_by_name || ''}` : 'كاميرا',
    ].map(esc).join(','));
  }
  // BOM ليفتح الملف بالعربي بشكل صحيح في Excel
  return '﻿' + lines.join('\r\n');
}

// إحصاءات اليوم (بتوقيت الرياض)
async function todayStats(tenantId) {
  const params = tenantId ? [tenantId] : [];
  return one(`SELECT
      COUNT(*) FILTER (WHERE direction = 'in' AND decision = 'opened')::int AS entries,
      COUNT(*) FILTER (WHERE direction = 'out' AND decision = 'opened')::int AS exits,
      COUNT(*) FILTER (WHERE decision = 'denied')::int AS denied,
      COUNT(*) FILTER (WHERE source = 'manual')::int AS manual,
      COUNT(*)::int AS total
    FROM access_logs
    WHERE occurred_at >= date_trunc('day', now() AT TIME ZONE '${config.timezone}') AT TIME ZONE '${config.timezone}'
      ${tenantId ? 'AND tenant_id = $1' : ''}`, params);
}

async function hourly(tenantId) {
  const params = tenantId ? [tenantId] : [];
  const rows = await many(`SELECT EXTRACT(HOUR FROM occurred_at AT TIME ZONE '${config.timezone}')::int AS h,
      COUNT(*) FILTER (WHERE direction = 'in')::int AS in_count,
      COUNT(*) FILTER (WHERE direction = 'out')::int AS out_count
    FROM access_logs
    WHERE occurred_at >= date_trunc('day', now() AT TIME ZONE '${config.timezone}') AT TIME ZONE '${config.timezone}'
      ${tenantId ? 'AND tenant_id = $1' : ''}
    GROUP BY 1 ORDER BY 1`, params);
  const out = Array.from({ length: 24 }, (_, h) => ({ h, in: 0, out: 0 }));
  for (const r of rows) out[r.h] = { h: r.h, in: r.in_count, out: r.out_count };
  return out;
}

module.exports = { search, exportRows, toCsv, todayStats, hourly };
