import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Icon, useAction } from './ui';

// وقت انتهاء الفتح بالساعة والدقيقة (بتوقيت الرياض)
const hm = new Intl.DateTimeFormat('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh', hour: 'numeric', minute: '2-digit' });

const MODES = [['1h', 'ساعة'], ['6h', '6 ساعات'], ['12h', '12 ساعة'], ['always', 'دائماً 24/7']];

// حالة وضع "الفتح لأي سيارة"
export function openAllState(gate) {
  if (gate.open_all_always) return { active: true, always: true };
  const until = gate.open_all_until ? new Date(gate.open_all_until) : null;
  if (until && until.getTime() > Date.now()) return { active: true, until };
  return { active: false };
}

function remaining(until) {
  const m = Math.max(0, Math.round((until.getTime() - Date.now()) / 60000));
  const h = Math.floor(m / 60);
  return h ? `${h} س ${m % 60} د` : `${m} دقيقة`;
}

/**
 * التحكم في فتح البوابة لأي سيارة: ساعة / 6 / 12 ساعة / دائماً، مع الإلغاء
 * base: '/tenant' أو '/admin'
 */
export default function OpenAllControl({ gate, base = '/tenant', onChange, compact }) {
  const [run, busy] = useAction();
  const [, tick] = useState(0);
  const st = openAllState(gate);

  // تحديث العداد كل 30 ثانية
  useEffect(() => {
    if (!st.active || st.always) return undefined;
    const t = setInterval(() => tick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, [st.active, st.always]);

  const set = (mode) => run(() => api(`${base}/gates/${gate.id}/open-all`, { body: { mode } }),
    mode === 'off' ? 'تم إيقاف الفتح التلقائي' : 'تم تفعيل الفتح التلقائي لأي سيارة').then((r) => r && onChange?.(r));

  return (
    <div className={`rounded-xl border p-3 ${st.active ? 'border-brand-500 bg-brand-50 dark:bg-ink-800' : 'border-slate-200 dark:border-ink-700'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-bold"><Icon name="bolt" className="size-4 text-brand-500" />الفتح التلقائي لأي سيارة</div>
          <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
            {!st.active ? 'متوقف — تُفتح البوابة للسيارات المسجلة فقط'
              : st.always ? 'مفعل دائماً 24/7 — البوابة تُفتح لأي سيارة'
                : `مفعل حتى الساعة ${hm.format(st.until)} (متبقٍ ${remaining(st.until)})`}
          </div>
        </div>
        {st.active && (
          <button type="button" disabled={busy} onClick={() => set('off')} className="btn-danger btn-sm shrink-0">إيقاف</button>
        )}
      </div>
      <div className={`mt-3 grid grid-cols-4 gap-1.5 ${compact ? 'text-[11px]' : 'text-xs'}`}>
        {MODES.map(([m, label]) => {
          const on = m === 'always' && st.always;
          return (
            <button key={m} type="button" disabled={busy} onClick={() => set(m)}
              className={`rounded-lg border px-1 py-2 font-semibold transition ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white hover:border-brand-500 dark:border-ink-700 dark:bg-ink-900'}`}>
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
