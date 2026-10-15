import { useState } from 'react';
import { Link } from 'react-router-dom';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import { Async, PageHeader, Pagination, StatusBadge } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { dateTime, inr } from '../utils/format';

const TABS = [[undefined, 'All'], [true, 'Active'], [false, 'Past']];

export default function Orders() {
  const [active, setActive] = useState(undefined);
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi('/orders', { active, page, size: 10 });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Your orders" />
      <div className="mb-4 flex gap-2">
        {TABS.map(([v, l]) => <button key={l} className={`chip ${active === v ? 'chip-active' : ''}`} onClick={() => { setActive(v); setPage(1); }}>{l}</button>)}
      </div>
      <Async loading={loading} error={error} onRetry={reload} empty={!data?.items.length}
        emptyProps={{ icon: ReceiptLongRounded, title: 'No orders yet', text: 'Your order history will appear here.', action: <Link to="/" className="btn-primary">Start ordering</Link> }}>
        <ul className="space-y-3">
          {data?.items.map((o) => (
            <li key={o.id}>
              <Link to={`/orders/${o.id}`} className="card flex items-center gap-4 p-4 transition hover:shadow-lg">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-bold">{o.store.name}</span><StatusBadge status={o.status} /></div>
                  <p className="truncate text-sm text-gray-500">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</p>
                  <p className="text-xs text-gray-400">{o.order_number} · {dateTime(o.created_at)}</p>
                </div>
                <div className="text-right"><p className="font-bold">{inr(o.total)}</p>{o.payment_status === 'pending' && o.payment_method !== 'cod' && o.status !== 'cancelled' && <p className="text-xs font-semibold text-amber-600">Payment due</p>}</div>
                <ChevronRightRounded className="text-gray-300" />
              </Link>
            </li>
          ))}
        </ul>
        <Pagination page={page} pages={data?.pages} onChange={setPage} />
      </Async>
    </div>
  );
}
