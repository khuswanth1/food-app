import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import { api } from '../../api/client';
import { Async, Badge, PageHeader, Pagination, StatusBadge } from '../../components/ui';
import { useNotifications } from '../../context/NotificationContext';
import { useToast } from '../../context/ToastContext';
import { useAction, useApi } from '../../hooks/useApi';
import { dateTime, inr } from '../../utils/format';

const FILTERS = [['', 'All'], ['placed', 'New'], ['confirmed', 'Confirmed'], ['preparing', 'Preparing'], ['ready', 'Ready'], ['out_for_delivery', 'On the way'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']];
const NEXT = { placed: ['confirmed', 'Accept order'], confirmed: ['preparing', 'Start preparing'], preparing: ['ready', 'Mark ready'] };

export default function VendorOrders() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi('/vendor/orders', { status: status || undefined, page, size: 10 });
  const { lastEvent } = useNotifications();
  const [run, busy] = useAction();
  const toast = useToast();

  // New orders/payments arrive as live notifications — refresh silently.
  useEffect(() => { if (lastEvent?.type === 'notification') reload(true); }, [lastEvent, reload]);

  const advance = (o, next) => run(async () => { await api.post(`/vendor/orders/${o.id}/status`, { status: next }); reload(true); toast(`Order ${o.order_number} updated`); })
    .catch((e) => toast(e.message, 'error'));
  const reject = (o) => window.confirm('Reject this order? The customer will be refunded.') && advance(o, 'cancelled');

  return (
    <div>
      <PageHeader title="Orders" subtitle="Accept, prepare and hand over orders" />
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 scrollbar-none">
        {FILTERS.map(([v, l]) => <button key={v} className={`chip ${status === v ? 'chip-active' : ''}`} onClick={() => { setStatus(v); setPage(1); }}>{l}</button>)}
      </div>
      <Async loading={loading} error={error} onRetry={reload} empty={!data?.items.length} emptyProps={{ icon: ReceiptLongRounded, title: 'No orders here' }}>
        <div className="grid gap-3 lg:grid-cols-2">
          {data?.items.map((o) => {
            const awaitingPay = o.payment_method !== 'cod' && o.payment_status === 'pending' && o.status === 'placed';
            return (
              <div key={o.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/orders/${o.id}`} className="font-bold hover:text-brand-600">{o.order_number}</Link>
                  <StatusBadge status={o.status} />
                  <Badge tone={o.payment_status === 'paid' ? 'green' : 'amber'}>{o.payment_method.toUpperCase()} · {o.payment_status}</Badge>
                  <span className="ml-auto text-xs text-gray-500">{dateTime(o.created_at)}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">{o.store.name} · {o.customer?.full_name}</p>
                <ul className="my-3 space-y-0.5 text-sm">{o.items.map((i) => <li key={i.id}>{i.quantity} × {i.name}</li>)}</ul>
                {o.notes && <p className="mb-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">Note: {o.notes}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-auto font-bold">{inr(o.total)}</span>
                  {o.partner && <span className="text-xs text-gray-500">Rider: {o.partner.full_name}</span>}
                  {['placed', 'confirmed'].includes(o.status) && <button className="btn-danger px-3 py-2" disabled={busy} onClick={() => reject(o)}>Reject</button>}
                  {NEXT[o.status] && <button className="btn-primary px-3 py-2" disabled={busy || awaitingPay} title={awaitingPay ? 'Waiting for customer payment' : ''} onClick={() => advance(o, NEXT[o.status][0])}>{awaitingPay ? 'Awaiting payment' : NEXT[o.status][1]}</button>}
                </div>
              </div>
            );
          })}
        </div>
        <Pagination page={page} pages={data?.pages} onChange={setPage} />
      </Async>
    </div>
  );
}
