import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { fmtDate, fmtDateTime, randomPassword, timeAgo, DURATIONS, durationLabel, daysLeftText } from '../lib/format';
import { Badge, Empty, Field, Icon, Modal, OnlineDot, PageHeader, Spinner, useAction } from '../components/ui';

export default function TenantDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [modal, setModal] = useState(null); // { type, data }
  const [run, busy] = useAction();

  const load = useCallback(() => api(`/admin/tenants/${id}`).then(setD), [id]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <Spinner />;
  const { tenant: t, subscription: s } = d;
  const close = () => setModal(null);
  const done = (ok) => { if (ok) { close(); load(); } };
  const form = modal?.data;
  const setF = (k) => (e) => setModal({ ...modal, data: { ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value } });

  const toggleStatus = () => run(() => api(`/admin/tenants/${id}`, { method: 'PATCH', body: { status: t.status === 'active' ? 'suspended' : 'active' } }),
    t.status === 'active' ? 'تم إيقاف المجمع' : 'تم تفعيل المجمع').then(load);
  const remove = async () => {
    if (window.prompt(`لحذف المجمع وكل بياناته نهائياً اكتب اسمه: ${t.name}`) !== t.name) return;
    if (await run(() => api(`/admin/tenants/${id}`, { method: 'DELETE' }), 'تم الحذف')) nav('/tenants');
  };

  const submit = (e) => {
    e.preventDefault();
    const m = modal.type;
    if (m === 'info') return run(() => api(`/admin/tenants/${id}`, { method: 'PATCH', body: form }), 'تم الحفظ').then(done);
    if (m === 'sub') return run(() => api(`/admin/tenants/${id}/subscription`, { method: 'PATCH', body: form }), 'تم تحديث الاشتراك').then(done);
    if (m === 'extend') return run(() => api(`/admin/tenants/${id}/subscription/extend`, { body: form }), `تمت إضافة ${durationLabel(form.months)} للاشتراك`).then(done);
    if (m === 'gate') return run(() => (form.id ? api(`/admin/gates/${form.id}`, { method: 'PATCH', body: form }) : api(`/admin/tenants/${id}/gates`, { body: form })), 'تم الحفظ').then(done);
    if (m === 'user') return run(() => api(`/admin/tenants/${id}/users`, { body: form }), 'تم إنشاء الحساب').then(done);
    if (m === 'reset') return run(() => api(`/admin/users/${form.id}`, { method: 'PATCH', body: { password: form.password } }), 'تم تغيير كلمة المرور').then(done);
    return null;
  };

  return (
    <>
      <PageHeader title={t.name}
        subtitle={<><Link to="/tenants" className="hover:underline">المجمعات</Link> / {t.city || '—'} · أُنشئ {fmtDate(t.created_at)}</>}
        actions={<>
          <button type="button" className="btn-ghost" onClick={() => setModal({ type: 'info', data: { ...t } })}><Icon name="edit" className="size-4" />تعديل البيانات</button>
          <button type="button" className={t.status === 'active' ? 'btn-ghost text-amber-700' : 'btn-primary'} onClick={toggleStatus}>{t.status === 'active' ? 'إيقاف المجمع' : 'تفعيل المجمع'}</button>
          <button type="button" className="btn-ghost text-rose-600" onClick={remove}><Icon name="trash" className="size-4" />حذف</button>
        </>} />

      {t.status === 'suspended' && <div className="mb-4 rounded-2xl bg-slate-200 p-3 text-sm font-semibold dark:bg-ink-800">المجمع موقوف: لا يستطيع الدخول للوحة، ولا تُفتح البوابات تلقائياً.</div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-5">
          <h2 className="mb-3 font-bold">بيانات التواصل</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">المسؤول</dt><dd>{t.contact_name || '—'}</dd>
            <dt className="text-slate-500">الجوال</dt><dd dir="ltr" className="text-end">{t.phone || '—'}</dd>
            <dt className="text-slate-500">البريد</dt><dd dir="ltr" className="truncate text-end">{t.email || '—'}</dd>
            <dt className="text-slate-500">عميل سلة</dt><dd>{t.salla_customer_id || 'غير مرتبط'}</dd>
            <dt className="text-slate-500">السيارات</dt><dd>{d.vehicles}</dd>
          </dl>
        </section>

        <section className="card p-5 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">الاشتراك</h2>
            <div className="flex gap-2">
              <button type="button" className="btn-primary btn-sm" onClick={() => setModal({ type: 'extend', data: { months: 1 } })}><Icon name="plus" className="size-4" />إضافة مدة</button>
              {s && <button type="button" className="btn-ghost btn-sm" onClick={() => setModal({ type: 'sub', data: { ends_at: s.ends_at, max_vehicles: s.max_vehicles ?? '', grace_days: s.grace_days ?? 0 } })}>تعديل</button>}
              {s && <button type="button" className="btn-ghost btn-sm text-rose-600" onClick={() => window.confirm('إلغاء الاشتراك؟ ستتوقف البوابات عن الفتح التلقائي فوراً.') && run(() => api(`/admin/tenants/${id}/subscription`, { method: 'DELETE' }), 'تم إلغاء الاشتراك').then(load)}>إلغاء</button>}
            </div>
          </div>
          {!s ? (
            <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              لا يوجد اشتراك بعد. سيُضاف تلقائياً عند الدفع في متجر سلة، أو اضغط «إضافة مدة».
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className={`text-3xl font-bold tabular-nums ${s.days_left < 0 ? 'text-rose-600' : s.days_left <= 7 ? 'text-amber-600' : 'text-brand-600 dark:text-brand-500'}`}>
                    {s.days_left < 0 ? 0 : s.days_left}<span className="ms-1 text-base font-semibold">يوم</span>
                  </div>
                  <div className="text-sm text-slate-500">{daysLeftText(s.days_left)}</div>
                </div>
                <Badge tone={s.can_access ? 'green' : 'red'}>{s.can_access ? 'فعال' : 'منتهٍ'}</Badge>
              </div>
              <DaysBar sub={s} />
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Info label="من">{fmtDate(s.starts_at)}</Info>
                <Info label="إلى">{fmtDate(s.ends_at)}</Info>
                <Info label="آخر مدة">{durationLabel(s.duration_months)}</Info>
                <Info label="الحد الأقصى للسيارات">{s.max_vehicles ?? 'بدون حد'}</Info>
              </div>
            </>
          )}
        </section>
      </div>

      <section className="mt-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">البوابات والكاميرات</h2>
          <button type="button" className="btn-primary btn-sm" onClick={() => setModal({ type: 'gate', data: { name: '', code: '', relay_id: 1, auto_open: true } })}><Icon name="plus" className="size-4" />بوابة جديدة</button>
        </div>
        {!d.gates.length ? <div className="card"><Empty>لا توجد بوابات. أضف بوابة ثم اربط بها كاميرتي الدخول والخروج من صفحة الكاميرات.</Empty></div> : (
          <div className="grid gap-4 md:grid-cols-2">
            {d.gates.map((g) => (
              <div key={g.id} className="card p-5">
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <div className="font-bold">{g.name}</div>
                    <div className="font-mono text-xs text-slate-500" dir="ltr">arakom/gates/{g.code}/readings</div>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setModal({ type: 'gate', data: { ...g } })}><Icon name="edit" className="size-4" /></button>
                    <button type="button" className="btn-ghost btn-sm text-rose-600" onClick={() => window.confirm('حذف البوابة؟ ستُفك الكاميرات المرتبطة بها.') && run(() => api(`/admin/gates/${g.id}`, { method: 'DELETE' }), 'تم الحذف').then(load)}><Icon name="trash" className="size-4" /></button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {['in', 'out'].map((dir) => {
                    const c = g.cameras?.find((x) => x.direction === dir);
                    return (
                      <div key={dir} className="rounded-xl border border-slate-200 p-3 dark:border-ink-700">
                        <div className="mb-1 font-semibold">{dir === 'in' ? 'كاميرا الدخول' : 'كاميرا الخروج'}</div>
                        {c ? <><div className="font-mono text-xs" dir="ltr">{c.sn}</div><OnlineDot online={c.is_online} /><div className="text-[11px] text-slate-500">{timeAgo(c.last_seen_at)}</div></>
                          : <Link to="/cameras" className="text-xs text-brand-600 underline">ربط كاميرا</Link>}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>ريليه رقم {g.relay_id} · الفتح التلقائي {g.auto_open ? 'مفعل' : 'معطل'}</span>
                  <span className="flex gap-1">
                    <button type="button" className="btn-ghost btn-sm" onClick={() => run(() => api(`/admin/gates/${g.id}/open`, { body: { direction: 'in' } }), 'تم إرسال أمر الفتح')}>فتح الدخول</button>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => run(() => api(`/admin/gates/${g.id}/open`, { body: { direction: 'out' } }), 'تم إرسال أمر الفتح')}>فتح الخروج</button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">حسابات الدخول</h2>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setModal({ type: 'user', data: { username: '', full_name: '', password: randomPassword(), role: 'tenant_admin' } })}><Icon name="plus" className="size-4" />حساب</button>
          </div>
          {!d.users.length ? <Empty>لا توجد حسابات</Empty> : (
            <ul className="divide-y divide-slate-100 dark:divide-ink-800">
              {d.users.map((u) => (
                <li key={u.id} className="flex items-center gap-2 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold" dir="ltr" style={{ textAlign: 'right' }}>{u.username}</div>
                    <div className="text-xs text-slate-500">{u.role === 'tenant_admin' ? 'مدير' : 'حارس'} · {u.last_login_at ? `آخر دخول ${timeAgo(u.last_login_at)}` : 'لم يدخل بعد'}</div>
                  </div>
                  <Badge tone={u.active ? 'green' : 'gray'}>{u.active ? 'نشط' : 'موقوف'}</Badge>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setModal({ type: 'reset', data: { id: u.id, username: u.username, password: randomPassword() } })}>كلمة مرور</button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => run(() => api(`/admin/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } })).then(load)}>{u.active ? 'إيقاف' : 'تفعيل'}</button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-bold">المدفوعات (سلة)</h2>
          {!d.payments.length ? <Empty>لا توجد مدفوعات</Empty> : (
            <ul className="divide-y divide-slate-100 text-sm dark:divide-ink-800">
              {d.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2.5">
                  <span>طلب #{p.order_id} · {p.amount ?? '—'} {p.currency}</span>
                  <span className="flex items-center gap-2 text-xs text-slate-500">{fmtDateTime(p.created_at)}<Badge tone={p.status === 'applied' ? 'green' : 'amber'}>{p.status === 'applied' ? `+${p.months_added} شهر` : 'معلق'}</Badge></span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Modal open={!!modal} onClose={close} title={{ info: 'تعديل بيانات المجمع', sub: 'تعديل الاشتراك', extend: 'إضافة مدة للاشتراك', gate: form?.id ? 'تعديل البوابة' : 'بوابة جديدة', user: 'حساب دخول جديد', reset: 'تعيين كلمة مرور جديدة' }[modal?.type]}>
        {form && (
          <form onSubmit={submit} className="grid gap-3">
            {modal.type === 'info' && <>
              <Field label="الاسم"><input className="input" required value={form.name ?? ''} onChange={setF('name')} /></Field>
              <Field label="اسم المسؤول"><input className="input" value={form.contact_name ?? ''} onChange={setF('contact_name')} /></Field>
              <Field label="الجوال"><input className="input" dir="ltr" value={form.phone ?? ''} onChange={setF('phone')} /></Field>
              <Field label="البريد"><input className="input" dir="ltr" value={form.email ?? ''} onChange={setF('email')} /></Field>
              <Field label="المدينة"><input className="input" value={form.city ?? ''} onChange={setF('city')} /></Field>
              <Field label="معرّف العميل في سلة (اختياري)"><input className="input" dir="ltr" value={form.salla_customer_id ?? ''} onChange={setF('salla_customer_id')} /></Field>
              <Field label="ملاحظات"><textarea className="input" rows="2" value={form.notes ?? ''} onChange={setF('notes')} /></Field>
            </>}
            {modal.type === 'sub' && <>
              <Field label="تاريخ الانتهاء"><input className="input" type="date" required value={form.ends_at} onChange={setF('ends_at')} /></Field>
              <Field label="الحد الأقصى للسيارات (اتركه فارغاً = بدون حد)"><input className="input" type="number" min="1" value={form.max_vehicles} onChange={setF('max_vehicles')} /></Field>
              <Field label="أيام سماح بعد الانتهاء"><input className="input" type="number" min="0" value={form.grace_days} onChange={setF('grace_days')} /></Field>
            </>}
            {modal.type === 'extend' && <>
              <p className="text-sm text-slate-600 dark:text-slate-300">تُضاف المدة إلى نهاية الاشتراك الحالي، أو تبدأ من اليوم إن كان منتهياً.</p>
              <div className="grid grid-cols-2 gap-2">
                {DURATIONS.map(([m, label]) => (
                  <button key={m} type="button" onClick={() => setModal({ ...modal, data: { months: m } })}
                    className={`rounded-xl border-2 p-3 text-center font-bold transition ${Number(form.months) === m ? 'border-brand-500 bg-brand-50 text-brand-600 dark:bg-ink-800 dark:text-brand-500' : 'border-slate-200 dark:border-ink-700'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </>}
            {modal.type === 'gate' && <>
              <Field label="اسم البوابة"><input className="input" required value={form.name} onChange={setF('name')} placeholder="البوابة الرئيسية" /></Field>
              <Field label="رمز البوابة {gate_id} (إنجليزي، فريد)"><input className="input" dir="ltr" required pattern="[A-Za-z0-9_\-]{2,40}" value={form.code} onChange={setF('code')} placeholder="yasmin-main" /></Field>
              <Field label="رقم الريليه"><input className="input" type="number" min="1" value={form.relay_id} onChange={setF('relay_id')} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-brand-600" checked={!!form.auto_open} onChange={setF('auto_open')} />فتح تلقائي للسيارات المسموح لها</label>
            </>}
            {modal.type === 'user' && <>
              <Field label="الاسم"><input className="input" value={form.full_name} onChange={setF('full_name')} /></Field>
              <Field label="اسم المستخدم"><input className="input" dir="ltr" required value={form.username} onChange={setF('username')} /></Field>
              <Field label="كلمة المرور"><input className="input" dir="ltr" required minLength={8} value={form.password} onChange={setF('password')} /></Field>
              <Field label="الصلاحية"><select className="input" value={form.role} onChange={setF('role')}><option value="tenant_admin">مدير المجمع</option><option value="tenant_guard">حارس</option></select></Field>
            </>}
            {modal.type === 'reset' && <Field label={`كلمة المرور الجديدة لـ ${form.username}`}><input className="input" dir="ltr" required minLength={8} value={form.password} onChange={setF('password')} /></Field>}
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

// شريط يوضح المستهلك والمتبقي من مدة الاشتراك
function DaysBar({ sub }) {
  const total = Math.max(1, Math.round((new Date(sub.ends_at) - new Date(sub.starts_at)) / 864e5));
  const left = Math.max(0, Math.min(total, sub.days_left));
  const pct = (left / total) * 100;
  return (
    <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-ink-800">
      <div className={`h-full rounded-full ${sub.days_left <= 7 ? 'bg-amber-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const Info = ({ label, children }) => (
  <div><div className="mb-1 text-xs text-slate-500 dark:text-slate-400">{label}</div><div className="text-sm font-medium">{children}</div></div>
);
