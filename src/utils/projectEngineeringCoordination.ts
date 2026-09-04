import type { EngineeringDailySiteLog } from "../lib/dailySiteLogs.ts";
import type {
  EngineeringDocument,
  EngineeringDocumentRevision,
} from "../lib/engineeringDocuments.ts";
import type {
  EngineeringRfi,
  EngineeringSubmittal,
} from "../lib/engineeringCoordination.ts";
import {
  buildProjectEngineeringAttentionSignals,
  type ProjectAttentionSignal,
} from "./projectManagementViewModel.ts";

export type ProjectEngineeringSourceState = "available" | "loading" | "unavailable" | "not-permitted";

export interface ProjectEngineeringSource<T> {
  state: ProjectEngineeringSourceState;
  records?: readonly T[];
  reason?: string;
}

export interface ProjectEngineeringDocumentsSource {
  state: ProjectEngineeringSourceState;
  documents?: readonly EngineeringDocument[];
  revisions?: readonly EngineeringDocumentRevision[];
  reason?: string;
}

export interface ProjectEngineeringCoordinationInput {
  projectId: string;
  today: string;
  documents: ProjectEngineeringDocumentsSource;
  rfis: ProjectEngineeringSource<EngineeringRfi>;
  submittals: ProjectEngineeringSource<EngineeringSubmittal>;
  siteLogs: ProjectEngineeringSource<EngineeringDailySiteLog>;
}

export interface ProjectEngineeringSourceSummary {
  state: ProjectEngineeringSourceState;
  reason?: string;
  count?: number;
  latestActivityDate?: string;
}

export interface ProjectEngineeringRfiSummary extends ProjectEngineeringSourceSummary {
  openCount?: number;
  overdueCount?: number;
}

export interface ProjectEngineeringSubmittalSummary extends ProjectEngineeringSourceSummary {
  awaitingReviewCount?: number;
  overdueCount?: number;
}

export interface ProjectEngineeringSiteLogSummary extends ProjectEngineeringSourceSummary {
  latestSiteDate?: string;
}

export interface ProjectEngineeringCoordinationSummary {
  documents: ProjectEngineeringSourceSummary;
  rfis: ProjectEngineeringRfiSummary;
  submittals: ProjectEngineeringSubmittalSummary;
  siteLogs: ProjectEngineeringSiteLogSummary;
  attentionSignals: ProjectAttentionSignal[];
}

export function controlledProjectEngineeringSourceState(
  guestMode: boolean,
  canRead: boolean | undefined,
  accessLoading = false,
): { state: ProjectEngineeringSourceState } {
  if (guestMode) return { state: "available" };
  if (accessLoading && canRead === undefined) return { state: "loading" };
  return canRead === true ? { state: "available" } : { state: "not-permitted" };
}

function projectRecords<T extends { projectId: string }>(records: readonly T[] | undefined, projectId: string): T[] | undefined {
  return records?.filter((record) => record.projectId === projectId);
}

function availableProjectRecords<T extends { projectId: string }>(source: ProjectEngineeringSource<T>, projectId: string): T[] | undefined {
  return source.state === "available" ? projectRecords(source.records, projectId) : undefined;
}

function latestDate(values: readonly (string | undefined)[]): string | undefined {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1);
}

function sourceSummary<T extends { projectId: string }>(source: ProjectEngineeringSource<T>, projectId: string): ProjectEngineeringSourceSummary & { records?: T[] } {
  const records = availableProjectRecords(source, projectId);
  return {
    state: source.state,
    reason: source.reason,
    ...(records ? { count: records.length, records } : {}),
    ...(records ? { latestActivityDate: latestDate(records.map((record) => (record as T & { updatedAt?: string; createdAt?: string }).updatedAt || (record as T & { createdAt?: string }).createdAt)) } : {}),
  };
}

export function buildProjectEngineeringCoordinationSummary(
  input: ProjectEngineeringCoordinationInput,
): ProjectEngineeringCoordinationSummary {
  const projectDocuments = input.documents.state === "available"
    ? input.documents.documents?.filter((document) => document.projectId === input.projectId)
    : undefined;
  const projectDocumentIds = new Set((projectDocuments || []).map((document) => document.id));
  const projectRevisions = input.documents.state === "available"
    ? input.documents.revisions?.filter((revision) => projectDocumentIds.has(revision.documentId))
    : undefined;

  const documents: ProjectEngineeringSourceSummary = {
    state: input.documents.state,
    reason: input.documents.reason,
    ...(projectDocuments ? { count: projectDocuments.length } : {}),
    ...(projectRevisions ? { latestActivityDate: latestDate(projectRevisions.map((revision) => revision.createdAt)) } : {}),
  };

  const rfiRecords = availableProjectRecords(input.rfis, input.projectId);
  const visibleRfis = rfiRecords?.filter((rfi) => rfi.status !== "VOID") || [];
  const openRfis = visibleRfis.filter((rfi) => rfi.status === "OPEN");
  const overdueRfis = openRfis.filter((rfi) => Boolean(rfi.dueDate && rfi.dueDate < input.today));
  const rfis: ProjectEngineeringRfiSummary = {
    ...sourceSummary(input.rfis, input.projectId),
    ...(rfiRecords ? { count: visibleRfis.length, openCount: openRfis.length, overdueCount: overdueRfis.length } : {}),
  };

  const submittalRecords = availableProjectRecords(input.submittals, input.projectId);
  const visibleSubmittals = submittalRecords?.filter((submittal) => submittal.status !== "VOID") || [];
  const awaitingReview = visibleSubmittals.filter((submittal) => submittal.status === "SUBMITTED" || submittal.status === "UNDER_REVIEW");
  const overdueSubmittals = awaitingReview.filter((submittal) => Boolean(submittal.dueReviewDate && submittal.dueReviewDate < input.today));
  const submittals: ProjectEngineeringSubmittalSummary = {
    ...sourceSummary(input.submittals, input.projectId),
    ...(submittalRecords ? { count: visibleSubmittals.length, awaitingReviewCount: awaitingReview.length, overdueCount: overdueSubmittals.length } : {}),
  };

  const siteLogRecords = availableProjectRecords(input.siteLogs, input.projectId);
  const visibleSiteLogs = siteLogRecords?.filter((log) => log.status !== "VOID") || [];
  const siteLogs: ProjectEngineeringSiteLogSummary = {
    ...sourceSummary(input.siteLogs, input.projectId),
    ...(siteLogRecords ? { count: visibleSiteLogs.length, latestSiteDate: latestDate(visibleSiteLogs.map((log) => log.siteDate)) } : {}),
  };

  const attentionSignals = buildProjectEngineeringAttentionSignals(
    { id: input.projectId },
    {
      ...(rfiRecords ? { rfis: visibleRfis } : {}),
      ...(submittalRecords ? { submittals: visibleSubmittals } : {}),
    },
    input.today,
  );

  return { documents, rfis, submittals, siteLogs, attentionSignals };
}

export function sourceStateLabel(state: ProjectEngineeringSourceState): string {
  switch (state) {
    case "available": return "Available";
    case "loading": return "Loading";
    case "not-permitted": return "Not permitted";
    default: return "Unavailable";
  }
}
