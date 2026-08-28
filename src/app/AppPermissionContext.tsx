import React, { createContext, useContext, useMemo } from "react";
import { hasAnyPermission, hasPermission, type PermissionKey } from "../utils/accessControl.ts";

const AppPermissionContext = createContext<readonly PermissionKey[]>([]);

export function AppPermissionProvider({ permissions = [], children }: { permissions?: readonly PermissionKey[]; children: React.ReactNode }) {
  const stablePermissions = useMemo(() => [...permissions], [permissions]);
  return <AppPermissionContext.Provider value={stablePermissions}>{children}</AppPermissionContext.Provider>;
}

export function useAppPermissions(): readonly PermissionKey[] {
  return useContext(AppPermissionContext);
}

export function useAppPermission(required: PermissionKey): boolean {
  return hasPermission(useAppPermissions(), required);
}

export function useAnyAppPermission(required: readonly PermissionKey[]): boolean {
  return hasAnyPermission(useAppPermissions(), required);
}
