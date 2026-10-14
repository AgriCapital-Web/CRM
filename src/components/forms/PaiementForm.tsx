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
  const [clientSubscriptions, setClientSubscriptions] = useState<any[]>([]);
  const [selectedSubscription, setSelectedSubscription] = useState<any>(null);
  const [subscriptionPaymentState, setSubscriptionPaymentState] = useState<any>(null);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [selectedPlantation, setSelectedPlantation] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [fileUrl, setFileUrl] = useState(paiement?.fichier_preuve_url || "");
  const [filePreview, setFilePreview] = useState("");
  const [arriereInfo, setArriereInfo] = useState<any>(null);
  const [clientOffre, setClientOffre] = useState<any>(null);
  const [clientSurface, setClientSurface] = useState(0);
  const { byCategory: refs } = useSystemReferences(["type_paiement","mode_paiement","operateur_mobile"]);
  
  // Le montant du PI est toujours dérivé de l'offre réelle du client.
  // Aucune valeur tarifaire n'est codée en dur ici.
  const { data: promotionActive } = usePromotionActive(clientOffre?.id);
  const typePaiement = watch("type_paiement");
  useEffect(() => { if (!typePaiement) { const v=refs("type_paiement")[0]?.code; if (v) setValue("type_paiement", v); } }, [typePaiement, setValue, refs]);
  const clientId = watch("client_id");
  const plantationId = watch("plantation_id");
  const subscriptionId = watch("souscription_id");
  const typePreuve = watch("type_preuve");
  const montantPaye = watch("montant_paye");

  useEffect(() => {
    fetchClients();
  }, []);

  // Quand type de paiement change
  useEffect(() => {
    if (typePaiement && !paiement) {
      setValue("client_id", "");
      setValue("plantation_id", "");
      setValue("souscription_id", "");
      setSelectedClient(null);
      setSelectedPlantation(null);
      setSelectedSubscription(null);
      setClientSubscriptions([]);
      setPlantations([]);
    }
  }, [typePaiement, setValue]);

  // Quand client change : charger ses plantations et toutes ses souscriptions financières.
  useEffect(() => {
    if (!clientId) {
      setSelectedClient(null);
      setClientSubscriptions([]);
      setSelectedSubscription(null);
      setSubscriptionPaymentState(null);
      return;
    }
    const client = clients.find((s) => s.id === clientId);
    setSelectedClient(client);
    setValue("souscription_id", paiement?.client_id === clientId ? (paiement?.souscription_id || "") : "");
    setSelectedSubscription(null);
    setSubscriptionPaymentState(null);
    if (typePaiement === "MENSUALITE") fetchPlantationsByClient(clientId);
    else setPlantations([]);

    let active = true;
    void (async () => {
      const { data: subs, error: subsError } = await (supabase as any)
        .from("client_souscriptions")
        .select("id,client_id,offre_id,offre_nom,offre_code,famille_offre,formule_code,formule_nom,superficie_ha,montant_pi_total,montant_total_contrat,mode_paiement,mensualite_montant,duree_paiement_mois,echeancier,statut,statut_technique")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (subsError) throw subsError;
      const ids = (subs || []).map((sub: any) => sub.id);
      let payments: any[] = [];
      if (ids.length) {
        const { data, error } = await (supabase as any)
          .from("paiements")
          .select("id,souscription_id,statut,est_paiement_initial")
          .in("souscription_id", ids)
          .eq("est_paiement_initial", true);
        if (error) throw error;
        payments = data || [];
      }
      if (!active) return;
      setClientSubscriptions((subs || []).map((sub: any) => ({
        ...sub,
        pi_paye: payments.some((payment: any) => payment.souscription_id === sub.id && ["valide","paye","paid","success","successful","completed"].includes(String(payment.statut || "").toLowerCase())),
        paiement_initial_id: payments.find((payment: any) => payment.souscription_id === sub.id)?.id || null,
      })));
    })().catch((error: any) => {
      if (active) toast({ variant: "destructive", title: "Souscriptions indisponibles", description: getSafeErrorMessage(error) });
    });
    return () => { active = false; };
  }, [clientId, typePaiement, clients, setValue, toast]);

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
      if (typePaiement !== "PI" || !clientId || subscriptionId) {
        setClientOffre(null);
        return;
      }

      const { data: client, error: clientError } = await (supabase as any)
        .from("clients")
        .select("offre_id,paiement_personnalise,paiement_initial_montant,contrat_solde_at,total_hectares")
        .eq("id", clientId)
        .maybeSingle();
      if (clientError) {
        toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(clientError) });
        return;
      }
      if (!cancelled) setClientSurface(Math.max(0, Number(client?.total_hectares || 0)));
      if (!client?.offre_id) {
        setClientOffre(null);
        const custom = client?.paiement_personnalise?.actif ? client.paiement_personnalise : null;
        const customInitial = Number(custom?.paiement_initial?.montant ?? custom?.paiement_initial?.montant_theorique ?? client?.paiement_initial_montant ?? 0);
        setValue("montant_theorique", customInitial > 0 ? customInitial : undefined);
        if (customInitial > 0 && (montantPaye === undefined || montantPaye === null || montantPaye === "" || Number(montantPaye) <= 0)) setValue("montant_paye", customInitial);
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
  }, [typePaiement, clientId, subscriptionId, setValue, toast]);

  useEffect(() => {
    if (typePaiement !== "PI" || !subscriptionId) {
      setSelectedSubscription(null);
      return;
    }
    const subscription = clientSubscriptions.find((sub: any) => sub.id === subscriptionId) || null;
    setSelectedSubscription(subscription);
    if (subscription) {
      const amount = Number(subscription.montant_pi_total || 0);
      setClientOffre(null);
      setValue("montant_theorique", amount);
      setValue("montant_paye", amount);
      setValue("souscription_id", subscription.id);
    }
  }, [typePaiement, subscriptionId, clientSubscriptions, setValue]);

  useEffect(() => {
    if (typePaiement !== "PI" || !clientOffre || subscriptionId) return;
    const prix = calculPrixEffectif(
      clientOffre,
      promotionActive ? [promotionActive as any] : [],
      { modePaiement: "echeancier" },
    );
    const totalPI = Math.round(Number(prix.pi_effectif || 0) * clientSurface);
    setValue("montant_theorique", totalPI);
    if (montantPaye === undefined || montantPaye === null || montantPaye === "" || Number(montantPaye) <= 0) {
      setValue("montant_paye", totalPI);
    }
  }, [typePaiement, clientOffre, promotionActive, subscriptionId, clientSurface, montantPaye, setValue]);

  const fetchClients = async () => {
    try {
      const [{data,error},{data:summaries,error:summaryError}] = await Promise.all([
        (supabase as any).from("clients").select("*").eq("compte_actif",true).order("created_at",{ascending:false}),
        (supabase as any).from("v_client_synthese").select("client_id,montant_total_contrat,reste_a_payer"),
      ]);
      if (error) throw error;
      if (summaryError) throw summaryError;
      const settledIds = new Set((summaries||[]).filter((row:any)=>Number(row.montant_total_contrat||0)>0&&Number(row.reste_a_payer||0)<=0).map((row:any)=>row.client_id));
      setClients((data||[]).filter((client:any)=>client.type_client!=="beneficiaire_particulier"&&!client.is_internal&&!settledIds.has(client.id)));
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

      let pendingPaymentToUpdate: string | null = null;
      if (!paiement) {
        const selected = clients.find((client: any) => client.id === data.client_id);
        if (!selected || selected.type_client === "beneficiaire_particulier" || selected.is_internal ||
            (selected.contrat_solde_at && !data.souscription_id)) {
          toast({ variant: "destructive", title: "Paiement interdit", description: "Sélectionnez un client ayant encore un contrat ou une souscription à régler." });
          return;
        }

        if (data.type_paiement === "PI" && data.souscription_id) {
          const subscription = clientSubscriptions.find((sub: any) => sub.id === data.souscription_id);
          if (!subscription || subscription.client_id !== data.client_id) {
            toast({ variant: "destructive", title: "Souscription invalide", description: "Choisissez une souscription appartenant au client sélectionné." });
            return;
          }
          const due = Math.max(0, Number(subscription.montant_pi_total || 0));
          const amount = Number(validated.montant_paye ?? data.montant_paye ?? 0);
          if (subscription.pi_paye || due <= 0) {
            toast({ variant: "destructive", title: "Paiement initial déjà réglé", description: "Cette souscription ne présente plus de paiement initial à régler." });
            return;
          }
          if (Math.abs(amount - due) > 1) {
            toast({ variant: "destructive", title: "Montant non conforme", description: "Le montant doit correspondre au paiement initial de cette offre et de cette superficie." });
            return;
          }
          const { data: existing, error: existingError } = await (supabase as any)
            .from("paiements")
            .select("id,statut")
            .eq("souscription_id", subscription.id)
            .eq("est_paiement_initial", true)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (existingError) throw existingError;
          if (existing && ["valide", "paye", "paid", "success", "successful", "completed"].includes(String(existing.statut || "").toLowerCase())) {
            toast({ variant: "destructive", title: "Paiement déjà validé", description: "Le paiement initial de cette souscription a déjà été validé." });
            return;
          }
          pendingPaymentToUpdate = existing?.id || null;
          data.montant = due;
          data.montant_theorique = due;
          data.est_paiement_initial = true;
          data.phase = "paiement_initial";
          data.parcours = subscription.famille_offre || subscription.offre_code;
        } else {
          const { data: summary, error: summaryError } = await (supabase as any)
            .from("v_client_synthese")
            .select("montant_total_contrat,reste_a_payer")
            .eq("client_id", data.client_id)
            .maybeSingle();
          if (summaryError) throw summaryError;
          if (summary && Number(summary.montant_total_contrat || 0) > 0 && Number(summary.reste_a_payer || 0) <= 0) {
            toast({ variant: "destructive", title: "Contrat soldé", description: "Aucun paiement ne reste dû sur le contrat initial ou ses souscriptions." });
            return;
          }
          const { data: paymentState, error: stateError } = await (supabase as any)
            .rpc("portal_current_payment_state", { _client_id: data.client_id });
          if (stateError) throw stateError;
          if (data.type_paiement === "PI") {
            const pi = paymentState?.paiement_initial || {};
            const due = Math.max(0, Number(pi.solde ?? pi.montant_a_payer ?? validated.montant_theorique ?? data.montant_theorique ?? 0));
            const amount = Number(validated.montant_paye ?? data.montant_paye ?? 0);
            if (due <= 0) {
              toast({ variant: "destructive", title: "Paiement initial déjà réglé", description: "Aucun paiement initial n’est dû pour le contrat principal." });
              return;
            }
            if (Math.abs(amount - due) > 1) {
              toast({ variant: "destructive", title: "Montant non conforme", description: "Le montant doit correspondre au solde réel du paiement initial du contrat principal." });
              return;
            }
            const { data: existing, error: existingError } = await (supabase as any)
              .from("paiements")
              .select("id,statut")
              .eq("client_id", data.client_id)
              .is("souscription_id", null)
              .eq("est_paiement_initial", true)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (existingError) throw existingError;
            if (existing && !["valide", "paye", "paid", "success", "successful", "completed"].includes(String(existing.statut || "").toLowerCase())) {
              pendingPaymentToUpdate = existing.id;
            }
            data.montant = due;
            data.montant_theorique = due;
            data.est_paiement_initial = true;
            data.phase = "paiement_initial";
          } else if (data.type_paiement === "MENSUALITE") {
            const monthly = paymentState?.mensualite || {};
            const due = Math.max(0, Number(monthly.montant_a_payer || 0));
            const amount = Number(validated.montant_paye ?? data.montant_paye ?? 0);
            if (due <= 0 || amount <= 0 || amount > due + 1) {
              toast({ variant: "destructive", title: "Montant mensuel non conforme", description: "Le montant ne peut pas dépasser l’échéance réellement due pour cette plantation." });
              return;
            }
          }
        }
      }
      const user = await supabase.auth.getUser();

      const paiementData = {
        ...data,
        ...validated,
        souscription_id: data.souscription_id || null,
        client_id: data.client_id,
        plantation_id: data.plantation_id || null,
        created_by: user.data.user?.id,
        statut: "en_attente",
        date_upload_preuve: new Date().toISOString(),
      };

      if (paiement) {
        const { error } = await offlineUpdate("paiements", paiement.id, paiementData);
        if (error) throw error;
      } else if (pendingPaymentToUpdate) {
        const { error } = await offlineUpdate("paiements", pendingPaymentToUpdate, paiementData);
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
  const montantCalculePI = prixPI ? Math.round(Number(prixPI.pi_effectif || 0) * clientSurface) : null;
  const availablePiSubscriptions = clientSubscriptions.filter((sub: any) =>
    Number(sub.montant_pi_total || 0) > 0 && (!sub.pi_paye || sub.id === paiement?.souscription_id)
  );

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

        {typePaiement === "PI" && clientId && clientSubscriptions.length > 0 && (
          <div>
            <Label htmlFor="souscription_id">Contrat à régler</Label>
            <Select
              value={subscriptionId || "contrat-principal"}
              onValueChange={(value) => {
                setValue("souscription_id", value === "contrat-principal" ? "" : value);
                if (value === "contrat-principal") setSelectedSubscription(null);
              }}
            >
              <SelectTrigger><SelectValue placeholder="Choisir le contrat concerné" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="contrat-principal">Contrat initial du client</SelectItem>
                {availablePiSubscriptions.map((sub: any) => (
                  <SelectItem key={sub.id} value={sub.id}>
                    {sub.formule_nom || sub.offre_nom} · {Number(sub.superficie_ha || 0).toLocaleString("fr-FR")} ha · PI {Number(sub.montant_pi_total || 0).toLocaleString("fr-FR")} F
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
                    {Number(prixPI?.pi_effectif || 0).toLocaleString()} F / ha
                  </span>
                </div>
                {promotionActive && (
                  <div className="flex justify-between text-green-600">
                    <span>Économie:</span>
                    <span className="font-bold">
                      {Math.max(0, Number((prixPI?.pi_base || 0) - (prixPI?.pi_effectif || 0)) * clientSurface).toLocaleString()} F
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

        {selectedSubscription && typePaiement === "PI" && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Paiement initial de la souscription</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Offre / formule</span><strong className="text-right">{selectedSubscription.formule_nom || selectedSubscription.offre_nom}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Superficie</span><strong>{Number(selectedSubscription.superficie_ha || 0).toLocaleString("fr-FR")} ha</strong></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Coût du contrat</span><strong>{Number(selectedSubscription.montant_total_contrat || 0).toLocaleString("fr-FR")} F</strong></div>
              <div className="flex justify-between gap-3 border-t pt-2"><span className="font-semibold">Paiement initial</span><strong className="text-primary">{Number(selectedSubscription.montant_pi_total || 0).toLocaleString("fr-FR")} F</strong></div>
              <p className="text-xs text-muted-foreground">Ce paiement sera rattaché uniquement à cette souscription, sans modifier le premier contrat du client.</p>
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
            
          </div>
        )}

        {typePaiement === "PI" && clientId && (
          <div>
            <Label htmlFor="montant_paye">Montant réellement versé (F CFA) *</Label>
            <Input
              type="number"
              {...register("montant_paye", {
                required: true,
                onChange: (e) => setValue("montant_paye", e.target.value),
              })}
              className="font-semibold"
              placeholder="Montant réellement versé"
            />
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
