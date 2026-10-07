/**
 * Moteur unique de calcul des prix AgriCapital.
 * PI = Paiement Initial.
 * Une promotion PI réduit uniquement le PI.
 * Une promotion prix global réduit le total puis conserve la structure
 * An 1 / An 2 / An 3 de l'offre en appliquant un coefficient à chaque tranche.
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
}

export interface TrancheEffective extends TranchePaiement {
  montant_effectif_par_ha?: number;
  mensualite_par_ha_effective?: number;
  total_periode_par_ha_effectif?: number;
}

export interface PrixEffectif {
  offre_id: string; code: string; nom: string;
  montant_total_base: number; pi_base: number; mensualite_base: number;
  montant_total_effectif: number; pi_effectif: number; mensualite_effective: number;
  tranches_effectives: TrancheEffective[];
  promotion_id: string | null; promotion_nom: string | null; promotion_cible: string | null;
  reduction_pct: number; reduction_montant: number;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const promotionCible = (p?: PromotionBase | null): "paiement_initial" | "cout_global" => {
  const cible = String(p?.cible || p?.type_promotion || "paiement_initial").toLowerCase().trim();
  return ["cout_global", "coût_global", "total_contrat", "cg", "special"].includes(cible)
    ? "cout_global" : "paiement_initial";
};

export const promotionActiveMaintenant = (p: PromotionBase, at: Date = new Date()) => {
  if (!p.active) return false;
  if (p.date_debut && new Date(p.date_debut) > at) return false;
  if (p.date_fin && new Date(p.date_fin) < at) return false;
  return true;
};

const cibleOffre = (p: PromotionBase, offreId: string) => {
  if (p.applique_toutes_offres) return true;
  const ids = Array.isArray(p.offre_ids) ? p.offre_ids.map(String) : [];
  return ids.includes(String(offreId));
};

export const promotionsEligibles = (offre: OffreBase, promotions: PromotionBase[], at: Date = new Date()) =>
  promotions.filter(p => promotionActiveMaintenant(p, at) && cibleOffre(p, offre.id))
    .sort((a,b) =>
      num(b.pourcentage_reduction)-num(a.pourcentage_reduction) ||
      num(b.montant_fixe_reduction)-num(a.montant_fixe_reduction) ||
      String(b.created_at||"").localeCompare(String(a.created_at||"")));

export const meilleurePromotion = (offre: OffreBase, promotions: PromotionBase[], at: Date = new Date()) =>
  promotionsEligibles(offre, promotions, at)[0] || null;

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
  return [{ annee: 1, mois_debut: 1, mois_fin: duree, mois: duree,
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
  options: { modePaiement?: "echeancier" | "comptant"; at?: Date } = {},
): PrixEffectif => {
  const mode = options.modePaiement || "echeancier";
  const promo = meilleurePromotion(offre, promotions, options.at);
  const cible = promo ? promotionCible(promo) : null;
  const pct = num(promo?.pourcentage_reduction);
  const fixe = num(promo?.montant_fixe_reduction);
  const piBase = Math.max(0, num(offre.montant_pi_par_ha));
  const cashBase = Math.max(0, num(offre.montant_cash_par_ha));
  const totalBase = mode === "comptant" && cashBase > 0 ? cashBase : Math.max(0, num(offre.montant_total_par_ha));
  const monthlyBase = Math.max(0, num(offre.mensualite_par_ha));
  const tranches = normaliserTranches(offre);

  if (!promo) return {
    offre_id: offre.id, code: offre.code, nom: offre.nom,
    montant_total_base: totalBase, pi_base: mode==="comptant"?totalBase:piBase,
    mensualite_base: monthlyBase, montant_total_effectif: totalBase,
    pi_effectif: mode==="comptant"?totalBase:piBase, mensualite_effective: monthlyBase,
    tranches_effectives: effectiveTranches(tranches, 1, null),
    promotion_id:null, promotion_nom:null, promotion_cible:null, reduction_pct:0, reduction_montant:0,
  };

  if (mode === "comptant") {
    const effective = cible === "cout_global" ? Math.max(totalBase*(1-pct/100)-fixe,0) : totalBase;
    return {
      offre_id:offre.id, code:offre.code, nom:offre.nom,
      montant_total_base:totalBase, pi_base:totalBase, mensualite_base:0,
      montant_total_effectif:effective, pi_effectif:effective, mensualite_effective:0,
      tranches_effectives:[], promotion_id:promo.id, promotion_nom:promo.nom,
      promotion_cible:cible, reduction_pct:pct, reduction_montant:totalBase-effective,
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
      montant_total_base:totalBase, pi_base:piBase, mensualite_base:monthlyBase,
      montant_total_effectif:totalEff, pi_effectif:piEff,
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
    montant_total_base:totalBase, pi_base:piBase, mensualite_base:monthlyBase,
    montant_total_effectif:totalEff, pi_effectif:piEff, mensualite_effective:monthlyBase,
    tranches_effectives:effectiveTranches(tranches), promotion_id:promo.id, promotion_nom:promo.nom,
    promotion_cible:cible, reduction_pct:pct, reduction_montant:totalBase-totalEff,
  };
};

export const prixEffectif = (offre: OffreBase, promotions: PromotionBase[], at: Date = new Date()) =>
  calculPrixEffectif(offre, promotions, { at });

export const formatF = (v: number | null | undefined) => `${Number(v || 0).toLocaleString("fr-FR")} F`;
