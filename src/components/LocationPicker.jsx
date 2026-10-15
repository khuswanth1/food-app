import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const PIN = L.divIcon({
  className: '',
  html: '<div style="transform:translate(-50%,-100%);font-size:34px;line-height:1;filter:drop-shadow(0 3px 4px rgba(0,0,0,.35))">📍</div>',
  iconSize: [0, 0],
});

/** Keeps the map centred on the pin when it moves from outside (e.g. "Use my current location"). */
function Follow({ position }) {
  const map = useMap();
  useEffect(() => { map.setView(position, Math.max(map.getZoom(), 16)); }, [map, position[0], position[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  // The map mounts inside an opening modal; re-measure once it has its final size.
  useEffect(() => { const t = setTimeout(() => map.invalidateSize(), 250); return () => clearTimeout(t); }, [map]);
  return null;
}

function ClickToMove({ onChange }) {
  useMapEvents({ click: (e) => onChange(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** Map with a draggable pin for fine-tuning the delivery spot. */
export default function LocationPicker({ lat, lng, onChange, className = 'h-44' }) {
  const position = [lat, lng];
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-gray-100 dark:border-ink-700 ${className}`}>
      <MapContainer center={position} zoom={15} scrollWheelZoom={false} className="h-full w-full" attributionControl>
        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker position={position} icon={PIN} draggable keyboard={false}
          eventHandlers={{ dragend: (e) => { const p = e.target.getLatLng(); onChange(p.lat, p.lng); } }} />
        <Follow position={position} />
        <ClickToMove onChange={onChange} />
      </MapContainer>
      <p className="pointer-events-none absolute inset-x-0 top-2 z-[400] mx-auto w-fit rounded-full bg-ink-900/80 px-3 py-1 text-[11px] font-semibold text-white">
        Drag the pin or tap the map to your exact spot
      </p>
    </div>
  );
}
