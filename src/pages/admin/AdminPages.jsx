import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import SearchRounded from '@mui/icons-material/SearchRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import { api } from '../../api/client';
import DataTable from '../../components/DataTable';
import { Badge, Field, Modal, PageHeader, Rating, Spinner, StatCard, StatusBadge, Toggle } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { useAction, useApi } from '../../hooks/useApi';
import { useDebounced } from '../../hooks/useLocation';
import { dateTime, inr } from '../../utils/format';

/** Shared list state: search + filter + pagination over an admin endpoint. */
function useList(url, extra = {}, searchParam = 'q') {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const query = useDebounced(q);
  const res = useApi(url, { page, size: 15, [searchParam]: query || undefined, ...extra });
  return { ...res, page, setPage, q, setQ: (v) => { setQ(v); setPage(1); } };
}

function Search({ value, onChange, placeholder }) {
  return (
    <div className="relative min-w-48 flex-1"><SearchRounded className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fontSize="small" />
      <input className="input pl-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} /></div>
  );
}

function Chips({ options, value, onChange }) {
  return <div className="flex flex-wrap gap-2">{options.map(([v, l]) => <button key={l} className={`chip ${value === v ? 'chip-active' : ''}`} onClick={() => onChange(v)}>{l}</button>)}</div>;
}

const ROLE_TONE = { admin: 'red', vendor: 'violet', delivery: 'blue', customer: 'gray' };

function Users() {
  const [role, setRole] = useState(undefined);
  const list = useList('/admin/users', { role });
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'vendor' });
  const [run, busy] = useAction();
  const toast = useToast();
  const toggle = (u) => run(async () => { const { data } = await api.post(`/admin/users/${u.id}/toggle-active`); list.setData((d) => ({ ...d, items: d.items.map((x) => (x.id === u.id ? data : x)) })); toast(data.is_active ? 'User activated' : 'User suspended'); })
    .catch((e) => toast(e.message, 'error'));
  const create = (e) => { e.preventDefault(); run(async () => { await api.post('/admin/users', form); setCreating(false); list.reload(true); toast('User created'); }).catch((err) => toast(err.message, 'error')); };

  return (
    <>
      <PageHeader title="Users" subtitle="Customers, vendors, riders and admins" actions={<button className="btn-primary" onClick={() => setCreating(true)}><AddRounded fontSize="small" />Add user</button>} />
      <div className="mb-4 flex flex-wrap items-center gap-3"><Search value={list.q} onChange={list.setQ} placeholder="Search name or email" />
        <Chips value={role} onChange={(v) => { setRole(v); list.setPage(1); }} options={[[undefined, 'All'], ['customer', 'Customers'], ['vendor', 'Vendors'], ['delivery', 'Riders'], ['admin', 'Admins']]} /></div>
      <DataTable {...list} rows={list.data?.items} pages={list.data?.pages} onPage={list.setPage} onRetry={list.reload} columns={[
        { key: 'full_name', label: 'Name', render: (u) => <span className="font-medium">{u.full_name}</span> },
        { key: 'email', label: 'Email' },
        { key: 'role', label: 'Role', render: (u) => <Badge tone={ROLE_TONE[u.role]} className="capitalize">{u.role}</Badge> },
        { key: 'created_at', label: 'Joined', render: (u) => dateTime(u.created_at) },
        { key: 'is_active', label: 'Active', render: (u) => <Toggle checked={u.is_active} onChange={() => toggle(u)} label={`${u.full_name} active`} /> },
      ]} />
      <Modal open={creating} onClose={() => setCreating(false)} title="Add user">
        <form className="space-y-3" onSubmit={create}>
          <Field label="Full name"><input className="input" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
          <Field label="Email"><input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Temporary password"><input className="input" type="password" minLength={8} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" /></Field>
          <Field label="Role"><select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{['customer', 'vendor', 'delivery', 'admin'].map((r) => <option key={r}>{r}</option>)}</select></Field>
          <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : 'Create user'}</button>
        </form>
      </Modal>
    </>
  );
}

function Stores() {
  const [pending, setPending] = useState(false);
  const list = useList('/admin/stores', { pending: pending || undefined });
  const [run] = useAction();
  const toast = useToast();
  const approve = (s, approved) => run(async () => { const { data } = await api.post(`/admin/stores/${s.id}/approval`, null, { params: { approved } }); list.setData((d) => ({ ...d, items: d.items.map((x) => (x.id === s.id ? data : x)) })); toast(approved ? `${s.name} approved` : `${s.name} suspended`); })
    .catch((e) => toast(e.message, 'error'));
  return (
    <>
      <PageHeader title="Vendors & stores" subtitle="Approve new stores and suspend bad actors" />
      <div className="mb-4 flex flex-wrap items-center gap-3"><Search value={list.q} onChange={list.setQ} placeholder="Search stores" /><Chips value={pending} onChange={(v) => { setPending(v); list.setPage(1); }} options={[[false, 'All'], [true, 'Pending approval']]} /></div>
      <DataTable {...list} rows={list.data?.items} pages={list.data?.pages} onPage={list.setPage} onRetry={list.reload} columns={[
        { key: 'name', label: 'Store', render: (s) => <Link to={`/stores/${s.id}`} className="font-medium hover:text-brand-600">{s.name}</Link> },
        { key: 'store_type', label: 'Type', render: (s) => <span className="capitalize">{s.store_type}</span> },
        { key: 'vendor_id', label: 'Vendor #' },
        { key: 'rating', label: 'Rating', render: (s) => <Rating value={s.rating} count={s.rating_count} /> },
        { key: 'is_approved', label: 'Status', render: (s) => (s.is_approved ? <Badge tone="green">Live</Badge> : <Badge tone="amber">Pending / suspended</Badge>) },
        { key: 'a', label: '', render: (s) => (s.is_approved ? <button className="btn-danger px-3 py-1.5" onClick={() => approve(s, false)}>Suspend</button> : <button className="btn-primary px-3 py-1.5" onClick={() => approve(s, true)}>Approve</button>) },
      ]} />
    </>
  );
}

function Orders() {
  const [status, setStatus] = useState(undefined);
  const list = useList('/admin/orders', { status });
  const [run] = useAction();
  const toast = useToast();
  const cancel = (o) => {
    const reason = window.prompt('Reason for cancelling (customer will be refunded):', 'Cancelled by support');
    if (reason) run(async () => { await api.post(`/admin/orders/${o.id}/cancel`, { reason }); list.reload(true); toast('Order cancelled'); }).catch((e) => toast(e.message, 'error'));
  };
  return (
    <>
      <PageHeader title="Orders" subtitle="Monitor and intervene on any order" />
      <div className="mb-4 flex flex-wrap items-center gap-3"><Search value={list.q} onChange={list.setQ} placeholder="Order number" />
        <Chips value={status} onChange={(v) => { setStatus(v); list.setPage(1); }} options={[[undefined, 'All'], ['placed', 'Placed'], ['preparing', 'Preparing'], ['out_for_delivery', 'On the way'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']]} /></div>
      <DataTable {...list} rows={list.data?.items} pages={list.data?.pages} onPage={list.setPage} onRetry={list.reload} columns={[
        { key: 'order_number', label: 'Order', render: (o) => <Link to={`/orders/${o.id}`} className="font-medium hover:text-brand-600">{o.order_number}</Link> },
        { key: 'store', label: 'Store', render: (o) => o.store.name },
        { key: 'customer', label: 'Customer', render: (o) => o.customer?.full_name },
        { key: 'status', label: 'Status', render: (o) => <StatusBadge status={o.status} /> },
        { key: 'total', label: 'Total', render: (o) => inr(o.total) },
        { key: 'created_at', label: 'Placed', render: (o) => dateTime(o.created_at) },
        { key: 'a', label: '', render: (o) => !['delivered', 'cancelled'].includes(o.status) && <button className="btn-danger px-3 py-1.5" onClick={() => cancel(o)}>Cancel</button> },
      ]} />
    </>
  );
}

function Products() {
  const [low, setLow] = useState(false);
  const list = useList('/admin/products', { low_stock: low || undefined });
  const [run] = useAction();
  const toast = useToast();
  const toggle = (p) => run(async () => { const { data } = await api.post(`/admin/products/${p.id}/toggle`); list.setData((d) => ({ ...d, items: d.items.map((x) => (x.id === p.id ? data : x)) })); })
    .catch((e) => toast(e.message, 'error'));
  return (
    <>
      <PageHeader title="Products" subtitle="Catalogue across all stores" />
      <div className="mb-4 flex flex-wrap items-center gap-3"><Search value={list.q} onChange={list.setQ} placeholder="Search products" /><Chips value={low} onChange={(v) => { setLow(v); list.setPage(1); }} options={[[false, 'All'], [true, 'Low stock']]} /></div>
      <DataTable {...list} rows={list.data?.items} pages={list.data?.pages} onPage={list.setPage} onRetry={list.reload} columns={[
        { key: 'name', label: 'Product', render: (p) => <span className="font-medium">{p.name}</span> },
        { key: 'category', label: 'Category' },
        { key: 'store_id', label: 'Store #' },
        { key: 'price', label: 'Price', render: (p) => inr(p.price) },
        { key: 'stock', label: 'Stock', render: (p) => <span className={p.is_low_stock ? 'font-semibold text-red-600' : ''}>{p.stock}</span> },
        { key: 'is_available', label: 'Listed', render: (p) => <Toggle checked={p.is_available} onChange={() => toggle(p)} label={`${p.name} listed`} /> },
      ]} />
    </>
  );
}

const COUPON_BLANK = { code: '', description: '', discount_type: 'percent', value: 10, max_discount: '', min_order: 0, usage_limit: '', valid_until: '', is_active: true };

function Coupons() {
  const list = useApi('/admin/coupons');
  const [editing, setEditing] = useState(null);
  const [run, busy] = useAction();
  const toast = useToast();
  const save = (e) => {
    e.preventDefault();
    const c = editing;
    const body = { ...c, code: c.code.toUpperCase(), value: +c.value, min_order: +c.min_order, max_discount: c.max_discount === '' || c.max_discount == null ? null : +c.max_discount,
      usage_limit: c.usage_limit === '' || c.usage_limit == null ? null : +c.usage_limit, valid_until: c.valid_until ? new Date(c.valid_until).toISOString() : null, store_id: c.store_id ?? null };
    delete body.id; delete body.used_count;
    run(async () => { if (c.id) await api.put(`/admin/coupons/${c.id}`, body); else await api.post('/admin/coupons', body); setEditing(null); list.reload(true); toast('Coupon saved'); })
      .catch((err) => toast(err.message, 'error'));
  };
  const remove = (c) => window.confirm(`Delete ${c.code}?`) && run(async () => { await api.delete(`/admin/coupons/${c.id}`); list.reload(true); }).catch((err) => toast(err.message, 'error'));
  const set = (k) => (e) => setEditing({ ...editing, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <>
      <PageHeader title="Coupons" subtitle="Promotions and discount codes" actions={<button className="btn-primary" onClick={() => setEditing(COUPON_BLANK)}><AddRounded fontSize="small" />New coupon</button>} />
      <DataTable rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload} columns={[
        { key: 'code', label: 'Code', render: (c) => <span className="font-mono font-bold">{c.code}</span> },
        { key: 'description', label: 'Description' },
        { key: 'value', label: 'Discount', render: (c) => (c.discount_type === 'percent' ? `${c.value}%${c.max_discount ? ` (max ${inr(c.max_discount)})` : ''}` : inr(c.value)) },
        { key: 'min_order', label: 'Min order', render: (c) => inr(c.min_order) },
        { key: 'used_count', label: 'Used', render: (c) => `${c.used_count}${c.usage_limit ? ` / ${c.usage_limit}` : ''}` },
        { key: 'is_active', label: 'Status', render: (c) => (c.valid_until && new Date(c.valid_until) < new Date() ? <Badge tone="red">Expired</Badge> : c.is_active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>) },
        { key: 'a', label: '', render: (c) => <span className="flex gap-1"><button className="btn-ghost px-2 py-1" onClick={() => setEditing({ ...c, valid_until: c.valid_until ? c.valid_until.slice(0, 16) : '', max_discount: c.max_discount ?? '', usage_limit: c.usage_limit ?? '' })}>Edit</button><button className="btn-ghost px-2 py-1 text-red-500" onClick={() => remove(c)}>Delete</button></span> },
      ]} />
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? `Edit ${editing.code}` : 'New coupon'}>
        {editing && (
          <form className="grid grid-cols-2 gap-3" onSubmit={save}>
            <Field label="Code" className="col-span-2"><input className="input uppercase" required pattern="[A-Za-z0-9_-]{3,30}" value={editing.code} onChange={set('code')} /></Field>
            <Field label="Description" className="col-span-2"><input className="input" value={editing.description} onChange={set('description')} /></Field>
            <Field label="Type"><select className="input" value={editing.discount_type} onChange={set('discount_type')}><option value="percent">Percent</option><option value="flat">Flat ₹</option></select></Field>
            <Field label="Value"><input className="input" type="number" min="1" required value={editing.value} onChange={set('value')} /></Field>
            <Field label="Max discount ₹"><input className="input" type="number" min="1" value={editing.max_discount} onChange={set('max_discount')} /></Field>
            <Field label="Min order ₹"><input className="input" type="number" min="0" value={editing.min_order} onChange={set('min_order')} /></Field>
            <Field label="Usage limit"><input className="input" type="number" min="1" value={editing.usage_limit} onChange={set('usage_limit')} /></Field>
            <Field label="Valid until"><input className="input" type="datetime-local" value={editing.valid_until} onChange={set('valid_until')} /></Field>
            <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-500" checked={editing.is_active} onChange={set('is_active')} />Active</label>
            <button className="btn-primary col-span-2" disabled={busy}>Save coupon</button>
          </form>
        )}
      </Modal>
    </>
  );
}

function Payments() {
  const [status, setStatus] = useState(undefined);
  const list = useList('/admin/payments', { status });
  return (
    <>
      <PageHeader title="Payments" subtitle="Mock gateway transactions and refunds" />
      <div className="mb-4"><Chips value={status} onChange={(v) => { setStatus(v); list.setPage(1); }} options={[[undefined, 'All'], ['paid', 'Paid'], ['failed', 'Failed'], ['refunded', 'Refunded']]} /></div>
      <DataTable {...list} rows={list.data?.items} pages={list.data?.pages} onPage={list.setPage} onRetry={list.reload} columns={[
        { key: 'transaction_ref', label: 'Reference', render: (p) => <span className="font-mono text-xs">{p.transaction_ref}</span> },
        { key: 'order_id', label: 'Order', render: (p) => <Link className="hover:text-brand-600" to={`/orders/${p.order_id}`}>#{p.order_id}</Link> },
        { key: 'method', label: 'Method', render: (p) => p.method.toUpperCase() },
        { key: 'amount', label: 'Amount', render: (p) => <span className={p.amount < 0 ? 'text-sky-600' : ''}>{inr(p.amount)}</span> },
        { key: 'status', label: 'Status', render: (p) => <Badge tone={{ paid: 'green', failed: 'red', refunded: 'blue', pending: 'amber' }[p.status]}>{p.status}</Badge> },
        { key: 'created_at', label: 'When', render: (p) => dateTime(p.created_at) },
      ]} />
    </>
  );
}

function Reviews() {
  const [max, setMax] = useState(5);
  const list = useList('/admin/reviews', { max_rating: max });
  const [run] = useAction();
  const toggle = (r) => run(async () => { const { data } = await api.post(`/admin/reviews/${r.id}/toggle-hidden`); list.setData((d) => ({ ...d, items: d.items.map((x) => (x.id === r.id ? data : x)) })); });
  return (
    <>
      <PageHeader title="Reviews" subtitle="Moderate customer feedback" />
      <div className="mb-4"><Chips value={max} onChange={(v) => { setMax(v); list.setPage(1); }} options={[[5, 'All'], [2, '2★ and below']]} /></div>
      <DataTable {...list} rows={list.data?.items} pages={list.data?.pages} onPage={list.setPage} onRetry={list.reload} columns={[
        { key: 'rating', label: 'Rating', render: (r) => <Rating value={r.rating} /> },
        { key: 'comment', label: 'Comment', render: (r) => <span className="whitespace-normal">{r.comment || '—'}</span> },
        { key: 'user', label: 'By', render: (r) => r.user.full_name },
        { key: 'store_id', label: 'Store', render: (r) => <Link className="hover:text-brand-600" to={`/stores/${r.store_id}`}>#{r.store_id}</Link> },
        { key: 'is_hidden', label: 'Visible', render: (r) => <Toggle checked={!r.is_hidden} onChange={() => toggle(r)} label="Review visible" /> },
      ]} />
    </>
  );
}

function Support() {
  const [status, setStatus] = useState('open');
  const list = useApi('/admin/support', { status: status || undefined });
  const [replying, setReplying] = useState(null);
  const [reply, setReply] = useState('');
  const [run, busy] = useAction();
  const toast = useToast();
  const send = (newStatus) => run(async () => { await api.post(`/admin/support/${replying.id}/reply`, { reply, status: newStatus }); setReplying(null); setReply(''); list.reload(true); toast('Reply sent'); })
    .catch((e) => toast(e.message, 'error'));
  return (
    <>
      <PageHeader title="Support tickets" />
      <div className="mb-4"><Chips value={status} onChange={setStatus} options={[['open', 'Open'], ['in_progress', 'In progress'], ['resolved', 'Resolved'], ['', 'All']]} /></div>
      <DataTable rows={list.data} loading={list.loading} error={list.error} onRetry={list.reload} empty="No tickets 🎉" columns={[
        { key: 'id', label: '#' },
        { key: 'subject', label: 'Subject', render: (t) => <span className="font-medium">{t.subject}</span> },
        { key: 'message', label: 'Message', render: (t) => <span className="line-clamp-2 max-w-md whitespace-normal">{t.message}</span> },
        { key: 'status', label: 'Status', render: (t) => <Badge tone={{ open: 'amber', in_progress: 'blue', resolved: 'green' }[t.status]}>{t.status}</Badge> },
        { key: 'created_at', label: 'Opened', render: (t) => dateTime(t.created_at) },
        { key: 'a', label: '', render: (t) => <button className="btn-secondary px-3 py-1.5" onClick={() => { setReplying(t); setReply(t.admin_reply || ''); }}>Reply</button> },
      ]} />
      <Modal open={!!replying} onClose={() => setReplying(null)} title={`Ticket #${replying?.id}`} footer={<>
        <button className="btn-secondary" disabled={busy || !reply} onClick={() => send('in_progress')}>Reply & keep open</button>
        <button className="btn-primary" disabled={busy || !reply} onClick={() => send('resolved')}>Reply & resolve</button>
      </>}>
        <p className="mb-3 rounded-xl bg-gray-50 p-3 text-sm dark:bg-ink-800">{replying?.message}</p>
        <textarea className="input" rows={4} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" aria-label="Reply" />
      </Modal>
    </>
  );
}

function Reports() {
  const [days, setDays] = useState(30);
  const { data, loading, error, reload } = useApi('/admin/reports/sales', { days });
  const exportCsv = () => {
    const keys = ['store', 'orders', 'subtotal', 'discount', 'delivery_fees', 'tax', 'gmv'];
    const csv = [keys.join(','), ...data.rows.map((r) => keys.map((k) => JSON.stringify(r[k])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `quickkart-sales-${days}d.csv`;
    a.click();
  };
  return (
    <>
      <PageHeader title="Sales report" subtitle="Per-store breakdown (excludes cancelled orders)" actions={<>
        <select className="input w-auto" value={days} onChange={(e) => setDays(+e.target.value)} aria-label="Range">{[7, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}</select>
        <button className="btn-secondary" disabled={!data?.rows.length} onClick={exportCsv}><DownloadRounded fontSize="small" />CSV</button>
      </>} />
      {data && <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="GMV" value={inr(data.summary.gmv)} /><StatCard tone="blue" label="Orders" value={data.summary.orders} />
        <StatCard tone="green" label="Discounts given" value={inr(data.summary.discount)} /><StatCard tone="violet" label="Tax collected" value={inr(data.summary.tax)} /></div>}
      <DataTable rows={data?.rows} rowKey="store" loading={loading} error={error} onRetry={reload} columns={[
        { key: 'store', label: 'Store', render: (r) => <span className="font-medium">{r.store}</span> },
        { key: 'orders', label: 'Orders' },
        { key: 'subtotal', label: 'Item sales', render: (r) => inr(r.subtotal) },
        { key: 'discount', label: 'Discounts', render: (r) => inr(r.discount) },
        { key: 'delivery_fees', label: 'Delivery fees', render: (r) => inr(r.delivery_fees) },
        { key: 'tax', label: 'Tax', render: (r) => inr(r.tax) },
        { key: 'gmv', label: 'GMV', render: (r) => <b>{inr(r.gmv)}</b> },
      ]} />
    </>
  );
}

function Audit() {
  const list = useList('/admin/audit-logs', {}, 'action');
  return (
    <>
      <PageHeader title="Audit logs" subtitle="Who did what, and when" />
      <div className="mb-4"><Search value={list.q} onChange={list.setQ} placeholder="Filter by action (e.g. order, coupon)" /></div>
      <DataTable {...list} rows={list.data?.items} pages={list.data?.pages} onPage={list.setPage} onRetry={list.reload} columns={[
        { key: 'created_at', label: 'When', render: (a) => dateTime(a.created_at) },
        { key: 'actor_id', label: 'Actor', render: (a) => (a.actor_id ? `User #${a.actor_id}` : 'System') },
        { key: 'action', label: 'Action', render: (a) => <span className="font-mono text-xs">{a.action}</span> },
        { key: 'entity', label: 'Entity', render: (a) => `${a.entity}${a.entity_id ? ` #${a.entity_id}` : ''}` },
        { key: 'details', label: 'Details', render: (a) => <span className="font-mono text-xs text-gray-500">{a.details ? JSON.stringify(a.details) : ''}</span> },
      ]} />
    </>
  );
}

const SECTIONS = { users: Users, stores: Stores, orders: Orders, products: Products, coupons: Coupons, payments: Payments, reviews: Reviews, support: Support, reports: Reports, audit: Audit };

export default function AdminPages() {
  const { section } = useParams();
  const Page = SECTIONS[section];
  if (!Page) return <Navigate to="/admin" replace />;
  return <Page key={section} />;
}

