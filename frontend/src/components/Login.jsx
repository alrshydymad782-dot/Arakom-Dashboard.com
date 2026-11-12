import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Icon } from './ui';

// الدخول بالبريد الإلكتروني أو رقم الجوال: بكلمة المرور، أو برمز يُرسل إلى البريد
export default function Login({ portal }) {
  const { refresh } = useAuth();
  const isAdmin = portal === 'admin';
  const [mode, setMode] = useState('password'); // password | code
  const [step, setStep] = useState('ask'); // في وضع الرمز: ask ثم verify
  const [codeEnabled, setCodeEnabled] = useState(false);
  const [opts, setOpts] = useState({});
  const [storeLink, setStoreLink] = useState(null);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/auth/options').then((o) => {
      setOpts(o);
      setCodeEnabled(!!o.emailCode);
      // مثل الدخول في متجر أراكم: البريد أو الجوال ثم رمز التحقق
      if (o.emailCode && o.storeLogin && !isAdmin) setMode('code');
    }).catch(() => {});
  }, [isAdmin]);

  const run = async (fn) => {
    setBusy(true);
    setError('');
    setStoreLink(null);
    try { await fn(); } catch (err) {
      setError(err.message);
      if (err.data?.not_in_store) setStoreLink(err.data.store_url || opts.storeUrl || null);
    } finally { setBusy(false); }
  };

  const submit = (e) => {
    e.preventDefault();
    if (mode === 'password') {
      return run(async () => { await api('/auth/login', { body: { identifier, password, portal } }); await refresh(); });
    }
    if (step === 'ask') {
      return run(async () => {
        const r = await api('/auth/code/request', { body: { identifier, portal } });
        setInfo(r.message);
        setStep('verify');
      });
    }
    return run(async () => { await api('/auth/code/verify', { body: { identifier, code, portal } }); await refresh(); });
  };

  const switchMode = (m) => { setMode(m); setStep('ask'); setError(''); setInfo(''); setCode(''); };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-brand-100/60 px-4 py-8 dark:from-ink-950 dark:via-ink-950 dark:to-ink-900">
      <form onSubmit={submit} className="card w-full max-w-sm p-6 sm:p-8">
        <div className="mx-auto mb-3 w-52 rounded-2xl bg-white p-3"><img src="/logo.png" alt="ARAKOM أراكم" className="w-full" /></div>
        <p className="mb-5 text-center text-sm text-slate-500 dark:text-slate-400">
          {isAdmin ? 'لوحة الإدارة العليا' : 'ادخل بنفس حسابك في متجر أراكم (البريد أو الجوال)'}
        </p>

        {codeEnabled && (isAdmin || !opts.storeLogin) && (
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-sm dark:bg-ink-800">
            {[['password', 'كلمة المرور'], ['code', 'رمز على البريد']].map(([m, label]) => (
              <button key={m} type="button" onClick={() => switchMode(m)}
                className={`rounded-lg py-2 font-semibold transition ${mode === m ? 'bg-white shadow-sm dark:bg-ink-700' : 'text-slate-500'}`}>{label}</button>
            ))}
          </div>
        )}

        <label className="label" htmlFor="u">البريد الإلكتروني أو رقم الجوال</label>
        <input id="u" className="input mb-4" dir="ltr" autoComplete="username" autoCapitalize="off" inputMode="email" required
          placeholder="name@example.com / 05xxxxxxxx" value={identifier} disabled={mode === 'code' && step === 'verify'}
          onChange={(e) => setIdentifier(e.target.value)} />

        {mode === 'password' && <>
          <label className="label" htmlFor="p">كلمة المرور</label>
          <input id="p" type="password" className="input" dir="ltr" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </>}

        {mode === 'code' && step === 'verify' && <>
          {info && <div className="mb-3 rounded-xl bg-brand-50 p-3 text-xs text-brand-700 dark:bg-ink-800 dark:text-brand-100">{info}</div>}
          <label className="label" htmlFor="c">رمز الدخول (6 أرقام)</label>
          <input id="c" className="input text-center text-2xl tracking-[0.5em]" dir="ltr" inputMode="numeric" autoComplete="one-time-code"
            maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          <button type="button" className="mt-2 text-xs font-semibold text-brand-600 dark:text-brand-500" onClick={() => { setStep('ask'); setCode(''); }}>
            تغيير البريد أو إعادة إرسال الرمز
          </button>
        </>}

        {error && (
          <div className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
            {storeLink && <a href={storeLink} target="_blank" rel="noopener" className="mt-2 block font-bold text-brand-600 underline dark:text-brand-500">التسجيل في متجر أراكم ←</a>}
          </div>
        )}
        <button className="btn-primary mt-6 w-full py-3" disabled={busy}>
          {busy ? 'جاري...' : mode === 'code' && step === 'ask' ? 'أرسل رمز الدخول' : <><Icon name={isAdmin ? 'shield' : 'gate'} />دخول</>}
        </button>
        {!isAdmin && codeEnabled && opts.storeLogin && (
          <button type="button" className="mt-4 w-full text-center text-xs text-slate-500 hover:text-brand-600"
            onClick={() => switchMode(mode === 'code' ? 'password' : 'code')}>
            {mode === 'code' ? 'لديك كلمة مرور؟ الدخول بكلمة المرور' : 'الدخول برمز التحقق (مثل المتجر)'}
          </button>
        )}
      </form>
    </div>
  );
}
