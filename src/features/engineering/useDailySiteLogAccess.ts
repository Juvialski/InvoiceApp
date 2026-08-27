import { useEngineeringCoordinationAccess } from "./useEngineeringCoordinationAccess.ts";

/** Compatibility-shaped access adapter for callers that use the Phase 1C feature name. */
export interface DailySiteLogAccess {
  read: boolean;
  create: boolean;
  update: boolean;
  submit: boolean;
  manage: boolean;
  review: boolean;
  loading: boolean;
}
export function useDailySiteLogAccess(companyId?: string, guestMode = false): DailySiteLogAccess {
  const access = useEngineeringCoordinationAccess(companyId, guestMode);
  return {
    read: access.siteLogsRead,
    create: access.siteLogsCreate,
    update: access.siteLogsUpdate,
    submit: access.siteLogsSubmit,
    manage: access.siteLogsManage,
    review: access.siteLogsManage,
    loading: access.loading,
  };
}
