import type {
  Project,
  PurchaseOrder,
  PurchaseOrderLine,
  RFQ,
  RFQLine,
  Vendor,
} from "../types.ts";
import {
  exportOperationsWorkbook,
  fingerprintValue,
  parseOperationsWorkbook,
  type ParsedOperationsWorkbook,
  type WorkbookExportArtifact,
  type WorkbookCellValue,
  type WorkbookSchema,
} from "./operationsWorkbook.ts";

export const PROCUREMENT_WORKBOOK_SCHEMA_VERSION = 1;

const RFQ_HEADERS = [
  "RFQ Number", "Title", "Description", "Project Code", "Currency", "Issue Date", "Due Date", "Status", "Notes",
  "__HQ Record ID", "__HQ Company ID", "__HQ Fingerprint", "__HQ Updated At",
] as const;
const RFQ_LINE_HEADERS = [
  "RFQ Number", "Line Number", "Description", "Quantity", "Unit", "Project Cost Code", "Requested Delivery Date", "Notes",
  "__HQ Parent ID", "__HQ Line ID", "__HQ Company ID", "__HQ Fingerprint",
] as const;
const PO_HEADERS = [
  "PO Number", "Supplier", "Project Code", "Currency", "Status", "Issue Date", "Description", "Notes", "Committed Amount",
  "__HQ Record ID", "__HQ Company ID", "__HQ Fingerprint", "__HQ Updated At",
] as const;
const PO_LINE_HEADERS = [
  "PO Number", "Line Number", "Description", "Quantity", "Unit", "Unit Price", "Amount", "Project Cost Code",
  "__HQ Parent ID", "__HQ Line ID", "__HQ Company ID", "__HQ Fingerprint",
] as const;
const HIDDEN_SYNC_HEADERS = ["__HQ Record ID", "__HQ Company ID", "__HQ Fingerprint", "__HQ Updated At", "__HQ Parent ID", "__HQ Line ID"] as const;

export const PROCUREMENT_WORKBOOK_SCHEMA: WorkbookSchema = {
  schemaVersion: PROCUREMENT_WORKBOOK_SCHEMA_VERSION,
  domain: "PROCUREMENT",
  workbookKind: "PROCUREMENT_EDIT",
  metadataSheetName: "_HydroQualiSense",
  sheets: [
    { name: "RFQs", headers: RFQ_HEADERS, hiddenHeaders: HIDDEN_SYNC_HEADERS },
    { name: "RFQ Lines", headers: RFQ_LINE_HEADERS, hiddenHeaders: HIDDEN_SYNC_HEADERS },
    { name: "Purchase Orders", headers: PO_HEADERS, hiddenHeaders: HIDDEN_SYNC_HEADERS },
    { name: "PO Lines", headers: PO_LINE_HEADERS, hiddenHeaders: HIDDEN_SYNC_HEADERS },
  ],
};

export type ProcurementEntity = "RFQ" | "PURCHASE_ORDER";
export type ProcurementProposalStatus =
  | "UNCHANGED"
  | "WORKBOOK_ONLY_CHANGE"
  | "APP_ONLY_CHANGE"
  | "STALE_CONFLICT"
  | "INVALID"
  | "UNAUTHORIZED"
  | "UNSUPPORTED_PROTECTED_FIELD"
  | "MISSING_REFERENCE"
  | "PROPOSED_NEW_RECORD";

export interface ProcurementWorkbookExportInput {
  rfqs: readonly RFQ[];
  purchaseOrders: readonly PurchaseOrder[];
  projects: readonly Project[];
  vendors: readonly Vendor[];
  companyId?: string;
  fileName?: string;
}

export interface ProcurementImportContext {
  rfqs: readonly RFQ[];
  purchaseOrders: readonly PurchaseOrder[];
  projects: readonly Project[];
  vendors: readonly Vendor[];
  expectedCompanyId?: string;
  canWrite: boolean;
}

export type ProcurementRefreshContext = Pick<ProcurementImportContext, "rfqs" | "purchaseOrders" | "projects" | "vendors">;

export interface ProcurementFieldChange {
  field: string;
  currentValue: unknown;
  workbookValue: unknown;
  exportedValue: unknown;
  editable: boolean;
}

export interface ProcurementLineChange extends ProcurementFieldChange {
  lineId: string;
}

type RFQSavePayload = {
  rfq: Partial<RFQ> & { rfqNumber: string; title: string };
  lines: Array<Partial<RFQLine> & { description: string; quantity: number }>;
  invitedVendorIds?: string[];
};

type POSavePayload = {
  po: Partial<PurchaseOrder> & { poNumber: string; vendorId: string; projectId: string };
  lines: Array<Partial<PurchaseOrderLine> & { description: string; quantity: number; unitPrice: number }>;
};

export interface ProcurementProposal {
  id: string;
  entity: ProcurementEntity;
  recordId: string;
  label: string;
  status: ProcurementProposalStatus;
  action: "NONE" | "UPDATE" | "DELETE";
  currentFingerprint?: string;
  exportedFingerprint?: string;
  changes: ProcurementFieldChange[];
  lineChanges: ProcurementLineChange[];
  messages: string[];
  canApply: boolean;
  applyPayload?: RFQSavePayload | POSavePayload;
}

export interface ProcurementImportReview {
  bytes: Uint8Array;
  fileName?: string;
  proposals: ProcurementProposal[];
  omittedRecordIds: string[];
  workbookWarnings: string[];
}

export interface ProcurementApplyCallbacks {
  saveRFQ: (rfq: RFQSavePayload["rfq"], lines: RFQSavePayload["lines"], invitedVendorIds?: string[]) => Promise<void>;
  savePurchaseOrder: (po: POSavePayload["po"], lines: POSavePayload["lines"]) => Promise<void>;
}

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function nullableText(value: unknown) {
  const next = text(value);
  return next || null;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(text(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function dateValue(value: unknown) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
  }
  const next = text(value);
  if (!next) return null;
  const date = new Date(`${next}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

function dateCell(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : date;
}

function normalizedVendorName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function stateForRFQ(rfq: RFQ) {
  return {
    id: rfq.id,
    companyId: rfq.companyId || null,
    rfqNumber: rfq.rfqNumber,
    title: rfq.title,
    description: rfq.description || null,
    projectId: rfq.projectId || null,
    currency: rfq.currency,
    status: rfq.status,
    issueDate: rfq.issueDate || null,
    dueDate: rfq.dueDate || null,
    notes: rfq.notes || null,
    cancellationReason: rfq.cancellationReason || null,
    selectedQuotationId: rfq.selectedQuotationId || null,
    invitedVendorIds: [...(rfq.invitedVendorIds || [])].sort(),
    updatedAt: rfq.updatedAt || null,
    lines: [...(rfq.lines || [])].sort((a, b) => a.lineNumber - b.lineNumber).map((line) => ({
      id: line.id,
      companyId: line.companyId || null,
      rfqId: line.rfqId,
      lineNumber: line.lineNumber,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      projectCostCodeId: line.projectCostCodeId || null,
      requestedDeliveryDate: line.requestedDeliveryDate || null,
      notes: line.notes || null,
    })),
  };
}

function stateForPO(po: PurchaseOrder) {
  return {
    id: po.id,
    companyId: po.companyId || null,
    poNumber: po.poNumber,
    vendorId: po.vendorId,
    projectId: po.projectId,
    currency: po.currency,
    status: po.status,
    issueDate: po.issueDate || null,
    description: po.description || null,
    notes: po.notes || null,
    cancellationReason: po.cancellationReason || null,
    rfqId: po.rfqId || null,
    supplierQuotationId: po.supplierQuotationId || null,
    totalAmount: po.totalAmount ?? null,
    updatedAt: po.updatedAt || null,
    lines: [...(po.lines || [])].sort((a, b) => a.lineNumber - b.lineNumber).map((line) => ({
      id: line.id,
      companyId: line.companyId || null,
      purchaseOrderId: line.purchaseOrderId,
      lineNumber: line.lineNumber,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.unitPrice,
      amount: line.amount,
      projectCostCodeId: line.projectCostCodeId || null,
    })),
  };
}

function metadataRow(entity: string, record: RFQ | PurchaseOrder, state: unknown, lineId?: string, parentId?: string) {
  return {
    entity,
    recordId: record.id,
    lineId: lineId || null,
    parentId: parentId || null,
    companyId: record.companyId || null,
    fingerprint: fingerprintValue(state),
    stateJson: JSON.stringify(state),
    updatedAt: record.updatedAt || null,
    allowedOperations: "UPDATE_DRAFT_ONLY",
  };
}

export function exportProcurementWorkbook(input: ProcurementWorkbookExportInput): WorkbookExportArtifact {
  const projectById = new Map(input.projects.map((project) => [project.id, project]));
  const vendorById = new Map(input.vendors.map((vendor) => [vendor.id, vendor]));
  const metadataRows: Array<Record<string, WorkbookCellValue>> = [];
  const rfqRows = input.rfqs.map((rfq) => {
    const state = stateForRFQ(rfq);
    metadataRows.push(metadataRow("RFQ", rfq, state));
    for (const line of rfq.lines || []) metadataRows.push(metadataRow("RFQ_LINE", rfq, line, line.id, rfq.id));
    return {
      "RFQ Number": rfq.rfqNumber,
      Title: rfq.title,
      Description: rfq.description || "",
      "Project Code": rfq.projectId ? projectById.get(rfq.projectId)?.projectCode || "" : "",
      Currency: rfq.currency,
      "Issue Date": dateCell(rfq.issueDate),
      "Due Date": dateCell(rfq.dueDate),
      Status: rfq.status,
      Notes: rfq.notes || "",
      "__HQ Record ID": rfq.id,
      "__HQ Company ID": rfq.companyId || "",
      "__HQ Fingerprint": fingerprintValue(state),
      "__HQ Updated At": rfq.updatedAt || "",
    };
  });
  const rfqLineRows = input.rfqs.flatMap((rfq) => (rfq.lines || []).map((line) => ({
    "RFQ Number": rfq.rfqNumber,
    "Line Number": line.lineNumber,
    Description: line.description,
    Quantity: line.quantity,
    Unit: line.unit,
    "Project Cost Code": line.projectCostCodeId || "",
    "Requested Delivery Date": dateCell(line.requestedDeliveryDate),
    Notes: line.notes || "",
    "__HQ Parent ID": rfq.id,
    "__HQ Line ID": line.id,
    "__HQ Company ID": line.companyId || rfq.companyId || "",
    "__HQ Fingerprint": fingerprintValue(line),
  })));
  const poRows = input.purchaseOrders.map((po) => {
    const state = stateForPO(po);
    metadataRows.push(metadataRow("PURCHASE_ORDER", po, state));
    for (const line of po.lines || []) metadataRows.push(metadataRow("PURCHASE_ORDER_LINE", po, line, line.id, po.id));
    return {
      "PO Number": po.poNumber,
      Supplier: vendorById.get(po.vendorId)?.name || "",
      "Project Code": projectById.get(po.projectId)?.projectCode || "",
      Currency: po.currency,
      Status: po.status,
      "Issue Date": dateCell(po.issueDate),
      Description: po.description || "",
      Notes: po.notes || "",
      "Committed Amount": po.totalAmount ?? "",
      "__HQ Record ID": po.id,
      "__HQ Company ID": po.companyId || "",
      "__HQ Fingerprint": fingerprintValue(state),
      "__HQ Updated At": po.updatedAt || "",
    };
  });
  const poLineRows = input.purchaseOrders.flatMap((po) => (po.lines || []).map((line) => ({
    "PO Number": po.poNumber,
    "Line Number": line.lineNumber,
    Description: line.description,
    Quantity: line.quantity,
    Unit: line.unit,
    "Unit Price": line.unitPrice,
    Amount: line.amount,
    "Project Cost Code": line.projectCostCodeId || "",
    "__HQ Parent ID": po.id,
    "__HQ Line ID": line.id,
    "__HQ Company ID": line.companyId || po.companyId || "",
    "__HQ Fingerprint": fingerprintValue(line),
  })));
  const companyIds = [...new Set([...input.rfqs, ...input.purchaseOrders].map((record) => record.companyId).filter(Boolean))];
  return exportOperationsWorkbook({
    schema: PROCUREMENT_WORKBOOK_SCHEMA,
    metadata: { companyId: input.companyId || (companyIds.length === 1 ? companyIds[0] : null), exportMode: "EDIT_UPDATE_ONLY" },
    metadataRows,
    sheets: [
      { name: "RFQs", rows: rfqRows, hiddenHeaders: HIDDEN_SYNC_HEADERS },
      { name: "RFQ Lines", rows: rfqLineRows, hiddenHeaders: HIDDEN_SYNC_HEADERS },
      { name: "Purchase Orders", rows: poRows, hiddenHeaders: HIDDEN_SYNC_HEADERS },
      { name: "PO Lines", rows: poLineRows, hiddenHeaders: HIDDEN_SYNC_HEADERS },
    ],
    fileName: input.fileName || `HydroQualiSense_Procurement_${new Date().toISOString().slice(0, 10)}.xlsx`,
  });
}

function recordMetadata(parsed: ParsedOperationsWorkbook) {
  const map = new Map<string, Record<string, unknown>>();
  for (const row of parsed.metadataRows) {
    const key = `${text(row.entity)}:${text(row.recordId)}:${text(row.lineId)}`;
    map.set(key, row);
  }
  return map;
}

function parseState(row: Record<string, unknown> | undefined) {
  if (!row || !text(row.stateJson)) return undefined;
  try {
    return JSON.parse(text(row.stateJson)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function projectIdForCode(value: unknown, projects: readonly Project[]) {
  const code = text(value).toUpperCase();
  if (!code) return { value: null as string | null };
  const matches = projects.filter((project) => project.projectCode.toUpperCase() === code);
  return matches.length === 1 ? { value: matches[0].id } : { error: `Project reference "${text(value)}" is unresolved or ambiguous.` };
}

function vendorIdForName(value: unknown, vendors: readonly Vendor[]) {
  const name = normalizedVendorName(text(value));
  if (!name) return { error: "Supplier reference is required." };
  const matches = vendors.filter((vendor) => normalizedVendorName(vendor.name) === name && vendor.active !== false && !vendor.archivedAt);
  return matches.length === 1 ? { value: matches[0].id } : { error: `Supplier reference "${text(value)}" is unresolved or ambiguous.` };
}

function validDateOrError(value: unknown, label: string) {
  const parsed = dateValue(value);
  return parsed === undefined ? { error: `${label} must be a valid date.` } : { value: parsed };
}

function compareChange(field: string, currentValue: unknown, workbookValue: unknown, exportedValue: unknown, editable: boolean): ProcurementFieldChange | undefined {
  if (JSON.stringify(currentValue ?? null) === JSON.stringify(workbookValue ?? null)) return undefined;
  return { field, currentValue, workbookValue, exportedValue, editable };
}

function lineChange(lineId: string, field: string, currentValue: unknown, workbookValue: unknown, exportedValue: unknown, editable: boolean): ProcurementLineChange | undefined {
  const change = compareChange(field, currentValue, workbookValue, exportedValue, editable);
  return change ? { ...change, lineId } : undefined;
}

function validateLineSynchronization(
  entity: "RFQ_LINE" | "PURCHASE_ORDER_LINE",
  parentId: string,
  lineId: string,
  row: Record<string, unknown>,
  metadata: Map<string, Record<string, unknown>>,
  expectedCompanyId?: string,
) {
  const messages: string[] = [];
  const sync = metadata.get(`${entity}:${parentId}:${lineId}`);
  const exportedState = parseState(sync);
  const fingerprint = text(sync?.fingerprint);
  let invalid = false;
  let unauthorized = false;

  if (!sync || !exportedState || !fingerprint) {
    invalid = true;
    messages.push(`Synchronization metadata for line ${lineId} is missing or invalid.`);
  } else {
    if (fingerprintValue(exportedState) !== fingerprint) {
      invalid = true;
      messages.push(`Synchronization state for line ${lineId} does not match its fingerprint.`);
    }
    if (
      text(sync.recordId) !== parentId
      || text(sync.parentId) !== parentId
      || text(sync.lineId) !== lineId
      || text(row["__HQ Parent ID"]) !== parentId
      || text(row["__HQ Line ID"]) !== lineId
    ) {
      invalid = true;
      messages.push(`Synchronization identity for line ${lineId} does not match its exported parent/line identity.`);
    }
    if (text(row["__HQ Fingerprint"]) !== fingerprint) {
      invalid = true;
      messages.push(`Synchronization fingerprint for line ${lineId} does not match its metadata.`);
    }
    if (text(sync.companyId) && text(row["__HQ Company ID"]) !== text(sync.companyId)) {
      invalid = true;
      messages.push(`Synchronization company identity for line ${lineId} does not match its metadata.`);
    }
    if (
      expectedCompanyId
      && ((text(sync.companyId) && text(sync.companyId) !== expectedCompanyId)
        || (text(row["__HQ Company ID"]) && text(row["__HQ Company ID"]) !== expectedCompanyId))
    ) {
      unauthorized = true;
      messages.push(`Line ${lineId} is outside the active company scope.`);
    }
  }

  return { invalid, unauthorized, messages };
}

function buildRfqProposal(rfq: RFQ, row: Record<string, unknown>, lineRows: Record<string, unknown>[], metadata: Map<string, Record<string, unknown>>, context: ProcurementImportContext, workbookCompanyId?: string): ProcurementProposal {
  const id = `RFQ:${rfq.id}`;
  const sync = metadata.get(`RFQ:${rfq.id}:`);
  const exportedState = parseState(sync);
  const exportedFingerprint = text(sync?.fingerprint) || undefined;
  const currentState = stateForRFQ(rfq);
  const changes: ProcurementFieldChange[] = [];
  const lineChanges: ProcurementLineChange[] = [];
  const messages: string[] = [];
  let invalid = !sync || !exportedState;
  let unauthorized = Boolean(workbookCompanyId && context.expectedCompanyId && workbookCompanyId !== context.expectedCompanyId);
  let missingReference = false;
  let protectedChange = false;

  if (!sync || !exportedState) messages.push("Synchronization metadata for this RFQ is missing or invalid.");
  if (exportedState && exportedFingerprint && fingerprintValue(exportedState) !== exportedFingerprint) { invalid = true; messages.push("RFQ synchronization state does not match its fingerprint."); }
  if (sync && exportedFingerprint && text(row["__HQ Fingerprint"]) !== exportedFingerprint) { invalid = true; messages.push("RFQ synchronization fingerprint does not match its metadata."); }
  if (sync && text(sync.companyId) && text(row["__HQ Company ID"]) !== text(sync.companyId)) { invalid = true; messages.push("RFQ synchronization company identity does not match its metadata."); }
  if (rfq.companyId && context.expectedCompanyId && rfq.companyId !== context.expectedCompanyId) {
    unauthorized = true;
    messages.push("RFQ is outside the active company scope.");
  }
  if (text(row["__HQ Company ID"]) && context.expectedCompanyId && text(row["__HQ Company ID"]) !== context.expectedCompanyId) {
    unauthorized = true;
    messages.push("Workbook record identity is outside the active company scope.");
  }

  const project = projectIdForCode(row["Project Code"], context.projects);
  if (project.error) {
    missingReference = true;
    messages.push(project.error);
  }
  const dueDate = validDateOrError(row["Due Date"], "Due date");
  const issueDate = validDateOrError(row["Issue Date"], "Issue date");
  if (dueDate.error || issueDate.error) {
    invalid = true;
    if (dueDate.error) messages.push(dueDate.error);
    if (issueDate.error) messages.push(issueDate.error);
  }
  const workbookValues = {
    rfqNumber: text(row["RFQ Number"]),
    title: text(row.Title),
    description: nullableText(row.Description),
    projectId: project.value,
    currency: text(row.Currency).toUpperCase(),
    issueDate: issueDate.value ?? null,
    dueDate: dueDate.value ?? null,
    status: text(row.Status).toUpperCase(),
    notes: nullableText(row.Notes),
  };
  if (!workbookValues.title || workbookValues.title.length > 200) { invalid = true; messages.push("RFQ title is required and must be 200 characters or fewer."); }
  if (!/^[A-Z]{3}$/.test(workbookValues.currency)) { invalid = true; messages.push("RFQ currency must be a three-letter ISO code."); }
  const currentLines = new Map((rfq.lines || []).map((line) => [line.id, line]));
  const uploadedLineIds = new Set<string>();
  for (const lineRow of lineRows.filter((candidate) => text(candidate["__HQ Parent ID"]) === rfq.id)) {
    const lineId = text(lineRow["__HQ Line ID"]);
    if (!lineId) { invalid = true; messages.push("New RFQ lines are not supported in this pilot."); continue; }
    if (uploadedLineIds.has(lineId) || !currentLines.has(lineId)) { unauthorized = true; messages.push(`Unknown or duplicate RFQ line identity ${lineId}.`); continue; }
    uploadedLineIds.add(lineId);
    const currentLine = currentLines.get(lineId)!;
    const lineSync = validateLineSynchronization("RFQ_LINE", rfq.id, lineId, lineRow, metadata, context.expectedCompanyId);
    if (lineSync.invalid) invalid = true;
    if (lineSync.unauthorized) unauthorized = true;
    messages.push(...lineSync.messages);
    const quantity = numberValue(lineRow.Quantity);
    const lineNumber = numberValue(lineRow["Line Number"]);
    const deliveryDate = validDateOrError(lineRow["Requested Delivery Date"], "Requested delivery date");
    if (quantity === undefined || quantity <= 0) { invalid = true; messages.push(`RFQ line ${lineId} quantity must be positive.`); }
    if (lineNumber === undefined || !Number.isInteger(lineNumber) || lineNumber <= 0) { invalid = true; messages.push(`RFQ line ${lineId} line number must be a positive integer.`); }
    if (deliveryDate.error) { invalid = true; messages.push(deliveryDate.error); }
    const line = {
      description: text(lineRow.Description),
      quantity: quantity ?? currentLine.quantity,
      unit: text(lineRow.Unit),
      projectCostCodeId: nullableText(lineRow["Project Cost Code"]),
      requestedDeliveryDate: deliveryDate.value ?? null,
      notes: nullableText(lineRow.Notes),
    };
    if (!line.description || !line.unit) { invalid = true; messages.push(`RFQ line ${lineId} description and unit are required.`); }
    const baselineLine = (exportedState?.lines as Array<Record<string, unknown>> | undefined)?.find((candidate) => candidate.id === lineId) || {};
    const lineFields: Array<[string, unknown, unknown, unknown, boolean]> = [
      ["rfqNumber", rfq.rfqNumber, text(lineRow["RFQ Number"]), exportedState?.rfqNumber, false],
      ["lineNumber", currentLine.lineNumber, lineNumber ?? currentLine.lineNumber, baselineLine.lineNumber, false],
      ["description", currentLine.description, line.description, baselineLine.description, true],
      ["quantity", currentLine.quantity, line.quantity, baselineLine.quantity, true],
      ["unit", currentLine.unit, line.unit, baselineLine.unit, true],
      ["projectCostCodeId", currentLine.projectCostCodeId || null, line.projectCostCodeId, baselineLine.projectCostCodeId || null, false],
      ["requestedDeliveryDate", currentLine.requestedDeliveryDate || null, line.requestedDeliveryDate, baselineLine.requestedDeliveryDate || null, true],
      ["notes", currentLine.notes || null, line.notes, baselineLine.notes || null, true],
    ];
    for (const [field, currentValue, workbookValue, exportedValue, editable] of lineFields) {
      const change = lineChange(lineId, field, currentValue, workbookValue, exportedValue, editable);
      if (change) { lineChanges.push(change); if (!editable) protectedChange = true; }
    }
  }
  const topFields: Array<[string, unknown, unknown, unknown, boolean]> = [
    ["rfqNumber", rfq.rfqNumber, workbookValues.rfqNumber, exportedState?.rfqNumber, false],
    ["title", rfq.title, workbookValues.title, exportedState?.title, true],
    ["description", rfq.description || null, workbookValues.description, exportedState?.description || null, true],
    ["projectId", rfq.projectId || null, workbookValues.projectId, exportedState?.projectId || null, true],
    ["currency", rfq.currency, workbookValues.currency, exportedState?.currency, true],
    ["issueDate", rfq.issueDate || null, workbookValues.issueDate, exportedState?.issueDate || null, false],
    ["dueDate", rfq.dueDate || null, workbookValues.dueDate, exportedState?.dueDate || null, true],
    ["status", rfq.status, workbookValues.status, exportedState?.status, false],
    ["notes", rfq.notes || null, workbookValues.notes, exportedState?.notes || null, true],
  ];
  for (const [field, currentValue, workbookValue, exportedValue, editable] of topFields) {
    const change = compareChange(field, currentValue, workbookValue, exportedValue, editable);
    if (change) { changes.push(change); if (!editable) protectedChange = true; }
  }

  const workbookChanged = changes.length > 0 || lineChanges.length > 0;
  if (rfq.status !== "DRAFT" && workbookChanged) protectedChange = true;
  const currentChanged = Boolean(exportedFingerprint && fingerprintValue(currentState) !== exportedFingerprint);
  const status: ProcurementProposalStatus = unauthorized
    ? "UNAUTHORIZED"
    : invalid
      ? "INVALID"
      : missingReference
        ? "MISSING_REFERENCE"
        : !context.canWrite && workbookChanged
          ? "UNAUTHORIZED"
          : protectedChange
            ? "UNSUPPORTED_PROTECTED_FIELD"
            : currentChanged && workbookChanged
              ? "STALE_CONFLICT"
              : currentChanged
                ? "APP_ONLY_CHANGE"
                : workbookChanged
                  ? "WORKBOOK_ONLY_CHANGE"
                  : "UNCHANGED";
  const applyPayload: RFQSavePayload = {
    rfq: {
      id: rfq.id,
      rfqNumber: rfq.rfqNumber,
      title: workbookValues.title,
      description: workbookValues.description,
      projectId: workbookValues.projectId,
      currency: workbookValues.currency,
      dueDate: workbookValues.dueDate,
      notes: workbookValues.notes,
    },
    lines: (rfq.lines || []).map((currentLine) => {
      const source = lineRows.find((candidate) => text(candidate["__HQ Line ID"]) === currentLine.id);
      if (!source) return { ...currentLine };
      return {
        ...currentLine,
        description: text(source.Description),
        quantity: numberValue(source.Quantity) ?? currentLine.quantity,
        unit: text(source.Unit),
        projectCostCodeId: currentLine.projectCostCodeId || null,
        requestedDeliveryDate: dateValue(source["Requested Delivery Date"]) ?? null,
        notes: nullableText(source.Notes),
      };
    }),
    invitedVendorIds: [...(rfq.invitedVendorIds || [])],
  };
  return {
    id,
    entity: "RFQ",
    recordId: rfq.id,
    label: rfq.rfqNumber,
    status,
    action: workbookChanged ? "UPDATE" : "NONE",
    currentFingerprint: fingerprintValue(currentState),
    exportedFingerprint,
    changes,
    lineChanges,
    messages,
    canApply: status === "WORKBOOK_ONLY_CHANGE" && rfq.status === "DRAFT",
    applyPayload,
  };
}

function buildPoProposal(po: PurchaseOrder, row: Record<string, unknown>, lineRows: Record<string, unknown>[], metadata: Map<string, Record<string, unknown>>, context: ProcurementImportContext, workbookCompanyId?: string): ProcurementProposal {
  const id = `PURCHASE_ORDER:${po.id}`;
  const sync = metadata.get(`PURCHASE_ORDER:${po.id}:`);
  const exportedState = parseState(sync);
  const exportedFingerprint = text(sync?.fingerprint) || undefined;
  const currentState = stateForPO(po);
  const changes: ProcurementFieldChange[] = [];
  const lineChanges: ProcurementLineChange[] = [];
  const messages: string[] = [];
  let invalid = !sync || !exportedState;
  let unauthorized = Boolean(workbookCompanyId && context.expectedCompanyId && workbookCompanyId !== context.expectedCompanyId);
  let missingReference = false;
  let protectedChange = false;
  if (!sync || !exportedState) messages.push("Synchronization metadata for this purchase order is missing or invalid.");
  if (exportedState && exportedFingerprint && fingerprintValue(exportedState) !== exportedFingerprint) { invalid = true; messages.push("Purchase-order synchronization state does not match its fingerprint."); }
  if (sync && exportedFingerprint && text(row["__HQ Fingerprint"]) !== exportedFingerprint) { invalid = true; messages.push("Purchase-order synchronization fingerprint does not match its metadata."); }
  if (sync && text(sync.companyId) && text(row["__HQ Company ID"]) !== text(sync.companyId)) { invalid = true; messages.push("Purchase-order synchronization company identity does not match its metadata."); }
  if (po.companyId && context.expectedCompanyId && po.companyId !== context.expectedCompanyId) { unauthorized = true; messages.push("Purchase order is outside the active company scope."); }
  if (text(row["__HQ Company ID"]) && context.expectedCompanyId && text(row["__HQ Company ID"]) !== context.expectedCompanyId) { unauthorized = true; messages.push("Workbook record identity is outside the active company scope."); }
  const project = projectIdForCode(row["Project Code"], context.projects);
  if (project.error) { missingReference = true; messages.push(project.error); }
  if (!project.value) { missingReference = true; messages.push("Purchase orders require a resolved project reference."); }
  const vendorId = vendorIdForName(row.Supplier, context.vendors);
  if (vendorId.error) { missingReference = true; messages.push(vendorId.error); }
  const issueDate = validDateOrError(row["Issue Date"], "Issue date");
  if (issueDate.error) { invalid = true; messages.push(issueDate.error); }
  const workbookValues = {
    poNumber: text(row["PO Number"]),
    vendorId: vendorId.value || "",
    projectId: project.value || "",
    currency: text(row.Currency).toUpperCase(),
    status: text(row.Status).toUpperCase(),
    issueDate: issueDate.value ?? null,
    description: nullableText(row.Description),
    notes: nullableText(row.Notes),
    totalAmount: numberValue(row["Committed Amount"]),
  };
  if (!workbookValues.poNumber || !/^[A-Z]{3}$/.test(workbookValues.currency)) { invalid = true; messages.push("PO number and three-letter currency are required."); }
  if (workbookValues.totalAmount === undefined && text(row["Committed Amount"])) { invalid = true; messages.push("Committed amount must be numeric when supplied."); }
  const currentLines = new Map((po.lines || []).map((line) => [line.id, line]));
  const uploadedLineIds = new Set<string>();
  for (const lineRow of lineRows.filter((candidate) => text(candidate["__HQ Parent ID"]) === po.id)) {
    const lineId = text(lineRow["__HQ Line ID"]);
    if (!lineId) { invalid = true; messages.push("New purchase-order lines are not supported in this pilot."); continue; }
    if (uploadedLineIds.has(lineId) || !currentLines.has(lineId)) { unauthorized = true; messages.push(`Unknown or duplicate purchase-order line identity ${lineId}.`); continue; }
    uploadedLineIds.add(lineId);
    const currentLine = currentLines.get(lineId)!;
    const lineSync = validateLineSynchronization("PURCHASE_ORDER_LINE", po.id, lineId, lineRow, metadata, context.expectedCompanyId);
    if (lineSync.invalid) invalid = true;
    if (lineSync.unauthorized) unauthorized = true;
    messages.push(...lineSync.messages);
    const quantity = numberValue(lineRow.Quantity);
    const lineNumber = numberValue(lineRow["Line Number"]);
    const unitPrice = numberValue(lineRow["Unit Price"]);
    if (quantity === undefined || quantity <= 0 || unitPrice === undefined || unitPrice < 0) { invalid = true; messages.push(`Purchase-order line ${lineId} quantity and unit price must be valid.`); }
    if (lineNumber === undefined || !Number.isInteger(lineNumber) || lineNumber <= 0) { invalid = true; messages.push(`Purchase-order line ${lineId} line number must be a positive integer.`); }
    const line = { description: text(lineRow.Description), quantity: quantity ?? currentLine.quantity, unit: text(lineRow.Unit), unitPrice: unitPrice ?? currentLine.unitPrice, amount: numberValue(lineRow.Amount) ?? currentLine.amount, projectCostCodeId: nullableText(lineRow["Project Cost Code"]) };
    if (!line.description || !line.unit) { invalid = true; messages.push(`Purchase-order line ${lineId} description and unit are required.`); }
    const baselineLine = (exportedState?.lines as Array<Record<string, unknown>> | undefined)?.find((candidate) => candidate.id === lineId) || {};
    const lineFields: Array<[string, unknown, unknown, unknown, boolean]> = [
      ["poNumber", po.poNumber, text(lineRow["PO Number"]), exportedState?.poNumber, false],
      ["lineNumber", currentLine.lineNumber, lineNumber ?? currentLine.lineNumber, baselineLine.lineNumber, false],
      ["description", currentLine.description, line.description, baselineLine.description, true],
      ["quantity", currentLine.quantity, line.quantity, baselineLine.quantity, true],
      ["unit", currentLine.unit, line.unit, baselineLine.unit, true],
      ["unitPrice", currentLine.unitPrice, line.unitPrice, baselineLine.unitPrice, true],
      ["amount", currentLine.amount, line.amount, baselineLine.amount, false],
      ["projectCostCodeId", currentLine.projectCostCodeId || null, line.projectCostCodeId, baselineLine.projectCostCodeId || null, false],
    ];
    for (const [field, currentValue, workbookValue, exportedValue, editable] of lineFields) {
      const change = lineChange(lineId, field, currentValue, workbookValue, exportedValue, editable);
      if (change) { lineChanges.push(change); if (!editable) protectedChange = true; }
    }
  }
  const topFields: Array<[string, unknown, unknown, unknown, boolean]> = [
    ["poNumber", po.poNumber, workbookValues.poNumber, exportedState?.poNumber, false],
    ["vendorId", po.vendorId, workbookValues.vendorId, exportedState?.vendorId, true],
    ["projectId", po.projectId, workbookValues.projectId, exportedState?.projectId, true],
    ["currency", po.currency, workbookValues.currency, exportedState?.currency, true],
    ["status", po.status, workbookValues.status, exportedState?.status, false],
    ["issueDate", po.issueDate || null, workbookValues.issueDate, exportedState?.issueDate || null, false],
    ["description", po.description || null, workbookValues.description, exportedState?.description || null, true],
    ["notes", po.notes || null, workbookValues.notes, exportedState?.notes || null, true],
    ["totalAmount", po.totalAmount ?? null, workbookValues.totalAmount ?? null, exportedState?.totalAmount ?? null, false],
  ];
  for (const [field, currentValue, workbookValue, exportedValue, editable] of topFields) {
    const change = compareChange(field, currentValue, workbookValue, exportedValue, editable);
    if (change) { changes.push(change); if (!editable) protectedChange = true; }
  }
  const workbookChanged = changes.length > 0 || lineChanges.length > 0;
  const currentChanged = Boolean(exportedFingerprint && fingerprintValue(currentState) !== exportedFingerprint);
  if (po.status !== "DRAFT" && workbookChanged) protectedChange = true;
  const status: ProcurementProposalStatus = unauthorized
    ? "UNAUTHORIZED"
    : invalid
      ? "INVALID"
      : missingReference
        ? "MISSING_REFERENCE"
        : !context.canWrite && workbookChanged
          ? "UNAUTHORIZED"
          : protectedChange
            ? "UNSUPPORTED_PROTECTED_FIELD"
            : currentChanged && workbookChanged
              ? "STALE_CONFLICT"
              : currentChanged
                ? "APP_ONLY_CHANGE"
                : workbookChanged
                  ? "WORKBOOK_ONLY_CHANGE"
                  : "UNCHANGED";
  const applyPayload: POSavePayload = {
    po: {
      id: po.id,
      poNumber: po.poNumber,
      vendorId: workbookValues.vendorId,
      projectId: workbookValues.projectId,
      currency: workbookValues.currency,
      description: workbookValues.description,
      notes: workbookValues.notes,
    },
    lines: (po.lines || []).map((currentLine) => {
      const source = lineRows.find((candidate) => text(candidate["__HQ Line ID"]) === currentLine.id);
      if (!source) return { ...currentLine };
      return {
        ...currentLine,
        description: text(source.Description),
        quantity: numberValue(source.Quantity) ?? currentLine.quantity,
        unit: text(source.Unit),
        unitPrice: numberValue(source["Unit Price"]) ?? currentLine.unitPrice,
        projectCostCodeId: currentLine.projectCostCodeId || null,
      };
    }),
  };
  return {
    id,
    entity: "PURCHASE_ORDER",
    recordId: po.id,
    label: po.poNumber,
    status,
    action: workbookChanged ? "UPDATE" : "NONE",
    currentFingerprint: fingerprintValue(currentState),
    exportedFingerprint,
    changes,
    lineChanges,
    messages,
    canApply: status === "WORKBOOK_ONLY_CHANGE" && po.status === "DRAFT",
    applyPayload,
  };
}

function unknownProposal(entity: ProcurementEntity, row: Record<string, unknown>, status: ProcurementProposalStatus, message: string): ProcurementProposal {
  const recordId = text(row["__HQ Record ID"]);
  return {
    id: `${entity}:${recordId || "new"}`,
    entity,
    recordId,
    label: text(row[entity === "RFQ" ? "RFQ Number" : "PO Number"]) || "New row",
    status,
    action: recordId ? "UPDATE" : "UPDATE",
    changes: [],
    lineChanges: [],
    messages: [message],
    canApply: false,
  };
}

function uniqueRows(rows: Array<Record<string, unknown>>, idHeader: string) {
  const byId = new Map<string, Record<string, unknown>>();
  const duplicates = new Set<string>();
  for (const row of rows) {
    const id = text(row[idHeader]);
    if (id && byId.has(id)) duplicates.add(id);
    if (id) byId.set(id, row);
  }
  return { byId, duplicates };
}

export function buildProcurementImportReview(input: ArrayBuffer | Uint8Array, context: ProcurementImportContext, options: { fileName?: string } = {}): ProcurementImportReview {
  const bytes = input instanceof Uint8Array ? new Uint8Array(input) : new Uint8Array(input);
  const parsed = parseOperationsWorkbook(bytes, { schema: PROCUREMENT_WORKBOOK_SCHEMA, fileName: options.fileName });
  const metadata = recordMetadata(parsed);
  const workbookCompanyId = text(parsed.metadata.companyId) || undefined;
  const rfqRows = parsed.sheets.RFQs.rows;
  const rfqLineRows = parsed.sheets["RFQ Lines"].rows;
  const poRows = parsed.sheets["Purchase Orders"].rows;
  const poLineRows = parsed.sheets["PO Lines"].rows;
  const rfqById = new Map(context.rfqs.map((record) => [record.id, record]));
  const poById = new Map(context.purchaseOrders.map((record) => [record.id, record]));
  for (const lineRow of rfqLineRows) {
    const parentId = text(lineRow["__HQ Parent ID"]);
    if (!parentId || !rfqById.has(parentId)) {
      throw new Error(`RFQ line synchronization parent "${parentId || "(missing)"}" is unknown or outside the active company scope.`);
    }
  }
  for (const lineRow of poLineRows) {
    const parentId = text(lineRow["__HQ Parent ID"]);
    if (!parentId || !poById.has(parentId)) {
      throw new Error(`Purchase-order line synchronization parent "${parentId || "(missing)"}" is unknown or outside the active company scope.`);
    }
  }
  const proposals: ProcurementProposal[] = [];
  const rfqTop = uniqueRows(rfqRows, "__HQ Record ID");
  const poTop = uniqueRows(poRows, "__HQ Record ID");
  for (const duplicate of rfqTop.duplicates) proposals.push(unknownProposal("RFQ", rfqTop.byId.get(duplicate)!, "INVALID", `Duplicate RFQ record identity ${duplicate}.`));
  for (const duplicate of poTop.duplicates) proposals.push(unknownProposal("PURCHASE_ORDER", poTop.byId.get(duplicate)!, "INVALID", `Duplicate purchase-order record identity ${duplicate}.`));
  for (const row of rfqRows) {
    const recordId = text(row["__HQ Record ID"]);
    if (!recordId) { proposals.push(unknownProposal("RFQ", row, "PROPOSED_NEW_RECORD", "New RFQ creation from Excel is intentionally deferred in this pilot.")); continue; }
    const record = rfqById.get(recordId);
    if (!record) { proposals.push(unknownProposal("RFQ", row, "UNAUTHORIZED", "RFQ identity is unknown or outside the active company scope.")); continue; }
    if (rfqTop.duplicates.has(recordId)) continue;
    proposals.push(buildRfqProposal(record, row, rfqLineRows, metadata, context, workbookCompanyId));
  }
  for (const row of poRows) {
    const recordId = text(row["__HQ Record ID"]);
    if (!recordId) { proposals.push(unknownProposal("PURCHASE_ORDER", row, "PROPOSED_NEW_RECORD", "New purchase-order creation from Excel is intentionally deferred in this pilot.")); continue; }
    const record = poById.get(recordId);
    if (!record) { proposals.push(unknownProposal("PURCHASE_ORDER", row, "UNAUTHORIZED", "Purchase-order identity is unknown or outside the active company scope.")); continue; }
    if (poTop.duplicates.has(recordId)) continue;
    proposals.push(buildPoProposal(record, row, poLineRows, metadata, context, workbookCompanyId));
  }
  const uploadedRfqIds = new Set(rfqRows.map((row) => text(row["__HQ Record ID"])).filter(Boolean));
  const uploadedPoIds = new Set(poRows.map((row) => text(row["__HQ Record ID"])).filter(Boolean));
  return {
    bytes,
    fileName: options.fileName,
    proposals,
    omittedRecordIds: [
      ...context.rfqs.filter((record) => !uploadedRfqIds.has(record.id)).map((record) => `RFQ:${record.id}`),
      ...context.purchaseOrders.filter((record) => !uploadedPoIds.has(record.id)).map((record) => `PURCHASE_ORDER:${record.id}`),
    ],
    workbookWarnings: [
      "Missing workbook rows are preserved and never interpreted as deletions.",
      "New RFQ and purchase-order records are not supported by this pilot.",
      ...(workbookCompanyId && context.expectedCompanyId && workbookCompanyId !== context.expectedCompanyId ? ["Workbook company identity does not match the active company scope."] : []),
    ],
  };
}

export async function applyProcurementImport(
  review: ProcurementImportReview,
  context: ProcurementImportContext,
  callbacks: ProcurementApplyCallbacks,
  selectedProposalIds?: readonly string[],
) {
  if (!context.canWrite) throw new Error("You do not have permission to apply procurement workbook changes.");
  const freshReview = buildProcurementImportReview(review.bytes, context, { fileName: review.fileName });
  const selected = selectedProposalIds ? [...selectedProposalIds] : review.proposals.filter((proposal) => proposal.canApply).map((proposal) => proposal.id);
  const appliedProposalIds: string[] = [];
  for (const proposalId of selected) {
    const proposal = freshReview.proposals.find((candidate) => candidate.id === proposalId);
    if (!proposal || !proposal.canApply || !proposal.applyPayload) throw new Error(`Workbook proposal ${proposalId} is stale or changed and is no longer safe to apply; review the current conflicts.`);
    if (proposal.entity === "RFQ") {
      const payload = proposal.applyPayload as RFQSavePayload;
      await callbacks.saveRFQ(payload.rfq, payload.lines, payload.invitedVendorIds);
    } else {
      const payload = proposal.applyPayload as POSavePayload;
      await callbacks.savePurchaseOrder(payload.po, payload.lines);
    }
    appliedProposalIds.push(proposalId);
  }
  return { appliedProposalIds, refreshedReview: freshReview };
}
