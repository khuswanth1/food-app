import { inr } from '../utils/format';

/** Swiggy-style nudge: how far the cart is from the store's minimum order value. */
export default function MinOrderBar({ subtotal, minOrder }) {
  const pctDone = Math.min(100, (subtotal / minOrder) * 100);
  return (
    <div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-500/10" role="status">
      <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
        Add {inr(minOrder - subtotal)} more to place your order <span className="font-normal">(minimum order {inr(minOrder)})</span>
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-amber-200/70 dark:bg-amber-500/20" role="progressbar"
        aria-valuenow={Math.round(pctDone)} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to minimum order">
        <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${pctDone}%` }} />
      </div>
    </div>
  );
}
