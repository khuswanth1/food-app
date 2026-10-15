export const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const dateTime = (s) => new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export const shortDate = (s) => new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export function timeAgo(s) {
  const sec = Math.round((Date.now() - new Date(s).getTime()) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export const STATUS = {
  placed: { label: 'Placed', tone: 'gray' },
  confirmed: { label: 'Confirmed', tone: 'blue' },
  preparing: { label: 'Preparing', tone: 'amber' },
  ready: { label: 'Ready for pickup', tone: 'violet' },
  picked_up: { label: 'Picked up', tone: 'indigo' },
  out_for_delivery: { label: 'On the way', tone: 'brand' },
  delivered: { label: 'Delivered', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'red' },
};

export const FLOW = ['placed', 'confirmed', 'preparing', 'ready', 'picked_up', 'out_for_delivery', 'delivered'];

/** Deterministic pleasant gradient for entities without imagery (demo data has no photos). */
const GRADIENTS = [
  'from-orange-400 to-rose-500', 'from-amber-300 to-orange-500', 'from-emerald-400 to-teal-600',
  'from-sky-400 to-indigo-500', 'from-fuchsia-400 to-purple-600', 'from-lime-400 to-emerald-600',
  'from-rose-400 to-red-600', 'from-yellow-300 to-amber-500',
];
export const gradientFor = (seed) => GRADIENTS[[...String(seed)].reduce((a, c) => a + c.charCodeAt(0), 0) % GRADIENTS.length];

const EMOJI = {
  pizza: '🍕', burgers: '🍔', biryani: '🍛', 'north indian': '🍛', 'south indian': '🥞', chinese: '🥡', desserts: '🍰',
  cafe: '☕', coffee: '☕', healthy: '🥗', salads: '🥗', rolls: '🌯', groceries: '🛒', fruits: '🍎', vegetables: '🥦',
  dairy: '🥛', bakery: '🥐', snacks: '🍿', beverages: '🧃', breakfast: '🥞', 'main course': '🍲', breads: '🫓',
  starters: '🍢', kebabs: '🍢', sides: '🍟', pasta: '🍝', meals: '🍱', 'ice cream': '🍨', staples: '🌾', spreads: '🍯',
  household: '🧴', 'personal care': '🧼', spices: '🌶️', wraps: '🌯', italian: '🍝', mughlai: '🍗',
};
export const emojiFor = (...keys) => {
  for (const k of keys.flat()) {
    const e = EMOJI[String(k || '').toLowerCase()];
    if (e) return e;
  }
  return '🍽️';
};

export const FALLBACK_IMAGES = [
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80',
  'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&q=80',
  'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80',
  'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?w=400&q=80',
  'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=400&q=80',
  'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&q=80',
  'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=80',
  'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=400&q=80',
];
export const fallbackImageFor = (seed) => FALLBACK_IMAGES[[...String(seed)].reduce((a, c) => a + c.charCodeAt(0), 0) % FALLBACK_IMAGES.length];
