import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Upload, X } from "lucide-react";

type Props = {
  label?: string;
  files: File[];
  onChange: (files: File[]) => void;
  multiple?: boolean;
  accept?: string;
};

type Preview = { file: File; url: string };

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

  // Create object URLs only in an effect (never during render) and always
  // release them. This avoids leaking URLs and makes mobile Safari more stable.
  useEffect(() => {
    const next = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPreviews(next);
    return () => next.forEach(({ url }) => URL.revokeObjectURL(url));
  }, [files]);

  const addFiles = (selected: File[]) => {
    if (!selected.length) return;
    onChange(multiple ? [...files, ...selected] : [selected[0]]);
  };

  const handlePickerChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // Copy File objects before clearing the native input so the same file can
    // be selected again. Stop propagation to keep surrounding forms/tabs inert.
    event.stopPropagation();
    const input = event.currentTarget;
    const selected = Array.from(input.files ?? []);
    input.value = "";
    addFiles(selected);
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
      </div>
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
