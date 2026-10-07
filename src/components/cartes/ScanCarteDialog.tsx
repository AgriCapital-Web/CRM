import { useCallback, useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ImageUp, Loader2, RefreshCw, ScanLine, SwitchCamera } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCode: (code: string) => void;
}

const CODE_RE = /^[A-Za-z0-9-]{6,64}$/;

/** Extrait un code depuis l'URL publique de vérification ou un code brut. */
export const extraireCode = (valeur: string) => {
  const v = valeur.trim();
  if (!v) return "";
  try {
    const url = new URL(v);
    const match = url.pathname.match(/\/verify\/([A-Za-z0-9-]{6,64})\/?$/i);
    if (match?.[1]) return match[1];
  } catch {
    // Le QR peut contenir directement le code.
  }
  const match = v.match(/(?:^|\/|verifier-carte\/)([A-Za-z0-9-]{6,64})\/?$/i);
  return match?.[1] || v;
};

const isValidCode = (code: string) => CODE_RE.test(code);

const ScanCarteDialog = ({ open, onOpenChange, onCode }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [essai, setEssai] = useState(0);
  const [cameras, setCameras] = useState<QrScanner.Camera[]>([]);
  const [cameraIndex, setCameraIndex] = useState(0);
  const [scanningImage, setScanningImage] = useState(false);

  const arreter = useCallback(() => {
    scannerRef.current?.stop();
    scannerRef.current?.destroy();
    scannerRef.current = null;
  }, []);

  const traiterValeur = useCallback(
    (raw: string) => {
      const code = extraireCode(raw);
      if (!isValidCode(code)) {
        setErreur("QR détecté, mais son contenu n'est pas un code de vérification AgriCapital valide.");
        return false;
      }
      arreter();
      onOpenChange(false);
      onCode(code);
      return true;
    },
    [arreter, onCode, onOpenChange],
  );

  const demarrer = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    arreter();
    setErreur(null);
    setStarting(true);

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setErreur("La caméra nécessite HTTPS. Utilisez « Photo du QR » si la caméra n'est pas disponible.");
      setStarting(false);
      return;
    }

    try {
      const available = await QrScanner.listCameras(true);
      setCameras(available);
      const preferred = available.findIndex((camera) => /back|rear|environment|arrière|principale/i.test(camera.label));
      const nextIndex = preferred >= 0 ? preferred : Math.min(cameraIndex, Math.max(available.length - 1, 0));
      setCameraIndex(nextIndex);

      const preferredCamera = available[nextIndex]?.id || "environment";
      const scanner = new QrScanner(
        video,
        (result) => {
          const raw = typeof result === "string" ? result : result.data;
          traiterValeur(raw);
        },
        {
          preferredCamera,
          maxScansPerSecond: 15,
          returnDetailedScanResult: true,
          highlightScanRegion: false,
          highlightCodeOutline: true,
          // Analyse toute l'image caméra : le QR n'a pas besoin d'être parfaitement centré.
          // La réduction à ~720 px conserve un bon compromis entre sensibilité et fluidité.
          calculateScanRegion: (streamVideo) => {
            const width = streamVideo.videoWidth || 1280;
            const height = streamVideo.videoHeight || 720;
            const maxWidth = 720;
            const scale = Math.min(1, maxWidth / width);
            return {
              x: 0,
              y: 0,
              width,
              height,
              downScaledWidth: Math.max(1, Math.round(width * scale)),
              downScaledHeight: Math.max(1, Math.round(height * scale)),
            };
          },
          onDecodeError: () => undefined,
        },
      );

      scannerRef.current = scanner;
      await scanner.start();

      // Sur les navigateurs mobiles qui exposent le contrôle de mise au point,
      // privilégier l'autofocus continu pour les cartes imprimées.
      const track = (video.srcObject as MediaStream | null)?.getVideoTracks()[0];
      const capabilities = track?.getCapabilities?.() as MediaTrackCapabilities & {
        focusMode?: string[];
      };
      if (track && capabilities.focusMode?.includes("continuous")) {
        await track.applyConstraints({
          advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
        }).catch(() => undefined);
      }

      if (scannerRef.current !== scanner) {
        scanner.stop();
        scanner.destroy();
        return;
      }
      setStarting(false);
    } catch (error) {
      if (scannerRef.current) {
        scannerRef.current.stop();
        scannerRef.current.destroy();
        scannerRef.current = null;
      }
      const name = error instanceof DOMException ? error.name : "";
      setErreur(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Accès caméra refusé. Autorisez la caméra pour ce site dans les réglages du navigateur, puis appuyez sur « Réessayer »."
          : name === "NotFoundError"
            ? "Aucune caméra n'a été détectée sur cet appareil."
            : name === "NotReadableError"
              ? "La caméra est déjà utilisée par une autre application. Fermez-la puis réessayez."
              : "Impossible d'ouvrir la caméra. Vérifiez l'autorisation du navigateur ou utilisez « Photo du QR ».",
      );
      setStarting(false);
    }
  }, [arreter, cameraIndex, traiterValeur]);

  useEffect(() => {
    if (!open) {
      arreter();
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) void demarrer();
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      arreter();
    };
  }, [open, essai, demarrer, arreter]);

  const changerCamera = async () => {
    if (cameras.length < 2) return;
    const next = (cameraIndex + 1) % cameras.length;
    setCameraIndex(next);
    setEssai((n) => n + 1);
  };

  const scannerImage = async (file?: File) => {
    if (!file) return;
    setErreur(null);
    setScanningImage(true);
    try {
      const result = await QrScanner.scanImage(file, {
        returnDetailedScanResult: true,
        alsoTryWithoutScanRegion: true,
      });
      const raw = typeof result === "string" ? result : result.data;
      if (!traiterValeur(raw)) return;
    } catch {
      setErreur("Aucun QR code lisible n'a été trouvé dans cette photo. Prenez une photo nette et bien éclairée du QR.");
    } finally {
      setScanningImage(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5" />
            Scanner une carte AgriCapital
          </DialogTitle>
          <DialogDescription>
            La caméra arrière se lance automatiquement. Placez simplement le QR code devant l’objectif.
          </DialogDescription>
        </DialogHeader>

        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-black">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay />
          {starting && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55">
              <div className="rounded-lg bg-background/95 px-4 py-3 text-center shadow-lg">
                <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-primary" />
                <p className="text-sm font-medium">Ouverture de la caméra…</p>
              </div>
            </div>
          )}
        </div>

        {erreur ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {erreur}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Lecture automatique haute fréquence : maintenez la carte imprimée devant l’objectif, même à quelques centimètres.
          </p>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button variant="outline" onClick={() => setEssai((n) => n + 1)} disabled={starting || scanningImage}>
            <RefreshCw className="mr-2 h-4 w-4" />Réessayer
          </Button>

          <label className="inline-flex">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => void scannerImage(event.target.files?.[0])}
              disabled={scanningImage}
            />
            <Button variant="secondary" className="w-full" asChild disabled={scanningImage}>
              <span>
                {scanningImage ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImageUp className="mr-2 h-4 w-4" />}
                Photo du QR
              </span>
            </Button>
          </label>

          {cameras.length > 1 ? (
            <Button variant="outline" onClick={changerCamera} disabled={starting}>
              <SwitchCamera className="mr-2 h-4 w-4" />Changer caméra
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Fermer</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ScanCarteDialog;
