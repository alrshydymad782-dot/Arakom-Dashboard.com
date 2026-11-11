import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';
import { closeSocket } from './realtime';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = جاري التحميل، null = غير مسجل

  const refresh = useCallback(async () => {
    try { setUser(await api('/auth/me')); } catch { setUser(null); }
  }, []);

  useEffect(() => {
    refresh();
    const onUnauth = () => setUser(null);
    window.addEventListener('arakom:unauthorized', onUnauth);
    return () => window.removeEventListener('arakom:unauthorized', onUnauth);
  }, [refresh]);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    closeSocket();
    setUser(null);
  }, []);

  return <AuthCtx.Provider value={{ user, refresh, logout }}>{children}</AuthCtx.Provider>;
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
