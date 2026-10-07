/**
 * File d'attente des pièces jointes hors ligne (photos / documents).
 * Les blobs sont stockés dans IndexedDB puis uploadés vers Supabase Storage
 * automatiquement dès le retour du réseau.
 */
import { supabase } from '@/integrations/supabase/client';
import { STORES, putItem, getAllItems, deleteItem } from '@/lib/offlineDb';

export interface QueuedFile {
  id: string;
  bucket: string;
  path: string;
  blob: Blob;
  contentType: string;
  table?: string;
  record_id?: string;
  column?: string;
  status: 'pending' | 'error' | 'uploading';
  error?: string;
  retries: number;
  nextRetryAt: number;
  form_id?: string;
  field?: string;
  createdAt: number;
}

const MAX_IMAGE_SIZE = 1920;
const IMAGE_QUALITY = 0.78;

/** Compresse les photos terrain avant stockage local et envoi. Les PDF restent intacts. */
export async function compressAttachment(file: File | Blob): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, MAX_IMAGE_SIZE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', IMAGE_QUALITY));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

function genId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? (crypto as any).randomUUID()
    : 'f-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

/** Upload immédiat si en ligne, sinon mise en file dans IndexedDB. */
export async function uploadOrQueueFile(opts: {
  bucket: string;
  path: string;
  file: File | Blob;
  table?: string;
  record_id?: string;
  column?: string;
  form_id?: string;
  field?: string;
}): Promise<{ path: string; queued: boolean; error: any | null }> {
  const preparedFile = await compressAttachment(opts.file);
  const contentType = preparedFile.type || (opts.file as File).type || 'application/octet-stream';

  if (navigator.onLine) {
    const { error } = await supabase.storage
      .from(opts.bucket)
      .upload(opts.path, preparedFile, { upsert: true, contentType });
    if (!error) return { path: opts.path, queued: false, error: null };
    // Échec réseau → on met en file
  }

  const entry: QueuedFile = {
    id: genId(),
    bucket: opts.bucket,
    path: opts.path,
    blob: preparedFile,
    contentType,
    table: opts.table,
    record_id: opts.record_id,
    column: opts.column,
    form_id: opts.form_id,
    field: opts.field,
    status: 'pending',
    retries: 0,
    nextRetryAt: 0,
    createdAt: Date.now(),
  };
  await putItem(STORES.FILES, entry);
  return { path: opts.path, queued: true, error: null };
}

export async function getQueuedFiles(): Promise<QueuedFile[]> {
  const all = await getAllItems(STORES.FILES);
  return (all as QueuedFile[]).filter(f => f.status !== 'uploading');
}

/** Toutes les entrées de la file, y compris celles en cours (écran de suivi détaillé). */
export async function getAllQueuedFiles(): Promise<QueuedFile[]> {
  return (await getAllItems(STORES.FILES)) as QueuedFile[];
}

/** Remet une pièce jointe en attente immédiate (reprise manuelle). */
export async function retryQueuedFile(id: string): Promise<void> {
  const all = await getAllQueuedFiles();
  const f = all.find((x) => x.id === id);
  if (!f) return;
  await putItem(STORES.FILES, { ...f, status: 'pending', nextRetryAt: 0, error: undefined });
}

/** Relance toutes les pièces jointes en erreur. */
export async function retryAllQueuedFiles(): Promise<number> {
  const all = await getAllQueuedFiles();
  const failed = all.filter((f) => f.status === 'error' || f.nextRetryAt > Date.now());
  for (const f of failed) {
    await putItem(STORES.FILES, { ...f, status: 'pending', nextRetryAt: 0, error: undefined });
  }
  return failed.length;
}

/** Abandonne définitivement une pièce jointe. */
export async function discardQueuedFile(id: string): Promise<void> {
  await deleteItem(STORES.FILES, id);
}

/**
 * Rattache les fichiers déjà mis en file à l'enregistrement créé (association durable
 * conservée même après fermeture de l'app : elle est persistée dans IndexedDB).
 */
export async function bindQueuedFilesToRecord(opts: {
  form_id: string;
  table: string;
  record_id: string;
  columnByField?: Record<string, string>;
}): Promise<number> {
  const all = await getAllQueuedFiles();
  const mine = all.filter((f) => f.form_id === opts.form_id);
  for (const f of mine) {
    await putItem(STORES.FILES, {
      ...f,
      table: opts.table,
      record_id: opts.record_id,
      column: (f.field && opts.columnByField?.[f.field]) || f.column,
    });
  }
  return mine.length;
}

/** Statistiques de la file de fichiers (suivi des échecs / reprises). */
export async function getFileQueueStats(): Promise<{ pending: number; error: number; waiting: number; total: number }> {
  const all = await getAllQueuedFiles();
  const now = Date.now();
  return {
    total: all.length,
    error: all.filter((f) => f.status === 'error').length,
    waiting: all.filter((f) => f.nextRetryAt > now).length,
    pending: all.filter((f) => f.status === 'pending' && (!f.nextRetryAt || f.nextRetryAt <= now)).length,
  };
}

export async function countQueuedFiles(): Promise<number> {
  return (await getQueuedFiles()).length;
}

/** Vide la file d'attente des fichiers. Retourne le nombre d'uploads réussis. */
export async function flushFileQueue(): Promise<number> {
  if (!navigator.onLine) return 0;
  const files = (await getQueuedFiles()).filter((f) => !f.nextRetryAt || f.nextRetryAt <= Date.now());
  let ok = 0;

  for (const f of files) {
    try {
      const { error } = await supabase.storage
        .from(f.bucket)
        .upload(f.path, f.blob, { upsert: true, contentType: f.contentType });
      if (error) throw error;

      // Les photos de cartes passent par le traitement serveur après l'upload.
      let storedPath = f.path;
      if (f.bucket === 'cartes-personnel' && f.table === 'cartes_personnel' && f.record_id && f.column === 'photo_url') {
        const { data: processed, error: processingError } = await supabase.functions.invoke('process-card-photo', {
          body: { mode: 'single', cardId: f.record_id, sourcePath: f.path },
        });
        if (processingError || !processed?.path) {
          throw processingError || new Error('Traitement de la photo de carte échoué.');
        }
        storedPath = processed.path as string;
      }

      // Rattachement du chemin de stockage (jamais d'URL publique pour les buckets privés).
      if (f.table && f.record_id && f.column) {
        await (supabase as any)
          .from(f.table)
          .update({ [f.column]: storedPath })
          .eq('id', f.record_id);
      }

      await deleteItem(STORES.FILES, f.id);
      ok++;
    } catch (e: any) {
      const retries = (f.retries || 0) + 1;
      const delay = Math.min(60 * 60 * 1000, 15_000 * 2 ** Math.min(retries, 8));
      await putItem(STORES.FILES, {
        ...f,
        status: 'error',
        retries,
        nextRetryAt: Date.now() + delay,
        error: e?.message || 'Upload échoué',
      });
    }
  }
  return ok;
}

let resumeTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Reprise automatique persistante : relance la file au démarrage de l'app,
 * au retour du réseau et périodiquement — sans aucune action de l'utilisateur.
 */
export function startFileQueueResume(intervalMs = 60_000): () => void {
  const run = () => { flushFileQueue().catch(() => {}); };
  run();
  window.addEventListener('online', run);
  if (!resumeTimer) resumeTimer = setInterval(run, intervalMs);
  return () => {
    window.removeEventListener('online', run);
    if (resumeTimer) { clearInterval(resumeTimer); resumeTimer = null; }
  };
}