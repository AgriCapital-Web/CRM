import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ScanText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, X, Upload, FileText } from "lucide-react";

const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

interface FileUploadVisualProps {
  label: string;
  field: string;
  accept?: string;
  required?: boolean;
  currentFile?: File | null;
  currentPreview?: string;
  existingPreview?: string;
  onFileChange: (field: string, file: File | null, preview: string) => void;
  onIdentityNumberDetected?: (numero: string) => void;
  identityDocumentType?: string;
  compact?: boolean;
}

export const FileUploadVisual = ({
  label,
  field,
  accept = "image/jpeg,image/png,application/pdf",
  required = false,
  currentFile,
  currentPreview,
  existingPreview,
  onFileChange,
  onIdentityNumberDetected,
  identityDocumentType,
  compact = false,
}: FileUploadVisualProps) => {
  const [preview, setPreview] = useState<string>(currentPreview || existingPreview || "");
  const [existingCleared, setExistingCleared] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrMessage, setOcrMessage] = useState("");
  const [fileError, setFileError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const readSequenceRef = useRef(0);

  // A parent reset (new record / cleared draft) must clear stale local previews too.
  useEffect(() => {
    setExistingCleared(false);
    if (!currentPreview) setPreview(existingPreview || "");
  }, [existingPreview]);

  useEffect(() => {
    if (currentPreview) setPreview(currentPreview);
    else if (!existingCleared) setPreview(existingPreview || "");
  }, [currentPreview, existingPreview, existingCleared]);

  const handleFileSelect = (file: File | null) => {
    if (!file) return;
    setExistingCleared(true);
    const sequence = ++readSequenceRef.current;
    setFileError("");
    setOcrMessage("");

    // Store the File immediately. A slow FileReader must not leave the form
    // with a visible selection that is absent from the parent's submit state.
    onFileChange(field, file, "");
    const reader = new FileReader();
    reader.onload = () => {
      if (sequence !== readSequenceRef.current) return;
      const previewUrl = String(reader.result || "");
      setPreview(previewUrl);
      onFileChange(field, file, previewUrl);
    };
    reader.onerror = () => {
      if (sequence !== readSequenceRef.current) return;
      setFileError("Impossible de lire ce fichier. Réessayez avec un autre fichier.");
    };
    reader.readAsDataURL(file);

    if (onIdentityNumberDetected && file.type.startsWith("image/")) {
      setOcrLoading(true);
      setOcrMessage("Lecture automatique de la pièce…");
      void fileToDataUrl(file).then(async (imageDataUrl) => {
        const { data, error } = await supabase.functions.invoke("analyze-id-document", {
          body: { imageDataUrl, documentType: identityDocumentType },
        });
        if (sequence !== readSequenceRef.current) return;
        if (!error && data?.numero_piece) {
          onIdentityNumberDetected(String(data.numero_piece));
          setOcrMessage(data?.confiance >= 0.8
            ? "Numéro détecté automatiquement."
            : "Numéro détecté — vérifiez-le avant validation.");
        } else {
          setOcrMessage("Lecture automatique indisponible : saisissez le numéro si nécessaire.");
        }
      }).catch(() => {
        if (sequence === readSequenceRef.current) setOcrMessage("Lecture automatique indisponible : saisissez le numéro si nécessaire.");
      }).finally(() => {
        if (sequence === readSequenceRef.current) setOcrLoading(false);
      });
    }
  };

  const clearFile = () => {
    readSequenceRef.current += 1;
    setPreview("");
    setExistingCleared(true);
    setFileError("");
    setOcrLoading(false);
    setOcrMessage("");
    onFileChange(field, null, "");
    if (inputRef.current) inputRef.current.value = "";
  };

  // A single native picker supports gallery/file selection and, on mobile,
  // the camera option offered by the operating system. No competing inputs.
  const openPicker = () => inputRef.current?.click();
  const isImage = currentFile?.type?.startsWith("image/") || preview.startsWith("data:image");
  const isVideo = currentFile?.type?.startsWith("video/") || preview.startsWith("data:video");

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      {!compact && <Label>{label} {required && "*"}</Label>}

      {/* Keep every picker mounted after a preview exists, so replacing a file works. */}
      <Input ref={inputRef} type="file" accept={accept} onChange={(e) => {
        e.stopPropagation();
        handleFileSelect(e.currentTarget.files?.[0] || null);
        e.currentTarget.value = "";
      }} className="hidden" id={`upload-${field}`} />


      {!preview ? (
        <div className={`border-2 border-dashed rounded-lg ${compact ? "p-1" : "p-6"} text-center hover:border-primary transition-colors`}>
          <button type="button" aria-label={label} title={label} onClick={openPicker} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-emerald-700 bg-background text-emerald-800 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <Upload className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className={`relative border rounded-lg ${compact ? "p-1" : "p-4"}`}>
          {isImage ? (
            <img src={preview} alt={`Aperçu : ${label}`} className={`w-full ${compact ? "h-20" : "h-48"} object-contain rounded`} />
          ) : isVideo ? (
            <video src={preview} controls className={`w-full ${compact ? "h-20" : "h-48"} object-contain rounded`} />
          ) : (
            <div className={`flex items-center justify-center ${compact ? "h-16" : "h-48"} bg-muted rounded`}>
              <div className="text-center">
                <FileText className={`${compact ? "h-6 w-6" : "h-12 w-12 mb-2"} mx-auto text-primary`} />
                <p className={`text-xs font-medium ${compact ? "truncate max-w-36" : ""}`}>{currentFile?.name || "Document PDF"}</p>
              </div>
            </div>
          )}
          {ocrLoading && <p className="mt-2 text-xs text-muted-foreground flex items-center justify-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />{ocrMessage}</p>}
          {!ocrLoading && ocrMessage && <p className="mt-2 text-xs text-muted-foreground flex items-center justify-center gap-2"><ScanText className="h-3 w-3" />{ocrMessage}</p>}
          <div className={`flex gap-1 ${compact ? "mt-1" : "mt-3"} justify-center`}>
            <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-emerald-700 bg-background text-emerald-800 hover:bg-emerald-50" aria-label="Remplacer le fichier" title="Remplacer le fichier" onClick={openPicker}><Upload className="h-4 w-4" /></button>
            <Button type="button" variant="outline" size="sm" className={compact ? "h-7 w-7 p-0" : ""} aria-label="Visualiser" title="Visualiser" onClick={() => window.open(preview, "_blank", "noopener,noreferrer")}>
              <Eye className="h-4 w-4" />{!compact && "Visualiser"}
            </Button>
            <Button type="button" variant="destructive" size="sm" className={compact ? "h-7 w-7 p-0" : ""} aria-label="Supprimer" title="Supprimer" onClick={clearFile}>
              <X className="h-4 w-4" />{!compact && "Supprimer"}
            </Button>
          </div>
        </div>
      )}

      {fileError && <p className="text-sm text-destructive">{fileError}</p>}

    </div>
  );
};

export default FileUploadVisual;
