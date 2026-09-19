import type { Project, ProjectCostCode, ProjectCostCodeStatus } from "../types.ts";
import {
  exportOperationsWorkbook,
  fingerprintValue,
  parseOperationsWorkbook,
  type ParsedOperationsWorkbook,
  type WorkbookCellValue,
  type WorkbookExportArtifact,
  type WorkbookSchema,
} from "./operationsWorkbook.ts";
import type { ProjectCostCodeApplyInput } from "./projectCostCodes.ts";

const PROJECT_HEADERS = [
  "Project Code", "Project Name", "Description", "Client Name", "Client Reference",
  "Billing Contact", "Billing Email", "Billing Address", "Location", "Site Address",
  "Project Manager", "Start Date", "Target End Date", "Actual End Date", "Contract Value",
  "Approved Project Budget", "Currency", "Tax Treatment", "Notes", "Status", "Actual Cost",
  "Committed Cost", "Billed", "Collected", "Outstanding Receivables", "Remaining to Bill",
  "Health", "__HQ Record ID", "__HQ Company ID", "__HQ Fingerprint", "__HQ Updated At",
] as const;

const COST_CODE_HEADERS = [
  "Project ID", "Project Code", "Code", "Work Package", "Description", "Approved Budget",
  "Forecast", "Status", "Actual Cost", "Committed Cost", "Variance", "__HQ Record ID",
  "__HQ Company ID", "__HQ Fingerprint", "__HQ Updated At", "__HQ Parent ID",
] as const;

const PROJECT_HIDDEN_HEADERS = ["__HQ Record ID", "__HQ Company ID", "__HQ Fingerprint", "__HQ Updated At"] as const;
const COST_CODE_HIDDEN_HEADERS = ["Project ID", "__HQ Record ID", "__HQ Company ID", "__HQ Fingerprint", "__HQ Updated At", "__HQ Parent ID"] as const;

export const PROJECTS_WORKBOOK_SCHEMA: WorkbookSchema = {
  schemaVersion: 1,
  domain: "projects",
  workbookKind: "PROJECT_CONTROLS_EDIT_UPDATE_ONLY",
  metadataSheetName: "_HydroQualiSense",
  sheets: [
    { name: "Projects", headers: PROJECT_HEADERS, hiddenHeaders: PROJECT_HIDDEN_HEADERS },
    { name: "Cost Codes", headers: COST_CODE_HEADERS, hiddenHeaders: COST_CODE_HIDDEN_HEADERS },
  ],
};

export type ProjectsProposalStatus =
  | "UNCHANGED"
  | "WORKBOOK_ONLY_CHANGE"
  | "APP_ONLY_CHANGE"
  | "STALE_CONFLICT"
  | "UNSUPPORTED_PROTECTED_FIELD"
  | "INVALID"
  | "UNAUTHORIZED"
  | "UNKNOWN_REFERENCE"
  | "UNSUPPORTED_NEW_RECORD";

export interface ProjectWorkbookFinancials {
  actualCost?: number;
  committedCost?: number;
  billed?: number;
  collected?: number;
  outstandingReceivables?: number;
  remainingToBill?: number;
  health?: string;
}

export interface CostCodeWorkbookFinancials {
  actualCost?: number;
  committedCost?: number;
  variance?: number;
}

export interface ProjectsWorkbookExportInput {
  projects: readonly Project[];
  costCodes: readonly ProjectCostCode[];
  expectedCompanyId?: string;
  financials?: Readonly<Record<string, ProjectWorkbookFinancials>>;
  costCodeFinancials?: Readonly<Record<string, CostCodeWorkbookFinancials>>;
  fileName?: string;
}

export interface ProjectsImportContext {
  expectedCompanyId?: string;
  projects: readonly Project[];
  costCodes: readonly ProjectCostCode[];
  financials?: Readonly<Record<string, ProjectWorkbookFinancials>>;
  costCodeFinancials?: Readonly<Record<string, CostCodeWorkbookFinancials>>;
  canWrite: boolean;
}

export interface ProjectsFieldChange {
  field: string;
  currentValue: unknown;
  workbookValue: unknown;
  exportedValue: unknown;
  editable: boolean;
}

export interface ProjectsProposal {
  id: string;
  entity: "PROJECT_GROUP";
  projectId: string;
  label: string;
  status: ProjectsProposalStatus;
  canApply: boolean;
  messages: string[];
  changes: ProjectsFieldChange[];
  costCodeChanges: Array<ProjectsFieldChange & { costCodeId: string }>;
  project?: Project;
  applyGroup?: ProjectsApplyGroup;
}

export interface ProjectsImportReview {
  bytes: Uint8Array;
  fileName?: string;
  proposals: ProjectsProposal[];
  omittedProjectIds: string[];
  omittedCostCodeIds: string[];
  workbookWarnings: string[];
}

export interface ProjectsApplyGroup {
  project: Project;
  expectedProjectUpdatedAt: string;
  costCodes: ProjectCostCodeApplyInput[];
}

export interface ProjectsApplyCallbacks {
  applyGroup: (group: ProjectsApplyGroup) => Promise<void>;
}

export interface ProjectsApplyResult {
  appliedProposalIds: string[];
  refreshedReview: ProjectsImportReview;
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
  const result = Number(typeof value === "string" ? value.replace(/,/g, "") : value);
  return Number.isFinite(result) ? result : undefined;
}

function dateValue(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString().slice(0, 10);
  }
  const result = String(value).trim();
  if (!result) return undefined;
  const parsed = new Date(result);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

function dateCell(value?: string): WorkbookCellValue {
  return value || null;
}

function numberCell(value: number | undefined): WorkbookCellValue {
  return value === undefined ? null : value;
}

function financialValue(value: number | undefined): WorkbookCellValue {
  return value === undefined ? "Unavailable" : value;
}

function stateForProject(project: Project, companyId: string | undefined, financials?: ProjectWorkbookFinancials) {
  return {
    id: project.id,
    companyId: companyId || null,
    projectCode: project.projectCode,
    projectName: project.projectName,
    description: project.description || null,
    clientName: project.clientName || null,
    clientReference: project.clientReference || null,
    billingContactName: project.billingContactName || null,
    billingEmail: project.billingEmail || null,
    billingAddress: project.billingAddress || null,
    location: project.location || null,
    siteAddress: project.siteAddress || null,
    projectManager: project.projectManager || null,
    status: project.status,
    startDate: project.startDate || null,
    targetEndDate: project.targetEndDate || null,
    actualEndDate: project.actualEndDate || null,
    contractValue: project.contractValue ?? null,
    projectBudget: project.projectBudget,
    currency: project.currency,
    taxTreatment: project.taxTreatment || null,
    notes: project.notes || null,
    updatedAt: project.updatedAt,
    financials: financials || {},
  };
}

function stateForCostCode(costCode: ProjectCostCode, companyId: string | undefined, financials?: CostCodeWorkbookFinancials) {
  return {
    id: costCode.id,
    companyId: companyId || costCode.companyId || null,
    projectId: costCode.projectId,
    code: costCode.code,
    name: costCode.name,
    description: costCode.description || null,
    status: costCode.status,
    approvedBudgetAmount: costCode.approvedBudgetAmount,
    forecastAmount: costCode.forecastAmount ?? null,
    updatedAt: costCode.updatedAt,
    financials: financials || {},
  };
}

function metadataRow(entity: string, recordId: string, parentId: string | undefined, companyId: string | undefined, state: unknown, updatedAt: string) {
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

export function exportProjectsWorkbook(input: ProjectsWorkbookExportInput): WorkbookExportArtifact {
  const companyId = input.expectedCompanyId;
  const metadataRows: Array<Record<string, WorkbookCellValue>> = [];
  const projectRows = input.projects.map((project) => {
    const financial = input.financials?.[project.id];
    const state = stateForProject(project, companyId, financial);
    metadataRows.push(metadataRow("PROJECT", project.id, undefined, companyId, state, project.updatedAt));
    return {
      "Project Code": project.projectCode,
      "Project Name": project.projectName,
      Description: project.description || null,
      "Client Name": project.clientName || null,
      "Client Reference": project.clientReference || null,
      "Billing Contact": project.billingContactName || null,
      "Billing Email": project.billingEmail || null,
      "Billing Address": project.billingAddress || null,
      Location: project.location || null,
      "Site Address": project.siteAddress || null,
      "Project Manager": project.projectManager || null,
      "Start Date": dateCell(project.startDate),
      "Target End Date": dateCell(project.targetEndDate),
      "Actual End Date": dateCell(project.actualEndDate),
      "Contract Value": numberCell(project.contractValue),
      "Approved Project Budget": project.projectBudget,
      Currency: project.currency,
      "Tax Treatment": project.taxTreatment || null,
      Notes: project.notes || null,
      Status: project.status,
      "Actual Cost": financialValue(financial?.actualCost),
      "Committed Cost": financialValue(financial?.committedCost),
      Billed: financialValue(financial?.billed),
      Collected: financialValue(financial?.collected),
      "Outstanding Receivables": financialValue(financial?.outstandingReceivables),
      "Remaining to Bill": financialValue(financial?.remainingToBill),
      Health: financial?.health || "Unavailable",
      "__HQ Record ID": project.id,
      "__HQ Company ID": companyId || project.userId || null,
      "__HQ Fingerprint": fingerprintValue(state),
      "__HQ Updated At": project.updatedAt,
    };
  });
  const costCodeRows = input.costCodes.map((costCode) => {
    const financial = input.costCodeFinancials?.[costCode.id];
    const state = stateForCostCode(costCode, companyId, financial);
    metadataRows.push(metadataRow("COST_CODE", costCode.id, costCode.projectId, companyId || costCode.companyId, state, costCode.updatedAt));
    const project = input.projects.find((candidate) => candidate.id === costCode.projectId);
    return {
      "Project ID": costCode.projectId,
      "Project Code": project?.projectCode || "Unknown",
      Code: costCode.code,
      "Work Package": costCode.name,
      Description: costCode.description || null,
      "Approved Budget": costCode.approvedBudgetAmount,
      Forecast: numberCell(costCode.forecastAmount),
      Status: costCode.status,
      "Actual Cost": financialValue(financial?.actualCost),
      "Committed Cost": financialValue(financial?.committedCost),
      Variance: financialValue(financial?.variance),
      "__HQ Record ID": costCode.id,
      "__HQ Company ID": companyId || costCode.companyId || null,
      "__HQ Fingerprint": fingerprintValue(state),
      "__HQ Updated At": costCode.updatedAt,
      "__HQ Parent ID": costCode.projectId,
    };
  });
  return exportOperationsWorkbook({
    schema: PROJECTS_WORKBOOK_SCHEMA,
    metadata: { companyId: companyId || null, exportMode: "EDIT_UPDATE_ONLY" },
    metadataRows,
    sheets: [
      { name: "Projects", rows: projectRows, hiddenHeaders: PROJECT_HIDDEN_HEADERS },
      { name: "Cost Codes", rows: costCodeRows, hiddenHeaders: COST_CODE_HIDDEN_HEADERS },
    ],
    fileName: input.fileName || "HydroQualiSense-Projects.xlsx",
  });
}

function equalValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || left === undefined || right === null || right === undefined) return !left && !right;
  if (typeof left === "number" || typeof right === "number") return Number(left) === Number(right);
  return String(left) === String(right);
}

function change(field: string, currentValue: unknown, workbookValue: unknown, exportedValue: unknown, editable: boolean): ProjectsFieldChange | undefined {
  return equalValue(currentValue, workbookValue) ? undefined : { field, currentValue, workbookValue, exportedValue, editable };
}

function parseState(value: MetadataRecord | undefined): Record<string, unknown> | undefined {
  return value?.state;
}

function projectFinancialDisplay(financials: ProjectWorkbookFinancials | undefined, key: keyof ProjectWorkbookFinancials): unknown {
  return financials?.[key] === undefined ? "Unavailable" : financials[key];
}

function costCodeFinancialDisplay(financials: CostCodeWorkbookFinancials | undefined, key: keyof CostCodeWorkbookFinancials): unknown {
  return financials?.[key] === undefined ? "Unavailable" : financials[key];
}

function projectProposal(
  row: Record<string, unknown>,
  project: Project | undefined,
  metadata: MetadataRecord | undefined,
  context: ProjectsImportContext,
): { proposal: ProjectsProposal; workbookChanged: boolean; appChanged: boolean } {
  const id = text(row["__HQ Record ID"]);
  const label = text(row["Project Code"]) || id || "Unknown project";
  const proposal: ProjectsProposal = {
    id: `PROJECT:${id || `ROW:${label}`}`,
    entity: "PROJECT_GROUP",
    projectId: id,
    label,
    status: "UNCHANGED",
    canApply: false,
    messages: [],
    changes: [],
    costCodeChanges: [],
  };
  if (!id) {
    proposal.status = "UNSUPPORTED_NEW_RECORD";
    proposal.messages.push("Rows without a stable Project ID are proposed-but-unsupported; create projects through the project workflow.");
    return { proposal, workbookChanged: true, appChanged: false };
  }
  if (!project) {
    proposal.status = "UNKNOWN_REFERENCE";
    proposal.messages.push("The workbook Project ID is not present in the authorized company context.");
    return { proposal, workbookChanged: true, appChanged: false };
  }
  if (context.expectedCompanyId && text(row["__HQ Company ID"]) !== context.expectedCompanyId) {
    proposal.status = "UNAUTHORIZED";
    proposal.messages.push("Workbook company identity is outside the active company scope.");
    return { proposal, workbookChanged: true, appChanged: false };
  }
  if (!metadata || metadata.entity !== "PROJECT" || metadata.recordId !== id || !metadata.state || !metadata.fingerprint) {
    proposal.status = "INVALID";
    proposal.messages.push("Project synchronization metadata is missing or invalid.");
    return { proposal, workbookChanged: true, appChanged: false };
  }
  if (metadata.parentId || (metadata.companyId && context.expectedCompanyId && metadata.companyId !== context.expectedCompanyId) || fingerprintValue(metadata.state) !== metadata.fingerprint || text(row["__HQ Fingerprint"]) !== metadata.fingerprint) {
    proposal.status = "INVALID";
    proposal.messages.push("Project synchronization metadata does not match its hidden fingerprint or company identity.");
    return { proposal, workbookChanged: true, appChanged: false };
  }
  const financial = context.financials?.[project.id];
  const currentState = stateForProject(project, context.expectedCompanyId, financial);
  const appChanged = fingerprintValue(currentState) !== metadata.fingerprint || (metadata.updatedAt && metadata.updatedAt !== project.updatedAt) || false;
  const exported = metadata.state;
  const proposed: Project = { ...project };
  const editableChanges: ProjectsFieldChange[] = [];
  const protectedChanges: ProjectsFieldChange[] = [];
  const parseEditableText = (field: string, header: string, current: string | undefined, assign: (value: string | undefined) => void, required = false) => {
    const workbookValue = nullableText(row[header]);
    if (required && !workbookValue) {
      proposal.status = "INVALID";
      proposal.messages.push(`${header} is required.`);
      return;
    }
    const next = change(field, current || null, workbookValue, exported[field] ?? null, true);
    if (next) editableChanges.push(next);
    assign(workbookValue || undefined);
  };
  parseEditableText("projectCode", "Project Code", project.projectCode, (value) => { if (value !== undefined) proposed.projectCode = value; }, true);
  parseEditableText("projectName", "Project Name", project.projectName, (value) => { if (value !== undefined) proposed.projectName = value; }, true);
  parseEditableText("description", "Description", project.description, (value) => { proposed.description = value; });
  parseEditableText("clientName", "Client Name", project.clientName, (value) => { proposed.clientName = value; });
  parseEditableText("clientReference", "Client Reference", project.clientReference, (value) => { proposed.clientReference = value; });
  parseEditableText("billingContactName", "Billing Contact", project.billingContactName, (value) => { proposed.billingContactName = value; });
  parseEditableText("billingEmail", "Billing Email", project.billingEmail, (value) => { proposed.billingEmail = value; });
  parseEditableText("billingAddress", "Billing Address", project.billingAddress, (value) => { proposed.billingAddress = value; });
  parseEditableText("location", "Location", project.location, (value) => { proposed.location = value; });
  parseEditableText("siteAddress", "Site Address", project.siteAddress, (value) => { proposed.siteAddress = value; });
  parseEditableText("projectManager", "Project Manager", project.projectManager, (value) => { proposed.projectManager = value; });
  parseEditableText("notes", "Notes", project.notes, (value) => { proposed.notes = value; });
  for (const [field, header, current] of [["startDate", "Start Date", project.startDate], ["targetEndDate", "Target End Date", project.targetEndDate], ["actualEndDate", "Actual End Date", project.actualEndDate]] as const) {
    const workbookValue = dateValue(row[header]) || null;
    const next = change(field, current || null, workbookValue, exported[field] ?? null, true);
    if (next) editableChanges.push(next);
    (proposed as unknown as Record<string, unknown>)[field] = workbookValue || undefined;
  }
  for (const [field, header, current] of [["contractValue", "Contract Value", project.contractValue], ["projectBudget", "Approved Project Budget", project.projectBudget]] as const) {
    const workbookValue = numberValue(row[header]);
    const invalid = workbookValue === undefined && row[header] !== null && row[header] !== "";
    if (invalid) {
      proposal.status = "INVALID";
      proposal.messages.push(`${header} must be a valid number.`);
      continue;
    }
    const nextValue = workbookValue === undefined ? (field === "projectBudget" ? 0 : null) : workbookValue;
    const next = change(field, current ?? null, nextValue, exported[field] ?? null, true);
    if (next) editableChanges.push(next);
    (proposed as unknown as Record<string, unknown>)[field] = workbookValue;
  }
  const taxTreatment = nullableText(row["Tax Treatment"])?.toUpperCase() || null;
  const taxChange = change("taxTreatment", project.taxTreatment || null, taxTreatment, exported.taxTreatment ?? null, true);
  if (taxChange) editableChanges.push(taxChange);
  if (taxTreatment === "VAT" || taxTreatment === "NON_VAT") proposed.taxTreatment = taxTreatment;
  const protectedFields: Array<[string, string, unknown, unknown]> = [
    ["status", "Status", project.status, text(row["Status"]).toUpperCase()],
    ["currency", "Currency", project.currency, text(row.Currency).toUpperCase()],
    ["actualCost", "Actual Cost", projectFinancialDisplay(financial, "actualCost"), row["Actual Cost"]],
    ["committedCost", "Committed Cost", projectFinancialDisplay(financial, "committedCost"), row["Committed Cost"]],
    ["billed", "Billed", projectFinancialDisplay(financial, "billed"), row.Billed],
    ["collected", "Collected", projectFinancialDisplay(financial, "collected"), row.Collected],
    ["outstandingReceivables", "Outstanding Receivables", projectFinancialDisplay(financial, "outstandingReceivables"), row["Outstanding Receivables"]],
    ["remainingToBill", "Remaining to Bill", projectFinancialDisplay(financial, "remainingToBill"), row["Remaining to Bill"]],
    ["health", "Health", financial?.health || "Unavailable", row.Health],
  ];
  for (const [field, header, current, workbookValue] of protectedFields) {
    const next = change(field, current, workbookValue, exported[field] ?? null, false);
    if (next) protectedChanges.push(next);
  }
  proposal.changes = [...editableChanges, ...protectedChanges];
  const workbookChanged = proposal.changes.length > 0;
  if (protectedChanges.length > 0) {
    proposal.status = "UNSUPPORTED_PROTECTED_FIELD";
    proposal.messages.push("One or more protected lifecycle, currency, or derived financial fields changed in the workbook.");
  } else if (proposal.status !== "INVALID" && workbookChanged && appChanged) {
    proposal.status = "STALE_CONFLICT";
    proposal.messages.push("The project changed in HydroQualiSense after export and the workbook also proposes changes.");
  } else if (proposal.status !== "INVALID" && workbookChanged) {
    proposal.status = "WORKBOOK_ONLY_CHANGE";
  } else if (appChanged) {
    proposal.status = "APP_ONLY_CHANGE";
    proposal.messages.push("The project changed in HydroQualiSense after export; no workbook change is available to apply.");
  }
  proposal.project = proposed;
  return { proposal, workbookChanged, appChanged };
}

function costCodeChangesForRow(row: Record<string, unknown>, code: ProjectCostCode, metadata: MetadataRecord | undefined, context: ProjectsImportContext) {
  const financial = context.costCodeFinancials?.[code.id];
  const parentProject = context.projects.find((project) => project.id === code.projectId);
  const exported = metadata?.state || {};
  const changes: Array<ProjectsFieldChange & { costCodeId: string }> = [];
  const add = (field: string, header: string, currentValue: unknown, workbookValue: unknown, editable: boolean) => {
    const next = change(field, currentValue, workbookValue, exported[field] ?? null, editable);
    if (next) changes.push({ ...next, costCodeId: code.id });
  };
  add("projectId", "Project ID", code.projectId, text(row["Project ID"]), false);
  add("projectCode", "Project Code", parentProject?.projectCode || null, text(row["Project Code"]), false);
  add("code", "Code", code.code, nullableText(row.Code), true);
  add("name", "Work Package", code.name, nullableText(row["Work Package"]), true);
  add("description", "Description", code.description || null, nullableText(row.Description), true);
  add("approvedBudgetAmount", "Approved Budget", code.approvedBudgetAmount, numberValue(row["Approved Budget"]), true);
  add("forecastAmount", "Forecast", code.forecastAmount ?? null, numberValue(row.Forecast), true);
  add("status", "Status", code.status, text(row.Status).toUpperCase(), false);
  add("actualCost", "Actual Cost", costCodeFinancialDisplay(financial, "actualCost"), row["Actual Cost"], false);
  add("committedCost", "Committed Cost", costCodeFinancialDisplay(financial, "committedCost"), row["Committed Cost"], false);
  add("variance", "Variance", costCodeFinancialDisplay(financial, "variance"), row.Variance, false);
  return changes;
}

export function buildProjectsImportReview(
  input: ArrayBuffer | Uint8Array,
  context: ProjectsImportContext,
  options: { fileName?: string } = {},
): ProjectsImportReview {
  const parsed = parseOperationsWorkbook(input, { schema: PROJECTS_WORKBOOK_SCHEMA, fileName: options.fileName });
  const metadata = metadataIndex(parsed);
  const projectsById = new Map(context.projects.map((project) => [project.id, project]));
  const costCodesById = new Map(context.costCodes.map((costCode) => [costCode.id, costCode]));
  const projectRows = parsed.sheets.Projects.rows;
  const costCodeRows = parsed.sheets["Cost Codes"].rows;
  const proposals = new Map<string, ProjectsProposal>();
  const workbookWarnings: string[] = [];
  const seenProjects = new Set<string>();
  const seenCostCodes = new Set<string>();
  const projectStates = new Map<string, { proposal: ProjectsProposal; workbookChanged: boolean; appChanged: boolean }>();
  const workbookCompanyId = nullableText(parsed.metadata.companyId);
  if (context.expectedCompanyId && workbookCompanyId && workbookCompanyId !== context.expectedCompanyId) workbookWarnings.push("Workbook company identity does not match the active company scope.");

  for (const row of projectRows) {
    const id = text(row["__HQ Record ID"]);
    if (id && seenProjects.has(id)) {
      const duplicate: ProjectsProposal = { id: `PROJECT:DUPLICATE:${id}`, entity: "PROJECT_GROUP", projectId: id, label: text(row["Project Code"]) || id, status: "INVALID", canApply: false, messages: ["Duplicate Project ID rows are not supported."], changes: [], costCodeChanges: [] };
      proposals.set(duplicate.id, duplicate);
      continue;
    }
    if (id) seenProjects.add(id);
    const state = projectProposal(row, projectsById.get(id), metadata.get(`PROJECT:${id}`), context);
    projectStates.set(id, state);
    proposals.set(state.proposal.id, state.proposal);
  }

  for (const row of costCodeRows) {
    const id = text(row["__HQ Record ID"]);
    const parentId = text(row["__HQ Parent ID"]) || text(row["Project ID"]);
    if (!id) {
      const proposal: ProjectsProposal = { id: `COST_CODE:NEW:${proposals.size}`, entity: "PROJECT_GROUP", projectId: parentId, label: text(row.Code) || "New cost code", status: "UNSUPPORTED_NEW_RECORD", canApply: false, messages: ["New cost codes are proposed-but-unsupported; create them through the project budget workflow."], changes: [], costCodeChanges: [] };
      proposals.set(proposal.id, proposal);
      continue;
    }
    if (seenCostCodes.has(id)) {
      const proposal = proposals.get(`PROJECT:${parentId}`);
      if (proposal) {
        proposal.status = "INVALID";
        proposal.canApply = false;
        proposal.messages.push(`Duplicate cost-code ID ${id} is not supported.`);
      }
      continue;
    }
    seenCostCodes.add(id);
    const code = costCodesById.get(id);
    const proposal = proposals.get(`PROJECT:${parentId}`);
    if (!proposal || !code || code.projectId !== parentId) {
      const unknown: ProjectsProposal = { id: `COST_CODE:${id}`, entity: "PROJECT_GROUP", projectId: parentId, label: text(row.Code) || id, status: "UNKNOWN_REFERENCE", canApply: false, messages: ["Cost-code identity or project parent is outside the authorized context."], changes: [], costCodeChanges: [] };
      proposals.set(unknown.id, unknown);
      continue;
    }
    const meta = metadata.get(`COST_CODE:${id}`);
    if (!meta || meta.parentId !== parentId || !meta.state || !meta.fingerprint || text(row["__HQ Company ID"]) !== (context.expectedCompanyId || text(row["__HQ Company ID"])) || fingerprintValue(meta.state) !== meta.fingerprint || text(row["__HQ Fingerprint"]) !== meta.fingerprint) {
      proposal.status = "INVALID";
      proposal.canApply = false;
      proposal.messages.push(`Cost-code synchronization metadata for ${code.code} is missing, tampered, or redirected.`);
      continue;
    }
    const currentState = stateForCostCode(code, context.expectedCompanyId, context.costCodeFinancials?.[code.id]);
    const appChanged = fingerprintValue(currentState) !== meta.fingerprint || (meta.updatedAt && meta.updatedAt !== code.updatedAt) || false;
    const changes = costCodeChangesForRow(row, code, meta, context);
    proposal.costCodeChanges.push(...changes);
    const protectedChange = changes.some((candidate) => !candidate.editable);
    const codeWorkbookChanged = changes.length > 0;
    const projectState = projectStates.get(parentId);
    if (projectState) {
      projectState.workbookChanged ||= codeWorkbookChanged;
      projectState.appChanged ||= appChanged;
    }
    if (protectedChange) {
      proposal.status = "UNSUPPORTED_PROTECTED_FIELD";
      proposal.canApply = false;
      proposal.messages.push(`Protected identity, lifecycle, or derived financial fields changed for ${code.code}.`);
    }
  }

  for (const [projectId, state] of projectStates) {
    const proposal = state.proposal;
    const project = projectsById.get(projectId);
    if (!project) continue;
    const codeChanges = proposal.costCodeChanges;
    const proposedCodes = context.costCodes.filter((code) => code.projectId === projectId).map((code) => {
      const changes = codeChanges.filter((candidate) => candidate.costCodeId === code.id);
      const proposed = { ...code };
      for (const candidate of changes) {
        if (!candidate.editable) continue;
        if (candidate.field === "code") proposed.code = String(candidate.workbookValue || "").trim().toUpperCase();
        if (candidate.field === "name") proposed.name = String(candidate.workbookValue || "").trim();
        if (candidate.field === "description") proposed.description = nullableText(candidate.workbookValue) || undefined;
        if (candidate.field === "approvedBudgetAmount") proposed.approvedBudgetAmount = numberValue(candidate.workbookValue) ?? code.approvedBudgetAmount;
        if (candidate.field === "forecastAmount") proposed.forecastAmount = numberValue(candidate.workbookValue);
      }
      return proposed;
    });
    const activeBudget = proposedCodes.filter((code) => code.status === "ACTIVE").reduce((sum, code) => sum + (Number(code.approvedBudgetAmount) || 0), 0);
    const proposedBudget = state.proposal.project?.projectBudget ?? project.projectBudget;
    if (activeBudget > proposedBudget + 0.01) {
      proposal.status = "INVALID";
      proposal.canApply = false;
      proposal.messages.push(`Active cost-code budgets (${activeBudget.toFixed(2)}) exceed the approved project budget (${proposedBudget.toFixed(2)}).`);
    }
    const protectedChange = proposal.changes.some((candidate) => !candidate.editable) || proposal.costCodeChanges.some((candidate) => !candidate.editable);
    const meaningfulChange = state.workbookChanged;
    if (!protectedChange && proposal.status !== "INVALID" && meaningfulChange && state.appChanged) {
      proposal.status = "STALE_CONFLICT";
      proposal.canApply = false;
      proposal.messages.push("The project or one of its cost codes changed in HydroQualiSense after export and the workbook also proposes changes.");
    } else if (!protectedChange && proposal.status !== "INVALID" && meaningfulChange) {
      proposal.status = "WORKBOOK_ONLY_CHANGE";
    } else if (!protectedChange && proposal.status !== "INVALID" && state.appChanged) {
      proposal.status = "APP_ONLY_CHANGE";
      proposal.canApply = false;
      proposal.messages.push("The project or one of its cost codes changed in HydroQualiSense after export.");
    } else if (!meaningfulChange && proposal.status === "UNCHANGED") {
      proposal.canApply = false;
    }
    if (proposal.status === "WORKBOOK_ONLY_CHANGE" && context.canWrite) {
      const proposedCostCodes: ProjectCostCodeApplyInput[] = proposedCodes
        .filter((code) => codeChanges.some((candidate) => candidate.costCodeId === code.id && candidate.editable))
        .map((code) => ({ id: code.id, projectId: code.projectId, code: code.code, name: code.name, description: code.description, approvedBudgetAmount: code.approvedBudgetAmount, forecastAmount: code.forecastAmount, status: code.status, updatedAt: context.costCodes.find((candidate) => candidate.id === code.id)?.updatedAt || "" }));
      proposal.applyGroup = { project: state.proposal.project || project, expectedProjectUpdatedAt: project.updatedAt, costCodes: proposedCostCodes };
      proposal.canApply = true;
    }
  }

  return {
    bytes: input instanceof Uint8Array ? input : new Uint8Array(input),
    fileName: options.fileName,
    proposals: [...proposals.values()],
    omittedProjectIds: context.projects.map((project) => project.id).filter((id) => !seenProjects.has(id)),
    omittedCostCodeIds: context.costCodes.map((code) => code.id).filter((id) => !seenCostCodes.has(id)),
    workbookWarnings,
  };
}

export async function applyProjectsImport(
  review: ProjectsImportReview,
  freshContext: ProjectsImportContext,
  callbacks: ProjectsApplyCallbacks,
  selectedProposalIds?: readonly string[],
): Promise<ProjectsApplyResult> {
  if (!freshContext.canWrite) throw new Error("You do not have permission to apply project workbook changes.");
  const freshReview = buildProjectsImportReview(review.bytes, freshContext, { fileName: review.fileName });
  const selected = selectedProposalIds ? [...selectedProposalIds] : freshReview.proposals.filter((proposal) => proposal.canApply).map((proposal) => proposal.id);
  const appliedProposalIds: string[] = [];
  for (const proposalId of selected) {
    const proposal = freshReview.proposals.find((candidate) => candidate.id === proposalId);
    if (!proposal || !proposal.canApply || !proposal.applyGroup) throw new Error(`Project workbook proposal ${proposalId} is stale or no longer safe to apply; review the current conflicts.`);
    await callbacks.applyGroup(proposal.applyGroup);
    appliedProposalIds.push(proposalId);
  }
  return { appliedProposalIds, refreshedReview: freshReview };
}
