import { describe, expect, it } from "vitest";
import { OFFICIAL_ROLE_CODES, PERMISSIONS, ROLES } from "@/lib/roles";
import { PERMISSION_CODES } from "@/lib/permissions";

describe("RBAC — catalogue canonique", () => {
  it("n'expose plus le rôle obsolète super_admin", () => {
    expect(OFFICIAL_ROLE_CODES).not.toContain("super_admin");
    expect(Object.values(ROLES)).not.toContain("super_admin");
  });

  it("conserve le PDG comme rôle d'administration globale", () => {
    expect(OFFICIAL_ROLE_CODES).toContain(ROLES.PDG);
    expect(PERMISSION_CODES).toContain(PERMISSIONS.MANAGE_ROLES);
    expect(PERMISSION_CODES).toContain(PERMISSIONS.MANAGE_SYSTEM);
  });

  it("ne contient aucun doublon de permission", () => {
    expect(new Set(PERMISSION_CODES).size).toBe(PERMISSION_CODES.length);
  });
});
