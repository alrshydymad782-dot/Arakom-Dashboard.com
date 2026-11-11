'use strict';
// إنشاء حساب الإدارة العليا الأول. الاستخدام:
//   ADMIN_USERNAME=admin ADMIN_PASSWORD='كلمة-قوية' npm run seed:admin
const config = require('../config');
const { pool, one } = require('./index');
const { hashPassword } = require('../services/passwords');

async function seedAdmin({ quiet = false } = {}) {
  const exists = await one("SELECT id FROM users WHERE role='super_admin' LIMIT 1");
  if (exists) return false;
  if (!config.seedAdmin.password) {
    if (!quiet) console.warn('[seed] لا يوجد مدير. عيّن ADMIN_PASSWORD لإنشائه تلقائياً');
    return false;
  }
  await one(`INSERT INTO users (username, full_name, password_hash, role) VALUES ($1,'إدارة أراكم',$2,'super_admin') RETURNING id`,
    [config.seedAdmin.username.toLowerCase(), hashPassword(config.seedAdmin.password)]);
  if (!quiet) console.log(`[seed] أُنشئ حساب الإدارة العليا: ${config.seedAdmin.username}`);
  return true;
}

if (require.main === module) {
  seedAdmin().then(() => pool.end()).catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { seedAdmin };
