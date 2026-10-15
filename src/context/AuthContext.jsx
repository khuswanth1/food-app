import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore } from '../api/client';

const AuthContext = createContext(null);

export const HOME_BY_ROLE = { customer: '/', vendor: '/vendor', delivery: '/delivery', admin: '/admin' };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => tokenStore.get()?.user || null);
  const [ready, setReady] = useState(!tokenStore.get());

  const logout = useCallback(() => { tokenStore.set(null); setUser(null); }, []);

  useEffect(() => {
    if (!tokenStore.get()) return;
    api.get('/auth/me')
      .then(({ data }) => { setUser(data); tokenStore.set({ ...tokenStore.get(), user: data }); })
      .catch(() => logout())
      .finally(() => setReady(true));
  }, [logout]);

  useEffect(() => {
    window.addEventListener('qk:logout', logout);
    return () => window.removeEventListener('qk:logout', logout);
  }, [logout]);

  const accept = useCallback((data) => { tokenStore.set(data); setUser(data.user); return data.user; }, []);
  const login = useCallback(async (email, password) => accept((await api.post('/auth/login', { email, password })).data), [accept]);
  const register = useCallback(async (body) => accept((await api.post('/auth/register', body)).data), [accept]);
  const loginWithGoogle = useCallback(async (ticket) => accept((await api.post('/auth/google/exchange', { ticket })).data), [accept]);
  const updateUser = useCallback((u) => { setUser(u); tokenStore.set({ ...tokenStore.get(), user: u }); }, []);

  const value = useMemo(() => ({ user, ready, login, register, loginWithGoogle, logout, updateUser }), [user, ready, login, register, loginWithGoogle, logout, updateUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
