import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ShoppingCartRounded from '@mui/icons-material/ShoppingCartRounded';
import LocalOfferRounded from '@mui/icons-material/LocalOfferRounded';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import AddLocationAltRounded from '@mui/icons-material/AddLocationAltRounded';
import CreditCardRounded from '@mui/icons-material/CreditCardRounded';
import QrCode2Rounded from '@mui/icons-material/QrCode2Rounded';
import AccountBalanceWalletRounded from '@mui/icons-material/AccountBalanceWalletRounded';
import PaymentsRounded from '@mui/icons-material/PaymentsRounded';
import { api } from '../api/client';
import AddressForm from '../components/AddressForm';
import { getPaymentConfig, upiAvailability, loadRazorpay } from '../utils/payments';
import MinOrderBar from '../components/MinOrderBar';
import { QtyLimitNote, QtyStepper, VegMark } from '../components/ProductCard';
import { EmptyState, Modal, Spinner } from '../components/ui';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useAction, useApi } from '../hooks/useApi';
import { inr } from '../utils/format';
import ProductImage from '../components/ProductImage';

const METHODS = [
  { id: 'upi', label: 'UPI', icon: QrCode2Rounded },
  { id: 'card', label: 'Card', icon: CreditCardRounded },
  { id: 'wallet', label: 'Wallet', icon: AccountBalanceWalletRounded },
  { id: 'cod', label: 'Cash on delivery', icon: PaymentsRounded },
];

function Row({ label, value, strong, tone }) {
  return <div className={`flex justify-between ${strong ? 'text-base font-bold' : 'text-sm'} ${tone || ''}`}><span>{label}</span><span>{value}</span></div>;
}

export default function Cart() {
  const { cart, refresh, add } = useCart();
  const toast = useToast();
  const navigate = useNavigate();
  const addresses = useApi('/users/me/addresses');
  const suggestions = useApi('/recommendations/cart', { limit: 6 }, { deps: [cart.items.length] });
  const offers = useApi(cart.store_id ? '/coupons' : null, { store_id: cart.store_id });
  const [addressId, setAddressId] = useState(null);
  const [method, setMethod] = useState('upi');
  const [code, setCode] = useState('');
  const [applied, setApplied] = useState(null);
  const [notes, setNotes] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [run, busy] = useAction();
  const [upi, setUpi] = useState('yes');

  // Reflect what the merchant's Razorpay account actually supports on this device.
  useEffect(() => {
    getPaymentConfig().then((cfg) => {
      const avail = upiAvailability(cfg);
      setUpi(avail);
      if (avail !== 'yes') setMethod((m) => (m === 'upi' ? 'card' : m));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!addressId && addresses.data?.length) setAddressId((addresses.data.find((a) => a.is_default) || addresses.data[0]).id);
  }, [addresses.data, addressId]);

  // Re-price with the coupon whenever the cart changes
  useEffect(() => { if (applied) refresh(applied).catch(() => {}); /* eslint-disable-next-line */ }, [cart.items.length]);

  const applyCoupon = (c = code) => run(async () => {
    await api.post('/cart/coupon', { code: c });
    setApplied(c.toUpperCase());
    setCode(c.toUpperCase());
    await refresh(c);
    toast(`${c.toUpperCase()} applied`);
  }).catch((e) => toast(e.message, 'error'));

  const removeCoupon = () => { setApplied(null); setCode(''); refresh(); };

  const saveAddress = (body) => run(async () => {
    const { data } = await api.post('/users/me/addresses', body);
    await addresses.reload();
    setAddressId(data.id);
    setAddOpen(false);
  }).catch((e) => toast(e.message, 'error'));

  const placeOrder = () => run(async () => {
    const { data } = await api.post('/orders', { address_id: addressId, payment_method: method, coupon_code: applied, notes: notes || null });
    if (method === 'cod') { 
      toast('Order placed!'); 
      navigate(`/orders/${data.id}`); 
      await refresh();
    } else {
      await loadRazorpay();
      const options = {
        key: 'rzp_test_TkbgwIOGnBbis0', // Hardcoded Test API Key
        amount: Math.round(cart.total * 100), // Amount in paise
        currency: 'INR',
        name: 'QuickKart',
        description: 'Test Order Payment',
        handler: function (response) {
            // Test Key Secret (aE2ZDhKmRHexD4YGBKgnsWGs) would be used on the backend to verify this response
            toast('Payment successful 🎉 (Test Mode)');
            navigate(`/orders/${data.id}`);
        },
        theme: { color: '#f04f23' }
      };
      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response){
          toast(response.error?.description || 'Payment failed', 'error');
      });
      rzp.open();
      await refresh();
    }
  }).catch((e) => toast(e.message, 'error'));

  if (!cart.items.length) {
    return <><EmptyState icon={ShoppingCartRounded} title="Your cart is empty" text="Discover restaurants and stores near you." action={<Link to="/" className="btn-primary">Browse stores</Link>} /></>;
  }
  const belowMin = cart.subtotal < cart.min_order;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-4">
        <section className="card p-5">
          <h1 className="text-xl font-bold">{cart.store_name}</h1>
          <ul className="mt-3 divide-y divide-gray-100 dark:divide-ink-700">
            {cart.items.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-3">
                <VegMark veg={i.product.is_veg} />
                <div className="min-w-0 flex-1"><p className="truncate font-medium">{i.product.name}</p><p className="text-xs text-gray-500">{inr(i.product.price)} each</p>
                  <QtyLimitNote product={i.product} /></div>
                <QtyStepper product={i.product} compact />
                <span className="w-16 text-right text-sm font-semibold">{inr(i.line_total)}</span>
              </li>
            ))}
          </ul>
          <textarea className="input mt-3" rows={2} placeholder="Cooking instructions or delivery notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        </section>

        {suggestions.data?.length > 0 && (
          <section className="card p-5" aria-labelledby="smart-h">
            <h2 id="smart-h" className="flex items-center gap-2 font-bold"><AutoAwesomeRounded className="text-violet-500" fontSize="small" />Complete your meal</h2>
            <p className="mb-3 text-xs text-gray-500">Smart suggestions based on what others pair with your cart</p>
            <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 scrollbar-none">
              {suggestions.data.map(({ product, reason }) => (
                <div key={product.id} className="flex w-44 shrink-0 flex-col gap-1.5 rounded-xl border border-gray-100 p-3 dark:border-ink-700">
                  <ProductImage product={product} className="h-20 w-full rounded-lg" emojiSize="text-2xl" />
                  <p className="truncate text-sm font-semibold">{product.name}</p>
                  <p className="line-clamp-2 text-[11px] text-violet-600 dark:text-violet-300">{reason}</p>
                  <div className="mt-auto flex items-center justify-between"><span className="text-sm font-bold">{inr(product.price)}</span>
                    <button className="btn-secondary px-2.5 py-1 text-xs" onClick={() => add(product)}>Add</button></div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-bold">Deliver to</h2>
            <button className="btn-ghost text-sm text-brand-600" onClick={() => setAddOpen(true)}><AddLocationAltRounded fontSize="small" />Add new</button></div>
          {addresses.data?.length === 0 && <p className="text-sm text-gray-500">Add a delivery address to continue.</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            {addresses.data?.map((a) => (
              <label key={a.id} className={`flex cursor-pointer gap-3 rounded-xl border-2 p-3 text-sm transition ${addressId === a.id ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-500/5' : 'border-gray-100 dark:border-ink-700'}`}>
                <input type="radio" name="address" className="mt-1 accent-brand-500" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                <span><span className="font-semibold">{a.label}</span><span className="block text-gray-500">{a.line1}, {a.city} {a.pincode}</span></span>
              </label>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 font-bold">Payment method</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Payment method">
            {METHODS.map(({ id, label, icon: Icon }) => {
              const off = id === 'upi' && upi !== 'yes';
              return (
                <button key={id} role="radio" aria-checked={method === id} disabled={off} onClick={() => setMethod(id)}
                  title={off ? (upi === 'mobile-only' ? 'Open QuickKart on your phone to pay with a UPI app' : 'UPI is unavailable right now') : undefined}
                  className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${method === id ? 'border-brand-500 bg-brand-50/50 text-brand-700 dark:bg-brand-500/5 dark:text-brand-300' : 'border-gray-100 dark:border-ink-700'}`}>
                  <Icon />{label}
                  {off && <span className="text-[10px] font-medium text-gray-400">{upi === 'mobile-only' ? 'On mobile' : 'Unavailable'}</span>}
                </button>
              );
            })}
          </div>
          {method === 'upi' && <p className="mt-2 text-xs text-gray-500">Pay with GPay, PhonePe, Paytm or any UPI app via Razorpay.</p>}
        </section>
      </div>

      <aside className="min-w-0 space-y-4 lg:sticky lg:top-20 lg:self-start">
        <section className="card p-5">
          <h2 className="mb-3 flex items-center gap-2 font-bold"><LocalOfferRounded className="text-brand-500" fontSize="small" />Offers</h2>
          {applied ? (
            <div className="flex items-center justify-between rounded-xl bg-emerald-50 p-3 text-sm dark:bg-emerald-500/10">
              <span className="font-semibold text-emerald-700 dark:text-emerald-300">{cart.coupon_message || `${applied} applied`}</span>
              <button className="text-xs font-semibold text-red-500" onClick={removeCoupon}>Remove</button>
            </div>
          ) : (
            <>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); applyCoupon(); }}>
                <input className="input uppercase" placeholder="Coupon code" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Coupon code" />
                <button className="btn-secondary" disabled={!code || busy}>Apply</button>
              </form>
              <ul className="mt-3 space-y-2">
                {offers.data?.map((o) => (
                  <li key={o.code} className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-gray-200 p-2.5 text-xs dark:border-ink-600">
                    <span><span className="font-bold">{o.code}</span><span className="block text-gray-500">{o.description}</span></span>
                    <button className="font-semibold text-brand-600 disabled:text-gray-400" disabled={cart.subtotal < o.min_order} onClick={() => applyCoupon(o.code)}>
                      {cart.subtotal < o.min_order ? `Add ${inr(o.min_order - cart.subtotal)}` : 'Apply'}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="card space-y-2 p-5">
          <h2 className="mb-1 font-bold">Bill details</h2>
          <Row label="Item total" value={inr(cart.subtotal)} />
          {cart.discount > 0 && <Row label={`Discount (${cart.coupon_code})`} value={`−${inr(cart.discount)}`} tone="text-emerald-600" />}
          <Row label="Delivery fee" value={cart.delivery_fee ? inr(cart.delivery_fee) : 'FREE'} />
          <Row label="GST (5%)" value={inr(cart.tax)} />
          <div className="border-t border-gray-100 pt-2 dark:border-ink-700"><Row label="To pay" value={inr(cart.total)} strong /></div>
          {belowMin && <MinOrderBar subtotal={cart.subtotal} minOrder={cart.min_order} />}
          <button className="btn-primary mt-2 w-full py-3" disabled={busy || !addressId || belowMin} onClick={placeOrder}>
            {busy ? <Spinner className="h-4 w-4" /> : method === 'cod' ? `Place order · ${inr(cart.total)}` : `Proceed to pay · ${inr(cart.total)}`}
          </button>
        </section>
      </aside>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add address"><AddressForm onSubmit={saveAddress} busy={busy} /></Modal>
    </div>
  );
}
