import { useState } from 'react';
import { api } from '../lib/api';
import { Field, Modal, useAction } from './ui';

// تغيير كلمة مرور الإدارة
export default function PasswordModal({ open, onClose }) {
  const [f, setF] = useState({ current: '', next: '', again: '' });
  const [err, setErr] = useState('');
  const [run, busy] = useAction();
  const set = (k) => (e) => { setErr(''); setF({ ...f, [k]: e.target.value }); };
  const close = () => { setF({ current: '', next: '', again: '' }); setErr(''); onClose(); };

  const submit = async (e) => {
    e.preventDefault();
    if (f.next.length < 10) return setErr('كلمة المرور الجديدة 10 أحرف على الأقل');
    if (f.next !== f.again) return setErr('كلمتا المرور الجديدتان غير متطابقتين');
    const ok = await run(() => api('/auth/password', { body: { current: f.current, next: f.next } }), 'تم تغيير كلمة المرور');
    if (ok) close();
  };

  return (
    <Modal open={open} onClose={close} title="تغيير كلمة المرور">
      <form onSubmit={submit} className="grid gap-3">
        <Field label="كلمة المرور الحالية">
          <input className="input" type="password" dir="ltr" autoComplete="current-password" required value={f.current} onChange={set('current')} />
        </Field>
        <Field label="كلمة المرور الجديدة (10 أحرف على الأقل)">
          <input className="input" type="password" dir="ltr" autoComplete="new-password" required minLength={10} value={f.next} onChange={set('next')} />
        </Field>
        <Field label="أعد كتابة كلمة المرور الجديدة">
          <input className="input" type="password" dir="ltr" autoComplete="new-password" required value={f.again} onChange={set('again')} />
        </Field>
        {err && <div className="text-sm font-semibold text-rose-600">{err}</div>}
        <div className="mt-1 flex gap-2">
          <button type="button" className="btn-ghost flex-1" onClick={close}>إلغاء</button>
          <button className="btn-primary flex-1" disabled={busy}>حفظ</button>
        </div>
      </form>
    </Modal>
  );
}
