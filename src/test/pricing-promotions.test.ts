import { describe, expect, it } from "vitest";
import { calculPrixEffectif, meilleurePromotion, type OffreBase, type PromotionBase } from "@/lib/pricing";

const offer: OffreBase = {
  id: "offer-1",
  code: "PALM-1",
  nom: "Offre test",
  actif: true,
  montant_pi_par_ha: 20_000,
  montant_total_par_ha: 100_000,
  montant_cash_par_ha: 100_000,
  mensualite_par_ha: 2_000,
  duree_paiement_mois: 40,
};

const promotion = (overrides: Partial<PromotionBase> = {}): PromotionBase => ({
  id: "promo",
  nom: "Promotion test",
  active: true,
  cible: "paiement_initial",
  type_promotion: "paiement_initial",
  pourcentage_reduction: 0,
  montant_fixe_reduction: 0,
  date_debut: "2026-01-01T00:00:00.000Z",
  date_fin: "2027-01-01T23:59:59.999Z",
  applique_toutes_offres: true,
  offre_ids: [],
  created_at: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("promotion pricing consistency", () => {
  it("chooses the promotion with the greatest real monetary reduction", () => {
    const piPromo = promotion({ id: "pi", pourcentage_reduction: 50 });
    const globalPromo = promotion({
      id: "global",
      cible: "cout_global",
      type_promotion: "cout_global",
      pourcentage_reduction: 20,
      created_at: "2026-02-01T00:00:00.000Z",
    });

    expect(meilleurePromotion(offer, [piPromo, globalPromo], new Date("2026-10-24T12:00:00.000Z"))?.id).toBe("global");
    const price = calculPrixEffectif(offer, [piPromo, globalPromo], { at: new Date("2026-10-24T12:00:00.000Z") });
    expect(price.montant_total_effectif).toBe(80_000);
    expect(price.pi_effectif).toBe(20_000);
    expect(price.reduction_montant).toBe(20_000);
  });

  it("supports a fixed-only initial-payment reduction", () => {
    const price = calculPrixEffectif(offer, [promotion({ montant_fixe_reduction: 5_000 })], {
      at: new Date("2026-10-24T12:00:00.000Z"),
    });
    expect(price.pi_effectif).toBe(15_000);
    expect(price.montant_total_effectif).toBe(95_000);
    expect(price.reduction_montant).toBe(5_000);
  });

  it("does not apply a targeted promotion to another offer", () => {
    const targeted = promotion({ applique_toutes_offres: false, offre_ids: ["another-offer"], pourcentage_reduction: 30 });
    const price = calculPrixEffectif(offer, [targeted], { at: new Date("2026-10-24T12:00:00.000Z") });
    expect(price.promotion_id).toBeNull();
    expect(price.montant_total_effectif).toBe(100_000);
  });

  it("ignores promotions outside their validity window", () => {
    const future = promotion({ pourcentage_reduction: 30, date_debut: "2027-01-01T00:00:00.000Z" });
    const price = calculPrixEffectif(offer, [future], { at: new Date("2026-10-24T12:00:00.000Z") });
    expect(price.promotion_id).toBeNull();
    expect(price.pi_effectif).toBe(20_000);
  });
});
