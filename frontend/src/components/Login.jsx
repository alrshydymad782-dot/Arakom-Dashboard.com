import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Icon } from './ui';

export default function Login({ portal }) {
  const { refresh } = useAuth();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isAdmin = portal === 'admin';

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/auth/login', { body: { ...form, portal } });
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-100 px-4 dark:from-ink-950 dark:via-ink-950 dark:to-ink-900">
      <form onSubmit={submit} className="card w-full max-w-sm p-6 sm:p-8">
        <img src="/icon.svg" alt="" className="mx-auto mb-4 size-16 rounded-2xl" />
        <h1 className="text-center text-2xl font-bold">أراكم</h1>
        <p className="mb-6 mt-1 text-center text-sm text-slate-500 dark:text-slate-400">
          {isAdmin ? 'لوحة الإدارة العليا' : 'بوابات المرور الذكية — لوحة المجمع'}
        </p>
        <label className="label" htmlFor="u">اسم المستخدم</label>
        <input id="u" className="input mb-4" dir="ltr" autoComplete="username" autoCapitalize="off" required
          value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <label className="label" htmlFor="p">كلمة المرور</label>
        <input id="p" type="password" className="input" dir="ltr" autoComplete="current-password" required
          value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        {error && <div className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>}
        <button className="btn-primary mt-6 w-full py-3" disabled={busy}>
          {busy ? 'جاري الدخول...' : <><Icon name={isAdmin ? 'shield' : 'gate'} />دخول</>}
        </button>
      </form>
    </div>
  );
}
