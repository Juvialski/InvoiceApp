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
    capabilities: { read: true, write: "read-only" },
    fields: [
      { id: "projectCode", label: "Project code", type: "identifier", authority: "read-only", display: { frozen: true, minWidth: "9rem" } },
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
      { id: "clientName", label: "Client", type: "text", authority: "read-only", display: { minWidth: "12rem" } },
      { id: "status", label: "Status", type: "select", authority: "lifecycle-controlled", options: projectStatusOptions, display: { minWidth: "9rem" } },
    ],
    emptyState: "No project rows are available in this workspace.",
    authorityBoundary: "Project records remain owned by the Projects domain; this WB-1 exemplar is read-only in production.",
  },
  {
    id: "cost-codes",
    name: "Cost Codes",
    shortName: "Cost codes",
    domainOwner: "projects",
    readiness: "foundation-only",
    authorization: { readAnyOf: [PERMISSION_KEYS.projectsRead], writeAllOf: [PERMISSION_KEYS.projectsWrite] },
    rowIdentity: { field: "id", label: "Cost code ID" },
    capabilities: { read: true, write: "domain-delegated" },
    fields: [
      { id: "code", label: "Code", type: "identifier", authority: "ordinary-editable", writeAllOf: [PERMISSION_KEYS.projectsWrite] },
      { id: "name", label: "Name", type: "text", authority: "ordinary-editable", writeAllOf: [PERMISSION_KEYS.projectsWrite] },
      { id: "approvedBudget", label: "Approved budget", type: "currency", authority: "ordinary-editable", writeAllOf: [PERMISSION_KEYS.projectsWrite], display: { align: "right", currencyField: "currency" } },
      { id: "actualCost", label: "Actual cost", type: "currency", authority: "calculated", display: { align: "right", currencyField: "currency" } },
      { id: "status", label: "Status", type: "select", authority: "lifecycle-controlled" },
    ],
    emptyState: "Cost Codes will be available after its domain adapter is enabled.",
    authorityBoundary: "Cost-code persistence and budget allocation remain with the Projects domain.",
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
    readiness: "future-adapter",
    authorization: { readAnyOf: [PERMISSION_KEYS.expensesRead], writeAllOf: [PERMISSION_KEYS.expensesWrite] },
    rowIdentity: { field: "id", label: "Expense ID" },
    capabilities: { read: true, write: "domain-delegated" },
    fields: [
      { id: "date", label: "Date", type: "date", authority: "conditionally-editable", writeAllOf: [PERMISSION_KEYS.expensesWrite] },
      { id: "category", label: "Category", type: "select", authority: "conditionally-editable", writeAllOf: [PERMISSION_KEYS.expensesWrite] },
      { id: "description", label: "Description", type: "text", authority: "conditionally-editable", writeAllOf: [PERMISSION_KEYS.expensesWrite] },
      { id: "amount", label: "Amount", type: "currency", authority: "conditionally-editable", writeAllOf: [PERMISSION_KEYS.expensesWrite], display: { align: "right", currencyField: "currency" } },
      { id: "status", label: "Status", type: "select", authority: "lifecycle-controlled" },
    ],
    emptyState: "Expenses are not onboarded to the unified workbook yet.",
    authorityBoundary: "Only eligible direct draft Expense fields may delegate to the existing Expense save path.",
  },
  {
    id: "rfqs",
    name: "RFQs",
    domainOwner: "procurement",
    readiness: "future-adapter",
    authorization: { readAnyOf: [PERMISSION_KEYS.procurementRead], writeAllOf: [PERMISSION_KEYS.procurementWrite] },
    rowIdentity: { field: "id", label: "RFQ ID" },
    capabilities: { read: true, write: "domain-delegated" },
    fields: [
      { id: "rfqNumber", label: "RFQ number", type: "identifier", authority: "read-only" },
      { id: "title", label: "Title", type: "text", authority: "ordinary-editable", writeAllOf: [PERMISSION_KEYS.procurementWrite] },
      { id: "dueDate", label: "Due date", type: "date", authority: "ordinary-editable", writeAllOf: [PERMISSION_KEYS.procurementWrite] },
      { id: "status", label: "Status", type: "select", authority: "workflow-only" },
    ],
    emptyState: "RFQs are not onboarded to the unified workbook yet.",
    authorityBoundary: "Quotation comparison, selection, issue, and cancellation remain procurement workflows.",
  },
  {
    id: "purchase-orders",
    name: "Purchase Orders",
    shortName: "Purchase orders",
    domainOwner: "procurement",
    readiness: "future-adapter",
    authorization: { readAnyOf: [PERMISSION_KEYS.procurementRead], writeAllOf: [PERMISSION_KEYS.procurementWrite] },
    rowIdentity: { field: "id", label: "Purchase Order ID" },
    capabilities: { read: true, write: "domain-delegated" },
    fields: [
      { id: "poNumber", label: "PO number", type: "identifier", authority: "read-only" },
      { id: "description", label: "Description", type: "text", authority: "ordinary-editable", writeAllOf: [PERMISSION_KEYS.procurementWrite] },
      { id: "total", label: "Total", type: "currency", authority: "calculated", display: { align: "right", currencyField: "currency" } },
      { id: "status", label: "Status", type: "select", authority: "workflow-only" },
    ],
    emptyState: "Purchase Orders are not onboarded to the unified workbook yet.",
    authorityBoundary: "Approval, issue, receiving, close, matching, settlement, and lifecycle remain explicit procurement workflows.",
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
export const OPERATIONS_WORKBOOK_ENABLED_ADAPTERS: readonly OperationsWorkbookSheetId[] = Object.freeze(["projects"]);

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
