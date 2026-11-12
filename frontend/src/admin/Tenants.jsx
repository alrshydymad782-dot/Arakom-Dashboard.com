import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { daysLeftText, fmtDate, bytes } from '../lib/format';
import { Badge, Empty, Field, Icon, Modal, PageHeader, Spinner, Tabs, useAction, useToast } from '../components/ui';

export const DAY_PRESETS = [30, 90, 180, 365];

// حالة لوحة العميل
export function LockBadge({ t }) {
  if (t.status === 'suspended') return <Badge tone="gray">موقوفة</Badge>;
  if (!t.ends_at) return <Badge tone="amber">بدون اشتراك</Badge>;
  if (!t.can_access) return <Badge tone="red">مقفلة (انتهى)</Badge>;
  return <Badge tone={t.days_left <= 5 ? 'amber' : 'green'}>مفتوحة</Badge>;
}

// نسخ رابط العميل أو إرساله عبر واتساب
export function LinkActions({ link, name, phone }) {
  const toast = useToast();
  const copy = () => navigator.clipboard?.writeText(link).then(() => toast('تم نسخ رابط العميل'), () => toast('انسخ الرابط يدوياً', 'err'));
  const msg = encodeURIComponent(`مرحباً ${name || ''}،\nهذا رابط لوحة التحكم الخاصة ببواباتك في أراكم:\n${link}\nاحفظه ولا تشاركه مع أحد.`);
  const wa = `https://wa.me/${String(phone || '').replace(/\D/g, '').replace(/^05/, '9665')}?text=${msg}`;
  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" className="btn-ghost btn-sm" onClick={copy}><Icon name="list" className="size-4" />نسخ الرابط</button>
      <a className="btn-ghost btn-sm" href={wa} target="_blank" rel="noopener">واتساب</a>
      <a className="btn-ghost btn-sm" href={link} target="_blank" rel="noopener">فتح</a>
    </div>
  );
}

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
    if (filter === 'open') return t.status === 'active' && t.can_access;
    if (filter === 'locked') return t.status !== 'active' || !t.can_access;
    if (filter === 'soon') return t.can_access && t.days_left <= 7;
    return true;
  }), [rows, q, filter]);

  const submit = async (e) => {
    e.preventDefault();
    const r = await run(() => api('/admin/tenants', { body: form }), 'تم إنشاء لوحة العميل');
    if (r) { setCreated({ ...r, phone: form.phone }); setForm(null); load(); }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <PageHeader title="العملاء ولوحاتهم" subtitle={rows ? `${rows.length} عميل` : ''}
        actions={<button type="button" className="btn-primary" onClick={() => setForm({ name: '', contact_name: '', phone: '', city: '', notes: '', days: 30 })}>
          <Icon name="plus" className="size-4" />عميل جديد</button>} />

      <div className="mb-4 flex flex-wrap gap-3">
        <input className="input min-w-60 flex-1" placeholder="بحث بالاسم أو المدينة أو الجوال" value={q} onChange={(e) => setQ(e.target.value)} />
        <Tabs value={filter} onChange={setFilter} items={[['', 'الكل'], ['open', 'مفتوحة'], ['soon', 'تنتهي قريباً'], ['locked', 'مقفلة']]} />
      </div>

      <div className="card overflow-hidden">
        {!rows ? <Spinner /> : !list.length ? <Empty>لا يوجد عملاء. أضف أول عميل لإنشاء لوحة تحكمه.</Empty> : (
          <ul className="divide-y divide-slate-100 dark:divide-ink-800">
            {list.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                <Link to={`/tenants/${t.id}`} className="min-w-48 flex-1">
                  <div className="font-bold">{t.name}</div>
                  <div className="text-xs text-slate-500">
                    {t.ends_at ? `${daysLeftText(t.days_left)} · حتى ${fmtDate(t.ends_at)}` : 'بدون اشتراك'} · {t.gates} بوابة · {t.vehicles} سيارة{Number(t.documents_bytes) ? ` (${bytes(t.documents_bytes)})` : ''}
                  </div>
                </Link>
                <LockBadge t={t} />
                <LinkActions link={t.link} name={t.contact_name || t.name} phone={t.phone} />
                <button type="button" className="btn-primary btn-sm" onClick={() => nav(`/tenants/${t.id}`)}>إدارة</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={!!form} onClose={() => setForm(null)} title="عميل جديد">
        {form && (
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <Field label="اسم العميل / المجمع *" className="sm:col-span-2"><input className="input" required value={form.name} onChange={set('name')} /></Field>
            <Field label="اسم المسؤول"><input className="input" value={form.contact_name} onChange={set('contact_name')} /></Field>
            <Field label="الجوال (لإرسال الرابط عبر واتساب)"><input className="input" dir="ltr" type="tel" value={form.phone} onChange={set('phone')} placeholder="05xxxxxxxx" /></Field>
            <Field label="المدينة"><input className="input" value={form.city} onChange={set('city')} /></Field>
            <Field label="ملاحظات"><input className="input" value={form.notes} onChange={set('notes')} /></Field>
            <div className="sm:col-span-2">
              <span className="label">مدة الاشتراك (تُقفل اللوحة تلقائياً بعدها)</span>
              <div className="flex flex-wrap items-center gap-2">
                {DAY_PRESETS.map((d) => (
                  <button key={d} type="button" onClick={() => setForm({ ...form, days: d })}
                    className={`rounded-xl border-2 px-3 py-2 text-sm font-bold ${Number(form.days) === d ? 'border-brand-500 bg-brand-50 text-brand-600 dark:bg-ink-800' : 'border-slate-200 dark:border-ink-700'}`}>{d} يوم</button>
                ))}
                <input className="input w-28" type="number" min="1" max="3650" value={form.days} onChange={set('days')} aria-label="عدد الأيام" />
                <span className="text-sm text-slate-500">يوم</span>
              </div>
            </div>
            <div className="mt-2 flex gap-2 sm:col-span-2">
              <button type="button" className="btn-ghost flex-1" onClick={() => setForm(null)}>إلغاء</button>
              <button className="btn-primary flex-1" disabled={busy}>إنشاء لوحة العميل</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!created} onClose={() => { nav(`/tenants/${created.id}`); setCreated(null); }} title="تم إنشاء لوحة العميل">
        {created && <>
          <p className="mb-2 text-sm">هذا رابط لوحة التحكم الخاصة بـ «{created.name}». أرسله للعميل، ويفتحه مباشرة بدون كلمة مرور:</p>
          <div className="mb-3 break-all rounded-xl bg-slate-100 p-3 font-mono text-xs dark:bg-ink-800" dir="ltr">{created.link}</div>
          <LinkActions link={created.link} name={created.name} phone={created.phone} />
          <button type="button" className="btn-primary mt-4 w-full" onClick={() => { nav(`/tenants/${created.id}`); setCreated(null); }}>التالي: إضافة البوابات</button>
        </>}
      </Modal>
    </>
  );
}
