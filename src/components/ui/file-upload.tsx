import { useRef, useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Upload, X, File } from "lucide-react";
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError("");
    const maxSizeBytes = maxSize <= 100 ? maxSize * 1024 * 1024 : maxSize;

    if (!file) return;

    if (file.size > maxSizeBytes) {
      setError(`Le fichier est trop volumineux (max: ${Math.round(maxSizeBytes / 1024 / 1024)}MB)`);
      return;
    }

    setPreviewType(file.type);
    const reader=new FileReader(); reader.onload=()=>setPreview(String(reader.result||"")); reader.readAsDataURL(file);
    onFileSelect(file);
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleRemove = () => {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    setError("");
    setPreview(""); setPreviewType("");
    onRemove?.();
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
      />
      
      {currentFile ? (
        <div className="space-y-2">{preview && (previewType.startsWith("image/") ? <img src={preview} alt="Aperçu" className="w-full max-h-56 object-contain rounded border" /> : previewType.startsWith("video/") ? <video src={preview} controls className="w-full max-h-56 rounded border" /> : previewType==="application/pdf" ? <iframe title="Aperçu PDF" src={preview} className="w-full h-56 rounded border" /> : <div className="flex items-center gap-2 text-sm text-muted-foreground"><FileText className="h-4 w-4"/>Document sélectionné</div>)}</div>
      ) : null}

      {currentFile ? (
        <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted">
          <File className="h-5 w-5 text-muted-foreground" />
          <span className="flex-1 text-sm truncate">{currentFile}</span>
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={handleClick}
          disabled={disabled}
          className="w-full"
        >
          <Upload className="mr-2 h-4 w-4" />
          {label}
        </Button>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
};

export default FileUpload;
