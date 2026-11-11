'use strict';
// أدوات مساعدة لمسارات Express
const { loadUser, readToken, parseCookies, COOKIE } = require('./services/auth');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => { throw new HttpError(status, message); };

// يلتقط أخطاء الدوال غير المتزامنة ويرسل النتيجة كـ JSON
const h = (fn) => async (req, res, next) => {
  try {
    const out = await fn(req, res);
    if (out !== undefined && !res.headersSent) res.json(out);
  } catch (err) {
    next(err);
  }
};

async function attachUser(req, _res, next) {
  try {
    const p = readToken(parseCookies(req.headers.cookie)[COOKIE]);
    if (p) req.user = await loadUser(p.u);
    next();
  } catch (e) {
    next(e);
  }
}

const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, 'يجب تسجيل الدخول'));
  if (!roles.includes(req.user.role)) return next(new HttpError(403, 'لا تملك صلاحية لهذه العملية'));
  if (req.user.role !== 'super_admin' && req.user.tenant_status !== 'active') {
    return next(new HttpError(403, 'حساب المجمع موقوف، تواصل مع إدارة أراكم'));
  }
  next();
};

function errorHandler(err, _req, res, _next) {
  if (err.code === '23505') return res.status(409).json({ error: 'القيمة موجودة مسبقاً' });
  if (err.code === '23503') return res.status(409).json({ error: 'لا يمكن تنفيذ العملية لوجود بيانات مرتبطة' });
  if (err.code === '23514' || err.code === '22P02' || err.code === '22007' || err.code === '22008') {
    return res.status(400).json({ error: 'قيمة غير صحيحة في أحد الحقول' });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'بيانات غير صالحة' });
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  if (err.status === 503) return res.status(503).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'حدث خطأ في الخادم' });
}

// تحويل جسم الطلب إلى أعمدة مسموح بها فقط
function pickFields(body, allowed) {
  const out = {};
  for (const k of allowed) {
    if (body && body[k] !== undefined) out[k] = body[k] === '' ? null : body[k];
  }
  return out;
}

// بناء جملة UPDATE من كائن
function updateSql(table, fields, whereSql, whereParams) {
  const keys = Object.keys(fields);
  if (!keys.length) return null;
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const shifted = whereSql.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + keys.length}`);
  return { text: `UPDATE ${table} SET ${sets} WHERE ${shifted} RETURNING *`, values: [...Object.values(fields), ...whereParams] };
}

const intParam = (v, d = null) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

module.exports = { HttpError, fail, h, attachUser, requireRole, errorHandler, pickFields, updateSql, intParam };
