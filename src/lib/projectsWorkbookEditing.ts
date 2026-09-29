import type { Project, ProjectCostCode } from "../types.ts";
import { validateProjectCostCodeInput, type ProjectCostCodeApplyInput } from "./projectCostCodes.ts";
import type { ProjectsApplyGroup } from "./projectsWorkbook.ts";

export type ProjectControlsWorkbookSheetId = "projects" | "cost-codes";
export type ProjectControlsWorkbookRow = Project | ProjectCostCode;

export interface ProjectControlsWorkbookRecords {
  readonly projects: readonly Project[];
  readonly costCodes: readonly ProjectCostCode[];
}

export interface ProjectControlsWorkbookIssue {
  readonly rowId: string;
  readonly fieldId: string;
  readonly kind: "validation" | "conflict" | "access";
  readonly message: string;
}

export interface ProjectControlsWorkbookApplyPlan {
  readonly groups: readonly ProjectsApplyGroup[];
  readonly issues: readonly ProjectControlsWorkbookIssue[];
}

const PROJECT_EDITABLE_FIELDS = [
  "projectCode",
  "projectName",
  "description",
  "clientName",
  "clientReference",
  "billingContactName",
  "billingEmail",
  "billingAddress",
  "location",
  "siteAddress",
  "projectManager",
  "startDate",
  "targetEndDate",
  "actualEndDate",
  "contractValue",
  "projectBudget",
  "taxTreatment",
  "notes",
] as const;

const COST_CODE_EDITABLE_FIELDS = [
  "code",
  "name",
  "description",
  "approvedBudgetAmount",
  "forecastAmount",
] as const;

type ProjectEditableField = typeof PROJECT_EDITABLE_FIELDS[number];
type CostCodeEditableField = typeof COST_CODE_EDITABLE_FIELDS[number];

function optionalText(value: unknown): string {
  return String(value ?? "").trim();
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  return Number(value);
}

export function applyProjectWorkbookDraftValue(project: Project, fieldId: string, value: unknown): Project {
  switch (fieldId) {
    case "projectCode": return { ...project, projectCode: String(value ?? "").trim() };
    case "projectName": return { ...project, projectName: String(value ?? "") };
    case "description": return { ...project, description: optionalText(value) };
    case "clientName": return { ...project, clientName: optionalText(value) };
    case "clientReference": return { ...project, clientReference: optionalText(value) };
    case "billingContactName": return { ...project, billingContactName: optionalText(value) };
    case "billingEmail": return { ...project, billingEmail: optionalText(value) };
    case "billingAddress": return { ...project, billingAddress: optionalText(value) };
    case "location": return { ...project, location: optionalText(value) };
    case "siteAddress": return { ...project, siteAddress: optionalText(value) };
    case "projectManager": return { ...project, projectManager: optionalText(value) };
    case "startDate": return { ...project, startDate: optionalText(value) };
    case "targetEndDate": return { ...project, targetEndDate: optionalText(value) };
    case "actualEndDate": return { ...project, actualEndDate: optionalText(value) };
    case "contractValue": return { ...project, contractValue: optionalNumber(value) };
    case "projectBudget": return { ...project, projectBudget: optionalNumber(value) ?? Number.NaN };
    case "taxTreatment": return { ...project, taxTreatment: String(value ?? "").trim().toUpperCase() as Project["taxTreatment"] };
    case "notes": return { ...project, notes: optionalText(value) };
    default: return project;
  }
}

export function applyCostCodeWorkbookDraftValue(costCode: ProjectCostCode, fieldId: string, value: unknown): ProjectCostCode {
  switch (fieldId) {
    case "code": return { ...costCode, code: String(value ?? "").trim() };
    case "name": return { ...costCode, name: String(value ?? "") };
    case "description": return { ...costCode, description: optionalText(value) };
    case "approvedBudgetAmount": return { ...costCode, approvedBudgetAmount: optionalNumber(value) ?? Number.NaN };
    case "forecastAmount": return { ...costCode, forecastAmount: optionalNumber(value) };
    default: return costCode;
  }
}

function projectFieldValue(project: Project, field: ProjectEditableField): unknown {
  return field === "taxTreatment" ? project.taxTreatment || "UNCLASSIFIED" : project[field];
}

function normalizeProjectField(field: ProjectEditableField, value: unknown): unknown {
  switch (field) {
    case "projectCode": return String(value ?? "").trim().toUpperCase();
    case "projectName": return String(value ?? "").trim();
    case "description":
    case "clientName":
    case "clientReference":
    case "billingContactName":
    case "billingEmail":
    case "billingAddress":
    case "location":
    case "siteAddress":
    case "projectManager":
    case "notes":
    case "startDate":
    case "targetEndDate":
    case "actualEndDate":
      return optionalText(value);
    case "contractValue":
      return optionalNumber(value);
    case "projectBudget":
      return optionalNumber(value) ?? Number.NaN;
    case "taxTreatment":
      return String(value ?? "").trim().toUpperCase() || "UNCLASSIFIED";
  }
}

function costCodeFieldValue(costCode: ProjectCostCode, field: CostCodeEditableField): unknown {
  return costCode[field];
}

function normalizeCostCodeField(field: CostCodeEditableField, value: unknown): unknown {
  switch (field) {
    case "code": return String(value ?? "").trim().toUpperCase();
    case "name": return String(value ?? "").trim();
    case "description": return optionalText(value);
    case "approvedBudgetAmount": return optionalNumber(value) ?? Number.NaN;
    case "forecastAmount": return optionalNumber(value);
  }
}

function changedProjectFields(base: Project, staged: Project): ProjectEditableField[] {
  return PROJECT_EDITABLE_FIELDS.filter((field) => !Object.is(
    normalizeProjectField(field, projectFieldValue(base, field)),
    normalizeProjectField(field, projectFieldValue(staged, field)),
  ));
}

function changedCostCodeFields(base: ProjectCostCode, staged: ProjectCostCode): CostCodeEditableField[] {
  return COST_CODE_EDITABLE_FIELDS.filter((field) => !Object.is(
    normalizeCostCodeField(field, costCodeFieldValue(base, field)),
    normalizeCostCodeField(field, costCodeFieldValue(staged, field)),
  ));
}

function protectedProjectChanged(base: Project, staged: Project): boolean {
  return ["id", "userId", "status", "currency", "createdAt", "updatedAt", "archivedAt", "archivedFromStatus"]
    .some((field) => !Object.is((base as unknown as Record<string, unknown>)[field], (staged as unknown as Record<string, unknown>)[field]));
}

function protectedCostCodeChanged(base: ProjectCostCode, staged: ProjectCostCode): boolean {
  return ["id", "companyId", "projectId", "status", "createdByUserId", "updatedByUserId", "createdAt", "updatedAt", "archivedAt"]
    .some((field) => !Object.is((base as unknown as Record<string, unknown>)[field], (staged as unknown as Record<string, unknown>)[field]));
}

function issue(
  issues: ProjectControlsWorkbookIssue[],
  rowId: string,
  fieldId: string,
  kind: ProjectControlsWorkbookIssue["kind"],
  message: string,
) {
  issues.push({ rowId, fieldId, kind, message });
}

function dateIsValid(value: string | undefined): boolean {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validateProjectDraft(project: Project, base: Project, changedFields: readonly ProjectEditableField[], issues: ProjectControlsWorkbookIssue[]) {
  const changed = new Set(changedFields);
  if (!project.projectCode.trim()) issue(issues, project.id, "projectCode", "validation", "Project code is required.");
  if (!project.projectName.trim()) issue(issues, project.id, "projectName", "validation", "Project name is required.");

  if (changed.has("billingEmail") && project.billingEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(project.billingEmail)) {
    issue(issues, project.id, "billingEmail", "validation", "Enter a valid billing email or leave it blank.");
  }
  if (changed.has("contractValue") && project.contractValue !== undefined && (!Number.isFinite(project.contractValue) || project.contractValue < 0)) {
    issue(issues, project.id, "contractValue", "validation", "Contract value must be a valid non-negative number.");
  }
  if (!Number.isFinite(project.projectBudget) || project.projectBudget < 0) {
    issue(issues, project.id, "projectBudget", "validation", "Approved project budget is required and must be a valid non-negative number.");
  }

  for (const field of ["startDate", "targetEndDate", "actualEndDate"] as const) {
    if (changed.has(field) && !dateIsValid(project[field])) {
      issue(issues, project.id, field, "validation", "Enter a real date in YYYY-MM-DD format, or leave it blank.");
    }
  }

  const treatment = project.taxTreatment || "UNCLASSIFIED";
  if (changed.has("taxTreatment")) {
    if (!(treatment === "VAT" || treatment === "NON_VAT" || treatment === "UNCLASSIFIED")) {
      issue(issues, project.id, "taxTreatment", "validation", "Choose VAT, Non-VAT, or the existing Unclassified value.");
    } else if (treatment === "UNCLASSIFIED" && (base.taxTreatment || "UNCLASSIFIED") !== "UNCLASSIFIED") {
      issue(issues, project.id, "taxTreatment", "validation", "A classified project cannot be changed back to Unclassified.");
    }
  }
}

function copyProjectField(project: Project, staged: Project, field: ProjectEditableField): Project {
  const value = normalizeProjectField(field, projectFieldValue(staged, field));
  switch (field) {
    case "projectCode": return { ...project, projectCode: String(value ?? "").toUpperCase() };
    case "projectName": return { ...project, projectName: String(value ?? "") };
    case "description": return { ...project, description: value as string | undefined };
    case "clientName": return { ...project, clientName: value as string | undefined };
    case "clientReference": return { ...project, clientReference: value as string | undefined };
    case "billingContactName": return { ...project, billingContactName: value as string | undefined };
    case "billingEmail": return { ...project, billingEmail: value as string | undefined };
    case "billingAddress": return { ...project, billingAddress: value as string | undefined };
    case "location": return { ...project, location: value as string | undefined };
    case "siteAddress": return { ...project, siteAddress: value as string | undefined };
    case "projectManager": return { ...project, projectManager: value as string | undefined };
    case "startDate": return { ...project, startDate: value as string | undefined };
    case "targetEndDate": return { ...project, targetEndDate: value as string | undefined };
    case "actualEndDate": return { ...project, actualEndDate: value as string | undefined };
    case "contractValue": return { ...project, contractValue: value as number | undefined };
    case "projectBudget": return { ...project, projectBudget: value as number };
    case "taxTreatment": return { ...project, taxTreatment: value as Project["taxTreatment"] };
    case "notes": return { ...project, notes: value as string | undefined };
  }
}

function copyCostCodeField(costCode: ProjectCostCode, staged: ProjectCostCode, field: CostCodeEditableField): ProjectCostCode {
  const value = normalizeCostCodeField(field, costCodeFieldValue(staged, field));
  switch (field) {
    case "code": return { ...costCode, code: String(value ?? "").toUpperCase() };
    case "name": return { ...costCode, name: String(value ?? "") };
    case "description": return { ...costCode, description: value as string | undefined };
    case "approvedBudgetAmount": return { ...costCode, approvedBudgetAmount: value as number };
    case "forecastAmount": return { ...costCode, forecastAmount: value as number | undefined };
  }
}

function costCodeApplyInput(costCode: ProjectCostCode, expectedUpdatedAt: string): ProjectCostCodeApplyInput {
  return {
    id: costCode.id,
    projectId: costCode.projectId,
    code: costCode.code,
    name: costCode.name,
    description: costCode.description,
    approvedBudgetAmount: costCode.approvedBudgetAmount,
    forecastAmount: costCode.forecastAmount,
    status: costCode.status,
    updatedAt: expectedUpdatedAt,
  };
}

function issueFieldForCostCodeValidation(message: string): CostCodeEditableField {
  if (/name|work package/i.test(message)) return "name";
  if (/approved budget/i.test(message)) return "approvedBudgetAmount";
  if (/forecast/i.test(message)) return "forecastAmount";
  return "code";
}

export function buildProjectControlsWorkbookApplyPlan(input: {
  sheetId: ProjectControlsWorkbookSheetId;
  stagedRows: readonly ProjectControlsWorkbookRow[];
  baseRecords: ProjectControlsWorkbookRecords;
  currentRecords: ProjectControlsWorkbookRecords;
  expectedCompanyId?: string;
}): ProjectControlsWorkbookApplyPlan {
  const issues: ProjectControlsWorkbookIssue[] = [];
  const groups = new Map<string, ProjectsApplyGroup>();

  if (input.sheetId === "projects") {
    const baseById = new Map(input.baseRecords.projects.map((project) => [project.id, project]));
    const currentById = new Map(input.currentRecords.projects.map((project) => [project.id, project]));
    const seen = new Set<string>();
    const stagedProjectCodeOwner = new Map<string, string>();

    for (const candidate of input.stagedRows) {
      const staged = candidate as Project;
      if (seen.has(staged.id)) {
        issue(issues, staged.id, "projectCode", "validation", "Duplicate project rows cannot be applied.");
        continue;
      }
      seen.add(staged.id);
      const base = baseById.get(staged.id);
      const current = currentById.get(staged.id);
      if (!base || !current) {
        issue(issues, staged.id, "projectCode", "conflict", "This project is no longer available. Reload the Projects sheet before applying changes.");
        continue;
      }

      const changedFields = changedProjectFields(base, staged);
      if (changedFields.length === 0) continue;
      if (protectedProjectChanged(base, staged)) {
        issue(issues, staged.id, "projectCode", "access", "Project identity, lifecycle, currency, and version fields are protected.");
        continue;
      }
      if (!base.updatedAt || current.updatedAt !== base.updatedAt) {
        issue(issues, staged.id, "projectCode", "conflict", "This project changed after the sheet opened. Reload current data and review the row before applying changes.");
        continue;
      }

      let proposed = { ...current };
      for (const field of changedFields) proposed = copyProjectField(proposed, staged, field);
      validateProjectDraft(proposed, base, changedFields, issues);

      const normalizedProjectCode = proposed.projectCode.trim().toUpperCase();
      const duplicateCode = input.currentRecords.projects.find((project) =>
        project.id !== proposed.id && project.projectCode.trim().toUpperCase() === normalizedProjectCode);
      if (duplicateCode && changedFields.includes("projectCode")) {
        issue(issues, proposed.id, "projectCode", "validation", `Project code ${normalizedProjectCode} is already in use.`);
      }
      if (changedFields.includes("projectCode")) {
        const stagedOwner = stagedProjectCodeOwner.get(normalizedProjectCode);
        if (stagedOwner && stagedOwner !== proposed.id) {
          issue(issues, proposed.id, "projectCode", "validation", `Project code ${normalizedProjectCode} is proposed for more than one project.`);
        } else {
          stagedProjectCodeOwner.set(normalizedProjectCode, proposed.id);
        }
      }

      const activeBudget = input.currentRecords.costCodes
        .filter((costCode) => costCode.projectId === current.id && costCode.status === "ACTIVE")
        .reduce((total, costCode) => total + (Number(costCode.approvedBudgetAmount) || 0), 0);
      if (activeBudget > proposed.projectBudget + 0.01) {
        issue(issues, proposed.id, "projectBudget", "validation", `Active cost-code budgets (${activeBudget.toFixed(2)}) exceed the approved project budget (${proposed.projectBudget.toFixed(2)}).`);
      }

      groups.set(proposed.id, {
        project: proposed,
        expectedProjectUpdatedAt: base.updatedAt,
        costCodes: [],
      });
    }
  } else {
    const baseCodeById = new Map(input.baseRecords.costCodes.map((costCode) => [costCode.id, costCode]));
    const currentCodeById = new Map(input.currentRecords.costCodes.map((costCode) => [costCode.id, costCode]));
    const baseProjectById = new Map(input.baseRecords.projects.map((project) => [project.id, project]));
    const currentProjectById = new Map(input.currentRecords.projects.map((project) => [project.id, project]));
    const changedByProject = new Map<string, { proposed: ProjectCostCode; expectedUpdatedAt: string; changedFields: CostCodeEditableField[] }[]>();
    const seen = new Set<string>();

    for (const candidate of input.stagedRows) {
      const staged = candidate as ProjectCostCode;
      if (seen.has(staged.id)) {
        issue(issues, staged.id, "code", "validation", "Duplicate cost-code rows cannot be applied.");
        continue;
      }
      seen.add(staged.id);
      const base = baseCodeById.get(staged.id);
      const current = currentCodeById.get(staged.id);
      if (!base || !current) {
        issue(issues, staged.id, "code", "conflict", "This cost code is no longer available. Reload the Cost Codes sheet before applying changes.");
        continue;
      }
      const changedFields = changedCostCodeFields(base, staged);
      if (changedFields.length === 0) continue;
      if (protectedCostCodeChanged(base, staged)) {
        issue(issues, staged.id, "projectCode", "access", "Cost-code identity, project assignment, lifecycle, and version fields are protected.");
        continue;
      }
      if (input.expectedCompanyId && ((base.companyId && base.companyId !== input.expectedCompanyId) || (current.companyId && current.companyId !== input.expectedCompanyId))) {
        issue(issues, staged.id, "projectCode", "access", "This cost code is outside the active company scope.");
        continue;
      }
      if (current.projectId !== base.projectId || current.updatedAt !== base.updatedAt || !base.updatedAt) {
        issue(issues, staged.id, "code", "conflict", "This cost code changed after the sheet opened. Reload current data and review the row before applying changes.");
        continue;
      }
      const baseProject = baseProjectById.get(base.projectId);
      const currentProject = currentProjectById.get(base.projectId);
      if (!baseProject || !currentProject || currentProject.updatedAt !== baseProject.updatedAt || !baseProject.updatedAt) {
        issue(issues, staged.id, "projectCode", "conflict", "The parent project changed after the sheet opened. Reload current data and review the cost code before applying changes.");
        continue;
      }

      let proposed = { ...current };
      for (const field of changedFields) proposed = copyCostCodeField(proposed, staged, field);
      const rows = changedByProject.get(base.projectId) || [];
      rows.push({ proposed, expectedUpdatedAt: base.updatedAt, changedFields });
      changedByProject.set(base.projectId, rows);
    }

    for (const [projectId, changedRows] of changedByProject) {
      const project = currentProjectById.get(projectId);
      const baseProject = baseProjectById.get(projectId);
      if (!project || !baseProject) continue;
      const proposedById = new Map(changedRows.map((entry) => [entry.proposed.id, entry.proposed]));
      const proposedCodes = input.currentRecords.costCodes.map((costCode) => proposedById.get(costCode.id) || costCode);

      for (const entry of changedRows) {
        const validation = validateProjectCostCodeInput(entry.proposed, proposedCodes, project.projectBudget);
        for (const message of validation.issues) {
          issue(issues, entry.proposed.id, issueFieldForCostCodeValidation(message), "validation", message);
        }
      }

      const activeBudget = proposedCodes
        .filter((costCode) => costCode.projectId === projectId && costCode.status === "ACTIVE")
        .reduce((total, costCode) => total + (Number(costCode.approvedBudgetAmount) || 0), 0);
      if (activeBudget > project.projectBudget + 0.01) {
        for (const entry of changedRows.filter((candidate) => candidate.changedFields.includes("approvedBudgetAmount"))) {
          issue(issues, entry.proposed.id, "approvedBudgetAmount", "validation", `Active cost-code budgets (${activeBudget.toFixed(2)}) exceed the approved project budget (${project.projectBudget.toFixed(2)}).`);
        }
        if (!changedRows.some((entry) => entry.changedFields.includes("approvedBudgetAmount"))) {
          issue(issues, changedRows[0]!.proposed.id, "approvedBudgetAmount", "validation", `Active cost-code budgets (${activeBudget.toFixed(2)}) exceed the approved project budget (${project.projectBudget.toFixed(2)}).`);
        }
      }

      groups.set(projectId, {
        project,
        expectedProjectUpdatedAt: baseProject.updatedAt,
        costCodes: changedRows.map((entry) => costCodeApplyInput(entry.proposed, entry.expectedUpdatedAt)),
      });
    }
  }

  return {
    groups: issues.length ? [] : [...groups.values()],
    issues,
  };
}

export class ProjectControlsWorkbookApplyError extends Error {
  readonly kind: "validation" | "conflict" | "access" | "apply" | "context";
  readonly phase: "preflight" | "apply" | "post-apply";
  readonly issues: readonly ProjectControlsWorkbookIssue[];
  readonly appliedGroupCount: number;
  readonly allGroupsApplied: boolean;
  readonly originalError?: unknown;

  constructor(input: {
    kind: "validation" | "conflict" | "access" | "apply" | "context";
    phase?: "preflight" | "apply" | "post-apply";
    message: string;
    issues?: readonly ProjectControlsWorkbookIssue[];
    appliedGroupCount?: number;
    allGroupsApplied?: boolean;
    originalError?: unknown;
  }) {
    super(input.message);
    this.name = "ProjectControlsWorkbookApplyError";
    this.kind = input.kind;
    this.phase = input.phase || "preflight";
    this.issues = input.issues || [];
    this.appliedGroupCount = input.appliedGroupCount || 0;
    this.allGroupsApplied = input.allGroupsApplied || false;
    this.originalError = input.originalError;
  }
}

export type ProjectControlsWorkbookWriteMode = "none" | "existing-domain" | "synthetic-demo";

export async function saveProjectControlsWorkbookRows(input: {
  writeMode: ProjectControlsWorkbookWriteMode;
  sheetId: ProjectControlsWorkbookSheetId;
  stagedRows: readonly ProjectControlsWorkbookRow[];
  baseRecords: ProjectControlsWorkbookRecords;
  expectedCompanyId?: string;
  saveSyntheticRows?: (rows: readonly ProjectControlsWorkbookRow[]) => void | Promise<void>;
  refresh?: () => Promise<ProjectControlsWorkbookRecords>;
  applyGroup?: (group: ProjectsApplyGroup) => Promise<void>;
  isContextCurrent: () => boolean;
}): Promise<{ writeMode: Exclude<ProjectControlsWorkbookWriteMode, "none">; refreshedRecords: ProjectControlsWorkbookRecords; appliedGroupCount: number }> {
  if (input.writeMode === "none") {
    throw new ProjectControlsWorkbookApplyError({ kind: "access", message: "Project workbook editing is not available for this access profile." });
  }
  if (input.writeMode === "synthetic-demo") {
    if (!input.saveSyntheticRows) {
      throw new ProjectControlsWorkbookApplyError({ kind: "access", message: "Synthetic worksheet save is not configured." });
    }
    if (!input.isContextCurrent()) {
      throw new ProjectControlsWorkbookApplyError({ kind: "context", message: "Company or access changed during save. Reopen the workbook before editing." });
    }
    await input.saveSyntheticRows(input.stagedRows);
    return { writeMode: "synthetic-demo", refreshedRecords: input.baseRecords, appliedGroupCount: 0 };
  }
  if (!input.refresh || !input.applyGroup) {
    throw new ProjectControlsWorkbookApplyError({ kind: "access", message: "Project-domain persistence is not configured." });
  }
  const result = await applyProjectControlsWorkbookSheetDrafts({
    sheetId: input.sheetId,
    stagedRows: input.stagedRows,
    baseRecords: input.baseRecords,
    expectedCompanyId: input.expectedCompanyId,
    refresh: input.refresh,
    applyGroup: input.applyGroup,
    isContextCurrent: input.isContextCurrent,
  });
  return { ...result, writeMode: "existing-domain" };
}

export async function applyProjectControlsWorkbookSheetDrafts(input: {
  sheetId: ProjectControlsWorkbookSheetId;
  stagedRows: readonly ProjectControlsWorkbookRow[];
  baseRecords: ProjectControlsWorkbookRecords;
  expectedCompanyId?: string;
  refresh: () => Promise<ProjectControlsWorkbookRecords>;
  applyGroup: (group: ProjectsApplyGroup) => Promise<void>;
  isContextCurrent: () => boolean;
}): Promise<{ refreshedRecords: ProjectControlsWorkbookRecords; appliedGroupCount: number }> {
  const stagedPlan = buildProjectControlsWorkbookApplyPlan({
    sheetId: input.sheetId,
    stagedRows: input.stagedRows,
    baseRecords: input.baseRecords,
    currentRecords: input.baseRecords,
    expectedCompanyId: input.expectedCompanyId,
  });
  if (stagedPlan.issues.length) {
    const kind = stagedPlan.issues.some((candidate) => candidate.kind === "access") ? "access" : "validation";
    throw new ProjectControlsWorkbookApplyError({ kind, message: "Fix the highlighted worksheet issues before saving.", issues: stagedPlan.issues });
  }
  if (!stagedPlan.groups.length) return { refreshedRecords: input.baseRecords, appliedGroupCount: 0 };

  let latest: ProjectControlsWorkbookRecords;
  try {
    latest = await input.refresh();
  } catch (error) {
    throw new ProjectControlsWorkbookApplyError({ kind: "apply", phase: "preflight", message: "Could not refresh project data before saving.", originalError: error });
  }
  if (!input.isContextCurrent()) {
    throw new ProjectControlsWorkbookApplyError({ kind: "context", message: "Company or access changed during save. Reopen the workbook before editing." });
  }

  const freshPlan = buildProjectControlsWorkbookApplyPlan({
    sheetId: input.sheetId,
    stagedRows: input.stagedRows,
    baseRecords: input.baseRecords,
    currentRecords: latest,
    expectedCompanyId: input.expectedCompanyId,
  });
  if (freshPlan.issues.length) {
    const kind = freshPlan.issues.some((candidate) => candidate.kind === "conflict")
      ? "conflict"
      : freshPlan.issues.some((candidate) => candidate.kind === "access") ? "access" : "validation";
    throw new ProjectControlsWorkbookApplyError({
      kind,
      phase: "preflight",
      message: kind === "conflict" ? "Project data changed while you were editing. Review the refreshed rows before re-entering your changes." : "Fix the highlighted worksheet issues before saving.",
      issues: freshPlan.issues,
    });
  }

  let appliedGroupCount = 0;
  try {
    for (const group of freshPlan.groups) {
      if (!input.isContextCurrent()) {
        throw new ProjectControlsWorkbookApplyError({ kind: "context", message: "Company or access changed during save. Reopen the workbook before editing." });
      }
      await input.applyGroup(group);
      appliedGroupCount += 1;
    }
  } catch (error) {
    if (error instanceof ProjectControlsWorkbookApplyError) {
      throw new ProjectControlsWorkbookApplyError({
        ...error,
        kind: error.kind,
        phase: "apply",
        message: error.message,
        issues: error.issues,
        appliedGroupCount,
        allGroupsApplied: false,
        originalError: error.originalError,
      });
    }
    const message = error instanceof Error ? error.message : "";
    const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
    const budgetConflict = /active cost-code budgets/i.test(message);
    const duplicateConflict = code === "23505" || /already exists|duplicate key/i.test(message);
    const conflict = budgetConflict || duplicateConflict || /changed after|expected.version.mismatch|stale|conflict/i.test(message) || code === "40001";
    throw new ProjectControlsWorkbookApplyError({
      kind: conflict ? "conflict" : "apply",
      phase: "apply",
      message: budgetConflict
        ? "Active cost-code budgets changed before Apply. Reload and review the project budget allocation."
        : duplicateConflict
          ? "A project or cost-code identifier is already in use. Reload and choose a unique value."
          : conflict
            ? "Project data changed while saving. Reload current data and review the row before continuing."
        : "A project group could not be saved. Review current rows before trying again.",
      appliedGroupCount,
      originalError: error,
    });
  }

  if (!input.isContextCurrent()) {
    throw new ProjectControlsWorkbookApplyError({
      kind: "context",
      phase: "post-apply",
      message: "Company or access changed during save. Reopen the workbook before editing.",
      appliedGroupCount,
      allGroupsApplied: true,
    });
  }

  let refreshedRecords: ProjectControlsWorkbookRecords;
  try {
    refreshedRecords = await input.refresh();
  } catch (error) {
    throw new ProjectControlsWorkbookApplyError({
      kind: "apply",
      phase: "post-apply",
      message: "Changes were saved, but the workbook could not refresh. Reload the Projects workspace to confirm current data.",
      appliedGroupCount,
      allGroupsApplied: true,
      originalError: error,
    });
  }
  if (!input.isContextCurrent()) {
    throw new ProjectControlsWorkbookApplyError({
      kind: "context",
      phase: "post-apply",
      message: "Company or access changed during save. Reopen the workbook before editing.",
      appliedGroupCount,
      allGroupsApplied: true,
    });
  }
  return { refreshedRecords, appliedGroupCount };
}
