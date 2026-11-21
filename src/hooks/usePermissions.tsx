import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cachePermissionMatrix, getCachedPermissionMatrix } from "@/lib/offlineDb";

type PermissionMatrix = Record<string, string[]>;
type PermissionMatrixResult = {
  matrix: PermissionMatrix;
  fromDatabase: boolean;
};

const effectivePermissionsKey = (userId: string) => `__effective_permissions__:${userId}`;

/**
 * The database returns the effective permission set for the signed-in user.
 * The client does not combine role names, hard-coded exceptions, or a local
 * role-to-permission matrix to decide which actions are available.
 */
async function fetchEffectivePermissions(userId: string): Promise<PermissionMatrixResult> {
  try {
    const { data, error } = await (supabase as any).rpc("crm_current_user_permissions");
    if (error) throw error;

    const permissions = Array.isArray(data)
      ? data.filter((value): value is string => typeof value === "string")
      : [];

    const matrix = { [effectivePermissionsKey(userId)]: permissions };
    try {
      await cachePermissionMatrix(matrix);
    } catch {
      // The database response remains authoritative even if offline caching fails.
    }
    return { matrix, fromDatabase: true };
  } catch {
    // Offline mode may use only the last effective set returned by the database.
    // The previous role matrix is deliberately not reconstructed in the browser.
    try {
      const cached = await getCachedPermissionMatrix();
      return {
        matrix: {
          [effectivePermissionsKey(userId)]: cached?.[effectivePermissionsKey(userId)] || [],
        },
        fromDatabase: false,
      };
    } catch {
      return { matrix: { [effectivePermissionsKey(userId)]: [] }, fromDatabase: false };
    }
  }
}

function useEffectivePermissionSnapshot() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["effective-permissions", user?.id || "anonymous"],
    queryFn: () => fetchEffectivePermissions(user!.id),
    enabled: Boolean(user?.id),
    staleTime: 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  return {
    matrix: query.data?.matrix || {},
    loading: Boolean(user?.id) && query.isPending,
    fromDatabase: query.data?.fromDatabase || false,
    reload: async () => {
      if (user?.id) await query.refetch();
    },
  };
}

/** Matrice rôle → permissions. Accessible uniquement aux profils autorisés par la RLS de role_permissions. */
export function useRolePermissionMatrix() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["role-permission-matrix", user?.id || "anonymous"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("role_permissions")
        .select("role_code,permission_code")
        .order("role_code")
        .order("permission_code");
      if (error) throw error;
      const matrix: PermissionMatrix = {};
      for (const row of data ?? []) {
        if (!row?.role_code || !row?.permission_code) continue;
        const permissions = matrix[row.role_code] ?? [];
        if (!permissions.includes(row.permission_code)) permissions.push(row.permission_code);
        matrix[row.role_code] = permissions;
      }
      return matrix;
    },
    enabled: Boolean(user?.id),
    staleTime: 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  return {
    matrix: query.data ?? {},
    loading: Boolean(user?.id) && query.isPending,
    fromDatabase: query.isSuccess && !query.isError,
    reload: async () => {
      if (user?.id) await query.refetch();
    },
  };
}

/** Permissions effectives et capacités calculées côté base de données. */
export function usePermissions() {
  const { user } = useAuth();
  const { matrix, loading, fromDatabase, reload } = useEffectivePermissionSnapshot();

  const permissions = useMemo(
    () => new Set<string>(matrix[user?.id ? effectivePermissionsKey(user.id) : ""] || []),
    [matrix, user?.id],
  );

  const can = useCallback(
    (permission: string) => permissions.has(permission),
    [permissions],
  );
  const canAny = useCallback(
    (...requested: string[]) => requested.some((permission) => permissions.has(permission)),
    [permissions],
  );
  const canAll = useCallback(
    (...requested: string[]) => requested.every((permission) => permissions.has(permission)),
    [permissions],
  );

  // These are capabilities returned by SQL, not role-name checks in React.
  const capabilities = useMemo(() => ({
    globalAdmin: permissions.has("system.global_admin"),
    canSuperviseLeads: permissions.has("system.can_supervise_leads"),
    serviceClient: permissions.has("system.service_client"),
    commercialAssignable: permissions.has("system.commercial_assignable"),
    commercialManager: permissions.has("system.commercial_manager"),
    commercialDirector: permissions.has("system.commercial_director"),
    technicalManager: permissions.has("system.technical_manager"),
    manageAccountRequests: permissions.has("system.manage_account_requests"),
    manageUserCredentials: permissions.has("system.manage_user_credentials"),
    clientOnly: permissions.has("system.client_only") && (fromDatabase || (typeof navigator !== "undefined" && !navigator.onLine)),
    transferPlantation: permissions.has("system.transfer_plantation"),
    independentServiceCustomers: permissions.has("system.independent_service_customers"),
    independentServiceProformas: permissions.has("system.independent_service_proformas"),
    independentServiceItems: permissions.has("system.independent_service_items"),
    viewTeamCommissions: permissions.has("system.view_team_commissions"),
    commercialRole: permissions.has("system.commercial_role"),
    zoneScopeGlobal: permissions.has("system.zone_scope_global"),
    independentServiceWrite: permissions.has("system.independent_service_write"),
    independentServiceOperations: permissions.has("system.independent_service_operations"),
    manageHR: permissions.has("system.manage_hr"),
  }), [permissions, fromDatabase]);

  return {
    can,
    canAny,
    canAll,
    permissions,
    capabilities,
    loading,
    fromDatabase,
    reload,
  };
}
