import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import DescriptionRounded from '@mui/icons-material/DescriptionRounded';
import CancelRounded from '@mui/icons-material/CancelRounded';
import StarRounded from '@mui/icons-material/StarRounded';
import SupportAgentRounded from '@mui/icons-material/SupportAgentRounded';
import TwoWheelerRounded from '@mui/icons-material/TwoWheelerRounded';
import PhoneRounded from '@mui/icons-material/PhoneRounded';
import { api } from '../api/client';
import OrderTimeline from '../components/OrderTimeline';
import TrackingMap from '../components/TrackingMap';
import { Async, Badge, Modal, Skeleton, Spinner, StatusBadge } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAction, useApi } from '../hooks/useApi';
import { useSocket } from '../hooks/useSocket';
import { dateTime, inr } from '../utils/format';
import PaymentModal from '../components/PaymentModal';

export async function openInvoice(orderId) {
  const { data } = await api.get(`/orders/${orderId}/invoice`, { responseType: 'text' });
  const url = URL.createObjectURL(new Blob([data], { type: 'text/html' }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function ReviewModal({ order, onClose, onDone }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [run, busy] = useAction();
  const toast = useToast();
  const submit = () => run(async () => {
    await api.post(`/orders/${order.id}/review`, { order_id: order.id, rating, comment });
    toast('Thanks for your review!');
    onDone();
  }).catch((e) => toast(e.message, 'error'));
  return (
    <Modal open onClose={onClose} title={`Rate ${order.store.name}`} footer={<button className="btn-primary" onClick={submit} disabled={busy}>Submit review</button>}>
      <div className="flex justify-center gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} role="radio" aria-checked={rating === n} aria-label={`${n} stars`} onClick={() => setRating(n)} className={n <= rating ? 'text-amber-400' : 'text-gray-300 dark:text-ink-600'}>
            <StarRounded sx={{ fontSize: 40 }} />
          </button>
        ))}
      </div>
      <textarea className="input mt-4" rows={3} placeholder="Tell others about your experience (optional)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
    </Modal>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const { data: order, loading, error, reload, setData } = useApi(`/orders/${id}`);
  const [rider, setRider] = useState(null);
  const [modal, setModal] = useState(null);
  const [run, busy] = useAction();
  const isCustomer = user?.role === 'customer';
  const navigate = useNavigate();

  const live = useSocket(`/ws/orders/${id}`, (msg) => {
    if (msg.type === 'location') {
      setRider([msg.data.lat, msg.data.lng]);
      setData((o) => o && { ...o, eta_minutes: msg.data.eta_minutes });
    } else if (msg.type === 'order_update') {
      reload(true);
    }
  }, !!order && !['delivered', 'cancelled'].includes(order?.status));

  const cancel = () => run(async () => {
    await api.post(`/orders/${id}/cancel`, { reason: 'Cancelled by customer' });
    toast('Order cancelled');
    setModal(null);
    reload(true);
  }).catch((e) => toast(e.message, 'error'));

  const invoice = () => openInvoice(id).catch(() => toast('Could not open invoice', 'error'));
  const active = order && !['delivered', 'cancelled'].includes(order.status);
  const paymentDue = order && isCustomer && order.payment_status === 'pending' && order.payment_method !== 'cod' && order.status !== 'cancelled';

  return (
    <Async loading={loading} error={error} onRetry={reload} skeleton={<div className="space-y-4"><Skeleton className="h-72" /><Skeleton className="h-40" /></div>}>
      {order && (
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => (isCustomer ? navigate('/orders') : navigate(-1))} className="btn-ghost p-2" aria-label="Back"><ArrowBackRounded /></button>
            <div className="flex-1">
              <h1 className="text-xl font-extrabold">Order {order.order_number}</h1>
              <p className="text-sm text-gray-500">{order.store.name} · {dateTime(order.created_at)}</p>
            </div>
            <StatusBadge status={order.status} />
            {active && <span className={`text-xs ${live ? 'text-emerald-600' : 'text-gray-400'}`}>● {live ? 'Live' : 'Connecting…'}</span>}
          </div>

          {paymentDue && (
            <div className="card flex flex-wrap items-center justify-between gap-3 border-l-4 border-amber-400 p-4">
              <p className="text-sm"><span className="font-semibold">Payment pending.</span> The store will start once your payment goes through.</p>
              <button className="btn-primary" onClick={() => setModal('pay')}>Pay {inr(order.total)}</button>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
            <div className="space-y-4">
              {active && (
                <div className="card overflow-hidden">
                  <div className="flex items-center justify-between bg-gradient-to-r from-brand-500 to-rose-500 px-5 py-4 text-white">
                    <div><p className="text-xs uppercase tracking-wider text-white/80">Arriving in</p><p className="text-3xl font-extrabold" aria-live="polite">{order.eta_minutes ?? '—'} min</p></div>
                    <TwoWheelerRounded sx={{ fontSize: 44 }} className="opacity-80" />
                  </div>
                  <TrackingMap className="h-72 rounded-none" store={[order.store.lat, order.store.lng]} home={[order.delivery_lat, order.delivery_lng]} rider={rider || (order.partner?.current_lat != null && ['picked_up', 'out_for_delivery'].includes(order.status) ? [order.partner.current_lat, order.partner.current_lng] : null)} />
                  {order.partner && (
                    <div className="flex items-center gap-3 p-4">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-700">{order.partner.full_name[0]}</span>
                      <div className="flex-1"><p className="font-semibold">{order.partner.full_name}</p><p className="text-xs text-gray-500">Your delivery partner</p></div>
                      {order.partner.phone && <a href={`tel:${order.partner.phone}`} className="btn-secondary p-2.5" aria-label="Call delivery partner"><PhoneRounded fontSize="small" /></a>}
                    </div>
                  )}
                </div>
              )}

              <div className="card p-5">
                <h2 className="mb-3 font-bold">Items</h2>
                <ul className="space-y-2 text-sm">
                  {order.items.map((i) => <li key={i.id} className="flex justify-between"><span>{i.quantity} × {i.name}</span><span>{inr(i.price * i.quantity)}</span></li>)}
                </ul>
                <div className="mt-4 space-y-1 border-t border-gray-100 pt-3 text-sm dark:border-ink-700">
                  <div className="flex justify-between"><span>Subtotal</span><span>{inr(order.subtotal)}</span></div>
                  {order.discount > 0 && <div className="flex justify-between text-emerald-600"><span>Discount {order.coupon_code && `(${order.coupon_code})`}</span><span>−{inr(order.discount)}</span></div>}
                  <div className="flex justify-between"><span>Delivery</span><span>{inr(order.delivery_fee)}</span></div>
                  <div className="flex justify-between"><span>GST</span><span>{inr(order.tax)}</span></div>
                  <div className="flex justify-between pt-1 text-base font-bold"><span>Total</span><span>{inr(order.total)}</span></div>
                  <p className="pt-1 text-xs text-gray-500">Paid via {order.payment_method.toUpperCase()} · <Badge tone={order.payment_status === 'paid' ? 'green' : order.payment_status === 'refunded' ? 'blue' : 'amber'}>{order.payment_status}</Badge></p>
                </div>
                <p className="mt-3 text-xs text-gray-500">Delivering to: {order.delivery_address}</p>
                {order.notes && <p className="mt-1 text-xs text-gray-500">Notes: {order.notes}</p>}
              </div>
            </div>

            <div className="space-y-4">
              <div className="card p-5"><h2 className="mb-4 font-bold">Status</h2><OrderTimeline status={order.status} events={order.events} /></div>
              <div className="card space-y-2 p-5">
                <button className="btn-secondary w-full" onClick={invoice}><DescriptionRounded fontSize="small" />Download invoice</button>
                {isCustomer && order.status === 'delivered' && !order.has_review && <button className="btn-primary w-full" onClick={() => setModal('review')}><StarRounded fontSize="small" />Rate this order</button>}
                {isCustomer && ['placed', 'confirmed'].includes(order.status) && <button className="btn-danger w-full" onClick={() => setModal('cancel')}><CancelRounded fontSize="small" />Cancel order</button>}
                <Link to={`/support?order=${order.id}`} className="btn-ghost w-full"><SupportAgentRounded fontSize="small" />Get help</Link>
              </div>
            </div>
          </div>

          {modal === 'cancel' && (
            <Modal open onClose={() => setModal(null)} title="Cancel this order?" footer={<>
              <button className="btn-secondary" onClick={() => setModal(null)}>Keep order</button>
              <button className="btn bg-red-600 text-white hover:bg-red-700" onClick={cancel} disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : 'Yes, cancel'}</button>
            </>}>
              <p className="text-sm text-gray-600 dark:text-gray-300">{order.payment_status === 'paid' ? `You'll be refunded ${inr(order.total)} to your original payment method.` : 'No charges will apply.'}</p>
            </Modal>
          )}
          {modal === 'review' && <ReviewModal order={order} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(true); }} />}
          {modal === 'pay' && <PaymentModal order={order} onClose={() => setModal(null)} onDone={() => { setModal(null); toast('Payment successful 🎉'); reload(true); }} />}
        </div>
      )}
    </Async>
  );
}
