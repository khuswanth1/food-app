import { useEffect, useState } from 'react';
import LockRounded from '@mui/icons-material/LockRounded';
import VerifiedUserRounded from '@mui/icons-material/VerifiedUserRounded';
import { api, apiError } from '../api/client';
import { getPaymentConfig, loadRazorpay, upiAvailability, upiFirstDisplay } from '../utils/payments';
import { inr } from '../utils/format';
import { Modal, Spinner } from './ui';

/**
 * Pays an order. With Razorpay configured it opens Razorpay Checkout and the server verifies the
 * signature + re-fetches the payment before marking it paid. Otherwise falls back to the mock gateway.
 */
export default function PaymentModal({ order, onDone, onClose }) {
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { getPaymentConfig().then(setCfg).catch((e) => setError(apiError(e).message)); }, []);

  const payWithRazorpay = async () => {
    setBusy(true);
    setError('');
    try {
      if (!(await loadRazorpay())) throw new Error('Could not load Razorpay Checkout. Check your connection.');
      const { data: opts } = await api.post(`/orders/${order.id}/razorpay/order`);
      const checkout = new window.Razorpay({
        key: opts.key_id,
        amount: opts.amount,
        currency: opts.currency,
        name: opts.name,
        description: opts.description,
        order_id: opts.razorpay_order_id,
        prefill: wantsUpi ? { ...opts.prefill, method: 'upi' } : opts.prefill,
        ...(wantsUpi ? { config: upiFirstDisplay() } : {}),
        notes: { quickkart_order: String(order.id) },
        theme: { color: '#f04f23' },
        handler: async (resp) => {
          try {
            const { data } = await api.post(`/orders/${order.id}/razorpay/verify`, resp);
            if (data.status === 'paid') onDone(data);
            else setError(data.message || 'Payment was not completed');
          } catch (e) {
            setError(apiError(e).message);
          } finally {
            setBusy(false);
          }
        },
        modal: { ondismiss: () => setBusy(false), confirm_close: true },
      });
      checkout.on('payment.failed', (resp) => {
        const reason = resp?.error?.description || 'Payment failed';
        setError(reason);
        api.post(`/orders/${order.id}/razorpay/failure`, { razorpay_order_id: opts.razorpay_order_id, reason }).catch(() => {});
      });
      checkout.open();
    } catch (e) {
      setError(e.response ? apiError(e).message : e.message);
      setBusy(false);
    }
  };

  const payMock = async (simulate_failure) => {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post(`/orders/${order.id}/pay`, { simulate_failure });
      if (data.status === 'paid') onDone(data); else setError(data.message);
    } catch (e) {
      setError(apiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const razorpay = cfg?.provider === 'razorpay';
  const testMode = razorpay && cfg.key_id?.startsWith('rzp_test_');
  const upi = upiAvailability(cfg);
  const wantsUpi = order.payment_method === 'upi' && upi === 'yes';

  return (
    <Modal open onClose={busy ? undefined : onClose} title={razorpay ? 'Complete payment' : 'QuickPay (demo gateway)'}>
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 dark:bg-brand-500/10"><LockRounded fontSize="large" /></div>
        <div>
          <p className="text-sm text-gray-500">Order {order.order_number} · {order.payment_method.toUpperCase()}</p>
          <p className="text-3xl font-extrabold">{inr(order.total)}</p>
        </div>

        {!cfg && !error && <Spinner className="h-6 w-6 text-brand-500" />}

        {razorpay && (
          <>
            {testMode && (
              <p className="rounded-xl bg-sky-50 p-3 text-left text-xs text-sky-800 dark:bg-sky-500/10 dark:text-sky-300">
                <b>Razorpay test mode</b> — no real money moves.{' '}
                {cfg.methods?.upi ? <>Use UPI ID <code>success@razorpay</code> (or <code>failure@razorpay</code>), test netbanking, or Razorpay&apos;s test cards.</>
                  : <>Use test netbanking or Razorpay&apos;s test cards.</>}
              </p>
            )}
            {order.payment_method === 'upi' && upi !== 'yes' && (
              <p className="rounded-xl bg-amber-50 p-3 text-left text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                {upi === 'mobile-only'
                  ? 'UPI apps open from your phone. On this device, pay with a card, netbanking or a wallet instead, or open QuickKart on your phone.'
                  : 'UPI is temporarily unavailable. Please pay with a card, netbanking or a wallet.'}
              </p>
            )}
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button className="btn-primary w-full py-3" disabled={busy} onClick={payWithRazorpay}>
              {busy ? <Spinner className="h-4 w-4" /> : `Pay ${inr(order.total)}`}
            </button>
            <p className="flex items-center justify-center gap-1 text-xs text-gray-500"><VerifiedUserRounded sx={{ fontSize: 14 }} />Secured by Razorpay · {[upi === 'yes' && 'UPI', cfg.methods?.card && 'cards', cfg.methods?.netbanking && 'netbanking', cfg.methods?.wallet && 'wallets'].filter(Boolean).join(', ')}</p>
          </>
        )}

        {cfg?.provider === 'mock' && (
          <>
            <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">This is a simulated payment. No real money moves and no payment details are collected.</p>
            {error && <p role="alert" className="text-sm text-red-600">{error} — try again.</p>}
            <button className="btn-primary w-full py-3" disabled={busy} onClick={() => payMock(false)}>{busy ? <Spinner className="h-4 w-4" /> : `Pay ${inr(order.total)}`}</button>
            <button className="btn-ghost w-full text-xs" disabled={busy} onClick={() => payMock(true)}>Simulate a failed payment</button>
          </>
        )}

        {!cfg && error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}
