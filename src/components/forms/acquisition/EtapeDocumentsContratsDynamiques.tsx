import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUploadVisual } from "@/components/ui/file-upload-visual";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import PieceTypeSelect from "@/components/common/PieceTypeSelect";
import { supabase } from "@/integrations/supabase/client";
import { getCachedItems, STORES } from "@/lib/offlineDb";

interface Props {
  formData: any;
  updateFormData: (data: any) => void;
  showIdentityAndContracts?: boolean;
  showAdditionalDocuments?: boolean;
}

const conditionActive = (doc: any, formData: any) => {
  const condition = doc.condition || {};
  if (condition.relation === "mandataire" && formData.representant_type !== "mandataire") return false;
  if (condition.when === "representant_active") return Boolean(formData.has_representant);
  if (condition.when === "offre_plus") return /PLUS|DELEGUE|\+/i.test(String(formData.formule_code || "") + " " + String(formData.formule_nom || ""));
  if (condition.when === "necessaire") return Boolean(formData.document_securisation_necessaire);
  if (condition.when === "client_land") return Boolean(formData.offre?.necessite_foncier_client);
  if (condition.when === "acquisition") return Boolean(formData.offre?.contrat_acquisition_requis);
  return true;
};

export const EtapeDocumentsContratsDynamiques = ({ formData, updateFormData, showIdentityAndContracts = true, showAdditionalDocuments = true }: Props) => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!formData.offre_id) return;
      setLoading(true);
      const [{ data: docs }, { data: ctrs }] = await Promise.all([
        (supabase as any).from("offre_formulaire_documents").select("*").eq("offre_id", formData.offre_id).eq("actif", true).order("ordre"),
        (supabase as any).from("offre_formulaire_contrats").select("*").eq("offre_id", formData.offre_id).eq("actif", true),
      ]);
      if (mounted) {
        setDocuments(docs || []);
        setContracts(ctrs || []);
        setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [formData.offre_id]);

  const identityDocumentCodes = new Set(["client_piece_recto", "client_piece_verso", "client_photo_profil"]);
  const visibleDocuments = useMemo(
    () => documents.filter((doc) => !identityDocumentCodes.has(doc.code) && conditionActive(doc, formData)),
    [documents, formData.has_representant, formData.offre_code, formData.formule_code, formData.formule_nom, formData.document_securisation_necessaire]
  );

  const handleFileChange = (code: string, file: File | null, preview: string) => {
    updateFormData({
      ["doc_" + code + "_file"]: file,
      ["doc_" + code + "_preview"]: preview,
    });
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Chargement des pièces requises…</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Identité et photos du client</CardTitle>
          
        </CardHeader>
        <CardContent className="space-y-4">
{showIdentityAndContracts && (formData.type_personne || "personne_physique") === "personne_physique" && (
          <div className="space-y-4 rounded-xl border p-4"><div className="grid gap-4 md:grid-cols-3"><div><Label>Type de pièce *</Label><PieceTypeSelect value={formData.type_piece||""} onChange={v=>updateFormData({type_piece:v})}/></div><div><Label>Numéro de pièce *</Label><Input value={formData.numero_piece||""} onChange={e=>updateFormData({numero_piece:e.target.value})}/></div><div><Label>Date de délivrance</Label><Input type="date" value={formData.date_delivrance_piece||""} onChange={e=>updateFormData({date_delivrance_piece:e.target.value})}/></div></div><div className="grid gap-3 sm:grid-cols-3"><FileUploadVisual label="Pièce d’identité — recto *" field="photo_piece_recto" accept=".pdf,image/jpeg,image/png" required currentFile={formData.photo_piece_recto_file||null} currentPreview={formData.photo_piece_recto_preview||""} onFileChange={(field,file,preview)=>updateFormData({photo_piece_recto_file:file,photo_piece_recto_preview:preview})} onIdentityNumberDetected={n=>updateFormData({numero_piece:n})} identityDocumentType={formData.type_piece}/><FileUploadVisual label="Pièce d’identité — verso *" field="photo_piece_verso" accept=".pdf,image/jpeg,image/png" required currentFile={formData.photo_piece_verso_file||null} currentPreview={formData.photo_piece_verso_preview||""} onFileChange={(field,file,preview)=>updateFormData({photo_piece_verso_file:file,photo_piece_verso_preview:preview})} identityDocumentType={formData.type_piece}/></div><FileUploadVisual label="Photo de profil client *" field="photo_profil" accept="image/*" required currentFile={formData.photo_profil_file||null} currentPreview={formData.photo_profil_preview||""} onFileChange={(field,file,preview)=>updateFormData({photo_profil_file:file,photo_profil_preview:preview})}/></div>
          )}
          {showAdditionalDocuments && (
            <>
          {visibleDocuments.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucune pièce supplémentaire à téléverser à cette étape.</p>
          )}

          {visibleDocuments.map((doc) => {
            const required = Boolean(doc.obligatoire);
            return (
              <div key={doc.code} className="rounded-xl border p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{doc.libelle}</p>
                    {doc.source_contractuelle && (
                      <p className="text-xs text-muted-foreground">{doc.source_contractuelle}</p>
                    )}
                  </div>
                  <Badge variant={required ? "default" : "outline"}>
                    {required ? "Obligatoire" : "Conditionnel"}
                  </Badge>
                </div>

                <FileUploadVisual
                  label={required ? "Téléverser le fichier *" : "Téléverser le fichier"}
                  field={doc.code}
                  accept=".pdf,image/*"
                  required={required}
                  currentFile={formData["doc_" + doc.code + "_file"] || null}
                  currentPreview={formData["doc_" + doc.code + "_preview"] || ""}
                  onFileChange={(field, file, preview) => handleFileChange(doc.code, file, preview)}
                />
              </div>
            );
          })}
            </>
          )}

        </CardContent>
      </Card>
    </div>
  );
};
