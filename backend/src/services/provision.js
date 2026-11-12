'use strict';
// إنشاء حساب مجمع لعميل متجر أراكم (عند أول شراء أو أول دخول) بنفس بريده وجواله في المتجر
const { one, tx } = require('../db');
const { createUser } = require('./users');
const { phoneKey, normEmail } = require('./identity');
const realtime = require('../realtime');

/**
 * @param {object} cust { id, name, email, phone } عميل سلة
 * @returns مجمع العميل (موجود مسبقاً أو جديد)
 */
async function tenantForStoreCustomer(cust) {
  if (cust.id) {
    const t = await one('SELECT * FROM tenants WHERE salla_customer_id = $1', [String(cust.id)]);
    if (t) return t;
  }
  const email = normEmail(cust.email);
  if (!email && !phoneKey(cust.phone)) return null;
  return tx(async (c) => {
    const t = (await c.query(`INSERT INTO tenants (name, contact_name, phone, email, salla_customer_id, source)
      VALUES ($1, $2, $3, $4, $5, 'salla') RETURNING *`,
    [cust.name || 'عميل متجر أراكم', cust.name, cust.phone, email, cust.id ? String(cust.id) : null])).rows[0];
    // إن كان البريد أو الجوال مستخدماً لحساب آخر لا نُنشئ حساباً مكرراً
    await createUser(c, { tenantId: t.id, role: 'tenant_admin', full_name: cust.name, email, phone: cust.phone, allowPasswordless: true })
      .catch((e) => { if (e.status !== 409) throw e; });
    realtime.emitAdmins('tenant:new', { id: t.id, name: t.name, source: 'salla' });
    return t;
  });
}

module.exports = { tenantForStoreCustomer };
