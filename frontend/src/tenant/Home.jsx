import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../lib/api';
import { useLive } from '../lib/realtime';
import { fmtDate, timeAgo, daysLeftText } from '../lib/format';
import { Icon, OnlineDot, Spinner, Empty, useAction, Modal } from '../components/ui';
import { LogItem, ImageViewer } from '../components/LogsView';
import OpenAllControl from '../components/OpenAllControl';

const COLUMN_LABEL = { in: 'عمود الدخول', out: 'عمود الخروج' };

// لوحة العميل المبسطة: البوابات (فتح يدوي + فتح تلقائي) وآخر الحركة
export default function Home() {
  const status = useOutletContext();
  const [d, setD] = useState(null);
  const [img, setImg] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [run, busy] = useAction();

  const load = useCallback(() => api('/tenant/dashboard').then(setD).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  useLive('access:new', useCallback((log) => {
    setD((p) => p && { ...p, recent: [{ ...log, _new: true }, ...p.recent].slice(0, 8) });
  }, []));
  useLive('access:image', useCallback((row) => {
    setD((p) => p && { ...p, recent: p.recent.map((r) => (r.id === row.id ? { ...r, ...row } : r)) });
  }, []));
  useLive('camera:status', useCallback((cam) => {
    setD((p) => p && { ...p, gates: p.gates.map((g) => ({ ...g, cameras: g.cameras?.map((c) => (c.id === cam.id ? { ...c, ...cam } : c)) })) });
  }, []));
  const patchGate = useCallback((st) => {
    setD((p) => p && { ...p, gates: p.gates.map((g) => (g.id === (st.gate_id ?? st.id) ? { ...g, open_all_always: st.open_all_always, open_all_until: st.open_all_until } : g)) });
  }, []);
  useLive('gate:open_all', patchGate);

  if (!d) return <Spinner />;

  const open = () => run(() => api(`/tenant/gates/${confirm.gate.id}/open`, { body: { direction: confirm.dir } }), `تم فتح ${COLUMN_LABEL[confirm.dir]}`)
    .then(() => setConfirm(null));

  return (
    <>
      {status?.days_left != null && status.days_left <= 5 && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <b>{daysLeftText(status.days_left)}</b> — تُقفل لوحة التحكم بعد {fmtDate(status.ends_at)}. تواصل مع أراكم للتجديد.
        </div>
      )}

      {!d.gates.length ? <div className="card"><Empty>لا توجد بوابات بعد. ستضيفها إدارة أراكم.</Empty></div> : (
        <div className="grid gap-4 md:grid-cols-2">
          {d.gates.map((g) => {
            const dirs = g.columns === 1 ? ['in'] : ['in', 'out'];
            return (
              <div key={g.id} className="card p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-bold">{g.name}</h2>
                  <span className="text-xs text-slate-500">{g.columns === 1 ? 'عمود واحد' : 'عمودان'}</span>
                </div>
                <div className={`grid gap-3 ${dirs.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {dirs.map((dir) => {
                    const c = g.cameras?.find((x) => x.direction === dir);
                    return (
                      <div key={dir} className="rounded-xl border border-slate-200 p-3 dark:border-ink-700">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1 text-sm font-semibold"><Icon name={dir} className="size-4" />{COLUMN_LABEL[dir]}</span>
                          {c && <OnlineDot online={c.is_online} label={false} />}
                        </div>
                        <div className="text-[11px] text-slate-500">{c ? (c.is_online ? 'الكاميرا متصلة' : `الكاميرا منقطعة · ${timeAgo(c.last_seen_at)}`) : 'لم تُركب الكاميرا بعد'}</div>
                        <button type="button" onClick={() => setConfirm({ gate: g, dir })} className="btn-primary mt-3 w-full py-3.5 text-base">
                          <Icon name="gate" />فتح
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3"><OpenAllControl gate={g} onChange={patchGate} /></div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card mt-5 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 font-bold dark:border-ink-700">
          <span className="relative flex size-2.5"><span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-70" /><span className="relative size-2.5 rounded-full bg-emerald-500" /></span>
          آخر الحركة
          <span className="ms-auto text-xs font-normal text-slate-500">اليوم: {d.today.entries} دخول{d.gates.some((g) => g.columns === 2) ? ` · ${d.today.exits} خروج` : ''}</span>
        </div>
        {!d.recent.length ? <Empty>لا توجد حركة بعد</Empty> : (
          <ul className="divide-y divide-slate-100 dark:divide-ink-800">{d.recent.map((r) => <LogItem key={r.id} r={r} onImage={setImg} />)}</ul>
        )}
      </div>

      <ImageViewer src={img} onClose={() => setImg(null)} />
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="تأكيد الفتح"
        footer={<>
          <button type="button" className="btn-ghost flex-1" onClick={() => setConfirm(null)}>إلغاء</button>
          <button type="button" className="btn-primary flex-1" disabled={busy} onClick={open}><Icon name="gate" />افتح الآن</button>
        </>}>
        {confirm && <p>سيتم فتح <b>{COLUMN_LABEL[confirm.dir]}</b> في «{confirm.gate.name}» الآن.</p>}
      </Modal>
    </>
  );
}
