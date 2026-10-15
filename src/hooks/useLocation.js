import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

const DEFAULT = { lat: 12.9716, lng: 77.5946, label: 'your location' };

/** The customer's default delivery address coordinates (falls back to city centre). */
export function useDeliveryLocation() {
  const { user } = useAuth();
  const [loc, setLoc] = useState(DEFAULT);
  useEffect(() => {
    if (user?.role !== 'customer') { setLoc(DEFAULT); return; }
    api.get('/users/me/addresses')
      .then(({ data }) => {
        const a = data.find((x) => x.is_default) || data[0];
        if (a) setLoc({ lat: a.lat, lng: a.lng, label: `${a.label} · ${a.line1}` });
      })
      .catch(() => {});
  }, [user]);
  return loc;
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
