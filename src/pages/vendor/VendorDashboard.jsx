import { useState } from 'react';
import { Link } from 'react-router-dom';
import CurrencyRupeeRounded from '@mui/icons-material/CurrencyRupeeRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import TrendingUpRounded from '@mui/icons-material/TrendingUpRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import { ChartCard, Donut, RevenueChart, SimpleBar } from '../../components/Charts';
import { Async, Badge, PageHeader, Rating, Skeleton, StatCard } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { inr } from '../../utils/format';

export default function VendorDashboard() {
  const [days, setDays] = useState(14);
  const { data, loading, error, reload } = useApi('/vendor/analytics', { days });
  const low = useApi('/vendor/inventory/low-stock');

  return (
    <div className="space-y-5">
      <PageHeader title="Store overview" subtitle="Revenue, orders and inventory at a glance"
        actions={<select className="input w-auto" value={days} onChange={(e) => setDays(+e.target.value)} aria-label="Date range">
          {[7, 14, 30].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>} />
      <Async loading={loading} error={error} onRetry={reload}
        skeleton={<div className="grid gap-4 md:grid-cols-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}<Skeleton className="h-72 md:col-span-4" /></div>}>
        {data && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard icon={CurrencyRupeeRounded} label="Revenue (all time)" value={inr(data.totals.revenue)} />
              <StatCard icon={ReceiptLongRounded} tone="blue" label="Orders" value={data.totals.orders} />
              <StatCard icon={TrendingUpRounded} tone="green" label="Avg order value" value={inr(data.totals.avg_order_value)} />
              <Link to="/vendor/products"><StatCard icon={WarningAmberRounded} tone={data.low_stock_count ? 'red' : 'green'} label="Low stock items" value={data.low_stock_count} hint="Tap to restock" /></Link>
            </div>
            <div className="grid gap-4 xl:grid-cols-3">
              <div className="xl:col-span-2"><ChartCard title="Revenue"><RevenueChart data={data.daily} /></ChartCard></div>
              <ChartCard title="Orders by status"><Donut data={data.status_breakdown} /></ChartCard>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <ChartCard title="Top products (units sold)">{data.top_products.length ? <SimpleBar data={data.top_products} x="name" y="quantity" /> : <p className="py-10 text-center text-sm text-gray-500">No sales yet</p>}</ChartCard>
              <div className="card p-4">
                <h3 className="mb-3 font-semibold">Your stores</h3>
                <ul className="divide-y divide-gray-100 dark:divide-ink-700">
                  {data.stores.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                      <span className="font-medium">{s.name}</span>
                      <span className="flex items-center gap-2"><Rating value={s.rating} count={s.rating_count} />
                        {!s.is_approved ? <Badge tone="amber">Pending approval</Badge> : s.is_open ? <Badge tone="green">Open</Badge> : <Badge>Closed</Badge>}</span>
                    </li>
                  ))}
                </ul>
                {low.data?.length > 0 && (
                  <>
                    <h3 className="mb-2 mt-4 flex items-center gap-1 font-semibold text-red-600"><WarningAmberRounded fontSize="small" />Running low</h3>
                    <ul className="space-y-1 text-sm">{low.data.slice(0, 6).map((p) => <li key={p.id} className="flex justify-between"><span>{p.name}</span><span className="font-semibold text-red-600">{p.stock} left</span></li>)}</ul>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </Async>
    </div>
  );
}
