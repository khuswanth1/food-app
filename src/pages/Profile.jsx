import { useState } from 'react';
import { Link } from 'react-router-dom';
import EditLocationAltRounded from '@mui/icons-material/EditLocationAltRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import FavoriteRounded from '@mui/icons-material/FavoriteRounded';
import SupportAgentRounded from '@mui/icons-material/SupportAgentRounded';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import { api } from '../api/client';
import AddressForm from '../components/AddressForm';
import { Async, Badge, Field, Modal, PageHeader, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAction, useApi } from '../hooks/useApi';

export default function Profile() {
  const { user, updateUser, logout } = useAuth();
  const toast = useToast();
  const addresses = useApi('/users/me/addresses');
  const [form, setForm] = useState({ full_name: user.full_name, phone: user.phone || '' });
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [editing, setEditing] = useState(null); // address object, {} for new
  const [run, busy] = useAction();

  const saveProfile = (e) => {
    e.preventDefault();
    run(async () => { updateUser((await api.patch('/users/me', { ...form, phone: form.phone || null })).data); toast('Profile updated'); })
      .catch((err) => toast(err.message, 'error'));
  };
  const changePw = (e) => {
    e.preventDefault();
    run(async () => { await api.post('/users/me/password', pw); setPw({ current_password: '', new_password: '' }); toast('Password changed'); })
      .catch((err) => toast(err.message, 'error'));
  };
  const saveAddress = (body) => run(async () => {
    if (editing.id) await api.put(`/users/me/addresses/${editing.id}`, body);
    else await api.post('/users/me/addresses', body);
    setEditing(null);
    addresses.reload();
    toast('Address saved');
  }).catch((err) => toast(err.message, 'error'));
  const remove = (a) => run(async () => { await api.delete(`/users/me/addresses/${a.id}`); addresses.reload(); toast('Address removed'); })
    .catch((err) => toast(err.message, 'error'));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Account" subtitle={user.email} actions={<Badge tone="brand" className="capitalize">{user.role}</Badge>} />

      <div className="grid grid-cols-2 gap-3 md:hidden">
        <Link to="/favorites" className="card flex items-center gap-2 p-4 text-sm font-semibold"><FavoriteRounded className="text-brand-500" />Favorites</Link>
        <Link to="/support" className="card flex items-center gap-2 p-4 text-sm font-semibold"><SupportAgentRounded className="text-brand-500" />Help</Link>
      </div>

      <form onSubmit={saveProfile} className="card space-y-3 p-5">
        <h2 className="font-bold">Profile</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name"><input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} minLength={2} required /></Field>
          <Field label="Phone"><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        </div>
        <button className="btn-primary" disabled={busy}>Save changes</button>
      </form>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-bold">Saved addresses</h2><button className="btn-ghost text-sm text-brand-600" onClick={() => setEditing({})}><AddRounded fontSize="small" />Add</button></div>
        <Async loading={addresses.loading} error={addresses.error} onRetry={addresses.reload} empty={!addresses.data?.length} emptyProps={{ title: 'No addresses yet' }}>
          <ul className="divide-y divide-gray-100 dark:divide-ink-700">
            {addresses.data?.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-3">
                <div className="flex-1 text-sm"><p className="font-semibold">{a.label} {a.is_default && <Badge tone="green">Default</Badge>}</p><p className="text-gray-500">{a.line1}, {a.city} {a.pincode}</p></div>
                <button className="btn-ghost p-2" onClick={() => setEditing(a)} aria-label={`Edit ${a.label}`}><EditLocationAltRounded fontSize="small" /></button>
                <button className="btn-ghost p-2 text-red-500" onClick={() => remove(a)} aria-label={`Delete ${a.label}`}><DeleteOutlineRounded fontSize="small" /></button>
              </li>
            ))}
          </ul>
        </Async>
      </section>

      <form onSubmit={changePw} className="card space-y-3 p-5">
        <h2 className="font-bold">Change password</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Current password"><input className="input" type="password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} required /></Field>
          <Field label="New password"><input className="input" type="password" autoComplete="new-password" minLength={8} value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} required /></Field>
        </div>
        <button className="btn-secondary" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : 'Update password'}</button>
      </form>

      <button className="btn-danger w-full md:hidden" onClick={logout}><LogoutRounded fontSize="small" />Log out</button>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit address' : 'Add address'}>
        {editing && <AddressForm initial={editing} onSubmit={saveAddress} busy={busy} />}
      </Modal>
    </div>
  );
}
