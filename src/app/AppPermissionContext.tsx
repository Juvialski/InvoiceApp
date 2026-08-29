import React, { createContext, useContext, useMemo } from "react";
import { isSupabaseConfigured } from "../lib/supabase.ts";
import { hasAnyPermission, hasPermission, type PermissionKey } from "../utils/accessControl.ts";
import { projectCostDataCompleteness, type DataCompleteness, type ProjectCostSource } from "../utils/dataCompleteness.ts";

interface AppPermissionContextValue {
  permissions: readonly PermissionKey[];
  projectCostCompleteness: DataCompleteness<ProjectCostSource>;
  workspaceDataPending: boolean;
}

const AppPermissionContext = createContext<AppPermissionContextValue>({
  permissions: [],
  projectCostCompleteness: projectCostDataCompleteness([]),
  workspaceDataPending: false,
});

export function AppPermissionProvider({
  permissions = [],
  projectCostCompleteness,
  workspaceDataPending = false,
  children,
}: {
  permissions?: readonly PermissionKey[];
  projectCostCompleteness?: DataCompleteness<ProjectCostSource>;
  workspaceDataPending?: boolean;
  children: React.ReactNode;
}) {
  // Browser-only mode predates company RBAC and has no permission snapshot.
  // Keep its local-only behavior intact, while configured Supabase workspaces
  // remain fail-closed until company permissions are actually loaded.
  const stablePermissions = useMemo<readonly PermissionKey[]>(
    () => !isSupabaseConfigured ? ["*"] : [...permissions],
    [permissions],
  );
  const value = useMemo<AppPermissionContextValue>(
    () => ({
      permissions: stablePermissions,
      projectCostCompleteness: projectCostCompleteness || projectCostDataCompleteness(stablePermissions),
      workspaceDataPending,
    }),
    [projectCostCompleteness, stablePermissions, workspaceDataPending],
  );
  return <AppPermissionContext.Provider value={value}>{children}</AppPermissionContext.Provider>;
}

export function useAppPermissions(): readonly PermissionKey[] {
  return useContext(AppPermissionContext).permissions;
}

export function useProjectCostCompleteness(): DataCompleteness<ProjectCostSource> {
  return useContext(AppPermissionContext).projectCostCompleteness;
}

export function useWorkspaceDataPending(): boolean {
  return useContext(AppPermissionContext).workspaceDataPending;
}

export function useAppPermission(required: PermissionKey): boolean {
  return hasPermission(useAppPermissions(), required);
}

export function useAnyAppPermission(required: readonly PermissionKey[]): boolean {
  return hasAnyPermission(useAppPermissions(), required);
}
