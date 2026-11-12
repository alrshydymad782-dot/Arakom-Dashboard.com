import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, qs } from '../lib/api';
import { useLive } from '../lib/realtime';
import { fmtDateTime, REASONS, DIRECTION, todayISO } from '../lib/format';
import { Plate, DecisionBadge, DirectionBadge, Empty, Spinner, Icon, useToast } from './ui';

const EMPTY = { q: '', direction: '', decision: '', from: '', to: '', tenant_id: '' };

// صورة اللوحة المصغرة
export function Thumb({ src, onOpen }) {
  if (!src) return <span className="inline-block h-9 w-14 rounded-md bg-slate-100 dark:bg-ink-800" />;
  return <img src={`/api/media/${src}`} alt="" loading="lazy" onClick={() => onOpen?.(src)} className="h-9 w-14 cursor-zoom-in rounded-md object-cover" />;
}

export function ImageViewer({ src, onClose }) {
  if (!src) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <img src={`/api/media/${src}`} alt="" className="max-h-full max-w-full rounded-xl" />
    </div>
  );
}

/**
 * عرض السجلات مع البحث والتصفية والتصدير
 * base: '/tenant' أو '/admin'
 */
export default function LogsView({ base, tenants }) {
  const toast = useToast();
  const [filters, setFilters] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [data, setData] = useState(null);
  const [offset, setOffset] = useState(0);
  const [img, setImg] = useState(null);
  const [report, setReport] = useState(null);
  const isAdmin = base === '/admin';

  const load = useCallback(async (f, off = 0) => {
    const r = await api(`${base}/logs${qs({ ...f, limit: 50, offset: off })}`);
    setData((prev) => (off && prev ? { rows: [...prev.rows, ...r.rows], total: r.total } : r));
    setOffset(off + r.rows.length);
  }, [base]);

  useEffect(() => { load(applied).catch((e) => toast(e.message, 'err')); }, [applied, load, toast]);

  // إضافة الأحداث الجديدة فوراً إن لم يكن هناك فلتر
  useLive('access:new', useCallback((log) => {
    if (Object.values(applied).some(Boolean)) return;
    setData((prev) => prev && { rows: [{ ...log, _new: true }, ...prev.rows], total: prev.total + 1 });
  }, [applied]));

  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const submit = (e) => { e.preventDefault(); setApplied({ ...filters }); };

  const exportPdf = async () => {
    try {
      const r = await api(`${base}/logs/report${qs(applied)}`);
      if (!r.rows.length) return toast('لا توجد سجلات للتصدير', 'err');
      setReport({ ...r, filters: applied });
      setTimeout(() => { window.print(); }, 300);
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  return (
    <>
      <form onSubmit={submit} className="card mb-4 grid grid-cols-2 gap-3 p-4 md:grid-cols-4 xl:grid-cols-7">
        <input className="input col-span-2" placeholder="رقم اللوحة" value={filters.q} onChange={set('q')} />
        {isAdmin && (
          <select className="input" value={filters.tenant_id} onChange={set('tenant_id')}>
            <option value="">كل المجمعات</option>
            {tenants?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <select className="input" value={filters.direction} onChange={set('direction')}>
          <option value="">الاتجاه: الكل</option><option value="in">دخول</option><option value="out">خروج</option>
        </select>
        <select className="input" value={filters.decision} onChange={set('decision')}>
          <option value="">الحالة: الكل</option><option value="opened">تم الفتح</option><option value="denied">مرفوض</option>
        </select>
        <input className="input" type="date" value={filters.from} max={todayISO()} onChange={set('from')} title="من تاريخ" />
        <input className="input" type="date" value={filters.to} max={todayISO()} onChange={set('to')} title="إلى تاريخ" />
        <div className="col-span-2 flex flex-wrap gap-2 md:col-span-4 xl:col-span-7">
          <button className="btn-primary"><Icon name="search" className="size-4" />بحث</button>
          <button type="button" className="btn-ghost" onClick={() => { setFilters(EMPTY); setApplied(EMPTY); }}>مسح</button>
          <div className="flex-1" />
          <a className="btn-ghost" href={`/api${base}/logs/export.csv${qs(applied)}`}><Icon name="download" className="size-4" />CSV / Excel</a>
          <button type="button" className="btn-ghost" onClick={exportPdf}><Icon name="printer" className="size-4" />PDF</button>
        </div>
      </form>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3 text-sm text-slate-500 dark:border-ink-700 dark:text-slate-400">
          {data ? `${data.total.toLocaleString('en')} سجل` : '...'}
        </div>
        {!data ? <Spinner /> : !data.rows.length ? <Empty>لا توجد سجلات مطابقة</Empty> : (
          <>
            {/* جدول للشاشات الكبيرة */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-ink-800/60"><tr>
                  <th className="th">الوقت</th>{isAdmin && <th className="th">المجمع</th>}<th className="th">البوابة</th><th className="th">الاتجاه</th>
                  <th className="th">اللوحة</th><th className="th">الحالة</th><th className="th">الصورة</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-ink-800">
                  {data.rows.map((r) => (
                    <tr key={r.id} className={r._new ? 'flash' : ''}>
                      <td className="td text-slate-500 dark:text-slate-400">{fmtDateTime(r.occurred_at)}</td>
                      {isAdmin && <td className="td">{r.tenant_name || '—'}</td>}
                      <td className="td">{r.gate_name || '—'}</td>
                      <td className="td"><DirectionBadge direction={r.direction} /></td>
                      <td className="td"><Plate plateKey={r.plate_key} raw={r.plate_raw} /></td>
                      <td className="td"><DecisionBadge decision={r.decision} reason={r.reason} /></td>
                      <td className="td"><Thumb src={r.plate_image || r.full_image} onOpen={setImg} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* بطاقات للجوال */}
            <ul className="divide-y divide-slate-100 md:hidden dark:divide-ink-800">
              {data.rows.map((r) => <LogItem key={r.id} r={r} onImage={setImg} showTenant={isAdmin} />)}
            </ul>
          </>
        )}
      </div>
      {data && offset < data.total && (
        <div className="mt-4 text-center"><button type="button" className="btn-ghost" onClick={() => load(applied, offset)}>تحميل المزيد</button></div>
      )}
      <ImageViewer src={img} onClose={() => setImg(null)} />
      {report && createPortal(<PrintReport report={report} withTenant={isAdmin} />, document.getElementById('print-root'))}
    </>
  );
}

export function LogItem({ r, onImage, showTenant }) {
  return (
    <li className={`flex items-center gap-3 px-4 py-3 ${r._new ? 'flash' : ''}`}>
      <Plate plateKey={r.plate_key} raw={r.plate_raw} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 truncate text-sm font-semibold">
          <DirectionBadge direction={r.direction} /><span className="truncate">{r.gate_name || '—'}</span>
        </div>
        <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
          {fmtDateTime(r.occurred_at)}{showTenant && r.tenant_name ? ` · ${r.tenant_name}` : ''}{r.source === 'manual' && r.opened_by_name ? ` · ${r.opened_by_name}` : ''}
        </div>
        <div className="mt-1"><DecisionBadge decision={r.decision} reason={r.reason} /></div>
      </div>
      <Thumb src={r.plate_image || r.full_image} onOpen={onImage} />
    </li>
  );
}

// تقرير منسق للطباعة / الحفظ PDF (الخط العربي يظهر بشكل صحيح لأن المتصفح هو من يرسمه)
function PrintReport({ report, withTenant }) {
  const f = report.filters;
  const opened = report.rows.filter((r) => r.decision === 'opened').length;
  return (
    <div dir="rtl" style={{ fontFamily: 'IBM Plex Sans Arabic, Tahoma, sans-serif', fontSize: 11 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #24bfb9', paddingBottom: 8, marginBottom: 10 }}>
        <div>
          <img src="/logo.png" alt="" style={{ height: 46, marginBottom: 4 }} /><div style={{ fontSize: 18, fontWeight: 700, color: '#0c365e' }}>تقرير حركة البوابات</div>
          <div>{report.tenant_name || 'كل المجمعات'}</div>
        </div>
        <div style={{ textAlign: 'left' }}>
          <div>تاريخ الإصدار: {fmtDateTime(new Date())}</div>
          <div>الفترة: {f.from || 'البداية'} — {f.to || 'اليوم'}{f.direction ? ` · ${DIRECTION[f.direction]}` : ''}</div>
          <div>عدد السجلات: {report.rows.length} · تم الفتح: {opened} · مرفوض: {report.rows.length - opened}</div>
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ background: '#e7f8f7', color: '#0c365e' }}>
          {['الوقت', ...(withTenant ? ['المجمع'] : []), 'البوابة', 'الاتجاه', 'اللوحة', 'اللوحة بالعربي', 'الحالة', 'السبب'].map((h) => (
            <th key={h} style={{ border: '1px solid #ccc', padding: '4px 6px', textAlign: 'right' }}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {report.rows.map((r) => (
            <tr key={r.id}>
              {[fmtDateTime(r.occurred_at), ...(withTenant ? [r.tenant_name] : []), r.gate_name, DIRECTION[r.direction] || '',
                r.source === 'manual' ? 'فتح يدوي' : r.plate_en || r.plate_raw, r.plate_ar,
                r.decision === 'opened' ? 'تم الفتح' : 'مرفوض', REASONS[r.reason] || r.reason].map((v, i) => (
                <td key={i} style={{ border: '1px solid #ddd', padding: '3px 6px' }}>{v || ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
