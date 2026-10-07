import { describe, it, expect } from "vitest";

function validateFoncier(form: any, lot?: { convention_id: string; statut: string }) {
  const t = form.type_souscripteur_foncier || (form.type_souscripteur === "avec_terre" ? "OWN" : "EXT");
  if (t === "EXT") {
    if (!form.convention_id || !form.lot_id) return "Convention et lot obligatoires";
    if (!lot) return "Lot introuvable";
    if (lot.convention_id !== form.convention_id) return "Lot n'appartient pas à la convention";
    if (lot.statut !== "disponible") return "Lot non disponible";
  }
  return null;
}

describe("Validation foncière V3 (EXT/OWN)", () => {
  it("EXT exige convention_id + lot_id", () => {
    expect(validateFoncier({ type_souscripteur_foncier: "EXT" })).toMatch(/obligatoires/);
  });
  it("EXT rejette lot d'une autre convention", () => {
    expect(validateFoncier(
      { type_souscripteur_foncier: "EXT", convention_id: "c1", lot_id: "l1" },
      { convention_id: "c2", statut: "disponible" }
    )).toMatch(/n'appartient pas/);
  });
  it("EXT rejette lot non disponible", () => {
    expect(validateFoncier(
      { type_souscripteur_foncier: "EXT", convention_id: "c1", lot_id: "l1" },
      { convention_id: "c1", statut: "attribue" }
    )).toMatch(/non disponible/);
  });
  it("EXT accepte lot disponible cohérent", () => {
    expect(validateFoncier(
      { type_souscripteur_foncier: "EXT", convention_id: "c1", lot_id: "l1" },
      { convention_id: "c1", statut: "disponible" }
    )).toBeNull();
  });
  it("OWN n'exige rien", () => {
    expect(validateFoncier({ type_souscripteur_foncier: "OWN" })).toBeNull();
  });
});
