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
      ? { state: "available" as const }
      : sourceState(guestMode || documentsCanRead, documentsController.hasLoaded, documentsController.isLoading, documentsController.loadError);
    const rfiAccess = coordinationData
      ? { state: "available" as const }
      : sourceState(guestMode || rfisCanRead === true, coordinationController.hasLoaded, coordinationController.isLoading, coordinationController.loadError, coordinationAccessLoading && rfisCanRead === undefined);
    const submittalAccess = coordinationData
      ? { state: "available" as const }
      : sourceState(guestMode || submittalsCanRead === true, coordinationController.hasLoaded, coordinationController.isLoading, coordinationController.loadError, coordinationAccessLoading && submittalsCanRead === undefined);
    const siteLogAccess = dailySiteLogsData
      ? { state: "available" as const }
      : sourceState(guestMode || siteLogsCanRead === true, siteLogsController.hasLoaded, siteLogsController.isLoading, siteLogsController.loadError, coordinationAccessLoading && siteLogsCanRead === undefined);

    const summary = buildProjectEngineeringCoordinationSummary({
      projectId: project.id,
      today: today.slice(0, 10),
      documents: {
        ...documentsAccess,
        ...(documentsData
          ? { documents: documentsData.documents, revisions: documentsData.revisions }
          : documentsController.hasLoaded
            ? { documents: documentsController.documents, revisions: documentsController.revisions }
            : {}),
      },
      rfis: {
        ...rfiAccess,
        ...(coordinationData
          ? { records: coordinationData.rfis }
          : coordinationController.hasLoaded && (guestMode || rfisCanRead)
            ? { records: coordinationController.data.rfis }
            : {}),
      },
      submittals: {
        ...submittalAccess,
        ...(coordinationData
          ? { records: coordinationData.submittals }
          : coordinationController.hasLoaded && (guestMode || submittalsCanRead)
            ? { records: coordinationController.data.submittals }
            : {}),
      },
      siteLogs: {
        ...siteLogAccess,
        ...(dailySiteLogsData
          ? { records: dailySiteLogsData.logs }
          : siteLogsController.hasLoaded && (guestMode || siteLogsCanRead)
            ? { records: siteLogsController.data.logs }
            : {}),
      },
    });

    const states = [summary.documents.state, summary.rfis.state, summary.submittals.state, summary.siteLogs.state];
    const isLoading = states.some((state) => state === "loading");
    const hasLoaded = states.every((state) => state !== "loading");
    return { summary, isLoading, hasLoaded };
  }, [coordinationAccessLoading, coordinationController.data.rfis, coordinationController.data.submittals, coordinationController.hasLoaded, coordinationController.isLoading, coordinationController.loadError, coordinationData, documentsController.documents, documentsController.hasLoaded, documentsController.isLoading, documentsController.loadError, documentsController.revisions, documentsData, guestMode, project.id, rfisCanRead, siteLogsCanRead, siteLogsController.data.logs, siteLogsController.hasLoaded, siteLogsController.isLoading, siteLogsController.loadError, submittalsCanRead, today, dailySiteLogsData]);
}
