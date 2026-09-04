import React from "react";
import type { Project } from "../../types.ts";
import { ProjectSiteLogs } from "./ProjectSiteLogs.tsx";
import { hasPermission, PERMISSION_KEYS, type PermissionKey } from "../../utils/accessControl.ts";
import { useAppPermissions } from "../../app/AppPermissionContext.tsx";

export interface ProjectDailySiteLogsProps {
  project: Project;
  companyId?: string;
  initialDailyLogId?: string;
  guestMode?: boolean;
}

/** Compatibility entry point retained for the earlier Phase 1C branch naming. */
export const ProjectDailySiteLogs: React.FC<ProjectDailySiteLogsProps> = ({ project, companyId, initialDailyLogId, guestMode = false }) => {
  const permissions = useAppPermissions();
  const allowed = (permission: PermissionKey) => guestMode || hasPermission(permissions, permission);
  return (
    <ProjectSiteLogs
      project={project}
      companyId={companyId}
      initialSiteLogId={initialDailyLogId}
      guestMode={guestMode}
      canRead={allowed(PERMISSION_KEYS.engineeringSiteLogsRead)}
      canCreate={allowed(PERMISSION_KEYS.engineeringSiteLogsCreate)}
      canUpdate={allowed(PERMISSION_KEYS.engineeringSiteLogsUpdate)}
      canSubmit={allowed(PERMISSION_KEYS.engineeringSiteLogsSubmit)}
      canManage={allowed(PERMISSION_KEYS.engineeringSiteLogsManage)}
    />
  );
};
