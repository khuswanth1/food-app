import { useEffect } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const pin = (emoji, bg) => L.divIcon({
  className: '',
  html: `<div style="background:${bg};width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 4px 12px rgba(0,0,0,.25);border:3px solid #fff">${emoji}</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});
const ICONS = { store: pin('🏪', '#f04f23'), home: pin('🏠', '#0ea5e9'), rider: pin('🛵', '#10b981') };

function FitBounds({ points }) {
  const map = useMap();
  const key = points.map((p) => p.join(',')).join('|');
  useEffect(() => {
    if (points.length) map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

/** store / home / rider: [lat, lng] or null */
export default function TrackingMap({ store, home, rider, className = 'h-72' }) {
  const points = [store, home, rider].filter(Boolean);
  if (!points.length) return null;
  return (
    <div className={`overflow-hidden rounded-2xl ${className}`}>
      <MapContainer center={points[0]} zoom={13} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {store && <Marker position={store} icon={ICONS.store}><Tooltip>Pickup</Tooltip></Marker>}
        {home && <Marker position={home} icon={ICONS.home}><Tooltip>Delivery address</Tooltip></Marker>}
        {rider && <Marker position={rider} icon={ICONS.rider}><Tooltip permanent direction="top" offset={[0, -18]}>Rider</Tooltip></Marker>}
        {store && home && <Polyline positions={rider ? [store, rider, home] : [store, home]} pathOptions={{ color: '#f04f23', dashArray: '6 8', weight: 3 }} />}
        <FitBounds points={points} />
      </MapContainer>
    </div>
  );
}
