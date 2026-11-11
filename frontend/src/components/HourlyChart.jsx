// رسم بياني لحركة اليوم حسب الساعة (دخول / خروج)
export default function HourlyChart({ hours }) {
  if (!hours) return null;
  const max = Math.max(1, ...hours.map((h) => h.in + h.out));
  return (
    <div>
      <div className="flex h-36 items-end gap-[3px]" dir="ltr">
        {hours.map((h) => (
          <div key={h.h} className="group relative flex h-full flex-1 flex-col justify-end" title={`${h.h}:00 — دخول ${h.in} / خروج ${h.out}`}>
            <div className="rounded-t-[3px] bg-slate-400/70 dark:bg-slate-500" style={{ height: `${(h.out / max) * 100}%` }} />
            <div className={`bg-brand-500 ${h.out ? '' : 'rounded-t-[3px]'}`} style={{ height: `${(h.in / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-slate-500" dir="ltr">
        <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
      </div>
      <div className="mt-2 flex gap-4 text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-brand-500" />دخول</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-slate-400" />خروج</span>
      </div>
    </div>
  );
}
