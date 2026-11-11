import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useLive } from '../lib/realtime';
import { fmtDate, timeAgo } from '../lib/format';
import { Icon, OnlineDot, PageHeader, StatCard, Spinner, Empty, useAction, Modal } from '../components/ui';
import { LogItem, ImageViewer } from '../components/LogsView';
import HourlyChart from '../components/HourlyChart';

export default function Home() {
  const [d, setD] = useState(null);
  const [img, setImg] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [run, busy] = useAction();

  const load = useCallback(() => api('/tenant/dashboard').then(setD), []);
  useEffect(() => { load(); }, [load]);

  // حدث مباشر: عملية دخول/خروج جديدة
  useLive('access:new', useCallback((log) => {
    setD((p) => {
      if (!p) return p;
      const t = { ...p.today, total: p.today.total + 1 };
      if (log.decision === 'opened' && log.direction === 'in') t.entries++;
      if (log.decision === 'opened' && log.direction === 'out') t.exits++;
      if (log.decision === 'denied') t.denied++;
      return { ...p, today: t, recent: [{ ...log, _new: true }, ...p.recent].slice(0, 20) };
    });
  }, []));
  useLive('access:image', useCallback((row) => {
    setD((p) => p && { ...p, recent: p.recent.map((r) => (r.id === row.id ? { ...r, ...row } : r)) });
  }, []));
  // حدث مباشر: تغير حالة اتصال كاميرا
  useLive('camera:status', useCallback((cam) => {
    setD((p) => p && {
      ...p,
      gates: p.gates.map((g) => ({ ...g, cameras: g.cameras?.map((c) => (c.id === cam.id ? { ...c, ...cam } : c)) })),
    });
  }, []));
  useLive('subscription:renewed', load);

  if (!d) return <Spinner />;
  const sub = d.subscription;
  const expired = sub && !sub.can_access;

  const open = (gate, direction) => run(() => api(`/tenant/gates/${gate.id}/open`, { body: { direction } }), `تم إرسال أمر فتح ${direction === 'in' ? 'بوابة الدخول' : 'بوابة الخروج'}`)
    .then(() => setConfirm(null));

  return (
    <>
      <PageHeader title={`أهلاً، ${d.tenant_name}`} subtitle="حركة البوابات لحظة بلحظة" />

      {expired && (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          <b>انتهى الاشتراك في {fmtDate(sub.ends_at)}.</b> البوابات لا تُفتح تلقائياً للسيارات حتى يتم التجديد. تواصل مع إدارة أراكم أو جدد من المتجر.
        </div>
      )}
      {!expired && sub?.days_left <= 14 && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          ينتهي الاشتراك بعد {sub.days_left} يوم ({fmtDate(sub.ends_at)}).
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon="in" label="دخول اليوم" value={d.today.entries} />
        <StatCard icon="out" label="خروج اليوم" value={d.today.exits} tone="blue" />
        <StatCard icon="x" label="محاولات مرفوضة" value={d.today.denied} tone="red" />
        <StatCard icon="car" label="السيارات المسجلة" value={`${d.vehicles} / ${sub?.max_vehicles ?? '—'}`} tone="amber" />
      </div>

      <h2 className="mb-3 mt-7 text-lg font-bold">البوابات</h2>
      {!d.gates.length ? <div className="card"><Empty>لا توجد بوابات مرتبطة بحسابك بعد. تواصل مع إدارة أراكم.</Empty></div> : (
        <div className="grid gap-4 md:grid-cols-2">
          {d.gates.map((g) => {
            const cam = (dir) => g.cameras?.find((c) => c.direction === dir);
            return (
              <div key={g.id} className="card p-5">
                <div className="mb-4 flex items-start justify-between gap-2">
                  <div>
                    <div className="text-base font-bold">{g.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400" dir="ltr">{g.code}</div>
                  </div>
                  {!g.auto_open && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">الفتح التلقائي معطل</span>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {['in', 'out'].map((dir) => {
                    const c = cam(dir);
                    return (
                      <div key={dir} className="rounded-xl border border-slate-200 p-3 dark:border-ink-700">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="flex items-center gap-1 text-sm font-semibold"><Icon name={dir} className="size-4" />{dir === 'in' ? 'كاميرا الدخول' : 'كاميرا الخروج'}</span>
                        </div>
                        {c ? <><OnlineDot online={c.is_online} /><div className="mt-0.5 text-[11px] text-slate-500">{c.is_online ? 'آخر نبضة ' : 'آخر ظهور '}{timeAgo(c.last_seen_at)}</div></>
                          : <div className="text-xs text-slate-400">غير مركبة</div>}
                        <button type="button" disabled={!c} onClick={() => setConfirm({ gate: g, dir })}
                          className="btn-primary mt-3 w-full py-3 text-base">
                          <Icon name="gate" />فتح {dir === 'in' ? 'الدخول' : 'الخروج'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-7 grid gap-4 lg:grid-cols-5">
        <div className="card overflow-hidden lg:col-span-3">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-ink-700">
            <h2 className="flex items-center gap-2 font-bold"><span className="relative flex size-2.5"><span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-70" /><span className="relative size-2.5 rounded-full bg-emerald-500" /></span>الحركة المباشرة</h2>
            <Link to="/logs" className="text-sm font-medium text-brand-600 dark:text-brand-500">كل السجلات</Link>
          </div>
          {!d.recent.length ? <Empty>لا توجد حركة بعد</Empty> : (
            <ul className="divide-y divide-slate-100 dark:divide-ink-800">{d.recent.map((r) => <LogItem key={r.id} r={r} onImage={setImg} />)}</ul>
          )}
        </div>
        <div className="card p-4 lg:col-span-2">
          <h2 className="mb-4 font-bold">حركة اليوم حسب الساعة</h2>
          <HourlyChart hours={d.hours} />
        </div>
      </div>

      <ImageViewer src={img} onClose={() => setImg(null)} />
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="تأكيد الفتح اليدوي"
        footer={<>
          <button type="button" className="btn-ghost flex-1" onClick={() => setConfirm(null)}>إلغاء</button>
          <button type="button" className="btn-primary flex-1" disabled={busy} onClick={() => open(confirm.gate, confirm.dir)}><Icon name="gate" />افتح الآن</button>
        </>}>
        {confirm && <p>سيتم فتح <b>{confirm.dir === 'in' ? 'بوابة الدخول' : 'بوابة الخروج'}</b> في «{confirm.gate.name}» عن بُعد، وسيُسجَّل ذلك باسمك.</p>}
      </Modal>
    </>
  );
}
