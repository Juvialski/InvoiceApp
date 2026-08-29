export const ENGINEERING_LIFECYCLE_ACTIONS = ["DELETE_UNUSED", "ARCHIVE", "SUPERSEDE", "VOID", "ADDENDUM"] as const;
export type EngineeringLifecycleAction = (typeof ENGINEERING_LIFECYCLE_ACTIONS)[number];
export type EngineeringLifecycleEntityType = "DOCUMENT" | "RFI" | "SUBMITTAL" | "SITE_LOG";
export type EngineeringLifecycleSource = "database" | "local" | "demo";

export interface EngineeringLifecyclePreview {
  entityType: EngineeringLifecycleEntityType;
  entityId: string;
  status: string;
  projectId?: string;
  archivedAt?: string;
  supersededAt?: string;
  canDelete: boolean;
  canArchive: boolean;
  canSupersede: boolean;
  canVoid: boolean;
  canCorrect: boolean;
  canAddendum: boolean;
  recommendedAction: EngineeringLifecycleAction | "NONE";
  blockedReason?: string;
  totalDependencyCount: number;
  dependencies: Record<string, number>;
  source: EngineeringLifecycleSource;
}

export interface EngineeringLifecycleResult {
  entityType: EngineeringLifecycleEntityType;
  entityId: string;
  action: EngineeringLifecycleAction;
  deleted: boolean;
  changed: boolean;
  preflight: EngineeringLifecyclePreview;
  record?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

export function parseEngineeringLifecyclePreview(
  value: unknown,
  entityType: EngineeringLifecycleEntityType,
  source: EngineeringLifecycleSource = "database",
): EngineeringLifecyclePreview {
  if (!isRecord(value)) throw new Error(`${entityType} lifecycle preview returned an invalid response.`);
  const rawDependencies = isRecord(value.dependencies) ? value.dependencies : {};
  const dependencies = Object.fromEntries(Object.entries(rawDependencies).map(([key, count]) => [key, numberValue(count)]));
  const recommended = String(value.recommendedAction || "NONE").toUpperCase();
  const recommendedAction = ENGINEERING_LIFECYCLE_ACTIONS.includes(recommended as EngineeringLifecycleAction)
    ? recommended as EngineeringLifecycleAction
    : "NONE";
  return {
    entityType,
    entityId: String(value.entityId || value.entity_id || ""),
    status: String(value.status || "UNKNOWN"),
    projectId: stringValue(value.projectId || value.project_id),
    archivedAt: stringValue(value.archivedAt || value.archived_at),
    supersededAt: stringValue(value.supersededAt || value.superseded_at),
    canDelete: booleanValue(value.canDelete),
    canArchive: booleanValue(value.canArchive),
    canSupersede: booleanValue(value.canSupersede),
    canVoid: booleanValue(value.canVoid),
    canCorrect: booleanValue(value.canCorrect),
    canAddendum: booleanValue(value.canAddendum),
    recommendedAction,
    blockedReason: stringValue(value.blockedReason || value.blocked_reason),
    totalDependencyCount: numberValue(value.totalDependencyCount || value.total_dependency_count),
    dependencies,
    source,
  };
}

export function parseEngineeringLifecycleResult(
  value: unknown,
  entityType: EngineeringLifecycleEntityType,
): EngineeringLifecycleResult {
  if (!isRecord(value)) throw new Error(`${entityType} lifecycle action returned an invalid response.`);
  const action = String(value.action || "").toUpperCase();
  if (!ENGINEERING_LIFECYCLE_ACTIONS.includes(action as EngineeringLifecycleAction)) {
    throw new Error(`${entityType} lifecycle action returned an invalid action.`);
  }
  return {
    entityType,
    entityId: String(value.entityId || value.entity_id || ""),
    action: action as EngineeringLifecycleAction,
    deleted: booleanValue(value.deleted),
    changed: booleanValue(value.changed),
    preflight: parseEngineeringLifecyclePreview(value.preflight, entityType),
    ...(isRecord(value.record) ? { record: value.record } : {}),
  };
}

function localPreviewBase(input: {
  entityType: EngineeringLifecycleEntityType;
  entityId: string;
  status: string;
  projectId?: string;
  source?: EngineeringLifecycleSource;
  projectAvailable?: boolean;
  dependencies?: Record<string, number>;
}): EngineeringLifecyclePreview {
  const dependencies = input.dependencies || {};
  return {
    entityType: input.entityType,
    entityId: input.entityId,
    status: input.status,
    projectId: input.projectId,
    canDelete: false,
    canArchive: false,
    canSupersede: false,
    canVoid: false,
    canCorrect: false,
    canAddendum: false,
    recommendedAction: "NONE",
    totalDependencyCount: Object.values(dependencies).reduce((sum, count) => sum + count, 0),
    dependencies,
    source: input.source || "local",
    ...(input.projectAvailable === false ? { blockedReason: "The engineering record belongs to an archived or unavailable project." } : {}),
  };
}

export function buildLocalEngineeringDocumentLifecyclePreview(input: {
  documentId: string;
  status: string;
  projectId?: string;
  revisions?: number;
  annotations?: number;
  rfiLinks?: number;
  submittalLinks?: number;
  storageObjects?: number;
  auditEvents?: number;
  projectAvailable?: boolean;
  source?: EngineeringLifecycleSource;
}): EngineeringLifecyclePreview {
  const dependencies = {
    revisions: input.revisions || 0,
    annotations: input.annotations || 0,
    rfiLinks: input.rfiLinks || 0,
    submittalLinks: input.submittalLinks || 0,
    storageObjects: input.storageObjects || 0,
    auditEvents: input.auditEvents || 0,
  };
  const base = localPreviewBase({ entityType: "DOCUMENT", entityId: input.documentId, status: input.status, projectId: input.projectId, projectAvailable: input.projectAvailable, dependencies, source: input.source });
  const canDelete = input.status === "DRAFT" && input.projectAvailable !== false && base.totalDependencyCount === 0;
  const canArchive = input.projectAvailable !== false && !["ARCHIVED", "SUPERSEDED"].includes(input.status);
  const canSupersede = canArchive;
  return {
    ...base,
    canDelete,
    canArchive,
    canSupersede,
    recommendedAction: canDelete ? "DELETE_UNUSED" : canArchive ? "ARCHIVE" : "NONE",
    blockedReason: canDelete ? undefined : base.blockedReason || (input.status === "DRAFT" ? "This document has dependencies or source history and cannot be permanently deleted." : "Only an unused DRAFT document shell can be permanently deleted."),
  };
}

export function buildLocalRfiLifecyclePreview(input: {
  rfiId: string;
  status: string;
  projectId?: string;
  responses?: number;
  documentLinks?: number;
  auditEvents?: number;
  projectAvailable?: boolean;
  source?: EngineeringLifecycleSource;
}): EngineeringLifecyclePreview {
  const dependencies = { responses: input.responses || 0, documentLinks: input.documentLinks || 0, auditEvents: input.auditEvents || 0 };
  const base = localPreviewBase({ entityType: "RFI", entityId: input.rfiId, status: input.status, projectId: input.projectId, projectAvailable: input.projectAvailable, dependencies, source: input.source });
  const canDelete = input.status === "DRAFT" && input.projectAvailable !== false && base.totalDependencyCount === 0;
  const canVoid = !["CLOSED", "VOID"].includes(input.status) && input.projectAvailable !== false;
  const canCorrect = ["OPEN", "ANSWERED"].includes(input.status) && input.projectAvailable !== false;
  return {
    ...base,
    canDelete,
    canVoid,
    canCorrect,
    recommendedAction: canDelete ? "DELETE_UNUSED" : canVoid ? "VOID" : "NONE",
    blockedReason: canDelete ? undefined : base.blockedReason || (input.status === "DRAFT" ? "This draft RFI has responses, revision links, or lifecycle history." : "Formal RFI history cannot be permanently deleted."),
  };
}

export function buildLocalSubmittalLifecyclePreview(input: {
  submittalId: string;
  status: string;
  projectId?: string;
  rounds?: number;
  reviews?: number;
  documentLinks?: number;
  additionalRounds?: number;
  auditEvents?: number;
  currentRoundStatus?: string;
  projectAvailable?: boolean;
  source?: EngineeringLifecycleSource;
}): EngineeringLifecyclePreview {
  const dependencies = { rounds: input.rounds || 0, reviews: input.reviews || 0, documentLinks: input.documentLinks || 0, additionalRounds: input.additionalRounds || 0, auditEvents: input.auditEvents || 0 };
  const base = localPreviewBase({ entityType: "SUBMITTAL", entityId: input.submittalId, status: input.status, projectId: input.projectId, projectAvailable: input.projectAvailable, dependencies, source: input.source });
  const disposableDependencies = (input.reviews || 0) + (input.documentLinks || 0) + (input.additionalRounds || 0) + (input.auditEvents || 0);
  const canDelete = input.status === "DRAFT" && input.projectAvailable !== false && (input.rounds || 0) === 1 && input.currentRoundStatus === "DRAFT" && disposableDependencies === 0;
  const canVoid = !["CLOSED", "VOID"].includes(input.status) && input.projectAvailable !== false;
  return {
    ...base,
    totalDependencyCount: disposableDependencies,
    canDelete,
    canVoid,
    recommendedAction: canDelete ? "DELETE_UNUSED" : canVoid ? "VOID" : "NONE",
    blockedReason: canDelete ? undefined : base.blockedReason || "Submitted, reviewed, closed, or void submittals retain their rounds and review history.",
  };
}

export function buildLocalSiteLogLifecyclePreview(input: {
  siteLogId: string;
  status: string;
  projectId?: string;
  formalEvents?: number;
  addenda?: number;
  draftObservations?: number;
  narrativeFields?: number;
  projectAvailable?: boolean;
  source?: EngineeringLifecycleSource;
}): EngineeringLifecyclePreview {
  const dependencies = { formalEvents: input.formalEvents || 0, addenda: input.addenda || 0, draftObservations: input.draftObservations || 0, narrativeFields: input.narrativeFields || 0 };
  const base = localPreviewBase({ entityType: "SITE_LOG", entityId: input.siteLogId, status: input.status, projectId: input.projectId, projectAvailable: input.projectAvailable, dependencies, source: input.source });
  const canDelete = input.status === "DRAFT" && input.projectAvailable !== false && base.totalDependencyCount === 0;
  const canVoid = ["DRAFT", "SUBMITTED"].includes(input.status) && input.projectAvailable !== false;
  const canAddendum = input.status === "FINALIZED" && input.projectAvailable !== false;
  return {
    ...base,
    canDelete,
    canVoid,
    canAddendum,
    recommendedAction: canDelete ? "DELETE_UNUSED" : canVoid ? "VOID" : canAddendum ? "ADDENDUM" : "NONE",
    blockedReason: canDelete ? undefined : base.blockedReason || (input.status === "FINALIZED" ? "FINALIZED observations are immutable. Add an append-only correction/addendum." : "Submitted or void Site Log history cannot be permanently deleted."),
  };
}
