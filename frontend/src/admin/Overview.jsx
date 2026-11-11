import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useLive } from '../lib/realtime';
import { fmtDate, fmtTime } from '../lib/format';
import { Badge, Empty, PageHeader, Spinner, StatCard } from '../components/ui';
import HourlyChart from '../components/HourlyChart';

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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon="building" label="المجمعات (النشطة / الكل)" value={`${c.active_tenants} / ${c.tenants}`} />
        <StatCard icon="gate" label="البوابات المسجلة" value={c.gates} tone="blue" hint={`${c.cameras} كاميرا`} />
        <StatCard icon="camera" label="الكاميرات المتصلة" value={`${c.cameras_online} / ${c.cameras}`} tone={c.cameras_online < c.cameras ? 'amber' : 'brand'}
          hint={c.cameras_unassigned ? `${c.cameras_unassigned} غير مرتبطة` : undefined} />
        <StatCard icon="car" label="السيارات المسجلة" value={c.vehicles.toLocaleString('en')} tone="amber" />
        <StatCard icon="in" label="دخول اليوم" value={d.today.entries} />
        <StatCard icon="out" label="خروج اليوم" value={d.today.exits} tone="blue" />
        <StatCard icon="x" label="مرفوض اليوم" value={d.today.denied} tone="red" />
        <StatCard icon="card" label="مدفوعات تحتاج مراجعة" value={c.payments_pending} tone={c.payments_pending ? 'red' : 'brand'} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-2">
          <h2 className="mb-4 font-bold">حركة اليوم (كل المجمعات)</h2>
          <HourlyChart hours={d.hours} />
        </div>
        <div className="card p-4">
          <h2 className="mb-3 font-bold">اشتراكات تنتهي قريباً</h2>
          {!d.expiring.length ? <Empty>لا يوجد</Empty> : (
            <ul className="divide-y divide-slate-100 dark:divide-ink-800">
              {d.expiring.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                  <Link to={`/tenants/${t.id}`} className="font-medium hover:underline">{t.name}</Link>
                  <Badge tone={t.days_left < 0 ? 'red' : 'amber'}>{t.days_left < 0 ? `انتهى ${fmtDate(t.ends_at)}` : `${t.days_left} يوم`}</Badge>
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
