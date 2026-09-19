import type { Expense, InvoiceData, Project, ProjectCostCode, PurchaseOrder, Vendor } from "../types.ts";
import {
  deriveExpenseSettlementSummary,
  type FinancialSettlementHistoryItem,
  type FinancialSettlementSummary,
} from "./financialSettlement.ts";
import type { SupplierInvoiceSettlementMatch, SupplierInvoiceSettlementProjection } from "./supplierInvoiceSettlement.ts";
import {
  exportOperationsWorkbook,
  fingerprintValue,
  parseOperationsWorkbook,
  type ParsedOperationsWorkbook,
  type WorkbookCellValue,
  type WorkbookExportArtifact,
  type WorkbookSchema,
} from "./operationsWorkbook.ts";

const EXPENSE_HEADERS = [
  "Date", "Category", "Description", "Payee", "Amount", "Currency",
  "Payment Method", "Reference", "Notes", "Project", "Cost Code",
  "Status", "Archived", "Supplier Invoice", "Vendor", "Purchase Order",
  "Confirmed Paid", "Outstanding", "Settlement State",
  "__HQ Record ID", "__HQ Company ID", "__HQ Fingerprint", "__HQ Updated At",
  "__HQ Project ID", "__HQ Cost Code ID",
] as const;

const SUPPLIER_PAYABLE_HEADERS = [
  "Invoice Number", "Invoice Date", "Due Date", "Vendor", "Currency",
  "Invoice Total", "Linked Expense", "Expense Amount", "Confirmed Paid",
  "Outstanding", "Payment State", "Review State", "Invoice Lifecycle",
  "Project", "Authority Conflict", "__HQ Record ID", "__HQ Company ID",
  "__HQ Fingerprint", "__HQ Updated At", "__HQ Linked Expense ID",
] as const;

const EXPENSE_HIDDEN_HEADERS = [
  "__HQ Record ID", "__HQ Company ID", "__HQ Fingerprint", "__HQ Updated At",
  "__HQ Project ID", "__HQ Cost Code ID",
] as const;

const SUPPLIER_PAYABLE_HIDDEN_HEADERS = [
  "__HQ Record ID", "__HQ Company ID", "__HQ Fingerprint", "__HQ Updated At", "__HQ Linked Expense ID",
] as const;

export const EXPENSES_WORKBOOK_SCHEMA: WorkbookSchema = {
  schemaVersion: 1,
  domain: "expenses",
  workbookKind: "EXPENSES_SUPPLIER_PAYABLES_EDIT_UPDATE_ONLY",
  metadataSheetName: "_HydroQualiSense",
  sheets: [
    { name: "Expenses", headers: EXPENSE_HEADERS, hiddenHeaders: EXPENSE_HIDDEN_HEADERS },
    { name: "Supplier Payables", headers: SUPPLIER_PAYABLE_HEADERS, hiddenHeaders: SUPPLIER_PAYABLE_HIDDEN_HEADERS },
  ],
};

export type ExpensesProposalStatus =
  | "UNCHANGED"
  | "WORKBOOK_ONLY_CHANGE"
  | "APP_ONLY_CHANGE"
  | "STALE_CONFLICT"
  | "UNSUPPORTED_PROTECTED_FIELD"
  | "INVALID"
  | "UNAUTHORIZED"
  | "UNKNOWN_REFERENCE"
  | "UNSUPPORTED_NEW_RECORD";

export interface ExpensesWorkbookRecords {
  expenses: readonly Expense[];
  projects: readonly Project[];
  costCodes: readonly ProjectCostCode[];
  invoices: readonly InvoiceData[];
  purchaseOrders: readonly PurchaseOrder[];
  vendors: readonly Vendor[];
  expectedCompanyId?: string;
  settlementProjections?: ReadonlyMap<string, SupplierInvoiceSettlementProjection>;
  settlementMatches?: readonly SupplierInvoiceSettlementMatch[];
  today?: string;
}

export interface ExpensesWorkbookExportInput extends ExpensesWorkbookRecords {
  fileName?: string;
}

export interface ExpensesImportContext extends ExpensesWorkbookRecords {
  canWrite: boolean;
}

export interface ExpensesFieldChange {
  field: string;
  currentValue: unknown;
  workbookValue: unknown;
  exportedValue: unknown;
  editable: boolean;
}

export interface ExpensesProposal {
  id: string;
  entity: "EXPENSE" | "SUPPLIER_PAYABLE";
  expenseId?: string;
  invoiceId?: string;
  label: string;
  status: ExpensesProposalStatus;
  canApply: boolean;
  messages: string[];
  changes: ExpensesFieldChange[];
  expense?: Expense;
  applyExpense?: Expense;
}

export interface ExpensesImportReview {
  bytes: Uint8Array;
  fileName?: string;
  proposals: ExpensesProposal[];
  omittedExpenseIds: string[];
  omittedSupplierInvoiceIds: string[];
  workbookWarnings: string[];
}

export interface ExpensesApplyCallbacks {
  saveExpense: (expense: Expense) => Promise<void> | void;
}

export interface ExpensesApplyResult {
  appliedProposalIds: string[];
  refreshedReview: ExpensesImportReview;
}

type MetadataRecord = {
  entity: string;
  recordId: string;
  parentId?: string;
  companyId?: string;
  fingerprint?: string;
  updatedAt?: string;
  state?: Record<string, unknown>;
};

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function nullableText(value: unknown): string | null {
  const result = text(value);
  return result ? result : null;
}

function numberValue(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(typeof value === "string" ? value.replace(/,/g, "") : value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function dateValue(value: unknown): string | undefined {
  if (value instanceof Date) {
    const iso = value.toISOString().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : undefined;
  }
  const result = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) return undefined;
  const parsed = new Date(`${result}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result ? undefined : result;
}

function dateCell(value?: string | null): WorkbookCellValue {
  return value || null;
}

function numberCell(value: number | undefined | null): WorkbookCellValue {
  return value === undefined || value === null ? null : value;
}

function displayNumber(value: number | undefined | null): WorkbookCellValue {
  return value === undefined || value === null ? "Unavailable" : value;
}

function equalValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || left === undefined || right === null || right === undefined) return !left && !right;
  if (typeof left === "number" || typeof right === "number") return Number(left) === Number(right);
  return String(left) === String(right);
}

function change(field: string, currentValue: unknown, workbookValue: unknown, exportedValue: unknown, editable: boolean): ExpensesFieldChange | undefined {
  return equalValue(currentValue, workbookValue) ? undefined : { field, currentValue, workbookValue, exportedValue, editable };
}

function settlementHistoryForExpense(expense: Expense, invoiceId: string | undefined, matches: readonly SupplierInvoiceSettlementMatch[] = []): FinancialSettlementHistoryItem[] {
  return matches
    .filter((match) => (match.targetType === "EXPENSE" && String(match.targetId || "") === expense.id)
      || (Boolean(invoiceId) && match.targetType === "INVOICE" && String(match.targetId || "") === invoiceId))
    .filter((match) => ["CONFIRMED", "REVERSED"].includes(match.status))
    .map((match, index) => ({
      id: match.id || `expense-workbook-settlement-${index}`,
      transactionId: match.transactionId || `expense-workbook-transaction-${index}`,
      status: match.status === "REVERSED" ? "REVERSED" : "CONFIRMED",
      amount: Math.max(0, Number(match.matchedAmount) || 0),
      confirmedAt: match.confirmedAt,
      confirmedByUserId: match.confirmedByUserId,
      reversedAt: match.reversedAt,
      reversedByUserId: match.reversedByUserId,
      reversalReason: match.reversalReason,
      confirmationSource: match.confirmationSource,
      targetType: match.targetType as FinancialSettlementHistoryItem["targetType"],
      targetId: match.targetId || undefined,
    }));
}

export function settlementForExpenseWorkbook(
  expense: Expense,
  input: Pick<ExpensesWorkbookRecords, "invoices" | "settlementProjections" | "settlementMatches">,
): FinancialSettlementSummary {
  const invoice = expense.supplierInvoiceId ? input.invoices.find((candidate) => candidate.id === expense.supplierInvoiceId) : undefined;
  const supplierProjection = invoice ? input.settlementProjections?.get(invoice.id) : undefined;
  if (supplierProjection && supplierProjection.targetId === expense.id) return supplierProjection.settlement;
  const direct = deriveExpenseSettlementSummary(expense, settlementHistoryForExpense(expense, invoice?.id, input.settlementMatches));
  if (supplierProjection?.authorityConflict) {
    return {
      ...direct,
      reconciledCashPaid: 0,
      effectiveSettled: 0,
      outstanding: direct.settlementBasis,
      settlementState: "UNPAID",
      authorityConflict: true,
    };
  }
  return direct;
}

function expenseLabel(expense: Expense) {
  return `${expense.category} · ${expense.description || expense.id}`;
}

function projectLabel(project: Project | undefined) {
  return project ? project.projectCode : "Unallocated";
}

function costCodeLabel(costCode: ProjectCostCode | undefined) {
  return costCode ? costCode.code : "Uncoded";
}

function invoiceLabel(invoice: InvoiceData | undefined) {
  return invoice?.invoiceNumber || invoice?.id || "";
}

function vendorLabel(vendor: Vendor | undefined, invoice: InvoiceData | undefined) {
  return vendor?.name || invoice?.vendor?.name || "";
}

function purchaseOrderLabel(purchaseOrder: PurchaseOrder | undefined) {
  return purchaseOrder?.poNumber || "";
}

function expenseState(expense: Expense, input: ExpensesWorkbookRecords) {
  const project = input.projects.find((candidate) => candidate.id === expense.projectId);
  const costCode = input.costCodes.find((candidate) => candidate.id === expense.projectCostCodeId);
  const invoice = expense.supplierInvoiceId ? input.invoices.find((candidate) => candidate.id === expense.supplierInvoiceId) : undefined;
  const vendor = expense.vendorId ? input.vendors.find((candidate) => candidate.id === expense.vendorId) : undefined;
  const purchaseOrder = expense.purchaseOrderId ? input.purchaseOrders.find((candidate) => candidate.id === expense.purchaseOrderId) : undefined;
  const settlement = settlementForExpenseWorkbook(expense, input);
  return {
    id: expense.id,
    companyId: input.expectedCompanyId || expense.userId || null,
    expenseDate: expense.expenseDate,
    category: expense.category,
    description: expense.description,
    payee: expense.payee || null,
    amount: expense.amount,
    currency: expense.currency,
    paymentMethod: expense.paymentMethod || null,
    referenceNumber: expense.referenceNumber || null,
    notes: expense.notes || null,
    projectId: expense.projectId || null,
    projectCode: projectLabel(project),
    costCodeId: expense.projectCostCodeId || null,
    costCode: costCodeLabel(costCode),
    status: expense.status,
    archivedAt: expense.archivedAt || null,
    supplierInvoiceId: expense.supplierInvoiceId || null,
    supplierInvoice: invoiceLabel(invoice),
    vendorId: expense.vendorId || null,
    vendor: vendorLabel(vendor, invoice),
    purchaseOrderId: expense.purchaseOrderId || null,
    purchaseOrder: purchaseOrderLabel(purchaseOrder),
    receiptSourceDocumentId: expense.receiptSourceDocumentId || null,
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
    settlement: {
      confirmedPaid: settlement.reconciledCashPaid,
      outstanding: settlement.outstanding,
      state: settlement.settlementState,
      currency: settlement.currency,
      authorityConflict: Boolean(settlement.authorityConflict),
    },
  };
}

function supplierPayableState(invoice: InvoiceData, expense: Expense | undefined, input: ExpensesWorkbookRecords) {
  const projection = input.settlementProjections?.get(invoice.id);
  const settlement = projection?.settlement || (expense ? settlementForExpenseWorkbook(expense, input) : undefined);
  const project = expense?.projectId ? input.projects.find((candidate) => candidate.id === expense.projectId) : undefined;
  return {
    id: invoice.id,
    companyId: input.expectedCompanyId || expense?.userId || null,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate || null,
    vendorId: invoice.vendor?.vendorId || expense?.vendorId || null,
    vendor: invoice.vendor?.name || "",
    currency: invoice.currency,
    invoiceTotal: invoice.grandTotal,
    linkedExpenseId: expense?.id || invoice.linkedExpenseId || null,
    expenseAmount: expense?.amount ?? null,
    confirmedPaid: settlement?.reconciledCashPaid ?? 0,
    outstanding: settlement?.outstanding ?? 0,
    paymentState: settlement?.settlementState || "UNPAID",
    reviewState: invoice.reviewStatus || "NEEDS_REVIEW",
    invoiceLifecycle: invoice.lifecycleStatus || "ACTIVE",
    projectId: expense?.projectId || null,
    project: projectLabel(project),
    authorityConflict: Boolean(projection?.authorityConflict || settlement?.authorityConflict),
    updatedAt: invoice.updatedAt || "",
  };
}

function metadataRow(entity: string, recordId: string, companyId: string | undefined, state: unknown, updatedAt: string, parentId?: string) {
  return {
    entity,
    recordId,
    ...(parentId ? { parentId } : {}),
    ...(companyId ? { companyId } : {}),
    fingerprint: fingerprintValue(state),
    updatedAt,
    stateJson: JSON.stringify(state),
  };
}

function metadataIndex(parsed: ParsedOperationsWorkbook) {
  const index = new Map<string, MetadataRecord>();
  for (const row of parsed.metadataRows) {
    const record: MetadataRecord = {
      entity: text(row.entity),
      recordId: text(row.recordId),
      parentId: nullableText(row.parentId) || undefined,
      companyId: nullableText(row.companyId) || undefined,
      fingerprint: nullableText(row.fingerprint) || undefined,
      updatedAt: nullableText(row.updatedAt) || undefined,
    };
    try {
      record.state = JSON.parse(text(row.stateJson)) as Record<string, unknown>;
    } catch {
      record.state = undefined;
    }
    if (record.entity && record.recordId) index.set(`${record.entity}:${record.recordId}`, record);
  }
  return index;
}

function relatedSupplierInvoices(input: ExpensesWorkbookRecords) {
  const relatedIds = new Set(input.expenses.map((expense) => expense.supplierInvoiceId).filter((id): id is string => Boolean(id)));
  for (const invoice of input.invoices) if (invoice.linkedExpenseId && input.expenses.some((expense) => expense.id === invoice.linkedExpenseId)) relatedIds.add(invoice.id);
  return input.invoices.filter((invoice) => relatedIds.has(invoice.id));
}

export function exportExpensesWorkbook(input: ExpensesWorkbookExportInput): WorkbookExportArtifact {
  const metadataRows: Array<Record<string, WorkbookCellValue>> = [];
  const expenseRows = input.expenses.map((expense) => {
    const state = expenseState(expense, input);
    metadataRows.push(metadataRow("EXPENSE", expense.id, input.expectedCompanyId || expense.userId, state, expense.updatedAt));
    return {
      Date: dateCell(expense.expenseDate),
      Category: expense.category,
      Description: expense.description,
      Payee: expense.payee || null,
      Amount: numberCell(expense.amount),
      Currency: expense.currency,
      "Payment Method": expense.paymentMethod || null,
      Reference: expense.referenceNumber || null,
      Notes: expense.notes || null,
      Project: state.projectCode,
      "Cost Code": state.costCode,
      Status: expense.status,
      Archived: expense.archivedAt ? "ARCHIVED" : "",
      "Supplier Invoice": state.supplierInvoice,
      Vendor: state.vendor,
      "Purchase Order": state.purchaseOrder,
      "Confirmed Paid": numberCell(state.settlement.confirmedPaid),
      Outstanding: numberCell(state.settlement.outstanding),
      "Settlement State": state.settlement.state,
      "__HQ Record ID": expense.id,
      "__HQ Company ID": input.expectedCompanyId || expense.userId || null,
      "__HQ Fingerprint": fingerprintValue(state),
      "__HQ Updated At": expense.updatedAt,
      "__HQ Project ID": expense.projectId || null,
      "__HQ Cost Code ID": expense.projectCostCodeId || null,
    };
  });

  const supplierPayableRows = relatedSupplierInvoices(input).map((invoice) => {
    const expense = input.expenses.find((candidate) => candidate.supplierInvoiceId === invoice.id)
      || (invoice.linkedExpenseId ? input.expenses.find((candidate) => candidate.id === invoice.linkedExpenseId) : undefined);
    const state = supplierPayableState(invoice, expense, input);
    metadataRows.push(metadataRow("SUPPLIER_PAYABLE", invoice.id, input.expectedCompanyId || expense?.userId, state, invoice.updatedAt || "", state.linkedExpenseId || undefined));
    return {
      "Invoice Number": invoice.invoiceNumber,
      "Invoice Date": dateCell(invoice.invoiceDate),
      "Due Date": dateCell(invoice.dueDate),
      Vendor: state.vendor,
      Currency: invoice.currency,
      "Invoice Total": numberCell(invoice.grandTotal),
      "Linked Expense": state.linkedExpenseId || "",
      "Expense Amount": numberCell(state.expenseAmount),
      "Confirmed Paid": numberCell(state.confirmedPaid),
      Outstanding: numberCell(state.outstanding),
      "Payment State": state.paymentState,
      "Review State": state.reviewState,
      "Invoice Lifecycle": state.invoiceLifecycle,
      Project: state.project,
      "Authority Conflict": state.authorityConflict ? "CONFLICT" : "",
      "__HQ Record ID": invoice.id,
      "__HQ Company ID": input.expectedCompanyId || expense?.userId || null,
      "__HQ Fingerprint": fingerprintValue(state),
      "__HQ Updated At": invoice.updatedAt || "",
      "__HQ Linked Expense ID": state.linkedExpenseId || null,
    };
  });

  return exportOperationsWorkbook({
    schema: EXPENSES_WORKBOOK_SCHEMA,
    metadata: { companyId: input.expectedCompanyId || null, exportMode: "EDIT_UPDATE_ONLY" },
    metadataRows,
    sheets: [
      { name: "Expenses", rows: expenseRows, hiddenHeaders: EXPENSE_HIDDEN_HEADERS },
      { name: "Supplier Payables", rows: supplierPayableRows, hiddenHeaders: SUPPLIER_PAYABLE_HIDDEN_HEADERS },
    ],
    fileName: input.fileName || "HydroQualiSense-Expenses.xlsx",
  });
}

function isEditableExpense(expense: Expense) {
  return expense.status === "DRAFT" && !expense.archivedAt && !expense.supplierInvoiceId;
}

function parseMetadataState(metadata: MetadataRecord | undefined) {
  return metadata?.state;
}

function metadataIsValid(
  metadata: MetadataRecord | undefined,
  entity: string,
  id: string,
  row: Record<string, unknown>,
  expectedCompanyId: string | undefined,
) {
  if (!metadata || metadata.entity !== entity || metadata.recordId !== id || !metadata.state || !metadata.fingerprint) return false;
  if (metadata.parentId && entity === "EXPENSE") return false;
  if (expectedCompanyId && (metadata.companyId !== expectedCompanyId || text(row["__HQ Company ID"]) !== expectedCompanyId)) return false;
  return fingerprintValue(metadata.state) === metadata.fingerprint && text(row["__HQ Fingerprint"]) === metadata.fingerprint;
}

function displayProject(projects: readonly Project[], projectId?: string) {
  return projectLabel(projects.find((project) => project.id === projectId));
}

function displayCostCode(costCodes: readonly ProjectCostCode[], costCodeId?: string) {
  return costCodeLabel(costCodes.find((costCode) => costCode.id === costCodeId));
}

function resolveProject(value: unknown, projects: readonly Project[]) {
  const candidate = text(value).toUpperCase();
  if (!candidate || candidate === "UNALLOCATED") return { id: undefined };
  const project = projects.find((item) => item.id === candidate || item.projectCode.toUpperCase() === candidate || item.projectName.toUpperCase() === candidate);
  return project ? { id: project.id } : { error: "Project reference is outside the authorized company context." };
}

function resolveCostCode(value: unknown, projectId: string | undefined, costCodes: readonly ProjectCostCode[]) {
  const candidate = text(value).toUpperCase();
  if (!candidate || candidate === "UNCODED") return { id: undefined };
  const costCode = costCodes.find((item) => item.projectId === projectId && (item.id === candidate || item.code.toUpperCase() === candidate || item.name.toUpperCase() === candidate));
  if (!costCode) return { error: "Cost-code reference is outside the selected project or authorized company context." };
  return { id: costCode.id, status: costCode.status };
}

function expenseProposal(
  row: Record<string, unknown>,
  expense: Expense | undefined,
  metadata: MetadataRecord | undefined,
  context: ExpensesImportContext,
): { proposal: ExpensesProposal; workbookChanged: boolean; appChanged: boolean } {
  const id = text(row["__HQ Record ID"]);
  const proposal: ExpensesProposal = {
    id: `EXPENSE:${id || `ROW:${text(row.Description)}`}`,
    entity: "EXPENSE",
    expenseId: id || undefined,
    label: text(row.Description) || id || "Unknown Expense",
    status: "UNCHANGED",
    canApply: false,
    messages: [],
    changes: [],
  };
  if (!id) {
    proposal.status = "UNSUPPORTED_NEW_RECORD";
    proposal.messages.push("Rows without a stable Expense ID are proposed-but-unsupported; create Expenses through the Expense workflow.");
    return { proposal, workbookChanged: true, appChanged: false };
  }
  if (!expense) {
    proposal.status = "UNKNOWN_REFERENCE";
    proposal.messages.push("The workbook Expense ID is not present in the authorized company context.");
    return { proposal, workbookChanged: true, appChanged: false };
  }
  if (!metadataIsValid(metadata, "EXPENSE", id, row, context.expectedCompanyId)) {
    proposal.status = text(row["__HQ Company ID"]) && context.expectedCompanyId && text(row["__HQ Company ID"]) !== context.expectedCompanyId ? "UNAUTHORIZED" : "INVALID";
    proposal.messages.push("Expense synchronization metadata is missing, tampered, or outside the active company scope.");
    return { proposal, workbookChanged: true, appChanged: false };
  }

  const exported = parseMetadataState(metadata) || {};
  const current = expenseState(expense, context);
  const appChanged = fingerprintValue(current) !== metadata?.fingerprint || Boolean(metadata?.updatedAt && metadata.updatedAt !== expense.updatedAt);
  const proposed: Expense = { ...expense };
  const editableChanges: ExpensesFieldChange[] = [];
  const protectedChanges: ExpensesFieldChange[] = [];
  const editable = isEditableExpense(expense);
  const addText = (field: keyof Expense, header: string, required = false) => {
    const value = nullableText(row[header]);
    if (required && !value) {
      proposal.status = "INVALID";
      proposal.messages.push(`${header} is required.`);
      return;
    }
    const next = change(field, expense[field] || null, value, exported[field as string] ?? null, editable);
    if (next) (editable ? editableChanges : protectedChanges).push(next);
    (proposed as unknown as Record<string, unknown>)[field] = value || undefined;
  };
  addText("category", "Category", true);
  addText("description", "Description", true);
  addText("payee", "Payee");
  addText("paymentMethod", "Payment Method");
  addText("referenceNumber", "Reference");
  addText("notes", "Notes");

  const parsedDate = dateValue(row.Date);
  if (!parsedDate) {
    proposal.status = "INVALID";
    proposal.messages.push("Date must be a valid YYYY-MM-DD value.");
  } else {
    const next = change("expenseDate", expense.expenseDate, parsedDate, exported.expenseDate || null, editable);
    if (next) (editable ? editableChanges : protectedChanges).push(next);
    proposed.expenseDate = parsedDate;
  }

  const amount = numberValue(row.Amount);
  if (amount === undefined || amount < 0) {
    proposal.status = "INVALID";
    proposal.messages.push("Amount must be a valid non-negative number.");
  } else {
    const next = change("amount", expense.amount, amount, exported.amount ?? null, editable);
    if (next) (editable ? editableChanges : protectedChanges).push(next);
    proposed.amount = amount;
  }

  const currency = text(row.Currency).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    proposal.status = "INVALID";
    proposal.messages.push("Currency must be a three-letter code such as PHP.");
  } else {
    const next = change("currency", expense.currency, currency, exported.currency || null, editable);
    if (next) (editable ? editableChanges : protectedChanges).push(next);
    proposed.currency = currency;
  }

  const hiddenProjectId = nullableText(row["__HQ Project ID"]);
  if (hiddenProjectId !== (nullableText(exported.projectId) || null)) {
    proposal.status = "INVALID";
    proposal.messages.push("Project synchronization identity was changed in the workbook.");
  }
  const resolvedProject = resolveProject(row.Project, context.projects);
  if (resolvedProject.error) {
    proposal.status = "UNKNOWN_REFERENCE";
    proposal.messages.push(resolvedProject.error);
  } else {
    const next = change("projectId", expense.projectId || null, resolvedProject.id || null, exported.projectId || null, editable);
    if (next) (editable ? editableChanges : protectedChanges).push(next);
    proposed.projectId = resolvedProject.id;
  }

  const hiddenCostCodeId = nullableText(row["__HQ Cost Code ID"]);
  if (hiddenCostCodeId !== (nullableText(exported.costCodeId) || null)) {
    proposal.status = "INVALID";
    proposal.messages.push("Cost-code synchronization identity was changed in the workbook.");
  }
  const resolvedCostCode = resolveCostCode(row["Cost Code"], proposed.projectId, context.costCodes);
  if (resolvedCostCode.error) {
    proposal.status = "UNKNOWN_REFERENCE";
    proposal.messages.push(resolvedCostCode.error);
  } else if (resolvedCostCode.id && resolvedCostCode.status !== "ACTIVE" && resolvedCostCode.id !== expense.projectCostCodeId) {
    proposal.status = "INVALID";
    proposal.messages.push("New Expense assignments must use an active cost code.");
  } else {
    const next = change("projectCostCodeId", expense.projectCostCodeId || null, resolvedCostCode.id || null, exported.costCodeId || null, editable);
    if (next) (editable ? editableChanges : protectedChanges).push(next);
    proposed.projectCostCodeId = resolvedCostCode.id;
  }

  const protectedFields: Array<[string, string, unknown, unknown]> = [
    ["status", "Status", expense.status, text(row.Status).toUpperCase()],
    ["archivedAt", "Archived", expense.archivedAt ? "ARCHIVED" : "", text(row.Archived)],
    ["supplierInvoiceId", "Supplier Invoice", current.supplierInvoice, text(row["Supplier Invoice"])],
    ["vendorId", "Vendor", current.vendor, text(row.Vendor)],
    ["purchaseOrderId", "Purchase Order", current.purchaseOrder, text(row["Purchase Order"])],
    ["confirmedPaid", "Confirmed Paid", current.settlement.confirmedPaid, row["Confirmed Paid"]],
    ["outstanding", "Outstanding", current.settlement.outstanding, row.Outstanding],
    ["settlementState", "Settlement State", current.settlement.state, text(row["Settlement State"])],
  ];
  for (const [field, header, currentValue, workbookValue] of protectedFields) {
    const next = change(field, currentValue, workbookValue, exported[field] ?? null, false);
    if (next) protectedChanges.push(next);
  }

  proposal.changes = [...editableChanges, ...protectedChanges];
  const workbookChanged = proposal.changes.length > 0;
  if (protectedChanges.length > 0 || (!editable && workbookChanged)) {
    if (protectedChanges.length > 0) proposal.messages.push("One or more protected Expense, lifecycle, source, or settlement fields changed.");
    if (!editable && workbookChanged && protectedChanges.length === 0) proposal.messages.push("Only direct, unlinked DRAFT Expenses can be edited through this workbook.");
    if (proposal.status !== "INVALID" && proposal.status !== "UNKNOWN_REFERENCE") proposal.status = "UNSUPPORTED_PROTECTED_FIELD";
  } else if (proposal.status === "INVALID" || proposal.status === "UNKNOWN_REFERENCE") {
    // Keep the validation status.
  } else if (workbookChanged && appChanged) {
    proposal.status = "STALE_CONFLICT";
    proposal.messages.push("The Expense changed in HydroQualiSense after export and the workbook also proposes changes.");
  } else if (workbookChanged) {
    proposal.status = "WORKBOOK_ONLY_CHANGE";
  } else if (appChanged) {
    proposal.status = "APP_ONLY_CHANGE";
    proposal.messages.push("The Expense changed in HydroQualiSense after export; no workbook change is available to apply.");
  }
  proposal.expense = proposed;
  proposal.canApply = proposal.status === "WORKBOOK_ONLY_CHANGE" && context.canWrite && editable;
  if (proposal.canApply) proposal.applyExpense = proposed;
  return { proposal, workbookChanged, appChanged };
}

function supplierPayableProposal(
  row: Record<string, unknown>,
  invoice: InvoiceData | undefined,
  expense: Expense | undefined,
  metadata: MetadataRecord | undefined,
  context: ExpensesImportContext,
): ExpensesProposal {
  const id = text(row["__HQ Record ID"]);
  const currentState = invoice && supplierPayableState(invoice, expense, context);
  const proposal: ExpensesProposal = {
    id: `SUPPLIER_PAYABLE:${id || `ROW:${text(row["Invoice Number"])}`}`,
    entity: "SUPPLIER_PAYABLE",
    invoiceId: id || undefined,
    expenseId: currentState?.linkedExpenseId || undefined,
    label: text(row["Invoice Number"]) || id || "Unknown supplier payable",
    status: "UNCHANGED",
    canApply: false,
    messages: [],
    changes: [],
  };
  if (!id) {
    proposal.status = "UNSUPPORTED_NEW_RECORD";
    proposal.messages.push("Rows without a stable supplier invoice ID are proposed-but-unsupported.");
    return proposal;
  }
  if (!invoice || !currentState) {
    proposal.status = "UNKNOWN_REFERENCE";
    proposal.messages.push("The supplier payable identity is not present in the authorized Expense context.");
    return proposal;
  }
  if (!metadataIsValid(metadata, "SUPPLIER_PAYABLE", id, row, context.expectedCompanyId)) {
    proposal.status = text(row["__HQ Company ID"]) && context.expectedCompanyId && text(row["__HQ Company ID"]) !== context.expectedCompanyId ? "UNAUTHORIZED" : "INVALID";
    proposal.messages.push("Supplier payable synchronization metadata is missing, tampered, or outside the active company scope.");
    return proposal;
  }
  if (nullableText(row["__HQ Linked Expense ID"]) !== (currentState.linkedExpenseId || null)
    || metadata?.parentId !== (currentState.linkedExpenseId || undefined)) {
    proposal.status = "INVALID";
    proposal.messages.push("Supplier payable linked-Expense synchronization identity was changed in the workbook.");
    return proposal;
  }
  const exported = parseMetadataState(metadata) || {};
  const changes: ExpensesFieldChange[] = [];
  const invoiceDate = dateValue(row["Invoice Date"]) || null;
  const dueDate = dateValue(row["Due Date"]) || null;
  const fields: Array<[string, string, unknown, unknown]> = [
    ["invoiceNumber", "Invoice Number", currentState.invoiceNumber, row["Invoice Number"]],
    ["invoiceDate", "Invoice Date", currentState.invoiceDate, invoiceDate],
    ["dueDate", "Due Date", currentState.dueDate, dueDate],
    ["vendor", "Vendor", currentState.vendor, row.Vendor],
    ["currency", "Currency", currentState.currency, row.Currency],
    ["invoiceTotal", "Invoice Total", currentState.invoiceTotal, row["Invoice Total"]],
    ["linkedExpenseId", "Linked Expense", currentState.linkedExpenseId, row["Linked Expense"]],
    ["expenseAmount", "Expense Amount", currentState.expenseAmount, row["Expense Amount"]],
    ["confirmedPaid", "Confirmed Paid", currentState.confirmedPaid, row["Confirmed Paid"]],
    ["outstanding", "Outstanding", currentState.outstanding, row.Outstanding],
    ["paymentState", "Payment State", currentState.paymentState, row["Payment State"]],
    ["reviewState", "Review State", currentState.reviewState, row["Review State"]],
    ["invoiceLifecycle", "Invoice Lifecycle", currentState.invoiceLifecycle, row["Invoice Lifecycle"]],
    ["project", "Project", currentState.project, row.Project],
    ["authorityConflict", "Authority Conflict", currentState.authorityConflict ? "CONFLICT" : "", row["Authority Conflict"]],
  ];
  for (const [field, header, currentValue, workbookValue] of fields) {
    const next = change(field, currentValue, workbookValue, exported[field] ?? null, false);
    if (next) changes.push(next);
  }
  const appChanged = fingerprintValue(currentState) !== metadata.fingerprint || Boolean(metadata.updatedAt && metadata.updatedAt !== (invoice.updatedAt || ""));
  proposal.changes = changes;
  if (changes.length > 0) {
    proposal.status = "UNSUPPORTED_PROTECTED_FIELD";
    proposal.messages.push("Supplier payable/source and settlement values are read-only projections of authoritative workflows.");
  } else if (appChanged) {
    proposal.status = "APP_ONLY_CHANGE";
    proposal.messages.push("The supplier payable changed in HydroQualiSense after export; no workbook change is available to apply.");
  }
  return proposal;
}

export function buildExpensesImportReview(
  input: ArrayBuffer | Uint8Array,
  context: ExpensesImportContext,
  options: { fileName?: string } = {},
): ExpensesImportReview {
  const parsed = parseOperationsWorkbook(input, { schema: EXPENSES_WORKBOOK_SCHEMA, fileName: options.fileName });
  const metadata = metadataIndex(parsed);
  const expensesById = new Map(context.expenses.map((expense) => [expense.id, expense]));
  const invoicesById = new Map(context.invoices.map((invoice) => [invoice.id, invoice]));
  const proposals: ExpensesProposal[] = [];
  const warnings: string[] = [];
  const seenExpenseIds = new Set<string>();
  const seenInvoiceIds = new Set<string>();
  const workbookCompanyId = nullableText(parsed.metadata.companyId);
  if (context.expectedCompanyId && workbookCompanyId && workbookCompanyId !== context.expectedCompanyId) warnings.push("Workbook company identity does not match the active company scope.");

  for (const row of parsed.sheets.Expenses.rows) {
    const id = text(row["__HQ Record ID"]);
    if (id && seenExpenseIds.has(id)) {
      proposals.push({ id: `EXPENSE:DUPLICATE:${id}`, entity: "EXPENSE", expenseId: id, label: text(row.Description) || id, status: "INVALID", canApply: false, messages: ["Duplicate Expense IDs are not supported."], changes: [] });
      continue;
    }
    if (id) seenExpenseIds.add(id);
    const result = expenseProposal(row, expensesById.get(id), metadata.get(`EXPENSE:${id}`), context);
    proposals.push(result.proposal);
  }

  for (const row of parsed.sheets["Supplier Payables"].rows) {
    const id = text(row["__HQ Record ID"]);
    if (id && seenInvoiceIds.has(id)) {
      proposals.push({ id: `SUPPLIER_PAYABLE:DUPLICATE:${id}`, entity: "SUPPLIER_PAYABLE", invoiceId: id, label: text(row["Invoice Number"]) || id, status: "INVALID", canApply: false, messages: ["Duplicate supplier invoice IDs are not supported."], changes: [] });
      continue;
    }
    if (id) seenInvoiceIds.add(id);
    const invoice = invoicesById.get(id);
    const expense = invoice ? context.expenses.find((candidate) => candidate.supplierInvoiceId === invoice.id)
      || (invoice.linkedExpenseId ? context.expenses.find((candidate) => candidate.id === invoice.linkedExpenseId) : undefined) : undefined;
    proposals.push(supplierPayableProposal(row, invoice, expense, metadata.get(`SUPPLIER_PAYABLE:${id}`), context));
  }

  return {
    bytes: input instanceof Uint8Array ? input : new Uint8Array(input),
    fileName: options.fileName,
    proposals,
    omittedExpenseIds: context.expenses.map((expense) => expense.id).filter((id) => !seenExpenseIds.has(id)),
    omittedSupplierInvoiceIds: relatedSupplierInvoices(context).map((invoice) => invoice.id).filter((id) => !seenInvoiceIds.has(id)),
    workbookWarnings: warnings,
  };
}

export async function applyExpensesImport(
  review: ExpensesImportReview,
  freshContext: ExpensesImportContext,
  callbacks: ExpensesApplyCallbacks,
  selectedProposalIds?: readonly string[],
): Promise<ExpensesApplyResult> {
  if (!freshContext.canWrite) throw new Error("You do not have permission to apply Expense workbook changes.");
  const freshReview = buildExpensesImportReview(review.bytes, freshContext, { fileName: review.fileName });
  const selected = selectedProposalIds ? [...selectedProposalIds] : freshReview.proposals.filter((proposal) => proposal.canApply).map((proposal) => proposal.id);
  const appliedProposalIds: string[] = [];
  for (const proposalId of selected) {
    const proposal = freshReview.proposals.find((candidate) => candidate.id === proposalId);
    if (!proposal || !proposal.canApply || !proposal.applyExpense) throw new Error(`Expense workbook proposal ${proposalId} is stale or no longer safe to apply; review the current conflicts.`);
    await callbacks.saveExpense(proposal.applyExpense);
    appliedProposalIds.push(proposalId);
  }
  return { appliedProposalIds, refreshedReview: freshReview };
}
