'use strict';
// إدارة الاشتراكات والتجديد
const { one } = require('../db');

/**
 * تمديد اشتراك مجمع بعدد من الأشهر.
 * التمديد يبدأ من تاريخ الانتهاء الحالي إن كان في المستقبل، وإلا من اليوم (لا يضيع على العميل أي يوم مدفوع)
 */
async function extend(client, tenantId, months, { maxVehicles = null, planId = null } = {}) {
  const r = await client.query(`
    INSERT INTO subscriptions (tenant_id, plan_id, starts_at, ends_at, max_vehicles)
    VALUES ($1, $3, CURRENT_DATE, (CURRENT_DATE + make_interval(months => $2))::date, COALESCE($4, 200))
    ON CONFLICT (tenant_id) DO UPDATE SET
      ends_at = (GREATEST(subscriptions.ends_at, CURRENT_DATE) + make_interval(months => $2))::date,
      starts_at = CASE WHEN subscriptions.ends_at < CURRENT_DATE THEN CURRENT_DATE ELSE subscriptions.starts_at END,
      max_vehicles = COALESCE($4, subscriptions.max_vehicles),
      plan_id = COALESCE($3, subscriptions.plan_id),
      updated_at = now()
    RETURNING *`, [tenantId, months, planId, maxVehicles]);
  return r.rows[0];
}

async function get(tenantId) {
  return one(`SELECT s.*, p.name AS plan_name,
      (s.ends_at - CURRENT_DATE) AS days_left,
      st.can_access
    FROM subscriptions s
    LEFT JOIN plans p ON p.id = s.plan_id
    LEFT JOIN tenant_access_state st ON st.tenant_id = s.tenant_id
    WHERE s.tenant_id = $1`, [tenantId]);
}

module.exports = { extend, get };
