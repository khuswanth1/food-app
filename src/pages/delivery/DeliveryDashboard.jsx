import { useCallback, useEffect, useRef, useState } from 'react';
import TwoWheelerRounded from '@mui/icons-material/TwoWheelerRounded';
import CurrencyRupeeRounded from '@mui/icons-material/CurrencyRupeeRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import RouteRounded from '@mui/icons-material/RouteRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import StopRounded from '@mui/icons-material/StopRounded';
import StorefrontRounded from '@mui/icons-material/StorefrontRounded';
import HomeRounded from '@mui/icons-material/HomeRounded';
import { api } from '../../api/client';
import { ChartCard, RevenueChart } from '../../components/Charts';
import TrackingMap from '../../components/TrackingMap';
import { Async, Badge, PageHeader, StatCard, StatusBadge, Toggle } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { useToast } from '../../context/ToastContext';
import { useAction, useApi } from '../../hooks/useApi';
import { inr } from '../../utils/format';

const NEXT = { ready: ['picked_up', 'Confirm pickup'], picked_up: ['out_for_delivery', 'Start delivery'], out_for_delivery: ['delivered', 'Mark delivered'] };
const STEPS = 12;

function ActiveJob({ job, onAdvance, busy, onRide, riding, rider }) {
  const next = NEXT[job.status];
  const heading = ['picked_up', 'out_for_delivery'].includes(job.status) ? 'customer' : 'store';
  return (
    <div className="card overflow-hidden">
      <TrackingMap className="h-56 rounded-none" store={[job.store.lat, job.store.lng]} home={[job.delivery_lat, job.delivery_lng]} rider={rider} />
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2"><span className="font-bold">{job.order_number}</span><StatusBadge status={job.status} /><span className="ml-auto text-sm font-semibold text-emerald-600">{inr(job.est_payout)}</span></div>
        <div className="space-y-1.5 text-sm">
          <p className="flex gap-2"><StorefrontRounded fontSize="small" className="text-brand-500" /><span><b>{job.store.name}</b> — {job.store.address}</span></p>
          <p className="flex gap-2"><HomeRounded fontSize="small" className="text-sky-500" /><span><b>{job.customer?.full_name}</b> — {job.delivery_address}</span></p>
        </div>
        <p className="text-xs text-gray-500">{job.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')} · {job.payment_method === 'cod' ? <b className="text-amber-600">Collect {inr(job.total)} cash</b> : 'Prepaid'}</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => onRide(job, heading)} aria-pressed={riding}>
            {riding ? <><StopRounded fontSize="small" />Stop simulation</> : <><PlayArrowRounded fontSize="small" />Simulate ride to {heading}</>}
          </button>
          {next ? <button className="btn-primary flex-1" disabled={busy} onClick={() => onAdvance(job, next[0])}>{next[1]}</button>
            : <span className="flex-1 self-center text-sm text-gray-500">Waiting for the store to mark the order ready…</span>}
        </div>
      </div>
    </div>
  );
}

export default function DeliveryDashboard() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const { lastEvent } = useNotifications();
  const available = useApi('/delivery/available', { radius_km: 25 });
  const active = useApi('/delivery/active');
  const earnings = useApi('/delivery/earnings');
  const [run, busy] = useAction();
  const [ride, setRide] = useState(null); // { orderId, step, from, to }
  const [rider, setRider] = useState(null);
  const timer = useRef(null);

  const refreshAll = useCallback(() => { available.reload(true); active.reload(true); earnings.reload(true); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);
  useEffect(() => { if (lastEvent && ['new_job', 'job_taken', 'notification'].includes(lastEvent.type)) refreshAll(); }, [lastEvent, refreshAll]);

  const setOnline = (is_online) => run(async () => { updateUser((await api.post('/delivery/availability', { is_online })).data); refreshAll(); })
    .catch((e) => toast(e.message, 'error'));
  const accept = (job) => run(async () => { await api.post(`/delivery/orders/${job.id}/accept`); toast('Order accepted — head to the store'); refreshAll(); })
    .catch((e) => { toast(e.message, 'error'); refreshAll(); });
  const advance = (job, status) => run(async () => {
    await api.post(`/delivery/orders/${job.id}/status`, { status });
    toast(status === 'delivered' ? `Delivered! +${inr(job.est_payout)}` : 'Status updated');
    if (status === 'delivered') stopRide();
    refreshAll();
  }).catch((e) => toast(e.message, 'error'));

  // Demo helper: interpolate the rider's GPS between two points and stream it to the API.
  const stopRide = () => { clearInterval(timer.current); setRide(null); };
  const startRide = (job, heading) => {
    if (ride?.orderId === job.id) { stopRide(); return; }
    clearInterval(timer.current);
    const from = rider || (heading === 'store' ? [job.store.lat + 0.01, job.store.lng - 0.01] : [job.store.lat, job.store.lng]);
    const to = heading === 'store' ? [job.store.lat, job.store.lng] : [job.delivery_lat, job.delivery_lng];
    let step = 0;
    setRide({ orderId: job.id });
    timer.current = setInterval(() => {
      step += 1;
      const t = Math.min(step / STEPS, 1);
      const pos = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
      setRider(pos);
      api.post('/delivery/location', { lat: pos[0], lng: pos[1] }, { silent: true }).catch(() => {});
      if (t >= 1) { clearInterval(timer.current); setRide(null); toast(`Arrived at ${heading}`, 'info'); }
    }, 1500);
  };
  useEffect(() => () => clearInterval(timer.current), []);

  const e = earnings.data;
  return (
    <div className="space-y-5">
      <PageHeader title={`Hi, ${user.full_name.split(' ')[0]} 👋`} subtitle="Pick up orders near you and deliver them fast"
        actions={<div className={`card flex items-center gap-3 px-4 py-2.5 ${user.is_online ? 'ring-emerald-500' : ''}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${user.is_online ? 'animate-pulse bg-emerald-500' : 'bg-gray-400'}`} />
          <span className="text-sm font-semibold">{user.is_online ? 'Online' : 'Offline'}</span>
          <Toggle checked={user.is_online} onChange={setOnline} label="Go online" />
        </div>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={CurrencyRupeeRounded} tone="green" label="Today" value={inr(e?.today_earnings)} hint={`${e?.today_deliveries ?? 0} deliveries`} />
        <StatCard icon={CurrencyRupeeRounded} label="This week" value={inr(e?.week_earnings)} />
        <StatCard icon={CheckCircleRounded} tone="blue" label="Total deliveries" value={e?.total_deliveries ?? '—'} />
        <StatCard icon={TwoWheelerRounded} tone="violet" label="Active orders" value={e?.active_orders ?? '—'} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-bold">Active deliveries</h2>
          <Async loading={active.loading} error={active.error} onRetry={active.reload} empty={!active.data?.length}
            emptyProps={{ icon: TwoWheelerRounded, title: 'No active deliveries', text: user.is_online ? 'Accept an available order to get started.' : 'Go online to receive orders.' }}>
            <div className="space-y-4">
              {active.data?.map((j) => <ActiveJob key={j.id} job={j} busy={busy} onAdvance={advance} onRide={startRide} riding={ride?.orderId === j.id} rider={rider} />)}
            </div>
          </Async>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">Available near you {available.data?.length > 0 && <Badge tone="brand">{available.data.length}</Badge>}</h2>
          <Async loading={available.loading} error={available.error} onRetry={available.reload} empty={!available.data?.length}
            emptyProps={{ icon: RouteRounded, title: 'No orders waiting', text: 'New orders appear here in real time.' }}>
            <ul className="space-y-3">
              {available.data?.map((j) => (
                <li key={j.id} className="card flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{j.store.name} <StatusBadge status={j.status} /></p>
                    <p className="text-xs text-gray-500">{j.pickup_distance_km != null && `${j.pickup_distance_km} km to pickup · `}{j.trip_distance_km} km trip · {j.items.length} item(s)</p>
                  </div>
                  <span className="font-bold text-emerald-600">{inr(j.est_payout)}</span>
                  <button className="btn-primary" disabled={busy || !user.is_online} onClick={() => accept(j)}>{user.is_online ? 'Accept' : 'Go online'}</button>
                </li>
              ))}
            </ul>
          </Async>
        </section>
      </div>

      {e && <ChartCard title="Earnings — last 7 days"><RevenueChart data={e.daily} dataKey="earnings" height={220} /></ChartCard>}
    </div>
  );
}
