/**
 * Offline-capable map component for Côte d'Ivoire
 * Uses navigator.geolocation for GPS (works offline) + canvas-based map fallback
 */
import { useState, useEffect, useRef, useCallback, memo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Locate, Navigation, Wifi, WifiOff, Crosshair } from "lucide-react";

// Côte d'Ivoire bounding box
const CI_BOUNDS = {
  minLat: 4.35,
  maxLat: 10.74,
  minLng: -8.60,
  maxLng: -2.49,
};

// Major cities for reference on offline canvas map
const CI_CITIES = [
  { name: "Abidjan", lat: 5.3600, lng: -4.0083 },
  { name: "Yamoussoukro", lat: 6.8276, lng: -5.2893 },
  { name: "Bouaké", lat: 7.6939, lng: -5.0308 },
  { name: "Daloa", lat: 6.8774, lng: -6.4502 },
  { name: "Korhogo", lat: 9.4580, lng: -5.6297 },
  { name: "San-Pédro", lat: 4.7392, lng: -6.6361 },
  { name: "Man", lat: 7.4125, lng: -7.5536 },
  { name: "Gagnoa", lat: 6.1319, lng: -5.9506 },
  { name: "Abengourou", lat: 6.7297, lng: -3.4964 },
  { name: "Divo", lat: 5.8372, lng: -5.3597 },
  { name: "Odienné", lat: 9.5095, lng: -7.5612 },
  { name: "Bondoukou", lat: 8.0400, lng: -2.8000 },
  { name: "Soubré", lat: 5.7833, lng: -6.5833 },
  { name: "Séguéla", lat: 7.9614, lng: -6.6731 },
  { name: "Sassandra", lat: 4.9500, lng: -6.0833 },
];

// Country outline (simplified polygon for offline rendering)
const CI_OUTLINE: [number, number][] = [
  [-8.60, 4.75], [-7.54, 4.35], [-7.39, 5.15], [-7.62, 5.56],
  [-7.57, 5.71], [-8.24, 6.29], [-8.49, 7.40], [-8.43, 7.69],
  [-8.03, 8.31], [-7.90, 8.65], [-7.83, 8.99], [-8.21, 9.41],
  [-8.15, 9.50], [-7.97, 10.17], [-7.62, 10.43], [-6.95, 10.34],
  [-6.29, 10.74], [-6.19, 10.40], [-5.73, 10.43], [-5.49, 10.62],
  [-5.10, 10.24], [-4.78, 9.82], [-4.33, 9.61], [-3.98, 9.86],
  [-3.63, 9.94], [-3.22, 9.88], [-2.83, 9.64], [-2.56, 8.43],
  [-2.49, 8.20], [-2.69, 7.87], [-2.81, 7.82], [-3.00, 6.74],
  [-2.96, 5.87], [-3.25, 5.15], [-3.47, 5.13], [-4.01, 5.18],
  [-4.65, 5.17], [-5.05, 5.15], [-5.47, 5.10], [-6.46, 4.93],
  [-7.30, 4.85], [-7.54, 4.35],
];

interface OfflineMapProps {
  position?: [number, number] | null;
  onPositionChange?: (lat: number, lng: number) => void;
  height?: string;
}

const OfflineMapComponent = ({ position: initialPosition, onPositionChange, height = "350px" }: OfflineMapProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<[number, number] | null>(initialPosition || null);
  const [isLocating, setIsLocating] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [canvasSize, setCanvasSize] = useState({ width: 400, height: 350 });
  const [manualLat, setManualLat] = useState(initialPosition?.[0]?.toString() || "");
  const [manualLng, setManualLng] = useState(initialPosition?.[1]?.toString() || "");

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);

  // Resize canvas
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect;
      const h = parseInt(height) || 350;
      setCanvasSize({ width: Math.max(300, width), height: h });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [height]);

  // Lat/Lng to canvas pixel
  const toCanvas = useCallback((lat: number, lng: number) => {
    const x = ((lng - CI_BOUNDS.minLng) / (CI_BOUNDS.maxLng - CI_BOUNDS.minLng)) * canvasSize.width;
    const y = ((CI_BOUNDS.maxLat - lat) / (CI_BOUNDS.maxLat - CI_BOUNDS.minLat)) * canvasSize.height;
    return { x, y };
  }, [canvasSize]);

  // Canvas pixel to Lat/Lng
  const toLatLng = useCallback((x: number, y: number): [number, number] => {
    const lng = CI_BOUNDS.minLng + (x / canvasSize.width) * (CI_BOUNDS.maxLng - CI_BOUNDS.minLng);
    const lat = CI_BOUNDS.maxLat - (y / canvasSize.height) * (CI_BOUNDS.maxLat - CI_BOUNDS.minLat);
    return [lat, lng];
  }, [canvasSize]);

  // Draw the map
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;

    // Background - ocean
    ctx.fillStyle = "#e8f4fd";
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

    // Country fill
    ctx.beginPath();
    CI_OUTLINE.forEach(([lng, lat], i) => {
      const { x, y } = toCanvas(lat, lng);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = "#d4edda";
    ctx.fill();
    ctx.strokeStyle = "#2d6a4f";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Grid lines
    ctx.strokeStyle = "#00000010";
    ctx.lineWidth = 0.5;
    for (let lat = 5; lat <= 10; lat++) {
      const { y } = toCanvas(lat, 0);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvasSize.width, y); ctx.stroke();
    }
    for (let lng = -8; lng <= -3; lng++) {
      const { x } = toCanvas(0, lng);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvasSize.height); ctx.stroke();
    }

    // Cities
    CI_CITIES.forEach(city => {
      const { x, y } = toCanvas(city.lat, city.lng);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#495057";
      ctx.fill();
      ctx.font = "10px sans-serif";
      ctx.fillStyle = "#212529";
      ctx.textAlign = "center";
      ctx.fillText(city.name, x, y - 6);
    });

    // Selected position marker
    if (position) {
      const { x, y } = toCanvas(position[0], position[1]);

      // Accuracy circle
      if (gpsAccuracy) {
        const radiusPx = Math.min(gpsAccuracy / 100, 40);
        ctx.beginPath();
        ctx.arc(x, y, radiusPx, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(59, 130, 246, 0.15)";
        ctx.fill();
        ctx.strokeStyle = "rgba(59, 130, 246, 0.4)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Marker pin
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#dc2626";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();

      // Coordinates label
      ctx.font = "bold 11px monospace";
      ctx.fillStyle = "#1e293b";
      ctx.textAlign = "center";
      ctx.fillText(`${position[0].toFixed(5)}, ${position[1].toFixed(5)}`, x, y + 22);
    }

    // "HORS LIGNE" badge
    if (!isOnline) {
      ctx.fillStyle = "rgba(220, 38, 38, 0.85)";
      const badgeW = 120, badgeH = 24;
      const bx = canvasSize.width - badgeW - 8, by = 8;
      ctx.beginPath();
      ctx.roundRect(bx, by, badgeW, badgeH, 4);
      ctx.fill();
      ctx.font = "bold 11px sans-serif";
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText("📡 HORS LIGNE", bx + badgeW / 2, by + 16);
    }
  }, [canvasSize, position, gpsAccuracy, isOnline, toCanvas]);

  // Click on canvas to set position
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const [lat, lng] = toLatLng(x, y);

    // Check if within CI bounds
    if (lat >= CI_BOUNDS.minLat && lat <= CI_BOUNDS.maxLat && lng >= CI_BOUNDS.minLng && lng <= CI_BOUNDS.maxLng) {
      setPosition([lat, lng]);
      setManualLat(lat.toFixed(6));
      setManualLng(lng.toFixed(6));
      onPositionChange?.(lat, lng);
    }
  };

  // GPS Geolocation (works offline with GPS hardware)
  const handleGeolocate = () => {
    if (!navigator.geolocation) {
      alert("La géolocalisation n'est pas supportée par votre appareil");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setPosition([lat, lng]);
        setGpsAccuracy(pos.coords.accuracy);
        setManualLat(lat.toFixed(6));
        setManualLng(lng.toFixed(6));
        onPositionChange?.(lat, lng);
        setIsLocating(false);
      },
      (err) => {
        console.error("GPS error:", err);
        alert("Impossible d'obtenir la position GPS. Vérifiez que le GPS est activé.");
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    );
  };

  // Continuous GPS tracking
  const [watchId, setWatchId] = useState<number | null>(null);
  const handleTrackPosition = () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setPosition([lat, lng]);
        setGpsAccuracy(pos.coords.accuracy);
        setManualLat(lat.toFixed(6));
        setManualLng(lng.toFixed(6));
        onPositionChange?.(lat, lng);
      },
      (err) => console.error("GPS watch error:", err),
      { enableHighAccuracy: true, timeout: 30000 }
    );
    setWatchId(id);
  };

  useEffect(() => {
    return () => { if (watchId !== null) navigator.geolocation.clearWatch(watchId); };
  }, [watchId]);

  // Manual coordinate entry
  const handleManualSubmit = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (!isNaN(lat) && !isNaN(lng)) {
      setPosition([lat, lng]);
      onPositionChange?.(lat, lng);
    }
  };

  return (
    <div ref={containerRef} className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={handleGeolocate} disabled={isLocating}>
          {isLocating ? <Navigation className="h-4 w-4 mr-1.5 animate-spin" /> : <Locate className="h-4 w-4 mr-1.5" />}
          {isLocating ? "Localisation..." : "Ma position GPS"}
        </Button>
        <Button type="button" size="sm" variant={watchId !== null ? "destructive" : "outline"} onClick={handleTrackPosition}>
          <Crosshair className="h-4 w-4 mr-1.5" />
          {watchId !== null ? "Arrêter le suivi" : "Suivi GPS continu"}
        </Button>
        <Badge variant={isOnline ? "default" : "destructive"} className="ml-auto">
          {isOnline ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}
          {isOnline ? "En ligne" : "Hors ligne"}
        </Badge>
      </div>

      {/* Canvas Map */}
      <div className="relative border rounded-lg overflow-hidden bg-muted" style={{ height }}>
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="cursor-crosshair w-full"
          style={{ height: "100%" }}
        />
        {gpsAccuracy && (
          <div className="absolute bottom-2 left-2 bg-background/90 backdrop-blur-sm rounded px-2 py-1 text-xs">
            <MapPin className="h-3 w-3 inline mr-1 text-primary" />
            Précision GPS: ±{Math.round(gpsAccuracy)}m
          </div>
        )}
      </div>

      {/* Manual coordinate entry */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Latitude</Label>
          <Input
            type="number"
            step="0.000001"
            value={manualLat}
            onChange={(e) => setManualLat(e.target.value)}
            onBlur={handleManualSubmit}
            placeholder="Ex: 6.877"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Longitude</Label>
          <Input
            type="number"
            step="0.000001"
            value={manualLng}
            onChange={(e) => setManualLng(e.target.value)}
            onBlur={handleManualSubmit}
            placeholder="Ex: -6.450"
            className="h-8 text-sm"
          />
        </div>
      </div>

      {position && (
        <p className="text-xs text-muted-foreground text-center">
          📍 Position : {position[0].toFixed(6)}, {position[1].toFixed(6)}
          {gpsAccuracy ? ` (±${Math.round(gpsAccuracy)}m)` : ""}
        </p>
      )}
    </div>
  );
};

export const OfflineMap = memo(OfflineMapComponent);
export default OfflineMap;
