import { useCallback, useEffect, useRef, useState } from 'react';
import { api, apiError } from '../api/client';

/**
 * Fetch `url` (with params) and expose {data, loading, error, reload, setData}.
 * Pass `null` as url to skip.
 */
export function useApi(url, params, { deps = [] } = {}) {
  const [state, setState] = useState({ data: null, loading: !!url, error: null });
  const key = JSON.stringify(params || {});
  const seq = useRef(0);

  const load = useCallback(async (silent = false) => {
    if (!url) return;
    const id = ++seq.current;
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { data } = await api.get(url, { params, silent: !!silent });
      if (id === seq.current) setState({ data, loading: false, error: null });
    } catch (e) {
      if (id === seq.current) setState((s) => ({ ...s, loading: false, error: apiError(e) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, key, ...deps]);

  useEffect(() => { load(); }, [load]);

  const setData = useCallback((updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })), []);
  return { ...state, reload: load, setData };
}

/** Wrap a mutating call with busy state + error normalisation. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn) => {
    setBusy(true);
    try { return await fn(); } catch (e) { throw apiError(e); } finally { setBusy(false); }
  }, []);
  return [run, busy];
}
