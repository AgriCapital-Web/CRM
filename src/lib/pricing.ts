/**
 * Moteur unique de calcul des prix AgriCapital.
 * PI = Paiement Initial.
 * Une promotion PI réduit uniquement le PI.
 * Une promotion prix global réduit le total puis conserve la structure
 * de mensualité uniforme ou les tranches explicitement configurées.
 */
export interface TranchePaiement {
  mois?: number | null;
  mois_debut?: number | null;
  mois_fin?: number | null;
  annee?: number | null;
  type?: string | null;
  montant?: number | null;
  mensualite_par_ha?: number | null;
  total_periode_par_ha?: number | null;
  declencheur?: string | null;
  [key: string]: unknown;
}

export interface OffreBase {
  id: string; code: string; nom: string;
  montant_total_par_ha?: number | null;
  montant_pi_par_ha?: number | null;
  mensualite_par_ha?: number | null;
  montant_cash_par_ha?: number | null;
  duree_paiement_mois?: number | null;
  tranches_paiement?: TranchePaiement[] | null;
  actif?: boolean | null;
}

export interface PromotionBase {
  id: string; nom: string;
  cible?: string | null; type_promotion?: string | null;
  pourcentage_reduction?: number | null;
  montant_fixe_reduction?: number | null;
  active?: boolean | null;
  date_debut?: string | null; date_fin?: string | null;
  applique_toutes_offres?: boolean | null; offre_ids?: unknown;
  created_at?: string | null;
  surface_min_ha?: number | null;
  arrondi_mensualite?: number | null;
}

export interface TrancheEffective extends TranchePaiement {
  montant_effectif_par_ha?: number;
  mensualite_par_ha_effective?: number;
  total_periode_par_ha_effectif?: number;
}

export interface PrixEffectif {
  offre_id: string; code: string; nom: string;
  montant_total_base: number; pi_base: number; cash_base: number; mensualite_base: number;
  montant_total_effectif: number; pi_effectif: number; cash_effectif: number; mensualite_effective: number;
  tranches_effectives: TrancheEffective[];
  promotion_id: string | null; promotion_nom: string | null; promotion_cible: string | null;
  reduction_pct: number; reduction_montant: number;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const promotionCible = (p?: PromotionBase | null): "paiement_initial" | "cout_global" | "mensualites" => {
  const cible = String(p?.cible || p?.type_promotion || "paiement_initial").toLowerCase().trim();
  if (["mensualites", "mensualité", "mensualite", "monthly"].includes(cible)) return "mensualites";
  return ["cout_global", "coût_global", "total_contrat", "cg", "special"].includes(cible)
    ? "cout_global" : "paiement_initial";
};

export const promotionActiveMaintenant = (p: PromotionBase, at: Date = new Date()) => {
  if (!p.active) return false;
  if (p.date_debut && new Date(p.date_debut) > at) return false;
  if (p.date_fin && new Date(p.date_fin) < at) return false;
  return true;
};

const cibleOffre = (p: PromotionBase, offre: OffreBase) => {
  if (p.applique_toutes_offres) return true;
  const ids = Array.isArray(p.offre_ids) ? p.offre_ids.map(String) : [];
  return ids.includes(String(offre.id)) || ids.includes(String(offre.code || ""));
};

const reductionPotentielle = (
  offre: OffreBase,
  promotion: PromotionBase,
  modePaiement: "echeancier" | "comptant" = "echeancier",
  superficieHa = 0,
) => {
  const cible = promotionCible(promotion);
  const seuilSurface = Math.max(0, num(promotion.surface_min_ha));
  if (seuilSurface > 0 && superficieHa < seuilSurface) return 0;
  const pct = Math.min(100, Math.max(0, num(promotion.pourcentage_reduction))) / 100;
  const fixe = Math.max(0, num(promotion.montant_fixe_reduction));
  const cash = Math.max(0, num(offre.montant_cash_par_ha));
  const total = modePaiement === "comptant" && cash > 0
    ? cash : Math.max(0, num(offre.montant_total_par_ha));
  if (cible === "mensualites") {
    if (modePaiement === "comptant") return 0;
    const monthlyBase = normaliserTranches(offre).reduce((sum, tranche) => {
      const monthly = Math.max(0, num(tranche.mensualite_par_ha));
      const months = Math.max(0, num(tranche.mois) || (num(tranche.mois_fin) > 0 && num(tranche.mois_debut) > 0 ? num(tranche.mois_fin) - num(tranche.mois_debut) + 1 : 0));
      return sum + monthly * months;
    }, 0);
    return Math.min(monthlyBase, Math.max(0, monthlyBase * pct + fixe));
  }
  const assiette = cible === "cout_global"
    ? total
    : modePaiement === "comptant" ? 0 : Math.max(0, num(offre.montant_pi_par_ha));
  return Math.min(assiette, Math.max(0, assiette * pct + fixe));
};

export const promotionsEligibles = (
  offre: OffreBase,
  promotions: PromotionBase[],
  at: Date = new Date(),
  modePaiement: "echeancier" | "comptant" = "echeancier",
  superficieHa = 0,
) =>
  promotions.filter(p =>
    promotionActiveMaintenant(p, at) &&
    cibleOffre(p, offre) &&
    reductionPotentielle(offre, p, modePaiement, superficieHa) > 0
  ).sort((a, b) =>
    reductionPotentielle(offre, b, modePaiement, superficieHa) - reductionPotentielle(offre, a, modePaiement, superficieHa) ||
    num(b.pourcentage_reduction) - num(a.pourcentage_reduction) ||
    String(b.created_at || "").localeCompare(String(a.created_at || ""))
  );

export const meilleurePromotion = (
  offre: OffreBase,
  promotions: PromotionBase[],
  at: Date = new Date(),
  modePaiement: "echeancier" | "comptant" = "echeancier",
  superficieHa = 0,
) => promotionsEligibles(offre, promotions, at, modePaiement, superficieHa)[0] || null;

const trancheBase = (t: TranchePaiement) => {
  const mensualite = Math.max(0, num(t.mensualite_par_ha));
  const mois = Math.max(0, num(t.mois) || (num(t.mois_fin)>0 && num(t.mois_debut)>0
    ? num(t.mois_fin)-num(t.mois_debut)+1 : 0));
  const totalPeriode = mensualite > 0 && mois > 0 ? mensualite*mois : Math.max(0, num(t.total_periode_par_ha));
  return { mensualite, mois, totalPeriode, montant: Math.max(0, num(t.montant)) };
};

export const normaliserTranches = (offre: OffreBase): TranchePaiement[] => {
  const tranches = Array.isArray(offre.tranches_paiement) ? offre.tranches_paiement : [];
  if (tranches.length) return tranches;
  const duree = Math.max(0, num(offre.duree_paiement_mois));
  const mensualite = Math.max(0, num(offre.mensualite_par_ha));
  if (!duree || !mensualite) return [];
  return [{ type: "mensualite_unique", mois_debut: 1, mois_fin: duree, mois: duree,
    mensualite_par_ha: mensualite, total_periode_par_ha: mensualite*duree }];
};

const effectiveTranches = (tranches: TranchePaiement[], ratio = 1, cible: "paiement_initial" | "cout_global" | null = null): TrancheEffective[] =>
  tranches.map(t => {
    const b = trancheBase(t);
    const isInitial = String(t.type || "").toLowerCase() === "paiement_initial" || (b.mensualite === 0 && b.montant > 0);
    const applyRatio = cible === "cout_global" && !isInitial;
    return {
      ...t,
      montant_effectif_par_ha: b.montant,
      mensualite_par_ha_effective: applyRatio ? b.mensualite * ratio : b.mensualite,
      total_periode_par_ha_effectif: applyRatio ? b.totalPeriode * ratio : b.totalPeriode,
    };
  });

export const calculPrixEffectif = (
  offre: OffreBase,
  promotions: PromotionBase[],
  options: { modePaiement?: "echeancier" | "comptant"; at?: Date; superficieHa?: number } = {},
): PrixEffectif => {
  const mode = options.modePaiement || "echeancier";
  const superficieHa = Math.max(0, num(options.superficieHa));
  const promo = meilleurePromotion(offre, promotions, options.at, mode, superficieHa);
  const cible = promo ? promotionCible(promo) : null;
  const pct = Math.min(100, Math.max(0, num(promo?.pourcentage_reduction)));
  const fixe = Math.max(0, num(promo?.montant_fixe_reduction));
  const piBase = Math.max(0, num(offre.montant_pi_par_ha));
  const cashBase = Math.max(0, num(offre.montant_cash_par_ha));
  const totalBase = mode === "comptant" && cashBase > 0 ? cashBase : Math.max(0, num(offre.montant_total_par_ha));
  const monthlyBase = Math.max(0, num(offre.mensualite_par_ha));
  const tranches = normaliserTranches(offre);

  if (!promo) return {
    offre_id: offre.id, code: offre.code, nom: offre.nom,
    montant_total_base: totalBase, pi_base: mode==="comptant"?totalBase:piBase, cash_base: cashBase,
    mensualite_base: monthlyBase, montant_total_effectif: totalBase,
    pi_effectif: mode==="comptant"?totalBase:piBase, cash_effectif: mode==="comptant"?totalBase:cashBase, mensualite_effective: monthlyBase,
    tranches_effectives: effectiveTranches(tranches, 1, null),
    promotion_id:null, promotion_nom:null, promotion_cible:null, reduction_pct:0, reduction_montant:0,
  };

  if (mode === "comptant") {
    const effective = cible === "cout_global" ? Math.max(totalBase*(1-pct/100)-fixe,0) : totalBase;
    return {
      offre_id:offre.id, code:offre.code, nom:offre.nom,
      montant_total_base:totalBase, pi_base:totalBase, cash_base: cashBase, mensualite_base:0,
      montant_total_effectif:effective, pi_effectif:effective, cash_effectif:effective, mensualite_effective:0,
      tranches_effectives:[], promotion_id:promo.id, promotion_nom:promo.nom,
      promotion_cible:cible, reduction_pct:pct, reduction_montant:totalBase-effective,
    };
  }

  if (cible === "mensualites") {
    const rounding = Math.max(1, num(promo?.arrondi_mensualite) || 1);
    const discountedTranches = tranches.map((t) => {
      const base = trancheBase(t);
      const isInitial = String(t.type || "").toLowerCase() === "paiement_initial" || (base.mensualite === 0 && base.montant > 0);
      if (isInitial || base.mensualite <= 0) return {
        ...t,
        montant_effectif_par_ha: base.montant,
        mensualite_par_ha_effective: base.mensualite,
        total_periode_par_ha_effectif: base.totalPeriode,
      };
      const monthly = Math.round((base.mensualite * (1 - pct / 100) - (fixe / Math.max(1, base.mois))) / rounding) * rounding;
      return {
        ...t,
        montant_effectif_par_ha: base.montant,
        mensualite_par_ha_effective: Math.max(0, monthly),
        total_periode_par_ha_effectif: Math.max(0, monthly) * base.mois,
      };
    });
    const monthlyTotal = discountedTranches.reduce((sum, t) => {
      const base = trancheBase(t);
      const isInitial = String(t.type || "").toLowerCase() === "paiement_initial" || (base.mensualite === 0 && base.montant > 0);
      return sum + (isInitial ? 0 : num(t.mensualite_par_ha_effective) * base.mois);
    }, 0);
    const monthlyValues = discountedTranches.filter(t => num(t.mensualite_par_ha_effective) > 0)
      .map(t => num(t.mensualite_par_ha_effective));
    const totalEff = piBase + monthlyTotal;
    return {
      offre_id: offre.id, code: offre.code, nom: offre.nom,
      montant_total_base: totalBase, pi_base: piBase, cash_base: cashBase, mensualite_base: monthlyBase,
      montant_total_effectif: totalEff, pi_effectif: piBase, cash_effectif: cashBase,
      mensualite_effective: monthlyValues[0] || 0,
      tranches_effectives: discountedTranches,
      promotion_id: promo.id, promotion_nom: promo.nom, promotion_cible: cible,
      reduction_pct: pct, reduction_montant: Math.max(0, totalBase - totalEff),
    };
  }

  if (cible === "cout_global") {
    const totalEff = Math.max(totalBase*(1-pct/100)-fixe,0);
    const piEff = Math.min(piBase,totalEff);
    const remainingBase = Math.max(totalBase-piBase,0);
    const remainingEff = Math.max(totalEff-piEff,0);
    const ratio = remainingBase > 0 ? remainingEff/remainingBase : 1;
    const tranchesEff = effectiveTranches(tranches, ratio, cible);
    const monthlyValues = tranchesEff.filter(t=>num(t.mensualite_par_ha_effective)>0)
      .map(t=>num(t.mensualite_par_ha_effective));
    return {
      offre_id:offre.id, code:offre.code, nom:offre.nom,
      montant_total_base:totalBase, pi_base:piBase, cash_base: cashBase, mensualite_base:monthlyBase,
      montant_total_effectif:totalEff, pi_effectif:piEff,
      cash_effectif: Math.max(cashBase*(1-pct/100)-fixe,0),
      mensualite_effective:monthlyValues[monthlyValues.length-1] || 0,
      tranches_effectives:tranchesEff, promotion_id:promo.id, promotion_nom:promo.nom,
      promotion_cible:cible, reduction_pct:pct, reduction_montant:totalBase-totalEff,
    };
  }

  // Promotion PI : aucune autre tranche n'est modifiée.
  const piEff = Math.max(piBase*(1-pct/100)-fixe,0);
  const totalEff = Math.max(totalBase-(piBase-piEff),0);
  return {
    offre_id:offre.id, code:offre.code, nom:offre.nom,
    montant_total_base:totalBase, pi_base:piBase, cash_base: cashBase, mensualite_base:monthlyBase,
    montant_total_effectif:totalEff, pi_effectif:piEff,
    cash_effectif: cashBase, mensualite_effective:monthlyBase,
    tranches_effectives:effectiveTranches(tranches), promotion_id:promo.id, promotion_nom:promo.nom,
    promotion_cible:cible, reduction_pct:pct, reduction_montant:totalBase-totalEff,
  };
};

export const prixEffectif = (offre: OffreBase, promotions: PromotionBase[], at: Date = new Date()) =>
  calculPrixEffectif(offre, promotions, { at });

export const formatF = (v: number | null | undefined) => `${Number(v || 0).toLocaleString("fr-FR")} F`;
