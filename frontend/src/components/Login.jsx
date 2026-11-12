import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Icon } from './ui';

// دخول الإدارة فقط (العملاء يدخلون من رابطهم الخاص)
export default function Login() {
  const { refresh } = useAuth();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/auth/login', { body: form });
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-brand-100/60 px-4 py-8 dark:from-ink-950 dark:via-ink-950 dark:to-ink-900">
      <form onSubmit={submit} className="card w-full max-w-sm p-6 sm:p-8">
        <div className="mx-auto mb-3 w-52 rounded-2xl bg-white p-3"><img src="/logo.png" alt="ARAKOM أراكم" className="w-full" /></div>
        <p className="mb-5 text-center text-sm text-slate-500 dark:text-slate-400">لوحة الإدارة</p>
        <label className="label" htmlFor="u">اسم المستخدم</label>
        <input id="u" className="input mb-4" dir="ltr" autoComplete="username" autoCapitalize="off" required
          value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <label className="label" htmlFor="p">كلمة المرور</label>
        <input id="p" type="password" className="input" dir="ltr" autoComplete="current-password" required
          value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        {error && <div className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>}
        <button className="btn-primary mt-6 w-full py-3" disabled={busy}>{busy ? 'جاري الدخول...' : <><Icon name="shield" />دخول</>}</button>
      </form>
    </div>
  );
}
