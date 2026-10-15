import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import RestaurantRounded from '@mui/icons-material/RestaurantRounded';
import StorefrontRounded from '@mui/icons-material/StorefrontRounded';
import TwoWheelerRounded from '@mui/icons-material/TwoWheelerRounded';
import AdminPanelSettingsRounded from '@mui/icons-material/AdminPanelSettingsRounded';
import { API_URL, api, apiError } from '../api/client';
import { Logo } from '../components/Layout';
import { Field, Spinner } from '../components/ui';
import { HOME_BY_ROLE, useAuth } from '../context/AuthContext';

// Seeded demo accounts (see backend/app/seed.py). Demo data only.
const DEMO = [
  { role: 'Customer', email: 'customer@quickkart.dev', icon: RestaurantRounded },
  { role: 'Vendor', email: 'vendor@quickkart.dev', icon: StorefrontRounded },
  { role: 'Rider', email: 'rider@quickkart.dev', icon: TwoWheelerRounded },
  { role: 'Admin', email: 'admin@quickkart.dev', icon: AdminPanelSettingsRounded },
];
const DEMO_PASSWORD = 'Password@123';

const GOOGLE_ERRORS = {
  google_cancelled: 'Google sign-in was cancelled.',
  google_unverified: 'Your Google email address is not verified.',
  google_unavailable: 'Could not reach Google. Please try again.',
  account_disabled: 'Your account has been suspended.',
};
export const googleErrorMessage = (code) => GOOGLE_ERRORS[code] || 'Google sign-in failed. Please try again.';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** "Continue with Google" — rendered only when the API has Google credentials configured. */
export function GoogleButton({ role = 'customer', label = 'Continue with Google' }) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let live = true;
    api.get('/auth/providers', { silent: true }).then(({ data }) => live && setEnabled(!!data.google)).catch(() => {});
    return () => { live = false; };
  }, []);
  if (!enabled) return null;
  return (
    <>
      <a href={`${API_URL}/auth/google/login?role=${role}`}
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-ink-700 dark:bg-ink-800 dark:text-gray-100 dark:hover:bg-ink-700">
        <GoogleIcon />{label}
      </a>
      <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-gray-400">
        <span className="h-px flex-1 bg-gray-200 dark:bg-ink-700" />or<span className="h-px flex-1 bg-gray-200 dark:bg-ink-700" />
      </div>
    </>
  );
}

export function AuthShell({ title, subtitle, children }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-500 via-brand-600 to-rose-700 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="text-2xl font-extrabold">QuickKart</div>
        <div>
          <p className="text-5xl font-extrabold leading-tight">Food & groceries,<br />delivered in minutes.</p>
          <p className="mt-4 max-w-md text-white/80">Discover restaurants and stores near you, track your rider live, and get AI-powered picks tailored to your taste.</p>
        </div>
        <div className="flex gap-6 text-sm text-white/70"><span>🍕 Restaurants</span><span>🛒 Groceries</span><span>🛵 Live tracking</span></div>
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-2xl" />
      </div>
      <div className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8"><Logo /></div>
          <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
          <p className="mb-6 mt-1 text-gray-500 dark:text-gray-400">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await login(form.email, form.password);
      navigate(location.state?.from && user.role === 'customer' ? location.state.from : HOME_BY_ROLE[user.role], { replace: true });
    } catch (err) {
      setError(apiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to continue to QuickKart">
      <GoogleButton />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Email"><input className="input" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Password"><input className="input" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>}
        <button className="btn-primary w-full py-3" disabled={busy || !form.email || !form.password}>{busy ? <Spinner className="h-4 w-4" /> : 'Sign in'}</button>
      </form>
      <p className="mt-4 text-center text-sm text-gray-500">New here? <Link to="/register" className="font-semibold text-brand-600">Create an account</Link></p>

      <div className="mt-8">
        <p className="label text-center">Try a demo account</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DEMO.map(({ role, email, icon: Icon }) => (
            <button key={role} type="button" onClick={() => setForm({ email, password: DEMO_PASSWORD })}
              className="card flex flex-col items-center gap-1 px-2 py-3 text-xs font-semibold transition hover:ring-brand-500">
              <Icon className="text-brand-500" fontSize="small" />{role}
            </button>
          ))}
        </div>
      </div>
    </AuthShell>
  );
}
