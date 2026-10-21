import { supabase } from '@/integrations/supabase/client';
import { uploadOrQueueFile } from '@/lib/offlineFiles';

/**
 * Uploads a file and returns its storage PATH only.
 * Never persist signed URLs in the database: they expire and, when long-lived,
 * act as permanent public links. Resolve a short-lived signed URL at display
 * time with `resolveStorageUrl` instead.
 */
/**
 * Compress large raster images before storage uploads. Keep originals when
 * decoding is unsupported or the encoded result would be larger; documents,
 * animated GIFs and videos are never re-encoded here.
 */
const compressImageForUpload = async (file: File): Promise<File> => {
  if (!file.type.startsWith("image/") || ["image/gif", "image/svg+xml"].includes(file.type) || file.size < 180 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    try {
      const maxDimension = 2560;
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) return file;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
      if (!blob || blob.size >= file.size) return file;
      const stem = file.name.replace(/\.[^.]+$/, "") || "image";
      return new File([blob], `${stem}.webp`, { type: "image/webp", lastModified: file.lastModified });
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
};

export const uploadFile = async (
  bucket: string,
  file: File,
  path?: string,
  stableObjectName?: string
): Promise<{ url: string; path: string } | null> => {
  try {
    const optimizedFile = await compressImageForUpload(file);
    const originalExtension = optimizedFile.name.includes('.') ? optimizedFile.name.split('.').pop() : '';
    const fileExt = (originalExtension || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'bin';
    const uniqueId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const safeStableName = stableObjectName?.trim().replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100);
    const fileName = safeStableName ? `${safeStableName}.${fileExt}` : `${uniqueId}.${fileExt}`;
    const { data: { session } } = await supabase.auth.getSession();
    const defaultFolder = session?.user?.id || 'public';
    const filePath = path ? `${path}/${fileName}` : `${defaultFolder}/${fileName}`;

    const result = await uploadOrQueueFile({ bucket, path: filePath, file: optimizedFile });
    if (result.error) throw result.error;

    return { url: result.path, path: result.path };
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error instanceof Error ? error : new Error('Le téléversement du fichier a échoué.');
  }
};

/**
 * Resolves a stored storage value to a usable URL.
 * New records store a path. Legacy records may contain public or signed
 * Supabase Storage URLs; those are converted back to a path and re-signed so
 * existing images continue to work after an old signed URL expires.
 */
export const resolveStorageUrl = async (
  bucket: string,
  value: string | null | undefined,
  expiresIn = 3600
): Promise<string | null> => {
  if (!value) return null;

  let path = value;
  if (/^https?:\/\//i.test(value)) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return value;
    }

    // Only trust Supabase Storage URLs. Arbitrary or malformed absolute URLs
    // are not valid object paths and must never be opened as if they were files.
    if (!parsed.hostname.endsWith('.supabase.co') && !parsed.hostname.endsWith('.supabase.in')) return null;
    const storageMatch = parsed.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
    if (!storageMatch) return null;
    let decodedBucket: string;
    try { decodedBucket = decodeURIComponent(storageMatch[1]); } catch { return null; }
    if (decodedBucket !== bucket) return null;
    try {
      path = storageMatch[2].split('/').map((segment) => decodeURIComponent(segment)).join('/');
    } catch {
      return null;
    }
  }

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) {
    console.warn('Unable to resolve stored media path', { bucket, path, error });
    return null;
  }
  return data.signedUrl;
};

export const deleteFile = async (bucket: string, path: string): Promise<boolean> => {
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([path]);

    if (error) {
      console.error('Delete error:', error);
      throw error;
    }

    return true;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
};

export const getFileUrl = (bucket: string, path: string): string => {
  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);

  return publicUrl;
};
