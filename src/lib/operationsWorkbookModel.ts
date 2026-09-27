import {
  hasAllPermissions,
  hasAnyPermission,
  PERMISSION_KEYS,
  type PermissionKey,
} from "../utils/accessControl.ts";
import type {
  WorksheetCellContext,
  WorksheetColumn,
  WorksheetParseResult,
  WorksheetSelectOption,
  WorksheetValidationResult,
} from "../components/ui/worksheetEditorModel.ts";
import { validateExpenseDraftField } from "./expenseDraftRules.ts";

export type OperationsWorkbookSheetId =
  | "projects"
  | "cost-codes"
  | "supplier-invoices"
  | "expenses"
  | "rfqs"
  | "purchase-orders"
  | "materials"
  | "equipment"
  | "warehouse"
  | "vendors"
  | "payroll";

export type OperationsWorkbookDomainOwner =
  | "projects"
  | "invoices"
  | "expenses"
  | "procurement"
  | "inventory"
  | "equipment"
  | "vendors"
  | "payroll";

export type OperationsWorkbookFieldType =
  | "text"
  | "number"
  | "currency"
  | "date"
  | "boolean"
  | "select"
  | "identifier";

export type OperationsWorkbookFieldAuthority =
  | "ordinary-editable"
  | "conditionally-editable"
  | "read-only"
  | "protected"
  | "calculated"
  | "source-evidence"
  | "lifecycle-controlled"
  | "workflow-only";

export type OperationsWorkbookSheetReadiness =
  | "available"
  | "foundation-only"
  | "future-adapter";

export interface OperationsWorkbookAuthorization {
  /** At least one existing domain permission is required to read the sheet. */
  readonly readAnyOf: readonly PermissionKey[];
  /** Every listed existing domain permission is required for delegated writes. */
  readonly writeAllOf?: readonly PermissionKey[];
}

export interface OperationsWorkbookFieldDefinition {
  readonly id: string;
  readonly label: string;
  readonly shortName?: string;
  readonly type: OperationsWorkbookFieldType;
  readonly authority: OperationsWorkbookFieldAuthority;
  readonly required?: boolean;
  readonly writeAllOf?: readonly PermissionKey[];
  readonly options?: readonly WorksheetSelectOption[];
  readonly display?: {
    readonly align?: "left" | "center" | "right";
    readonly width?: string;
    readonly minWidth?: string;
    readonly frozen?: boolean;
    readonly currencyCode?: string;
    readonly currencyField?: string;
  };
  readonly format?: (value: unknown, row: unknown) => string;
  readonly validate?: (value: unknown, row: unknown) => WorksheetValidationResult;
}

export interface OperationsWorkbookSheetDefinition {
  readonly id: OperationsWorkbookSheetId;
  readonly name: string;
  readonly shortName?: string;
  readonly domainOwner: OperationsWorkbookDomainOwner;
  readonly readiness: OperationsWorkbookSheetReadiness;
  readonly authorization: OperationsWorkbookAuthorization;
  readonly rowIdentity: {
    readonly field: string;
    readonly label: string;
  };
  readonly capabilities: {
    readonly read: boolean;
    /** Production writes are available only through an existing domain adapter. */
    readonly write: "read-only" | "domain-delegated";
  };
  readonly fields: readonly OperationsWorkbookFieldDefinition[];
  readonly emptyState: string;
  readonly authorityBoundary: string;
}

export interface OperationsWorkbookDefinition {
  readonly id: "hydroqualisense-operations-workbook";
  readonly title: "Operations Workbook";
  readonly sheetIds: readonly OperationsWorkbookSheetId[];
}

const projectStatusOptions: readonly WorksheetSelectOption[] = [
  { value: "PLANNING", label: "Planning" },
  { value: "ACTIVE", label: "Active" },
  { value: "ON_HOLD", label: "On hold" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "ARCHIVED", label: "Archived" },
];

const projectTaxTreatmentOptions: readonly WorksheetSelectOption[] = [
  { value: "VAT", label: "VAT" },
  { value: "NON_VAT", label: "Non-VAT" },
  { value: "UNCLASSIFIED", label: "Unclassified" },
];

function requiredText(value: unknown, label: string): WorksheetValidationResult {
  return String(value ?? "").trim() ? undefined : `Enter a ${label.toLowerCase()}.`;
}

function nonNegativeAmount(value: unknown, label: string, required = false): WorksheetValidationResult {
  if ((value === null || value === undefined || value === "") && !required) return undefined;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    return `${label} ${required ? "is required and " : ""}must be a valid non-negative number.`;
  }
  return undefined;
}

function validBillingEmail(value: unknown): WorksheetValidationResult {
  const email = String(value ?? "").trim();
  return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? undefined
    : "Enter a valid billing email or leave it blank.";
}

function projectTaxTreatment(value: unknown, row: unknown): WorksheetValidationResult {
  const next = String(value ?? "").trim().toUpperCase();
  if (!(projectTaxTreatmentOptions as readonly WorksheetSelectOption[]).some((option) => option.value === next)) {
    return "Choose VAT, Non-VAT, or the existing Unclassified value.";
  }
  const current = (row as { taxTreatment?: string }).taxTreatment || "UNCLASSIFIED";
  return next === "UNCLASSIFIED" && current !== "UNCLASSIFIED"
    ? "A classified project cannot be changed back to Unclassified."
    : undefined;
}

function unavailableFinancialValue(): string {
  return "Unavailable";
}

function formatProtectedCurrency(value: unknown, row: unknown): string {
  if (value === null || value === undefined || value === "" || value === "Unavailable" || !Number.isFinite(Number(value))) {
    return unavailableFinancialValue();
  }
  const currency = String((row as { currency?: string }).currency || "PHP").toUpperCase();
  try {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value));
  } catch {
    return `${currency} ${Number(value).toFixed(2)}`;
  }
}

export const OPERATIONS_WORKBOOK_SHEET_REGISTRY: readonly OperationsWorkbookSheetDefinition[] = Object.freeze([
  {
    id: "projects",
    name: "Projects",
    domainOwner: "projects",
    readiness: "available",
    authorization: {
      readAnyOf: [PERMISSION_KEYS.projectsRead],
      writeAllOf: [PERMISSION_KEYS.projectsWrite],
    },
    rowIdentity: { field: "id", label: "Project ID" },
    capabilities: { read: true, write: "domain-delegated" },
    fields: [
      {
        id: "projectCode",
        label: "Project code",
        type: "identifier",
        authority: "ordinary-editable",
        required: true,
        writeAllOf: [PERMISSION_KEYS.projectsWrite],
        display: { frozen: true, minWidth: "9rem" },
        validate: (value) => requiredText(value, "project code"),
      },
      {
        id: "projectName",
        label: "Project name",
        type: "text",
        authority: "ordinary-editable",
        required: true,
        writeAllOf: [PERMISSION_KEYS.projectsWrite],
        display: { minWidth: "15rem" },
        validate: (value) => String(value ?? "").trim() ? undefined : "Enter a project name.",
      },
      { id: "description", label: "Description", type: "text", authority: "ordinary-editable", writeAllOf: [PERMISSION_KEYS.projectsWrite], display: { minWidth: "16rem" } },
      { id: "clientName", label: "Client name", type: "text", authority: "ordinary-editable", writeAllOf: [PERMISSION_KEYS.projectsWrite], display: { minWidth: "12rem" } },
      { id: "clientReference", label: "Client reference", type: "text", authority: "ordinary-editable", writeAllOf: [PERMISSION_KEYS.projectsWrite], display: { minWidth: "12rem" } },
      { id: "billingContactName", label: "Billing contact", type: "text", authority: "ordinary-editable", writeAllOf: [PERMISSION_KEYS.projectsWrite], display: { minWidth: "12rem" } },
      { id: "billingEmail", label: "Billing email", type: "text", authority: "ordinary-editable", writeAllOf: [PERMISSION_KEYS.projectsWrite], display: { minWidth: "14rem" }, validate: validBillingEmail },
      { id: "billingAddress", label: "Billing address", type: "text", authority: "ordinary-editable", writeAllOf: [PERMISSION_KEYS.projectsWrite], display: { minWidth: "18rem" } },
      { id: "location", label: "Location", type: "text", authority: "ordinary-editable", writeAllOf: [PERMISSION_KEYS.projectsWrite], display: { minWidth: "12rem" } },
      { id: "siteAddress", label: "Site address", type: "text", authority: "ordinary-editable", writeAllOf: [PERMISSION_KEYS.projectsWrite], display: { minWidth: "18rem" } },
      { id: "projectManager", label: "Project manager", type: "text", authority: "ordinary-editable", writeAllOf: [PERMISSION_KEYS.projectsWrite], display: { minWidth: "12rem" } },
      { id: "startDate", label: "Start date", type: "date", authority: "ordinary-editable", writeAllOf: [PERMISSION_KEYS.projectsWrite], display: { minWidth: "9rem" } },
      { id: "targetEndDate", label: "Target end date", type: "date", authority: "ordinary-editable", writeAllOf: [PERMISSION_KEYS.projectsWrite], display: { minWidth: "9rem" } },
      { id: "actualEndDate", label: "Actual end date", type: "date", authority: "ordinary-editable", writeAllOf: [PERMISSION_KEYS.projectsWrite], display: { minWidth: "9rem" } },
      { id: "contractValue", label: "Contract value", type: "currency", authority: "ordinary-editable", writeAllOf: [PERMISSION_KEYS.projectsWrite], display: { align: "right", minWidth: "11rem", currencyField: "currency" }, validate: (value) => nonNegativeAmount(value, "Contract value") },
      { id: "projectBudget", label: "Approved project budget", type: "currency", authority: "ordinary-editable", required: true, writeAllOf: [PERMISSION_KEYS.projectsWrite], display: { align: "right", minWidth: "13rem", currencyField: "currency" }, validate: (value) => nonNegativeAmount(value, "Approved project budget", true) },
      { id: "currency", label: "Currency", type: "identifier", authority: "protected", display: { minWidth: "7rem" } },
      { id: "taxTreatment", label: "Tax treatment", type: "select", authority: "ordinary-editable", required: true, writeAllOf: [PERMISSION_KEYS.projectsWrite], options: projectTaxTreatmentOptions, display: { minWidth: "10rem" }, validate: projectTaxTreatment },
      { id: "notes", label: "Notes", type: "text", authority: "ordinary-editable", writeAllOf: [PERMISSION_KEYS.projectsWrite], display: { minWidth: "16rem" } },
      { id: "status", label: "Status", type: "select", authority: "lifecycle-controlled", options: projectStatusOptions, display: { minWidth: "9rem" } },
      { id: "actualCost", label: "Actual cost", type: "currency", authority: "calculated", display: { align: "right", minWidth: "11rem", currencyField: "currency" }, format: formatProtectedCurrency },
      { id: "committedCost", label: "Committed cost", type: "currency", authority: "calculated", display: { align: "right", minWidth: "11rem", currencyField: "currency" }, format: formatProtectedCurrency },
      { id: "billed", label: "Billed", type: "currency", authority: "calculated", display: { align: "right", minWidth: "11rem", currencyField: "currency" }, format: formatProtectedCurrency },
      { id: "collected", label: "Collected", type: "currency", authority: "calculated", display: { align: "right", minWidth: "11rem", currencyField: "currency" }, format: formatProtectedCurrency },
      { id: "outstandingReceivables", label: "Outstanding receivables", type: "currency", authority: "calculated", display: { align: "right", minWidth: "12rem", currencyField: "currency" }, format: formatProtectedCurrency },
      { id: "remainingToBill", label: "Remaining to bill", type: "currency", authority: "calculated", display: { align: "right", minWidth: "12rem", currencyField: "currency" }, format: formatProtectedCurrency },
      { id: "health", label: "Health", type: "text", authority: "calculated", display: { minWidth: "9rem" } },
    ],
    emptyState: "No project rows are available in this workspace.",
    authorityBoundary: "Project master data saves through the existing Projects domain; lifecycle and calculated financial fields stay controlled.",
  },
  {
    id: "cost-codes",
    name: "Cost Codes",
    shortName: "Cost codes",
    domainOwner: "projects",
    readiness: "available",
    authorization: { readAnyOf: [PERMISSION_KEYS.projectsRead], writeAllOf: [PERMISSION_KEYS.projectsWrite] },
    rowIdentity: { field: "id", label: "Cost code ID" },
    capabilities: { read: true, write: "domain-delegated" },
    fields: [
      { id: "projectCode", label: "Project", type: "identifier", authority: "protected", display: { frozen: true, minWidth: "9rem" } },
      { id: "code", label: "Code", type: "text", authority: "ordinary-editable", required: true, writeAllOf: [PERMISSION_KEYS.projectsWrite], display: { minWidth: "10rem" }, validate: (value) => requiredText(value, "cost code") },
      { id: "name", label: "Work package", type: "text", authority: "ordinary-editable", required: true, writeAllOf: [PERMISSION_KEYS.projectsWrite], display: { minWidth: "16rem" }, validate: (value) => requiredText(value, "work package") },
      { id: "description", label: "Description", type: "text", authority: "ordinary-editable", writeAllOf: [PERMISSION_KEYS.projectsWrite], display: { minWidth: "18rem" } },
      { id: "approvedBudgetAmount", label: "Approved budget", type: "currency", authority: "ordinary-editable", required: true, writeAllOf: [PERMISSION_KEYS.projectsWrite], display: { align: "right", minWidth: "11rem", currencyField: "currency" }, validate: (value) => nonNegativeAmount(value, "Approved budget", true) },
      { id: "forecastAmount", label: "Forecast", type: "currency", authority: "ordinary-editable", writeAllOf: [PERMISSION_KEYS.projectsWrite], display: { align: "right", minWidth: "10rem", currencyField: "currency" }, validate: (value) => nonNegativeAmount(value, "Forecast") },
      { id: "status", label: "Status", type: "select", authority: "lifecycle-controlled", display: { minWidth: "9rem" } },
      { id: "actualCost", label: "Actual cost", type: "currency", authority: "calculated", display: { align: "right", minWidth: "11rem", currencyField: "currency" }, format: formatProtectedCurrency },
      { id: "committedCost", label: "Committed cost", type: "currency", authority: "calculated", display: { align: "right", minWidth: "11rem", currencyField: "currency" }, format: formatProtectedCurrency },
      { id: "variance", label: "Variance", type: "currency", authority: "calculated", display: { align: "right", minWidth: "11rem", currencyField: "currency" }, format: formatProtectedCurrency },
    ],
    emptyState: "No cost-code rows are available in this workspace.",
    authorityBoundary: "Cost-code edits stay attached to their existing project and save through the Projects domain.",
  },
  {
    id: "supplier-invoices",
    name: "Supplier Invoices",
    shortName: "Invoices",
    domainOwner: "invoices",
    readiness: "future-adapter",
    authorization: { readAnyOf: [PERMISSION_KEYS.invoicesRead], writeAllOf: [PERMISSION_KEYS.invoicesWrite] },
    rowIdentity: { field: "id", label: "Invoice ID" },
    capabilities: { read: true, write: "domain-delegated" },
    fields: [
      { id: "invoiceNumber", label: "Invoice number", type: "identifier", authority: "source-evidence" },
      { id: "invoiceDate", label: "Invoice date", type: "date", authority: "source-evidence" },
      { id: "dueDate", label: "Due date", type: "date", authority: "source-evidence" },
      { id: "currency", label: "Currency", type: "select", authority: "protected" },
      { id: "total", label: "Source total", type: "currency", authority: "calculated", display: { align: "right", currencyField: "currency" } },
      { id: "reviewStatus", label: "Review", type: "select", authority: "workflow-only" },
    ],
    emptyState: "Supplier Invoices are not onboarded to the unified workbook yet.",
    authorityBoundary: "Invoice source evidence, verification, and Expense creation remain owned by the invoice workflow.",
  },
  {
    id: "expenses",
    name: "Expenses",
    domainOwner: "expenses",
    readiness: "available",
    authorization: { readAnyOf: [PERMISSION_KEYS.expensesRead], writeAllOf: [PERMISSION_KEYS.expensesWrite] },
    rowIdentity: { field: "id", label: "Expense ID" },
    capabilities: { read: true, write: "domain-delegated" },
    fields: [
      { id: "expenseDate", label: "Expense Date", type: "date", authority: "conditionally-editable", required: true, writeAllOf: [PERMISSION_KEYS.expensesWrite], display: { frozen: true, minWidth: "10rem" }, validate: (value) => validateExpenseDraftField("expenseDate", value) },
      { id: "projectId", label: "Project", type: "select", authority: "conditionally-editable", writeAllOf: [PERMISSION_KEYS.expensesWrite], display: { minWidth: "18rem" } },
      { id: "projectCostCodeId", label: "Cost Code", type: "select", authority: "conditionally-editable", writeAllOf: [PERMISSION_KEYS.expensesWrite], display: { minWidth: "17rem" } },
      { id: "category", label: "Category", type: "text", authority: "conditionally-editable", writeAllOf: [PERMISSION_KEYS.expensesWrite], display: { minWidth: "14rem" } },
      { id: "description", label: "Description", type: "text", authority: "conditionally-editable", required: true, writeAllOf: [PERMISSION_KEYS.expensesWrite], display: { minWidth: "20rem" }, validate: (value) => validateExpenseDraftField("description", value) },
      { id: "payee", label: "Payee", type: "text", authority: "conditionally-editable", writeAllOf: [PERMISSION_KEYS.expensesWrite], display: { minWidth: "16rem" } },
      { id: "amount", label: "Amount", type: "currency", authority: "conditionally-editable", required: true, writeAllOf: [PERMISSION_KEYS.expensesWrite], display: { align: "right", minWidth: "11rem", currencyField: "currency" }, validate: (value) => validateExpenseDraftField("amount", value) },
      { id: "currency", label: "Currency", type: "text", authority: "conditionally-editable", required: true, writeAllOf: [PERMISSION_KEYS.expensesWrite], display: { minWidth: "8rem" }, validate: (value) => validateExpenseDraftField("currency", value) },
      { id: "paymentMethod", label: "Payment Method", type: "select", authority: "conditionally-editable", writeAllOf: [PERMISSION_KEYS.expensesWrite], display: { minWidth: "16rem" } },
      { id: "referenceNumber", label: "Reference", type: "text", authority: "conditionally-editable", writeAllOf: [PERMISSION_KEYS.expensesWrite], display: { minWidth: "13rem" } },
      { id: "notes", label: "Notes", type: "text", authority: "conditionally-editable", writeAllOf: [PERMISSION_KEYS.expensesWrite], display: { minWidth: "18rem" } },
      { id: "expenseId", label: "Expense ID", type: "identifier", authority: "protected", display: { minWidth: "14rem" } },
      { id: "status", label: "Status", type: "select", authority: "lifecycle-controlled" },
      { id: "sourceLinkage", label: "Source", type: "text", authority: "source-evidence", display: { minWidth: "17rem" } },
      { id: "vendorLinkage", label: "Vendor identity", type: "identifier", authority: "protected", display: { minWidth: "15rem" } },
      { id: "purchaseOrderLinkage", label: "Purchase Order", type: "identifier", authority: "protected", display: { minWidth: "15rem" } },
      { id: "settlementState", label: "Settlement", type: "text", authority: "workflow-only", display: { minWidth: "20rem" } },
      { id: "baseCurrencyValue", label: "Base-currency value", type: "text", authority: "calculated", display: { minWidth: "18rem" } },
      { id: "fxProvenance", label: "FX provenance", type: "text", authority: "source-evidence", display: { minWidth: "18rem" } },
      { id: "archiveState", label: "Archive", type: "text", authority: "lifecycle-controlled", display: { minWidth: "17rem" } },
      { id: "voidCorrectionState", label: "Void / correction", type: "text", authority: "lifecycle-controlled", display: { minWidth: "20rem" } },
      { id: "createdAt", label: "Created", type: "text", authority: "protected", display: { minWidth: "20rem" } },
      { id: "updatedAt", label: "Updated / version", type: "text", authority: "protected", display: { minWidth: "20rem" } },
    ],
    emptyState: "No Expense rows are available in this workspace.",
    authorityBoundary: "Only direct, active DRAFT Expense fields may save through the existing Expense workflow; source, settlement, identity, history, and lifecycle state stay protected.",
  },
  {
    id: "rfqs",
    name: "RFQs",
    domainOwner: "procurement",
    readiness: "available",
    authorization: { readAnyOf: [PERMISSION_KEYS.procurementRead], writeAllOf: [PERMISSION_KEYS.procurementWrite] },
    rowIdentity: { field: "id", label: "RFQ ID" },
    capabilities: { read: true, write: "domain-delegated" },
    fields: [
      { id: "rfqNumber", label: "RFQ Number", type: "identifier", authority: "protected" },
      { id: "title", label: "Title", type: "text", authority: "ordinary-editable", writeAllOf: [PERMISSION_KEYS.procurementWrite] },
      { id: "dueDate", label: "Due Date", type: "date", authority: "ordinary-editable", writeAllOf: [PERMISSION_KEYS.procurementWrite] },
      { id: "status", label: "Status", type: "select", authority: "workflow-only" },
      { id: "updatedAt", label: "Updated", type: "text", authority: "protected", display: { minWidth: "18rem" } },
    ],
    emptyState: "No RFQs are available in this workspace.",
    authorityBoundary: "Only Title and Due Date on existing DRAFT RFQs are editable; identity, status, lines, invitations, history, quotation comparison, selection, issue, and cancellation remain protected.",
  },
  {
    id: "purchase-orders",
    name: "Purchase Orders",
    shortName: "Purchase orders",
    domainOwner: "procurement",
    readiness: "available",
    authorization: { readAnyOf: [PERMISSION_KEYS.procurementRead], writeAllOf: [PERMISSION_KEYS.procurementWrite] },
    rowIdentity: { field: "id", label: "Purchase Order ID" },
    capabilities: { read: true, write: "domain-delegated" },
    fields: [
      { id: "poNumber", label: "PO Number", type: "identifier", authority: "protected" },
      { id: "description", label: "Description", type: "text", authority: "ordinary-editable", writeAllOf: [PERMISSION_KEYS.procurementWrite] },
      { id: "total", label: "Total", type: "currency", authority: "calculated", display: { align: "right", currencyField: "currency" } },
      { id: "status", label: "Status", type: "select", authority: "workflow-only" },
      { id: "updatedAt", label: "Updated", type: "text", authority: "protected", display: { minWidth: "18rem" } },
    ],
    emptyState: "No Purchase Orders are available in this workspace.",
    authorityBoundary: "Only Description on existing DRAFT Purchase Orders is editable; identity, calculated totals, lines, vendor/project links, approval, issue, receiving, matching, settlement, and lifecycle remain protected.",
  },
  {
    id: "materials",
    name: "Materials",
    domainOwner: "inventory",
    readiness: "future-adapter",
    authorization: { readAnyOf: [PERMISSION_KEYS.inventoryRead], writeAllOf: [PERMISSION_KEYS.inventoryManage] },
    rowIdentity: { field: "id", label: "Material ID" },
    capabilities: { read: true, write: "domain-delegated" },
    fields: [
      { id: "name", label: "Material", type: "text", authority: "read-only" },
      { id: "quantity", label: "Quantity", type: "number", authority: "read-only", display: { align: "right" } },
      { id: "received", label: "Received", type: "boolean", authority: "workflow-only" },
    ],
    emptyState: "Materials are not onboarded to the unified workbook yet.",
    authorityBoundary: "Receipt, issue, return, movement, and allocation remain controlled domain actions.",
  },
  {
    id: "equipment",
    name: "Equipment",
    domainOwner: "equipment",
    readiness: "future-adapter",
    authorization: { readAnyOf: [PERMISSION_KEYS.equipmentRead], writeAllOf: [PERMISSION_KEYS.equipmentManage] },
    rowIdentity: { field: "id", label: "Equipment ID" },
    capabilities: { read: true, write: "domain-delegated" },
    fields: [
      { id: "assetTag", label: "Asset tag", type: "identifier", authority: "read-only" },
      { id: "name", label: "Equipment", type: "text", authority: "read-only" },
      { id: "status", label: "Status", type: "select", authority: "lifecycle-controlled" },
    ],
    emptyState: "Equipment is not onboarded to the unified workbook yet.",
    authorityBoundary: "Assignment, transfer, return, and lifecycle history remain owned by the Equipment domain.",
  },
  {
    id: "warehouse",
    name: "Warehouse",
    domainOwner: "inventory",
    readiness: "future-adapter",
    authorization: { readAnyOf: [PERMISSION_KEYS.inventoryRead], writeAllOf: [PERMISSION_KEYS.inventoryManage] },
    rowIdentity: { field: "id", label: "Inventory item ID" },
    capabilities: { read: true, write: "domain-delegated" },
    fields: [
      { id: "itemCode", label: "Item code", type: "identifier", authority: "read-only" },
      { id: "name", label: "Item", type: "text", authority: "read-only" },
      { id: "balance", label: "Balance", type: "number", authority: "calculated", display: { align: "right" } },
      { id: "active", label: "Active", type: "boolean", authority: "lifecycle-controlled" },
    ],
    emptyState: "Warehouse is not onboarded to the unified workbook yet.",
    authorityBoundary: "Balances remain derived from authoritative inventory movement history.",
  },
  {
    id: "vendors",
    name: "Vendors",
    domainOwner: "vendors",
    readiness: "future-adapter",
    authorization: { readAnyOf: [PERMISSION_KEYS.vendorsRead], writeAllOf: [PERMISSION_KEYS.vendorsManage] },
    rowIdentity: { field: "id", label: "Vendor ID" },
    capabilities: { read: true, write: "domain-delegated" },
    fields: [
      { id: "name", label: "Vendor", type: "text", authority: "read-only" },
      { id: "taxId", label: "Tax ID", type: "identifier", authority: "source-evidence" },
      { id: "active", label: "Active", type: "boolean", authority: "lifecycle-controlled" },
    ],
    emptyState: "Vendors are not onboarded to the unified workbook yet.",
    authorityBoundary: "Canonical vendor identity and lifecycle remain owned by the Vendors domain.",
  },
  {
    id: "payroll",
    name: "Payroll",
    domainOwner: "payroll",
    readiness: "future-adapter",
    authorization: { readAnyOf: [PERMISSION_KEYS.payrollRead], writeAllOf: [PERMISSION_KEYS.payrollWrite] },
    rowIdentity: { field: "id", label: "Payroll record ID" },
    capabilities: { read: true, write: "domain-delegated" },
    fields: [
      { id: "worker", label: "Worker", type: "identifier", authority: "protected" },
      { id: "period", label: "Period", type: "date", authority: "read-only" },
      { id: "netPay", label: "Net pay", type: "currency", authority: "calculated", display: { align: "right", currencyField: "currency" } },
      { id: "status", label: "Status", type: "select", authority: "workflow-only" },
    ],
    emptyState: "Payroll is not onboarded to the unified workbook yet.",
    authorityBoundary: "Payroll details require payroll.detail.read; summary/report access never enables this sheet.",
  },
]);

export const OPERATIONS_WORKBOOK: OperationsWorkbookDefinition = Object.freeze({
  id: "hydroqualisense-operations-workbook",
  title: "Operations Workbook",
  sheetIds: OPERATIONS_WORKBOOK_SHEET_REGISTRY.map((sheet) => sheet.id),
});

/** Only this list has a page adapter today; readiness alone never enables a tab. */
export const OPERATIONS_WORKBOOK_ENABLED_ADAPTERS: readonly OperationsWorkbookSheetId[] = Object.freeze([
  "projects",
  "cost-codes",
  "expenses",
  "rfqs",
  "purchase-orders",
]);

export function findOperationsWorkbookSheet(sheetId: string | null | undefined): OperationsWorkbookSheetDefinition | undefined {
  return OPERATIONS_WORKBOOK_SHEET_REGISTRY.find((sheet) => sheet.id === sheetId);
}

export function canReadOperationsWorkbookSheet(
  sheet: OperationsWorkbookSheetDefinition,
  permissions: Iterable<PermissionKey> | null | undefined,
): boolean {
  return sheet.capabilities.read && hasAnyPermission(permissions, sheet.authorization.readAnyOf);
}

export function availableOperationsWorkbookSheets(
  permissions: Iterable<PermissionKey> | null | undefined,
  options: {
    readonly registry?: readonly OperationsWorkbookSheetDefinition[];
    readonly enabledAdapters?: readonly OperationsWorkbookSheetId[];
  } = {},
): OperationsWorkbookSheetDefinition[] {
  const registry = options.registry || OPERATIONS_WORKBOOK_SHEET_REGISTRY;
  const enabledAdapters = new Set(options.enabledAdapters || OPERATIONS_WORKBOOK_ENABLED_ADAPTERS);
  const permissionSnapshot = permissions ? [...permissions] : [];
  return registry.filter((sheet) =>
    sheet.readiness === "available"
    && enabledAdapters.has(sheet.id)
    && canReadOperationsWorkbookSheet(sheet, permissionSnapshot));
}

export function canAccessOperationsWorkbook(permissions: Iterable<PermissionKey> | null | undefined): boolean {
  const permissionSnapshot = permissions ? [...permissions] : [];
  return availableOperationsWorkbookSheets(permissionSnapshot).length > 0
    || hasAnyPermission(permissionSnapshot, [PERMISSION_KEYS.projectsRead, PERMISSION_KEYS.expensesRead, PERMISSION_KEYS.procurementRead]);
}

/** A changed company, permission set, or data scope must remount and clear staged worksheet edits. */
export function operationsWorkbookContextKey(
  companyId: string | null | undefined,
  permissions: Iterable<PermissionKey> | null | undefined,
  demoMode: boolean,
): string {
  return `${companyId || "no-company"}|${demoMode ? "demo" : "live"}|${[...new Set(permissions || [])].sort().join(",")}`;
}

/** Resolve invalid, unknown, or unauthorized URL selections without returning hidden sheet metadata. */
export function resolveOperationsWorkbookSheetSelection(
  requestedSheetId: string | null | undefined,
  visibleSheets: readonly OperationsWorkbookSheetDefinition[],
): OperationsWorkbookSheetDefinition | undefined {
  return visibleSheets.find((sheet) => sheet.id === requestedSheetId) || visibleSheets[0];
}

export interface OperationsWorkbookSheetAdapter<Row> {
  readonly sheet: OperationsWorkbookSheetDefinition;
  readonly rows: readonly Row[];
  readonly writeMode: "none" | "existing-domain" | "synthetic-demo";
  readonly dataScope?: "synthetic-demo";
  readonly readValue: (row: Row, fieldId: string) => unknown;
  /** Domain-owned draft mutation. The workbook does not map metadata to arbitrary object/database fields. */
  readonly applyDraftValue?: (row: Row, fieldId: string, value: unknown) => Row;
  /** Domain-backed choices such as authorized Projects and active Cost Codes. */
  readonly selectOptionsForField?: (
    field: OperationsWorkbookFieldDefinition,
    row: Row,
    rowIndex: number,
  ) => readonly WorksheetSelectOption[] | undefined;
  /** Domain lifecycle/permission conditions that vary by row or field. */
  readonly canEditField?: (
    field: OperationsWorkbookFieldDefinition,
    row: Row,
    rowIndex: number,
    permissions: Iterable<PermissionKey> | null | undefined,
  ) => boolean;
  /** Must delegate to the existing domain save/apply authority, or remain local to a synthetic demo. */
  readonly onSave?: (rows: readonly Row[]) => void | Promise<void>;
  readonly dirtyCells?: ReadonlySet<string>;
  readonly cellIssues?: Readonly<Record<string, string>>;
  readonly conflicts?: Readonly<Record<string, string>>;
  readonly concurrencyTokenFor?: (rowId: string) => string | null | undefined;
  readonly refresh?: () => void | Promise<void>;
}

export function canEditOperationsWorkbookField<Row>(
  sheet: OperationsWorkbookSheetDefinition,
  field: OperationsWorkbookFieldDefinition,
  adapter: OperationsWorkbookSheetAdapter<Row>,
  row: Row,
  rowIndex: number,
  permissions: Iterable<PermissionKey> | null | undefined,
): boolean {
  if (field.authority !== "ordinary-editable" && field.authority !== "conditionally-editable") return false;
  if (sheet.readiness !== "available" || !canReadOperationsWorkbookSheet(sheet, permissions)) return false;
  if (!sheet.authorization.writeAllOf?.length || !field.writeAllOf?.length) return false;
  if (!hasAllPermissions(permissions, sheet.authorization.writeAllOf || [])) return false;
  if (!hasAllPermissions(permissions, field.writeAllOf || [])) return false;
  if (!adapter.onSave || !adapter.applyDraftValue || !adapter.canEditField) return false;
  if (adapter.writeMode === "existing-domain" && sheet.capabilities.write !== "domain-delegated") return false;
  if (adapter.writeMode === "synthetic-demo" && adapter.dataScope !== "synthetic-demo") return false;
  if (adapter.writeMode === "none") return false;
  return adapter.canEditField(field, row, rowIndex, permissions);
}

function worksheetKind(type: OperationsWorkbookFieldType): WorksheetColumn<unknown>["kind"] {
  if (type === "identifier") return "text";
  if (type === "boolean") return "select";
  return type;
}

function isCellProtected(authority: OperationsWorkbookFieldAuthority) {
  return authority === "protected"
    || authority === "calculated"
    || authority === "source-evidence"
    || authority === "lifecycle-controlled"
    || authority === "workflow-only";
}

export function operationsWorkbookColumns<Row>(
  adapter: OperationsWorkbookSheetAdapter<Row>,
  permissions: Iterable<PermissionKey> | null | undefined,
): WorksheetColumn<Row>[] {
  return adapter.sheet.fields.map((field): WorksheetColumn<Row> => ({
    key: field.id,
    header: field.label,
    kind: worksheetKind(field.type),
    width: field.display?.width,
    minWidth: field.display?.minWidth,
    align: field.display?.align,
    frozen: field.display?.frozen,
    editable: (row, rowIndex) => canEditOperationsWorkbookField(adapter.sheet, field, adapter, row, rowIndex, permissions),
    protected: isCellProtected(field.authority),
    value: (row) => adapter.readValue(row, field.id),
    setValue: (row, value) => field.authority !== "ordinary-editable" && field.authority !== "conditionally-editable"
      ? row
      : adapter.applyDraftValue
        ? adapter.applyDraftValue(row, field.id, value)
        : row,
    options: field.type === "boolean"
      ? [{ value: "true", label: "Yes" }, { value: "false", label: "No" }]
      : adapter.selectOptionsForField
        ? (row, rowIndex) => adapter.selectOptionsForField?.(field, row, rowIndex) ?? field.options ?? []
        : field.options,
    currency: field.display?.currencyCode || (field.display?.currencyField
      ? (row) => String(adapter.readValue(row, field.display!.currencyField!) || "")
      : undefined),
    format: field.format || (field.type === "boolean"
      ? (value) => value === true ? "Yes" : value === false ? "No" : ""
      : undefined),
    parse: field.type === "boolean"
      ? (raw): WorksheetParseResult => {
        const normalized = raw.trim().toLowerCase();
        if (normalized === "true" || normalized === "yes") return { valid: true, value: true };
        if (normalized === "false" || normalized === "no") return { valid: true, value: false };
        return { valid: false, issue: { severity: "error", message: "Choose Yes or No." } };
      }
      : undefined,
    validate: field.validate
      ? (value, context: WorksheetCellContext<Row>) => field.validate!(value, context.row)
      : undefined,
  }));
}

export const OPERATIONS_WORKBOOK_PERMISSION_CATALOG = Object.freeze({
  projectRead: PERMISSION_KEYS.projectsRead,
  projectWrite: PERMISSION_KEYS.projectsWrite,
  payrollDetailRead: PERMISSION_KEYS.payrollRead,
});
