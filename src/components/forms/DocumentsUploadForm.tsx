import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { uploadFile } from "@/utils/storage";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { X, Upload } from "lucide-react";
import { getSafeErrorMessage } from "@/lib/safeError";

interface DocumentsUploadFormProps {
  onSuccess: () => void;
}

const DocumentsUploadForm = ({ onSuccess }: DocumentsUploadFormProps) => {
  const { register, handleSubmit, setValue } = useForm();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [files, setFiles] = useState<{ [key: string]: File | null }>({});
  const [previews, setPreviews] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    const fetchClients = async () => {
      const { data } = await (supabase as any)
        .from("clients")
        .select("id, id_unique, nom_complet, prenoms")
        .order("created_at", { ascending: false });
      setClients(data || []);
    };
    fetchClients();
  }, []);

  const DOCUMENT_TYPES = [
    { key: "fiche_contrat", label: "Fiche Contrat", bucket: "documents-fonciers" },
    { key: "enquete_communautaire", label: "Enquête Communautaire", bucket: "documents-fonciers" },
    { key: "piece_identite", label: "Pièce d'Identité", bucket: "pieces-identite" },
    { key: "document_foncier", label: "Document Foncier", bucket: "documents-fonciers" },
    { key: "attestation_exploitation", label: "Attestation d'Exploitation (optionnel)", bucket: "documents-fonciers" },
  ];

  const handleFileChange = (key: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFiles((current) => ({ ...current, [key]: file }));
      
      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreviews((current) => ({ ...current, [key]: reader.result as string }));
        };
        reader.readAsDataURL(file);
      } else {
        setPreviews((current) => ({ ...current, [key]: file.name }));
      }
    }
  };

  const clearFile = (key: string) => {
    setFiles((current) => ({ ...current, [key]: null }));
    setPreviews((current) => ({ ...current, [key]: "" }));
  };

  const onSubmit = async (data: any) => {
    if (!user) return;
    // A real client relation is mandatory: never upload orphaned files or create
    // documents_acquisition rows without client_id.
    if (!data.client_id) {
      toast({ variant: "destructive", title: "Client requis", description: "Sélectionnez le client auquel rattacher les documents." });
      return;
    }
    setLoading(true);

    try {
      for (const docType of DOCUMENT_TYPES) {
        const file = files[docType.key];
        if (!file && docType.key !== "attestation_exploitation") {
          toast({
            variant: "destructive",
            title: "Document manquant",
            description: `Le document ${docType.label} est requis`,
          });
          setLoading(false);
          return;
        }

        if (file) {
          const result = await uploadFile(docType.bucket, file);
          if (!result?.path) throw new Error(`Échec du téléversement : ${docType.label}`);
          const { error: documentError } = await (supabase as any).from("documents_acquisition").insert({
            client_id: data.client_id,
            type_document: docType.key,
            code_document: docType.key,
            categorie: "souscription",
            source_contractuelle: docType.key,
            fichier_url: result.path,
            statut: "en_attente",
            uploaded_by: user?.id || null,
            metadata: { source_formulaire: "documents_upload", libelle: docType.label, storage_bucket: docType.bucket },
          });
          if (documentError) throw documentError;
        }
      }

      toast({
        title: "Succès",
        description: "Documents soumis avec succès",
      });
      onSuccess();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: getSafeErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label>Client *</Label>
        <Select onValueChange={(value) => setValue("client_id", value)}>
          <SelectTrigger>
            <SelectValue placeholder="Sélectionner un client" />
          </SelectTrigger>
          <SelectContent>
            {clients.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.id_unique} - {s.nom_complet} {s.prenoms}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {DOCUMENT_TYPES.map((docType) => (
          <Card key={docType.key}>
            <CardContent className="pt-6">
              <Label>{docType.label}</Label>
              <input
                id={"document-upload-" + docType.key}
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => { e.stopPropagation(); handleFileChange(docType.key, e); }}
                className="sr-only"
              />
              <button type="button" className="mt-2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-emerald-700 text-emerald-800 hover:bg-emerald-50" aria-label={"Ajouter " + docType.label} title={"Ajouter ou remplacer " + docType.label} onClick={() => document.getElementById("document-upload-" + docType.key)?.click()}>
                <Upload className="h-4 w-4" />
              </button>
              {previews[docType.key] && (
                <div className="mt-3 relative">
                  {previews[docType.key].startsWith('data:image') ? (
                    <img
                      src={previews[docType.key]}
                      alt="Aperçu"
                      className="w-full h-32 object-cover rounded border"
                    />
                  ) : (
                    <div className="p-3 bg-muted rounded border text-sm">
                      📄 {previews[docType.key]}
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                    onClick={() => clearFile(docType.key)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={loading}>
          {loading ? "Envoi en cours..." : "Soumettre tous les documents"}
        </Button>
      </div>
    </form>
  );
};

export default DocumentsUploadForm;
