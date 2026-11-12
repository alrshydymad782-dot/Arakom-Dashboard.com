import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { plateKey } from '../lib/plates';
import { fmtDate, timeAgo, daysLeftText } from '../lib/format';
import { Badge, Empty, Field, Icon, Modal, OnlineDot, PageHeader, Plate, Spinner, useAction } from '../components/ui';
import OpenAllControl from '../components/OpenAllControl';
import { DAY_PRESETS, LinkActions, LockBadge } from './Tenants';

const COLUMN_LABEL = { in: 'عمود الدخول', out: 'عمود الخروج' };

export default function TenantDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [cars, setCars] = useState(null);
  const [modal, setModal] = useState(null); // { type, data }
  const [plates, setPlates] = useState({});
  const [run, busy] = useAction();

  const load = useCallback(() => api(`/admin/tenants/${id}`).then(setD), [id]);
  const loadCars = useCallback(() => api(`/admin/tenants/${id}/vehicles`).then((r) => setCars(r.rows)), [id]);
  useEffect(() => { load(); loadCars(); }, [load, loadCars]);

  if (!d) return <Spinner />;
  const { tenant: t, subscription: s } = d;
  const view = { ...t, ends_at: s?.ends_at, days_left: s?.days_left, can_access: !!s?.can_access };
  const close = () => setModal(null);
  const done = (ok) => { if (ok) { close(); load(); } };
  const form = modal?.data;
  const setF = (k) => (e) => setModal({ ...modal, data: { ...form, [k]: e.target.value } });

  const addDays = (days) => run(() => api(`/admin/tenants/${id}/subscription/days`, { body: { days } }), `تمت إضافة ${days} يوم`).then(done);
  const toggleStatus = () => run(() => api(`/admin/tenants/${id}`, { method: 'PATCH', body: { status: t.status === 'active' ? 'suspended' : 'active' } }),
    t.status === 'active' ? 'تم إيقاف لوحة العميل' : 'تم تفعيل لوحة العميل').then(load);
  const remove = async () => {
    if (window.prompt(`لحذف العميل وكل بياناته نهائياً اكتب اسمه: ${t.name}`) !== t.name) return;
    if (await run(() => api(`/admin/tenants/${id}`, { method: 'DELETE' }), 'تم الحذف')) nav('/tenants');
  };
  const newLink = () => window.confirm('إنشاء رابط جديد؟ الرابط القديم سيتوقف فوراً ويجب إرسال الجديد للعميل.')
    && run(() => api(`/admin/tenants/${id}/link`, { method: 'POST' }), 'تم إنشاء رابط جديد').then(load);

  const submit = (e) => {
    e.preventDefault();
    const m = modal.type;
    if (m === 'info') return run(() => api(`/admin/tenants/${id}`, { method: 'PATCH', body: form }), 'تم الحفظ').then(done);
    if (m === 'days') return addDays(form.days);
    if (m === 'end') return run(() => api(`/admin/tenants/${id}/subscription`, { method: 'PATCH', body: form }), 'تم تعديل تاريخ الانتهاء').then(done);
    if (m === 'gate') return run(() => (form.id ? api(`/admin/gates/${form.id}`, { method: 'PATCH', body: form }) : api(`/admin/tenants/${id}/gates`, { body: form })), 'تم حفظ البوابة').then(done);
    return null;
  };

  const savePlate = (v) => run(() => api(`/admin/vehicles/${v.id}`, { method: 'PATCH', body: { plate: plates[v.id] } }), 'تم حفظ رقم اللوحة').then((ok) => ok && loadCars());
  const deleteCar = (v) => window.confirm('حذف هذه السيارة؟') && run(() => api(`/admin/vehicles/${v.id}`, { method: 'DELETE' }), 'تم الحذف').then(loadCars);

  return (
    <>
      <PageHeader title={t.name}
        subtitle={<><Link to="/tenants" className="hover:underline">العملاء</Link>{t.city ? ` / ${t.city}` : ''}{t.phone ? ` · ${t.phone}` : ''}</>}
        actions={<>
          <LockBadge t={view} />
          <button type="button" className="btn-ghost" onClick={() => setModal({ type: 'info', data: { name: t.name, contact_name: t.contact_name ?? '', phone: t.phone ?? '', city: t.city ?? '', notes: t.notes ?? '' } })}><Icon name="edit" className="size-4" />البيانات</button>
          <button type="button" className={t.status === 'active' ? 'btn-ghost text-amber-700' : 'btn-primary'} onClick={toggleStatus}>{t.status === 'active' ? 'إيقاف اللوحة' : 'تفعيل اللوحة'}</button>
          <button type="button" className="btn-ghost text-rose-600" onClick={remove}><Icon name="trash" className="size-4" /></button>
        </>} />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* رابط لوحة العميل */}
        <section className="card p-5">
          <h2 className="mb-2 font-bold">رابط لوحة العميل</h2>
          <div className="mb-3 break-all rounded-xl bg-slate-100 p-3 font-mono text-xs dark:bg-ink-800" dir="ltr">{d.link}</div>
          <LinkActions link={d.link} name={t.contact_name || t.name} phone={t.phone} />
          <button type="button" className="mt-3 text-xs font-semibold text-slate-500 hover:text-rose-600" onClick={newLink}>إنشاء رابط جديد (يُلغي الرابط القديم)</button>
        </section>

        {/* الاشتراك بالأيام */}
        <section className="card p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-bold">مدة الاشتراك</h2>
            {s && <button type="button" className="btn-ghost btn-sm" onClick={() => setModal({ type: 'end', data: { ends_at: s.ends_at } })}>تعديل التاريخ</button>}
          </div>
          {s ? (
            <>
              <div className={`text-3xl font-bold tabular-nums ${!s.can_access ? 'text-rose-600' : s.days_left <= 5 ? 'text-amber-600' : 'text-brand-600 dark:text-brand-500'}`}>
                {Math.max(0, s.days_left)} <span className="text-base">يوم</span>
              </div>
              <div className="text-sm text-slate-500">{s.can_access ? `${daysLeftText(s.days_left)} · تُقفل اللوحة تلقائياً بعد ${fmtDate(s.ends_at)}` : `اللوحة مقفلة منذ ${fmtDate(s.ends_at)}`}</div>
            </>
          ) : <p className="text-sm text-amber-700 dark:text-amber-300">لا يوجد اشتراك: لوحة العميل مقفلة. أضف أياماً لفتحها.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {DAY_PRESETS.map((n) => <button key={n} type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => addDays(n)}>+{n} يوم</button>)}
            <button type="button" className="btn-ghost btn-sm" onClick={() => setModal({ type: 'days', data: { days: 30 } })}>عدد آخر</button>
            {s?.can_access && <button type="button" className="btn-ghost btn-sm text-rose-600" onClick={() => window.confirm('إنهاء الاشتراك الآن؟ تُقفل لوحة العميل فوراً.') && run(() => api(`/admin/tenants/${id}/subscription`, { method: 'DELETE' }), 'تم إنهاء الاشتراك').then(load)}>إنهاء الآن</button>}
          </div>
        </section>
      </div>

      {/* البوابات */}
      <section className="mt-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">البوابات</h2>
          <button type="button" className="btn-primary btn-sm" onClick={() => setModal({ type: 'gate', data: { name: '', columns: 2 } })}><Icon name="plus" className="size-4" />بوابة جديدة</button>
        </div>
        {!d.gates.length ? <div className="card"><Empty>لا توجد بوابات. أضف بوابة واختر عموداً واحداً (دخول) أو عمودين (دخول وخروج).</Empty></div> : (
          <div className="grid gap-4 md:grid-cols-2">
            {d.gates.map((g) => {
              const dirs = g.columns === 1 ? ['in'] : ['in', 'out'];
              return (
                <div key={g.id} className="card p-5">
                  <div className="mb-3 flex items-start justify-between">
                    <div>
                      <div className="font-bold">{g.name}</div>
                      <div className="text-xs text-slate-500">{g.columns === 1 ? 'عمود واحد: دخول فقط' : 'عمودان: دخول وخروج'}</div>
                    </div>
                    <div className="flex gap-1">
                      <button type="button" className="btn-ghost btn-sm" onClick={() => setModal({ type: 'gate', data: { id: g.id, name: g.name, columns: g.columns } })}><Icon name="edit" className="size-4" /></button>
                      <button type="button" className="btn-ghost btn-sm text-rose-600" onClick={() => window.confirm('حذف البوابة؟') && run(() => api(`/admin/gates/${g.id}`, { method: 'DELETE' }), 'تم الحذف').then(load)}><Icon name="trash" className="size-4" /></button>
                    </div>
                  </div>
                  <div className={`grid gap-2 text-sm ${dirs.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {dirs.map((dir) => {
                      const c = g.cameras?.find((x) => x.direction === dir);
                      return (
                        <div key={dir} className="rounded-xl border border-slate-200 p-3 dark:border-ink-700">
                          <div className="mb-1 font-semibold">{COLUMN_LABEL[dir]}</div>
                          {c ? <><div className="font-mono text-xs" dir="ltr">{c.sn}</div><OnlineDot online={c.is_online} /><div className="text-[11px] text-slate-500">{timeAgo(c.last_seen_at)}</div></>
                            : <Link to="/cameras" className="text-xs text-brand-600 underline">ربط كاميرا</Link>}
                          <button type="button" className="btn-ghost btn-sm mt-2 w-full" onClick={() => run(() => api(`/admin/gates/${g.id}/open`, { body: { direction: dir } }), 'تم إرسال أمر الفتح')}>فتح</button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3"><OpenAllControl gate={g} base="/admin" compact onChange={load} /></div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* السيارات */}
      <section className="card mt-4 overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3 font-bold dark:border-ink-700">السيارات المسجلة ({cars?.length ?? '…'})</div>
        {!cars ? <Spinner /> : !cars.length ? <Empty>لم يضف العميل سيارات بعد</Empty> : (
          <ul className="divide-y divide-slate-100 dark:divide-ink-800">
            {cars.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                {v.plate_key ? <Plate plateKey={v.plate_key} /> : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="amber">بانتظار رقم اللوحة</Badge>
                    <input className="input w-40" placeholder="اكتب الرقم من الصورة" value={plates[v.id] || ''} onChange={(e) => setPlates({ ...plates, [v.id]: e.target.value })} />
                    {plates[v.id] && <Plate plateKey={plateKey(plates[v.id])} />}
                    <button type="button" className="btn-primary btn-sm" disabled={!plates[v.id] || busy} onClick={() => savePlate(v)}>حفظ</button>
                  </div>
                )}
                <span className="flex-1 text-xs text-slate-500">{v.last_seen_at ? `آخر دخول ${timeAgo(v.last_seen_at)}` : ''}</span>
                {v.document_path && (
                  <a href={`/api/admin/vehicles/${v.id}/document`} target="_blank" rel="noopener" className="overflow-hidden rounded-lg border border-slate-200 dark:border-ink-700">
                    {v.document_type === 'application/pdf'
                      ? <span className="flex h-10 w-12 items-center justify-center bg-rose-50 text-[10px] font-bold text-rose-600">PDF</span>
                      : <img src={`/api/admin/vehicles/${v.id}/document`} alt="" className="h-10 w-12 object-cover" />}
                  </a>
                )}
                <button type="button" className="btn-ghost btn-sm text-rose-600" onClick={() => deleteCar(v)}><Icon name="trash" className="size-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal open={!!modal} onClose={close} title={{ info: 'بيانات العميل', days: 'إضافة أيام', end: 'تاريخ انتهاء الاشتراك', gate: form?.id ? 'تعديل البوابة' : 'بوابة جديدة' }[modal?.type]}>
        {form && (
          <form onSubmit={submit} className="grid gap-3">
            {modal.type === 'info' && <>
              <Field label="الاسم"><input className="input" required value={form.name} onChange={setF('name')} /></Field>
              <Field label="اسم المسؤول"><input className="input" value={form.contact_name} onChange={setF('contact_name')} /></Field>
              <Field label="الجوال"><input className="input" dir="ltr" value={form.phone} onChange={setF('phone')} /></Field>
              <Field label="المدينة"><input className="input" value={form.city} onChange={setF('city')} /></Field>
              <Field label="ملاحظات"><textarea className="input" rows="2" value={form.notes} onChange={setF('notes')} /></Field>
            </>}
            {modal.type === 'days' && <Field label="عدد الأيام المضافة"><input className="input" type="number" min="1" max="3650" required value={form.days} onChange={setF('days')} /></Field>}
            {modal.type === 'end' && <Field label="تُقفل لوحة العميل بعد هذا التاريخ"><input className="input" type="date" required value={form.ends_at} onChange={setF('ends_at')} /></Field>}
            {modal.type === 'gate' && <>
              <Field label="اسم البوابة"><input className="input" required value={form.name} onChange={setF('name')} placeholder="البوابة الرئيسية" /></Field>
              <span className="label">عدد الأعمدة</span>
              <div className="grid grid-cols-2 gap-2">
                {[[1, 'عمود واحد', 'دخول فقط'], [2, 'عمودان', 'دخول وخروج']].map(([n, title, sub]) => (
                  <button key={n} type="button" onClick={() => setModal({ ...modal, data: { ...form, columns: n } })}
                    className={`rounded-xl border-2 p-3 text-center transition ${Number(form.columns) === n ? 'border-brand-500 bg-brand-50 dark:bg-ink-800' : 'border-slate-200 dark:border-ink-700'}`}>
                    <div className="font-bold">{title}</div><div className="text-xs text-slate-500">{sub}</div>
                  </button>
                ))}
              </div>
              {form.id && Number(form.columns) === 1 && <p className="text-xs text-amber-700">تحويل البوابة لعمود واحد يفك كاميرا الخروج منها.</p>}
            </>}
            <div className="mt-2 flex gap-2">
              <button type="button" className="btn-ghost flex-1" onClick={close}>إلغاء</button>
              <button className="btn-primary flex-1" disabled={busy}>حفظ</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
