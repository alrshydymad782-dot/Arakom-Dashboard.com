// تنسيق التواريخ والنصوص (بتوقيت الرياض)
const TZ = 'Asia/Riyadh';

const dtf = new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-gregory', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const tf = new Intl.DateTimeFormat('ar-SA-u-nu-latn', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' });
const df = new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-gregory', { timeZone: TZ, year: 'numeric', month: 'long', day: 'numeric' });

export const fmtDateTime = (v) => (v ? dtf.format(new Date(v)) : '—');
export const fmtTime = (v) => (v ? tf.format(new Date(v)) : '—');
export const fmtDate = (v) => (v ? df.format(new Date(String(v).length === 10 ? `${v}T12:00:00` : v)) : '—');

export function timeAgo(v) {
  if (!v) return 'لم يتصل بعد';
  const s = Math.round((Date.now() - new Date(v).getTime()) / 1000);
  if (s < 45) return 'الآن';
  if (s < 3600) return `قبل ${Math.round(s / 60)} دقيقة`;
  if (s < 86400) return `قبل ${Math.round(s / 3600)} ساعة`;
  return `قبل ${Math.round(s / 86400)} يوم`;
}

export const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

export const REASONS = {
  whitelisted: 'مسموح',
  manual: 'فتح يدوي',
  not_whitelisted: 'غير مسجل',
  blocked: 'محظور',
  expired_vehicle: 'انتهى التصريح',
  subscription_expired: 'الاشتراك منتهٍ',
  tenant_suspended: 'المجمع موقوف',
  unassigned_camera: 'كاميرا غير مرتبطة',
  auto_open_disabled: 'الفتح التلقائي معطل',
  no_plate: 'بدون لوحة',
  broker_offline: 'MQTT غير متصل',
};

export const DIRECTION = { in: 'دخول', out: 'خروج' };

export const bytes = (n) => {
  if (n == null) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let x = Number(n);
  while (x >= 1024 && i < u.length - 1) { x /= 1024; i++; }
  return `${x.toFixed(i ? 1 : 0)} ${u[i]}`;
};

export const randomPassword = () => {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const a = new Uint32Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => c[n % c.length]).join('');
};
