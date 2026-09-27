import { hasAllPermissions, PERMISSION_KEYS, type PermissionKey } from "../utils/accessControl.ts";
import type { PurchaseOrder, RFQ } from "../types.ts";
import type { ProcurementApplyCallbacks, ProcurementRefreshContext } from "./procurementWorkbook.ts";

export type ProcurementWorkbookSheetId = "rfqs" | "purchase-orders";
export type ProcurementWorkbookRow = RFQ | PurchaseOrder;
export type ProcurementWorkbookWriteMode = "existing-domain" | "synthetic-demo";

export interface ProcurementWorkbookEditingIssue {
  readonly rowId: string;
  readonly fieldId: string;
  readonly kind: "validation" | "conflict" | "access";
  readonly message: string;
}

export class ProcurementWorkbookEditingError extends Error {
  readonly kind: "validation" | "conflict" | "access" | "apply" | "context";
  readonly phase: "preflight" | "apply" | "post-apply";
  readonly issues: readonly ProcurementWorkbookEditingIssue[];
  readonly appliedCount: number;
  readonly allRowsApplied: boolean;
  readonly totalCount: number;
  readonly appliedRowIds: readonly string[];
  readonly unappliedRowIds: readonly string[];
  readonly failedRowId?: string;
  readonly originalError?: unknown;

  constructor(input: {
    kind: "validation" | "conflict" | "access" | "apply" | "context";
    phase?: "preflight" | "apply" | "post-apply";
    message: string;
    issues?: readonly ProcurementWorkbookEditingIssue[];
    appliedCount?: number;
    allRowsApplied?: boolean;
    totalCount?: number;
    appliedRowIds?: readonly string[];
    unappliedRowIds?: readonly string[];
    failedRowId?: string;
    originalError?: unknown;
  }) {
    super(input.message);
    this.name = "ProcurementWorkbookEditingError";
    this.kind = input.kind;
    this.phase = input.phase || "preflight";
    this.issues = input.issues || [];
    this.appliedCount = input.appliedCount || 0;
    this.allRowsApplied = input.allRowsApplied || false;
    this.totalCount = input.totalCount || 0;
    this.appliedRowIds = input.appliedRowIds || [];
    this.unappliedRowIds = input.unappliedRowIds || [];
    this.failedRowId = input.failedRowId;
    this.originalError = input.originalError;
  }
}

interface Candidate {
  readonly sheetId: ProcurementWorkbookSheetId;
  readonly base: ProcurementWorkbookRow;
  readonly staged: ProcurementWorkbookRow;
  readonly changedFields: readonly string[];
  readonly expectedUpdatedAt: string | undefined;
}

interface PreparedCandidate extends Candidate {
  readonly current: ProcurementWorkbookRow;
}

const RFQ_EDITABLE_FIELDS = ["title", "dueDate"] as const;
const PO_EDITABLE_FIELDS = ["description"] as const;

function editableFields(sheetId: ProcurementWorkbookSheetId): readonly string[] {
  return sheetId === "rfqs" ? RFQ_EDITABLE_FIELDS : PO_EDITABLE_FIELDS;
}

function readRows(records: ProcurementRefreshContext, sheetId: ProcurementWorkbookSheetId): readonly ProcurementWorkbookRow[] {
  return sheetId === "rfqs" ? records.rfqs : records.purchaseOrders;
}

function rowKindMatches(sheetId: ProcurementWorkbookSheetId, row: ProcurementWorkbookRow): boolean {
  return sheetId === "rfqs" ? "rfqNumber" in row : "poNumber" in row;
}

function rowStatus(row: ProcurementWorkbookRow) {
  return row.status;
}

function normalizedValue(sheetId: ProcurementWorkbookSheetId, fieldId: string, value: unknown): unknown {
  const text = String(value ?? "").trim();
  if (sheetId === "rfqs" && fieldId === "dueDate") return text || null;
  if (sheetId === "purchase-orders" && fieldId === "description") return text || null;
  return text;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function issue(
  issues: ProcurementWorkbookEditingIssue[],
  rowId: string,
  fieldId: string,
  kind: ProcurementWorkbookEditingIssue["kind"],
  message: string,
) {
  issues.push({ rowId, fieldId, kind, message });
}

function buildCandidates(
  sheetId: ProcurementWorkbookSheetId,
  stagedRows: readonly ProcurementWorkbookRow[],
  baseRecords: ProcurementRefreshContext,
): { candidates: Candidate[]; issues: ProcurementWorkbookEditingIssue[] } {
  const baseRows = readRows(baseRecords, sheetId);
  const baseById = new Map(baseRows.map((row) => [row.id, row]));
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  const issues: ProcurementWorkbookEditingIssue[] = [];
  const editable = editableFields(sheetId);
  const fallbackIdentityField = sheetId === "rfqs" ? "rfqNumber" : "poNumber";

  for (const staged of stagedRows) {
    if (!rowKindMatches(sheetId, staged)) {
      issue(issues, staged.id, fallbackIdentityField, "access", "This row does not belong to the selected Procurement sheet.");
      continue;
    }
    if (seen.has(staged.id)) {
      issue(issues, staged.id, fallbackIdentityField, "access", "This Procurement record appears more than once in the worksheet.");
      continue;
    }
    seen.add(staged.id);
    const base = baseById.get(staged.id);
    if (!base) {
      issue(issues, staged.id, fallbackIdentityField, "access", "Adding RFQs and Purchase Orders from this worksheet is not available.");
      continue;
    }

    const changedFields = editable.filter((fieldId) => !Object.is(
      normalizedValue(sheetId, fieldId, (base as unknown as Record<string, unknown>)[fieldId]),
      normalizedValue(sheetId, fieldId, (staged as unknown as Record<string, unknown>)[fieldId]),
    ));
    const allKeys = new Set([...Object.keys(base), ...Object.keys(staged)]);
    const changedProtectedFields = [...allKeys].filter((fieldId) => !editable.includes(fieldId))
      .filter((fieldId) => !valuesEqual(
        (base as unknown as Record<string, unknown>)[fieldId],
        (staged as unknown as Record<string, unknown>)[fieldId],
      ));

    if (staged.updatedAt !== base.updatedAt) {
      issue(issues, base.id, "updatedAt", "conflict", "This Procurement row changed while it was open. Review current rows before re-entering changes.");
      continue;
    }
    for (const fieldId of changedProtectedFields) {
      issue(issues, base.id, fallbackIdentityField, "access", "Only the permitted draft header fields can be changed in this worksheet.");
      break;
    }
    if (!changedFields.length && !changedProtectedFields.length) continue;
    if (rowStatus(base) !== "DRAFT") {
      issue(issues, base.id, "status", "access", "Only existing DRAFT Procurement records can be edited in this worksheet.");
      continue;
    }
    candidates.push({ sheetId, base, staged, changedFields, expectedUpdatedAt: staged.updatedAt });
  }

  return { candidates, issues };
}

function hasRequiredPermissions(permissions: readonly PermissionKey[]): boolean {
  return hasAllPermissions(permissions, [PERMISSION_KEYS.procurementRead, PERMISSION_KEYS.procurementWrite]);
}

function validateCandidate(candidate: Candidate, issues: ProcurementWorkbookEditingIssue[]) {
  if (candidate.sheetId !== "rfqs") return;
  const rfq = candidate.staged as RFQ;
  const title = String(rfq.title ?? "").trim();
  if (!title || title.length > 200) {
    issue(issues, rfq.id, "title", "validation", "RFQ title is required and must be 200 characters or fewer.");
  }
  const dueDate = String(rfq.dueDate ?? "").trim();
  if (dueDate) {
    const year = Number(dueDate.slice(0, 4));
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dueDate) && year > 0
      ? new Date(`${dueDate}T00:00:00.000Z`)
      : undefined;
    if (!date || Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== dueDate) {
      issue(issues, rfq.id, "dueDate", "validation", "Due date must be a valid calendar date.");
    }
  }
}

function expectedCompanyMatches(records: ProcurementRefreshContext, expectedCompanyId: string | undefined): boolean {
  return !expectedCompanyId || records.expectedCompanyId === expectedCompanyId;
}

function rowCompanyMatches(row: ProcurementWorkbookRow, expectedCompanyId: string | undefined): boolean {
  return !expectedCompanyId || row.companyId === expectedCompanyId;
}

function isConcurrencyConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? (error as Error & { code?: unknown }).code : undefined;
  return /changed after|expected.version.mismatch|stale|conflict|only draft|not found/i.test(error.message) || code === "40001";
}

function normalizedDraftRow(candidate: Candidate, current: ProcurementWorkbookRow): ProcurementWorkbookRow {
  if (candidate.sheetId === "rfqs") {
    const staged = candidate.staged as RFQ;
    const authoritative = current as RFQ;
    return {
      ...authoritative,
      ...(candidate.changedFields.includes("title") ? { title: String(staged.title ?? "").trim() } : {}),
      ...(candidate.changedFields.includes("dueDate") ? { dueDate: String(staged.dueDate ?? "").trim() || null } : {}),
    };
  }
  const staged = candidate.staged as PurchaseOrder;
  const authoritative = current as PurchaseOrder;
  return {
    ...authoritative,
    ...(candidate.changedFields.includes("description") ? { description: String(staged.description ?? "").trim() || null } : {}),
  };
}

export function canEditProcurementWorkbookField(
  sheetId: ProcurementWorkbookSheetId,
  fieldId: string,
  row: ProcurementWorkbookRow,
  permissions: Iterable<PermissionKey> | null | undefined,
): boolean {
  const permissionSnapshot = permissions ? [...permissions] : [];
  return rowKindMatches(sheetId, row)
    && editableFields(sheetId).includes(fieldId)
    && rowStatus(row) === "DRAFT"
    && hasRequiredPermissions(permissionSnapshot);
}

export function readProcurementWorkbookValue(row: ProcurementWorkbookRow, fieldId: string): unknown {
  switch (fieldId) {
    case "rfqNumber": return "rfqNumber" in row ? row.rfqNumber : undefined;
    case "title": return "rfqNumber" in row ? row.title : undefined;
    case "dueDate": return "rfqNumber" in row ? row.dueDate || "" : undefined;
    case "poNumber": return "poNumber" in row ? row.poNumber : undefined;
    case "description": return row.description || "";
    case "total": return "poNumber" in row ? row.totalAmount ?? "" : undefined;
    case "currency": return row.currency;
    case "status": return row.status;
    case "updatedAt": return row.updatedAt || "";
    default: return undefined;
  }
}

export function applyProcurementWorkbookDraftValue(
  sheetId: ProcurementWorkbookSheetId,
  row: ProcurementWorkbookRow,
  fieldId: string,
  value: unknown,
): ProcurementWorkbookRow {
  if (sheetId === "rfqs" && "rfqNumber" in row) {
    if (fieldId === "title") return { ...row, title: String(value ?? "") };
    if (fieldId === "dueDate") return { ...row, dueDate: String(value ?? "") || null };
  }
  if (sheetId === "purchase-orders" && "poNumber" in row && fieldId === "description") {
    return { ...row, description: String(value ?? "") };
  }
  return row;
}

export async function saveProcurementWorkbookRows(input: {
  readonly writeMode: ProcurementWorkbookWriteMode;
  readonly sheetId: ProcurementWorkbookSheetId;
  readonly stagedRows: readonly ProcurementWorkbookRow[];
  readonly baseRecords: ProcurementRefreshContext;
  readonly permissions: Iterable<PermissionKey>;
  readonly expectedCompanyId?: string;
  readonly refresh?: () => Promise<ProcurementRefreshContext>;
  readonly saveRFQ?: ProcurementApplyCallbacks["saveRFQ"];
  readonly savePurchaseOrder?: ProcurementApplyCallbacks["savePurchaseOrder"];
  readonly saveSyntheticRecords?: (records: ProcurementRefreshContext) => void | Promise<void>;
  readonly isContextCurrent: () => boolean;
}): Promise<{
  readonly writeMode: ProcurementWorkbookWriteMode;
  readonly refreshedRecords: ProcurementRefreshContext;
  readonly appliedCount: number;
}> {
  const permissions = [...new Set(input.permissions)];
  if (!hasRequiredPermissions(permissions)) {
    throw new ProcurementWorkbookEditingError({ kind: "access", message: "Both Procurement read and manage access are required to save workbook changes." });
  }
  const initial = buildCandidates(input.sheetId, input.stagedRows, input.baseRecords);
  if (initial.issues.length) {
    const kind = initial.issues.some((item) => item.kind === "conflict")
      ? "conflict"
      : initial.issues.some((item) => item.kind === "access") ? "access" : "validation";
    throw new ProcurementWorkbookEditingError({ kind, message: "Review the Procurement worksheet rows before saving.", issues: initial.issues });
  }
  for (const candidate of initial.candidates) validateCandidate(candidate, initial.issues);
  if (initial.issues.length) {
    throw new ProcurementWorkbookEditingError({ kind: "validation", message: "Review the highlighted Procurement worksheet issues before saving.", issues: initial.issues });
  }

  const expectedCompanyId = input.writeMode === "synthetic-demo"
    ? undefined
    : input.expectedCompanyId || input.baseRecords.expectedCompanyId;
  if (!expectedCompanyMatches(input.baseRecords, expectedCompanyId)) {
    throw new ProcurementWorkbookEditingError({ kind: "conflict", message: "Company access changed. Reopen the workbook before saving Procurement changes." });
  }
  for (const candidate of initial.candidates) {
    if (!rowCompanyMatches(candidate.base, expectedCompanyId)) {
      throw new ProcurementWorkbookEditingError({
        kind: "conflict",
        message: "This Procurement row is outside the active company context. Reopen the workbook before saving.",
        issues: [{ rowId: candidate.base.id, fieldId: input.sheetId === "rfqs" ? "rfqNumber" : "poNumber", kind: "conflict", message: "Company identity does not match the active workspace." }],
      });
    }
  }

  if (input.writeMode === "synthetic-demo") {
    if (!input.saveSyntheticRecords) {
      throw new ProcurementWorkbookEditingError({ kind: "access", message: "Synthetic Procurement worksheet save is not configured." });
    }
    if (!input.isContextCurrent()) {
      throw new ProcurementWorkbookEditingError({ kind: "context", message: "Company or access changed during save. Reopen the workbook before editing." });
    }
    const candidatesById = new Map(initial.candidates.map((candidate) => [candidate.base.id, candidate]));
    const rows = readRows(input.baseRecords, input.sheetId).map((base) => {
      const candidate = candidatesById.get(base.id);
      return candidate ? normalizedDraftRow(candidate, base) : base;
    });
    const nextRecords = input.sheetId === "rfqs"
      ? { ...input.baseRecords, rfqs: rows as readonly RFQ[] }
      : { ...input.baseRecords, purchaseOrders: rows as readonly PurchaseOrder[] };
    await input.saveSyntheticRecords(nextRecords);
    return { writeMode: "synthetic-demo", refreshedRecords: nextRecords, appliedCount: initial.candidates.length };
  }

  if (!initial.candidates.length) {
    return { writeMode: "existing-domain", refreshedRecords: input.baseRecords, appliedCount: 0 };
  }
  if (!input.refresh || (input.sheetId === "rfqs" ? !input.saveRFQ : !input.savePurchaseOrder)) {
    throw new ProcurementWorkbookEditingError({ kind: "access", message: "Procurement refresh and save callbacks are not configured." });
  }
  if (!input.isContextCurrent()) {
    throw new ProcurementWorkbookEditingError({ kind: "context", message: "Company or access changed during save. Reopen the workbook before editing." });
  }

  let latest: ProcurementRefreshContext;
  try {
    latest = await input.refresh();
  } catch (error) {
    throw new ProcurementWorkbookEditingError({
      kind: "apply",
      phase: "preflight",
      message: "Could not refresh current Procurement data before saving. Staged edits remain in the worksheet.",
      originalError: error,
    });
  }
  if (!input.isContextCurrent()) {
    throw new ProcurementWorkbookEditingError({ kind: "context", message: "Company or access changed during save. Reopen the workbook before editing." });
  }
  if (!expectedCompanyMatches(latest, expectedCompanyId)) {
    throw new ProcurementWorkbookEditingError({ kind: "conflict", message: "Procurement data belongs to a different company context. Review current rows before saving." });
  }

  const latestById = new Map(readRows(latest, input.sheetId).map((row) => [row.id, row]));
  const prepared: PreparedCandidate[] = [];
  const preflightIssues: ProcurementWorkbookEditingIssue[] = [];
  for (const candidate of initial.candidates) {
    const current = latestById.get(candidate.base.id);
    const identityField = input.sheetId === "rfqs" ? "rfqNumber" : "poNumber";
    if (!current || !candidate.expectedUpdatedAt || !current.updatedAt || current.updatedAt !== candidate.expectedUpdatedAt) {
      issue(preflightIssues, candidate.base.id, "updatedAt", "conflict", "This Procurement row changed after the worksheet opened. Review the refreshed row before re-entering changes.");
      continue;
    }
    if (!rowCompanyMatches(current, expectedCompanyId)) {
      issue(preflightIssues, current.id, identityField, "conflict", "This Procurement row is outside the active company context.");
      continue;
    }
    if (rowStatus(current) !== "DRAFT") {
      issue(preflightIssues, current.id, "status", "conflict", "This Procurement record is no longer a DRAFT. Review its current workflow state.");
      continue;
    }
    const refreshedCandidate = { ...candidate, base: current };
    validateCandidate(refreshedCandidate, preflightIssues);
    if (!preflightIssues.some((item) => item.rowId === current.id)) prepared.push({ ...candidate, current });
  }
  if (preflightIssues.length) {
    const kind = preflightIssues.some((item) => item.kind === "conflict") ? "conflict" : "validation";
    throw new ProcurementWorkbookEditingError({
      kind,
      phase: "preflight",
      message: kind === "conflict"
        ? "Procurement data changed while you were editing. Review the refreshed rows before re-entering changes."
        : "Review the highlighted Procurement worksheet issues before saving.",
      issues: preflightIssues,
    });
  }

  let appliedCount = 0;
  const appliedRowIds: string[] = [];
  for (const candidate of prepared) {
    if (!input.isContextCurrent()) {
      throw new ProcurementWorkbookEditingError({
        kind: "context",
        phase: "apply",
        message: "Company or access changed during save. Reopen the workbook before editing.",
        appliedCount,
        totalCount: prepared.length,
        appliedRowIds,
        unappliedRowIds: prepared.slice(appliedCount).map((item) => item.current.id),
        failedRowId: candidate.current.id,
      });
    }
    const proposed = normalizedDraftRow(candidate, candidate.current);
    try {
      if (candidate.sheetId === "rfqs") {
        const rfq = candidate.current as RFQ;
        await input.saveRFQ!(
          proposed as RFQ,
          rfq.lines || [],
          undefined,
          candidate.expectedUpdatedAt,
          true,
        );
      } else {
        const po = candidate.current as PurchaseOrder;
        await input.savePurchaseOrder!(
          proposed as PurchaseOrder,
          po.lines || [],
          candidate.expectedUpdatedAt,
          true,
        );
      }
      appliedCount += 1;
      appliedRowIds.push(candidate.current.id);
    } catch (error) {
      throw new ProcurementWorkbookEditingError({
        kind: isConcurrencyConflict(error) ? "conflict" : "apply",
        phase: "apply",
        message: isConcurrencyConflict(error)
          ? "This Procurement row changed before it could be saved. Review the current row before re-entering changes."
          : error instanceof Error && error.message ? error.message : "Could not save Procurement worksheet changes.",
        appliedCount,
        totalCount: prepared.length,
        appliedRowIds,
        unappliedRowIds: prepared.slice(appliedCount).map((item) => item.current.id),
        failedRowId: candidate.current.id,
        originalError: error,
      });
    }
  }

  let refreshedRecords: ProcurementRefreshContext;
  try {
    refreshedRecords = await input.refresh();
  } catch (error) {
    throw new ProcurementWorkbookEditingError({
      kind: "apply",
      phase: "post-apply",
      message: "Procurement changes were saved, but the latest rows could not be refreshed. Reload before continuing.",
      appliedCount,
      allRowsApplied: true,
      totalCount: prepared.length,
      appliedRowIds,
      originalError: error,
    });
  }
  if (!input.isContextCurrent()) {
    throw new ProcurementWorkbookEditingError({
      kind: "context",
      phase: "post-apply",
      message: "Procurement changes were saved, but company or access changed during refresh. Reopen the workbook.",
      appliedCount,
      allRowsApplied: true,
      totalCount: prepared.length,
      appliedRowIds,
    });
  }
  if (!expectedCompanyMatches(refreshedRecords, expectedCompanyId)) {
    throw new ProcurementWorkbookEditingError({
      kind: "conflict",
      phase: "post-apply",
      message: "Procurement changes were saved, but the refreshed company context changed. Reopen the workbook before continuing.",
      appliedCount,
      allRowsApplied: true,
      totalCount: prepared.length,
      appliedRowIds,
    });
  }
  const refreshedById = new Map(readRows(refreshedRecords, input.sheetId).map((row) => [row.id, row]));
  for (const candidate of prepared) {
    const expected = normalizedDraftRow(candidate, candidate.current);
    const confirmed = refreshedById.get(candidate.current.id);
    const fields = editableFields(candidate.sheetId);
    if (!confirmed || fields.some((fieldId) => candidate.changedFields.includes(fieldId)
      && !Object.is(
        normalizedValue(candidate.sheetId, fieldId, (expected as unknown as Record<string, unknown>)[fieldId]),
        normalizedValue(candidate.sheetId, fieldId, (confirmed as unknown as Record<string, unknown>)[fieldId]),
      ))) {
      throw new ProcurementWorkbookEditingError({
        kind: "conflict",
        phase: "post-apply",
        message: "Procurement changes were saved, but the refreshed rows did not confirm the edited values. Reload and review before continuing.",
        appliedCount,
        allRowsApplied: true,
        totalCount: prepared.length,
        appliedRowIds,
      });
    }
  }
  return { writeMode: "existing-domain", refreshedRecords, appliedCount };
}
