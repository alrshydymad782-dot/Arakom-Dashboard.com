import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { AuthProvider, useAuth } from './lib/auth';
import { ToastProvider, Spinner } from './components/ui';
import Layout from './components/Layout';
import Login from './components/Login';

/*
 * تطبيق واحد يخدم النطاقين:
 *   admin.arakom.sa  → لوحة الإدارة العليا
 *   app.arakom.sa    → لوحة المجمع
 * محلياً (localhost): المسار /admin للإدارة، وأي مسار آخر للمجمع
 */
const host = window.location.hostname;
const PORTAL = host.startsWith('admin.') ? 'admin'
  : host.startsWith('app.') ? 'app'
    : window.location.pathname.startsWith('/admin') ? 'admin' : 'app';
const BASENAME = PORTAL === 'admin' && !host.startsWith('admin.') ? '/admin' : '/';

const TenantHome = lazy(() => import('./tenant/Home'));
const Vehicles = lazy(() => import('./tenant/Vehicles'));
const TenantLogs = lazy(() => import('./tenant/Logs'));
const TenantSettings = lazy(() => import('./tenant/Settings'));
const Overview = lazy(() => import('./admin/Overview'));
const Tenants = lazy(() => import('./admin/Tenants'));
const TenantDetail = lazy(() => import('./admin/TenantDetail'));
const Cameras = lazy(() => import('./admin/Cameras'));
const Billing = lazy(() => import('./admin/Billing'));
const SystemPage = lazy(() => import('./admin/System'));
const AdminLogs = lazy(() => import('./admin/Logs'));

const TENANT_NAV = [
  { to: '/', end: true, icon: 'home', label: 'الرئيسية' },
  { to: '/vehicles', icon: 'car', label: 'السيارات المسموح لها', short: 'السيارات' },
  { to: '/logs', icon: 'list', label: 'السجلات والتقارير', short: 'السجلات' },
  { to: '/settings', icon: 'users', label: 'الحسابات والإعدادات', short: 'الإعدادات' },
];
const ADMIN_NAV = [
  { to: '/', end: true, icon: 'home', label: 'النظرة العامة', short: 'الرئيسية' },
  { to: '/tenants', icon: 'building', label: 'المجمعات والعملاء', short: 'العملاء' },
  { to: '/cameras', icon: 'camera', label: 'الكاميرات والبوابات', short: 'الكاميرات' },
  { to: '/billing', icon: 'card', label: 'الباقات ومدفوعات سلة', short: 'الفوترة' },
  { to: '/system', icon: 'server', label: 'مراقبة النظام', short: 'النظام' },
  { to: '/logs', icon: 'list', label: 'كل السجلات', desktopOnly: true },
];

function Portal() {
  const { user } = useAuth();
  if (user === undefined) return <Spinner />;
  if (!user) return <Login portal={PORTAL} />;
  const isAdmin = user.role === 'super_admin';
  if (PORTAL === 'admin' && !isAdmin) return <WrongPortal to="app" />;
  if (PORTAL === 'app' && isAdmin) return <WrongPortal to="admin" />;

  return (
    <Suspense fallback={<Spinner />}>
      {isAdmin ? (
        <Routes>
          <Route element={<Layout nav={ADMIN_NAV} portalName="الإدارة العليا" />}>
            <Route index element={<Overview />} />
            <Route path="tenants" element={<Tenants />} />
            <Route path="tenants/:id" element={<TenantDetail />} />
            <Route path="cameras" element={<Cameras />} />
            <Route path="billing" element={<Billing />} />
            <Route path="system" element={<SystemPage />} />
            <Route path="logs" element={<AdminLogs />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      ) : (
        <Routes>
          <Route element={<Layout nav={TENANT_NAV} portalName={user.role === 'tenant_guard' ? 'حارس البوابة' : 'لوحة المجمع'} />}>
            <Route index element={<TenantHome />} />
            <Route path="vehicles" element={<Vehicles />} />
            <Route path="logs" element={<TenantLogs />} />
            <Route path="settings" element={<TenantSettings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )}
    </Suspense>
  );
}

function WrongPortal({ to }) {
  const { logout } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card max-w-sm p-6 text-center">
        <p className="mb-4">هذا الحساب يدخل من {to === 'admin' ? 'لوحة الإدارة admin.arakom.sa' : 'لوحة المجمع app.arakom.sa'}</p>
        <button type="button" className="btn-primary" onClick={logout}>تسجيل الخروج</button>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={BASENAME}>
      <ToastProvider>
        <AuthProvider>
          <Portal />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
