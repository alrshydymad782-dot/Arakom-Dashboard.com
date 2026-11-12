import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDate, timeAgo, randomPassword, daysLeftText, durationLabel } from '../lib/format';
import { Badge, Empty, Field, Icon, Modal, PageHeader, Spinner, useAction } from '../components/ui';
import OpenAllControl from '../components/OpenAllControl';

export default function Settings() {
  const { user } = useAuth();
  const isAdmin = user.role === 'tenant_admin';
  const [sub, setSub] = useState(undefined);
  const [gates, setGates] = useState(null);
  const [users, setUsers] = useState(null);
  const [newUser, setNewUser] = useState(null);
  const [pw, setPw] = useState(null);
  const [run, busy] = useAction();

  const load = useCallback(() => {
    api('/tenant/subscription').then(setSub);
    api('/tenant/gates').then(setGates);
    if (isAdmin) api('/tenant/users').then(setUsers);
  }, [isAdmin]);
  useEffect(() => { load(); }, [load]);


  const addUser = async (e) => {
    e.preventDefault();
    if (await run(() => api('/tenant/users', { body: newUser }), 'تم إنشاء الحساب')) { setNewUser(null); load(); }
  };
  const toggleUser = (u) => run(() => api(`/tenant/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } })).then(load);
  const changePw = async (e) => {
    e.preventDefault();
    if (await run(() => api('/auth/password', { body: pw }), 'تم تغيير كلمة المرور')) setPw(null);
  };

  return (
    <>
      <PageHeader title="الحسابات والإعدادات" />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 font-bold">الاشتراك</h2>
          {sub === undefined ? <Spinner /> : !sub ? (
            <p className="text-sm text-slate-500">لا يوجد اشتراك بعد. اشترك من متجر أراكم على سلة باستخدام نفس رقم الجوال المسجل لدينا، وسيُفعّل تلقائياً.</p>
          ) : (
            <>
              <div className={`text-2xl font-bold ${sub.can_access ? 'text-brand-600 dark:text-brand-500' : 'text-rose-600'}`}>{daysLeftText(sub.days_left)}</div>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <dt className="text-slate-500">الحالة</dt><dd><Badge tone={sub.can_access ? 'green' : 'red'}>{sub.can_access ? 'فعال' : 'منتهٍ'}</Badge></dd>
                <dt className="text-slate-500">مدة آخر اشتراك</dt><dd>{durationLabel(sub.duration_months)}</dd>
                <dt className="text-slate-500">من</dt><dd>{fmtDate(sub.starts_at)}</dd>
                <dt className="text-slate-500">إلى</dt><dd>{fmtDate(sub.ends_at)}</dd>
                {sub.max_vehicles && <><dt className="text-slate-500">الحد الأقصى للسيارات</dt><dd>{sub.max_vehicles}</dd></>}
              </dl>
              <p className="mt-3 text-xs text-slate-500">للتجديد: اشترك من متجر أراكم على سلة، وتُضاف المدة تلقائياً إلى الأيام المتبقية.</p>
            </>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-3 font-bold">الفتح التلقائي للبوابات</h2>
          {!gates ? <Spinner /> : !gates.length ? <Empty /> : gates.map((g) => (
            <div key={g.id} className="mb-3 last:mb-0">
              <div className="mb-2 font-semibold">{g.name}</div>
              <OpenAllControl gate={g} onChange={(r) => setGates((gs) => gs.map((x) => (x.id === r.id ? { ...x, ...r } : x)))} />
            </div>
          ))}
        </section>

        {isAdmin && (
          <section className="card p-5 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">حسابات الموظفين</h2>
              <button type="button" className="btn-primary btn-sm" onClick={() => setNewUser({ email: '', phone: '', full_name: '', password: randomPassword(), role: 'tenant_guard' })}>
                <Icon name="plus" className="size-4" />حساب جديد
              </button>
            </div>
            {!users ? <Spinner /> : (
              <ul className="divide-y divide-slate-100 dark:divide-ink-800">
                {users.map((u) => (
                  <li key={u.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{u.full_name || u.email || u.phone}</div>
                      <div className="text-xs text-slate-500" dir="ltr" style={{ textAlign: 'right' }}>{[u.email, u.phone].filter(Boolean).join(' · ')}</div>
                      <div className="text-xs text-slate-500">{u.role === 'tenant_admin' ? 'مدير المجمع' : 'حارس / موظف أمن'} · آخر دخول {u.last_login_at ? timeAgo(u.last_login_at) : 'لم يدخل بعد'}</div>
                    </div>
                    <Badge tone={u.active ? 'green' : 'gray'}>{u.active ? 'نشط' : 'موقوف'}</Badge>
                    {u.id !== user.id && <button type="button" className="btn-ghost btn-sm" onClick={() => toggleUser(u)}>{u.active ? 'إيقاف' : 'تفعيل'}</button>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="card p-5">
          <h2 className="mb-3 font-bold">حسابي</h2>
          <p className="mb-3 text-sm text-slate-500">تدخل بالبريد الإلكتروني أو رقم الجوال المسجلين لحسابك.</p>
          <button type="button" className="btn-ghost" onClick={() => setPw({ current: '', next: '' })}>تغيير كلمة المرور</button>
        </section>
      </div>

      <Modal open={!!newUser} onClose={() => setNewUser(null)} title="حساب موظف جديد">
        {newUser && (
          <form onSubmit={addUser} className="grid gap-3">
            <Field label="الاسم"><input className="input" value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })} /></Field>
            <Field label="البريد الإلكتروني"><input className="input" dir="ltr" type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} /></Field>
            <Field label="رقم الجوال"><input className="input" dir="ltr" type="tel" placeholder="05xxxxxxxx" value={newUser.phone} onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })} /></Field>
            <Field label="كلمة المرور"><input className="input" dir="ltr" required minLength={8} value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} /></Field>
            <p className="text-xs text-slate-500">يدخل الموظف بالبريد أو الجوال مع كلمة المرور هذه.</p>
            <Field label="الصلاحية">
              <select className="input" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                <option value="tenant_guard">حارس: يرى الحركة ويفتح البوابة فقط</option>
                <option value="tenant_admin">مدير: صلاحيات كاملة</option>
              </select>
            </Field>
            <button className="btn-primary mt-2" disabled={busy}>إنشاء</button>
          </form>
        )}
      </Modal>
      <Modal open={!!pw} onClose={() => setPw(null)} title="تغيير كلمة المرور">
        {pw && (
          <form onSubmit={changePw} className="grid gap-3">
            <Field label="كلمة المرور الحالية"><input className="input" type="password" dir="ltr" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
            <Field label="كلمة المرور الجديدة (8 أحرف على الأقل)"><input className="input" type="password" dir="ltr" required minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
            <button className="btn-primary mt-2" disabled={busy}>حفظ</button>
          </form>
        )}
      </Modal>
    </>
  );
}
