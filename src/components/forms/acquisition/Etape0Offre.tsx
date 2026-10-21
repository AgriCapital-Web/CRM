import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sprout, Sparkles, Loader2 } from "lucide-react";
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
}

const getFormulaConfig = (offer: any, code?: string) => {
  const formulas = Array.isArray(offer?.formules_configuration) ? offer.formules_configuration : [];
  if (code) return formulas.find((formula: any) => formula.code === code) || null;
  return formulas[0] || null;
};

const applyFormulaConfig = (offer: any, formula: any) => {
  if (!offer || !formula) return offer;
  const next = {
    ...offer,
    formule_code: formula.code || offer.formule_code || offer.code,
    formule_nom: formula.nom || offer.formule_nom || offer.nom,
    gestion_type: formula.gestion_type ?? offer.gestion_type,
  };
  // Une formule qui porte ses propres paramètres tarifaires doit toujours primer sur les valeurs
  // génériques de l'offre, même si l'indicateur utilise_tarif_commun est absent ou mal renseigné.
  // Les formules qui partagent le tarif n'ont simplement pas ces champs et conservent le tarif commun.
  for (const key of ["montant_pi_par_ha", "montant_cash_par_ha", "mensualite_par_ha", "montant_total_par_ha", "duree_paiement_mois", "tranches_paiement"]) {
    if (formula[key] !== undefined && formula[key] !== null) (next as any)[key] = formula[key];
  }
  return next;
};

export const Etape0Offre = ({ formData, updateFormData, showCommercial = true, surfaceReadOnly = false }: Etape0Props) => {
  const { data: promotionActive } = usePromotionActive(formData.offre_id);
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

  const { data: offres, isLoading } = useQuery({
    queryKey: ["offres-acquisition"],
    queryFn: async () => {
      const { data, error } = await supabase.from("offres").select("*").eq("actif", true).order("ordre", { ascending: true });
      if (error) throw error;
      return data as Offre[];
    },
  });

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
    if (!formData.offre_id || !offres?.length) return;
    const baseOffer: any = offres.find((item) => item.id === formData.offre_id);
    if (!baseOffer) return;
    const formulas = Array.isArray(baseOffer.formules_configuration) ? baseOffer.formules_configuration : [];
    const selected = formulas.find((formula: any) => formula.code === formData.formule_code);

    if (formulas.length > 1 && !selected) {
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

    const formula = selected || (formulas.length === 1 ? formulas[0] : null);
    const resolvedOffer = formula ? applyFormulaConfig(baseOffer, formula) : baseOffer;
    const formulaCode = formula?.code || (formulas.length === 0 ? baseOffer.formule_code || baseOffer.code : "");
    const formulaName = formula?.nom || (formulas.length === 0 ? baseOffer.formule_nom || baseOffer.nom : "");
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
  }, [offres, formData.offre_id, formData.offre?.id, formData.formule_code, formData.formule_nom, formData.formule_confirmed, updateFormData]);



  const formatMontant = (montant: number) => new Intl.NumberFormat("fr-FR").format(montant);



  const calculs = useMemo(() => {
    if (!formData.offre_id || !formData.superficie_prevue || !offres) return null;
    const baseOffer = offres.find((o) => o.id === formData.offre_id);
    if (!baseOffer) return null;
    const formula = getFormulaConfig(baseOffer, formData.formule_code);
    const offre = applyFormulaConfig(baseOffer, formula);

    const ha = Number(formData.superficie_prevue);
    const o = offre as any;
    const tranches = Array.isArray(o.tranches_paiement) ? o.tranches_paiement : [];
    const pricingMode = "echeancier";
    const prix = calculPrixEffectif(o, promotionActive ? [promotionActive as any] : [], { modePaiement: pricingMode });

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
      promoCible: prix.promotion_cible,
      promoReduction: Number(prix.reduction_pct || 0),
      promotionAppliquee: !!prix.promotion_id,
    };
  }, [formData.offre_id, formData.formule_code, formData.superficie_prevue, formData.mode_paiement, promotionActive, offres]);

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

      {promotionActive && (
        <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-amber-700 font-semibold mb-2">
            <Sparkles className="h-5 w-5" />
            <span>Promotion en cours: {promotionActive.nom}</span>
          </div>
          <p className="text-sm text-amber-600">
            {(() => {
              const pct = Number((promotionActive as any).pourcentage_reduction || 0);
              const fixe = Number((promotionActive as any).montant_fixe_reduction || 0);
              const cible = String((promotionActive as any).cible || "");
              return fixe > 0 && pct > 0 ? "-" + pct + "% + " + formatMontant(fixe) + " F sur " + cible
                : fixe > 0 ? "-" + formatMontant(fixe) + " F sur " + cible
                : "-" + pct + "% sur " + cible;
            })()}
          </p>
        </div>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">Choisissez votre offre</CardTitle>
          
        </CardHeader>
        {formData.offre_id && (
          <CardContent className="pt-0 pb-3">
            <Button type="button" variant="outline" size="sm" onClick={() => updateFormData({ offre_id: "", offre_code: "", offre: null, type_client: "" })}>
              Changer d’offre
            </Button>
          </CardContent>
        )}
        <CardContent className="space-y-2">
          {(formData.offre_id ? familles.filter(([, familyOffers]) => familyOffers.some((o) => o.id === formData.offre_id)) : familles).map(([famille, familyOffers]) => {
            const selectedFamily = familyOffers.some((o) => o.id === formData.offre_id);
            const first = familyOffers[0];
            const familleLabel = String(famille);
            return (
              <div key={famille} className="rounded-xl border transition-all border-border">
                <button
                  type="button"
                  className="flex w-full min-w-0 items-center gap-3 p-3 text-left sm:p-4"
                  onClick={() => {
                    if (selectedFamily) return;
                    const formulaCount = familyOffers.reduce((count, item: any) =>
                      count + (Array.isArray(item.formules_configuration) && item.formules_configuration.length
                        ? item.formules_configuration.length : 1), 0);
                    const typeClient = first.type_offre === "sans_terre" ? "sans_terre" : "avec_terre";
                    if (formulaCount > 1) {
                      // Keep the user on step 1 until a specific formula is chosen.
                      updateFormData({
                        offre_id: first.id, offre_code: first.code, offre: first,
                        formule_code: "", formule_nom: "", formule_confirmed: false,
                        gestion_type: first.gestion_type || null, type_client: typeClient,
                      });
                      return;
                    }
                    const formula = getFormulaConfig(first);
                    const selected = formula ? applyFormulaConfig(first, formula) : first;
                    updateFormData({
                      offre_id: first.id,
                      offre_code: first.code,
                      offre: selected,
                      formule_code: formula?.code || first.formule_code || first.code,
                      formule_nom: formula?.nom || first.formule_nom || first.nom,
                      formule_confirmed: true,
                      gestion_type: formula?.gestion_type || first.gestion_type || null,
                      type_client: typeClient,
                    });
                  }}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Sprout className="h-5 w-5 text-primary" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-primary">{familleLabel}</span>
                    <span className="block text-xs text-muted-foreground">{familyOffers.reduce((count, item: any) => count + (Array.isArray(item.formules_configuration) ? item.formules_configuration.length : 1), 0)} formules disponibles</span>
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">{selectedFamily ? "Ouvert" : "Choisir"}</span>
                </button>

                {selectedFamily && (
                  <div className="border-t px-3 pb-3 pt-3 sm:px-4">
                    <Label className="text-xs">Formule</Label>
                    <Select
                      value={formData.formule_code || ""}
                      onValueChange={(value) => {
                        const formulaOwner = familyOffers.find((item: any) => {
                          const configured = Array.isArray(item.formules_configuration) ? item.formules_configuration : [];
                          return configured.length ? configured.some((f: any) => f.code === value) : (item.formule_code || item.code) === value;
                        }) || first;
                        const formulas = Array.isArray(formulaOwner.formules_configuration) ? formulaOwner.formules_configuration : [];
                        const formula = formulas.find((f: any) => f.code === value) as any;
                        const selected = formula ? applyFormulaConfig(formulaOwner, formula) : formulaOwner;
                        const selectedCode = formula?.code || formulaOwner.formule_code || formulaOwner.code;
                        const selectedName = formula?.nom || formulaOwner.formule_nom || formulaOwner.nom;
                        updateFormData({
                          offre_id: formulaOwner.id,
                          offre_code: formulaOwner.code,
                          offre: selected,
                          formule_code: selectedCode,
                          formule_nom: selectedName,
                          formule_confirmed: true,
                          gestion_type: formula?.gestion_type || formulaOwner.gestion_type || null,
                          type_client: formulaOwner.type_offre === "sans_terre" ? "sans_terre" : "avec_terre",
                          ...(formulaOwner.type_offre === "sans_terre" ? {} : { parcelle_id: null }),
                        });
                      }}
                    >
                      <SelectTrigger className="mt-1 w-full min-w-0"><SelectValue placeholder="Sélectionner une formule" /></SelectTrigger>
                      <SelectContent>
                        {familyOffers.flatMap((item: any) => {
                          const formulas = Array.isArray(item.formules_configuration) ? item.formules_configuration : [];
                          return formulas.length
                            ? formulas.map((formula: any) => <SelectItem key={formula.code} value={formula.code}>{formula.nom}</SelectItem>)
                            : [<SelectItem key={item.id} value={item.formule_code || item.code}>{item.formule_nom || item.nom}</SelectItem>];
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Superficie prévue</CardTitle>
          
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="superficie_prevue">Superficie (hectares) *</Label>
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
              <div className="flex justify-between text-sm"><span>{`Paiement initial${calculs.promoCible === "paiement_initial" ? " (promo)" : ""}`}:</span><span className="font-bold text-primary">{formatMontant(calculs.totalPI)} F</span></div>
              <div className="border-t pt-2 flex justify-between"><span className="font-semibold">Coût global contractuel{calculs.promoCible === "cout_global" ? " (promo)" : ""}:</span><span className="text-lg font-bold text-primary">{formatMontant(calculs.totalFinal)} F</span></div>
              {<div className="border-t pt-3 space-y-2">
                <div className="flex justify-between text-sm"><span>Durée de paiement :</span><span className="font-semibold">{calculs.duree} mois</span></div>
                {calculs.tranches.filter((tranche: any) => Number(tranche.mensualite_par_ha_effective ?? tranche.mensualite_par_ha ?? 0) > 0).map((tranche: any, index: number) => (
                  <div key={tranche.annee || index} className="flex justify-between gap-3 text-xs text-muted-foreground">
                    <span>An {tranche.annee || index + 1} · {tranche.mois || ((tranche.mois_fin || 0) - (tranche.mois_debut || 0) + 1)} mois</span>
                    <span className="font-medium text-foreground">{formatMontant(Number(tranche.mensualite_par_ha_effective ?? tranche.mensualite_par_ha ?? 0))} F/ha/mois</span>
                  </div>
                ))}
              </div>}
              {calculs.promotionAppliquee && <div className="flex items-center gap-1 text-xs text-amber-600"><Sparkles className="h-3 w-3" /><span>Promo -{calculs.promoReduction}% appliquée sur {calculs.promoCible}</span></div>}
            </div>
          )}
        </CardContent>
      </Card>


    </div>
  );
};
