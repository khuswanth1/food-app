import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || '/api/v1';
const TOKENS_KEY = 'qk-auth';

export const tokenStore = {
  get() {
    try { return JSON.parse(localStorage.getItem(TOKENS_KEY)) || null; } catch { return null; }
  },
  set(value) {
    try { value ? localStorage.setItem(TOKENS_KEY, JSON.stringify(value)) : localStorage.removeItem(TOKENS_KEY); } catch { /* storage unavailable */ }
  },
};

export const api = axios.create({ baseURL: API_URL, timeout: 15000 });

/**
 * Global in-flight counter that drives the top progress bar. Requests count unless sent with
 * `{ silent: true }` (background polling/refreshes); lazy route chunks join via `track()`.
 */
export const loadingTracker = (() => {
  let pending = 0;
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn());
  return {
    start() { pending += 1; emit(); },
    done() { pending = Math.max(0, pending - 1); emit(); },
    isLoading: () => pending > 0,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();

api.interceptors.request.use((config) => {
  const t = tokenStore.get();
  if (t?.access_token) config.headers.Authorization = `Bearer ${t.access_token}`;
  if (!config.silent && !config._tracked) { config._tracked = true; loadingTracker.start(); }
  return config;
});

// Registered before the refresh interceptor so the count is released before a 401 retry re-tracks.
const settle = (config) => { if (config?._tracked) { config._tracked = false; loadingTracker.done(); } };
api.interceptors.response.use(
  (r) => { settle(r.config); return r; },
  (error) => { settle(error.config); return Promise.reject(error); },
);

let refreshing = null;
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    const t = tokenStore.get();
    if (error.response?.status === 401 && t?.refresh_token && !original._retry && !original.url.includes('/auth/')) {
      original._retry = true;
      try {
        refreshing ??= axios.post(`${API_URL}/auth/refresh`, { refresh_token: t.refresh_token }).finally(() => { refreshing = null; });
        const { data } = await refreshing;
        tokenStore.set(data);
        original.headers.Authorization = `Bearer ${data.access_token}`;
        return api(original);
      } catch {
        tokenStore.set(null);
        window.dispatchEvent(new Event('qk:logout'));
      }
    }
    return Promise.reject(error);
  },
);

/** Normalise backend `{error:{code,message,details}}` and network failures into one shape. */
export function apiError(err) {
  const e = err?.response?.data?.error;
  if (e) {
    const detail = e.details?.[0];
    return { code: e.code, message: detail ? `${detail.field}: ${detail.message}` : e.message, status: err.response.status };
  }
  if (err?.code === 'ECONNABORTED') return { code: 'timeout', message: 'The server took too long to respond' };
  return { code: 'network', message: err?.message === 'Network Error' ? 'Cannot reach the server. Is the API running?' : (err?.message || 'Something went wrong') };
}

export function wsUrl(path) {
  const t = tokenStore.get();
  const base = import.meta.env.VITE_WS_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
  return `${base}${path}?token=${encodeURIComponent(t?.access_token || '')}`;
}
