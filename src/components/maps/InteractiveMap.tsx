import { useState, useEffect, useRef, memo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { MapPin, Locate, Navigation } from 'lucide-react';

// Fix Leaflet default marker icons
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

const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
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
    if (position) {
      map.flyTo(position, 15, { duration: 1.5 });
    }
  }, [position, map]);
  
  return null;
};

interface InteractiveMapProps {
  mode: 'view' | 'pick';
  position?: [number, number] | null;
  onPositionChange?: (lat: number, lng: number, alt?: number) => void;
  markers?: Array<{
    id: string;
    lat: number;
    lng: number;
    label: string;
    info?: string;
  }>;
  height?: string;
  className?: string;
}

const InteractiveMapComponent = ({
  mode = 'view',
  position: initialPosition,
  onPositionChange,
  markers = [],
  height = '400px',
  className = ''
}: InteractiveMapProps) => {
  const [position, setPosition] = useState<[number, number] | null>(
    initialPosition || null
  );
  const [loading, setLoading] = useState(false);
  const mapRef = useRef<L.Map | null>(null);

  // Centre par défaut : Daloa, Côte d'Ivoire
  const defaultCenter: [number, number] = [6.8774, -6.4502];

  const handleGeolocate = () => {
    if (!navigator.geolocation) {
      alert('La géolocalisation n\'est pas supportée par votre navigateur');
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
        alert('Impossible d\'obtenir votre position. Vérifiez les permissions.');
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
          <Button
            type="button"
            size="sm"
            onClick={handleGeolocate}
            disabled={loading}
            className="bg-primary shadow-lg gap-2"
          >
            {loading ? (
              <Navigation className="h-4 w-4 animate-spin" />
            ) : (
              <Locate className="h-4 w-4" />
            )}
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

        {/* Marqueur de position sélectionnée */}
        {position && mode === 'pick' && (
          <Marker position={position}>
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

        {/* Marqueurs multiples pour mode view */}
        {mode === 'view' && markers.map((marker) => (
          <Marker 
            key={marker.id} 
            position={[marker.lat, marker.lng]}
            icon={redIcon}
          >
            <Popup>
              <div className="min-w-[150px]">
                <p className="font-semibold text-primary">{marker.label}</p>
                {marker.info && <p className="text-xs text-muted-foreground mt-1">{marker.info}</p>}
                <p className="text-xs mt-2 font-mono">
                  {marker.lat.toFixed(5)}, {marker.lng.toFixed(5)}
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {mode === 'pick' && (
        <div className="absolute bottom-2 left-2 right-2 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg p-2 text-center text-sm">
          <MapPin className="h-4 w-4 inline mr-1 text-primary" />
          {position ? (
            <span className="font-mono text-xs">
              Lat: {position[0].toFixed(6)} | Lng: {position[1].toFixed(6)}
            </span>
          ) : (
            <span className="text-muted-foreground">
              Cliquez sur la carte ou utilisez "Ma position"
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// Use memo to prevent unnecessary re-renders
export const InteractiveMap = memo(InteractiveMapComponent);
export default InteractiveMap;
