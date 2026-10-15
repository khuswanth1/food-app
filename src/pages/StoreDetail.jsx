import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AccessTimeRounded from '@mui/icons-material/AccessTimeRounded';
import FavoriteRounded from '@mui/icons-material/FavoriteRounded';
import FavoriteBorderRounded from '@mui/icons-material/FavoriteBorderRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import ShoppingBagRounded from '@mui/icons-material/ShoppingBagRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import { api, apiError } from '../api/client';
import ProductCard from '../components/ProductCard';
import MinOrderBar from '../components/MinOrderBar';
import { StoreCover } from '../components/StoreCard';
import { Async, Badge, Rating, Skeleton } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useApi } from '../hooks/useApi';
import { useDeliveryLocation } from '../hooks/useLocation';
import { inr, timeAgo } from '../utils/format';

export default function StoreDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { cart, count } = useCart();
  const toast = useToast();
  const loc = useDeliveryLocation();
  const store = useApi(`/stores/${id}`, { lat: loc.lat, lng: loc.lng }, { deps: [user?.id] });
  const reviews = useApi(`/stores/${id}/reviews`, { size: 6 });
  const [query, setQuery] = useState('');
  const [vegOnly, setVegOnly] = useState(false);
  const [tab, setTab] = useState('menu');
  const s = store.data;

  const sections = useMemo(() => {
    if (!s) return [];
    const q = query.toLowerCase();
    return s.categories.map((c) => ({
      name: c,
      items: s.products.filter((p) => p.category === c && (!vegOnly || p.is_veg) && (!q || p.name.toLowerCase().includes(q))),
    })).filter((x) => x.items.length);
  }, [s, query, vegOnly]);

  const fav = async () => {
    if (user?.role !== 'customer') { toast('Sign in as a customer to save favorites', 'info'); return; }
    try {
      const { data } = await api.post(`/favorites/${s.id}`);
      store.setData((d) => ({ ...d, is_favorite: !d.is_favorite }));
      toast(data.message);
    } catch (e) { toast(apiError(e).message, 'error'); }
  };

  return (
    <Async loading={store.loading} error={store.error} onRetry={store.reload}
      skeleton={<div className="space-y-4"><Skeleton className="h-48" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>}>
      {s && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0">
            <div className="card overflow-hidden">
              <StoreCover store={s} className="h-40 sm:h-52" />
              <div className="space-y-2 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h1 className="text-2xl font-extrabold">{s.name}</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{s.cuisines.join(', ')}</p>
                    <p className="text-xs text-gray-500">{s.address}</p>
                  </div>
                  <button onClick={fav} className="btn-secondary p-2.5" aria-label={s.is_favorite ? 'Remove from favorites' : 'Add to favorites'}>
                    {s.is_favorite ? <FavoriteRounded className="text-brand-500" /> : <FavoriteBorderRounded className="text-brand-500" />}
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <Rating value={s.rating} count={s.rating_count} />
                  <span className="inline-flex items-center gap-1"><AccessTimeRounded sx={{ fontSize: 16 }} />{s.eta_minutes} min</span>
                  {s.distance_km != null && <span>{s.distance_km} km</span>}
                  <span>{s.delivery_fee ? `${inr(s.delivery_fee)} delivery` : 'Free delivery'}</span>
                  {s.min_order > 0 && <span>Min order {inr(s.min_order)}</span>}
                  {!s.is_open && <Badge tone="red">Closed now</Badge>}
                </div>
              </div>
            </div>

            <div className="sticky top-16 z-20 -mx-4 mt-4 flex items-center gap-2 bg-gray-50/95 px-4 py-3 backdrop-blur dark:bg-ink-950/95">
              <div className="flex rounded-xl bg-gray-100 p-1 dark:bg-ink-800">
                {['menu', 'reviews'].map((t) => (
                  <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize ${tab === t ? 'bg-white shadow dark:bg-ink-600' : 'text-gray-500'}`}>{t}</button>
                ))}
              </div>
              {tab === 'menu' && <>
                <div className="relative flex-1">
                  <SearchRounded className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fontSize="small" />
                  <input className="input py-2 pl-9" placeholder={`Search in ${s.name}`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search menu" />
                </div>
                {s.store_type === 'restaurant' && !s.is_veg_only && <button onClick={() => setVegOnly((v) => !v)} className={`chip ${vegOnly ? 'chip-active' : ''}`}>Veg</button>}
              </>}
            </div>

            {tab === 'menu' ? (
              <div className="space-y-4">
                {sections.length === 0 && <p className="py-10 text-center text-gray-500">No items match “{query}”.</p>}
                {sections.map((sec) => (
                  <section key={sec.name} className="card px-5" aria-labelledby={`cat-${sec.name}`}>
                    <h2 id={`cat-${sec.name}`} className="pt-4 text-lg font-bold">{sec.name} <span className="text-sm font-normal text-gray-400">({sec.items.length})</span></h2>
                    <div className="divide-y divide-gray-100 dark:divide-ink-700">{sec.items.map((p) => <ProductCard key={p.id} product={p} />)}</div>
                  </section>
                ))}
              </div>
            ) : (
              <Async loading={reviews.loading} error={reviews.error} empty={!reviews.data?.items.length} emptyProps={{ title: 'No reviews yet' }}>
                <ul className="space-y-3">
                  {reviews.data?.items.map((r) => (
                    <li key={r.id} className="card p-4">
                      <div className="flex items-center justify-between"><span className="font-semibold">{r.user.full_name}</span><Rating value={r.rating} /></div>
                      {r.comment && <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{r.comment}</p>}
                      <p className="mt-1 text-xs text-gray-400">{timeAgo(r.created_at)}</p>
                    </li>
                  ))}
                </ul>
              </Async>
            )}
          </div>

          <aside className="hidden lg:block">
            <div className="card sticky top-20 p-5">
              <h2 className="mb-3 flex items-center gap-2 font-bold"><ShoppingBagRounded className="text-brand-500" />Your cart</h2>
              {count === 0 ? <p className="text-sm text-gray-500">Your cart is empty. Add something tasty!</p> : (
                <>
                  <p className="text-xs text-gray-500">From {cart.store_name}</p>
                  <ul className="my-3 space-y-1.5 text-sm">{cart.items.map((i) => <li key={i.id} className="flex justify-between gap-2"><span className="truncate">{i.quantity} × {i.product.name}</span><span>{inr(i.line_total)}</span></li>)}</ul>
                  <div className="flex justify-between border-t border-gray-100 pt-3 font-bold dark:border-ink-700"><span>Subtotal</span><span>{inr(cart.subtotal)}</span></div>
                  {cart.subtotal < cart.min_order && <div className="mt-3"><MinOrderBar subtotal={cart.subtotal} minOrder={cart.min_order} /></div>}
                  <Link to="/cart" className="btn-primary mt-4 w-full">Checkout <ArrowForwardRounded fontSize="small" /></Link>
                </>
              )}
            </div>
          </aside>

          {count > 0 && (
            <Link to="/cart" className="btn-primary fixed inset-x-4 bottom-20 z-30 justify-between py-3.5 shadow-xl lg:hidden">
              <span>{count} item{count > 1 ? 's' : ''} · {inr(cart.subtotal)}</span><span className="inline-flex items-center gap-1">View cart <ArrowForwardRounded fontSize="small" /></span>
            </Link>
          )}
        </div>
      )}
    </Async>
  );
}
