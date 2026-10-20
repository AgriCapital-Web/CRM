import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { normalizeRoles } from "@/lib/roles";
import { cachePermissionMatrix, getCachedPermissionMatrix } from "@/lib/offlineDb";

type PermissionMatrix = Record<string, string[]>;
type PermissionMatrixResult = {
  matrix: PermissionMatrix;
  fromDatabase: boolean;
};

async function fetchRolePermissionMatrix(): Promise<PermissionMatrixResult> {
  try {
    const { data, error } = await (supabase as any)
      .from("role_permissions")
      .select("role_code, permission_code");

    if (!error && data && data.length > 0) {
      const matrix: PermissionMatrix = {};
      for (const row of data as any[]) {
        (matrix[row.role_code] ||= []).push(row.permission_code);
      }

      // Persist for offline use, but a local cache failure must not discard a
      // valid response from the database.
      try {
        await cachePermissionMatrix(matrix);
      } catch {
        // Best-effort offline cache.
      }
      return { matrix, fromDatabase: true };
    }
  } catch {
    // Fall back to the last known permission matrix below.
  }

  try {
    const cached = await getCachedPermissionMatrix();
    return { matrix: cached || {}, fromDatabase: false };
  } catch {
    return { matrix: {}, fromDatabase: false };
  }
}

/**
 * Shared, cached role -> permissions matrix. Reusing the QueryClient cache
 * prevents every route mount from reloading the same 438-row matrix and
 * briefly blanking protected pages during navigation.
 */
export function useRolePermissionMatrix() {
  const query = useQuery({
    queryKey: ["role-permission-matrix"],
    queryFn: fetchRolePermissionMatrix,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  return {
    matrix: query.data?.matrix || {},
    loading: query.isPending,
    fromDatabase: query.data?.fromDatabase || false,
    reload: async () => {
      await query.refetch();
    },
  };
}

/** Permissions effectives de l'utilisateur connecté */
export function usePermissions() {
  const { userRoles, primaryRole } = useAuth();
  const { matrix, loading, fromDatabase, reload } = useRolePermissionMatrix();

  const roles = useMemo(() => normalizeRoles(userRoles || []), [userRoles]);
  // super_admin a été supprimé du catalogue officiel. Aucun bypass statique.
  const isSuperAdmin = false;
  // Le contournement administrateur dépend du rôle explicitement principal.
  const isPdg = primaryRole === "pdg";
  const isDg = primaryRole === "dg";

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
