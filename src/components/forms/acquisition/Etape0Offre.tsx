import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sprout, Check, Sparkles, Loader2 } from "lucide-react";
import { usePromotionActive } from "@/hooks/usePromotionActive";
import { calculPrixEffectif } from "@/lib/pricing";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import CommercialCombobox from "@/components/common/CommercialCombobox";

type Offre = Tables<"offres">;

interface Etape0Props {
  formData: any;
  updateFormData: (data: any) => void;
}

export const Etape0Offre = ({ formData, updateFormData }: Etape0Props) => {
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
      const famille = String((offre as any).famille_offre || "").trim();
      if (!famille) continue;
      const current = groups.get(famille) || [];
      current.push(offre);
      groups.set(famille, current);
    }
    return [...groups.entries()];
  }, [offres]);

  const formatMontant = (montant: number) => new Intl.NumberFormat("fr-FR").format(montant);

  const parseAvantages = (avantages: any): string[] => {
    if (Array.isArray(avantages)) return avantages.map(String);
    if (typeof avantages === "string") {
      try {
        const parsed = JSON.parse(avantages);
        return Array.isArray(parsed) ? parsed.map(String) : [avantages];
      } catch {
        return [avantages];
      }
    }
    return [];
  };

  const calculs = useMemo(() => {
    if (!formData.offre_id || !formData.superficie_prevue || !offres) return null;
    const offre = offres.find((o) => o.id === formData.offre_id);
    if (!offre) return null;

    const ha = Number(formData.superficie_prevue);
    const o = offre as any;
    const tranches = Array.isArray(o.tranches_paiement) ? o.tranches_paiement : [];
    const pricingMode = "echeancier";
    const prix = calculPrixEffectif(o, promotionActive ? [promotionActive as any] : [], { modePaiement: pricingMode });

    const piUnitaireBase = Number((prix as any).depot_initial_base || 0);
    const piUnitaireFinal = Number((prix as any).depot_initial_effectif || 0);
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
  }, [formData.offre_id, formData.superficie_prevue, promotionActive, offres]);

  if (isLoading) return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">Commercial</CardTitle>
          <CardDescription>Commercial ayant réalisé la vente. Recherchez un commercial ou sélectionnez-le dans la liste.</CardDescription>
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
          <CardDescription>Sélectionnez une offre puis sa formule. Les détails s'affichent uniquement après sélection.</CardDescription>
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
                    updateFormData({
                      offre_id: selectedFamily ? formData.offre_id : first.id,
                      offre_code: selectedFamily ? formData.offre_code : first.code,
                      offre: selectedFamily ? formData.offre : first,
                      type_client: first.type_offre === "sans_terre" ? "sans_terre" : "avec_terre",
                    });
                  }}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Sprout className="h-5 w-5 text-primary" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-primary">{familleLabel}</span>
                    <span className="block text-xs text-muted-foreground">{familyOffers.length} formule{familyOffers.length > 1 ? "s" : ""} disponible{familyOffers.length > 1 ? "s" : ""}</span>
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">{selectedFamily ? "Ouvert" : "Choisir"}</span>
                </button>

                {selectedFamily && (
                  <div className="border-t px-3 pb-3 pt-3 sm:px-4">
                    <Label className="text-xs">Formule</Label>
                    <Select
                      value={formData.offre_id || ""}
                      onValueChange={(value) => {
                        const selected = familyOffers.find((o) => o.id === value);
                        if (!selected) return;
                        updateFormData({
                          offre_id: value,
                          offre_code: selected.code,
                          offre: selected,
                          type_client: selected.type_offre === "sans_terre" ? "sans_terre" : "avec_terre",
                          ...(selected.type_offre === "sans_terre" ? {} : { parcelle_id: null }),
                        });
                      }}
                    >
                      <SelectTrigger className="mt-1 w-full min-w-0"><SelectValue placeholder="Sélectionner une formule" /></SelectTrigger>
                      <SelectContent>
                        {familyOffers.map((o) => <SelectItem key={o.id} value={o.id}>{o.formule_nom || o.nom}</SelectItem>)}
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
          <CardDescription>Indiquez la superficie pour calculer automatiquement le Paiement Initial, les mensualités et le coût total selon la formule sélectionnée.</CardDescription>
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
              required
            />
          </div>

          {calculs && (
            <div className="p-4 bg-primary/10 rounded-lg space-y-3">
              <div className="flex justify-between text-sm"><span>Superficie:</span><span className="font-medium">{calculs.ha} ha</span></div>
              <div className="flex justify-between text-sm"><span>Paiement Initial{calculs.promoCible === "paiement_initial" ? " (promo)" : ""}:</span><span className="font-bold text-primary">{formatMontant(calculs.totalPI)} F</span></div>
              <div className="border-t pt-2 flex justify-between"><span className="font-semibold">Coût global contractuel{calculs.promoCible === "cout_global" ? " (promo)" : ""}:</span><span className="text-lg font-bold text-primary">{formatMontant(calculs.totalFinal)} F</span></div>
              {calculs.promotionAppliquee && <div className="flex items-center gap-1 text-xs text-amber-600"><Sparkles className="h-3 w-3" /><span>Promo -{calculs.promoReduction}% appliquée sur {calculs.promoCible}</span></div>}
            </div>
          )}
        </CardContent>
      </Card>

      {formData.offre_id && offres && (
        <Card>
          <CardHeader><CardTitle>Récapitulatif de l'Offre</CardTitle></CardHeader>
          <CardContent>
            {(() => {
              const offre = offres.find((o) => o.id === formData.offre_id);
              if (!offre) return null;
              const avantagesList = parseAvantages(offre.avantages);
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div><span className="text-muted-foreground">Offre:</span><p className="font-medium">{offre.nom}</p></div>
                    <div><span className="text-muted-foreground">Type:</span><p className="font-medium">{offre.description}</p></div>
                  </div>
                  {avantagesList.length > 0 && <div className="border-t pt-4"><h4 className="font-medium mb-2">Avantages inclus:</h4><ul className="space-y-1">{avantagesList.map((avantage, idx) => <li key={idx} className="flex items-start gap-2 text-sm"><Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" /><span>{avantage}</span></li>)}</ul></div>}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
