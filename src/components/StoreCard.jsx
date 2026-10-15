import { Link } from 'react-router-dom';
import AccessTimeRounded from '@mui/icons-material/AccessTimeRounded';
import FavoriteRounded from '@mui/icons-material/FavoriteRounded';
import FavoriteBorderRounded from '@mui/icons-material/FavoriteBorderRounded';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import { Badge, Rating } from './ui';
import { fallbackImageFor, inr } from '../utils/format';

export function StoreCover({ store, className = 'h-36' }) {
  const src = store.image_url || fallbackImageFor(store.name);
  return <img src={src} alt="" className={`w-full object-cover ${className}`} loading="lazy" />;
}

export default function StoreCard({ store, reason, onFavorite }) {
  return (
    <Link to={`/stores/${store.id}`} className="card group block overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-4 focus-visible:ring-brand-500/30">
      <div className="relative">
        <StoreCover store={store} />
        {!store.is_open && <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-bold uppercase tracking-wider text-white">Closed</div>}
        {store.delivery_fee === 0 && <span className="absolute left-3 top-3 rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold text-white shadow">Free delivery</span>}
        {onFavorite && (
          <button
            onClick={(e) => { e.preventDefault(); onFavorite(store); }}
            aria-label={store.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
            className="absolute right-3 top-3 rounded-full bg-white/90 p-1.5 text-brand-500 shadow transition hover:scale-110 dark:bg-ink-900/90"
          >
            {store.is_favorite ? <FavoriteRounded fontSize="small" /> : <FavoriteBorderRounded fontSize="small" />}
          </button>
        )}
      </div>
      <div className="space-y-1.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate font-bold group-hover:text-brand-600">{store.name}</h3>
          <Rating value={store.rating} />
        </div>
        <p className="truncate text-sm text-gray-500 dark:text-gray-400">{store.cuisines.join(' · ')}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
          <span className="inline-flex items-center gap-1"><AccessTimeRounded sx={{ fontSize: 14 }} />{store.eta_minutes} min</span>
          {store.distance_km != null && <span>{store.distance_km} km</span>}
          <span>{'₹'.repeat(store.price_level)}</span>
          {store.min_order > 0 && <span>Min {inr(store.min_order)}</span>}
          {store.is_veg_only && <Badge tone="green">Pure veg</Badge>}
        </div>
        {reason && (
          <p className="flex items-center gap-1 pt-1 text-xs font-medium text-violet-600 dark:text-violet-300">
            <AutoAwesomeRounded sx={{ fontSize: 14 }} /> {reason}
          </p>
        )}
      </div>
    </Link>
  );
}
