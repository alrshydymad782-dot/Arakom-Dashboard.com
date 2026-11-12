import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';
import { closeSocket } from './realtime';
import { PORTAL } from './portal';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = جاري التحميل، null = لا توجد جلسة

  const refresh = useCallback(async () => {
    try { setUser(await api(`/auth/me?portal=${PORTAL}`)); } catch { setUser(null); }
  }, []);

  useEffect(() => {
    // صفحة رابط العميل /c/{رمز} تفتح الجلسة بنفسها
    if (!window.location.pathname.startsWith('/c/')) refresh();
    const onUnauth = () => setUser(null);
    window.addEventListener('arakom:unauthorized', onUnauth);
    return () => window.removeEventListener('arakom:unauthorized', onUnauth);
  }, [refresh]);

  const logout = useCallback(async () => {
    await api(`/auth/logout?portal=${PORTAL}`, { method: 'POST' }).catch(() => {});
    closeSocket();
    setUser(null);
  }, []);

  return <AuthCtx.Provider value={{ user, setUser, refresh, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('theme', next ? 'dark' : 'light'); } catch { /* تجاهل */ }
    setDark(next);
  };
  return [dark, toggle];
}
