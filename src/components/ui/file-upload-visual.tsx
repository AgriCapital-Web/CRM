import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ScanText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Eye, X, Upload, FileText, Camera } from "lucide-react";



const fileToDataUrl = (file: File) => new Promise<string>((resolve,reject)=>{ const reader=new FileReader(); reader.onload=()=>resolve(String(reader.result||"")); reader.onerror=()=>reject(reader.error); reader.readAsDataURL(file); });

interface FileUploadVisualProps {
  label: string;
  field: string;
  accept?: string;
  required?: boolean;
  currentFile?: File | null;
  currentPreview?: string;
  onFileChange: (field: string, file: File | null, preview: string) => void;
  onIdentityNumberDetected?: (numero: string) => void;
  identityDocumentType?: string;
}

export const FileUploadVisual = ({
  label,
  field,
  accept = "image/jpeg,image/png,application/pdf",
  required = false,
  currentFile,
  currentPreview,
  onFileChange,
  onIdentityNumberDetected,
  identityDocumentType,
}: FileUploadVisualProps) => {
  const [preview, setPreview] = useState<string>(currentPreview || "");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrMessage, setOcrMessage] = useState<string>("");
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep preview in sync when parent restores draft / navigates steps
  useEffect(() => {
    // Le preview local est la source immédiate après une capture caméra.
    // Ne jamais l'effacer lors d'un simple rerender du formulaire.
    if (currentPreview) setPreview(currentPreview);
  }, [currentPreview]);

  const handleFileSelect = (file: File | null) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const previewUrl = reader.result as string;
      setPreview(previewUrl);
      onFileChange(field, file, previewUrl);
      if (onIdentityNumberDetected && file.type.startsWith("image/")) {
        setOcrLoading(true); setOcrMessage("Lecture automatique de la pièce…");
        void fileToDataUrl(file).then(async (imageDataUrl) => {
          const { data, error } = await supabase.functions.invoke("analyze-id-document", { body: { imageDataUrl, documentType: identityDocumentType } });
          if (!error && data?.numero_piece) { onIdentityNumberDetected(String(data.numero_piece)); setOcrMessage(data?.confiance >= 0.8 ? "Numéro détecté automatiquement." : "Numéro détecté — vérifiez-le avant validation."); }
          else setOcrMessage("Lecture automatique indisponible : saisissez le numéro si nécessaire.");
        }).catch(() => setOcrMessage("Lecture automatique indisponible : saisissez le numéro si nécessaire.")).finally(() => setOcrLoading(false));
      }
    };
    reader.readAsDataURL(file);
  };

  const clearFile = () => {
    setPreview("");
    onFileChange(field, null, "");
    if (inputRef.current) inputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const isImage = currentFile?.type?.startsWith("image/") || preview.startsWith("data:image");
  const isVideo = currentFile?.type?.startsWith("video/") || preview.startsWith("data:video");

  return (
    <div className="space-y-2">
      <Label>{label} {required && "*"}</Label>
      {!preview ? (
        <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors cursor-pointer">
          <Input ref={inputRef} type="file" accept={accept} onChange={(e) => handleFileSelect(e.target.files?.[0] || null)} className="hidden" id={`upload-${field}`} />
          <Input ref={fileInputRef} type="file" accept={accept} onChange={(e) => { setSourceDialogOpen(false); handleFileSelect(e.target.files?.[0] || null); }} className="hidden" />
          <Input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={(e) => { setSourceDialogOpen(false); handleFileSelect(e.target.files?.[0] || null); }} className="hidden" />
          <button type="button" onClick={() => accept.includes("image") ? setSourceDialogOpen(true) : inputRef.current?.click()} className="w-full border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors cursor-pointer">
            <div className="space-y-2">
              {accept.includes("image") ? <Camera className="h-10 w-10 mx-auto text-muted-foreground" /> : <Upload className="h-10 w-10 mx-auto text-muted-foreground" />}
              <p className="text-sm text-muted-foreground">Ajouter une photo ou un fichier</p>
              <p className="text-xs text-muted-foreground">Choisissez entre la caméra et le gestionnaire de fichiers</p>
            </div>
          </button>
          {accept.includes("image") && (
            <Dialog open={sourceDialogOpen} onOpenChange={setSourceDialogOpen}>
              <DialogContent className="max-w-sm">
                <DialogHeader><DialogTitle>Ajouter une photo</DialogTitle></DialogHeader>
                <div className="grid grid-cols-1 gap-3">
                  <Button type="button" onClick={() => cameraInputRef.current?.click()} className="h-12 justify-start">
                    <Camera className="mr-3 h-5 w-5" /> Prendre une photo avec la caméra
                  </Button>
                  <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} className="h-12 justify-start">
                    <Upload className="mr-3 h-5 w-5" /> Choisir depuis le gestionnaire de fichiers
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      ) : (
        <div className="relative border rounded-lg p-4">
          {isImage ? (
            <img
              src={preview}
              alt="Aperçu"
              className="w-full h-48 object-contain rounded"
            />
          ) : isVideo ? (
            <video src={preview} controls className="w-full h-48 object-contain rounded" />
          ) : (
            <div className="flex items-center justify-center h-48 bg-muted rounded">
              <div className="text-center">
                <FileText className="h-12 w-12 mx-auto text-primary mb-2" />
                <p className="text-sm font-medium">{currentFile?.name || "Document PDF"}</p>
              </div>
            </div>
          )}
          {ocrLoading && <p className="mt-2 text-xs text-muted-foreground flex items-center justify-center gap-2"><Loader2 className="h-3 w-3 animate-spin"/> {ocrMessage}</p>}
          {!ocrLoading && ocrMessage && <p className="mt-2 text-xs text-muted-foreground flex items-center justify-center gap-2"><ScanText className="h-3 w-3"/> {ocrMessage}</p>}
          <div className="flex gap-2 mt-3 justify-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.open(preview, "_blank")}
            >
              <Eye className="h-4 w-4 mr-1" />
              Visualiser
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={clearFile}
            >
              <X className="h-4 w-4 mr-1" />
              Supprimer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileUploadVisual;
