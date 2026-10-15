import { useState } from 'react';
import { Link } from 'react-router-dom';
import CurrencyRupeeRounded from '@mui/icons-material/CurrencyRupeeRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import PeopleRounded from '@mui/icons-material/PeopleRounded';
import StorefrontRounded from '@mui/icons-material/StorefrontRounded';
import PendingActionsRounded from '@mui/icons-material/PendingActionsRounded';
import SupportAgentRounded from '@mui/icons-material/SupportAgentRounded';
import { ChartCard, Donut, RevenueChart, SimpleBar } from '../../components/Charts';
import { Async, PageHeader, Skeleton, StatCard } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { inr } from '../../utils/format';

export default function AdminDashboard() {
  const [days, setDays] = useState(30);
  const { data: d, loading, error, reload } = useApi('/admin/analytics', { days });
  const users = d ? Object.values(d.users_by_role).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="space-y-5">
      <PageHeader title="Platform analytics" subtitle="Everything happening on QuickKart"
        actions={<select className="input w-auto" value={days} onChange={(e) => setDays(+e.target.value)} aria-label="Date range">{[7, 14, 30].map((x) => <option key={x} value={x}>Last {x} days</option>)}</select>} />
      <Async loading={loading} error={error} onRetry={reload} skeleton={<div className="grid gap-4 md:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-24" />)}</div>}>
        {d && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <StatCard icon={CurrencyRupeeRounded} label="Gross merchandise value" value={inr(d.totals.revenue)} hint={`AOV ${inr(d.totals.avg_order_value)}`} />
              <StatCard icon={ReceiptLongRounded} tone="blue" label="Orders" value={d.totals.orders} />
              <StatCard icon={PeopleRounded} tone="violet" label="Users" value={users} hint={`${d.users_by_role.customer || 0} customers · ${d.users_by_role.delivery || 0} riders`} />
              <StatCard icon={StorefrontRounded} tone="green" label="Stores" value={d.stores} hint={`${d.users_by_role.vendor || 0} vendors`} />
              <Link to="/admin/stores"><StatCard icon={PendingActionsRounded} tone={d.pending_stores ? 'amber' : 'green'} label="Pending store approvals" value={d.pending_stores} /></Link>
              <Link to="/admin/support"><StatCard icon={SupportAgentRounded} tone={d.open_tickets ? 'red' : 'green'} label="Open support tickets" value={d.open_tickets} /></Link>
            </div>
            <div className="grid gap-4 xl:grid-cols-3">
              <div className="xl:col-span-2"><ChartCard title="GMV per day"><RevenueChart data={d.daily} /></ChartCard></div>
              <ChartCard title="Order status"><Donut data={d.status_breakdown} /></ChartCard>
            </div>
            <div className="grid gap-4 xl:grid-cols-3">
              <ChartCard title="Orders per day"><RevenueChart data={d.daily} dataKey="orders" money={false} height={240} /></ChartCard>
              <ChartCard title="Top stores by revenue"><SimpleBar data={d.top_stores} x="name" y="revenue" money height={240} /></ChartCard>
              <ChartCard title="Payment methods"><Donut data={d.payment_methods} height={240} /></ChartCard>
            </div>
          </>
        )}
      </Async>
    </div>
  );
}
