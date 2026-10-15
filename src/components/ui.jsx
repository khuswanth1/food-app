import { useEffect, useState, useSyncExternalStore } from 'react';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import InboxRounded from '@mui/icons-material/InboxRounded';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import StarRounded from '@mui/icons-material/StarRounded';
import { loadingTracker } from '../api/client';
import { STATUS } from '../utils/format';

export function Spinner({ className = 'h-5 w-5' }) {
  return <span role="progressbar" aria-label="Loading" className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} />;
}

export function Skeleton({ className = '' }) {
  return <div className={`relative overflow-hidden rounded-xl bg-gray-200/70 dark:bg-ink-800 ${className}`}>
    <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/5" />
  </div>;
}

export function PageLoader({ rows = 3 }) {
  return <div className="space-y-3" aria-busy="true">{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;
}

export function ErrorState({ error, onRetry }) {
  return (
    <div role="alert" className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
      <ErrorOutlineRounded className="text-red-500" fontSize="large" />
      <div>
        <p className="font-semibold">Couldn&apos;t load this</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">{error?.message || 'Unknown error'}</p>
      </div>
      {onRetry && <button className="btn-secondary" onClick={() => onRetry()}>Try again</button>}
    </div>
  );
}

export function EmptyState({ icon: Icon = InboxRounded, title, text, action }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <div className="mb-2 rounded-2xl bg-brand-50 p-4 text-brand-500 dark:bg-brand-500/10"><Icon fontSize="large" /></div>
      <p className="text-lg font-semibold">{title}</p>
      {text && <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">{text}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Generic loading / error / empty switch so every page handles all three states consistently. */
export function Async({ loading, error, onRetry, empty, emptyProps, skeleton, children }) {
  if (loading) return skeleton || <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (empty) return <EmptyState {...emptyProps} />;
  return children;
}

const TONES = {
  gray: 'bg-gray-100 text-gray-700 dark:bg-ink-700 dark:text-gray-200',
  blue: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  brand: 'bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
  green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
};

export function Badge({ tone = 'gray', children, className = '' }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]} ${className}`}>{children}</span>;
}

export function StatusBadge({ status }) {
  const s = STATUS[status] || { label: status, tone: 'gray' };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function Rating({ value, count, className = '' }) {
  const tone = value >= 4 ? 'bg-emerald-600' : value >= 3 ? 'bg-amber-500' : value > 0 ? 'bg-red-500' : 'bg-gray-400';
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${className}`}>
      <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-bold text-white ${tone}`}>
        {value > 0 ? value.toFixed(1) : 'New'} <StarRounded sx={{ fontSize: 12 }} />
      </span>
      {count !== undefined && <span className="text-gray-500 dark:text-gray-400">({count})</span>}
    </span>
  );
}

export function Modal({ open, onClose, title, children, footer, wide = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[900] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className={`card max-h-[92vh] w-full overflow-y-auto rounded-b-none sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-inherit px-5 py-4 dark:border-ink-700">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="btn-ghost -mr-2 p-2" aria-label="Close"><CloseRounded /></button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4 dark:border-ink-700">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, error, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="label">{label}</span>}
      {children}
      {error && <span className="mt-1 block text-xs text-red-500">{error}</span>}
    </label>
  );
}

export function StatCard({ icon: Icon, label, value, hint, tone = 'brand' }) {
  const bg = { brand: 'bg-brand-50 text-brand-600 dark:bg-brand-500/10', green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10',
    blue: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10', amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10', red: 'bg-red-50 text-red-600 dark:bg-red-500/10' }[tone];
  return (
    <div className="card flex items-center gap-4 p-4">
      {Icon && <div className={`rounded-xl p-3 ${bg}`}><Icon /></div>}
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
        <p className="truncate text-xl font-bold">{value}</p>
        {hint && <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
      </div>
    </div>
  );
}

export function Pagination({ page, pages, onChange }) {
  if (!pages || pages <= 1) return null;
  return (
    <nav className="flex items-center justify-center gap-2 py-4" aria-label="Pagination">
      <button className="btn-secondary px-3" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page"><ChevronLeftRounded /></button>
      <span className="text-sm text-gray-500">Page {page} of {pages}</span>
      <button className="btn-secondary px-3" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page"><ChevronRightRounded /></button>
    </nav>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-ink-600'}`}>
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Registers a lazy route chunk with the global tracker while its Suspense fallback is shown. */
export function RouteLoader() {
  useEffect(() => { loadingTracker.start(); return () => loadingTracker.done(); }, []);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-4 p-8 text-center animate-in fade-in duration-500">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <div className="absolute inset-0 animate-ping rounded-full bg-brand-500 opacity-20" />
        <div className="absolute h-16 w-16 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-ink-700 dark:border-t-brand-500" />
        <span className="text-2xl" aria-hidden="true">🍔</span>
      </div>
      <p className="font-semibold text-gray-500 dark:text-gray-400">Loading QuickKart...</p>
    </div>
  );
}

const useGlobalLoading = () => useSyncExternalStore(loadingTracker.subscribe, loadingTracker.isLoading);

/**
 * Slim bar pinned to the top of the viewport while any tracked API request or route chunk is in flight.
 * Waits 150ms before appearing so fast responses don't flash, trickles towards 90%, then completes and fades.
 */
export function TopProgressBar() {
  const loading = useGlobalLoading();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (loading) {
      const show = setTimeout(() => { setVisible(true); setProgress(15); }, 150);
      const trickle = setInterval(() => setProgress((p) => (p ? p + (90 - p) * 0.1 : p)), 250);
      return () => { clearTimeout(show); clearInterval(trickle); };
    }
    if (!visible) return undefined;
    setProgress(100);
    const hide = setTimeout(() => { setVisible(false); setProgress(0); }, 300);
    return () => clearTimeout(hide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  if (!visible) return null;
  return (
    <div role="progressbar" aria-label="Page loading" aria-valuenow={Math.round(progress)}
      className="pointer-events-none fixed left-0 top-0 z-[9999] h-[3px] w-full">
      <div className={`h-full bg-brand-500 shadow-[0_0_8px_theme(colors.brand.500)] transition-all duration-300 ease-out ${progress === 100 ? 'opacity-0 delay-150' : ''}`}
        style={{ width: `${progress}%` }} />
    </div>
  );
}
