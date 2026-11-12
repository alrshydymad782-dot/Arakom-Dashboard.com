import { StrictMode, lazy, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import './index.css';
import { AuthProvider, useAuth } from './lib/auth';
import { api } from './lib/api';
import { PORTAL, BASENAME } from './lib/portal';
import { ToastProvider, Spinner } from './components/ui';
import Layout from './components/Layout';
import Login from './components/Login';

const TenantShell = lazy(() => import('./tenant/TenantShell'));
const TenantHome = lazy(() => import('./tenant/Home'));
const Vehicles = lazy(() => import('./tenant/Vehicles'));
const Overview = lazy(() => import('./admin/Overview'));
const Tenants = lazy(() => import('./admin/Tenants'));
const TenantDetail = lazy(() => import('./admin/TenantDetail'));
const Cameras = lazy(() => import('./admin/Cameras'));
const SystemPage = lazy(() => import('./admin/System'));
const AdminLogs = lazy(() => import('./admin/Logs'));

const ADMIN_NAV = [
  { to: '/', end: true, icon: 'home', label: 'الرئيسية' },
  { to: '/tenants', icon: 'building', label: 'العملاء ولوحاتهم', short: 'العملاء' },
  { to: '/cameras', icon: 'camera', label: 'الكاميرات', short: 'الكاميرات' },
  { to: '/logs', icon: 'list', label: 'السجلات' },
  { to: '/system', icon: 'server', label: 'مراقبة النظام', short: 'النظام' },
];

// لوحة الإدارة
function AdminPortal() {
  const { user } = useAuth();
  if (user === undefined) return <Spinner />;
  if (!user) return <Login />;
  return (
    <Routes>
      <Route element={<Layout nav={ADMIN_NAV} portalName="لوحة الإدارة" />}>
        <Route index element={<Overview />} />
        <Route path="tenants" element={<Tenants />} />
        <Route path="tenants/:id" element={<TenantDetail />} />
        <Route path="cameras" element={<Cameras />} />
        <Route path="logs" element={<AdminLogs />} />
        <Route path="system" element={<SystemPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

// رابط العميل الخاص: /c/{رمز} يفتح الجلسة ثم ينتقل للوحة
function LinkEntry() {
  const { token } = useParams();
  const { refresh } = useAuth();
  const nav = useNavigate();
  const [error, setError] = useState('');
  useEffect(() => {
    api('/auth/link', { body: { token } })
      .then(async () => { await refresh(); nav('/', { replace: true }); })
      .catch((e) => setError(e.message));
  }, [token, refresh, nav]);
  return error ? <NoAccess message={error} /> : <Spinner />;
}

function NoAccess({ message }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-8 text-center">
        <div className="mx-auto mb-4 w-44 rounded-2xl bg-white p-2"><img src="/logo.png" alt="أراكم" className="w-full" /></div>
        <p className="text-sm text-slate-600 dark:text-slate-300">{message || 'افتح لوحة التحكم من الرابط الخاص الذي أرسلته لك أراكم.'}</p>
      </div>
    </div>
  );
}

// لوحة العميل
function AppPortal() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="c/:token" element={<LinkEntry />} />
      <Route path="*" element={user === undefined ? <Spinner /> : !user ? <NoAccess /> : (
        <Routes>
          <Route element={<TenantShell />}>
            <Route index element={<TenantHome />} />
            <Route path="vehicles" element={<Vehicles />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )} />
    </Routes>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={BASENAME}>
      <ToastProvider>
        <AuthProvider>
          <Suspense fallback={<Spinner />}>
            {PORTAL === 'admin' ? <AdminPortal /> : <AppPortal />}
          </Suspense>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
