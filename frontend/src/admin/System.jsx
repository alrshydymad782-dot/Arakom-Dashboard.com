import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useLive } from '../lib/realtime';
import { bytes, fmtDateTime, fmtTime } from '../lib/format';
import { Badge, Empty, Icon, PageHeader, Spinner, Tabs } from '../components/ui';
import { eventLabel, LEVEL_TONE } from './Overview';

export default function SystemPage() {
  const [d, setD] = useState(null);
  const [level, setLevel] = useState('');
  const [audit, setAudit] = useState(null);
  const [tab, setTab] = useState('mqtt');

  const load = useCallback(() => api('/admin/system').then(setD), []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);
  useEffect(() => { if (tab === 'audit' && !audit) api('/admin/audit').then(setAudit); }, [tab, audit]);

  useLive('mqtt:event', useCallback((ev) => setD((p) => p && { ...p, events: [{ ...ev, _new: true }, ...p.events].slice(0, 300) }), []));
  useLive('mqtt:status', useCallback((st) => setD((p) => p && { ...p, mqtt: st }), []));

  if (!d) return <Spinner />;
  const events = d.events.filter((e) => !level || e.level === level);

  return (
    <>
      <PageHeader title="مراقبة النظام" actions={<button type="button" className="btn-ghost" onClick={load}><Icon name="refresh" className="size-4" />تحديث</button>} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Box label="اتصال MQTT">
          <Badge tone={d.mqtt.connected ? 'green' : 'red'}>{d.mqtt.connected ? 'متصل' : 'غير متصل'}</Badge>
          {d.mqtt.since && <div className="mt-1 text-xs text-slate-500">منذ {fmtDateTime(d.mqtt.since)}</div>}
          {d.mqtt.lastError && <div className="mt-1 text-xs text-rose-600" dir="ltr">{d.mqtt.lastError}</div>}
        </Box>
        <Box label="الرسائل">{d.mqtt.received.toLocaleString('en')} مستلمة · {d.mqtt.sent.toLocaleString('en')} مرسلة</Box>
        <Box label="حجم قاعدة البيانات">{bytes(d.db.bytes)}</Box>
        <Box label="مدة تشغيل الخادم">{Math.floor(d.uptime / 3600)} ساعة · Node {d.node}</Box>
      </div>

      <div className="my-4"><Tabs value={tab} onChange={setTab} items={[['mqtt', 'سجل MQTT المباشر'], ['db', 'استهلاك قاعدة البيانات'], ['audit', 'سجل العمليات']]} /></div>

      {tab === 'mqtt' && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-ink-700">
            <span className="flex items-center gap-2 text-sm font-semibold"><span className="size-2 animate-pulse rounded-full bg-emerald-500" />مباشر</span>
            <Tabs value={level} onChange={setLevel} items={[['', 'الكل'], ['warn', 'تحذيرات'], ['error', 'أخطاء']]} />
          </div>
          {!events.length ? <Empty /> : (
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full">
                <tbody className="divide-y divide-slate-100 dark:divide-ink-800">
                  {events.map((e, i) => (
                    <tr key={e.id ?? `n${i}`} className={e._new ? 'flash' : ''}>
                      <td className="td w-20 text-xs text-slate-500">{fmtTime(e.created_at)}</td>
                      <td className="td w-16"><Badge tone={LEVEL_TONE[e.level]}>{e.level}</Badge></td>
                      <td className="td">{eventLabel(e.event)}</td>
                      <td className="td font-mono text-xs" dir="ltr">{e.camera_sn || ''}</td>
                      <td className="td max-w-xs truncate font-mono text-[11px] text-slate-500" dir="ltr" title={JSON.stringify(e.details)}>{e.topic || ''} {e.details ? JSON.stringify(e.details) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'db' && (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-ink-800/60"><tr><th className="th">الجدول</th><th className="th">عدد الصفوف</th><th className="th">الحجم</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-ink-800">
              {d.tables.map((t) => (
                <tr key={t.table}><td className="td font-mono" dir="ltr" style={{ textAlign: 'right' }}>{t.table}</td><td className="td">{Number(t.rows).toLocaleString('en')}</td><td className="td">{bytes(t.bytes)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'audit' && (
        <div className="card overflow-x-auto">
          {!audit ? <Spinner /> : (
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-ink-800/60"><tr><th className="th">الوقت</th><th className="th">المستخدم</th><th className="th">المجمع</th><th className="th">العملية</th><th className="th">التفاصيل</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-ink-800">
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td className="td text-slate-500">{fmtDateTime(a.created_at)}</td><td className="td" dir="ltr">{a.username || '—'}</td>
                    <td className="td">{a.tenant_name || '—'}</td><td className="td font-mono text-xs">{a.action}</td>
                    <td className="td max-w-sm truncate font-mono text-[11px] text-slate-500" dir="ltr">{JSON.stringify(a.details)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}

const Box = ({ label, children }) => (
  <div className="card p-4"><div className="mb-1 text-xs text-slate-500 dark:text-slate-400">{label}</div><div className="text-sm font-semibold">{children}</div></div>
);
