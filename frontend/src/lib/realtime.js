// اتصال Socket.io واحد مشترك لكل الصفحات
import { io } from 'socket.io-client';
import { useEffect, useState } from 'react';
import { PORTAL } from './portal';

let socket = null;

export function getSocket() {
  // portal يحدد أي جلسة يستخدمها الخادم: الإدارة أو العميل
  if (!socket) socket = io({ path: '/socket.io', withCredentials: true, transports: ['websocket', 'polling'], query: { portal: PORTAL } });
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
}

// الاستماع لحدث مباشر داخل مكوّن React
export function useLive(event, handler) {
  useEffect(() => {
    const s = getSocket();
    s.on(event, handler);
    return () => { s.off(event, handler); };
  }, [event, handler]);
}

export function useSocketConnected() {
  const [ok, setOk] = useState(() => getSocket().connected);
  useEffect(() => {
    const s = getSocket();
    const on = () => setOk(true);
    const off = () => setOk(false);
    setOk(s.connected); // قد يكون الاتصال تم قبل تسجيل المستمع
    s.on('connect', on);
    s.on('disconnect', off);
    return () => { s.off('connect', on); s.off('disconnect', off); };
  }, []);
  return ok;
}
