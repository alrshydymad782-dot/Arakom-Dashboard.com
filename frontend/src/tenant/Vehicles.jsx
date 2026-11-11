import { useCallback, useEffect, useMemo, useState } from 'react';
import { readSheet } from 'read-excel-file/browser';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { plateKey } from '../lib/plates';
import { fmtDate, timeAgo } from '../lib/format';
import { Badge, Empty, Field, Icon, Modal, PageHeader, Plate, Spinner, Tabs, useAction } from '../components/ui';

const BLANK = { plate: '', owner_name: '', unit_number: '', phone: '', car_make: '', car_color: '', status: 'active', valid_until: '', notes: '' };

// أسماء الأعمدة المقبولة في ملف الاستيراد (عربي أو إنجليزي)
const COLUMNS = {
  plate: ['plate', 'رقم اللوحة', 'اللوحة', 'plate number'],
  owner_name: ['owner_name', 'owner', 'اسم صاحب السيارة', 'اسم المالك', 'الاسم', 'name'],
  unit_number: ['unit_number', 'unit', 'apartment', 'رقم الشقة', 'الوحدة', 'رقم الوحدة', 'الشقة'],
  phone: ['phone', 'mobile', 'رقم التواصل', 'الجوال', 'رقم الجوال'],
  car_make: ['car_make', 'make', 'type', 'نوع السيارة', 'النوع'],
  car_color: ['car_color', 'color', 'لون السيارة', 'اللون'],
  status: ['status', 'الحالة'],
};

function mapRows(matrix) {
  const [head, ...rest] = matrix;
  const idx = {};
  head.forEach((h, i) => {
    const name = String(h ?? '').trim().toLowerCase();
    for (const [k, aliases] of Object.entries(COLUMNS)) if (aliases.includes(name)) idx[k] = i;
  });
  if (idx.plate === undefined) throw new Error('لم يتم العثور على عمود "رقم اللوحة" في الملف');
  return rest.filter((r) => r.some((c) => c !== null && String(c).trim() !== '')).map((r) => {
    const o = {};
    for (const [k, i] of Object.entries(idx)) o[k] = r[i] == null ? '' : String(r[i]).trim();
    if (o.status) o.status = /محظور|block/i.test(o.status) ? 'blocked' : 'active';
    return o;
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',' || c === ';' || c === '\t') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

export default function Vehicles() {
  const { user } = useAuth();
  const canEdit = user.role === 'tenant_admin';
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [edit, setEdit] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [run, busy] = useAction();

  const load = useCallback(() => api(`/tenant/vehicles${qs({ q, status })}`).then(setData), [q, status]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    const body = { ...edit };
    const ok = await run(() => (edit.id ? api(`/tenant/vehicles/${edit.id}`, { method: 'PATCH', body }) : api('/tenant/vehicles', { body })), 'تم الحفظ');
    if (ok) { setEdit(null); load(); }
  };
  const remove = async () => {
    if (!window.confirm('حذف هذه السيارة من القائمة؟')) return;
    if (await run(() => api(`/tenant/vehicles/${edit.id}`, { method: 'DELETE' }), 'تم الحذف')) { setEdit(null); load(); }
  };
  const toggleBlock = (v) => run(() => api(`/tenant/vehicles/${v.id}`, { method: 'PATCH', body: { status: v.status === 'active' ? 'blocked' : 'active' } }),
    v.status === 'active' ? 'تم حظر السيارة' : 'تم تفعيل السيارة').then(load);

  const preview = useMemo(() => (edit?.plate ? plateKey(edit.plate) : ''), [edit?.plate]);
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.value });

  return (
    <>
      <PageHeader title="السيارات المسموح لها" subtitle={data ? `${data.rows.length} من ${data.max_vehicles} سيارة مسموحة في اشتراكك` : ''}
        actions={canEdit && <>
          <button type="button" className="btn-ghost" onClick={() => setImportOpen(true)}><Icon name="upload" className="size-4" />استيراد CSV / Excel</button>
          <button type="button" className="btn-primary" onClick={() => setEdit({ ...BLANK })}><Icon name="plus" className="size-4" />إضافة سيارة</button>
        </>} />

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-60 flex-1">
          <Icon name="search" className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-slate-400" />
          <input className="input ps-9" placeholder="ابحث برقم اللوحة أو الاسم أو الوحدة أو الجوال" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Tabs value={status} onChange={setStatus} items={[['', 'الكل'], ['active', 'نشط'], ['blocked', 'محظور']]} />
      </div>

      <div className="card overflow-hidden">
        {!data ? <Spinner /> : !data.rows.length ? <Empty>لا توجد سيارات. أضف سيارات السكان ليتم فتح البوابة لهم تلقائياً.</Empty> : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-ink-800/60"><tr>
                  <th className="th">اللوحة</th><th className="th">صاحب السيارة</th><th className="th">الوحدة</th><th className="th">التواصل</th>
                  <th className="th">السيارة</th><th className="th">الحالة</th><th className="th">آخر حركة</th><th className="th" />
                </tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-ink-800">
                  {data.rows.map((v) => (
                    <tr key={v.id}>
                      <td className="td"><Plate plateKey={v.plate_key} /></td>
                      <td className="td font-medium">{v.owner_name || '—'}</td>
                      <td className="td">{v.unit_number || '—'}</td>
                      <td className="td" dir="ltr">{v.phone || '—'}</td>
                      <td className="td">{[v.car_make, v.car_color].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="td">
                        <Badge tone={v.status === 'active' ? 'green' : 'red'}>{v.status === 'active' ? 'نشط' : 'محظور'}</Badge>
                        {v.valid_until && <div className="mt-1 text-[11px] text-slate-500">حتى {fmtDate(v.valid_until)}</div>}
                      </td>
                      <td className="td text-slate-500">{v.last_seen_at ? timeAgo(v.last_seen_at) : '—'}</td>
                      <td className="td">{canEdit && <div className="flex gap-1">
                        <button type="button" className="btn-ghost btn-sm" onClick={() => toggleBlock(v)}>{v.status === 'active' ? 'حظر' : 'تفعيل'}</button>
                        <button type="button" className="btn-ghost btn-sm" onClick={() => setEdit({ ...BLANK, ...v, plate: v.plate_en || v.plate_key, valid_until: v.valid_until || '' })}><Icon name="edit" className="size-4" /></button>
                      </div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-slate-100 md:hidden dark:divide-ink-800">
              {data.rows.map((v) => (
                <li key={v.id} className="flex items-center gap-3 px-4 py-3" onClick={() => canEdit && setEdit({ ...BLANK, ...v, plate: v.plate_en || v.plate_key, valid_until: v.valid_until || '' })}>
                  <Plate plateKey={v.plate_key} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{v.owner_name || 'بدون اسم'}</div>
                    <div className="truncate text-xs text-slate-500">{[v.unit_number && `وحدة ${v.unit_number}`, v.car_make, v.car_color].filter(Boolean).join(' · ')}</div>
                  </div>
                  <Badge tone={v.status === 'active' ? 'green' : 'red'}>{v.status === 'active' ? 'نشط' : 'محظور'}</Badge>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'تعديل بيانات السيارة' : 'إضافة سيارة'}>
        {edit && (
          <form onSubmit={save} className="grid grid-cols-2 gap-3">
            <Field label="رقم اللوحة (عربي أو إنجليزي) *" className="col-span-2">
              <input className="input" required value={edit.plate} onChange={set('plate')} placeholder="مثال: 1234 ABJ أو ح ب ا ١٢٣٤" />
            </Field>
            {preview && <div className="col-span-2 flex items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-ink-800">
              <Plate plateKey={preview} size="lg" /><span className="text-xs text-slate-500">تأكد أن اللوحة تطابق لوحة السيارة الفعلية</span>
            </div>}
            <Field label="اسم صاحب السيارة" className="col-span-2"><input className="input" value={edit.owner_name ?? ''} onChange={set('owner_name')} /></Field>
            <Field label="رقم الشقة / الوحدة"><input className="input" value={edit.unit_number ?? ''} onChange={set('unit_number')} /></Field>
            <Field label="رقم التواصل"><input className="input" dir="ltr" type="tel" value={edit.phone ?? ''} onChange={set('phone')} /></Field>
            <Field label="نوع السيارة"><input className="input" value={edit.car_make ?? ''} onChange={set('car_make')} placeholder="تويوتا كامري" /></Field>
            <Field label="لون السيارة"><input className="input" value={edit.car_color ?? ''} onChange={set('car_color')} /></Field>
            <Field label="الحالة">
              <select className="input" value={edit.status} onChange={set('status')}><option value="active">نشط (مسموح)</option><option value="blocked">محظور</option></select>
            </Field>
            <Field label="صالح حتى (اختياري)"><input className="input" type="date" value={edit.valid_until ?? ''} onChange={set('valid_until')} /></Field>
            <Field label="ملاحظات" className="col-span-2"><input className="input" value={edit.notes ?? ''} onChange={set('notes')} /></Field>
            <div className="col-span-2 mt-2 flex gap-2">
              {edit.id && <button type="button" className="btn-ghost text-rose-600" onClick={remove}><Icon name="trash" className="size-4" />حذف</button>}
              <div className="flex-1" />
              <button type="button" className="btn-ghost" onClick={() => setEdit(null)}>إلغاء</button>
              <button className="btn-primary" disabled={busy}>حفظ</button>
            </div>
          </form>
        )}
      </Modal>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onDone={load} />
    </>
  );
}

function ImportModal({ open, onClose, onDone }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [run, busy] = useAction();

  const reset = () => { setRows(null); setError(''); setResult(null); };
  const close = () => { reset(); onClose(); };

  const onFile = async (e) => {
    reset();
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const matrix = /\.xlsx$/i.test(file.name) ? await readSheet(file) : parseCsv(await file.text());
      setRows(mapRows(matrix));
    } catch (err) {
      setError(err.message || 'تعذر قراءة الملف');
    }
  };

  const upload = async () => {
    const r = await run(() => api('/tenant/vehicles/import', { body: { rows } }));
    if (r) { setResult(r); onDone(); }
  };

  const template = () => {
    const csv = '﻿رقم اللوحة,اسم صاحب السيارة,رقم الوحدة,الجوال,نوع السيارة,لون السيارة,الحالة\r\n1234 ABJ,محمد أحمد,A-12,0550000000,تويوتا كامري,أبيض,نشط\r\n';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'arakom-vehicles-template.csv';
    a.click();
  };

  return (
    <Modal open={open} onClose={close} title="استيراد جماعي للسيارات" wide>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
        ارفع ملف Excel (‎.xlsx) أو CSV. الصف الأول عناوين الأعمدة، والعمود الإلزامي هو «رقم اللوحة».
        السيارات الموجودة مسبقاً تُحدَّث بياناتها.
        <button type="button" className="ms-1 font-semibold text-brand-600 underline" onClick={template}>تحميل نموذج جاهز</button>
      </p>
      <input type="file" accept=".csv,.xlsx,text/csv" onChange={onFile} className="input file:me-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-brand-700" />
      {error && <div className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>}
      {rows && !result && (
        <>
          <div className="mt-4 text-sm font-semibold">{rows.length} سيارة في الملف — معاينة أول 5:</div>
          <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 dark:border-ink-700">
            <table className="w-full"><tbody className="divide-y divide-slate-100 dark:divide-ink-800">
              {rows.slice(0, 5).map((r, i) => (
                <tr key={i}><td className="td"><Plate plateKey={plateKey(r.plate)} raw={r.plate} /></td><td className="td">{r.owner_name}</td><td className="td">{r.unit_number}</td><td className="td">{r.phone}</td></tr>
              ))}
            </tbody></table>
          </div>
          <button type="button" className="btn-primary mt-4 w-full" disabled={busy} onClick={upload}>{busy ? 'جاري الاستيراد...' : `استيراد ${rows.length} سيارة`}</button>
        </>
      )}
      {result && (
        <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm dark:bg-ink-800">
          <div>تمت إضافة <b>{result.created}</b> وتحديث <b>{result.updated}</b> سيارة.</div>
          {result.errors.length > 0 && (
            <ul className="mt-2 max-h-40 list-inside list-disc overflow-y-auto text-rose-600">
              {result.errors.map((e, i) => <li key={i}>صف {e.row}: {e.error}</li>)}
            </ul>
          )}
          <button type="button" className="btn-primary mt-3" onClick={close}>تم</button>
        </div>
      )}
    </Modal>
  );
}
