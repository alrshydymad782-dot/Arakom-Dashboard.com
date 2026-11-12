import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { api } from '../lib/api';
import { fmtDate } from '../lib/format';
import { Spinner } from '../components/ui';
import Layout from '../components/Layout';

const NAV = [
  { to: '/', end: true, icon: 'gate', label: 'البوابات' },
  { to: '/vehicles', icon: 'car', label: 'السيارات' },
];

// غلاف لوحة العميل: يعرض شاشة القفل تلقائياً عند انتهاء الاشتراك
export default function TenantShell() {
  const [st, setSt] = useState(null);
  const check = useCallback(() => api('/tenant/status').then(setSt).catch(() => {}), []);

  useEffect(() => {
    check();
    const onLocked = () => check();
    window.addEventListener('arakom:locked', onLocked);
    // إعادة التحقق كل 5 دقائق (تُقفل اللوحة تلقائياً بعد انتهاء آخر يوم)
    const t = setInterval(check, 5 * 60e3);
    return () => { window.removeEventListener('arakom:locked', onLocked); clearInterval(t); };
  }, [check]);

  if (!st) return <Spinner />;
  if (st.locked) return <LockScreen st={st} />;
  return <Layout nav={NAV} portalName="لوحة التحكم" status={st}><Outlet context={st} /></Layout>;
}

function LockScreen({ st }) {
  const msg = st.reason === 'suspended'
    ? 'تم إيقاف لوحة التحكم من قبل إدارة أراكم.'
    : st.reason === 'no_subscription'
      ? 'لا يوجد اشتراك فعال لهذه اللوحة بعد.'
      : `انتهت مدة الاشتراك في ${fmtDate(st.ends_at)}.`;
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-ink-950">
      <div className="card w-full max-w-sm p-8 text-center">
        <div className="mx-auto mb-4 w-40 rounded-2xl bg-white p-2"><img src="/logo.png" alt="أراكم" className="w-full" /></div>
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-500/15">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-7"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 1 1 8 0v4" /></svg>
        </div>
        <h1 className="mb-2 text-xl font-bold">لوحة التحكم مقفلة</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">{st.tenant_name}</p>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{msg}</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">البوابات لا تُفتح تلقائياً حتى التجديد. تواصل مع أراكم للتجديد.</p>
        <button type="button" className="btn-ghost mt-5" onClick={() => window.location.reload()}>تحديث</button>
      </div>
    </div>
  );
}
