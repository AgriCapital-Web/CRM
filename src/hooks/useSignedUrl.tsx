import { ImgHTMLAttributes, useEffect, useState } from "react";
import { resolveStorageUrl } from "@/utils/storage";

type SignedImgProps = {
  bucket: string;
  value: string | null | undefined;
  expiresIn?: number;
} & Omit<ImgHTMLAttributes<HTMLImageElement>, "src">;

/** <img> that resolves a storage path to a fresh short-lived signed URL. */
export const SignedImg = ({ bucket, value, expiresIn, alt = "", ...rest }: SignedImgProps) => {
  const url = useSignedUrl(bucket, value, expiresIn);
  if (!url) return null;
  return <img src={url} alt={alt} {...rest} />;
};

/**
 * Resolves a stored storage path (or legacy full URL) to a fresh short-lived
 * signed URL at display time. Returns null while resolving or on error.
 */
export const useSignedUrl = (
  bucket: string,
  value: string | null | undefined,
  expiresIn = 3600
): string | null => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setUrl(null);
      return;
    }
    resolveStorageUrl(bucket, value, expiresIn).then((resolved) => {
      if (!cancelled) setUrl(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [bucket, value, expiresIn]);

  return url;
};
