import AddRounded from '@mui/icons-material/AddRounded';
import RemoveRounded from '@mui/icons-material/RemoveRounded';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import { useCart } from '../context/CartContext';
import { inr } from '../utils/format';
import { Badge } from './ui';
import ProductImage from './ProductImage';

export function VegMark({ veg }) {
  return (
    <span title={veg ? 'Vegetarian' : 'Non-vegetarian'} aria-label={veg ? 'Vegetarian' : 'Non-vegetarian'}
      className={`inline-flex h-4 w-4 items-center justify-center rounded-sm border-2 ${veg ? 'border-emerald-600' : 'border-red-600'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${veg ? 'bg-emerald-600' : 'bg-red-600'}`} />
    </span>
  );
}

/** Per-order quantity bounds: the vendor's min/max, capped by what's in stock. */
export function qtyLimits(product) {
  const min = product.min_qty || 1;
  const cap = Math.min(product.max_qty ?? Infinity, product.stock);
  return { min, cap };
}

export function QtyLimitNote({ product, className = '' }) {
  const min = product.min_qty || 1;
  if (min <= 1 && !product.max_qty) return null;
  const parts = [min > 1 && `Min ${min}`, product.max_qty && `Max ${product.max_qty} per order`].filter(Boolean);
  return <p className={`text-xs font-medium text-gray-500 dark:text-gray-400 ${className}`}>{parts.join(' · ')}</p>;
}

export function QtyStepper({ product, compact = false }) {
  const { add, setQty, qtyOf } = useCart();
  const line = qtyOf(product.id);
  const { min, cap } = qtyLimits(product);
  const out = !product.is_available || product.stock < min;
  if (out) return <span className="text-xs font-semibold text-gray-400">Out of stock</span>;
  if (!line) {
    return (
      <button onClick={() => add(product, min)} className={`btn border border-brand-200 bg-white text-brand-600 shadow-sm hover:bg-brand-50 dark:border-brand-500/40 dark:bg-ink-800 ${compact ? 'px-3 py-1.5' : 'px-5 py-2'}`}>
        ADD <AddRounded sx={{ fontSize: 16 }} />
      </button>
    );
  }
  return (
    <div className="inline-flex items-center rounded-xl bg-brand-500 text-white shadow-sm">
      {/* At the minimum, "−" removes the item instead of dropping below it */}
      <button className="p-2" aria-label={`Decrease ${product.name}`} onClick={() => setQty(line.id, line.quantity <= min ? 0 : line.quantity - 1)}><RemoveRounded sx={{ fontSize: 16 }} /></button>
      <span className="min-w-6 text-center text-sm font-bold" aria-live="polite">{line.quantity}</span>
      <button className="p-2 disabled:opacity-40" aria-label={`Increase ${product.name}`} disabled={line.quantity >= cap}
        title={line.quantity >= cap ? (cap === product.max_qty ? `Max ${cap} per order` : `Only ${cap} in stock`) : undefined}
        onClick={() => setQty(line.id, line.quantity + 1)}><AddRounded sx={{ fontSize: 16 }} /></button>
    </div>
  );
}

export default function ProductCard({ product, reason }) {
  const discount = product.mrp && product.mrp > product.price ? Math.round((1 - product.price / product.mrp) * 100) : 0;
  return (
    <div className="flex gap-4 py-4">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <VegMark veg={product.is_veg} />
          {product.tags.includes('bestseller') && <Badge tone="amber">★ Bestseller</Badge>}
        </div>
        <h4 className="font-semibold">{product.name}</h4>
        <div className="flex items-baseline gap-2 text-sm">
          <span className="font-semibold">{inr(product.price)}</span>
          {discount > 0 && <><span className="text-gray-400 line-through">{inr(product.mrp)}</span><span className="text-xs font-bold text-emerald-600">{discount}% off</span></>}
          {product.unit && <span className="text-xs text-gray-500">· {product.unit}</span>}
        </div>
        {product.description && <p className="line-clamp-2 text-sm text-gray-500 dark:text-gray-400">{product.description}</p>}
        {product.stock > 0 && product.stock <= 5 && <p className="text-xs font-medium text-amber-600">Only {product.stock} left</p>}
        <QtyLimitNote product={product} />
        {reason && <p className="flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-300"><AutoAwesomeRounded sx={{ fontSize: 13 }} />{reason}</p>}
      </div>
      <div className="relative flex w-32 shrink-0 flex-col items-center sm:w-40">
        <ProductImage product={product} className="h-28 w-32 rounded-2xl shadow-sm sm:h-32 sm:w-40" />
        <div className="-mt-5"><QtyStepper product={product} compact /></div>
      </div>
    </div>
  );
}
