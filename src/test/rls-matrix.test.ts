import { describe, it, expect } from "vitest";

type Action = "select" | "insert" | "update" | "delete";
type Role = "anon" | "user" | "staff" | "admin";

const matrix: Record<string, Partial<Record<Action, Role[]>>> = {
  souscripteurs: { insert: ["staff","admin"], update: ["staff","admin"], delete: ["admin"] },
  paiements: { insert: ["staff","admin"], update: ["staff","admin"], delete: ["admin"] },
  conventions_foncieres: { insert: ["staff","admin"], update: ["staff","admin"], delete: ["admin"] },
  lots_hectares: { insert: ["staff","admin"], update: ["staff","admin"], delete: ["admin"] },
  account_requests: { insert: ["anon","user","staff","admin"], update: ["admin"] },
  offres: { select: ["anon","user","staff","admin"], insert: ["admin"], delete: ["admin"] },
};

describe("Matrice RLS attendue (spec)", () => {
  it("anon ne peut écrire que sur account_requests", () => {
    for (const [t, ops] of Object.entries(matrix)) {
      if (t === "account_requests") continue;
      expect(ops.insert?.includes("anon"), `${t} insert anon`).toBeFalsy();
    }
  });
  it("user ne peut JAMAIS supprimer", () => {
    for (const ops of Object.values(matrix)) {
      expect(ops.delete?.includes("user")).toBeFalsy();
    }
  });
  it("staff/admin requis pour souscripteurs/paiements/conventions/lots", () => {
    for (const t of ["souscripteurs","paiements","conventions_foncieres","lots_hectares"]) {
      const ins = matrix[t].insert!;
      expect(ins).toEqual(expect.arrayContaining(["staff","admin"]));
      expect(ins.includes("user")).toBe(false);
    }
  });
  it("DELETE sur tables critiques = admin uniquement", () => {
    for (const t of ["souscripteurs","paiements","conventions_foncieres","lots_hectares"]) {
      expect(matrix[t].delete).toEqual(["admin"]);
    }
  });
  it("offres lisibles publiquement", () => {
    expect(matrix.offres.select).toEqual(expect.arrayContaining(["anon","user"]));
  });
});
