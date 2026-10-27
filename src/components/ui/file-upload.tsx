import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Upload, X, File, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  maxSize?: number;
  currentFile?: string;
  onRemove?: () => void;
  label?: string;
  disabled?: boolean;
}

const FileUpload = ({
  onFileSelect,
  accept = "image/*,application/pdf",
  maxSize = 5 * 1024 * 1024, // 5MB
  currentFile,
  onRemove,
  label = "Choisir un fichier",
  disabled = false,
}: FileUploadProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>("");
  const [preview, setPreview] = useState<string>("");
  const [previewType, setPreviewType] = useState<string>("");
  const [previewName, setPreviewName] = useState<string>("");
  useEffect(() => () => { if (preview.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError("");
    const maxSizeBytes = maxSize <= 100 ? maxSize * 1024 * 1024 : maxSize;

    if (!file) return;

    if (file.size > maxSizeBytes) {
      setError(`Le fichier est trop volumineux (max: ${Math.round(maxSizeBytes / 1024 / 1024)}MB)`);
      e.currentTarget.value = "";
      return;
    }

    setPreviewType(file.type || "application/octet-stream");
    setPreviewName(file.name);
    setPreview(URL.createObjectURL(file));
    onFileSelect(file);
    // Permet de sélectionner à nouveau le même fichier après remplacement ou erreur.
    e.currentTarget.value = "";
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleRemove = () => {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    setError("");
    setPreview(""); setPreviewType(""); setPreviewName("");
    onRemove?.();
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(e) => { e.stopPropagation(); handleFileChange(e); }}
        className="hidden"
        disabled={disabled}
      />
      
      {preview && (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center gap-2 text-sm font-medium"><FileText className="h-4 w-4 shrink-0"/><span className="min-w-0 flex-1 truncate">{previewName || currentFile || "Fichier sélectionné"}</span><span className="text-xs text-muted-foreground">Aperçu avant envoi</span></div>
          {previewType.startsWith("image/") ? <img src={preview} alt={previewName || "Aperçu de l’image"} className="w-full max-h-72 rounded border object-contain" /> : previewType.startsWith("video/") ? <video src={preview} controls preload="metadata" className="w-full max-h-72 rounded border" /> : previewType === "application/pdf" ? <iframe title={previewName || "Aperçu PDF"} src={preview} className="h-72 w-full rounded border" /> : previewType.startsWith("text/") ? <iframe title={previewName || "Aperçu du document"} src={preview} className="h-56 w-full rounded border" /> : <a href={preview} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-primary underline"><Eye className="h-4 w-4"/>Ouvrir / prévisualiser le document</a>}
        </div>
      )}
      {currentFile ? (
        <>
          <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-muted p-2">
            <File className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm">{currentFile}</span>
            {!disabled && <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Retirer le fichier" title="Retirer le fichier" onClick={handleRemove}><X className="h-4 w-4" /></Button>}
          </div>
          <Button type="button" variant="outline" size="icon" onClick={handleClick} disabled={disabled} aria-label="Remplacer le fichier" title="Remplacer le fichier" className="h-9 w-9 rounded-full border-emerald-700 text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900"><Upload className="h-4 w-4" /></Button>
        </>
      ) : (
        <Button type="button" variant="outline" size="icon" onClick={handleClick} disabled={disabled} aria-label={label} title={label} className="h-9 w-9 rounded-full border-emerald-700 text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900"><Upload className="h-4 w-4" /></Button>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
};

export default FileUpload;
