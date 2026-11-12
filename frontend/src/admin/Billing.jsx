import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useLive } from '../lib/realtime';
import { fmtDateTime, DURATIONS } from '../lib/format';
import { Badge, Empty, Field, Modal, PageHeader, Spinner, useAction } from '../components/ui';

const STATUS = { applied: ['green', 'طُبّقت'], pending: ['amber', 'معلقة'], unmatched: ['red', 'تحتاج ربطاً'], ignored: ['gray', 'متجاهلة'] };

export default function Billing() {
  const [payments, setPayments] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [apply, setApply] = useState(null);
  const [status, setStatus] = useState(null);
  const [run, busy] = useAction();

  const load = useCallback(() => api('/admin/payments').then(setPayments), []);
  useEffect(() => { load(); api('/admin/tenants').then(setTenants); api('/admin/salla/status').then(setStatus); }, [load]);
  useLive('salla:connected', useCallback(() => api('/admin/salla/status').then(setStatus), []));
  useLive('payment:new', load);

  const doApply = async (e) => {
    e.preventDefault();
    const ok = await run(() => api(`/admin/payments/${apply.id}/apply`, { body: { tenant_id: apply.tenant_id, months: apply.months || undefined } }), 'تم تطبيق الدفعة وتمديد الاشتراك');
    if (ok) { setApply(null); load(); }
  };
  const webhookUrl = `${window.location.origin.replace('//admin.', '//app.')}/api/webhooks/salla`;

  return (
    <>
      <PageHeader title="مدفوعات سلة" subtitle="الاشتراكات تُضاف تلقائياً عند الدفع في متجرك على سلة" />

      {status && (
        <div className={`card mb-4 p-5 text-sm leading-7 ${status.connected ? '' : 'border-amber-300 dark:border-amber-500/40'}`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-base font-bold">ربط حسابات العملاء بمتجر أراكم</h2>
            <Badge tone={status.connected ? 'green' : 'amber'}>{status.connected ? `متصل${status.merchant_name ? ` · ${status.merchant_name}` : ''}` : 'غير متصل'}</Badge>
          </div>
          <p>لا يدخل العميل لوحة المجمع إلا إذا كان حسابه (البريد أو الجوال) <b>مسجلاً في متجر أراكم</b>، ويدخل برمز يصل لبريده مثل المتجر تماماً.</p>
          {!status.connected && (
            <ol className="mt-2 list-inside list-decimal space-y-1 text-slate-600 dark:text-slate-300">
              <li>من بوابة شركاء سلة (salla.partners) أنشئ تطبيقاً خاصاً باسم «أراكم» واختر طريقة الربط <b>Easy Mode</b>.</li>
              <li>فعّل صلاحية <b>Customers - Read</b> (قراءة العملاء) وصلاحية <b>Orders - Read</b>.</li>
              <li>اجعل رابط الويب هوك للتطبيق هو نفس الرابط في الأسفل، ثم ثبّت التطبيق على متجر أراكم.</li>
              <li>ضع Client ID و Client Secret في <code>SALLA_CLIENT_ID</code> و <code>SALLA_CLIENT_SECRET</code> على السيرفر. سيظهر هنا «متصل» تلقائياً.</li>
            </ol>
          )}
          {!status.email_codes && <p className="mt-2 font-semibold text-amber-700 dark:text-amber-300">لم يُضبط بريد إرسال رموز الدخول (SMTP) بعد.</p>}
        </div>
      )}

      <div className="card mb-4 p-5 text-sm leading-7">
        <h2 className="mb-2 text-base font-bold">طريقة الربط مع متجر سلة</h2>
        <ol className="list-inside list-decimal space-y-1.5">
          <li>اكتب مدة الاشتراك في اسم كل منتج في متجرك (مثل: «اشتراك شهر»، «اشتراك 3 أشهر»، «اشتراك 6 أشهر»، «اشتراك سنة»).</li>
          <li>في لوحة شركاء سلة ← Webhooks أضف هذا الرابط:
            <div className="my-1 rounded-xl bg-slate-100 p-2 font-mono text-xs dark:bg-ink-800" dir="ltr">{webhookUrl}</div>
            واختر الأحداث <b>order.created</b> و <b>order.status.updated</b> و <b>order.payment.updated</b>، واستراتيجية الأمان <b>Signature</b>.
          </li>
          <li>ضع مفتاح التوقيع في المتغير <code className="rounded bg-slate-100 px-1 dark:bg-ink-800">SALLA_WEBHOOK_SECRET</code> على السيرفر.</li>
          <li>عند الدفع يتعرف النظام على العميل من <b>الجوال أو البريد</b>، ويضيف المدة فوراً. العميل الجديد يُنشأ له حساب تلقائياً ويدخل بنفس بريده وجواله في المتجر.</li>
        </ol>
      </div>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3 font-bold dark:border-ink-700">المدفوعات الواردة</div>
        {!payments ? <Spinner /> : !payments.length ? <Empty>لم تصل أي دفعة بعد</Empty> : (
          <div className="overflow-x-auto"><table className="w-full">
            <thead className="bg-slate-50 dark:bg-ink-800/60"><tr><th className="th">الوقت</th><th className="th">الطلب</th><th className="th">العميل</th><th className="th">المبلغ</th><th className="th">المنتج</th><th className="th">المجمع</th><th className="th">الحالة</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-ink-800">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="td text-slate-500">{fmtDateTime(p.created_at)}</td>
                  <td className="td">#{p.order_id}</td>
                  <td className="td">{p.customer_name}<div className="text-xs text-slate-500" dir="ltr">{p.customer_phone || p.customer_email}</div></td>
                  <td className="td">{p.amount ?? '—'} {p.currency}</td>
                  <td className="td">{p.product_name || '—'}<div className="font-mono text-[11px] text-slate-500" dir="ltr">{p.sku}</div></td>
                  <td className="td">{p.tenant_name || '—'}</td>
                  <td className="td"><Badge tone={STATUS[p.status][0]}>{STATUS[p.status][1]}{p.status === 'applied' ? ` · +${p.months_added} شهر` : ''}</Badge></td>
                  <td className="td">{(p.status === 'pending' || p.status === 'unmatched') && <div className="flex gap-1">
                    <button type="button" className="btn-primary btn-sm" onClick={() => setApply({ id: p.id, tenant_id: p.tenant_id ?? '', months: '' })}>ربط وتطبيق</button>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => run(() => api(`/admin/payments/${p.id}/ignore`, { method: 'POST' })).then(load)}>تجاهل</button>
                  </div>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      <Modal open={!!apply} onClose={() => setApply(null)} title="ربط الدفعة بمجمع">
        {apply && (
          <form onSubmit={doApply} className="grid gap-3">
            <Field label="المجمع">
              <select className="input" required value={apply.tenant_id} onChange={(e) => setApply({ ...apply, tenant_id: e.target.value })}>
                <option value="">اختر...</option>{tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="المدة">
              <select className="input" value={apply.months} onChange={(e) => setApply({ ...apply, months: e.target.value })}>
                <option value="">حسب المنتج المدفوع</option>
                {DURATIONS.map(([m, label]) => <option key={m} value={m}>{label}</option>)}
              </select>
            </Field>
            <p className="text-xs text-slate-500">سيتم حفظ رقم عميل سلة مع المجمع، لتُربط دفعاته القادمة تلقائياً.</p>
            <button className="btn-primary mt-1" disabled={busy}>تطبيق وتمديد الاشتراك</button>
          </form>
        )}
      </Modal>
    </>
  );
}
