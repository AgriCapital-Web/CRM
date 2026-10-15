import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Camera, Upload, X, Video, Square, Plus } from "lucide-react";

type Props = {
  label?: string;
  files: File[];
  onChange: (files: File[]) => void;
  multiple?: boolean;
  accept?: string;
};

type Preview = { file: File; url: string };
type AnalyzedCandidate = {
  source: File;
  prepared: File;
  fingerprints: string[];
  quality: number;
  order: number;
};

const MAX_UPLOAD_VIDEO_SECONDS = 30 * 60;
const MAX_VISIT_MEDIA = 10;
const MAX_CANDIDATES = 50;
const MAX_RECORD_VIDEO_SECONDS = 10 * 60;
const MAX_IMAGE_DIMENSION = 2560;
const MAX_VIDEO_DIMENSION = 1280;

function canvasFingerprint(source: CanvasImageSource, sourceWidth: number, sourceHeight: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { hash: "", sharpness: 0 };
  ctx.drawImage(source, 0, 0, 64, 64);
  const { data } = ctx.getImageData(0, 0, 64, 64);
  const gray = new Float32Array(64 * 64);
  for (let i = 0; i < gray.length; i++) {
    const p = i * 4;
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  let mean = 0;
  const laplacians: number[] = [];
  for (let y = 1; y < 63; y++) {
    for (let x = 1; x < 63; x++) {
      const i = y * 64 + x;
      const lap = gray[i - 64] + gray[i + 64] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      laplacians.push(lap);
      mean += lap;
    }
  }
  mean /= Math.max(1, laplacians.length);
  let variance = 0;
  for (const value of laplacians) variance += (value - mean) ** 2;
  variance /= Math.max(1, laplacians.length);

  const hashCanvas = document.createElement("canvas");
  hashCanvas.width = 9;
  hashCanvas.height = 8;
  const hashContext = hashCanvas.getContext("2d", { willReadFrequently: true });
  if (!hashContext) return { hash: "", sharpness: variance };
  hashContext.drawImage(source, 0, 0, 9, 8);
  const pixels = hashContext.getImageData(0, 0, 9, 8).data;
  const luminance = (index: number) => {
    const p = index * 4;
    return 0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2];
  };
  const bits: string[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits.push(luminance(y * 9 + x) > luminance(y * 9 + x + 1) ? "1" : "0");
    }
  }
  // Keep source dimensions in the signature so invalid/empty frames cannot look identical.
  return { hash: bits.join(""), sharpness: variance + Math.min(1, (sourceWidth * sourceHeight) / 1_000_000) * 0.001 };
}

function hammingDistance(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return Number.MAX_SAFE_INTEGER;
  let distance = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) distance++;
  return distance;
}

function areNearDuplicates(a: string[], b: string[]) {
  if (!a.length || !b.length) return false;
  const compared = Math.min(a.length, b.length);
  let matches = 0;
  for (let i = 0; i < compared; i++) {
    if (hammingDistance(a[i], b[i]) <= 5) matches++;
  }
  return matches >= (compared === 1 ? 1 : 2);
}

async function analyzeImage(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    const result = canvasFingerprint(bitmap, bitmap.width, bitmap.height);
    return { fingerprints: [result.hash], quality: result.sharpness };
  } finally {
    bitmap.close();
  }
}

async function loadVideo(file: File) {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("video-unreadable"));
    });
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.duration > MAX_UPLOAD_VIDEO_SECONDS) {
      throw new Error("video-duration");
    }
    return { video, url };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function analyzeVideo(file: File) {
  const { video, url } = await loadVideo(file);
  try {
    const fingerprints: string[] = [];
    const qualities: number[] = [];
    const samplePoints = video.duration < 3 ? [0.2, 0.7] : [0.15, 0.5, 0.85];
    for (const point of samplePoints) {
      const target = Math.min(Math.max(0, video.duration - 0.05), Math.max(0.01, video.duration * point));
      if (Math.abs(video.currentTime - target) > 0.04) {
        await new Promise<void>((resolve, reject) => {
          const onSeeked = () => { cleanup(); resolve(); };
          const onError = () => { cleanup(); reject(new Error("video-unreadable")); };
          const cleanup = () => {
            video.removeEventListener("seeked", onSeeked);
            video.removeEventListener("error", onError);
          };
          video.addEventListener("seeked", onSeeked, { once: true });
          video.addEventListener("error", onError, { once: true });
          video.currentTime = target;
        });
      }
      if (video.videoWidth && video.videoHeight && video.readyState >= 2) {
        const frame = canvasFingerprint(video, video.videoWidth, video.videoHeight);
        fingerprints.push(frame.hash);
        qualities.push(frame.sharpness);
      }
    }
    if (!fingerprints.length) throw new Error("video-unreadable");
    return {
      fingerprints,
      quality: qualities.reduce((sum, value) => sum + value, 0) / qualities.length,
      duration: video.duration,
    };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

async function optimizeImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.size < 150 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) { bitmap.close(); return file; }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.88));
    if (!blob || blob.size >= file.size) return file;
    const stem = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${stem}.webp`, { type: "image/webp", lastModified: file.lastModified });
  } catch {
    return file;
  }
}

/**
 * Re-encode video from a muted source into a canvas-only WebM stream.
 * The captured stream contains video only: original audio is never copied.
 * If this browser cannot transcode reliably, the item is quietly omitted
 * instead of uploading a large, unoptimized source or leaking its audio.
 */
async function optimizeVideo(file: File): Promise<File> {
  const { video, url } = await loadVideo(file);
  let canvasStream: MediaStream | null = null;
  let frameRequest = 0;
  try {
    const scale = Math.min(1, MAX_VIDEO_DIMENSION / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, Math.round(video.videoWidth * scale / 2) * 2);
    canvas.height = Math.max(2, Math.round(video.videoHeight * scale / 2) * 2);
    const ctx = canvas.getContext("2d");
    if (!ctx || typeof canvas.captureStream !== "function" || typeof MediaRecorder === "undefined") {
      throw new Error("video-transcode-unavailable");
    }
    const mimeType = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ].find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error("video-transcode-unavailable");

    canvasStream = canvas.captureStream(24);
    const recorder = new MediaRecorder(canvasStream, { mimeType, videoBitsPerSecond: 1_000_000 });
    const chunks: BlobPart[] = [];
    const recorded = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => reject(new Error("video-transcode-failed"));
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        if (!blob.size) reject(new Error("video-transcode-failed"));
        else resolve(blob);
      };
    });
    const drawFrame = () => {
      if (video.readyState >= 2 && ctx) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      if (!video.ended && !video.paused) frameRequest = requestAnimationFrame(drawFrame);
    };
    await new Promise<void>((resolve, reject) => {
      video.onended = () => resolve();
      video.onerror = () => reject(new Error("video-transcode-failed"));
      video.currentTime = 0;
      void video.play().then(() => {
        recorder.start(1000);
        drawFrame();
      }).catch(() => reject(new Error("video-transcode-failed")));
    });
    if (recorder.state !== "inactive") recorder.stop();
    const blob = await recorded;
    const stamp = file.lastModified || Date.now();
    const stem = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${stem}.webm`, { type: "video/webm", lastModified: stamp });
  } finally {
    cancelAnimationFrame(frameRequest);
    video.pause();
    video.removeAttribute("src");
    video.load();
    canvasStream?.getTracks().forEach((track) => track.stop());
    URL.revokeObjectURL(url);
  }
}

export default function MediaUploadVisual({
  label = "Photos / vidéos",
  files,
  onChange,
  multiple = true,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [processing, setProcessing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [mediaError, setMediaError] = useState("");
  const [mediaDialogOpen, setMediaDialogOpen] = useState(false);
  const [candidatePool, setCandidatePool] = useState<AnalyzedCandidate[]>([]);
  const [selectionCount, setSelectionCount] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const candidatePoolRef = useRef<AnalyzedCandidate[]>([]);
  const selectionCountRef = useRef(0);

  const syncPool = (next: AnalyzedCandidate[]) => {
    candidatePoolRef.current = next;
    setCandidatePool(next);
    const ranked = [...next].sort((a, b) => b.quality - a.quality || a.order - b.order);
    onChange(ranked.slice(0, MAX_VISIT_MEDIA).map((item) => item.prepared));
  };

  const stopVideoRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  };

  const openVideoCamera = async (facing: "environment" | "user" = facingMode) => {
    setMediaError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMediaError("La caméra vidéo n’est pas prise en charge sur cet appareil.");
      return;
    }
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } },
        audio: false,
      });
      streamRef.current = stream;
      setFacingMode(facing);
      setCameraOpen(true);
      window.setTimeout(() => {
        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = stream;
          void videoPreviewRef.current.play().catch(() => undefined);
        }
      }, 0);
    } catch (error: any) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setCameraOpen(false);
      setMediaError(error?.name === "NotAllowedError" ? "Autorisez l’accès à la caméra dans les réglages du navigateur." : "Impossible d’ouvrir la caméra vidéo. Vérifiez les autorisations de l’appareil.");
    }
  };

  const startVideoRecording = async () => {
    setMediaError("");
    const stream = streamRef.current;
    if (!stream || !cameraOpen) {
      await openVideoCamera("environment");
      return;
    }
    try {
      const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error("Format vidéo non pris en charge sur cet appareil.");
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 900_000 });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => setMediaError("Enregistrement vidéo impossible. Réessayez.");
      recorder.onstop = () => {
        if (timerRef.current !== null) window.clearInterval(timerRef.current);
        timerRef.current = null;
        const blob = new Blob(chunks, { type: mimeType });
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (videoPreviewRef.current) videoPreviewRef.current.srcObject = null;
        recorderRef.current = null;
        setRecording(false);
        setCameraOpen(false);
        setRecordSeconds(0);
        if (blob.size) {
          const stamp = new Date().toISOString().replace(/[:.]/g, "-");
          void addFiles([new File([blob], `video-technique-${stamp}.webm`, { type: mimeType, lastModified: Date.now() })]);
        }
      };
      recorderRef.current = recorder;
      setRecordSeconds(0);
      setRecording(true);
      recorder.start(1000);
      timerRef.current = window.setInterval(() => {
        setRecordSeconds((seconds) => {
          if (seconds + 1 >= MAX_RECORD_VIDEO_SECONDS) window.setTimeout(() => stopVideoRecording(), 0);
          return Math.min(MAX_RECORD_VIDEO_SECONDS, seconds + 1);
        });
      }, 1000);
    } catch (error: any) {
      setMediaError(error?.message || "Enregistrement vidéo impossible.");
    }
  };

  const closeVideoCamera = () => {
    if (recording) return;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoPreviewRef.current) videoPreviewRef.current.srcObject = null;
    setCameraOpen(false);
  };

  const switchCamera = async () => {
    if (recording) {
      setMediaError("Arrêtez l’enregistrement avant de changer de caméra.");
      return;
    }
    await openVideoCamera(facingMode === "environment" ? "user" : "environment");
  };

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    const next = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPreviews(next);
    return () => next.forEach(({ url }) => URL.revokeObjectURL(url));
  }, [files]);

  // Rehydrate the local candidate pool when the parent already has selected files.
  useEffect(() => {
    if (!candidatePoolRef.current.length && files.length) {
      const seeded = files.map((file, order) => ({
        source: file, prepared: file, fingerprints: [], quality: 1, order,
      }));
      candidatePoolRef.current = seeded;
      setCandidatePool(seeded);
    }
  }, [files]);

  const addFiles = async (selected: File[]) => {
    if (!selected.length || processing) return;
    setMediaError("");
    setProcessing(true);
    try {
      const room = Math.max(0, MAX_CANDIDATES - selectionCountRef.current);
      const batch = selected.slice(0, room);
      selectionCountRef.current += batch.length;
      setSelectionCount(selectionCountRef.current);
      const next = [...candidatePoolRef.current];
      let nextOrder = next.reduce((max, item) => Math.max(max, item.order), -1) + 1;

      for (const original of batch) {
        if (!original.type.startsWith("image/") && !original.type.startsWith("video/")) continue;
        const signature = `${original.type}:${original.size}:${original.lastModified}:${original.name}`;
        const exactDuplicate = next.some((item) => `${item.source.type}:${item.source.size}:${item.source.lastModified}:${item.source.name}` === signature);
        if (exactDuplicate) continue;

        try {
          let fingerprints: string[] = [];
          let quality = 0;
          let prepared: File;
          if (original.type.startsWith("image/")) {
            const analysis = await analyzeImage(original);
            fingerprints = analysis.fingerprints;
            quality = analysis.quality;
            // A conservative threshold: reject clearly out-of-focus images only.
            if (quality < 35) continue;
            if (next.some((item) => item.source.type.startsWith("image/") && areNearDuplicates(item.fingerprints, fingerprints))) continue;
            prepared = await optimizeImage(original);
          } else {
            const analysis = await analyzeVideo(original);
            fingerprints = analysis.fingerprints;
            quality = analysis.quality;
            if (quality < 18) continue;
            if (next.some((item) => item.source.type.startsWith("video/") && areNearDuplicates(item.fingerprints, fingerprints))) continue;
            prepared = await optimizeVideo(original);
          }
          next.push({ source: original, prepared, fingerprints, quality, order: nextOrder++ });
        } catch {
          // Ineligible/corrupt media are silently excluded before any upload or database write.
        }
      }
      syncPool(next);
      setMediaError("");
    } finally {
      setProcessing(false);
    }
  };

  const handlePickerChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    event.stopPropagation();
    const input = event.currentTarget;
    const selected = Array.from(input.files ?? []);
    input.value = "";
    void addFiles(selected);
  };

  const removeFile = (index: number) => {
    const fileToRemove = files[index];
    const next = candidatePoolRef.current.filter((item) => item.prepared !== fileToRemove);
    syncPool(next);
  };

  return (
    <div className="space-y-2" onClick={(event) => event.stopPropagation()}>
      <p className="text-xs text-muted-foreground">{files.length}/{MAX_VISIT_MEDIA} médias prêts · photos et vidéos confondues</p>
      <label className="text-sm font-medium">{label}</label>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        multiple={multiple}
        disabled={processing || selectionCount >= MAX_CANDIDATES}
        className="hidden"
        onClick={(event) => event.stopPropagation()}
        onChange={handlePickerChange}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onClick={(event) => event.stopPropagation()}
        onChange={handlePickerChange}
      />
      <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={processing || selectionCount >= MAX_CANDIDATES} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setMediaDialogOpen(true); }}>
        <Plus className="mr-2 h-4 w-4" />Ajouter des médias {files.length ? `(${files.length})` : ""}
      </Button>
      <Dialog open={mediaDialogOpen} onOpenChange={(open) => { setMediaDialogOpen(open); document.body.classList.toggle("media-dialog-open", open); if (!open && !recording) closeVideoCamera(); }}>
        <DialogContent className="z-[101] max-w-sm">
          <style>{`[data-radix-dialog-overlay] { z-index: 100 !important; } body.media-dialog-open [data-floating-ai-assistant] { display: none !important; }`}</style>
          <DialogHeader>
            <DialogTitle>Ajouter des photos ou vidéos</DialogTitle>
            <DialogDescription>Vous pouvez sélectionner jusqu’à 50 fichiers. Ils sont analysés et optimisés automatiquement avant tout envoi.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Button type="button" variant="outline" className="w-full justify-start" disabled={processing} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setMediaDialogOpen(false); cameraRef.current?.click(); }}>
              <Camera className="mr-2 h-4 w-4" />Prendre une photo
            </Button>
            <Button type="button" variant="outline" className="w-full justify-start" disabled={processing} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setMediaDialogOpen(false); fileRef.current?.click(); }}>
              <Upload className="mr-2 h-4 w-4" />Importer depuis l’appareil
            </Button>
            {!cameraOpen && <Button type="button" variant="outline" className="w-full justify-start" disabled={processing} onClick={(event) => { event.preventDefault(); event.stopPropagation(); void openVideoCamera("environment"); }}>
              <Video className="mr-2 h-4 w-4" />Ouvrir la caméra vidéo
            </Button>}
            {cameraOpen && <div className="space-y-2 rounded-lg border p-2">
              <video ref={videoPreviewRef} autoPlay muted playsInline className="aspect-video w-full rounded-md bg-black object-contain" />
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" disabled={recording || processing} onClick={(event) => { event.preventDefault(); event.stopPropagation(); void switchCamera(); }}>
                  <Camera className="mr-2 h-4 w-4" />{facingMode === "environment" ? "Caméra avant" : "Caméra arrière"}
                </Button>
                <Button type="button" variant={recording ? "destructive" : "default"} disabled={processing} onClick={(event) => { event.preventDefault(); event.stopPropagation(); if (recording) stopVideoRecording(); else void startVideoRecording(); }}>
                  {recording ? <Square className="mr-2 h-4 w-4" /> : <Video className="mr-2 h-4 w-4" />}
                  {recording ? "Arrêter (" + String(Math.floor(recordSeconds / 60)).padStart(2, "0") + ":" + String(recordSeconds % 60).padStart(2, "0") + ")" : "Démarrer l’enregistrement"}
                </Button>
              </div>
              {!recording && <Button type="button" variant="ghost" className="w-full" onClick={(event) => { event.preventDefault(); event.stopPropagation(); closeVideoCamera(); }}>Fermer la caméra</Button>}
              {recording && <p className="text-sm font-medium text-destructive">Enregistrement en cours · arrêt automatique à 10 minutes.</p>}
            </div>}
            {processing && <p className="text-sm text-muted-foreground">Analyse et optimisation en cours…</p>}
            {mediaError && <p role="status" className="text-sm text-muted-foreground">{mediaError}</p>}
          </div>
        </DialogContent>
      </Dialog>
      {recording && <p className="text-sm font-medium text-destructive">Enregistrement en cours · arrêt automatique à 10 minutes.</p>}
      {processing && <p className="text-sm text-muted-foreground">Analyse et optimisation en cours…</p>}
      {files.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {previews.map(({ file, url }, index) => (
            <div key={`${file.name}-${file.size}-${file.lastModified}-${index}`} className="relative border rounded-lg overflow-hidden bg-muted">
              {file.type.startsWith("video/") ? (
                <video src={url} controls muted playsInline className="w-full h-32 object-cover" />
              ) : (
                <img src={url} alt={file.name} className="w-full h-32 object-cover" />
              )}
              <button
                type="button"
                aria-label="Retirer ce média"
                className="absolute top-1 right-1 rounded-full bg-background/90 p-1"
                onClick={(event) => { event.preventDefault(); event.stopPropagation(); removeFile(index); }}
              >
                <X className="h-4 w-4" />
              </button>
              <p className="truncate text-xs p-1">{file.name}</p>
              <p className="px-1 pb-1 text-[11px] text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(1)} Mo</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
