import { supabase } from '@/integrations/supabase/client';
import { uploadOrQueueFile } from '@/lib/offlineFiles';

/**
 * Uploads a file and returns its storage PATH only.
 * Never persist signed URLs in the database: they expire and, when long-lived,
 * act as permanent public links. Resolve a short-lived signed URL at display
 * time with `resolveStorageUrl` instead.
 */
export const uploadFile = async (
  bucket: string,
  file: File,
  path?: string
): Promise<{ url: string; path: string } | null> => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
    const { data: { session } } = await supabase.auth.getSession();
    const defaultFolder = session?.user?.id || 'public';
    const filePath = path ? `${path}/${fileName}` : `${defaultFolder}/${fileName}`;

    const result = await uploadOrQueueFile({ bucket, path: filePath, file });
    if (result.error) throw result.error;

    return { url: result.path, path: result.path };
  } catch (error) {
    console.error('Error uploading file:', error);
    return null;
  }
};

/**
 * Resolves a stored storage value to a usable URL.
 * - Full http(s) URLs (legacy rows) are returned as-is.
 * - Storage paths get a fresh short-lived signed URL (default 1 hour).
 */
export const resolveStorageUrl = async (
  bucket: string,
  value: string | null | undefined,
  expiresIn = 3600
): Promise<string | null> => {
  if (!value) return null;
  if (value.startsWith('http')) return value;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(value, expiresIn);
  if (error || !data?.signedUrl) return null;
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
