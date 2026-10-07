import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import { offlineInsert, offlineUpdate } from "@/lib/offlineWrite";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import FileUpload from "@/components/ui/file-upload";
import { X } from "lucide-react";
import { usePromotionActive } from "@/hooks/usePromotionActive";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { parseAmount } from "@/lib/amount";
import { getSafeErrorMessage } from "@/lib/safeError";
import { calculPrixEffectif } from "@/lib/pricing";
import { useSystemReferences } from "@/hooks/useSystemReferences";


interface PaiementFormProps {
  paiement?: any;
  onSuccess: () => void;
  onCancel: () => void;
}

const PaiementForm = ({ paiement, onSuccess, onCancel }: PaiementFormProps) => {
  const { toast } = useToast();
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    defaultValues: paiement || {},
  });
  const [clients, setClients] = useState<any[]>([]);
  const [plantations, setPlantations] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [selectedPlantation, setSelectedPlantation] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [fileUrl, setFileUrl] = useState(paiement?.fichier_preuve_url || "");
  const [filePreview, setFilePreview] = useState("");
  const [arriereInfo, setArriereInfo] = useState<any>(null);
  const [clientOffre, setClientOffre] = useState<any>(null);
  const { byCategory: refs } = useSystemReferences(["type_paiement","mode_paiement","operateur_mobile"]);
  
  // Le montant du PI est toujours dérivé de l'offre réelle du client.
  // Aucune valeur tarifaire n'est codée en dur ici.
  const { data: promotionActive } = usePromotionActive(clientOffre?.id);
  const typePaiement = watch("type_paiement");
  useEffect(() => { if (!typePaiement) { const v=refs("type_paiement")[0]?.code; if (v) setValue("type_paiement", v); } }, [typePaiement, setValue, refs]);
  const clientId = watch("client_id");
  const plantationId = watch("plantation_id");
  const typePreuve = watch("type_preuve");
  const montantPaye = watch("montant_paye");

  useEffect(() => {
    fetchClients();
  }, []);

  // Quand type de paiement change
  useEffect(() => {
    if (typePaiement) {
      setValue("client_id", "");
      setValue("plantation_id", "");
      setSelectedClient(null);
      setSelectedPlantation(null);
      setPlantations([]);
    }
  }, [typePaiement, setValue]);

  // Quand client change
  useEffect(() => {
    if (clientId) {
      const client = clients.find((s) => s.id === clientId);
      setSelectedClient(client);
      
      // Si type = MENSUALITE, charger plantations du client
      if (typePaiement === "MENSUALITE") {
        fetchPlantationsByClient(clientId);
      }
      
      // Si type = PI, pas besoin de plantation
      if (typePaiement === "PI") {
        setPlantations([]);
      }
    }
  }, [clientId, typePaiement, clients]);

  // Quand plantation change (pour MENSUALITE)
  useEffect(() => {
    if (plantationId && typePaiement === "MENSUALITE") {
      const plantation = plantations.find((p) => p.id === plantationId);
      setSelectedPlantation(plantation);
      
      // Charger l'état financier réel depuis la DB
      chargerEtatPaiementDepuisDb(plantation);
    }
  }, [plantationId, typePaiement, plantations]);

  // Pour PI: récupérer l'offre du client puis calculer le PI via le moteur central.
  useEffect(() => {
    let cancelled = false;
    const loadClientOffer = async () => {
      if (typePaiement !== "PI" || !clientId) {
        setClientOffre(null);
        return;
      }

      const { data: client, error: clientError } = await (supabase as any)
        .from("clients")
        .select("offre_id")
        .eq("id", clientId)
        .maybeSingle();
      if (clientError) {
        toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(clientError) });
        return;
      }
      if (!client?.offre_id) {
        setClientOffre(null);
        setValue("montant_theorique", undefined);
        return;
      }

      const { data: offre, error: offreError } = await (supabase as any)
        .from("offres")
        .select("*")
        .eq("id", client.offre_id)
        .maybeSingle();
      if (offreError) {
        toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(offreError) });
        return;
      }
      if (!cancelled) setClientOffre(offre || null);
    };

    void loadClientOffer();
    return () => { cancelled = true; };
  }, [typePaiement, clientId, setValue, toast]);

  useEffect(() => {
    if (typePaiement !== "PI" || !clientOffre) return;
    const prix = calculPrixEffectif(
      clientOffre,
      promotionActive ? [promotionActive as any] : [],
      { modePaiement: "echeancier" },
    );
    setValue("montant_theorique", prix.pi_effectif);
  }, [typePaiement, clientOffre, promotionActive, setValue]);

  const fetchClients = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setClients(data || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: getSafeErrorMessage(error),
      });
    }
  };

  const fetchPlantationsByClient = async (clientId: string) => {
    try {
      const { data, error } = await (supabase as any)
        .from("plantations")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPlantations(data || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: getSafeErrorMessage(error),
      });
    }
  };

  const chargerEtatPaiementDepuisDb = async (plantation: any) => {
    if (!clientId || !plantation?.id || typePaiement !== "MENSUALITE") {
      setArriereInfo(null);
      return;
    }

    const { data: state, error } = await (supabase as any)
      .rpc("portal_current_payment_state", { _client_id: clientId });

    if (error) {
      setArriereInfo(null);
      return;
    }

    const monthly = state?.mensualite || {};
    const due = Math.max(0, Number(monthly.montant_a_payer || 0));
    const arrears = Math.max(0, Number(monthly.montant_arriere || 0));
    const lateDays = Math.max(0, Number(monthly.jours_retard || 0));

    setArriereInfo({
      type: lateDays > 0 ? "arrieres" : "ok",
      montant: arrears || due,
      jours: lateDays,
      message: lateDays > 0
        ? `Arriéré réel : ${lateDays} jour${lateDays > 1 ? "s" : ""} — ${(arrears || due).toLocaleString()} F`
        : due > 0
          ? `Montant actuellement dû : ${due.toLocaleString()} F`
          : "✓ Aucun paiement mensuel actuellement dû",
    });

    if (!montantPaye && due > 0) {
      setValue("montant_paye", due);
    }
  };

  const handleFileUpload = async (file: File) => {
    try {
      setUploading(true);
      
      // Prévisualisation pour les images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setFilePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setFilePreview(file.name);
      }
      
      const fileExt = file.name.split(".").pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `paiements/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("documents-fonciers")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("documents-fonciers")
        .getPublicUrl(filePath);

      setFileUrl(publicUrl);
      setValue("fichier_preuve_url", publicUrl);
      
      toast({
        title: "Succès",
        description: "Fichier téléchargé avec succès",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: getSafeErrorMessage(error),
      });
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (data: any) => {
    try {
      // Validation stricte des montants financiers
      const amountFields = ["montant_paye", "montant_theorique"] as const;
      const validated: Record<string, number> = {};
      for (const field of amountFields) {
        if (data[field] === undefined || data[field] === null || data[field] === "") continue;
        const parsed = parseAmount(data[field]);
        if (!parsed.ok) {
          toast({ variant: "destructive", title: "Montant invalide", description: parsed.error });
          return;
        }
        validated[field] = parsed.value;
      }

      const user = await supabase.auth.getUser();

      const paiementData = {
        ...data,
        ...validated,
        created_by: user.data.user?.id,
        statut: "en_attente",
        date_upload_preuve: new Date().toISOString(),
      };

      if (paiement) {
        const { error } = await offlineUpdate("paiements", paiement.id, paiementData);
        if (error) throw error;
      } else {
        const { error } = await offlineInsert("paiements", paiementData);
        if (error) throw error;
      }

      toast({
        title: "Succès",
        description: `Paiement ${paiement ? "modifié" : "créé"} avec succès`,
      });
      onSuccess();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: getSafeErrorMessage(error, "Impossible d'enregistrer le paiement"),
      });
    }
  };


  const prixPI = clientOffre && typePaiement === "PI"
    ? calculPrixEffectif(
        clientOffre,
        promotionActive ? [promotionActive as any] : [],
        { modePaiement: "echeancier" },
      )
    : null;
  const montantCalculePI = prixPI ? prixPI.pi_effectif : null;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-4">
        {/* TYPE DE PAIEMENT EN PREMIER */}
        <div>
          <Label htmlFor="type_paiement">Type de Paiement *</Label>
          <Select
            onValueChange={(value) => setValue("type_paiement", value)}
            defaultValue={paiement?.type_paiement || "PI"}
          >
            <SelectTrigger>
              <SelectValue placeholder="Type de paiement" />
            </SelectTrigger>
            <SelectContent>{refs("type_paiement").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {/* ACQUÉREUR */}
        {typePaiement && (
          <div>
            <Label htmlFor="client_id">Planteur *</Label>
            <Select
              onValueChange={(value) => setValue("client_id", value)}
              defaultValue={paiement?.client_id}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un planteur" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.id_unique} - {s.nom_complet}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* PLANTATION (seulement pour MENSUALITE) */}
        {typePaiement === "MENSUALITE" && clientId && (
          <div>
            <Label htmlFor="plantation_id">Plantation *</Label>
            <Select
              onValueChange={(value) => setValue("plantation_id", value)}
              defaultValue={paiement?.plantation_id}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner une plantation" />
              </SelectTrigger>
              <SelectContent>
                {plantations.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.id_unique} - {p.nom_plantation} ({p.superficie_ha} ha)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* CARTE CALCUL PI */}
        {montantCalculePI && typePaiement === "PI" && (
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                💰 Calcul Paiement initial
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {clientOffre && (
                <div className="text-muted-foreground text-xs mb-2">
                  Offre : <strong>{clientOffre.nom}</strong>
                </div>
              )}
              {promotionActive && prixPI && (
                <div className="flex items-center gap-2 text-green-600">
                  <Badge variant="outline" className="bg-green-50">
                    🎉 PROMO ACTIVE
                  </Badge>
                  <span>
                    {promotionActive.nom} — {prixPI.reduction_pct}% sur {prixPI.promotion_cible === "cout_global" ? "le coût global" : "le Paiement Initial"}
                  </span>
                </div>
              )}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Montant unitaire:</span>
                  <span className="font-medium">
                    {montantCalculePI.toLocaleString()} F
                  </span>
                </div>
                {promotionActive && (
                  <div className="flex justify-between text-green-600">
                    <span>Économie:</span>
                    <span className="font-bold">
                      {((prixPI?.pi_base || 0) - (montantCalculePI || 0)).toLocaleString()} F
                    </span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t text-lg font-bold">
                  <span>MONTANT À PAYER:</span>
                  <span>{montantCalculePI.toLocaleString()} F</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* MONTANT (PI uniquement - lecture seule) */}
        {typePaiement === "PI" && clientId && (
          <div>
            <Label htmlFor="montant_theorique">Montant Paiement initial (F CFA) *</Label>
            <Input
              type="number"
              {...register("montant_theorique", { required: true })}
              readOnly
              className="bg-muted font-bold text-lg"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Le PI complet de l'offre sélectionnée est obligatoire (pas de paiement partiel).
            </p>
          </div>
        )}

        {/* ARRIERES INFO (MENSUALITE) */}
        {typePaiement === "MENSUALITE" && arriereInfo && (
          <Card className={
            arriereInfo.type === "arrieres" 
              ? "bg-red-50 border-red-200" 
              : arriereInfo.type === "avance" 
                ? "bg-green-50 border-green-200" 
                : "bg-blue-50 border-blue-200"
          }>
            <CardContent className="pt-4">
              <p className="text-sm font-medium">{arriereInfo.message}</p>
              {arriereInfo.type === "arrieres" && (
                <p className="text-xs text-red-600 mt-2">
                  Montant dû: {arriereInfo.montant.toLocaleString()} F
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* MONTANT PAYE (MENSUALITE uniquement) */}
        {typePaiement === "MENSUALITE" && selectedPlantation && (
          <div>
            <Label htmlFor="montant_paye">Montant Payé (F CFA) *</Label>
            <Input
              type="number"
              {...register("montant_paye", { 
                required: true,
                onChange: (e) => setValue("montant_paye", e.target.value)
              })}
              placeholder="Montant réellement payé"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Saisissez uniquement le montant réellement encaissé. Aucun échéancier futur n'est créé.
            </p>
          </div>
        )}

        <div>
          <Label htmlFor="date_paiement">Date de Paiement *</Label>
          <Input type="date" {...register("date_paiement", { required: true })} />
        </div>

        <div>
          <Label htmlFor="annee">Année *</Label>
          <Input
            type="number"
            {...register("annee", { required: true })}
            defaultValue={new Date().getFullYear()}
          />
        </div>

        <div>
          <Label htmlFor="mode_paiement">Mode de Paiement *</Label>
          <Select
            onValueChange={(value) => setValue("mode_paiement", value)}
            defaultValue={paiement?.mode_paiement}
          >
            <SelectTrigger>
              <SelectValue placeholder="Mode de paiement" />
            </SelectTrigger>
            <SelectContent>{refs("mode_paiement").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="type_preuve">Type de Preuve *</Label>
          <Select
            onValueChange={(value) => setValue("type_preuve", value)}
            defaultValue={paiement?.type_preuve}
          >
            <SelectTrigger>
              <SelectValue placeholder="Type de preuve" />
            </SelectTrigger>
            <SelectContent>{refs("mode_paiement").filter((r:any)=>["id_transaction","photo_recu","pdf_document"].includes(r.code)).map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {typePreuve === "id_transaction" && (
          <>
            <div>
              <Label htmlFor="id_transaction">ID Transaction *</Label>
              <Input
                {...register("id_transaction")}
                placeholder="Ex: OM2510156789"
              />
            </div>
            <div>
              <Label htmlFor="operateur_mobile_money">Opérateur *</Label>
              <Select
                onValueChange={(value) => setValue("operateur_mobile_money", value)}
                defaultValue={paiement?.operateur_mobile_money}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Opérateur" />
                </SelectTrigger>
                <SelectContent>{refs("operateur_mobile").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </>
        )}

        {(typePreuve === "photo_recu" || typePreuve === "pdf_document") && (
          <div>
            <Label>Fichier de Preuve *</Label>
            <FileUpload
              onFileSelect={handleFileUpload}
              accept={typePreuve === "pdf_document" ? ".pdf" : "image/*"}
              maxSize={10}
            />
            {filePreview && (
              <div className="mt-3">
                {filePreview.startsWith('data:image') ? (
                  <div className="relative">
                    <img src={filePreview} alt="Aperçu" className="w-full h-48 object-cover rounded-lg border" />
                    <button
                      type="button"
                      onClick={() => {
                        setFilePreview("");
                        setFileUrl("");
                        setValue("fichier_preuve_url", "");
                      }}
                      className="absolute top-2 right-2 p-1 bg-destructive text-white rounded-full hover:bg-destructive/80"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="p-3 bg-muted rounded border text-sm flex items-center justify-between">
                    <span>📄 {filePreview}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setFilePreview("");
                        setFileUrl("");
                        setValue("fichier_preuve_url", "");
                      }}
                      className="p-1 bg-destructive text-white rounded-full hover:bg-destructive/80"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div>
          <Label htmlFor="observations">Observations</Label>
          <Textarea 
            {...register("observations")} 
            rows={3} 
            placeholder="Ajouter des notes supplémentaires..."
          />
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" disabled={uploading}>
          {uploading ? "Chargement..." : paiement ? "Modifier" : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
};

export default PaiementForm;
