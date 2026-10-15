import { Suspense, lazy, useRef, useState } from 'react';
import MyLocationRounded from '@mui/icons-material/MyLocationRounded';
import PlaceRounded from '@mui/icons-material/PlaceRounded';
import { api, apiError } from '../api/client';
import { Field, Spinner } from './ui';

// Leaflet is only needed once the form is open; keep it out of the cart/profile chunks.
const LocationPicker = lazy(() => import('./LocationPicker'));

const BLANK = { label: 'Home', line1: '', city: '', pincode: '', lat: 12.9716, lng: 77.5946, is_default: false };

const GEO_ERRORS = {
  1: 'Location access is blocked. Allow it from the lock icon in your address bar, or move the pin on the map.',
  2: "Couldn't detect your location. Check that GPS or Wi-Fi is on, or move the pin on the map.",
  3: 'Finding your location took too long. Try again, or move the pin on the map.',
};

function geoUnsupportedReason() {
  if (!window.isSecureContext) return 'Your browser only shares location on secure (https) pages. Move the pin on the map instead.';
  if (!navigator.geolocation) return "This browser can't share your location. Move the pin on the map instead.";
  return null;
}

export default function AddressForm({ initial, onSubmit, busy }) {
  const [a, setA] = useState({ ...BLANK, ...initial });
  // "House / flat" is kept separate while typing and joined into line1 on save; existing addresses edit as one line.
  const [house, setHouse] = useState('');
  const [status, setStatus] = useState({ state: 'idle', text: null }); // idle | locating | found | error
  const lookup = useRef(0); // only the latest lookup may fill the form
  const set = (k) => (e) => setA({ ...a, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const fillFrom = async (lat, lng, how) => {
    const coords = { lat: +lat.toFixed(6), lng: +lng.toFixed(6) };
    setA((x) => ({ ...x, ...coords }));
    setStatus({ state: 'locating', text: 'Finding the address…' });
    const id = ++lookup.current;
    try {
      const { data } = await api.get('/users/me/reverse-geocode', { params: coords });
      if (id !== lookup.current) return;
      setA((x) => ({ ...x, line1: data.line1 || x.line1, city: data.city || x.city, pincode: data.pincode || x.pincode }));
      setStatus({ state: 'found', text: data.display_name });
    } catch (e) {
      if (id !== lookup.current) return;
      const msg = apiError(e).message;
      setStatus({ state: 'error', text: `${how}, but ${msg.charAt(0).toLowerCase()}${msg.slice(1)}` });
    }
  };

  const locate = () => {
    const reason = geoUnsupportedReason();
    if (reason) { setStatus({ state: 'error', text: reason }); return; }
    setStatus({ state: 'locating', text: 'Getting your location…' });
    navigator.geolocation.getCurrentPosition(
      (p) => fillFrom(p.coords.latitude, p.coords.longitude, 'Found your location'),
      (err) => setStatus({ state: 'error', text: GEO_ERRORS[err.code] || GEO_ERRORS[2] }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const submit = (e) => {
    e.preventDefault();
    const line1 = [house.trim(), a.line1.trim()].filter(Boolean).join(', ').slice(0, 255);
    onSubmit({ ...a, line1, lat: Number(a.lat), lng: Number(a.lng) });
  };

  const locating = status.state === 'locating';
  return (
    <form className="space-y-3" onSubmit={submit}>
      <button type="button" onClick={locate} disabled={locating}
        className="flex w-full items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50/60 p-3 text-left transition hover:bg-brand-50 disabled:opacity-70 dark:border-brand-500/30 dark:bg-brand-500/10">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-brand-600 shadow-sm dark:bg-ink-800">
          {locating ? <Spinner className="h-4 w-4" /> : <MyLocationRounded fontSize="small" />}
        </span>
        <span>
          <span className="block font-semibold text-brand-600 dark:text-brand-300">Use my current location</span>
          <span className="block text-xs text-gray-500">Fills in your address using GPS</span>
        </span>
      </button>

      {status.text && (
        <p role={status.state === 'error' ? 'alert' : 'status'}
          className={`flex gap-1.5 text-xs ${status.state === 'error' ? 'text-amber-700 dark:text-amber-300' : 'text-gray-600 dark:text-gray-300'}`}>
          <PlaceRounded sx={{ fontSize: 15 }} className="mt-px shrink-0" />{status.text}
        </p>
      )}

      <Suspense fallback={<div className="h-44 animate-pulse rounded-2xl bg-gray-100 dark:bg-ink-700" />}>
        <LocationPicker lat={Number(a.lat)} lng={Number(a.lng)} onChange={(lat, lng) => fillFrom(lat, lng, 'Pin moved')} />
      </Suspense>

      <div className="flex gap-2">
        {['Home', 'Work', 'Other'].map((l) => (
          <button type="button" key={l} onClick={() => setA({ ...a, label: l })} className={`chip ${a.label === l ? 'chip-active' : ''}`}>{l}</button>
        ))}
      </div>
      {!initial?.id && (
        <Field label="House / flat / floor"><input className="input" value={house} onChange={(e) => setHouse(e.target.value)} placeholder="e.g. Flat 302, 3rd floor" maxLength={80} /></Field>
      )}
      <Field label={initial?.id ? 'Address' : 'Area, street, locality'}>
        <input className="input" required minLength={3} maxLength={255} value={a.line1} onChange={set('line1')} placeholder="Street and area" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="City"><input className="input" required value={a.city} onChange={set('city')} /></Field>
        <Field label="Pincode"><input className="input" required inputMode="numeric" pattern="[0-9A-Za-z -]{3,12}" value={a.pincode} onChange={set('pincode')} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={a.is_default} onChange={set('is_default')} className="accent-brand-500" /> Set as default</label>
      <button className="btn-primary w-full" disabled={busy || locating}>{busy ? <Spinner className="h-4 w-4" /> : 'Save address'}</button>
    </form>
  );
}
