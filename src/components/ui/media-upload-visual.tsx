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
const MAX_UPLOAD_VIDEO_SECONDS = 30 * 60;
const MAX_VISIT_MEDIA = 10;
const MAX_RECORD_VIDEO_SECONDS = 10 * 60;
const MAX_IMAGE_DIMENSION = 2560;

async function analyzeImage(file: File): Promise<{ hash: string; blurScore: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { hash: `${file.size}-${file.lastModified}`, blurScore: 999 };
    ctx.drawImage(bitmap, 0, 0, 64, 64);
    const { data, width, height } = ctx.getImageData(0, 0, 64, 64);
    const gray = new Float32Array(width * height);
    for (let i = 0; i < gray.length; i++) { const p = i * 4; gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]; }
    let lapMean = 0, lapCount = 0; const laplacians: number[] = [];
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const i = y * width + x; const lap = gray[i - width] + gray[i + width] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      laplacians.push(lap); lapMean += lap; lapCount++;
    }
    lapMean = lapCount ? lapMean / lapCount : 0;
    let variance = 0; for (const value of laplacians) variance += (value - lapMean) ** 2;
    variance = lapCount ? variance / lapCount : 0;
    const hc = document.createElement("canvas"); hc.width = 9; hc.height = 8;
    const hctx = hc.getContext("2d", { willReadFrequently: true });
    if (!hctx) return { hash: `${file.size}-${file.lastModified}`, blurScore: variance };
    hctx.drawImage(bitmap, 0, 0, 9, 8);
    const pixels = hctx.getImageData(0, 0, 9, 8).data;
    const g = (index: number) => { const p = index * 4; return 0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2]; };
    const bits: string[] = [];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits.push(g(y * 9 + x) > g(y * 9 + x + 1) ? "1" : "0");
    return { hash: bits.join(""), blurScore: variance };
  } finally { bitmap.close(); }
}

async function optimizeImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.size < 700 * 1024) return file;
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
    return new File([blob], `${stem}.webp`, { type: "image/webp", lastModified: Date.now() });
  } catch { return file; }
}

async function optimizeVideo(file: File): Promise<File> {
  if (!file.type.startsWith("video/")) return file;
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url; video.muted = true; video.playsInline = true; video.preload = "metadata";
  try {
    await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error("Vidéo illisible")); });
    if (video.duration > MAX_UPLOAD_VIDEO_SECONDS) throw new Error("Une vidéo téléversée ne peut pas dépasser 30 minutes.");
    if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) {
      throw new Error("Cet appareil ne permet pas de supprimer sûrement le son de cette vidéo. Essayez un navigateur récent.");
    }
    const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((v) => MediaRecorder.isTypeSupported(v));
    if (!mime) throw new Error("Format vidéo muet indisponible sur cet appareil.");
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, Math.round(video.videoWidth * scale / 2) * 2);
    canvas.height = Math.max(2, Math.round(video.videoHeight * scale / 2) * 2);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Impossible de préparer la vidéo.");
    const stream = canvas.captureStream(24); const chunks: BlobPart[] = [];
    const blob = await new Promise<Blob>((resolve, reject) => {
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_000_000 });
      let raf = 0; let settled = false;
      const cleanup = () => { cancelAnimationFrame(raf); stream.getTracks().forEach((track) => track.stop()); };
      const draw = () => { if (video.ended || video.paused) return; ctx.drawImage(video, 0, 0, canvas.width, canvas.height); raf = requestAnimationFrame(draw); };
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => { if (!settled) { settled = true; cleanup(); reject(new Error("Traitement vidéo impossible.")); } };
      recorder.onstop = () => { if (!settled) { settled = true; cleanup(); resolve(new Blob(chunks, { type: mime })); } };
      video.onended = () => { if (recorder.state !== "inactive") recorder.stop(); };
      recorder.start(1000); video.currentTime = 0;
      void video.play().then(draw).catch((error) => { if (recorder.state !== "inactive") recorder.stop(); reject(error); });
    });
    if (!blob.size) throw new Error("La vidéo traitée est vide.");
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.webm`, { type: mime, lastModified: Date.now() });
  } finally { URL.revokeObjectURL(url); video.pause(); video.src = ""; }
}

export default function MediaUploadVisual({
  label = "Photos / vidéos",
  files,
  onChange,
  multiple = true,
  accept = "image/*,video/*",
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [processing, setProcessing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [mediaError, setMediaError] = useState("");
  const [mediaDialogOpen, setMediaDialogOpen] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  const stopVideoRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  };

  const startVideoRecording = async () => {
    setMediaError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMediaError("L’enregistrement vidéo n’est pas pris en charge par cet appareil ou navigateur.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } }, audio: false });
      streamRef.current = stream;
      const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) { stream.getTracks().forEach((track) => track.stop()); streamRef.current = null; throw new Error("Format vidéo compatible indisponible."); }
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 900_000 });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => setMediaError("Une erreur est survenue pendant l’enregistrement vidéo.");
      recorder.onstop = () => {
        if (timerRef.current !== null) window.clearInterval(timerRef.current);
        timerRef.current = null;
        const blob = new Blob(chunks, { type: mimeType });
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        setRecordSeconds(0);
        if (blob.size) {
          const stamp = new Date().toISOString().replace(/[:.]/g, "-");
          const file = new File([blob], "video-technique-" + stamp + ".webm", { type: mimeType, lastModified: Date.now() });
          void addFiles([file]);
        }
      };
      recorderRef.current = recorder;
      setRecordSeconds(0);
      setRecording(true);
      recorder.start(1000);
      timerRef.current = window.setInterval(() => {
        setRecordSeconds((seconds) => {
          if (seconds + 1 >= MAX_RECORD_VIDEO_SECONDS) {
            window.setTimeout(() => stopVideoRecording(), 0);
            return MAX_RECORD_VIDEO_SECONDS;
          }
          return seconds + 1;
        });
      }, 1000);
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setRecording(false);
      setMediaError(error instanceof Error ? error.message : "Impossible d’accéder à la caméra vidéo.");
    }
  };

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  // Create object URLs only in an effect (never during render) and always
  // release them. This avoids leaking URLs and makes mobile Safari more stable.
  useEffect(() => {
    const next = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPreviews(next);
    return () => next.forEach(({ url }) => URL.revokeObjectURL(url));
  }, [files]);

  const addFiles = async (selected: File[]) => {
    if (!selected.length) return;
    setMediaError(""); setProcessing(true);
    try {
      const retained = [...files]; const imageHashes: string[] = [];
      const signatures = new Set(files.map((f) => `${f.type}:${f.size}:${f.lastModified}`));
      for (const existing of files.filter((f) => f.type.startsWith("image/"))) {
        try { imageHashes.push((await analyzeImage(existing)).hash); } catch { /* Keep existing media. */ }
      }
      let blurry = 0, duplicates = 0, overLimit = 0;
      for (const original of selected) {
        if (!original.type.startsWith("image/") && !original.type.startsWith("video/")) throw new Error(`${original.name} : seuls les photos et vidéos sont acceptées dans une visite.`);
        const signature = `${original.type}:${original.size}:${original.lastModified}`;
        if (signatures.has(signature)) { duplicates++; continue; }
        let candidate = original;
        if (original.type.startsWith("video/")) {
          const url = URL.createObjectURL(original);
          const duration = await new Promise<number>((resolve, reject) => {
            const v = document.createElement("video"); v.preload = "metadata";
            v.onloadedmetadata = () => { const d = v.duration; URL.revokeObjectURL(url); resolve(d); };
            v.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Vidéo illisible")); };
            v.src = url;
          });
          if (duration > MAX_UPLOAD_VIDEO_SECONDS) throw new Error(`${original.name} dépasse la durée maximale de 30 minutes.`);
          candidate = await optimizeVideo(original);
        } else {
          const analysis = await analyzeImage(original);
          if (analysis.blurScore < 35) { blurry++; continue; }
          const duplicate = imageHashes.some((hash) => {
            if (hash.length !== analysis.hash.length) return false;
            let distance = 0; for (let i = 0; i < hash.length; i++) if (hash[i] !== analysis.hash[i]) distance++;
            return distance <= 5;
          });
          if (duplicate) { duplicates++; continue; }
          imageHashes.push(analysis.hash); candidate = await optimizeImage(original);
        }
        if (retained.length >= MAX_VISIT_MEDIA) { overLimit++; continue; }
        retained.push(candidate); signatures.add(signature);
      }
      onChange(multiple ? retained : retained.slice(-1));
      const summary = [
        blurry ? `${blurry} photo(s) floue(s) écartée(s)` : "",
        duplicates ? `${duplicates} doublon(s) écarté(s)` : "",
        overLimit ? `${overLimit} média(s) ignoré(s) : limite de 10 atteinte` : "",
      ].filter(Boolean).join(" · ");
      setMediaError(summary || (retained.length >= MAX_VISIT_MEDIA ? "Limite atteinte : 10 photos et vidéos maximum pour cette visite." : ""));
    } catch (error) { setMediaError(error instanceof Error ? error.message : "Traitement média impossible."); }
    finally { setProcessing(false); }
  };

  const handlePickerChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // Copy File objects before clearing the native input so the same file can
    // be selected again. Stop propagation to keep surrounding forms/tabs inert.
    event.stopPropagation();
    const input = event.currentTarget;
    const selected = Array.from(input.files ?? []);
    input.value = "";
    void addFiles(selected);
  };

  return (
    <div className="space-y-2" onClick={(event) => event.stopPropagation()}>
      <p className="text-xs text-muted-foreground">{files.length}/{MAX_VISIT_MEDIA} médias retenus · photos et vidéos confondues</p>
      <label className="text-sm font-medium">{label}</label>
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={processing || files.length >= MAX_VISIT_MEDIA}
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
      <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={processing || files.length >= MAX_VISIT_MEDIA} onClick={(event)=>{event.preventDefault();event.stopPropagation();setMediaDialogOpen(true);}}>
        <Plus className="mr-2 h-4 w-4"/>Ajouter un média {files.length>0?(`(${files.length})`):""}
      </Button>
      <Dialog open={mediaDialogOpen} onOpenChange={setMediaDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ajouter des photos ou vidéos</DialogTitle>
            <DialogDescription>Sélectionnez plusieurs photos et vidéos en une seule fois. Les doublons et photos floues sont écartés, avec un maximum de 10 médias par visite.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Button type="button" variant="outline" className="w-full justify-start" onClick={(event)=>{event.preventDefault();event.stopPropagation();setMediaDialogOpen(false);cameraRef.current?.click();}}>
              <Camera className="mr-2 h-4 w-4"/>Prendre une photo
            </Button>
            <Button type="button" variant="outline" className="w-full justify-start" onClick={(event)=>{event.preventDefault();event.stopPropagation();setMediaDialogOpen(false);fileRef.current?.click();}}>
              <Upload className="mr-2 h-4 w-4"/>Importer depuis l’appareil
            </Button>
            <Button type="button" variant={recording?"destructive":"outline"} className="w-full justify-start" disabled={processing} onClick={(event)=>{event.preventDefault();event.stopPropagation();if(recording)stopVideoRecording();else void startVideoRecording();}}>
              {recording?<Square className="mr-2 h-4 w-4"/>:<Video className="mr-2 h-4 w-4"/>}
              {recording?"Arrêter la vidéo ("+String(Math.floor(recordSeconds/60)).padStart(2,"0")+":"+String(recordSeconds%60).padStart(2,"0")+")":"Enregistrer une vidéo"}
            </Button>
            {recording&&<p className="text-sm font-medium text-destructive">Enregistrement en cours. La limite est de 10 minutes.</p>}
            {processing&&<p className="text-sm text-muted-foreground">Optimisation des médias en cours…</p>}
            {mediaError&&<p role="alert" className="text-sm text-destructive">{mediaError}</p>}
          </div>
        </DialogContent>
      </Dialog>
      {recording && <p className="text-sm font-medium text-destructive">Enregistrement en cours · arrêt automatique à 10 minutes.</p>}
      {processing && <p className="text-sm text-muted-foreground">Optimisation des médias en cours…</p>}
      {mediaError && <p role="alert" className="text-sm text-destructive">{mediaError}</p>}
      {files.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {previews.map(({ file, url }, index) => (
            <div
              key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
              className="relative border rounded-lg overflow-hidden bg-muted"
            >
              {file.type.startsWith("video/") ? (
                <video src={url} controls muted playsInline className="w-full h-32 object-cover" />
              ) : file.type === "application/pdf" ? (
                <iframe title={file.name} src={url} className="w-full h-32" />
              ) : (
                <img src={url} alt={file.name} className="w-full h-32 object-cover" />
              )}
              <button
                type="button"
                aria-label={`Supprimer ${file.name}`}
                className="absolute top-1 right-1 rounded-full bg-background/90 p-1"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onChange(files.filter((_, itemIndex) => itemIndex !== index));
                }}
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
