import { useState } from 'react';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import StorefrontRounded from '@mui/icons-material/StorefrontRounded';
import { api } from '../../api/client';
import { StoreCover } from '../../components/StoreCard';
import { Async, Badge, Field, Modal, PageHeader, Rating, Spinner, Toggle } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { useAction, useApi } from '../../hooks/useApi';
import { inr } from '../../utils/format';

const BLANK = { name: '', store_type: 'restaurant', description: '', cuisines: '', address: '', city: 'Bengaluru', lat: 12.9716, lng: 77.5946, prep_time_min: 20, delivery_fee: 30, min_order: 0, price_level: 2, is_veg_only: false, is_open: true };

function StoreForm({ initial, onSubmit, busy }) {
  const [s, setS] = useState({ ...BLANK, ...initial, cuisines: (initial?.cuisines || []).join(', ') });
  const set = (k, num) => (e) => setS({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : num ? Number(e.target.value) : e.target.value });
  const isNew = !initial?.id;
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); onSubmit({ ...s, cuisines: s.cuisines.split(',').map((c) => c.trim()).filter(Boolean) }); }}>
      <Field label="Store name" className="sm:col-span-2"><input className="input" required minLength={2} value={s.name} onChange={set('name')} /></Field>
      {isNew && <Field label="Type"><select className="input" value={s.store_type} onChange={set('store_type')}><option value="restaurant">Restaurant</option><option value="grocery">Grocery</option></select></Field>}
      <Field label="Cuisines / categories (comma separated)" className={isNew ? '' : 'sm:col-span-2'}><input className="input" value={s.cuisines} onChange={set('cuisines')} placeholder="Pizza, Italian" /></Field>
      <Field label="Description" className="sm:col-span-2"><textarea className="input" rows={2} value={s.description} onChange={set('description')} /></Field>
      <Field label="Address" className="sm:col-span-2"><input className="input" required value={s.address} onChange={set('address')} /></Field>
      {isNew && <><Field label="Latitude"><input className="input" type="number" step="any" value={s.lat} onChange={set('lat', true)} /></Field>
        <Field label="Longitude"><input className="input" type="number" step="any" value={s.lng} onChange={set('lng', true)} /></Field></>}
      <Field label="Prep time (min)"><input className="input" type="number" min={1} value={s.prep_time_min} onChange={set('prep_time_min', true)} /></Field>
      <Field label="Delivery fee (₹)"><input className="input" type="number" min={0} value={s.delivery_fee} onChange={set('delivery_fee', true)} /></Field>
      <Field label="Minimum order (₹)"><input className="input" type="number" min={0} value={s.min_order} onChange={set('min_order', true)} /></Field>
      <Field label="Price level"><select className="input" value={s.price_level} onChange={set('price_level', true)}>{[1, 2, 3, 4].map((p) => <option key={p} value={p}>{'₹'.repeat(p)}</option>)}</select></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-500" checked={s.is_veg_only} onChange={set('is_veg_only')} />Pure veg</label>
      <button className="btn-primary sm:col-span-2" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : isNew ? 'Submit for approval' : 'Save changes'}</button>
    </form>
  );
}

export default function VendorStores() {
  const { data, loading, error, reload } = useApi('/vendor/stores');
  const [editing, setEditing] = useState(null);
  const [run, busy] = useAction();
  const toast = useToast();

  const save = (body) => run(async () => {
    if (editing.id) {
      const { store_type, lat, lng, city, ...patch } = body; // immutable after creation
      await api.patch(`/vendor/stores/${editing.id}`, patch);
    } else await api.post('/vendor/stores', body);
    setEditing(null);
    reload(true);
    toast(editing.id ? 'Store updated' : 'Store submitted for admin approval');
  }).catch((e) => toast(e.message, 'error'));

  const toggleOpen = (s) => run(async () => { await api.patch(`/vendor/stores/${s.id}`, { is_open: !s.is_open }); reload(true); })
    .catch((e) => toast(e.message, 'error'));
  const remove = (s) => {
    if (!window.confirm(`Delete ${s.name}? Stores with past orders are deactivated instead.`)) return;
    run(async () => { const { data: r } = await api.delete(`/vendor/stores/${s.id}`); toast(r.message); reload(true); }).catch((e) => toast(e.message, 'error'));
  };

  return (
    <div>
      <PageHeader title="My stores" subtitle="Manage restaurant & store details" actions={<button className="btn-primary" onClick={() => setEditing({})}><AddRounded fontSize="small" />New store</button>} />
      <Async loading={loading} error={error} onRetry={reload} empty={!data?.length} emptyProps={{ icon: StorefrontRounded, title: 'No stores yet', text: 'Create your first store to start selling.' }}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data?.map((s) => (
            <div key={s.id} className="card overflow-hidden">
              <StoreCover store={s} className="h-28" />
              <div className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2"><h3 className="font-bold">{s.name}</h3><Rating value={s.rating} count={s.rating_count} /></div>
                <p className="text-sm text-gray-500">{s.cuisines.join(', ')}</p>
                <div className="flex flex-wrap gap-2 text-xs"><Badge className="capitalize">{s.store_type}</Badge>{!s.is_approved && <Badge tone="amber">Pending approval</Badge>}<Badge>Fee {inr(s.delivery_fee)}</Badge><Badge>{s.prep_time_min} min prep</Badge></div>
                <div className="flex items-center justify-between pt-2">
                  <span className="flex items-center gap-2 text-sm"><Toggle checked={s.is_open} onChange={() => toggleOpen(s)} label={`${s.name} open`} />{s.is_open ? 'Open' : 'Closed'}</span>
                  <span>
                    <button className="btn-ghost p-2" onClick={() => setEditing(s)} aria-label={`Edit ${s.name}`}><EditRounded fontSize="small" /></button>
                    <button className="btn-ghost p-2 text-red-500" onClick={() => remove(s)} aria-label={`Delete ${s.name}`}><DeleteOutlineRounded fontSize="small" /></button>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Async>
      <Modal wide open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit store' : 'New store'}>
        {editing && <StoreForm initial={editing.id ? editing : null} onSubmit={save} busy={busy} />}
      </Modal>
    </div>
  );
}
