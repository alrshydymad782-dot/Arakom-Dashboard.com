'use strict';
/*
 * الاشتراك بالأيام: الإدارة تضيف المدة (مثلاً 30 يوماً)
 * عند انتهاء المدة تُقفل لوحة العميل تلقائياً، ويتوقف الفتح التلقائي للبوابات.
 */
const { one } = require('../db');

/**
 * إضافة أيام للاشتراك. تبدأ من تاريخ الانتهاء الحالي إن كان في المستقبل، وإلا من اليوم
 * (لا يضيع على العميل أي يوم متبقٍ)
 */
async function addDays(client, tenantId, days) {
  const d = Number.parseInt(days, 10);
  if (!Number.isFinite(d) || d < 1 || d > 3650) {
    throw Object.assign(new Error('عدد الأيام يجب أن يكون بين 1 و 3650'), { status: 400 });
  }
  const r = await client.query(`
    INSERT INTO subscriptions (tenant_id, starts_at, ends_at, last_added_days)
    VALUES ($1, CURRENT_DATE, CURRENT_DATE + $2::int, $2)
    ON CONFLICT (tenant_id) DO UPDATE SET
      ends_at = GREATEST(subscriptions.ends_at, CURRENT_DATE) + $2::int,
      starts_at = CASE WHEN subscriptions.ends_at < CURRENT_DATE THEN CURRENT_DATE ELSE subscriptions.starts_at END,
      last_added_days = $2,
      updated_at = now()
    RETURNING *`, [tenantId, d]);
  return r.rows[0];
}

// حالة الاشتراك: الأيام المتبقية وهل اللوحة مفتوحة
async function get(tenantId) {
  return one(`SELECT s.*, (s.ends_at - CURRENT_DATE) AS days_left, st.can_access
    FROM subscriptions s
    LEFT JOIN tenant_access_state st ON st.tenant_id = s.tenant_id
    WHERE s.tenant_id = $1`, [tenantId]);
}

module.exports = { addDays, get };
