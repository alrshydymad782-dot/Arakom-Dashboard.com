import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { plateKey } from '../lib/plates';
import { timeAgo } from '../lib/format';
import { Badge, Empty, Icon, Modal, PageHeader, Plate, Spinner, useAction, useToast } from '../components/ui';

/*
 * السيارات المسموح لها: تُسجَّل السيارة بإحدى طريقتين فقط
 *   1) كتابة رقم اللوحة يدوياً
 *   2) رفع صورة أو PDF للوحة (ويمكن كتابة الرقم معها أو لاحقاً)
 */
const DOC_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_DOC = 5 * 1024 * 1024;
const docUrl = (v) => `/api/tenant/vehicles/${v.id}/document?t=${encodeURIComponent(v.document_uploaded_at || '')}`;

async function sendFile(url, method, file, headers = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name), ...headers },
    body: file,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || 'تعذر رفع الملف');
  return data;
}

function DocThumb({ v }) {
  if (!v.document_path) return null;
  return (
    <a href={docUrl(v)} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} title="عرض صورة اللوحة"
      className="shrink-0 overflow-hidden rounded-lg border border-slate-200 hover:border-brand-500 dark:border-ink-700">
      {v.document_type === 'application/pdf'
        ? <span className="flex h-11 w-14 items-center justify-center bg-rose-50 text-xs font-bold text-rose-600 dark:bg-rose-500/15">PDF</span>
        : <img src={docUrl(v)} alt="صورة اللوحة" className="h-11 w-14 object-cover" loading="lazy" />}
    </a>
  );
}

export default function Vehicles() {
  const { user } = useAuth();
  const canEdit = user.role === 'tenant_admin';
  const toast = useToast();
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null); // { id?, plate, file, document_path... }
  const [run, busy] = useAction();

  const load = useCallback(() => api(`/tenant/vehicles${qs({ q })}`).then(setData), [q]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const preview = useMemo(() => (form?.plate ? plateKey(form.plate) : ''), [form?.plate]);
  const filePreview = useMemo(() => (form?.file && form.file.type !== 'application/pdf' ? URL.createObjectURL(form.file) : null), [form?.file]);
  useEffect(() => () => { if (filePreview) URL.revokeObjectURL(filePreview); }, [filePreview]);

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!DOC_TYPES.includes(f.type)) return toast('الملف يجب أن يكون صورة (JPG / PNG) أو PDF', 'err');
    if (f.size > MAX_DOC) return toast('حجم الملف أكبر من 5 ميجابايت', 'err');
    setForm({ ...form, file: f });
  };

  const save = async (e) => {
    e.preventDefault();
    const plate = form.plate.trim();
    if (!plate && !form.file && !form.document_path) return toast('اكتب رقم اللوحة أو ارفع صورة أو PDF للوحة', 'err');
    const ok = await run(async () => {
      if (form.id) {
        if (plate) await api(`/tenant/vehicles/${form.id}`, { method: 'PATCH', body: { plate } });
        if (form.file) await sendFile(`/api/tenant/vehicles/${form.id}/document`, 'PUT', form.file);
      } else if (form.file) {
        await sendFile('/api/tenant/vehicles/with-document', 'POST', form.file, { 'X-Plate': encodeURIComponent(plate) });
      } else {
        await api('/tenant/vehicles', { body: { plate } });
      }
      return true;
    }, 'تم الحفظ');
    if (ok) { setForm(null); load(); }
  };

  const remove = async () => {
    if (!window.confirm('حذف هذه السيارة من القائمة؟')) return;
    if (await run(() => api(`/tenant/vehicles/${form.id}`, { method: 'DELETE' }), 'تم الحذف')) { setForm(null); load(); }
  };

  const openForm = (v) => setForm(v
    ? { id: v.id, plate: v.plate_key ? (v.plate_en || v.plate_key) : '', file: null, document_path: v.document_path, document_type: v.document_type, document_uploaded_at: v.document_uploaded_at, plate_key: v.plate_key }
    : { plate: '', file: null });

  const pending = data?.rows.filter((v) => !v.plate_key).length || 0;

  return (
    <>
      <PageHeader title="السيارات المسموح لها"
        subtitle={data ? `${data.rows.length} سيارة${data.max_vehicles ? ` من ${data.max_vehicles}` : ''}` : ''}
        actions={canEdit && <button type="button" className="btn-primary" onClick={() => openForm(null)}><Icon name="plus" className="size-4" />إضافة سيارة</button>} />

      {pending > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          {pending} سيارة سُجلت بصورة فقط وتنتظر إدخال رقم اللوحة. لن تُفتح لها البوابة حتى يُكتب الرقم (يمكنك كتابته، أو تكتبه إدارة أراكم من الصورة).
        </div>
      )}

      <div className="relative mb-4">
        <Icon name="search" className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-slate-400" />
        <input className="input ps-9" placeholder="ابحث برقم اللوحة" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="card overflow-hidden">
        {!data ? <Spinner /> : !data.rows.length ? <Empty>لا توجد سيارات بعد. أضف سيارات السكان لتُفتح لهم البوابة تلقائياً.</Empty> : (
          <ul className="divide-y divide-slate-100 dark:divide-ink-800">
            {data.rows.map((v) => (
              <li key={v.id} className={`flex items-center gap-3 px-4 py-3 ${canEdit ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-ink-800/50' : ''}`}
                onClick={() => canEdit && openForm(v)}>
                {v.plate_key ? <Plate plateKey={v.plate_key} /> : <Badge tone="amber">بانتظار رقم اللوحة</Badge>}
                <div className="min-w-0 flex-1 text-xs text-slate-500 dark:text-slate-400">
                  {v.last_seen_at ? `آخر دخول ${timeAgo(v.last_seen_at)}` : 'لم تُرصد بعد'}
                </div>
                <DocThumb v={v} />
                {canEdit && <Icon name="edit" className="size-4 shrink-0 text-slate-400" />}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'تعديل السيارة' : 'إضافة سيارة'}>
        {form && (
          <form onSubmit={save} className="grid gap-4">
            <div>
              <span className="label">1) اكتب رقم اللوحة</span>
              <input className="input text-lg" value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} placeholder="مثال: 1234 ABJ أو ح ب ا ١٢٣٤" />
              {preview && <div className="mt-2 flex justify-center rounded-xl bg-slate-50 p-3 dark:bg-ink-800"><Plate plateKey={preview} size="lg" /></div>}
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200 dark:bg-ink-700" />أو / و<span className="h-px flex-1 bg-slate-200 dark:bg-ink-700" /></div>

            <div>
              <span className="label">2) ارفع صورة أو PDF للوحة (حتى 5 ميجابايت)</span>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 p-3 hover:border-brand-500 dark:border-ink-700">
                {form.file ? (
                  form.file.type === 'application/pdf'
                    ? <span className="flex h-14 w-16 items-center justify-center rounded-lg bg-rose-50 text-sm font-bold text-rose-600">PDF</span>
                    : <img src={filePreview} alt="" className="h-14 w-16 rounded-lg object-cover" />
                ) : form.document_path ? <DocThumb v={form} /> : (
                  <span className="flex h-14 w-16 items-center justify-center rounded-lg bg-slate-100 text-slate-400 dark:bg-ink-800"><Icon name="upload" /></span>
                )}
                <span className="min-w-0 flex-1 text-sm">
                  {form.file ? <><b className="block truncate">{form.file.name}</b><span className="text-xs text-slate-500">اضغط للاستبدال</span></>
                    : form.document_path ? 'اضغط لاستبدال الملف المرفق' : 'اضغط لاختيار صورة أو PDF (أو التقاط صورة بالكاميرا)'}
                </span>
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={pickFile} />
              </label>
            </div>

            <div className="mt-1 flex gap-2">
              {form.id && <button type="button" className="btn-ghost text-rose-600" onClick={remove}><Icon name="trash" className="size-4" />حذف</button>}
              <div className="flex-1" />
              <button type="button" className="btn-ghost" onClick={() => setForm(null)}>إلغاء</button>
              <button className="btn-primary" disabled={busy}>{busy ? 'جاري الحفظ...' : 'حفظ'}</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
