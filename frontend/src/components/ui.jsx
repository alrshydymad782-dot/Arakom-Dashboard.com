import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { splitKey, EN_TO_AR, toArabicDigits } from '../lib/plates';
import { REASONS, DIRECTION } from '../lib/format';

// ---------- الأيقونات ----------
const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  car: 'M5 17h14M5 17a2 2 0 1 1-4 0v-5l2-5h14l4 5v5a2 2 0 1 1-4 0M7 12h10',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  users: 'M16 21a6 6 0 0 0-12 0M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21a6 6 0 0 0-4-5.6M16 3.1a4 4 0 0 1 0 7.8',
  building: 'M3 21h18M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M15 9h2a2 2 0 0 1 2 2v10M9 7h2M9 11h2M9 15h2',
  camera: 'M3 7h3l2-3h8l2 3h3v13H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  server: 'M3 4h18v7H3zM3 13h18v7H3zM7 7.5h.01M7 16.5h.01',
  card: 'M2 6h20v12H2zM2 10h20M6 15h4',
  gate: 'M4 21V6M4 9h16M4 9l16-4',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l-5-5 5-5M5 12h11',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3',
  download: 'M12 3v12m0 0-4-4m4 4 4-4M4 21h16',
  upload: 'M12 21V9m0 0-4 4m4-4 4 4M4 3h16',
  edit: 'M4 20h4L19 9l-4-4L4 16z',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
  x: 'M18 6 6 18M6 6l12 12',
  in: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3',
  out: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  printer: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  bolt: 'M13 2 3 14h9l-1 8 10-12h-9z',
  menu: 'M3 6h18M3 12h18M3 18h18',
};
export function Icon({ name, className = 'size-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}

// ---------- اللوحة السعودية ----------
// الأرقام يساراً والأحرف يميناً، العربي أعلى واللاتيني أسفل، وكل حرف عربي فوق مقابله اللاتيني
export function Plate({ plateKey, raw, size = 'md' }) {
  const { letters, digits, saudi } = splitKey(plateKey);
  if (plateKey === 'MANUAL') {
    return <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"><Icon name="gate" className="size-4" />فتح يدوي</span>;
  }
  if (!saudi) {
    return <span dir="ltr" className="inline-block rounded-md border-2 border-slate-800 bg-white px-2 py-0.5 font-bold tracking-widest text-slate-900">{raw || plateKey || '—'}</span>;
  }
  const big = size === 'lg';
  const cell = `px-1.5 text-center font-bold leading-tight ${big ? 'text-2xl px-3 py-0.5' : 'text-[13px]'}`;
  return (
    <span dir="ltr" title={raw} className="inline-grid shrink-0 grid-cols-[auto_auto_auto] overflow-hidden rounded-md border-2 border-slate-800 bg-white text-slate-900">
      <span className="grid grid-rows-2 border-r-2 border-slate-800">
        <span className={`${cell} border-b-2 border-slate-800`}>{toArabicDigits(digits)}</span>
        <span className={`${cell} tracking-wider`}>{digits}</span>
      </span>
      {/* كل حرف في عمود مستقل: العربي فوق مقابله اللاتيني تماماً كما على اللوحة */}
      <span className="grid grid-rows-2 border-r-2 border-slate-800" style={{ gridTemplateColumns: `repeat(${letters.length}, auto)` }}>
        {[...letters].map((c, i) => <span key={`a${i}`} className={`${cell} border-b-2 border-slate-800`}>{EN_TO_AR[c]}</span>)}
        {[...letters].map((c, i) => <span key={`l${i}`} className={cell}>{c}</span>)}
      </span>
      <span className={`flex items-center bg-brand-50 px-0.5 font-bold text-brand-600 [writing-mode:vertical-rl] ${big ? 'text-[10px]' : 'text-[7px]'}`}>KSA</span>
    </span>
  );
}

// ---------- الشارات ----------
const TONES = {
  green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  red: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  blue: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  gray: 'bg-slate-100 text-slate-600 dark:bg-ink-700 dark:text-slate-300',
};
export function Badge({ tone = 'gray', children, className = '' }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]} ${className}`}>{children}</span>;
}
export const DecisionBadge = ({ decision, reason }) => (
  <Badge tone={decision === 'opened' ? 'green' : reason === 'blocked' ? 'red' : 'amber'}>
    {decision === 'opened' ? 'تم الفتح' : 'مرفوض'}{reason && reason !== 'whitelisted' ? ` · ${REASONS[reason] || reason}` : ''}
  </Badge>
);
export const DirectionBadge = ({ direction }) => direction ? (
  <Badge tone={direction === 'in' ? 'blue' : 'gray'}><Icon name={direction} className="size-3.5" />{DIRECTION[direction]}</Badge>
) : null;

export function OnlineDot({ online, label = true }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span className={`relative inline-flex size-2.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-rose-500'}`}>
        {online && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-60" />}
      </span>
      {label && <span className={online ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>{online ? 'متصلة' : 'منقطعة'}</span>}
    </span>
  );
}

export function StatCard({ icon, label, value, tone = 'brand', hint }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-500',
    blue: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
    red: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  };
  return (
    <div className="card p-4">
      <div className={`mb-3 inline-flex rounded-xl p-2 ${tones[tone]}`}><Icon name={icon} /></div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-0.5 text-2xl font-bold tabular-nums">{value ?? '—'}</div>
      {hint && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export const Empty = ({ children = 'لا توجد بيانات' }) => (
  <div className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">{children}</div>
);

export const Spinner = () => (
  <div className="flex justify-center py-12"><div className="size-7 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" /></div>
);

export function Field({ label, children, className = '' }) {
  return <label className={`block ${className}`}><span className="label">{label}</span>{children}</label>;
}

// ---------- النافذة المنبثقة ----------
export function Modal({ open, onClose, title, children, footer, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`card max-h-[92vh] w-full overflow-y-auto rounded-b-none p-5 sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-ink-700" aria-label="إغلاق"><Icon name="x" /></button>
        </div>
        {children}
        {footer && <div className="mt-5 flex gap-2">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- التنبيهات ----------
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((msg, tone = 'ok') => {
    const id = Math.random();
    setItems((x) => [...x, { id, msg, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div key={t.id} className={`pointer-events-auto rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-lg ${t.tone === 'err' ? 'bg-rose-600' : 'bg-slate-900 dark:bg-brand-600'}`}>{t.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// تنفيذ عملية مع عرض الخطأ تلقائياً
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn, okMsg) => {
    setBusy(true);
    try {
      const r = await fn();
      if (okMsg) toast(okMsg);
      return r ?? true;
    } catch (e) {
      toast(e.message, 'err');
      return null;
    } finally {
      setBusy(false);
    }
  }, [toast]);
  return [run, busy];
}

export function Tabs({ value, onChange, items }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-ink-800">
      {items.map(([v, label]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${value === v ? 'bg-white shadow-sm dark:bg-ink-700' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}
