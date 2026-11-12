import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { fmtDateTime } from '../lib/format';
import { Badge, Icon, useAction, useToast } from '../components/ui';

/*
 * ربط بريد Outlook لإرسال رموز الدخول للعملاء
 * الطريقة المعتمدة من مايكروسوفت (بدون حفظ كلمة المرور):
 *   رمز قصير ← تفتح microsoft.com/devicelogin ← تسجل الدخول بحساب Outlook ← تكتب الرمز
 */
export default function MailCard() {
  const toast = useToast();
  const [st, setSt] = useState(null);
  const [device, setDevice] = useState(null);
  const [testTo, setTestTo] = useState('');
  const [run, busy] = useAction();
  const timer = useRef(null);

  const load = useCallback(() => api('/admin/mail/status').then(setSt), []);
  useEffect(() => { load(); return () => clearTimeout(timer.current); }, [load]);

  const poll = useCallback((interval) => {
    timer.current = setTimeout(async () => {
      try {
        const r = await api('/admin/mail/outlook/poll', { method: 'POST' });
        if (r.status === 'pending') return poll(interval);
        setDevice(null);
        if (r.status === 'connected') { toast(`تم ربط ${r.email || 'بريد Outlook'} بنجاح`); load(); }
        else toast(r.status === 'expired' ? 'انتهت مهلة الرمز، أعد المحاولة' : r.status === 'declined' ? 'تم رفض الإذن في مايكروسوفت' : r.message || 'تعذر الربط', 'err');
      } catch (e) {
        setDevice(null);
        toast(e.message, 'err');
      }
    }, interval * 1000);
  }, [load, toast]);

  const start = async () => {
    const d = await run(() => api('/admin/mail/outlook/start', { method: 'POST' }));
    if (d) { setDevice(d); poll(d.interval || 5); }
  };
  const copy = () => navigator.clipboard?.writeText(device.user_code).then(() => toast('تم نسخ الرمز'));
  const disconnect = () => window.confirm('إلغاء ربط بريد Outlook؟ لن تُرسل رموز الدخول حتى يُربط بريد آخر.')
    && run(() => api('/admin/mail/outlook', { method: 'DELETE' }), 'تم إلغاء الربط').then(load);
  const sendTest = () => run(() => api('/admin/mail/test', { body: { to: testTo } }), 'تم إرسال رسالة التجربة، تحقق من البريد');

  if (!st) return null;
  const o = st.outlook;
  return (
    <div className={`card mb-4 p-5 text-sm leading-7 ${o.connected ? '' : 'border-amber-300 dark:border-amber-500/40'}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold"><Icon name="bell" className="size-5 text-brand-500" />بريد Outlook لإرسال رموز الدخول</h2>
        <Badge tone={o.connected ? 'green' : 'amber'}>{o.connected ? 'مربوط' : 'غير مربوط'}</Badge>
      </div>

      {o.connected ? (
        <>
          <p>تُرسل رموز الدخول للعملاء من: <b dir="ltr">{o.email}</b>{o.connected_at && <span className="text-slate-500"> · رُبط {fmtDateTime(o.connected_at)}</span>}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input className="input max-w-xs" dir="ltr" type="email" placeholder="بريد لتجربة الإرسال" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
            <button type="button" className="btn-ghost" disabled={busy || !testTo} onClick={sendTest}>إرسال تجربة</button>
            <button type="button" className="btn-ghost text-rose-600" disabled={busy} onClick={disconnect}>إلغاء الربط</button>
          </div>
        </>
      ) : device ? (
        <div className="rounded-xl bg-brand-50 p-4 dark:bg-ink-800">
          <ol className="list-inside list-decimal space-y-2">
            <li>افتح: <a href={device.verification_uri} target="_blank" rel="noopener" className="font-bold text-brand-600 underline dark:text-brand-500" dir="ltr">{device.verification_uri}</a></li>
            <li>اكتب هذا الرمز:
              <button type="button" onClick={copy} title="نسخ" className="ms-2 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1 font-mono text-xl font-bold tracking-widest text-brand-600 shadow-sm dark:bg-ink-900" dir="ltr">
                {device.user_code}
              </button>
            </li>
            <li>سجّل الدخول بحساب Outlook الذي تريد الإرسال منه، ووافق على الصلاحية.</li>
          </ol>
          <p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><span className="size-2 animate-pulse rounded-full bg-brand-500" />بانتظار إكمال الدخول في مايكروسوفت...</p>
        </div>
      ) : (
        <>
          <p>اربط حساب Outlook الخاص بأراكم لترسل منه رموز الدخول للعملاء. لا نحفظ كلمة مرورك؛ تسجل الدخول في موقع مايكروسوفت مباشرة.</p>
          {o.error && <p className="mt-1 text-rose-600">انتهى الربط السابق: {o.error}</p>}
          {!o.configured ? (
            <p className="mt-2 rounded-xl bg-amber-50 p-3 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              مطلوب مرة واحدة: سجّل تطبيقاً مجانياً في Microsoft Entra وضع رقمه في <code>MS_CLIENT_ID</code> على السيرفر (الخطوات في ملف README).
            </p>
          ) : (
            <button type="button" className="btn-primary mt-3" disabled={busy} onClick={start}>ربط بريد Outlook</button>
          )}
        </>
      )}
    </div>
  );
}
