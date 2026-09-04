import { useMemo } from "react";
import type { Project } from "../../types.ts";
import type { EngineeringDailySiteLogsWorkspaceData } from "../../lib/dailySiteLogs.ts";
import type { EngineeringCoordinationWorkspaceData } from "../../lib/engineeringCoordination.ts";
import type { EngineeringDocumentsWorkspaceData } from "../../lib/engineeringDocuments.ts";
import { useDailySiteLogsController } from "./useDailySiteLogsController.ts";
import { useEngineeringCoordinationController } from "./useEngineeringCoordinationController.ts";
import { useEngineeringDocumentsController } from "./useEngineeringDocumentsController.ts";
import {
  buildProjectEngineeringCoordinationSummary,
  controlledProjectEngineeringSourceState,
  type ProjectEngineeringCoordinationSummary,
  type ProjectEngineeringSourceState,
} from "../../utils/projectEngineeringCoordination.ts";

export interface ProjectEngineeringCoordinationSummaryOptions {
  project: Project;
  companyId?: string;
  today: string;
  guestMode: boolean;
  documentsCanRead?: boolean;
  rfisCanRead?: boolean;
  submittalsCanRead?: boolean;
  siteLogsCanRead?: boolean;
  coordinationAccessLoading?: boolean;
  documentsData?: EngineeringDocumentsWorkspaceData;
  coordinationData?: EngineeringCoordinationWorkspaceData;
  dailySiteLogsData?: EngineeringDailySiteLogsWorkspaceData;
}

export interface ProjectEngineeringCoordinationSummaryState {
  summary: ProjectEngineeringCoordinationSummary;
  isLoading: boolean;
  hasLoaded: boolean;
  dailySiteLogsData?: EngineeringDailySiteLogsWorkspaceData;
}

function sourceState(
  canRead: boolean,
  hasLoaded: boolean,
  isLoading: boolean,
  loadError: string | null,
  accessLoading = false,
): { state: ProjectEngineeringSourceState; reason?: string } {
  if (accessLoading) return { state: "loading" };
  if (!canRead) return { state: "not-permitted" };
  if (!hasLoaded && isLoading) return { state: "loading" };
  if (loadError && !hasLoaded) return { state: "unavailable", reason: loadError };
  if (hasLoaded) return { state: "available", ...(loadError ? { reason: loadError } : {}) };
  return { state: "loading" };
}

export function useProjectEngineeringCoordinationSummary({
  project,
  companyId,
  today,
  guestMode,
  documentsCanRead = false,
  rfisCanRead,
  submittalsCanRead,
  siteLogsCanRead,
  coordinationAccessLoading = false,
  documentsData,
  coordinationData,
  dailySiteLogsData,
}: ProjectEngineeringCoordinationSummaryOptions): ProjectEngineeringCoordinationSummaryState {
  const documentsController = useEngineeringDocumentsController({
    project,
    companyId,
    canRead: documentsData ? false : guestMode || documentsCanRead,
    guestMode,
  });
  const coordinationController = useEngineeringCoordinationController({
    project,
    companyId,
    canRead: coordinationData ? false : Boolean(guestMode || rfisCanRead || submittalsCanRead),
    canManage: false,
    guestMode,
  });
  const siteLogsController = useDailySiteLogsController({
    project,
    companyId,
    canRead: dailySiteLogsData ? false : Boolean(guestMode || siteLogsCanRead),
    canCreate: false,
    canUpdate: false,
    canSubmit: false,
    canManage: false,
    guestMode,
    controlledData: dailySiteLogsData,
  });

  return useMemo(() => {
    const documentsAccess = documentsData
      ? controlledProjectEngineeringSourceState(guestMode, documentsCanRead)
      : sourceState(guestMode || documentsCanRead, documentsController.hasLoaded, documentsController.isLoading, documentsController.loadError);
    const rfiAccess = coordinationData
      ? controlledProjectEngineeringSourceState(guestMode, rfisCanRead, coordinationAccessLoading)
      : sourceState(guestMode || rfisCanRead === true, coordinationController.hasLoaded, coordinationController.isLoading, coordinationController.loadError, coordinationAccessLoading && rfisCanRead === undefined);
    const submittalAccess = coordinationData
      ? controlledProjectEngineeringSourceState(guestMode, submittalsCanRead, coordinationAccessLoading)
      : sourceState(guestMode || submittalsCanRead === true, coordinationController.hasLoaded, coordinationController.isLoading, coordinationController.loadError, coordinationAccessLoading && submittalsCanRead === undefined);
    const siteLogAccess = dailySiteLogsData
      ? controlledProjectEngineeringSourceState(guestMode, siteLogsCanRead, coordinationAccessLoading)
      : sourceState(guestMode || siteLogsCanRead === true, siteLogsController.hasLoaded, siteLogsController.isLoading, siteLogsController.loadError, coordinationAccessLoading && siteLogsCanRead === undefined);

    const summary = buildProjectEngineeringCoordinationSummary({
      projectId: project.id,
      today: today.slice(0, 10),
      documents: {
        ...documentsAccess,
        ...(documentsData && documentsAccess.state === "available"
          ? { documents: documentsData.documents, revisions: documentsData.revisions }
          : !documentsData && documentsAccess.state === "available" && documentsController.hasLoaded
            ? { documents: documentsController.documents, revisions: documentsController.revisions }
            : {}),
      },
      rfis: {
        ...rfiAccess,
        ...(coordinationData && rfiAccess.state === "available"
          ? { records: coordinationData.rfis }
          : !coordinationData && rfiAccess.state === "available" && coordinationController.hasLoaded
            ? { records: coordinationController.data.rfis }
            : {}),
      },
      submittals: {
        ...submittalAccess,
        ...(coordinationData && submittalAccess.state === "available"
          ? { records: coordinationData.submittals }
          : !coordinationData && submittalAccess.state === "available" && coordinationController.hasLoaded
            ? { records: coordinationController.data.submittals }
            : {}),
      },
      siteLogs: {
        ...siteLogAccess,
        ...(dailySiteLogsData && siteLogAccess.state === "available"
          ? { records: dailySiteLogsData.logs }
          : !dailySiteLogsData && siteLogAccess.state === "available" && siteLogsController.hasLoaded
            ? { records: siteLogsController.data.logs }
            : {}),
      },
    });

    const states = [summary.documents.state, summary.rfis.state, summary.submittals.state, summary.siteLogs.state];
    const isLoading = states.some((state) => state === "loading");
    const hasLoaded = states.every((state) => state !== "loading");
    const availableDailySiteLogsData = siteLogAccess.state === "available"
      ? dailySiteLogsData || (siteLogsController.hasLoaded ? siteLogsController.data : undefined)
      : undefined;
    return { summary, isLoading, hasLoaded, dailySiteLogsData: availableDailySiteLogsData };
  }, [coordinationAccessLoading, coordinationController.data.rfis, coordinationController.data.submittals, coordinationController.hasLoaded, coordinationController.isLoading, coordinationController.loadError, coordinationData, documentsCanRead, documentsController.documents, documentsController.hasLoaded, documentsController.isLoading, documentsController.loadError, documentsController.revisions, documentsData, guestMode, project.id, rfisCanRead, siteLogsCanRead, siteLogsController.data, siteLogsController.hasLoaded, siteLogsController.isLoading, siteLogsController.loadError, submittalsCanRead, today, dailySiteLogsData]);
}
