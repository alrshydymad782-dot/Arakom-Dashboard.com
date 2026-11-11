import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useLive } from '../lib/realtime';
import { fmtDateTime } from '../lib/format';
import { Badge, Empty, Field, Icon, Modal, PageHeader, Spinner, useAction } from '../components/ui';

const STATUS = { applied: ['green', 'طُبّقت'], pending: ['amber', 'بانتظار الموافقة'], unmatched: ['red', 'غير مطابقة'], ignored: ['gray', 'متجاهلة'] };

export default function Billing() {
  const [plans, setPlans] = useState(null);
  const [payments, setPayments] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [plan, setPlan] = useState(null);
  const [apply, setApply] = useState(null);
  const [run, busy] = useAction();

  const load = useCallback(() => {
    api('/admin/plans').then(setPlans);
    api('/admin/payments').then(setPayments);
  }, []);
  useEffect(() => { load(); api('/admin/tenants').then(setTenants); }, [load]);
  useLive('payment:new', load);

  const savePlan = async (e) => {
    e.preventDefault();
    const ok = await run(() => (plan.id ? api(`/admin/plans/${plan.id}`, { method: 'PATCH', body: plan }) : api('/admin/plans', { body: plan })), 'تم حفظ الباقة');
    if (ok) { setPlan(null); load(); }
  };
  const doApply = async (e) => {
    e.preventDefault();
    const ok = await run(() => api(`/admin/payments/${apply.id}/apply`, { body: { tenant_id: apply.tenant_id, months: apply.months || undefined } }), 'تم تطبيق الدفعة وتمديد الاشتراك');
    if (ok) { setApply(null); load(); }
  };
  const setP = (k) => (e) => setPlan({ ...plan, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const webhookUrl = `${window.location.origin.replace('//admin.', '//app.')}/api/webhooks/salla`;

  return (
    <>
      <PageHeader title="الباقات ومدفوعات سلة" />

      <div className="card mb-4 p-4 text-sm leading-7">
        <div className="mb-1 font-bold">ربط متجر سلة</div>
        في لوحة شركاء سلة ← Webhooks، أضف الرابط التالي، واختر الأحداث <b>order.created</b> و <b>order.status.updated</b> و <b>order.payment.updated</b>، واستراتيجية الأمان <b>Signature</b>،
        ثم ضع مفتاح التوقيع في المتغير <code className="rounded bg-slate-100 px-1 dark:bg-ink-800">SALLA_WEBHOOK_SECRET</code> على السيرفر.
        <div className="mt-2 rounded-xl bg-slate-100 p-2 font-mono text-xs dark:bg-ink-800" dir="ltr">{webhookUrl}</div>
        <div className="mt-2 text-slate-500 dark:text-slate-400">يتعرف النظام على المجمع من رقم الجوال أو البريد المسجل، وعلى الباقة من رمز المنتج (SKU) في سلة.</div>
      </div>

      <section className="card mb-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-ink-700">
          <h2 className="font-bold">الباقات</h2>
          <button type="button" className="btn-primary btn-sm" onClick={() => setPlan({ name: '', salla_sku: '', duration_months: 12, max_vehicles: 200, max_gates: 2, price: '', active: true })}><Icon name="plus" className="size-4" />باقة</button>
        </div>
        {!plans ? <Spinner /> : !plans.length ? <Empty>أضف باقة واربطها برمز المنتج (SKU) في متجر سلة</Empty> : (
          <div className="overflow-x-auto"><table className="w-full">
            <thead className="bg-slate-50 dark:bg-ink-800/60"><tr><th className="th">الباقة</th><th className="th">SKU في سلة</th><th className="th">المدة</th><th className="th">السيارات</th><th className="th">السعر</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-ink-800">
              {plans.map((p) => (
                <tr key={p.id}>
                  <td className="td font-semibold">{p.name} {!p.active && <Badge>معطلة</Badge>}</td>
                  <td className="td font-mono" dir="ltr">{p.salla_sku || '—'}</td>
                  <td className="td">{p.duration_months} شهر</td><td className="td">{p.max_vehicles}</td><td className="td">{p.price ?? '—'} ر.س</td>
                  <td className="td"><button type="button" className="btn-ghost btn-sm" onClick={() => setPlan({ ...p, salla_sku: p.salla_sku ?? '', price: p.price ?? '' })}><Icon name="edit" className="size-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3 font-bold dark:border-ink-700">المدفوعات الواردة من سلة</div>
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
                  <td className="td font-mono text-xs" dir="ltr">{p.sku || '—'}</td>
                  <td className="td">{p.tenant_name || '—'}</td>
                  <td className="td"><Badge tone={STATUS[p.status][0]}>{STATUS[p.status][1]}{p.status === 'applied' ? ` +${p.months_added} شهر` : ''}</Badge></td>
                  <td className="td">{(p.status === 'pending' || p.status === 'unmatched') && <div className="flex gap-1">
                    <button type="button" className="btn-primary btn-sm" onClick={() => setApply({ id: p.id, tenant_id: p.tenant_id ?? '', months: '' })}>تطبيق</button>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => run(() => api(`/admin/payments/${p.id}/ignore`, { method: 'POST' })).then(load)}>تجاهل</button>
                  </div>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      <Modal open={!!plan} onClose={() => setPlan(null)} title={plan?.id ? 'تعديل الباقة' : 'باقة جديدة'}>
        {plan && (
          <form onSubmit={savePlan} className="grid grid-cols-2 gap-3">
            <Field label="اسم الباقة" className="col-span-2"><input className="input" required value={plan.name} onChange={setP('name')} /></Field>
            <Field label="رمز المنتج SKU في سلة" className="col-span-2"><input className="input font-mono" dir="ltr" value={plan.salla_sku} onChange={setP('salla_sku')} placeholder="ARAKOM-12M" /></Field>
            <Field label="المدة (أشهر)"><input className="input" type="number" min="1" required value={plan.duration_months} onChange={setP('duration_months')} /></Field>
            <Field label="الحد الأقصى للسيارات"><input className="input" type="number" min="1" required value={plan.max_vehicles} onChange={setP('max_vehicles')} /></Field>
            <Field label="عدد البوابات"><input className="input" type="number" min="1" value={plan.max_gates} onChange={setP('max_gates')} /></Field>
            <Field label="السعر (ر.س)"><input className="input" type="number" min="0" step="0.01" value={plan.price} onChange={setP('price')} /></Field>
            <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-brand-600" checked={!!plan.active} onChange={setP('active')} />الباقة فعالة</label>
            <button className="btn-primary col-span-2 mt-2" disabled={busy}>حفظ</button>
          </form>
        )}
      </Modal>

      <Modal open={!!apply} onClose={() => setApply(null)} title="تطبيق الدفعة على مجمع">
        {apply && (
          <form onSubmit={doApply} className="grid gap-3">
            <Field label="المجمع">
              <select className="input" required value={apply.tenant_id} onChange={(e) => setApply({ ...apply, tenant_id: e.target.value })}>
                <option value="">اختر...</option>{tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="عدد الأشهر (اتركه فارغاً لاستخدام مدة الباقة)"><input className="input" type="number" min="1" max="60" value={apply.months} onChange={(e) => setApply({ ...apply, months: e.target.value })} /></Field>
            <button className="btn-primary mt-2" disabled={busy}>تطبيق وتمديد الاشتراك</button>
          </form>
        )}
      </Modal>
    </>
  );
}
