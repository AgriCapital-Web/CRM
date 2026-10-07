/**
 * Traitement automatique de la photo d'une carte du personnel.
 *
 * La photo fournie est nettoyée (normalisation lumière/contraste, fond neutre),
 * recadrée au format portrait 3:4 centré sur le haut du sujet, redimensionnée
 * puis stockée dans le bucket privé `cartes-personnel`. Seul le chemin de
 * l'objet est conservé en base (URL signée courte à l'affichage).
 */
import { supabase } from "@/integrations/supabase/client";

export const CARTE_BUCKET = "cartes-personnel";

const TARGET_W = 1200;
const TARGET_H = 1600;

const loadImage = (file: File | Blob) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });

/** Normalise la luminosité/contraste d'un ImageData (auto-levels doux). */
const autoLevels = (data: ImageData) => {
  const px = data.data;
  let min = 255;
  let max = 0;
  for (let i = 0; i < px.length; i += 4) {
    const l = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
    if (l < min) min = l;
    if (l > max) max = l;
  }
  const range = Math.max(max - min, 1);
  if (range >= 245) return data;
  const scale = 255 / range;
  for (let i = 0; i < px.length; i += 4) {
    px[i] = Math.min(255, Math.max(0, (px[i] - min) * scale));
    px[i + 1] = Math.min(255, Math.max(0, (px[i + 1] - min) * scale));
    px[i + 2] = Math.min(255, Math.max(0, (px[i + 2] - min) * scale));
  }
  return data;
};

/** Retourne un JPEG nettoyé et recadré 3:4 prêt pour l'impression de la carte. */
export async function traiterPhotoCarte(file: File | Blob): Promise<Blob> {
  const img = await loadImage(file);
  const ratio = TARGET_W / TARGET_H;

  // Recadrage centré (légèrement remonté pour cadrer le visage)
  let sw = img.width;
  let sh = img.width / ratio;
  if (sh > img.height) {
    sh = img.height;
    sw = img.height * ratio;
  }
  const sx = (img.width - sw) / 2;
  const sy = Math.max(0, (img.height - sh) * 0.35);

  const canvas = document.createElement("canvas");
  canvas.width = TARGET_W;
  canvas.height = TARGET_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas non disponible");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, TARGET_W, TARGET_H);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, TARGET_W, TARGET_H);

  const data = ctx.getImageData(0, 0, TARGET_W, TARGET_H);
  ctx.putImageData(autoLevels(data), 0, 0);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Échec du traitement"))), "image/jpeg", 0.9),
  );
}

/** Stocke l'original privé puis confie le détourage et le fond uniforme au serveur. */
export async function uploaderPhotoCarte(profileId: string, carteId: string, file: File | Blob): Promise<string> {
  const blob = await traiterPhotoCarte(file);
  const path = `originals/${profileId}/${Date.now()}.jpg`;
  const { uploadOrQueueFile } = await import("@/lib/offlineFiles");
  const queued = await uploadOrQueueFile({
    bucket: CARTE_BUCKET,
    path,
    file: blob,
    table: "cartes_personnel",
    record_id: carteId,
    column: "photo_url",
    field: "photo_url",
  });

  if (queued.error) throw queued.error;
  if (queued.queued) {
    // La photo sera traitée par l'Edge Function au retour du réseau.
    return path;
  }

  const { data, error: processingError } = await supabase.functions.invoke("process-card-photo", {
    body: { mode: "single", cardId: carteId, sourcePath: path },
  });
  if (processingError) throw processingError;
  if (!data?.path) throw new Error(data?.error || "La photo n'a pas pu être traitée.");
  return data.path as string;
}
