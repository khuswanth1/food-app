import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiError } from '../api/client';
import { Field, Spinner } from '../components/ui';
import { HOME_BY_ROLE, useAuth } from '../context/AuthContext';
import { AuthShell, GoogleButton } from './Login';

const ROLES = [
  { value: 'customer', label: 'Order food', hint: 'Customer' },
  { value: 'vendor', label: 'Sell on QuickKart', hint: 'Vendor' },
  { value: 'delivery', label: 'Deliver orders', hint: 'Partner' },
];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', role: 'customer' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const weak = form.password && form.password.length < 8;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await register({ ...form, phone: form.phone || null });
      navigate(HOME_BY_ROLE[user.role], { replace: true });
    } catch (err) {
      setError(apiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="Join QuickKart in under a minute">
      <div className="mb-5 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Account type">
        {ROLES.map((r) => (
          <button type="button" key={r.value} role="radio" aria-checked={form.role === r.value} onClick={() => setForm({ ...form, role: r.value })}
            className={`rounded-xl border-2 px-2 py-3 text-center text-xs transition ${form.role === r.value ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10' : 'border-gray-200 dark:border-ink-700'}`}>
            <span className="block font-bold">{r.hint}</span><span className="text-gray-500">{r.label}</span>
          </button>
        ))}
      </div>
      <GoogleButton role={form.role} label="Sign up with Google" />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name"><input className="input" required minLength={2} value={form.full_name} onChange={set('full_name')} autoComplete="name" /></Field>
        <Field label="Email"><input className="input" type="email" required value={form.email} onChange={set('email')} autoComplete="email" /></Field>
        <Field label="Phone (optional)"><input className="input" type="tel" value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" autoComplete="tel" /></Field>
        <Field label="Password" error={weak ? 'At least 8 characters' : ''}><input className="input" type="password" required minLength={8} value={form.password} onChange={set('password')} autoComplete="new-password" /></Field>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>}
        <button className="btn-primary w-full py-3" disabled={busy || weak}>{busy ? <Spinner className="h-4 w-4" /> : 'Create account'}</button>
      </form>
      <p className="mt-4 text-center text-sm text-gray-500">Already have an account? <Link to="/login" className="font-semibold text-brand-600">Sign in</Link></p>
    </AuthShell>
  );
}
