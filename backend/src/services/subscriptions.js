'use strict';
// الاشتراكات: مدد ثابتة (شهر، 3 أشهر، 6 أشهر، سنة) تُضاف من متجر سلة أو يدوياً من الإدارة
const { one } = require('../db');

const DURATIONS = [1, 3, 6, 12];
const DURATION_AR = { 1: 'شهر', 3: '3 أشهر', 6: '6 أشهر', 12: 'سنة' };

/**
 * إضافة مدة لاشتراك مجمع. تبدأ المدة من تاريخ الانتهاء الحالي إن كان في المستقبل،
 * وإلا من اليوم، حتى لا يضيع على العميل أي يوم مدفوع.
 */
async function extend(client, tenantId, months, { maxVehicles } = {}) {
  if (!DURATIONS.includes(Number(months))) {
    throw Object.assign(new Error('مدة الاشتراك يجب أن تكون شهراً أو 3 أو 6 أشهر أو سنة'), { status: 400 });
  }
  const r = await client.query(`
    INSERT INTO subscriptions (tenant_id, starts_at, ends_at, duration_months, max_vehicles)
    VALUES ($1, CURRENT_DATE, (CURRENT_DATE + make_interval(months => $2))::date, $2, $3)
    ON CONFLICT (tenant_id) DO UPDATE SET
      ends_at = (GREATEST(subscriptions.ends_at, CURRENT_DATE) + make_interval(months => $2))::date,
      starts_at = CASE WHEN subscriptions.ends_at < CURRENT_DATE THEN CURRENT_DATE ELSE subscriptions.starts_at END,
      duration_months = $2,
      max_vehicles = COALESCE($3, subscriptions.max_vehicles),
      updated_at = now()
    RETURNING *`, [tenantId, Number(months), maxVehicles ?? null]);
  return r.rows[0];
}

async function get(tenantId) {
  return one(`SELECT s.*, (s.ends_at - CURRENT_DATE) AS days_left, st.can_access
    FROM subscriptions s
    LEFT JOIN tenant_access_state st ON st.tenant_id = s.tenant_id
    WHERE s.tenant_id = $1`, [tenantId]);
}

/**
 * استنتاج المدة من منتج سلة: من رمز المنتج (SKU) أو اسمه
 * أمثلة مقبولة: ARAKOM-1M / ARAKOM-3M / ARAKOM-6M / ARAKOM-12M
 *              "اشتراك شهر" / "3 أشهر" / "ثلاثة أشهر" / "6 شهور" / "ستة أشهر" / "سنة" / "سنوي" / "12 شهر"
 */
function monthsFromProduct({ sku, name } = {}) {
  const s = String(sku || '').toUpperCase();
  const m = s.match(/(?:^|[^0-9])(1|3|6|12)\s*(?:M|MO|MON|MONTH|MONTHS)(?:[^A-Z]|$)/) || s.match(/(?:^|[^0-9])(12)(?:[^0-9]|$)/);
  if (m) return Number(m[1]);
  if (/(?:^|[^A-Z])(1Y|Y1|YEAR|YEARLY|ANNUAL)(?:[^A-Z]|$)/.test(s)) return 12;

  const n = String(name || '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[إأآ]/g, 'ا');
  if (/سن(ة|ه|وي|ويه|وية)|12\s*(شهر|اشهر|شهور)|اثن[اي] عشر شهر/.test(n)) return 12;
  if (/(^|[^0-9])6\s*(شهر|اشهر|شهور)|ست(ة|ه) (اشهر|شهور)|نصف سن|نصف سنوي/.test(n)) return 6;
  if (/(^|[^0-9])3\s*(شهر|اشهر|شهور)|ثلاث(ة|ه)? (اشهر|شهور)|ربع سن/.test(n)) return 3;
  if (/(^|[^0-9])1\s*(شهر)|شهر واحد|شهري|^اشتراك شهر$|(^|\s)شهر($|\s)/.test(n)) return 1;
  return null;
}

module.exports = { extend, get, monthsFromProduct, DURATIONS, DURATION_AR };
