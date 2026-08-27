import React from "react";
import type { Project } from "../../types.ts";
import { ProjectSiteLogs } from "./ProjectSiteLogs.tsx";

export interface ProjectDailySiteLogsProps {
  project: Project;
  companyId?: string;
  initialDailyLogId?: string;
  guestMode?: boolean;
}

/** Compatibility entry point retained for the earlier Phase 1C branch naming. */
export const ProjectDailySiteLogs: React.FC<ProjectDailySiteLogsProps> = ({ project, companyId, initialDailyLogId, guestMode = false }) => (
  <ProjectSiteLogs project={project} companyId={companyId} initialSiteLogId={initialDailyLogId} guestMode={guestMode} />
);
