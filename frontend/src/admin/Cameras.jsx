import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useLive } from '../lib/realtime';
import { timeAgo } from '../lib/format';
import { Badge, Empty, Field, Icon, Modal, OnlineDot, PageHeader, Spinner, Tabs, useAction } from '../components/ui';

const COMMANDS = [
  ['check_online', 'فحص الاتصال'],
  ['open', 'فتح الذراع (IO)'],
  ['sync_time', 'ضبط الوقت'],
  ['apply_topics', 'ضبط مواضيع أراكم'],
  ['restart', 'إعادة تشغيل'],
];

export default function Cameras() {
  const [rows, setRows] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [filter, setFilter] = useState('');
  const [edit, setEdit] = useState(null);
  const [run, busy] = useAction();

  const load = useCallback(() => api(`/admin/cameras${filter ? `?filter=${filter}` : ''}`).then(setRows), [filter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    // كل البوابات مجمعة حسب المجمع لقائمة الربط
    api('/admin/gates').then((gates) => {
      const byTenant = new Map();
      for (const g of gates) {
        if (!byTenant.has(g.tenant_id)) byTenant.set(g.tenant_id, { id: g.tenant_id, name: g.tenant_name, gates: [] });
        byTenant.get(g.tenant_id).gates.push(g);
      }
      setTenants([...byTenant.values()]);
    });
  }, []);

  useLive('camera:new', load);
  useLive('camera:status', useCallback((c) => setRows((p) => p?.map((r) => (r.id === c.id ? { ...r, ...c } : r))), []));

  const gateColumns = (gid) => tenants.flatMap((t) => t.gates).find((g) => String(g.id) === String(gid))?.columns ?? 2;
  const save = async (e) => {
    e.preventDefault();
    const body = { gate_id: edit.gate_id || null, direction: edit.gate_id ? edit.direction : null, name: edit.name };
    const ok = await run(() => (edit.id ? api(`/admin/cameras/${edit.id}`, { method: 'PATCH', body }) : api('/admin/cameras', { body: { ...body, sn: edit.sn } })), 'تم الحفظ');
    if (ok) { setEdit(null); load(); }
  };
  const command = (cam, type) => {
    if (type === 'restart' && !window.confirm('إعادة تشغيل الكاميرا؟ ستنقطع لمدة دقيقة تقريباً')) return;
    if (type === 'apply_topics' && !window.confirm('سيتم ضبط الكاميرا لتنشر على arakom/gates/{gate}/readings وترفع الصور مع النتيجة. قد تعيد الكاميرا الاتصال. متابعة؟')) return;
    run(() => api(`/admin/cameras/${cam.id}/command`, { body: { type } }), 'تم إرسال الأمر — تابع الرد في صفحة مراقبة النظام');
  };

  return (
    <>
      <PageHeader title="الكاميرات والبوابات" subtitle="الكاميرات تظهر هنا تلقائياً بمجرد اتصالها بخادم MQTT"
        actions={<button type="button" className="btn-primary" onClick={() => setEdit({ sn: '', gate_id: '', direction: 'in', name: '' })}><Icon name="plus" className="size-4" />إضافة برقم تسلسلي</button>} />
      <div className="mb-4"><Tabs value={filter} onChange={setFilter} items={[['', 'الكل'], ['unassigned', 'غير مرتبطة'], ['offline', 'منقطعة']]} /></div>

      <div className="card overflow-hidden">
        {!rows ? <Spinner /> : !rows.length ? <Empty>لا توجد كاميرات</Empty> : (
          <ul className="divide-y divide-slate-100 dark:divide-ink-800">
            {rows.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                <div className={`rounded-xl p-2.5 ${c.is_online ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15' : 'bg-rose-50 text-rose-600 dark:bg-rose-500/15'}`}><Icon name="camera" /></div>
                <div className="min-w-48 flex-1">
                  <div className="font-mono text-sm font-semibold" dir="ltr" style={{ textAlign: 'right' }}>{c.sn}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {c.model || 'طراز غير معروف'}{c.software_version ? ` · v${c.software_version}` : ''} · {timeAgo(c.last_seen_at)}
                  </div>
                  {c.subtopic && <div className="font-mono text-[11px] text-slate-400" dir="ltr" style={{ textAlign: 'right' }}>{c.pubtopic} ⇄ {c.subtopic}</div>}
                </div>
                <div className="min-w-40">
                  {c.gate_id ? <>
                    <div className="text-sm font-semibold">{c.tenant_name}</div>
                    <div className="text-xs text-slate-500">{c.gate_name} · <Badge tone={c.direction === 'in' ? 'blue' : 'gray'}>{c.direction === 'in' ? 'عمود الدخول' : 'عمود الخروج'}</Badge></div>
                  </> : <Badge tone="amber">غير مرتبطة</Badge>}
                </div>
                <OnlineDot online={c.is_online} />
                <div className="flex gap-1">
                  <button type="button" className="btn-primary btn-sm" onClick={() => setEdit({ ...c, gate_id: c.gate_id ?? '', direction: c.direction ?? 'in', name: c.name ?? '' })}>ربط / تعديل</button>
                  <select className="input w-auto py-1.5 text-xs" value="" onChange={(e) => e.target.value && command(c, e.target.value)} aria-label="أوامر">
                    <option value="">أوامر...</option>
                    {COMMANDS.map(([k, v]) => <option key={k} value={k} disabled={k === 'apply_topics' && !c.gate_id}>{v}</option>)}
                  </select>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `ربط الكاميرا ${edit.sn}` : 'إضافة كاميرا'}>
        {edit && (
          <form onSubmit={save} className="grid gap-3">
            {!edit.id && <Field label="الرقم التسلسلي (SN)"><input className="input font-mono" dir="ltr" required value={edit.sn} onChange={(e) => setEdit({ ...edit, sn: e.target.value })} /></Field>}
            <Field label="البوابة">
              <select className="input" value={edit.gate_id} onChange={(e) => setEdit({ ...edit, gate_id: e.target.value, direction: gateColumns(e.target.value) === 1 ? 'in' : edit.direction })}>
                <option value="">— غير مرتبطة —</option>
                {tenants.map((t) => (
                  <optgroup key={t.id} label={t.name}>
                    {t.gates.map((g) => <option key={g.id} value={g.id}>{g.name} — {g.columns === 1 ? 'عمود واحد' : 'عمودان'}</option>)}
                  </optgroup>
                ))}
              </select>
            </Field>
            {edit.gate_id && (
              <Field label="العمود">
                <Tabs value={edit.direction} onChange={(v) => setEdit({ ...edit, direction: v })}
                  items={gateColumns(edit.gate_id) === 1 ? [['in', 'عمود الدخول']] : [['in', 'عمود الدخول'], ['out', 'عمود الخروج']]} />
              </Field>
            )}
            <Field label="اسم وصفي (اختياري)"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <div className="mt-2 flex gap-2">
              {edit.id && <button type="button" className="btn-ghost text-rose-600" onClick={() => window.confirm('حذف الكاميرا من النظام؟') && run(() => api(`/admin/cameras/${edit.id}`, { method: 'DELETE' }), 'تم الحذف').then(() => { setEdit(null); load(); })}><Icon name="trash" className="size-4" /></button>}
              <button type="button" className="btn-ghost flex-1" onClick={() => setEdit(null)}>إلغاء</button>
              <button className="btn-primary flex-1" disabled={busy}>حفظ</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
