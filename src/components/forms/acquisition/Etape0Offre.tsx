import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sprout, Loader2 } from "lucide-react";
import { usePromotionActive } from "@/hooks/usePromotionActive";
import { calculPrixEffectif } from "@/lib/pricing";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import CommercialCombobox from "@/components/common/CommercialCombobox";

type Offre = Tables<"offres">;

interface Etape0Props {
  formData: any;
  updateFormData: (data: any) => void;
  showCommercial?: boolean;
  surfaceReadOnly?: boolean;
  contractReadOnly?: boolean;
  allowPromotions?: boolean;
}

const getFormulaConfig = (offer: any, code?: string) => {
  const formulas = Array.isArray(offer?.formules_configuration) ? offer.formules_configuration : [];
  // Every formula must be selected explicitly, even when the offer currently has only one.
  if (!code) return null;
  return formulas.find((formula: any) => formula.code === code) || null;
};

const applyFormulaConfig = (offer: any, formula: any) => {
  if (!offer || !formula) return offer;
  const next = {
    ...offer,
    formule_code: formula.code,
    formule_nom: formula.nom,
    gestion_type: formula.gestion_type ?? offer.gestion_type,
  };
  const sharedTariff = formula.utilise_tarif_commun === true;
  for (const key of ["montant_pi_par_ha", "montant_cash_par_ha", "mensualite_par_ha", "montant_total_par_ha", "duree_paiement_mois", "tranches_paiement"]) {
    if (formula[key] !== undefined && formula[key] !== null) (next as any)[key] = formula[key];
    else if (!sharedTariff) (next as any)[key] = null;
    else (next as any)[key] = offer[key] ?? null;
  }
  if (formula.gestion_type === undefined && !sharedTariff) (next as any).gestion_type = null;
  return next;
};

export const Etape0Offre = ({ formData, updateFormData, showCommercial = true, surfaceReadOnly = false, contractReadOnly = false, allowPromotions = true }: Etape0Props) => {
  const { data: promotionActive } = usePromotionActive(formData.offre_id, formData.formule_code, !contractReadOnly && allowPromotions, Number(formData.superficie_prevue || 0));
  const [loadingCommercialDefault, setLoadingCommercialDefault] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!formData.lead_id && formData.commercial_id !== undefined) return;
    setLoadingCommercialDefault(true);
    (async () => {
      try {
        if (formData.lead_id) {
          const { data, error } = await (supabase as any).rpc("get_lead_commercial_for_conversion", { _lead_id: formData.lead_id });
          if (mounted && !error) {
            updateFormData({ commercial_id: data || "" });
            if (data) return;
          }
          if (mounted) return;
        }
        const { data, error } = await (supabase as any).rpc("get_default_commercial_for_client");
        if (mounted && !error && data) updateFormData({ commercial_id: data });
      } finally {
        if (mounted) setLoadingCommercialDefault(false);
      }
    })();
    return () => { mounted = false; };
  }, [formData.lead_id, updateFormData]);

  const { data: catalogueOffres, isLoading: catalogueLoading } = useQuery({
    queryKey: ["offres-acquisition"],
    enabled: !contractReadOnly,
    queryFn: async () => {
      const { data, error } = await supabase.from("offres").select("*").eq("actif", true).order("ordre", { ascending: true });
      if (error) throw error;
      return data as Offre[];
    },
  });
  const snapshotOffer = formData.offre_snapshot?.offer || formData.offre || null;
  const offres: Offre[] = contractReadOnly
    ? (snapshotOffer ? [{ ...snapshotOffer, id: snapshotOffer.id || formData.offre_id,
        code: snapshotOffer.code || formData.offre_code || "", nom: snapshotOffer.nom || formData.formule_nom || "Offre enregistrée",
        formules_configuration: Array.isArray(snapshotOffer.formules_configuration) ? snapshotOffer.formules_configuration : [] } as Offre] : [])
    : (catalogueOffres || []);
  const selectedOfferForForm: any = offres.find((item:any) => item.id === formData.offre_id) || snapshotOffer;
  const offerFamilyForForm = String(selectedOfferForForm?.famille_offre || "").toUpperCase();
  const superficieLabel = offerFamilyForForm === "PALMTERROIR" ? "Superficie nette de la parcelle" : "Superficie contractuelle";
  const isLoading = !contractReadOnly && catalogueLoading;

  const familles = useMemo(() => {
    const groups = new Map<string, Offre[]>();
    for (const offre of offres || []) {
      // Every active offer remains selectable even when its family is not configured.
      const famille = String((offre as any).famille_offre || offre.nom || offre.code || "").trim();
      if (!famille) continue;
      const current = groups.get(famille) || [];
      current.push(offre);
      groups.set(famille, current);
    }
    return [...groups.entries()];
  }, [offres]);

  // Restore the selected offer from a lead or saved draft without silently
  // choosing the first formula when the offer has multiple configured formulas.
  useEffect(() => {
    if (contractReadOnly) return;
    if (!formData.offre_id || !offres?.length) return;
    const baseOffer: any = offres.find((item) => item.id === formData.offre_id);
    if (!baseOffer) return;
    const formulas = Array.isArray(baseOffer.formules_configuration) ? baseOffer.formules_configuration : [];
    const selected = formulas.find((formula: any) => formula.code === formData.formule_code);

    if (!selected) {
      const patch: any = {};
      if (formData.offre?.id !== baseOffer.id) patch.offre = baseOffer;
      if (formData.formule_code || formData.formule_nom || formData.formule_confirmed) {
        patch.formule_code = "";
        patch.formule_nom = "";
        patch.formule_confirmed = false;
      }
      if (Object.keys(patch).length) updateFormData(patch);
      return;
    }

    const formula = selected;
    const resolvedOffer = formula ? applyFormulaConfig(baseOffer, formula) : baseOffer;
    const formulaCode = formula?.code || "";
    const formulaName = formula?.nom || "";
    if (
      formData.offre?.id !== baseOffer.id ||
      formData.formule_code !== formulaCode ||
      formData.formule_nom !== formulaName ||
      (Boolean(formula) && !formData.formule_confirmed)
    ) {
      updateFormData({
        offre: resolvedOffer,
        formule_code: formulaCode,
        formule_nom: formulaName,
        formule_confirmed: Boolean(formula),
        gestion_type: formula?.gestion_type || baseOffer.gestion_type || null,
        type_client: baseOffer.type_offre === "sans_terre" ? "sans_terre" : "avec_terre",
      });
    }
  }, [contractReadOnly, offres, formData.offre_id, formData.offre?.id, formData.formule_code, formData.formule_nom, formData.formule_confirmed, updateFormData]);



  const formatMontant = (montant: number) => new Intl.NumberFormat("fr-FR").format(montant);



  const calculs = useMemo(() => {
    if (contractReadOnly) {
      const contract = formData.offre_snapshot?.contract || {};
      const ha = Math.max(Number(contract.superficie_ha ?? formData.superficie_prevue ?? 0), 0);
      const perHa = (amount: any) => ha > 0 ? Number(amount || 0) / ha : Number(amount || 0);
      const pi = Number(contract.paiement_initial_montant ?? contract.montant_pi_total ?? formData.paiement_initial_montant ?? 0);
      const total = Number(contract.montant_total_contrat ?? formData.montant_total_contrat ?? 0);
      const monthly = Number(contract.mensualite_montant ?? formData.mensualite_montant ?? 0);
      return {
        ha, piUnitaire: perHa(pi), piUnitaireFinal: perHa(pi), totalPI: pi,
        totalUnitaire: perHa(total), totalFinal: total, totalNormal: total,
        modePaiement: contract.mode_paiement || formData.mode_paiement || "echeancier",
        tranches: Array.isArray(contract.echeancier) ? contract.echeancier : [],
        duree: Number(contract.duree_paiement_mois || 0), mensualiteEffective: perHa(monthly), mensualiteTotale: monthly,
        promoCible: null, promoReduction: 0, promotionAppliquee: Boolean(contract.promotion_id),
      };
    }
    if (!formData.offre_id || !formData.superficie_prevue || !offres) return null;
    const baseOffer = offres.find((o) => o.id === formData.offre_id);
    if (!baseOffer) return null;
    const formula = getFormulaConfig(baseOffer, formData.formule_code);
    const configuredFormulas = Array.isArray((baseOffer as any).formules_configuration) ? (baseOffer as any).formules_configuration : [];
    // No prices are displayed or calculated until a specific formula has been selected.
    if (configuredFormulas.length === 0 || !formula) return null;
    const offre = applyFormulaConfig(baseOffer, formula);

    const ha = Number(formData.superficie_prevue);
    const o = offre as any;
    const tranches = Array.isArray(o.tranches_paiement) ? o.tranches_paiement : [];
    const pricingMode = "echeancier";
    const prix = calculPrixEffectif(o, promotionActive ? [promotionActive as any] : [], { modePaiement: pricingMode, superficieHa: ha });

    // Use the real fields returned by calculPrixEffectif; old keys silently displayed PI as 0.
    const piUnitaireBase = Number(prix.pi_base || 0);
    const piUnitaireFinal = Number(prix.pi_effectif || 0);
    const totalUnitaire = Number(prix.montant_total_base || 0);
    const totalFinal = Number(prix.montant_total_effectif || 0);
    const mensualiteEffective = Number(prix.mensualite_effective || 0);
    const tranchesEffectives = (prix.tranches_effectives || tranches).map((t: any) => ({
      ...t,
      mensualite_par_ha_effective: Number(t.mensualite_par_ha_effective ?? t.mensualite_par_ha ?? 0),
    }));

    return {
      ha,
      piUnitaire: piUnitaireBase,
      piUnitaireFinal,
      totalPI: piUnitaireFinal * ha,
      totalUnitaire,
      totalFinal: totalFinal * ha,
      totalNormal: totalUnitaire * ha,
      modePaiement: pricingMode,
      tranches: tranchesEffectives,
      duree: Number(o.duree_paiement_mois || 0),
      mensualiteEffective,
      mensualiteTotale: mensualiteEffective * ha,
      promoCible: prix.promotion_cible,
      promoReduction: Number(prix.reduction_pct || 0),
      promotionAppliquee: !!prix.promotion_id,
    };
  }, [contractReadOnly, formData.offre_snapshot, formData.paiement_initial_montant, formData.montant_total_contrat, formData.mensualite_montant, formData.offre_id, formData.formule_code, formData.superficie_prevue, formData.mode_paiement, promotionActive, offres]);

  if (isLoading) return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      {showCommercial && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg">Commercial</CardTitle>
          </CardHeader>
          <CardContent>
            <CommercialCombobox
              value={formData.commercial_id || null}
              onChange={(value) => updateFormData({ commercial_id: value })}
              placeholder={loadingCommercialDefault ? "Détermination du commercial" : (formData.lead_id && !formData.commercial_id ? "Choisir le commercial ayant réalisé la vente" : "Rechercher ou sélectionner un commercial")}
              disabled={loadingCommercialDefault || (!!formData.lead_id && !!formData.commercial_id)}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{superficieLabel}</CardTitle>
          
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="superficie_prevue">{superficieLabel} (hectares) *</Label>
            <Input
              id="superficie_prevue"
              type="number"
              step="0.5"
              min="1"
              value={formData.superficie_prevue || ""}
              onChange={(e) => updateFormData({ superficie_prevue: e.target.value })}
              placeholder=""
              readOnly={surfaceReadOnly}
              disabled={surfaceReadOnly}
              required
            />
          </div>

          {calculs && (
            <div className="p-4 bg-primary/10 rounded-lg space-y-3">
              <div className="flex justify-between text-sm"><span>Superficie:</span><span className="font-medium">{calculs.ha} ha</span></div>
              <div className="flex justify-between text-sm"><span>{"Paiement initial"}:</span><span className="font-bold text-primary">{formatMontant(calculs.totalPI)} F</span></div>
              <div className="border-t pt-2 flex justify-between"><span className="font-semibold">Coût global contractuel:</span><span className="text-lg font-bold text-primary">{formatMontant(calculs.totalFinal)} F</span></div>
              {<div className="border-t pt-3 space-y-2">
                <div className="flex justify-between text-sm"><span>Mensualité totale :</span><span className="font-semibold">{formatMontant(calculs.mensualiteTotale)} F/mois</span></div>
                <div className="flex justify-between text-sm"><span>Durée de paiement :</span><span className="font-semibold">{calculs.duree} mois</span></div>
                {calculs.tranches.filter((tranche: any) => Number(tranche.mensualite_par_ha_effective ?? tranche.mensualite_par_ha ?? 0) > 0).map((tranche: any, index: number) => (
                  <div key={`${tranche.mois_debut || index}-${tranche.mois_fin || tranche.mois || index}`} className="flex justify-between gap-3 text-xs text-muted-foreground">
                    <span>{`Mensualité · ${tranche.mois || ((tranche.mois_fin || 0) - (tranche.mois_debut || 0) + 1)} mois`}</span>
                    <span className="font-medium text-foreground">{formatMontant(Number(tranche.mensualite_par_ha_effective ?? tranche.mensualite_par_ha ?? 0) * calculs.ha)} F/mois</span>
                  </div>
                ))}
              </div>}
            </div>
          )}
        </CardContent>
      </Card>


    </div>
  );
};
