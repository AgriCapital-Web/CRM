import { useState, useEffect, useRef, memo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { MapPin, Locate, Navigation } from 'lucide-react';

const defaultIcon = L.icon({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = defaultIcon;

const redIcon = L.divIcon({
  className: 'agricapital-location-marker',
  bgPos: [0, 0],
  html: '<span style="display:block;width:32px;height:42px;background:transparent!important;border:0!important;overflow:visible;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42" style="display:block;width:32px;height:42px;max-width:none;background:transparent"><path d="M16 1C7.7 1 1 7.7 1 16c0 11 15 25 15 25s15-14 15-25C31 7.7 24.3 1 16 1Z" fill="#dc2626" stroke="#fff" stroke-width="2"/><circle cx="16" cy="16" r="5" fill="#fff"/></svg></span>',
  iconSize: [32, 42],
  iconAnchor: [16, 41],
  popupAnchor: [0, -38],
});

interface LocationPickerProps {
  setPosition: (pos: [number, number]) => void;
}
const LocationPicker = ({ setPosition }: LocationPickerProps) => {
  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
};

interface FlyToLocationProps {
  position: [number, number] | null;
}
const FlyToLocation = ({ position }: FlyToLocationProps) => {
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo(position, 15, { duration: 1.5 });
  }, [position, map]);
  return null;
};

interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  info?: string;
}
interface InteractiveMapProps {
  mode: 'view' | 'pick';
  position?: [number, number] | null;
  onPositionChange?: (lat: number, lng: number, alt?: number) => void;
  markers?: MapMarker[];
  height?: string;
  className?: string;
}

// Leaflet must recalculate its viewport after a responsive container or lazy-loaded map becomes visible.
// In view mode, frame every valid marker so the user's pins cannot sit outside the initial viewport.
const FitMarkers = ({ markers }: { markers: MapMarker[] }) => {
  const map = useMap();
  const validMarkers = markers.filter((m) =>
    Number.isFinite(m.lat) && Number.isFinite(m.lng) &&
    m.lat >= -90 && m.lat <= 90 && m.lng >= -180 && m.lng <= 180
  );

  useEffect(() => {
    let secondFrame = 0;
    // Mobile cards and lazy-loaded sections can report a zero/partial size on the first frame.
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        map.invalidateSize({ pan: false, debounceMoveend: true });
        if (!validMarkers.length) return;
        if (validMarkers.length === 1) {
          map.setView([validMarkers[0].lat, validMarkers[0].lng], 13, { animate: false });
        } else {
          const bounds = L.latLngBounds(validMarkers.map((m) => [m.lat, m.lng] as [number, number]));
          const compact = window.matchMedia('(max-width: 640px)').matches;
          map.fitBounds(bounds, { padding: compact ? [18, 18] : [28, 28], maxZoom: 13, animate: false });
        }
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [map, markers]);

  useEffect(() => {
    const container = map.getContainer();
    let frame = 0;
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          window.cancelAnimationFrame(frame);
          frame = window.requestAnimationFrame(() => {
            map.invalidateSize({ pan: false, debounceMoveend: true });
          });
        })
      : null;
    observer?.observe(container);
    return () => {
      observer?.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [map]);

  return null;
};

const InteractiveMapComponent = ({
  mode = 'view',
  position: initialPosition,
  onPositionChange,
  markers = [],
  height = '400px',
  className = ''
}: InteractiveMapProps) => {
  const [position, setPosition] = useState<[number, number] | null>(initialPosition || null);
  const [loading, setLoading] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const defaultCenter: [number, number] = [6.8774, -6.4502];

  const handleGeolocate = () => {
    if (!navigator.geolocation) {
      alert("La géolocalisation n'est pas supportée par votre navigateur");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newPos: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setPosition(newPos);
        onPositionChange?.(pos.coords.latitude, pos.coords.longitude, pos.coords.altitude || undefined);
        setLoading(false);
      },
      (error) => {
        console.error('Erreur géolocalisation:', error);
        alert("Impossible d'obtenir votre position. Vérifiez les permissions.");
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handlePositionChange = (newPos: [number, number]) => {
    setPosition(newPos);
    onPositionChange?.(newPos[0], newPos[1]);
  };

  return (
    <div className={`relative ${className}`} style={{ height }}>
      {mode === 'pick' && (
        <div className="absolute top-2 right-2 z-[1000] flex gap-2">
          <Button type="button" size="sm" onClick={handleGeolocate} disabled={loading} className="gap-2 bg-primary shadow-lg">
            {loading ? <Navigation className="h-4 w-4 animate-spin" /> : <Locate className="h-4 w-4" />}
            {loading ? 'Localisation...' : 'Ma position'}
          </Button>
        </div>
      )}
      <MapContainer
        ref={mapRef}
        center={position || defaultCenter}
        zoom={position ? 15 : 8}
        style={{ height: '100%', width: '100%', borderRadius: '0.5rem' }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {mode === 'pick' && <LocationPicker setPosition={handlePositionChange} />}
        <FlyToLocation position={position} />
        {mode === 'view' && <FitMarkers markers={markers} />}

        {position && mode === 'pick' && (
          <Marker position={position} icon={redIcon}>
            <Popup>
              <div className="text-center">
                <p className="font-semibold">Position sélectionnée</p>
                <p className="text-xs text-muted-foreground">
                  Lat: {position[0].toFixed(6)}<br />
                  Lng: {position[1].toFixed(6)}
                </p>
              </div>
            </Popup>
          </Marker>
        )}

        {mode === 'view' && markers.filter((marker) => Number.isFinite(marker.lat) && Number.isFinite(marker.lng) && marker.lat >= -90 && marker.lat <= 90 && marker.lng >= -180 && marker.lng <= 180).map((marker) => (
          <Marker key={marker.id} position={[marker.lat, marker.lng]} icon={redIcon} zIndexOffset={2000} riseOnHover>
            <Tooltip direction="top" offset={[0, -10]} opacity={1} sticky>
              <div className="min-w-[180px] max-w-[260px]">
                <p className="font-semibold">{marker.label}</p>
                {marker.info && <p className="mt-1 text-xs">{marker.info}</p>}
                <p className="mt-1 text-[11px] font-mono text-muted-foreground">{marker.lat.toFixed(6)}, {marker.lng.toFixed(6)}</p>
              </div>
            </Tooltip>
            <Popup>
              <div className="min-w-[150px]">
                <p className="font-semibold text-primary">{marker.label}</p>
                {marker.info && <p className="mt-1 text-xs text-muted-foreground">{marker.info}</p>}
                <p className="mt-2 font-mono text-xs">{marker.lat.toFixed(5)}, {marker.lng.toFixed(5)}</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      {mode === 'pick' && (
        <div className="absolute bottom-2 left-2 right-2 z-[1000] rounded-lg bg-white/90 p-2 text-center text-sm backdrop-blur-sm">
          <MapPin className="mr-1 inline h-4 w-4 text-red-600" />
          {position ? <span className="font-mono text-xs">Lat: {position[0].toFixed(6)} | Lng: {position[1].toFixed(6)}</span> : null}
        </div>
      )}
    </div>
  );
};

export const InteractiveMap = memo(InteractiveMapComponent);
export default InteractiveMap;
