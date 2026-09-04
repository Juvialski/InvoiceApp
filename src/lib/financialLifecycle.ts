import type { Expense, InvoiceData } from "../types.ts";

export const FINANCIAL_CORRECTION_ACTIONS = ["DELETE_UNUSED", "VOID", "ARCHIVE", "RESTORE"] as const;
export type FinancialCorrectionAction = (typeof FINANCIAL_CORRECTION_ACTIONS)[number];
export type FinancialCorrectionEntityType = "INVOICE" | "EXPENSE";
export type FinancialCorrectionSource = "database" | "local" | "demo";

export interface FinancialCorrectionStorageCleanup {
  sourceDocumentId?: string;
  relationship: string;
  physicalObjectDeleted: boolean;
  note?: string;
}

export interface FinancialCorrectionPreview {
  entityType: FinancialCorrectionEntityType;
  entityId: string;
  status: string;
  reviewStatus?: string;
  paymentStatus?: string;
  lifecycleStatus: string;
  archivedAt?: string;
  voidedAt?: string;
  canDelete: boolean;
  canVoid: boolean;
  canArchive: boolean;
  canRestore: boolean;
  recommendedAction: FinancialCorrectionAction | "NONE";
  blockedReason?: string;
  totalDependencyCount: number;
  protectedDependencyCount: number;
  disposableDependencyCount: number;
  confirmedSettlementCount: number;
  dependencies: Record<string, number>;
  blockingDependencies: Record<string, number>;
  disposableDependencies: Record<string, number>;
  storageCleanup?: FinancialCorrectionStorageCleanup;
  source: FinancialCorrectionSource;
}

export interface FinancialCorrectionResult {
  entityType: FinancialCorrectionEntityType;
  entityId: string;
  action: FinancialCorrectionAction;
  deleted: boolean;
  changed: boolean;
  preflight: FinancialCorrectionPreview;
  record?: InvoiceData | Expense;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function booleanValue(value: unknown) {
  return value === true;
}

function numericRecord(value: unknown) {
  return isRecord(value)
    ? Object.fromEntries(Object.entries(value).map(([key, count]) => [key, numberValue(count)]))
    : {};
}

function recordTotal(value: Record<string, number>) {
  return Object.values(value).reduce((total, count) => total + count, 0);
}

export function parseFinancialCorrectionPreview(value: unknown, entityType: FinancialCorrectionEntityType): FinancialCorrectionPreview {
  if (!isRecord(value)) throw new Error(`${entityType === "INVOICE" ? "Invoice" : "Expense"} correction preview returned an invalid response.`);
  const rawDependencies = isRecord(value.dependencies) ? value.dependencies : {};
  const dependencies = Object.fromEntries(Object.entries(rawDependencies).map(([key, count]) => [key, numberValue(count)]));
  const blockingDependencies = numericRecord(value.blockingDependencies || value.blocking_dependencies);
  const disposableDependencies = numericRecord(value.disposableDependencies || value.disposable_dependencies);
  const totalDependencyCount = numberValue(value.totalDependencyCount || value.total_dependency_count);
  const hasProtectedCount = Object.prototype.hasOwnProperty.call(value, "protectedDependencyCount") || Object.prototype.hasOwnProperty.call(value, "protected_dependency_count");
  const hasDisposableCount = Object.prototype.hasOwnProperty.call(value, "disposableDependencyCount") || Object.prototype.hasOwnProperty.call(value, "disposable_dependency_count");
  const effectiveBlockingDependencies = Object.keys(blockingDependencies).length ? blockingDependencies : dependencies;
  const effectiveDisposableDependencies = disposableDependencies;
  const storageValue = isRecord(value.storageCleanup || value.storage_cleanup) ? (value.storageCleanup || value.storage_cleanup) as Record<string, unknown> : undefined;
  const recommended = String(value.recommendedAction || "NONE").toUpperCase();
  const recommendedAction = FINANCIAL_CORRECTION_ACTIONS.includes(recommended as FinancialCorrectionAction)
    ? recommended as FinancialCorrectionAction
    : "NONE";
  return {
    entityType,
    entityId: String(value.entityId || value.entity_id || ""),
    status: String(value.status || value.lifecycleStatus || "UNKNOWN"),
    reviewStatus: stringValue(value.reviewStatus || value.review_status),
    paymentStatus: stringValue(value.paymentStatus || value.payment_status),
    lifecycleStatus: String(value.lifecycleStatus || value.lifecycle_status || value.status || "UNKNOWN"),
    archivedAt: stringValue(value.archivedAt || value.archived_at),
    voidedAt: stringValue(value.voidedAt || value.voided_at),
    canDelete: booleanValue(value.canDelete),
    canVoid: booleanValue(value.canVoid),
    canArchive: booleanValue(value.canArchive),
    canRestore: booleanValue(value.canRestore),
    recommendedAction,
    blockedReason: stringValue(value.blockedReason || value.blocked_reason),
    totalDependencyCount,
    protectedDependencyCount: hasProtectedCount ? numberValue(value.protectedDependencyCount || value.protected_dependency_count) : recordTotal(effectiveBlockingDependencies),
    disposableDependencyCount: hasDisposableCount ? numberValue(value.disposableDependencyCount || value.disposable_dependency_count) : recordTotal(effectiveDisposableDependencies),
    confirmedSettlementCount: numberValue(value.confirmedSettlementCount || value.confirmed_settlement_count),
    dependencies,
    blockingDependencies: effectiveBlockingDependencies,
    disposableDependencies: effectiveDisposableDependencies,
    ...(storageValue ? {
      storageCleanup: {
        sourceDocumentId: stringValue(storageValue.sourceDocumentId || storageValue.source_document_id),
        relationship: String(storageValue.relationship || storageValue.invoiceRelationship || "UNKNOWN"),
        physicalObjectDeleted: booleanValue(storageValue.physicalObjectDeleted || storageValue.physical_object_deleted),
        note: stringValue(storageValue.note),
      },
    } : {}),
    source: value.source === "demo" || value.source === "local" ? value.source : "database",
  };
}

export function parseFinancialCorrectionResult(value: unknown, entityType: FinancialCorrectionEntityType): Omit<FinancialCorrectionResult, "record"> & { rawRecord?: Record<string, unknown> } {
  if (!isRecord(value)) throw new Error(`${entityType === "INVOICE" ? "Invoice" : "Expense"} correction returned an invalid response.`);
  const action = String(value.action || "").toUpperCase();
  if (!FINANCIAL_CORRECTION_ACTIONS.includes(action as FinancialCorrectionAction)) throw new Error("Financial correction returned an invalid action.");
  return {
    entityType,
    entityId: String(value.entityId || value.entity_id || ""),
    action: action as FinancialCorrectionAction,
    deleted: booleanValue(value.deleted),
    changed: booleanValue(value.changed),
    preflight: parseFinancialCorrectionPreview(value.preflight, entityType),
    ...(isRecord(value.record) ? { rawRecord: value.record } : {}),
  };
}

export interface LocalInvoiceCorrectionInput {
  invoice: InvoiceData;
  allocationCount?: number;
  settlementMatchCount?: number;
  confirmedSettlementCount?: number;
  historyCount?: number;
}

export function buildLocalInvoiceCorrectionPreview({ invoice, allocationCount = 0, settlementMatchCount = 0, confirmedSettlementCount = 0, historyCount = 0 }: LocalInvoiceCorrectionInput): FinancialCorrectionPreview {
  const lifecycleStatus = invoice.lifecycleStatus || "ACTIVE";
  const protectedDependencyCount = allocationCount + settlementMatchCount + historyCount + (invoice.reviewStatus === "VERIFIED" ? 1 : 0);
  const disposableDependencyCount = (invoice.extractionId ? 1 : 0) + (invoice.sourceDocumentId ? 1 : 0) + (invoice.sourceEmailId ? 1 : 0);
  const totalDependencyCount = protectedDependencyCount + disposableDependencyCount;
  const canVoid = lifecycleStatus !== "VOID" && confirmedSettlementCount === 0;
  const canArchive = !invoice.archivedAt;
  const canRestore = Boolean(invoice.archivedAt);
  return {
    entityType: "INVOICE",
    entityId: invoice.id,
    status: invoice.status || "UNPAID",
    reviewStatus: invoice.reviewStatus,
    paymentStatus: invoice.status,
    lifecycleStatus,
    archivedAt: invoice.archivedAt,
    voidedAt: invoice.voidedAt,
    canDelete: false,
    canVoid,
    canArchive,
    canRestore,
    recommendedAction: lifecycleStatus === "VOID" ? (canRestore ? "RESTORE" : "NONE") : invoice.reviewStatus === "VERIFIED" || protectedDependencyCount > 0 ? "VOID" : "ARCHIVE",
    blockedReason: confirmedSettlementCount > 0
      ? "Confirmed settlement evidence exists. Reverse or correct the cash settlement in Cash & Banking before voiding this invoice."
      : "Permanent deletion is available only after an authoritative database preflight.",
    totalDependencyCount,
    protectedDependencyCount,
    disposableDependencyCount,
    confirmedSettlementCount,
    dependencies: { projectAllocations: allocationCount, settlementMatches: settlementMatchCount, reviewHistory: historyCount, sourceEvidence: (invoice.sourceDocumentId ? 1 : 0) + (invoice.sourceEmailId ? 1 : 0) },
    blockingDependencies: { projectAllocations: allocationCount, settlementMatches: settlementMatchCount, reviewHistory: historyCount, verifiedHistory: invoice.reviewStatus === "VERIFIED" ? 1 : 0 },
    disposableDependencies: { extractions: invoice.extractionId ? 1 : 0, sourceDocument: invoice.sourceDocumentId ? 1 : 0, sourceEmail: invoice.sourceEmailId ? 1 : 0 },
    source: "local",
  };
}

export interface LocalExpenseCorrectionInput {
  expense: Expense;
  settlementMatchCount?: number;
  confirmedSettlementCount?: number;
  historyCount?: number;
}

export function buildLocalExpenseCorrectionPreview({ expense, settlementMatchCount = 0, confirmedSettlementCount = 0, historyCount = 0 }: LocalExpenseCorrectionInput): FinancialCorrectionPreview {
  const lifecycleStatus = expense.status;
  const protectedDependencyCount = settlementMatchCount + historyCount + (expense.projectId ? 1 : 0) + (expense.receiptSourceDocumentId ? 1 : 0);
  const disposableDependencyCount = 0;
  const totalDependencyCount = protectedDependencyCount;
  const canVoid = lifecycleStatus !== "VOID" && confirmedSettlementCount === 0;
  const canArchive = !expense.archivedAt;
  const canRestore = Boolean(expense.archivedAt);
  return {
    entityType: "EXPENSE",
    entityId: expense.id,
    status: expense.status,
    lifecycleStatus,
    archivedAt: expense.archivedAt,
    voidedAt: expense.voidedAt,
    canDelete: false,
    canVoid,
    canArchive,
    canRestore,
    recommendedAction: lifecycleStatus === "VOID" ? (canRestore ? "RESTORE" : "NONE") : expense.status === "APPROVED" || expense.status === "PAID" || totalDependencyCount > 0 ? "VOID" : "ARCHIVE",
    blockedReason: confirmedSettlementCount > 0
      ? "Confirmed settlement evidence exists. Reverse or correct the cash settlement in Cash & Banking before voiding this expense."
      : "Permanent deletion is available only after an authoritative database preflight.",
    totalDependencyCount,
    protectedDependencyCount,
    disposableDependencyCount,
    confirmedSettlementCount,
    dependencies: { settlementMatches: settlementMatchCount, projectReference: expense.projectId ? 1 : 0, receiptSource: expense.receiptSourceDocumentId ? 1 : 0, history: historyCount },
    blockingDependencies: { settlementMatches: settlementMatchCount, projectReference: expense.projectId ? 1 : 0, receiptSource: expense.receiptSourceDocumentId ? 1 : 0, history: historyCount },
    disposableDependencies: {},
    source: "local",
  };
}
