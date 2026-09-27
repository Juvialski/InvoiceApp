import {
  hasAnyPermission,
  PERMISSION_KEYS,
  type PermissionKey,
} from "../utils/accessControl.ts";
import {
  DEFAULT_WORKBOOK_PARSER_LIMITS,
  WorkbookImportError,
  exportOperationsWorkbook,
  parseOperationsWorkbook,
  type WorkbookCellValue,
  type WorkbookExportArtifact,
  type WorkbookSchema,
} from "./operationsWorkbook.ts";
import {
  PROJECTS_WORKBOOK_SCHEMA,
  applyProjectsImport,
  buildProjectsImportReview,
  exportProjectsWorkbook,
  type ProjectsApplyCallbacks,
  type ProjectsImportContext,
  type ProjectsImportReview,
  type ProjectsWorkbookExportInput,
} from "./projectsWorkbook.ts";
import {
  EXPENSES_WORKBOOK_SCHEMA,
  applyExpensesImport,
  buildExpensesImportReview,
  exportExpensesWorkbook,
  type ExpensesApplyCallbacks,
  type ExpensesImportContext,
  type ExpensesImportReview,
  type ExpensesWorkbookRecords,
} from "./expensesWorkbook.ts";
import {
  PROCUREMENT_WORKBOOK_SCHEMA,
  applyProcurementImport,
  buildProcurementImportReview,
  exportProcurementWorkbook,
  type ProcurementApplyCallbacks,
  type ProcurementImportContext,
  type ProcurementImportReview,
  type ProcurementWorkbookExportInput,
} from "./procurementWorkbook.ts";

export const COMBINED_OPERATIONS_WORKBOOK_VERSION = 1;
export const COMBINED_OPERATIONS_WORKBOOK_KIND = "HYDROQUALISENSE_COMBINED_OPERATIONS_WORKBOOK";
export const COMBINED_OPERATIONS_WORKBOOK_CONTRACT = "hydroqualisense.operations-workbook";

const SOURCE_DOMAIN_ID = "__wb2SourceDomainId";
const METADATA_ROW_KIND = "__wb2MetadataRowKind";
const SOURCE_ENTITY_PREFIX = "wb2:";
const WORKBOOK_META_SHEET = "_HydroQualiSense";

export type CombinedOperationsWorkbookDomainId = "projects" | "expenses" | "procurement";

export const COMBINED_OPERATIONS_WORKBOOK_SCHEMA: WorkbookSchema = Object.freeze({
  schemaVersion: COMBINED_OPERATIONS_WORKBOOK_VERSION,
  domain: "operations",
  workbookKind: COMBINED_OPERATIONS_WORKBOOK_KIND,
  metadataSheetName: WORKBOOK_META_SHEET,
  sheets: Object.freeze([
    ...PROJECTS_WORKBOOK_SCHEMA.sheets,
    ...EXPENSES_WORKBOOK_SCHEMA.sheets,
    ...PROCUREMENT_WORKBOOK_SCHEMA.sheets,
  ]),
});

const DOMAIN_ORDER: readonly CombinedOperationsWorkbookDomainId[] = Object.freeze([
  "projects",
  "expenses",
  "procurement",
]);

const DOMAIN_DEFINITIONS = {
  projects: {
    label: "Projects / Cost Codes",
    schema: PROJECTS_WORKBOOK_SCHEMA,
    readAnyOf: [PERMISSION_KEYS.projectsRead],
    writeAnyOf: [PERMISSION_KEYS.projectsWrite],
  },
  expenses: {
    label: "Expenses / Supplier Payables",
    schema: EXPENSES_WORKBOOK_SCHEMA,
    readAnyOf: [PERMISSION_KEYS.expensesRead, PERMISSION_KEYS.expensesWrite],
    writeAnyOf: [PERMISSION_KEYS.expensesWrite],
  },
  procurement: {
    label: "Procurement",
    schema: PROCUREMENT_WORKBOOK_SCHEMA,
    readAnyOf: [PERMISSION_KEYS.procurementRead],
    writeAnyOf: [PERMISSION_KEYS.procurementWrite],
  },
} satisfies Record<CombinedOperationsWorkbookDomainId, {
  label: string;
  schema: WorkbookSchema;
  readAnyOf: readonly PermissionKey[];
  writeAnyOf: readonly PermissionKey[];
}>;

export const COMBINED_OPERATIONS_WORKBOOK_READ_PERMISSIONS: readonly PermissionKey[] = Object.freeze([
  PERMISSION_KEYS.projectsRead,
  PERMISSION_KEYS.expensesRead,
  PERMISSION_KEYS.expensesWrite,
  PERMISSION_KEYS.procurementRead,
]);

export function canReadCombinedOperationsWorkbook(permissions: Iterable<PermissionKey> | null | undefined) {
  return hasAnyPermission(permissions, COMBINED_OPERATIONS_WORKBOOK_READ_PERMISSIONS);
}

function domainReadable(domain: CombinedOperationsWorkbookDomainId, permissions: Iterable<PermissionKey>) {
  return hasAnyPermission(permissions, DOMAIN_DEFINITIONS[domain].readAnyOf);
}

function domainWritable(domain: CombinedOperationsWorkbookDomainId, permissions: Iterable<PermissionKey>) {
  return hasAnyPermission(permissions, DOMAIN_DEFINITIONS[domain].writeAnyOf);
}

function projectReadAllowed(permissions: Iterable<PermissionKey>) {
  return hasAnyPermission(permissions, [PERMISSION_KEYS.projectsRead]);
}

function invoiceReadAllowed(permissions: Iterable<PermissionKey>) {
  return hasAnyPermission(permissions, [PERMISSION_KEYS.invoicesRead]);
}

function procurementReadAllowed(permissions: Iterable<PermissionKey>) {
  return hasAnyPermission(permissions, [PERMISSION_KEYS.procurementRead]);
}

function exportSheetNames(domain: CombinedOperationsWorkbookDomainId, permissions: Iterable<PermissionKey>): string[] {
  if (!domainReadable(domain, permissions)) return [];
  if (domain === "expenses") {
    return invoiceReadAllowed(permissions)
      ? ["Expenses", "Supplier Payables"]
      : ["Expenses"];
  }
  return [...DOMAIN_DEFINITIONS[domain].schema.sheets.map((sheet) => sheet.name)];
}

export interface CombinedOperationsWorkbookExportInput {
  permissions: Iterable<PermissionKey>;
  companyId?: string;
  projects: Omit<ProjectsWorkbookExportInput, "expectedCompanyId" | "fileName">;
  expenses: Omit<ExpensesWorkbookRecords, "expectedCompanyId">;
  procurement: Omit<ProcurementWorkbookExportInput, "companyId" | "fileName">;
  fileName?: string;
}

interface SourceDomainManifest {
  id: CombinedOperationsWorkbookDomainId;
  schemaVersion: number;
  domain: string;
  workbookKind: string;
  includedSheetNames: string[];
  workbookMetadataJson: string | null;
}

function asWorkbookRows(rows: readonly Record<string, unknown>[]) {
  return rows as unknown as readonly Readonly<Record<string, WorkbookCellValue>>[];
}

function safeExpensesRecords(
  records: Omit<ExpensesWorkbookRecords, "expectedCompanyId">,
  permissions: Iterable<PermissionKey>,
  expectedCompanyId: string | undefined,
): ExpensesWorkbookRecords {
  const canReadProjects = projectReadAllowed(permissions);
  const canReadPayables = invoiceReadAllowed(permissions);
  const canReadProcurement = procurementReadAllowed(permissions);
  return {
    ...records,
    expenses: canReadPayables ? records.expenses : records.expenses.filter((expense) => !expense.supplierInvoiceId),
    projects: canReadProjects ? records.projects : [],
    costCodes: canReadProjects ? records.costCodes : [],
    invoices: canReadPayables ? records.invoices : [],
    purchaseOrders: canReadProcurement ? records.purchaseOrders : [],
    expectedCompanyId,
  };
}

function safeProcurementRecords(
  records: Omit<ProcurementWorkbookExportInput, "companyId" | "fileName">,
  permissions: Iterable<PermissionKey>,
) {
  return {
    ...records,
    projects: projectReadAllowed(permissions) ? records.projects : [],
  };
}

function sourceManifestEntry(
  domain: CombinedOperationsWorkbookDomainId,
  includedSheetNames: string[],
  workbookMetadataJson: string | null,
): SourceDomainManifest {
  const schema = DOMAIN_DEFINITIONS[domain].schema;
  return {
    id: domain,
    schemaVersion: schema.schemaVersion,
    domain: schema.domain,
    workbookKind: schema.workbookKind,
    includedSheetNames,
    workbookMetadataJson,
  };
}

function assertExportWithinParserLimits(
  sheets: readonly { name: string; rows: readonly Record<string, unknown>[] }[],
  metadataRowCount: number,
) {
  const maxRows = DEFAULT_WORKBOOK_PARSER_LIMITS.maxRowsPerSheet;
  for (const sheet of sheets) {
    if (sheet.rows.length > maxRows) {
      throw new WorkbookImportError("SHEET_TOO_LARGE", `Sheet "${sheet.name}" exceeds the supported dimensions.`);
    }
  }
  if (metadataRowCount + 1 > maxRows) {
    throw new WorkbookImportError("SHEET_TOO_LARGE", "Combined workbook synchronization metadata exceeds the supported dimensions.");
  }
}

export function exportCombinedOperationsWorkbook(input: CombinedOperationsWorkbookExportInput): WorkbookExportArtifact {
  const permissions = [...input.permissions];
  const canReadProjects = domainReadable("projects", permissions);
  const canReadExpenses = domainReadable("expenses", permissions);
  const canReadProcurement = domainReadable("procurement", permissions);
  const exportedDomains = new Map<CombinedOperationsWorkbookDomainId, ReturnType<typeof parseOperationsWorkbook>>();

  if (canReadProjects) {
    const artifact = exportProjectsWorkbook({ ...input.projects, expectedCompanyId: input.companyId });
    exportedDomains.set("projects", parseOperationsWorkbook(artifact.bytes, { schema: PROJECTS_WORKBOOK_SCHEMA }));
  }
  if (canReadExpenses) {
    const records = safeExpensesRecords(input.expenses, permissions, input.companyId);
    const artifact = exportExpensesWorkbook(records);
    exportedDomains.set("expenses", parseOperationsWorkbook(artifact.bytes, { schema: EXPENSES_WORKBOOK_SCHEMA }));
  }
  if (canReadProcurement) {
    const records = safeProcurementRecords(input.procurement, permissions);
    const artifact = exportProcurementWorkbook({ ...records, companyId: input.companyId });
    exportedDomains.set("procurement", parseOperationsWorkbook(artifact.bytes, { schema: PROCUREMENT_WORKBOOK_SCHEMA }));
  }

  const manifest: SourceDomainManifest[] = DOMAIN_ORDER.map((domain) => {
    const parsed = exportedDomains.get(domain);
    const includedSheetNames = exportSheetNames(domain, permissions);
    return sourceManifestEntry(domain, includedSheetNames, parsed ? JSON.stringify(parsed.metadata) : null);
  });

  const sourceRows: Array<Readonly<Record<string, WorkbookCellValue>>> = [];
  for (const domain of DOMAIN_ORDER) {
    const parsed = exportedDomains.get(domain);
    if (!parsed) continue;
    for (const row of parsed.metadataRows) {
      const sourceEntity = String(row.entity || "");
      sourceRows.push({
        ...row,
        entity: sourceEntity ? `${SOURCE_ENTITY_PREFIX}${domain}:${sourceEntity}` : "",
        [SOURCE_DOMAIN_ID]: domain,
        [METADATA_ROW_KIND]: "SYNC",
      } as Readonly<Record<string, WorkbookCellValue>>);
    }
  }

  const sheets = COMBINED_OPERATIONS_WORKBOOK_SCHEMA.sheets.map((definition) => {
    const domain = DOMAIN_ORDER.find((candidate) => DOMAIN_DEFINITIONS[candidate].schema.sheets.some((sheet) => sheet.name === definition.name))!;
    const parsed = exportedDomains.get(domain);
    const allowedInExport = exportSheetNames(domain, permissions).includes(definition.name);
    const rows = allowedInExport ? parsed?.sheets[definition.name]?.rows || [] : [];
    return { name: definition.name, rows: asWorkbookRows(rows) };
  });
  assertExportWithinParserLimits(sheets, sourceRows.length);

  const canonicalSheetOrder = COMBINED_OPERATIONS_WORKBOOK_SCHEMA.sheets.map((sheet) => sheet.name);
  const artifact = exportOperationsWorkbook({
    schema: COMBINED_OPERATIONS_WORKBOOK_SCHEMA,
    metadata: {
      contractId: COMBINED_OPERATIONS_WORKBOOK_CONTRACT,
      contractVersion: COMBINED_OPERATIONS_WORKBOOK_VERSION,
      sheetOrder: JSON.stringify(canonicalSheetOrder),
      sourceManifest: JSON.stringify(manifest),
    },
    metadataRows: sourceRows,
    sheets,
    fileName: input.fileName || "HydroQualiSense_Operations_Workbook.xlsx",
  });
  if (artifact.bytes.byteLength > DEFAULT_WORKBOOK_PARSER_LIMITS.maxFileBytes) failure("FILE_TOO_LARGE");
  return artifact;
}

export interface CombinedOperationsWorkbookImportContext {
  permissions: Iterable<PermissionKey>;
  allowApply?: boolean;
  companyId?: string;
  projects: Omit<ProjectsImportContext, "canWrite">;
  expenses: Omit<ExpensesImportContext, "canWrite">;
  procurement: Omit<ProcurementImportContext, "canWrite">;
}

export interface CombinedOperationsWorkbookChange {
  field: string;
  currentValue: unknown;
  workbookValue: unknown;
  editable: boolean;
}

export interface CombinedOperationsWorkbookProposal {
  id: string;
  label: string;
  entity?: string;
  status: string;
  canApply: boolean;
  messages: readonly string[];
  changes: readonly CombinedOperationsWorkbookChange[];
}

export interface CombinedOperationsWorkbookSheetIssue {
  sheetName: string;
  state: "UNAUTHORIZED" | "NOT_INCLUDED";
  message: string;
}

interface DomainReviewBase<Id extends CombinedOperationsWorkbookDomainId, Review> {
  id: Id;
  label: string;
  state: "READY" | "UNAUTHORIZED" | "NOT_INCLUDED";
  canWrite: boolean;
  proposals: readonly CombinedOperationsWorkbookProposal[];
  changeCount: number;
  omittedRowCount: number;
  workbookWarnings: readonly string[];
  sheetIssues: readonly CombinedOperationsWorkbookSheetIssue[];
  sourceSupplierPayablesIncluded?: boolean;
  underlyingReview?: Review;
}

export type CombinedOperationsWorkbookDomainReview =
  | DomainReviewBase<"projects", ProjectsImportReview>
  | DomainReviewBase<"expenses", ExpensesImportReview>
  | DomainReviewBase<"procurement", ProcurementImportReview>;

export interface CombinedOperationsWorkbookImportReview {
  fileName?: string;
  domains: readonly CombinedOperationsWorkbookDomainReview[];
  workbookWarnings: readonly string[];
}

export interface CombinedOperationsWorkbookApplyCallbacks {
  projects?: ProjectsApplyCallbacks;
  expenses?: ExpensesApplyCallbacks;
  procurement?: ProcurementApplyCallbacks;
}

export interface CombinedOperationsWorkbookApplyResult {
  domainReview: CombinedOperationsWorkbookDomainReview;
  appliedProposalIds: readonly string[];
}

function failure(code: ConstructorParameters<typeof WorkbookImportError>[0]): never {
  const messages = {
    UNSUPPORTED_FORMAT: "Only non-macro .xlsx workbooks are supported.",
    FILE_TOO_LARGE: "Workbook exceeds the supported upload size.",
    TOO_MANY_SHEETS: "Workbook contains too many sheets.",
    SHEET_TOO_LARGE: "Workbook exceeds the supported sheet dimensions or cell text limit.",
    MALFORMED_WORKBOOK: "The workbook could not be read. Confirm that it is a valid, non-encrypted .xlsx file.",
    SCHEMA_MISMATCH: "Workbook structure or version does not match the supported Operations Workbook contract.",
    UNSAFE_CONTENT: "Workbook contains unsupported formulas or macro content.",
    EXTERNAL_LINK: "Workbooks with external links are not supported.",
    DUPLICATE_ID: "Workbook contains duplicate synchronization identities.",
  } satisfies Record<ConstructorParameters<typeof WorkbookImportError>[0], string>;
  throw new WorkbookImportError(code, messages[code]);
}

function parseManifest(value: unknown): SourceDomainManifest[] {
  if (typeof value !== "string") failure("SCHEMA_MISMATCH");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    failure("SCHEMA_MISMATCH");
  }
  if (!Array.isArray(parsed) || parsed.length !== DOMAIN_ORDER.length) failure("SCHEMA_MISMATCH");
  const manifests = parsed as Array<Record<string, unknown>>;
  const result: SourceDomainManifest[] = [];
  for (let index = 0; index < DOMAIN_ORDER.length; index += 1) {
    const expectedId = DOMAIN_ORDER[index]!;
    const expected = DOMAIN_DEFINITIONS[expectedId].schema;
    const item = manifests[index]!;
    if (item.id !== expectedId || Number(item.schemaVersion) !== expected.schemaVersion || item.domain !== expected.domain || item.workbookKind !== expected.workbookKind) {
      failure("SCHEMA_MISMATCH");
    }
    if (!Array.isArray(item.includedSheetNames) || item.includedSheetNames.some((name) => typeof name !== "string")) failure("SCHEMA_MISMATCH");
    const includedSheetNames = item.includedSheetNames as string[];
    const allowed = new Set(expected.sheets.map((sheet) => sheet.name));
    if (new Set(includedSheetNames).size !== includedSheetNames.length || includedSheetNames.some((name) => !allowed.has(name))) failure("SCHEMA_MISMATCH");
    const legalScopes = expectedId === "expenses"
      ? [[], ["Expenses"], ["Expenses", "Supplier Payables"]]
      : [[], [...expected.sheets.map((sheet) => sheet.name)]];
    if (!legalScopes.some((scope) => scope.length === includedSheetNames.length && scope.every((name, scopeIndex) => name === includedSheetNames[scopeIndex]))) failure("SCHEMA_MISMATCH");
    const metadataJson = item.workbookMetadataJson;
    if (includedSheetNames.length && typeof metadataJson !== "string") failure("SCHEMA_MISMATCH");
    if (!includedSheetNames.length && metadataJson !== null) failure("SCHEMA_MISMATCH");
    result.push({
      id: expectedId,
      schemaVersion: expected.schemaVersion,
      domain: expected.domain,
      workbookKind: expected.workbookKind,
      includedSheetNames: [...includedSheetNames],
      workbookMetadataJson: metadataJson as string | null,
    });
  }
  return result;
}

function sourceMetadata(manifest: SourceDomainManifest): Record<string, WorkbookCellValue> {
  if (!manifest.workbookMetadataJson) failure("SCHEMA_MISMATCH");
  let value: unknown;
  try {
    value = JSON.parse(manifest.workbookMetadataJson);
  } catch {
    failure("SCHEMA_MISMATCH");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) failure("SCHEMA_MISMATCH");
  if (Object.values(value as Record<string, unknown>).some((cell) =>
    !(cell === null || cell === undefined || cell instanceof Date || ["string", "number", "boolean"].includes(typeof cell)))) {
    failure("SCHEMA_MISMATCH");
  }
  return value as Record<string, WorkbookCellValue>;
}

function validateCombinedMetadata(parsed: ReturnType<typeof parseOperationsWorkbook>) {
  if (parsed.metadata.contractId !== COMBINED_OPERATIONS_WORKBOOK_CONTRACT || Number(parsed.metadata.contractVersion) !== COMBINED_OPERATIONS_WORKBOOK_VERSION) failure("SCHEMA_MISMATCH");
  const expectedOrder = COMBINED_OPERATIONS_WORKBOOK_SCHEMA.sheets.map((sheet) => sheet.name);
  let recordedOrder: unknown;
  try {
    recordedOrder = JSON.parse(String(parsed.metadata.sheetOrder || ""));
  } catch {
    failure("SCHEMA_MISMATCH");
  }
  if (!Array.isArray(recordedOrder) || recordedOrder.length !== expectedOrder.length || expectedOrder.some((name, index) => recordedOrder[index] !== name)) failure("SCHEMA_MISMATCH");
  const manifest = parseManifest(parsed.metadata.sourceManifest);
  const manifestIds = manifest.flatMap((item) => item.includedSheetNames);
  const allowedNames = new Set(expectedOrder);
  if (new Set(manifestIds).size !== manifestIds.length || manifestIds.some((name) => !allowedNames.has(name))) failure("SCHEMA_MISMATCH");
  for (const row of parsed.metadataRows) {
    const kind = String(row[METADATA_ROW_KIND] || "");
    const domain = String(row[SOURCE_DOMAIN_ID] || "");
    const entity = String(row.entity || "");
    if (kind !== "SYNC" || !DOMAIN_ORDER.includes(domain as CombinedOperationsWorkbookDomainId)) failure("SCHEMA_MISMATCH");
    if (entity && !entity.startsWith(`${SOURCE_ENTITY_PREFIX}${domain}:`)) failure("SCHEMA_MISMATCH");
    const source = manifest.find((item) => item.id === domain);
    if (!source?.includedSheetNames.length) failure("SCHEMA_MISMATCH");
  }
  return manifest;
}

function sourceRowsForDomain(
  parsed: ReturnType<typeof parseOperationsWorkbook>,
  domain: CombinedOperationsWorkbookDomainId,
  includedSheetNames: readonly string[],
) {
  const sheetSet = new Set(includedSheetNames);
  return parsed.metadataRows
    .filter((row) => row[SOURCE_DOMAIN_ID] === domain && row[METADATA_ROW_KIND] === "SYNC")
    .flatMap((row) => {
      const taggedEntity = String(row.entity || "");
      const entity = taggedEntity.startsWith(`${SOURCE_ENTITY_PREFIX}${domain}:`)
        ? taggedEntity.slice(`${SOURCE_ENTITY_PREFIX}${domain}:`.length)
        : "";
      if (domain === "expenses" && entity === "EXPENSE" && !sheetSet.has("Expenses")) return [];
      if (domain === "expenses" && entity === "SUPPLIER_PAYABLE" && !sheetSet.has("Supplier Payables")) return [];
      const clean = { ...row, entity } as Record<string, unknown>;
      delete clean[SOURCE_DOMAIN_ID];
      delete clean[METADATA_ROW_KIND];
      return [clean as Readonly<Record<string, WorkbookCellValue>>];
    });
}

function standaloneDomainBytes(
  parsed: ReturnType<typeof parseOperationsWorkbook>,
  manifest: SourceDomainManifest,
  currentlyIncludedSheetNames = manifest.includedSheetNames,
  fileName?: string,
  rowOverrides: Readonly<Record<string, readonly Record<string, unknown>[]>> = {},
) {
  const schema = DOMAIN_DEFINITIONS[manifest.id].schema;
  const allowed = new Set(currentlyIncludedSheetNames);
  const sheets = schema.sheets.map((definition) => ({
    name: definition.name,
    rows: allowed.has(definition.name)
      ? asWorkbookRows(rowOverrides[definition.name] || parsed.sheets[definition.name].rows)
      : [],
  }));
  const metadata = sourceMetadata(manifest);
  const metadataRows = sourceRowsForDomain(parsed, manifest.id, currentlyIncludedSheetNames);
  return exportOperationsWorkbook({
    schema,
    metadata,
    metadataRows,
    sheets,
    fileName: fileName || `HydroQualiSense_${manifest.id}_combined_import.xlsx`,
  }).bytes;
}

function emptyDomainReview(
  id: CombinedOperationsWorkbookDomainId,
  state: "UNAUTHORIZED" | "NOT_INCLUDED",
  canWrite = false,
  sheetIssues: readonly CombinedOperationsWorkbookSheetIssue[] = [],
): CombinedOperationsWorkbookDomainReview {
  return {
    id,
    label: DOMAIN_DEFINITIONS[id].label,
    state,
    canWrite,
    proposals: [],
    changeCount: 0,
    omittedRowCount: 0,
    workbookWarnings: [],
    sheetIssues,
  } as CombinedOperationsWorkbookDomainReview;
}

function projectDomainReview(review: ProjectsImportReview, canWrite: boolean): CombinedOperationsWorkbookDomainReview {
  const proposals = review.proposals.map((proposal) => ({
    id: proposal.id,
    label: proposal.label,
    entity: proposal.entity,
    status: proposal.status,
    canApply: proposal.canApply,
    messages: proposal.messages,
    changes: [
      ...proposal.changes.map((change) => ({
        field: change.field,
        currentValue: change.currentValue,
        workbookValue: change.workbookValue,
        editable: change.editable,
      })),
      ...proposal.costCodeChanges.map((change) => ({
        field: `Cost Code ${change.costCodeId} · ${change.field}`,
        currentValue: change.currentValue,
        workbookValue: change.workbookValue,
        editable: change.editable,
      })),
    ],
  }));
  return {
    id: "projects",
    label: DOMAIN_DEFINITIONS.projects.label,
    state: "READY",
    canWrite,
    proposals,
    changeCount: proposals.reduce((sum, proposal) => sum + proposal.changes.length, 0),
    omittedRowCount: review.omittedProjectIds.length + review.omittedCostCodeIds.length,
    workbookWarnings: review.workbookWarnings,
    sheetIssues: [],
    underlyingReview: review,
  };
}

function expensesDomainReview(
  review: ExpensesImportReview,
  canWrite: boolean,
  sheetIssues: readonly CombinedOperationsWorkbookSheetIssue[],
  sourceSupplierPayablesIncluded: boolean,
): CombinedOperationsWorkbookDomainReview {
  const proposals = review.proposals.map((proposal) => ({
    id: proposal.id,
    label: proposal.label,
    entity: proposal.entity,
    status: proposal.status,
    canApply: proposal.canApply,
    messages: proposal.messages,
    changes: proposal.changes.map((change) => ({
      field: change.field,
      currentValue: change.currentValue,
      workbookValue: change.workbookValue,
      editable: change.editable,
    })),
  }));
  return {
    id: "expenses",
    label: DOMAIN_DEFINITIONS.expenses.label,
    state: "READY",
    canWrite,
    proposals,
    changeCount: proposals.reduce((sum, proposal) => sum + proposal.changes.length, 0),
    omittedRowCount: review.omittedExpenseIds.length + review.omittedSupplierInvoiceIds.length,
    workbookWarnings: review.workbookWarnings,
    sheetIssues,
    sourceSupplierPayablesIncluded,
    underlyingReview: review,
  };
}

function procurementDomainReview(review: ProcurementImportReview, canWrite: boolean): CombinedOperationsWorkbookDomainReview {
  const proposals = review.proposals.map((proposal) => ({
    id: proposal.id,
    label: proposal.label,
    entity: proposal.entity,
    status: proposal.status,
    canApply: proposal.canApply,
    messages: proposal.messages,
    changes: [
      ...proposal.changes.map((change) => ({
        field: change.field,
        currentValue: change.currentValue,
        workbookValue: change.workbookValue,
        editable: change.editable,
      })),
      ...proposal.lineChanges.map((change) => ({
        field: `Line ${change.lineId} · ${change.field}`,
        currentValue: change.currentValue,
        workbookValue: change.workbookValue,
        editable: change.editable,
      })),
    ],
  }));
  return {
    id: "procurement",
    label: DOMAIN_DEFINITIONS.procurement.label,
    state: "READY",
    canWrite,
    proposals,
    changeCount: proposals.reduce((sum, proposal) => sum + proposal.changes.length, 0),
    omittedRowCount: review.omittedRecordIds.length,
    workbookWarnings: review.workbookWarnings,
    sheetIssues: [],
    underlyingReview: review,
  };
}

function reviewFileName(fileName: string | undefined, domain: CombinedOperationsWorkbookDomainId) {
  return fileName ? `${fileName.replace(/\.xlsx$/i, "")}_${domain}.xlsx` : undefined;
}

function safeProjectContext(context: CombinedOperationsWorkbookImportContext): ProjectsImportContext {
  const permitted = domainReadable("projects", context.permissions);
  return {
    ...context.projects,
    expectedCompanyId: context.projects.expectedCompanyId || context.companyId,
    projects: permitted ? context.projects.projects : [],
    costCodes: permitted ? context.projects.costCodes : [],
    canWrite: Boolean(context.allowApply !== false && domainWritable("projects", context.permissions)),
  };
}

function safeExpensesContext(context: CombinedOperationsWorkbookImportContext): ExpensesImportContext {
  const permitted = domainReadable("expenses", context.permissions);
  const records = safeExpensesRecords(context.expenses, context.permissions, context.expenses.expectedCompanyId || context.companyId);
  return {
    ...records,
    expenses: permitted ? records.expenses : [],
    canWrite: Boolean(context.allowApply !== false && domainWritable("expenses", context.permissions)),
  };
}

function safeProcurementContext(context: CombinedOperationsWorkbookImportContext): ProcurementImportContext {
  const permitted = domainReadable("procurement", context.permissions);
  return {
    ...safeProcurementRecords(context.procurement, context.permissions),
    rfqs: permitted ? context.procurement.rfqs : [],
    purchaseOrders: permitted ? context.procurement.purchaseOrders : [],
    expectedCompanyId: context.procurement.expectedCompanyId || context.companyId,
    canWrite: Boolean(context.allowApply !== false && domainWritable("procurement", context.permissions)),
  };
}

function domainSheets(domain: CombinedOperationsWorkbookDomainId) {
  return DOMAIN_DEFINITIONS[domain].schema.sheets.map((sheet) => sheet.name);
}

function rowsExist(parsed: ReturnType<typeof parseOperationsWorkbook>, sheetName: string) {
  return parsed.sheets[sheetName]?.rows.length > 0;
}

function missingSheetIssue(sheetName: string, state: "UNAUTHORIZED" | "NOT_INCLUDED"): CombinedOperationsWorkbookSheetIssue {
  return {
    sheetName,
    state,
    message: state === "UNAUTHORIZED"
      ? `${sheetName} was not reviewed for this access profile.`
      : `${sheetName} was not included in this export; its contents were not reviewed.`,
  };
}

function buildProjectDomain(
  parsed: ReturnType<typeof parseOperationsWorkbook>,
  manifest: SourceDomainManifest,
  context: CombinedOperationsWorkbookImportContext,
  fileName: string | undefined,
): CombinedOperationsWorkbookDomainReview {
  if (!domainReadable("projects", context.permissions)) return emptyDomainReview("projects", "UNAUTHORIZED");
  const included = domainSheets("projects").every((name) => manifest.includedSheetNames.includes(name));
  if (!included) return emptyDomainReview("projects", "NOT_INCLUDED", false, domainSheets("projects").filter(rowsExist.bind(null, parsed)).map((name) => missingSheetIssue(name, "NOT_INCLUDED")));
  const bytes = standaloneDomainBytes(parsed, manifest, domainSheets("projects"), reviewFileName(fileName, "projects"));
  const importContext = safeProjectContext(context);
  return projectDomainReview(buildProjectsImportReview(bytes, importContext, { fileName: reviewFileName(fileName, "projects") }), importContext.canWrite);
}

function buildExpensesDomain(
  parsed: ReturnType<typeof parseOperationsWorkbook>,
  manifest: SourceDomainManifest,
  context: CombinedOperationsWorkbookImportContext,
  fileName: string | undefined,
): CombinedOperationsWorkbookDomainReview {
  if (!domainReadable("expenses", context.permissions)) return emptyDomainReview("expenses", "UNAUTHORIZED");
  if (!manifest.includedSheetNames.includes("Expenses")) {
    return emptyDomainReview("expenses", "NOT_INCLUDED", false, rowsExist(parsed, "Expenses") ? [missingSheetIssue("Expenses", "NOT_INCLUDED")] : []);
  }
  const currentCanReadPayables = invoiceReadAllowed(context.permissions);
  const sourceIncludedPayables = manifest.includedSheetNames.includes("Supplier Payables");
  if (sourceIncludedPayables && !currentCanReadPayables) {
    return emptyDomainReview("expenses", "UNAUTHORIZED", false, [missingSheetIssue("Supplier Payables", "UNAUTHORIZED")]);
  }
  const reviewedPayables = currentCanReadPayables && sourceIncludedPayables;
  const restrictedExpenseReference = parsed.sheets.Expenses.rows.some((row) => String(row["Supplier Invoice"] || "").trim().length > 0);
  const sheetIssues = !currentCanReadPayables && (rowsExist(parsed, "Supplier Payables") || restrictedExpenseReference)
    ? [missingSheetIssue("Supplier Payables", "UNAUTHORIZED")]
    : !sourceIncludedPayables && rowsExist(parsed, "Supplier Payables")
      ? [missingSheetIssue("Supplier Payables", "NOT_INCLUDED")]
      : [];
  const currentSheetNames = ["Expenses", ...(reviewedPayables ? ["Supplier Payables"] : [])];
  const sanitizedExpenseRows = !currentCanReadPayables
    ? parsed.sheets.Expenses.rows.map((row) => ({ ...row, "Supplier Invoice": "" }))
    : parsed.sheets.Expenses.rows;
  const bytes = standaloneDomainBytes(
    parsed,
    manifest,
    currentSheetNames,
    reviewFileName(fileName, "expenses"),
    { Expenses: sanitizedExpenseRows },
  );
  const importContext = safeExpensesContext(context);
  const review = buildExpensesImportReview(bytes, importContext, { fileName: reviewFileName(fileName, "expenses") });
  return expensesDomainReview(review, importContext.canWrite, sheetIssues, sourceIncludedPayables);
}

function buildProcurementDomain(
  parsed: ReturnType<typeof parseOperationsWorkbook>,
  manifest: SourceDomainManifest,
  context: CombinedOperationsWorkbookImportContext,
  fileName: string | undefined,
): CombinedOperationsWorkbookDomainReview {
  if (!domainReadable("procurement", context.permissions)) return emptyDomainReview("procurement", "UNAUTHORIZED");
  const included = domainSheets("procurement").every((name) => manifest.includedSheetNames.includes(name));
  if (!included) return emptyDomainReview("procurement", "NOT_INCLUDED", false, domainSheets("procurement").filter((name) => rowsExist(parsed, name)).map((name) => missingSheetIssue(name, "NOT_INCLUDED")));
  const bytes = standaloneDomainBytes(parsed, manifest, domainSheets("procurement"), reviewFileName(fileName, "procurement"));
  const importContext = safeProcurementContext(context);
  return procurementDomainReview(buildProcurementImportReview(bytes, importContext, { fileName: reviewFileName(fileName, "procurement") }), importContext.canWrite);
}

export function buildCombinedOperationsWorkbookImportReview(
  input: ArrayBuffer | Uint8Array,
  context: CombinedOperationsWorkbookImportContext,
  options: { fileName?: string } = {},
): CombinedOperationsWorkbookImportReview {
  const accessContext = { ...context, permissions: [...context.permissions] };
  if (options.fileName && !/\.xlsx$/i.test(options.fileName)) failure("UNSUPPORTED_FORMAT");
  let parsed: ReturnType<typeof parseOperationsWorkbook>;
  try {
    parsed = parseOperationsWorkbook(input, { schema: COMBINED_OPERATIONS_WORKBOOK_SCHEMA, fileName: options.fileName });
  } catch (error) {
    if (error instanceof WorkbookImportError) failure(error.code);
    throw error;
  }
  const manifest = validateCombinedMetadata(parsed);
  const manifests = new Map(manifest.map((item) => [item.id, item]));
  const domains: CombinedOperationsWorkbookDomainReview[] = [
    buildProjectDomain(parsed, manifests.get("projects")!, accessContext, options.fileName),
    buildExpensesDomain(parsed, manifests.get("expenses")!, accessContext, options.fileName),
    buildProcurementDomain(parsed, manifests.get("procurement")!, accessContext, options.fileName),
  ];
  return {
    fileName: options.fileName,
    domains,
    workbookWarnings: ["Import creates review proposals only. Each domain is applied separately through its existing workflow."],
  };
}

function canReviewDomain(domain: CombinedOperationsWorkbookDomainId, context: CombinedOperationsWorkbookImportContext) {
  return domainReadable(domain, context.permissions);
}

export async function applyCombinedOperationsWorkbookDomain(
  review: CombinedOperationsWorkbookDomainReview,
  context: CombinedOperationsWorkbookImportContext,
  callbacks: CombinedOperationsWorkbookApplyCallbacks,
  selectedProposalIds: readonly string[],
): Promise<CombinedOperationsWorkbookApplyResult> {
  const accessContext = { ...context, permissions: [...context.permissions] };
  if (!canReviewDomain(review.id, accessContext)) throw new Error("Access changed. Import the workbook again under the current access profile.");
  if (!accessContext.allowApply && accessContext.allowApply !== undefined) throw new Error("Apply is disabled in synthetic demo mode.");
  if (!domainWritable(review.id, accessContext.permissions)) throw new Error(`You do not have permission to apply ${DOMAIN_DEFINITIONS[review.id].label} changes.`);
  if (review.state !== "READY" || !review.underlyingReview) throw new Error("This workbook section is not available to apply.");
  if (!selectedProposalIds.length) throw new Error("Select at least one reviewed change to apply.");

  if (review.id === "projects") {
    if (!callbacks.projects) throw new Error("Project workbook Apply is not configured.");
    const current = safeProjectContext(accessContext);
    const result = await applyProjectsImport(review.underlyingReview, current, callbacks.projects, selectedProposalIds);
    return {
      appliedProposalIds: result.appliedProposalIds,
      domainReview: projectDomainReview(result.refreshedReview, current.canWrite),
    };
  }
  if (review.id === "expenses") {
    if (!callbacks.expenses) throw new Error("Expense workbook Apply is not configured.");
    if (review.sourceSupplierPayablesIncluded && !invoiceReadAllowed(accessContext.permissions)) {
      throw new Error("Access changed. Import the workbook again under the current access profile.");
    }
    const current = safeExpensesContext(accessContext);
    const result = await applyExpensesImport(review.underlyingReview, current, callbacks.expenses, selectedProposalIds);
    return {
      appliedProposalIds: result.appliedProposalIds,
      domainReview: expensesDomainReview(result.refreshedReview, current.canWrite, review.sheetIssues, review.sourceSupplierPayablesIncluded || false),
    };
  }

  if (!callbacks.procurement) throw new Error("Procurement workbook Apply is not configured.");
  const current = safeProcurementContext(accessContext);
  const result = await applyProcurementImport(review.underlyingReview, current, callbacks.procurement, selectedProposalIds);
  return {
    appliedProposalIds: result.appliedProposalIds,
    domainReview: procurementDomainReview(result.refreshedReview, current.canWrite),
  };
}

export function refreshCombinedOperationsWorkbookDomainReview(
  review: CombinedOperationsWorkbookDomainReview,
  context: CombinedOperationsWorkbookImportContext,
): CombinedOperationsWorkbookDomainReview {
  const accessContext = { ...context, permissions: [...context.permissions] };
  if (!domainReadable(review.id, accessContext.permissions)) return emptyDomainReview(review.id, "UNAUTHORIZED");
  if (!review.underlyingReview) return review;
  if (review.id === "projects") {
    const current = safeProjectContext(accessContext);
    return projectDomainReview(buildProjectsImportReview(review.underlyingReview.bytes, current, { fileName: review.underlyingReview.fileName }), current.canWrite);
  }
  if (review.id === "expenses") {
    if (review.sourceSupplierPayablesIncluded && !invoiceReadAllowed(accessContext.permissions)) {
      return emptyDomainReview("expenses", "UNAUTHORIZED", false, [missingSheetIssue("Supplier Payables", "UNAUTHORIZED")]);
    }
    const current = safeExpensesContext(accessContext);
    const refreshed = buildExpensesImportReview(review.underlyingReview.bytes, current, { fileName: review.underlyingReview.fileName });
    return expensesDomainReview(refreshed, current.canWrite, review.sheetIssues, review.sourceSupplierPayablesIncluded || false);
  }
  const current = safeProcurementContext(accessContext);
  return procurementDomainReview(buildProcurementImportReview(review.underlyingReview.bytes, current, { fileName: review.underlyingReview.fileName }), current.canWrite);
}
