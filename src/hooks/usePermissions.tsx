import { useCallback, useMemo } from "react";
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

const EFFECTIVE_PERMISSIONS_KEY = "__effective_permissions__";

/**
 * The database returns the effective permission set for the signed-in user.
 * The client does not combine role names, hard-coded exceptions, or a local
 * role-to-permission matrix to decide which actions are available.
 */
async function fetchEffectivePermissions(): Promise<PermissionMatrixResult> {
  try {
    const { data, error } = await (supabase as any).rpc("current_user_permissions");
    if (error) throw error;

    const permissions = Array.isArray(data)
      ? data.filter((value): value is string => typeof value === "string")
      : [];

    const matrix = { [EFFECTIVE_PERMISSIONS_KEY]: permissions };
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
          [EFFECTIVE_PERMISSIONS_KEY]: cached?.[EFFECTIVE_PERMISSIONS_KEY] || [],
        },
        fromDatabase: false,
      };
    } catch {
      return { matrix: { [EFFECTIVE_PERMISSIONS_KEY]: [] }, fromDatabase: false };
    }
  }
}

export function useRolePermissionMatrix() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["effective-permissions", user?.id || "anonymous"],
    queryFn: fetchEffectivePermissions,
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

/** Permissions effectives et capacités calculées côté base de données. */
export function usePermissions() {
  const { userRoles } = useAuth();
  const { matrix, loading, fromDatabase, reload } = useRolePermissionMatrix();

  const permissions = useMemo(
    () => new Set<string>(matrix[EFFECTIVE_PERMISSIONS_KEY] || []),
    [matrix],
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
    isDg: permissions.has("system.dg"),
    canSuperviseLeads: permissions.has("system.can_supervise_leads"),
    foncierRole: permissions.has("system.foncier_role"),
    serviceClient: permissions.has("system.service_client"),
    commercialAssignable: permissions.has("system.commercial_assignable"),
    commercialManager: permissions.has("system.commercial_manager"),
    commercialDirector: permissions.has("system.commercial_director"),
    technicalRole: permissions.has("system.technical_role"),
    technicalManager: permissions.has("system.technical_manager"),
    commissionFinance: permissions.has("system.commission_finance"),
    manageAccountRequests: permissions.has("system.manage_account_requests"),
    manageUserCredentials: permissions.has("system.manage_user_credentials"),
    clientOnly: permissions.has("system.client_only"),
    transferPlantation: permissions.has("system.transfer_plantation"),
    independentServiceCustomers: permissions.has("system.independent_service_customers"),
    independentServiceProformas: permissions.has("system.independent_service_proformas"),
    independentServiceItems: permissions.has("system.independent_service_items"),
    viewTeamCommissions: permissions.has("system.view_team_commissions"),
    commercialRole: permissions.has("system.commercial_role"),
    zoneScopeGlobal: permissions.has("system.zone_scope_global"),
    independentServiceWrite: permissions.has("system.independent_service_write"),
    independentServiceOperations: permissions.has("system.independent_service_operations"),
  }), [permissions]);

  return {
    can,
    canAny,
    canAll,
    roles: normalizeRoles(userRoles || []),
    isSuperAdmin: false,
    isPdg: capabilities.globalAdmin,
    isDg: capabilities.isDg,
    permissions,
    capabilities,
    loading,
    fromDatabase,
    reload,
  };
}
