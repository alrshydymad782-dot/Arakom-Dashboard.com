import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useLive } from '../lib/realtime';
import { fmtDate, fmtTime } from '../lib/format';
import { Badge, Empty, PageHeader, Spinner, StatCard } from '../components/ui';
import HourlyChart from '../components/HourlyChart';
import { Icon, useAction } from '../components/ui';
import { plateKey } from '../lib/plates';
import { Plate } from '../components/ui';

// سيارات سجلها العملاء بصورة/PDF فقط: تكتب الإدارة رقم اللوحة من الصورة
function PendingPlates() {
  const [rows, setRows] = useState(null);
  const [vals, setVals] = useState({});
  const [run, busy] = useAction();
  const load = useCallback(() => api('/admin/vehicles/pending').then(setRows), []);
  useEffect(() => { load(); }, [load]);
  if (!rows?.length) return null;
  const save = (id) => run(() => api(`/admin/vehicles/${id}`, { method: 'PATCH', body: { plate: vals[id] } }), 'تم حفظ رقم اللوحة').then((ok) => ok && load());
  return (
    <div className="card mb-4 overflow-hidden border-amber-300 dark:border-amber-500/40">
      <div className="border-b border-slate-200 px-4 py-3 font-bold dark:border-ink-700">سيارات بانتظار إدخال رقم اللوحة ({rows.length})</div>
      <ul className="divide-y divide-slate-100 dark:divide-ink-800">
        {rows.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <a href={`/api/admin/vehicles/${v.id}/document`} target="_blank" rel="noopener" className="shrink-0 overflow-hidden rounded-lg border border-slate-200 dark:border-ink-700">
              {v.document_type === 'application/pdf'
                ? <span className="flex h-12 w-16 items-center justify-center bg-rose-50 text-xs font-bold text-rose-600">PDF</span>
                : <img src={`/api/admin/vehicles/${v.id}/document`} alt="" className="h-12 w-16 object-cover" />}
            </a>
            <div className="min-w-32 flex-1 text-sm"><div className="font-semibold">{v.tenant_name}</div><div className="text-xs text-slate-500">{fmtDate(v.created_at)}</div></div>
            <input className="input w-44" placeholder="رقم اللوحة" value={vals[v.id] || ''} onChange={(e) => setVals({ ...vals, [v.id]: e.target.value })} />
            {vals[v.id] && <Plate plateKey={plateKey(vals[v.id])} />}
            <button type="button" className="btn-primary btn-sm" disabled={busy || !vals[v.id]} onClick={() => save(v.id)}><Icon name="plus" className="size-4" />حفظ</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const EVENT_AR = {
  broker_connected: 'اتصل الخادم بوسيط MQTT',
  broker_disconnected: 'انقطع اتصال الخادم بوسيط MQTT',
  camera_registered: 'سجّلت الكاميرا نفسها',
  camera_discovered: 'كاميرا جديدة اتصلت (تحتاج ربطاً)',
  camera_offline: 'انقطعت الكاميرا',
  camera_timeout: 'توقف نبض الكاميرا',
  gate_topic_mismatch: 'الكاميرا تنشر على موضوع بوابة مختلفة',
  result_without_sn: 'قراءة بدون رقم تسلسلي',
  invalid_payload: 'رسالة غير صالحة',
  handler_error: 'خطأ في معالجة رسالة',
  subscribe_failed: 'فشل الاشتراك في المواضيع',
};
export const eventLabel = (e) => EVENT_AR[e]
  || (e.startsWith('reply:') ? `رد الكاميرا: ${e.slice(6)}` : e.startsWith('command:') ? `أمر مرسل: ${e.slice(8)}` : e);
export const LEVEL_TONE = { info: 'blue', warn: 'amber', error: 'red' };

export default function Overview() {
  const [d, setD] = useState(null);
  const load = useCallback(() => api('/admin/overview').then(setD), []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  useLive('mqtt:event', useCallback((ev) => setD((p) => p && { ...p, events: [ev, ...p.events].slice(0, 15) }), []));
  useLive('mqtt:status', useCallback((st) => setD((p) => p && { ...p, mqtt: st }), []));
  useLive('access:new', useCallback((log) => setD((p) => {
    if (!p) return p;
    const t = { ...p.today, total: p.today.total + 1 };
    if (log.decision === 'opened' && log.direction === 'in') t.entries++;
    if (log.decision === 'opened' && log.direction === 'out') t.exits++;
    if (log.decision === 'denied') t.denied++;
    return { ...p, today: t };
  }), []));

  if (!d) return <Spinner />;
  const c = d.counts;
  return (
    <>
      <PageHeader title="النظرة العامة" subtitle="حالة منظومة أراكم بالكامل" />

      <div className={`mb-4 flex items-center gap-3 rounded-2xl border p-4 ${d.mqtt.connected
        ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10' : 'border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10'}`}>
        <span className={`size-3 rounded-full ${d.mqtt.connected ? 'bg-emerald-500' : 'animate-pulse bg-rose-500'}`} />
        <div className="flex-1 text-sm">
          <b>خادم MQTT: {d.mqtt.connected ? 'متصل' : 'غير متصل'}</b>
          <span className="text-slate-600 dark:text-slate-300"> · رسائل مستلمة {d.mqtt.received} · أوامر مرسلة {d.mqtt.sent}{d.mqtt.lastMessageAt ? ` · آخر رسالة ${fmtTime(d.mqtt.lastMessageAt)}` : ''}</span>
        </div>
        <Link to="/system" className="text-sm font-semibold text-brand-700 dark:text-brand-500">التفاصيل</Link>
      </div>

      <PendingPlates />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon="building" label="لوحات العملاء (مفتوحة / الكل)" value={`${c.active_tenants} / ${c.tenants}`} />
        <StatCard icon="gate" label="البوابات المسجلة" value={c.gates} tone="blue" hint={`${c.cameras} كاميرا`} />
        <StatCard icon="camera" label="الكاميرات المتصلة" value={`${c.cameras_online} / ${c.cameras}`} tone={c.cameras_online < c.cameras ? 'amber' : 'brand'}
          hint={c.cameras_unassigned ? `${c.cameras_unassigned} غير مرتبطة` : undefined} />
        <StatCard icon="car" label="السيارات المسجلة" value={c.vehicles.toLocaleString('en')} tone="amber" />
        <StatCard icon="in" label="دخول اليوم" value={d.today.entries} />
        <StatCard icon="out" label="خروج اليوم" value={d.today.exits} tone="blue" />
        <StatCard icon="x" label="مرفوض اليوم" value={d.today.denied} tone="red" />
        <StatCard icon="plus" label="سيارات بانتظار رقم اللوحة" value={c.pending_plates} tone={c.pending_plates ? 'amber' : 'brand'} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-2">
          <h2 className="mb-4 font-bold">حركة اليوم (كل المجمعات)</h2>
          <HourlyChart hours={d.hours} />
        </div>
        <div className="card p-4">
          <h2 className="mb-3 font-bold">لوحات مقفلة أو تنتهي خلال 7 أيام</h2>
          {!d.expiring.length ? <Empty>لا يوجد</Empty> : (
            <ul className="divide-y divide-slate-100 dark:divide-ink-800">
              {d.expiring.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                  <Link to={`/tenants/${t.id}`} className="font-medium hover:underline">{t.name}</Link>
                  <Badge tone={t.days_left == null || t.days_left < 0 ? 'red' : 'amber'}>{t.days_left == null ? 'بدون اشتراك' : t.days_left < 0 ? `مقفلة منذ ${fmtDate(t.ends_at)}` : `${t.days_left} يوم`}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card mt-4 overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3 font-bold dark:border-ink-700">آخر أحداث MQTT (مباشر)</div>
        {!d.events.length ? <Empty /> : (
          <ul className="divide-y divide-slate-100 text-sm dark:divide-ink-800">
            {d.events.map((e, i) => (
              <li key={e.id ?? `n${i}`} className="flex items-center gap-3 px-4 py-2.5">
                <Badge tone={LEVEL_TONE[e.level]}>{e.level}</Badge>
                <span className="flex-1">{eventLabel(e.event)}</span>
                {e.camera_sn && <span className="font-mono text-xs text-slate-500" dir="ltr">{e.camera_sn}</span>}
                <span className="text-xs text-slate-500">{fmtTime(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
