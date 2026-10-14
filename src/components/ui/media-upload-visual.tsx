import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Upload, X, Video, Square } from "lucide-react";

type Props = {
  label?: string;
  files: File[];
  onChange: (files: File[]) => void;
  multiple?: boolean;
  accept?: string;
};

type Preview = { file: File; url: string };
const MAX_UPLOAD_VIDEO_SECONDS = 30 * 60;
const MAX_RECORD_VIDEO_SECONDS = 10 * 60;
const MAX_IMAGE_DIMENSION = 2560;

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
    if (file.size < 12 * 1024 * 1024 || typeof MediaRecorder === "undefined" || !video.captureStream || !HTMLCanvasElement.prototype.captureStream) return file;
    const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((v) => MediaRecorder.isTypeSupported(v));
    if (!mime) return file;
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, Math.round(video.videoWidth * scale / 2) * 2);
    canvas.height = Math.max(2, Math.round(video.videoHeight * scale / 2) * 2);
    const ctx = canvas.getContext("2d"); if (!ctx) return file;
    const stream = canvas.captureStream(24);
    const sourceStream = video.captureStream(); sourceStream.getAudioTracks().forEach((track) => stream.addTrack(track));
    const chunks: BlobPart[] = [];
    const blob = await new Promise<Blob>((resolve, reject) => {
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_000_000, audioBitsPerSecond: 96_000 });
      let raf = 0;
      const draw = () => { if (video.ended || video.paused) return; ctx.drawImage(video, 0, 0, canvas.width, canvas.height); raf = requestAnimationFrame(draw); };
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => reject(new Error("Compression vidéo impossible"));
      recorder.onstop = () => { cancelAnimationFrame(raf); resolve(new Blob(chunks, { type: mime })); };
      video.onended = () => { if (recorder.state !== "inactive") recorder.stop(); };
      recorder.start(1000); video.currentTime = 0; void video.play().then(draw).catch(reject);
    });
    if (!blob.size || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.webm`, { type: mime, lastModified: Date.now() });
  } catch (error) { throw error; } finally { URL.revokeObjectURL(url); video.pause(); video.src = ""; }
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
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } }, audio: true });
      streamRef.current = stream;
      const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) { stream.getTracks().forEach((track) => track.stop()); streamRef.current = null; throw new Error("Format vidéo compatible indisponible."); }
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 900_000, audioBitsPerSecond: 64_000 });
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
          onChange(multiple ? [...files, file] : [file]);
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
    setProcessing(true);
    try {
      const optimized: File[] = [];
      for (const original of selected) {
        if (original.type.startsWith("video/")) {
          const url = URL.createObjectURL(original);
          try {
            const duration = await new Promise<number>((resolve, reject) => { const v = document.createElement("video"); v.preload = "metadata"; v.onloadedmetadata = () => { const d = v.duration; URL.revokeObjectURL(url); resolve(d); }; v.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Vidéo illisible")); }; v.src = url; });
            if (duration > MAX_UPLOAD_VIDEO_SECONDS) throw new Error(`${original.name} dépasse la durée maximale de 30 minutes.`);
          } catch (error) { throw error; }
          optimized.push(await optimizeVideo(original));
        } else optimized.push(await optimizeImage(original));
      }
      onChange(multiple ? [...files, ...optimized] : [optimized[0]]);
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
      <label className="text-sm font-medium">{label}</label>
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        multiple={multiple}
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            cameraRef.current?.click();
          }}
        >
          <Camera className="mr-2 h-4 w-4" />
          Prendre une photo
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            fileRef.current?.click();
          }}
        >
          <Upload className="mr-2 h-4 w-4" />
          Ajouter {multiple ? "des fichiers" : "un fichier"}
        </Button>
        <Button type="button" variant={recording ? "destructive" : "outline"} className="w-full" disabled={processing} onClick={(event) => { event.preventDefault(); event.stopPropagation(); if (recording) stopVideoRecording(); else void startVideoRecording(); }}>
          {recording ? <Square className="mr-2 h-4 w-4" /> : <Video className="mr-2 h-4 w-4" />}
          {recording ? "Arrêter la vidéo (" + String(Math.floor(recordSeconds / 60)).padStart(2, "0") + ":" + String(recordSeconds % 60).padStart(2, "0") + ")" : "Enregistrer une vidéo"}
        </Button>
      </div>
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
                <video src={url} controls className="w-full h-32 object-cover" />
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
