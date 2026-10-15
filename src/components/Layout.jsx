import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import ShoppingCartRounded from '@mui/icons-material/ShoppingCartRounded';
import NotificationsRounded from '@mui/icons-material/NotificationsRounded';
import DarkModeRounded from '@mui/icons-material/DarkModeRounded';
import LightModeRounded from '@mui/icons-material/LightModeRounded';
import HomeRounded from '@mui/icons-material/HomeRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import MenuRounded from '@mui/icons-material/MenuRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import SupportAgentRounded from '@mui/icons-material/SupportAgentRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useNotifications } from '../context/NotificationContext';
import { useTheme } from '../context/ThemeContext';

export function Logo({ to = '/' }) {
  return (
    <Link to={to} className="flex items-center gap-2 font-extrabold tracking-tight" aria-label="QuickKart home">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white shadow-md shadow-brand-500/30"><ShoppingCartRounded fontSize="small" /></span>
      <span className="text-lg">Quick<span className="text-brand-500">Kart</span></span>
    </Link>
  );
}

function IconBadge({ to, icon: Icon, count, label }) {
  return (
    <Link to={to} className="btn-ghost relative p-2.5" aria-label={label}>
      <Icon />
      {count > 0 && <span className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">{count > 99 ? '99+' : count}</span>}
    </Link>
  );
}

function ThemeButton() {
  const { dark, toggle } = useTheme();
  return (
    <button onClick={toggle} className="btn-ghost p-2.5" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
      {dark ? <LightModeRounded /> : <DarkModeRounded />}
    </button>
  );
}

/** Storefront shell: top bar on desktop, bottom tab bar on mobile. */
export function CustomerLayout() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { count } = useCart();
  const { unread } = useNotifications();
  const isCustomer = user?.role === 'customer';
  const tabs = [
    { to: '/', label: 'Home', icon: HomeRounded, end: true },
    { to: '/orders', label: 'Orders', icon: ReceiptLongRounded },
    { to: '/cart', label: 'Cart', icon: ShoppingCartRounded, badge: count },
    { to: '/profile', label: 'Account', icon: PersonRounded },
  ];

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/85 backdrop-blur-lg dark:border-ink-800 dark:bg-ink-950/85">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4">
          <Logo />
          <nav className="ml-8 hidden gap-1 md:flex">
            {isCustomer && [['/', 'Discover'], ['/orders', 'Orders'], ['/favorites', 'Favorites'], ['/support', 'Help']].map(([to, l]) => (
              <NavLink key={to} to={to} end className={({ isActive }) => `btn-ghost px-3 py-2 ${isActive ? 'text-brand-600 dark:text-brand-400' : ''}`}>{l}</NavLink>
            ))}
          </nav>
          
          <div className="mx-4 hidden max-w-sm flex-1 md:block">
            <form onSubmit={(e) => { e.preventDefault(); navigate('/?q=' + encodeURIComponent(e.target.search.value)); }}>
              <div className="relative group">
                <SearchRounded className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand-500 transition-colors" fontSize="small" />
                <input name="search" type="search" placeholder="Search for restaurants, dishes..." className="w-full rounded-full border border-gray-200 bg-gray-50/50 py-2 pl-9 pr-4 text-sm outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20 dark:border-ink-800 dark:bg-ink-900/50 dark:focus:border-brand-500 dark:focus:bg-ink-900" />
              </div>
            </form>
          </div>

          <div className="ml-auto flex items-center gap-0.5">
            <ThemeButton />
            {user ? (
              <>
                <IconBadge to="/notifications" icon={NotificationsRounded} count={unread} label={`Notifications (${unread} unread)`} />
                {isCustomer && <span className="hidden md:block"><IconBadge to="/cart" icon={ShoppingCartRounded} count={count} label={`Cart (${count} items)`} /></span>}
                <Link to="/profile" className="ml-1 hidden items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-gray-100 md:flex dark:hover:bg-ink-800">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">{user.full_name[0]}</span>
                  <span className="text-sm font-medium">{user.full_name.split(' ')[0]}</span>
                </Link>
                <button onClick={logout} className="btn-ghost hidden p-2.5 md:inline-flex" aria-label="Log out"><LogoutRounded /></button>
              </>
            ) : (
              <Link to="/login" className="btn-primary ml-2">Sign in</Link>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6"><Outlet /></main>
      {isCustomer && (
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-gray-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-ink-800 dark:bg-ink-950/95" aria-label="Primary">
          {tabs.map(({ to, label, icon: Icon, badge, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-brand-600 dark:text-brand-400' : 'text-gray-500'}`}>
              <Icon fontSize="small" />{label}
              {badge > 0 && <span className="absolute right-[28%] top-1 rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-white">{badge}</span>}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}

/** Sidebar shell for vendor / delivery / admin consoles. */
export function DashboardLayout({ nav, title }) {
  const { user, logout } = useAuth();
  const { unread, live } = useNotifications();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const links = (
    <nav className="space-y-1 p-3" aria-label={`${title} navigation`}>
      {nav.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
          className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-ink-800'}`}>
          <Icon fontSize="small" />{label}
        </NavLink>
      ))}
      <NavLink to="/notifications" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-ink-800">
        <NotificationsRounded fontSize="small" />Notifications {unread > 0 && <span className="ml-auto rounded-full bg-brand-500 px-2 text-xs text-white">{unread}</span>}
      </NavLink>
      {user?.role !== 'admin' && (
        <NavLink to="/support" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-ink-800">
          <SupportAgentRounded fontSize="small" />Help
        </NavLink>
      )}
    </nav>
  );

  return (
    <div className="min-h-screen md:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-gray-100 bg-white md:flex dark:border-ink-800 dark:bg-ink-900">
        <div className="flex h-16 items-center px-5"><Logo to={nav[0].to} /></div>
        <p className="px-6 pb-1 text-[11px] font-bold uppercase tracking-widest text-gray-400">{title}</p>
        <div className="flex-1 overflow-y-auto">{links}</div>
        <div className="border-t border-gray-100 p-4 text-sm dark:border-ink-800">
          <p className="font-semibold">{user?.full_name}</p>
          <p className="truncate text-xs text-gray-500">{user?.email}</p>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 md:hidden" onClick={() => setOpen(false)}>
          <aside className="h-full w-72 bg-white dark:bg-ink-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-16 items-center justify-between px-4"><Logo to={nav[0].to} /><button className="btn-ghost p-2" onClick={() => setOpen(false)} aria-label="Close menu"><CloseRounded /></button></div>
            {links}
          </aside>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-gray-100 bg-white/85 px-4 backdrop-blur-lg dark:border-ink-800 dark:bg-ink-950/85">
          <button className="btn-ghost p-2 md:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><MenuRounded /></button>
          <span className="font-semibold md:hidden">{title}</span>
          <span className={`ml-auto hidden items-center gap-1.5 text-xs sm:flex ${live ? 'text-emerald-600' : 'text-gray-400'}`} title="Realtime connection">
            <span className={`h-2 w-2 rounded-full ${live ? 'animate-pulse bg-emerald-500' : 'bg-gray-400'}`} />{live ? 'Live' : 'Offline'}
          </span>
          <div className="ml-auto flex items-center gap-0.5 sm:ml-2">
            <ThemeButton />
            <IconBadge to="/notifications" icon={NotificationsRounded} count={unread} label="Notifications" />
            <button onClick={() => { logout(); navigate('/login'); }} className="btn-ghost p-2.5" aria-label="Log out"><LogoutRounded /></button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 md:p-6"><Outlet /></main>
      </div>
    </div>
  );
}

