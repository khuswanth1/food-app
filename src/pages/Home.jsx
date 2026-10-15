import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import SearchRounded from '@mui/icons-material/SearchRounded';
import PlaceRounded from '@mui/icons-material/PlaceRounded';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import TuneRounded from '@mui/icons-material/TuneRounded';
import SearchOffRounded from '@mui/icons-material/SearchOffRounded';
import ReplayRounded from '@mui/icons-material/ReplayRounded';
import { api, apiError } from '../api/client';
import StoreCard from '../components/StoreCard';
import { QtyStepper } from '../components/ProductCard';
import { Async, Pagination, Skeleton } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useApi } from '../hooks/useApi';
import { useDebounced, useDeliveryLocation } from '../hooks/useLocation';
import { emojiFor, inr } from '../utils/format';
import ProductImage from '../components/ProductImage';

const TYPES = [['', 'All'], ['restaurant', 'Restaurants'], ['grocery', 'Groceries']];
const SORTS = [['relevance', 'Relevance'], ['rating', 'Rating'], ['delivery_time', 'Fastest delivery'], ['distance', 'Distance'], ['price_low', 'Price: low to high'], ['price_high', 'Price: high to low']];
const QUICK_CUISINES = ['Pizza', 'Biryani', 'North Indian', 'South Indian', 'Chinese', 'Burgers', 'Desserts', 'Cafe', 'Healthy'];

function GridSkeleton() {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-64" />)}</div>;
}

export default function Home() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const loc = useDeliveryLocation();
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [filters, setFilters] = useState({ store_type: '', cuisine: '', veg_only: false, min_rating: 0, open_now: false, sort: 'relevance' });
  
  useEffect(() => {
    const sq = searchParams.get('q') || '';
    if (sq !== q) {
      setQ(sq);
      setPage(1);
    }
  }, [searchParams]);
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const search = useDebounced(q.trim());
  const isCustomer = user?.role === 'customer';

  const params = { ...filters, q: search || undefined, page, size: 12, lat: loc.lat, lng: loc.lng };
  Object.keys(params).forEach((k) => (params[k] === '' || params[k] === false || params[k] === 0) && delete params[k]);
  const stores = useApi('/stores', params);
  const recos = useApi('/recommendations/stores', { limit: 8, lat: loc.lat, lng: loc.lng }, { deps: [user?.id] });
  const again = useApi(isCustomer ? '/recommendations/products' : null, { limit: 8 });

  const set = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  const filtering = search || filters.cuisine || filters.store_type || filters.veg_only || filters.min_rating || filters.open_now;

  const toggleFav = async (store) => {
    if (!isCustomer) { toast('Sign in as a customer to save favorites', 'info'); return; }
    try {
      const { data } = await api.post(`/favorites/${store.id}`);
      const flip = (s) => (s.id === store.id ? { ...s, is_favorite: !s.is_favorite } : s);
      stores.setData((d) => d && { ...d, items: d.items.map(flip) });
      recos.setData((d) => d?.map((r) => ({ ...r, store: flip(r.store) })));
      toast(data.message);
    } catch (e) { toast(apiError(e).message, 'error'); }
  };

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 via-brand-600 to-rose-600 px-5 py-8 text-white sm:px-10 sm:py-12">
        <p className="truncate text-sm text-white/80"><PlaceRounded sx={{ fontSize: 16 }} className="-mt-0.5 mr-1 align-middle" />Delivering to <span className="font-semibold text-white">{loc.label}</span></p>
        <h1 className="mt-2 max-w-xl text-3xl font-extrabold leading-tight sm:text-4xl">{user ? `Hungry, ${user.full_name.split(' ')[0]}?` : 'Food & groceries in minutes'}</h1>

        <div className="pointer-events-none absolute -bottom-10 right-4 hidden text-[9rem] opacity-25 sm:block" aria-hidden="true">🍔</div>
      </section>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none">
        {QUICK_CUISINES.map((c) => (
          <button key={c} onClick={() => set({ cuisine: filters.cuisine === c ? '' : c })} className={`chip ${filters.cuisine === c ? 'chip-active' : ''}`}>
            {c}
          </button>
        ))}
      </div>

      {!filtering && (
        <section aria-labelledby="reco-h">
          <h2 id="reco-h" className="mb-3 flex items-center gap-2 text-xl font-bold"><AutoAwesomeRounded className="text-violet-500" /> {isCustomer ? 'Picked for you' : 'Popular right now'}</h2>
          <Async loading={recos.loading} error={recos.error} onRetry={recos.reload} empty={!recos.data?.length} emptyProps={{ title: 'No recommendations yet' }}
            skeleton={<div className="flex gap-4 overflow-hidden">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-64 w-72 shrink-0" />)}</div>}>
            <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 scrollbar-none">
              {recos.data?.map((r) => <div key={r.store.id} className="w-72 shrink-0 snap-start"><StoreCard store={r.store} reason={r.reason} onFavorite={toggleFav} /></div>)}
            </div>
          </Async>
        </section>
      )}

      {!filtering && isCustomer && again.data?.length > 0 && (
        <section aria-labelledby="again-h">
          <h2 id="again-h" className="mb-3 flex items-center gap-2 text-xl font-bold"><ReplayRounded className="text-brand-500" /> Order again</h2>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-none">
            {again.data.map(({ product, reason, store_name }) => (
              <div key={product.id} className="card flex w-56 shrink-0 flex-col gap-2 p-3">
                <ProductImage product={product} className="h-28 w-full rounded-xl" emojiSize="text-3xl" />
                <p className="truncate text-sm font-semibold">{product.name}</p>
                <p className="truncate text-xs text-gray-500">{store_name} · {reason}</p>
                <div className="mt-auto flex items-center justify-between"><span className="text-sm font-bold">{inr(product.price)}</span><QtyStepper product={product} compact /></div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="all-h">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 id="all-h" className="mr-auto text-xl font-bold">{search ? `Results for “${search}”` : 'All stores'}{stores.data && <span className="ml-2 text-sm font-normal text-gray-500">{stores.data.total}</span>}</h2>
          <div className="flex rounded-xl bg-gray-100 p-1 dark:bg-ink-800" role="tablist">
            {TYPES.map(([v, l]) => (
              <button key={v} role="tab" aria-selected={filters.store_type === v} onClick={() => set({ store_type: v })}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${filters.store_type === v ? 'bg-white shadow dark:bg-ink-600' : 'text-gray-500'}`}>{l}</button>
            ))}
          </div>
          <button className={`chip ${showFilters ? 'chip-active' : ''}`} onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}><TuneRounded sx={{ fontSize: 18 }} />Filters</button>
        </div>

        {showFilters && (
          <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
            <select className="input w-auto" value={filters.sort} onChange={(e) => set({ sort: e.target.value })} aria-label="Sort by">
              {SORTS.map(([v, l]) => <option key={v} value={v}>Sort: {l}</option>)}
            </select>
            <button className={`chip ${filters.min_rating ? 'chip-active' : ''}`} onClick={() => set({ min_rating: filters.min_rating ? 0 : 4 })}>Rating 4.0+</button>
            <button className={`chip ${filters.veg_only ? 'chip-active' : ''}`} onClick={() => set({ veg_only: !filters.veg_only })}>Pure veg</button>
            <button className={`chip ${filters.open_now ? 'chip-active' : ''}`} onClick={() => set({ open_now: !filters.open_now })}>Open now</button>
            {filtering && <button className="btn-ghost text-sm" onClick={() => { setQ(''); set({ store_type: '', cuisine: '', veg_only: false, min_rating: 0, open_now: false }); }}>Clear all</button>}
          </div>
        )}

        <Async loading={stores.loading && !stores.data} error={stores.error} onRetry={stores.reload} skeleton={<GridSkeleton />}
          empty={stores.data?.items.length === 0} emptyProps={{ icon: SearchOffRounded, title: 'No matches', text: 'Try a different dish, cuisine or remove some filters.' }}>
          <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${stores.loading ? 'opacity-60' : ''}`}>
            {stores.data?.items.map((s) => <StoreCard key={s.id} store={s} onFavorite={toggleFav} />)}
          </div>
          <Pagination page={page} pages={stores.data?.pages} onChange={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
        </Async>
      </section>
    </div>
  );
}
