import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { normalizeRoles } from "@/lib/roles";
import { cachePermissionMatrix, getCachedPermissionMatrix } from "@/lib/offlineDb";


/**
 * Charge la matrice rôle → permissions exclusivement depuis la base (`role_permissions`).
 * Une erreur ou une matrice vide ne donne aucun droit par défaut.
 */
export function useRolePermissionMatrix() {
  const [matrix, setMatrix] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [fromDatabase, setFromDatabase] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("role_permissions")
        .select("role_code, permission_code");
      if (error || !data || data.length === 0) {
        const cached = await getCachedPermissionMatrix();
        setMatrix(cached || {});
        setFromDatabase(Boolean(cached));
      } else {
        const next: Record<string, string[]> = {};
        for (const row of data as any[]) {
          (next[row.role_code] ||= []).push(row.permission_code);
        }
        setMatrix(next);
        setFromDatabase(true);
        await cachePermissionMatrix(next);
      }
    } catch {
      const cached = await getCachedPermissionMatrix();
      setMatrix(cached || {});
      setFromDatabase(Boolean(cached));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return { matrix, loading, fromDatabase, reload: load };
}

/** Permissions effectives de l'utilisateur connecté */
export function usePermissions() {
  const { userRoles } = useAuth();
  const { matrix, loading, fromDatabase, reload } = useRolePermissionMatrix();

  const roles = useMemo(() => normalizeRoles(userRoles || []), [userRoles]);
  // super_admin a été supprimé du catalogue officiel. Aucun bypass statique.
  const isSuperAdmin = false;
  const isPdg = roles.includes("pdg");
  const isDg = roles.includes("dg");

  const granted = useMemo(() => {
    const set = new Set<string>();
    roles.forEach((role) => (matrix[role] || []).forEach((p) => set.add(p)));
    return set;
  }, [roles, matrix]);

  // PDG/DG sont administrateurs globaux en DB. Le frontend ne maintient donc
  // aucune seconde liste de droits pour décider ce qu'un global admin peut voir.
  const can = (permission: string) => (isPdg || isDg) ? true : granted.has(permission);
  const canAny = (...permissions: string[]) => permissions.some(can);
  const canAll = (...permissions: string[]) => permissions.every(can);

  return { can, canAny, canAll, roles, isSuperAdmin, isPdg, isDg, permissions: granted, loading, fromDatabase, reload };
}
