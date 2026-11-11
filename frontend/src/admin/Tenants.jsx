import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { fmtDate, randomPassword } from '../lib/format';
import { Badge, Empty, Field, Icon, Modal, PageHeader, Spinner, Tabs, useAction } from '../components/ui';

const COUNTRIES = [['SA', 'السعودية'], ['AE', 'الإمارات'], ['KW', 'الكويت'], ['QA', 'قطر'], ['BH', 'البحرين'], ['OM', 'عُمان']];
const plusYear = () => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); };

export default function Tenants() {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState(null);
  const [created, setCreated] = useState(null);
  const [run, busy] = useAction();
  const nav = useNavigate();

  const load = useCallback(() => api('/admin/tenants').then(setRows), []);
  useEffect(() => { load(); }, [load]);

  const list = useMemo(() => (rows || []).filter((t) => {
    if (q && !`${t.name} ${t.city ?? ''} ${t.phone ?? ''} ${t.contact_name ?? ''}`.includes(q)) return false;
    if (filter === 'active') return t.status === 'active' && t.can_access;
    if (filter === 'expired') return t.status === 'active' && !t.can_access;
    if (filter === 'suspended') return t.status === 'suspended';
    return true;
  }), [rows, q, filter]);

  const submit = async (e) => {
    e.preventDefault();
    const { subscription, ...rest } = form;
    const t = await run(() => api('/admin/tenants', { body: { ...rest, subscription } }), 'تم إنشاء المجمع');
    if (t) {
      if (form.admin_username) setCreated({ id: t.id, username: form.admin_username.toLowerCase(), password: form.admin_password });
      else nav(`/tenants/${t.id}`);
      setForm(null);
      load();
    }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setSub = (k) => (e) => setForm({ ...form, subscription: { ...form.subscription, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value } });

  return (
    <>
      <PageHeader title="المجمعات والعملاء" subtitle={rows ? `${rows.length} مجمع` : ''}
        actions={<button type="button" className="btn-primary" onClick={() => setForm({
          name: '', contact_name: '', phone: '', email: '', city: '', country: 'SA', admin_username: '', admin_password: randomPassword(),
          subscription: { starts_at: new Date().toISOString().slice(0, 10), ends_at: plusYear(), max_vehicles: 200, auto_renew: true },
        })}><Icon name="plus" className="size-4" />مجمع جديد</button>} />

      <div className="mb-4 flex flex-wrap gap-3">
        <input className="input min-w-60 flex-1" placeholder="بحث بالاسم أو المدينة أو الجوال" value={q} onChange={(e) => setQ(e.target.value)} />
        <Tabs value={filter} onChange={setFilter} items={[['', 'الكل'], ['active', 'فعال'], ['expired', 'منتهي'], ['suspended', 'موقوف']]} />
      </div>

      <div className="card overflow-hidden">
        {!rows ? <Spinner /> : !list.length ? <Empty>لا يوجد مجمعات</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-ink-800/60"><tr>
                <th className="th">المجمع</th><th className="th">التواصل</th><th className="th">الاشتراك</th><th className="th">البوابات</th>
                <th className="th">الكاميرات</th><th className="th">السيارات</th><th className="th">الحالة</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-ink-800">
                {list.map((t) => (
                  <tr key={t.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-ink-800/50" onClick={() => nav(`/tenants/${t.id}`)}>
                    <td className="td"><Link to={`/tenants/${t.id}`} className="font-semibold">{t.name}</Link><div className="text-xs text-slate-500">{t.city}</div></td>
                    <td className="td"><div>{t.contact_name || '—'}</div><div className="text-xs text-slate-500" dir="ltr">{t.phone}</div></td>
                    <td className="td">{t.ends_at ? <>حتى {fmtDate(t.ends_at)}<div className="text-xs text-slate-500">{t.auto_renew ? 'تجديد تلقائي' : 'تجديد يدوي'}</div></> : '—'}</td>
                    <td className="td">{t.gates}</td>
                    <td className="td">{t.cameras_online}/{t.cameras}</td>
                    <td className="td">{t.vehicles}/{t.max_vehicles ?? '—'}</td>
                    <td className="td">
                      {t.status === 'suspended' ? <Badge tone="gray">موقوف</Badge> : t.can_access ? <Badge tone="green">فعال</Badge> : <Badge tone="red">منتهي</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!form} onClose={() => setForm(null)} title="إضافة مجمع / منشأة" wide>
        {form && (
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <Field label="اسم المجمع أو المنشأة *" className="sm:col-span-2"><input className="input" required value={form.name} onChange={set('name')} /></Field>
            <Field label="اسم المسؤول"><input className="input" value={form.contact_name} onChange={set('contact_name')} /></Field>
            <Field label="الجوال (يُستخدم لربط مدفوعات سلة)"><input className="input" dir="ltr" value={form.phone} onChange={set('phone')} /></Field>
            <Field label="البريد الإلكتروني"><input className="input" dir="ltr" type="email" value={form.email} onChange={set('email')} /></Field>
            <Field label="المدينة"><input className="input" value={form.city} onChange={set('city')} /></Field>
            <Field label="الدولة"><select className="input" value={form.country} onChange={set('country')}>{COUNTRIES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>

            <div className="mt-2 text-sm font-bold sm:col-span-2">الاشتراك</div>
            <Field label="بداية الاشتراك"><input className="input" type="date" value={form.subscription.starts_at} onChange={setSub('starts_at')} /></Field>
            <Field label="نهاية الاشتراك"><input className="input" type="date" value={form.subscription.ends_at} onChange={setSub('ends_at')} /></Field>
            <Field label="الحد الأقصى للسيارات"><input className="input" type="number" min="1" value={form.subscription.max_vehicles} onChange={setSub('max_vehicles')} /></Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" className="size-4 accent-brand-600" checked={form.subscription.auto_renew} onChange={setSub('auto_renew')} />تجديد تلقائي عند الدفع عبر سلة</label>

            <div className="mt-2 text-sm font-bold sm:col-span-2">حساب مدير المجمع (للدخول إلى app.arakom.sa)</div>
            <Field label="اسم المستخدم (إنجليزي)"><input className="input" dir="ltr" autoCapitalize="off" value={form.admin_username} onChange={set('admin_username')} placeholder="مثال: yasmin-compound" /></Field>
            <Field label="كلمة المرور"><input className="input" dir="ltr" value={form.admin_password} onChange={set('admin_password')} /></Field>

            <div className="mt-3 flex gap-2 sm:col-span-2">
              <button type="button" className="btn-ghost flex-1" onClick={() => setForm(null)}>إلغاء</button>
              <button className="btn-primary flex-1" disabled={busy}>إنشاء</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!created} onClose={() => { nav(`/tenants/${created.id}`); setCreated(null); }} title="بيانات دخول مدير المجمع">
        {created && <>
          <p className="mb-3 text-sm">أرسل هذه البيانات لمدير المجمع. لن تظهر كلمة المرور مرة أخرى.</p>
          <div className="rounded-xl bg-slate-100 p-4 font-mono text-sm dark:bg-ink-800" dir="ltr">
            https://app.arakom.sa<br />User: <b>{created.username}</b><br />Pass: <b>{created.password}</b>
          </div>
          <button type="button" className="btn-primary mt-4 w-full" onClick={() => { nav(`/tenants/${created.id}`); setCreated(null); }}>متابعة لإضافة البوابات</button>
        </>}
      </Modal>
    </>
  );
}
