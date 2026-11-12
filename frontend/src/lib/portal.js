/*
 * تطبيق واحد يخدم رابطين:
 *   admin.arakom.sa        → لوحة الإدارة (أنت)
 *   app.arakom.sa/c/{رمز}  → لوحة العميل (رابط خاص لكل عميل)
 * محلياً: /admin للإدارة، وأي مسار آخر للعميل
 */
const host = window.location.hostname;
export const PORTAL = host.startsWith('admin.') ? 'admin'
  : host.startsWith('app.') ? 'app'
    : window.location.pathname.startsWith('/admin') ? 'admin' : 'app';
export const BASENAME = PORTAL === 'admin' && !host.startsWith('admin.') ? '/admin' : '/';
