import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, apiError } from '../api/client';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const CartContext = createContext(null);
const EMPTY = { items: [], subtotal: 0, total: 0, store_id: null };

export function CartProvider({ children }) {
  const { user } = useAuth();
  const toast = useToast();
  const [cart, setCart] = useState(EMPTY);
  const [pending, setPending] = useState(null); // product awaiting "replace cart?" confirmation
  const isCustomer = user?.role === 'customer';

  const refresh = useCallback(async (coupon) => {
    if (!isCustomer) { setCart(EMPTY); return EMPTY; }
    const { data } = await api.get('/cart', { params: coupon ? { coupon } : {} });
    setCart(data);
    return data;
  }, [isCustomer]);

  useEffect(() => { refresh().catch(() => {}); }, [refresh]);

  const add = useCallback(async (product, quantity = 1, replace = false) => {
    if (!isCustomer) { toast('Sign in as a customer to order', 'info'); return; }
    try {
      const { data } = await api.post('/cart/items', { product_id: product.id, quantity, replace_cart: replace });
      setCart(data);
      setPending(null);
      toast(`${product.name} added`);
    } catch (e) {
      const err = apiError(e);
      if (err.code === 'cart_store_conflict') setPending({ product, quantity, message: err.message });
      else toast(err.message, 'error');
    }
  }, [isCustomer, toast]);

  const setQty = useCallback(async (itemId, quantity) => {
    try { setCart((await api.patch(`/cart/items/${itemId}`, { quantity })).data); }
    catch (e) { toast(apiError(e).message, 'error'); }
  }, [toast]);

  const clear = useCallback(async () => setCart((await api.delete('/cart')).data), []);

  const qtyOf = useCallback((productId) => cart.items.find((i) => i.product.id === productId), [cart]);
  const count = cart.items.reduce((n, i) => n + i.quantity, 0);

  const value = useMemo(() => ({ cart, count, add, setQty, clear, refresh, qtyOf, pending, setPending }),
    [cart, count, add, setQty, clear, refresh, qtyOf, pending]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
