import { NavLink, Outlet } from 'react-router-dom';
import { useAuth, useTheme } from '../lib/auth';
import { useSocketConnected } from '../lib/realtime';
import { Icon } from './ui';

// هيكل الصفحات: شريط جانبي على الكمبيوتر، وشريط سفلي على الجوال
export default function Layout({ nav, portalName }) {
  const { user, logout } = useAuth();
  const [dark, toggleTheme] = useTheme();
  const live = useSocketConnected();
  const mobileNav = nav.filter((n) => !n.desktopOnly).slice(0, 5);

  const link = ({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive
    ? 'bg-brand-600 text-white shadow-sm dark:bg-brand-500 dark:text-ink-950' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-ink-800'}`;

  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-e border-slate-200 bg-white p-4 lg:flex dark:border-ink-800 dark:bg-ink-900">
        <div className="mb-6 flex items-center gap-3 px-1">
          <img src="/mark.png" alt="أراكم" className="size-11 rounded-xl bg-white p-0.5" />
          <div>
            <div className="text-lg font-bold leading-tight text-brand-600 dark:text-white">أراكم <span className="text-sm font-semibold text-brand-500">ARAKOM</span></div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{portalName}</div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={link}><Icon name={n.icon} />{n.label}</NavLink>)}
        </nav>
        <div className="mt-4 border-t border-slate-200 pt-4 dark:border-ink-800">
          <div className="mb-3 px-1">
            <div className="truncate text-sm font-semibold">{user?.full_name || user?.username}</div>
            <div className="truncate text-xs text-slate-500 dark:text-slate-400">{user?.tenant_name || 'إدارة أراكم'}</div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={toggleTheme} className="btn-ghost btn-sm flex-1"><Icon name={dark ? 'sun' : 'moon'} className="size-4" />{dark ? 'فاتح' : 'داكن'}</button>
            <button type="button" onClick={logout} className="btn-ghost btn-sm flex-1"><Icon name="logout" className="size-4" />خروج</button>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/85 px-4 py-3 backdrop-blur lg:hidden dark:border-ink-800 dark:bg-ink-950/85">
          <img src="/mark.png" alt="أراكم" className="size-9 rounded-xl bg-white p-0.5" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-bold leading-tight">{user?.tenant_name || 'أراكم'}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{portalName}</div>
          </div>
          <button type="button" onClick={toggleTheme} className="rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-ink-800" aria-label="الوضع الداكن"><Icon name={dark ? 'sun' : 'moon'} /></button>
          <button type="button" onClick={logout} className="rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-ink-800" aria-label="خروج"><Icon name="logout" /></button>
        </header>

        <div className="hidden items-center justify-end gap-2 px-8 pt-5 text-xs text-slate-500 lg:flex dark:text-slate-400">
          <span className={`size-2 rounded-full ${live ? 'bg-emerald-500' : 'bg-slate-400'}`} />{live ? 'تحديث مباشر' : 'جاري الاتصال...'}
        </div>
        <main className="mx-auto max-w-7xl px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-10 lg:pt-2">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden dark:border-ink-800 dark:bg-ink-900/95">
        {mobileNav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-brand-600 dark:text-brand-500' : 'text-slate-500 dark:text-slate-400'}`}>
            <Icon name={n.icon} className="size-6" />{n.short || n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
