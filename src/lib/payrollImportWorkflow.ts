import type {
  PayrollEntry,
  PayrollLaborContext,
  PayrollLaborContextType,
  PayrollPeriod,
  PayrollProjectAllocation,
  PayrollRun,
  Project,
  Worker,
} from "../types.ts";
import { applyPayrollColumnMappings, type ParsedPayrollRow, type ParsedPayrollWorkbook, type PayrollCellValue, type PayrollImportConfidenceLevel } from "./payrollImport.ts";
import {
  createLocalPayrollImportBatch,
  createLocalPayrollImportRow,
  type CanonicalPayrollImportField,
  type LaborContextType,
  type LaborCostContext,
  type PayrollImportBatch,
  type PayrollImportRow,
  type PayrollImportRowStatus,
} from "./payrollImportPersistence.ts";

export interface StagedPayrollImport {
  batch: PayrollImportBatch;
  rows: PayrollImportRow[];
}

export interface PayrollImportRowMatch {
  rowId: string;
  workerStatus: PayrollImportRow["workerMatchStatus"];
  workerId?: string;
  workerCandidates: Worker[];
  projectStatus: PayrollImportRow["projectMatchStatus"];
  projectId?: string;
  projectCandidates: Project[];
}

export interface PayrollImportCommitInput {
  batch: PayrollImportBatch;
  rows: PayrollImportRow[];
  periodStart: string;
  periodEnd: string;
  payDate?: string;
  existingPeriod?: PayrollPeriod;
}

export interface PayrollImportDraft {
  period: PayrollPeriod;
  run: PayrollRun;
  entries: PayrollEntry[];
  allocations: PayrollProjectAllocation[];
  committedRowIds: string[];
  skippedRowIds: string[];
}

export interface PayrollImportValidation {
  valid: boolean;
  issues: string[];
  readyRows: PayrollImportRow[];
}

function id(prefix: string) {
  return globalThis.crypto?.randomUUID?.() || `local-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function now() {
  return new Date().toISOString();
}

function normalizeIdentity(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokens(value: unknown) {
  return new Set(normalizeIdentity(value).split(" ").filter(Boolean));
}

function tokenSimilarity(left: unknown, right: unknown) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / Math.max(a.size, b.size);
}

function laborType(value: string): LaborContextType {
  return value === "PROJECT" || value === "ADMIN_OFFICE" || value === "GENERAL_OVERHEAD" ? value : "UNALLOCATED_REVIEW";
}

function payrollType(value: LaborContextType): PayrollLaborContextType {
  return value;
}

function rowCanonical(row: ParsedPayrollRow) {
  return {
    sourceSheet: row.sourceSheet,
    sourceRow: row.sourceRow,
    employeeCode: row.employeeCode,
    employeeName: row.employeeName,
    position: row.position,
    payType: row.payType,
    dailyRate: row.dailyRate,
    hourlyRate: row.hourlyRate,
    monthlyRate: row.monthlyRate,
    daysWorked: row.daysWorked,
    regularHours: row.regularHours,
    overtimeHours: row.overtimeHours,
    overtimeRate: row.overtimeRate,
    regularPayImported: row.regularPayImported,
    overtimePayImported: row.overtimePayImported,
    grossPayImported: row.grossPayImported,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    payDate: row.payDate,
    projectCode: row.projectCode,
    projectName: row.projectName,
    costContext: row.costContext,
    rawRow: row.rawRow,
    warnings: row.warnings,
    confidence: row.confidence,
    reconciliation: row.reconciliation,
  };
}

function contextForRow(row: ParsedPayrollRow, label?: string): LaborCostContext {
  const type = laborType(row.costContext);
  return {
    type,
    label: row.projectName || label,
    needsReview: type === "PROJECT" || type === "UNALLOCATED_REVIEW",
  };
}

function flattenSheets(parsed: ParsedPayrollWorkbook) {
  return parsed.sheets.filter((sheet) => sheet.status === "DETECTED").flatMap((sheet) => sheet.rows.map((row) => ({ row, sheet })));
}

export async function sha256Hex(bytes: Uint8Array) {
  if (!globalThis.crypto?.subtle) throw new Error("This browser cannot calculate a payroll file hash.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function stageParsedPayrollWorkbook(parsed: ParsedPayrollWorkbook, input: { fileName: string; fileSha256: string; fileSize?: number; mimeType?: string; storagePath?: string }): StagedPayrollImport {
  const detected = flattenSheets(parsed);
  const batch = createLocalPayrollImportBatch({
    originalFileName: input.fileName,
    fileSha256: input.fileSha256,
    fileSize: input.fileSize,
    mimeType: input.mimeType,
    storagePath: input.storagePath || `local/${input.fileName}`,
    sheetNames: parsed.sheetNames,
    status: "UPLOADED",
    mappingSnapshot: {
      sheets: parsed.sheets.filter((sheet) => sheet.table).map((sheet) => ({ sourceSheet: sheet.sourceSheet, signature: sheet.structureSignature, table: sheet.table })),
    },
    rawMetadata: Object.fromEntries(parsed.sheets.map((sheet) => [sheet.sourceSheet, sheet.metadata])),
    warnings: parsed.warnings.concat(parsed.sheets.flatMap((sheet) => sheet.warnings)),
    errors: [],
    committedPayrollPeriodId: undefined,
    committedPayrollRunId: undefined,
  });
  const rows = detected.map(({ row, sheet }) => createLocalPayrollImportRow({
    batchId: batch.id,
    sourceSheet: row.sourceSheet,
    sourceRow: row.sourceRow,
    originalEmployeeName: row.employeeName,
    canonicalData: rowCanonical(row),
    rawRow: row.rawRow,
    warnings: row.warnings,
    errors: [],
    confidenceLevel: row.confidence.level as PayrollImportConfidenceLevel,
    confidenceScore: row.confidence.score,
    status: "STAGED",
    workerMatchStatus: "UNMATCHED",
    projectMatchStatus: row.costContext === "PROJECT" ? "UNMATCHED" : "NOT_APPLICABLE",
    laborContext: contextForRow(row, sheet.context.label),
  }));
  return { batch, rows };
}

function updateRow(row: PayrollImportRow, patch: Partial<PayrollImportRow>): PayrollImportRow {
  return { ...row, ...patch, updatedAt: now() };
}

function bestWorkerMatches(row: PayrollImportRow, workers: Worker[]) {
  const code = normalizeIdentity(row.canonicalData.employeeCode);
  const name = normalizeIdentity(row.originalEmployeeName || row.canonicalData.employeeName);
  if (code) {
    const exactCode = workers.filter((worker) => normalizeIdentity(worker.employeeCode) === code);
    if (exactCode.length === 1) return { status: "MATCHED" as const, workerId: exactCode[0].id, candidates: exactCode };
    if (exactCode.length > 1) return { status: "AMBIGUOUS" as const, candidates: exactCode };
  }
  if (name) {
    const exactName = workers.filter((worker) => normalizeIdentity(worker.displayName) === name);
    if (exactName.length === 1) return { status: "MATCHED" as const, workerId: exactName[0].id, candidates: exactName };
    if (exactName.length > 1) return { status: "AMBIGUOUS" as const, candidates: exactName };
    const scored = workers.map((worker) => ({ worker, score: Math.max(tokenSimilarity(name, worker.displayName), tokenSimilarity(name, `${worker.firstName} ${worker.lastName}`)) }))
      .filter((item) => item.score >= 0.7)
      .sort((left, right) => right.score - left.score || left.worker.id.localeCompare(right.worker.id));
    if (scored.length && scored[0].score >= 0.86 && (!scored[1] || scored[0].score - scored[1].score >= 0.08)) return { status: "NEW_WORKER_SUGGESTED" as const, workerId: scored[0].worker.id, candidates: scored.slice(0, 3).map((item) => item.worker) };
    if (scored.length) return { status: "AMBIGUOUS" as const, candidates: scored.slice(0, 3).map((item) => item.worker) };
  }
  return { status: "UNMATCHED" as const, candidates: [] as Worker[] };
}

function bestProjectMatches(row: PayrollImportRow, projects: Project[]) {
  if (row.laborContext.type !== "PROJECT") return { status: "NOT_APPLICABLE" as const, candidates: [] as Project[] };
  const code = normalizeIdentity(row.canonicalData.projectCode);
  const name = normalizeIdentity(row.canonicalData.projectName || row.laborContext.label);
  if (code) {
    const exactCode = projects.filter((project) => normalizeIdentity(project.projectCode) === code);
    if (exactCode.length === 1) return { status: "MATCHED" as const, projectId: exactCode[0].id, candidates: exactCode };
    if (exactCode.length > 1) return { status: "AMBIGUOUS" as const, candidates: exactCode };
  }
  if (name) {
    const exactName = projects.filter((project) => normalizeIdentity(project.projectName) === name);
    if (exactName.length === 1) return { status: "MATCHED" as const, projectId: exactName[0].id, candidates: exactName };
    if (exactName.length > 1) return { status: "AMBIGUOUS" as const, candidates: exactName };
    const scored = projects.map((project) => ({ project, score: Math.max(tokenSimilarity(name, project.projectName), tokenSimilarity(name, project.projectCode)) }))
      .filter((item) => item.score >= 0.7)
      .sort((left, right) => right.score - left.score || left.project.id.localeCompare(right.project.id));
    if (scored.length && scored[0].score >= 0.84 && (!scored[1] || scored[0].score - scored[1].score >= 0.08)) return { status: "SUGGESTED" as const, projectId: scored[0].project.id, candidates: scored.slice(0, 3).map((item) => item.project) };
    if (scored.length) return { status: "AMBIGUOUS" as const, candidates: scored.slice(0, 3).map((item) => item.project) };
  }
  return { status: "UNMATCHED" as const, candidates: [] as Project[] };
}

export function applySavedPayrollTemplate(parsed: ParsedPayrollWorkbook, template: { structureSignature: string; fieldMappings: Array<{ columnIndex: number; canonicalField: CanonicalPayrollImportField | "IGNORE" }> }) {
  return {
    ...parsed,
    sheets: parsed.sheets.map((sheet) => {
      if (!sheet.table || sheet.structureSignature !== template.structureSignature) return sheet;
      const mappings = sheet.table.mappings.map((mapping) => {
        const saved = template.fieldMappings.find((candidate) => candidate.columnIndex === mapping.columnIndex);
        if (!saved) return mapping;
        return { ...mapping, field: saved.canonicalField === "IGNORE" ? undefined : saved.canonicalField, reason: "Loaded from a saved structural mapping template." };
      });
      const rows = sheet.rows.map((row) => {
        const mapped = applyPayrollColumnMappings(row.rawRow as PayrollCellValue[], mappings, { periodStart: row.periodStart, periodEnd: row.periodEnd, payDate: row.payDate, projectCode: row.projectCode, projectName: row.projectName, costContext: row.costContext });
        return { ...row, ...mapped, warnings: [...new Set([...row.warnings, "Mapping loaded from a saved structural template."])] };
      });
      return { ...sheet, table: { ...sheet.table, mappings }, rows };
    }),
  };
}
export function matchPayrollImportRows(rows: PayrollImportRow[], workers: Worker[], projects: Project[]) {
  const matches: PayrollImportRowMatch[] = [];
  const updatedRows = rows.map((row) => {
    const worker = bestWorkerMatches(row, workers);
    const project = bestProjectMatches(row, projects);
    const laborContext = project.projectId && project.status === "MATCHED" && row.laborContext.type === "PROJECT"
      ? { ...row.laborContext, projectId: project.projectId, needsReview: false }
      : row.laborContext;
    matches.push({ rowId: row.id, workerStatus: worker.status, workerId: worker.workerId, workerCandidates: worker.candidates, projectStatus: project.status, projectId: project.projectId, projectCandidates: project.candidates });
    return updateRow(row, {
      workerMatchStatus: worker.status,
      workerId: worker.workerId,
      projectMatchStatus: project.status,
      laborContext,
      warnings: [...new Set([...row.warnings, ...(worker.status === "AMBIGUOUS" ? ["Employee match is ambiguous and requires human selection."] : []), ...(project.status === "AMBIGUOUS" ? ["Project match is ambiguous and requires human selection."] : [])])],
    });
  });
  return { rows: updatedRows, matches };
}

export function updatePayrollImportRowDecision(row: PayrollImportRow, decision: { workerId?: string; projectId?: string; contextType?: LaborContextType; contextLabel?: string; status?: PayrollImportRowStatus }): PayrollImportRow {
  const type = decision.contextType || row.laborContext.type;
  const laborContext: LaborCostContext = {
    type,
    projectId: type === "PROJECT" ? decision.projectId || row.laborContext.projectId : undefined,
    costCenterId: type === "PROJECT" || type === "UNALLOCATED_REVIEW" ? undefined : row.laborContext.costCenterId,
    label: decision.contextLabel || row.laborContext.label,
    needsReview: type === "UNALLOCATED_REVIEW" || (type === "PROJECT" && !(decision.projectId || row.laborContext.projectId)),
  };
  return updateRow(row, {
    workerId: decision.workerId || row.workerId,
    workerMatchStatus: decision.workerId ? "MATCHED" : row.workerMatchStatus,
    projectMatchStatus: type === "PROJECT" ? (decision.projectId || row.laborContext.projectId ? "MATCHED" : "UNMATCHED") : "NOT_APPLICABLE",
    laborContext,
    status: decision.status || row.status,
  });
}

export function validatePayrollImportCommit(input: PayrollImportCommitInput): PayrollImportValidation {
  const issues: string[] = [];
  const readyRows = input.rows.filter((row) => row.status !== "SKIPPED");
  if (!input.periodStart || !input.periodEnd || input.periodEnd < input.periodStart) issues.push("Choose a valid payroll period before committing the import.");
  if (!readyRows.length) issues.push("At least one payroll row must be ready to import.");
  const workerIds = new Set<string>();
  for (const row of readyRows) {
    if (!row.workerId || row.workerMatchStatus !== "MATCHED") issues.push(`${row.originalEmployeeName || `Source row ${row.sourceRow}`} needs a confirmed worker match.`);
    if (row.workerId && workerIds.has(row.workerId)) issues.push(`Worker ${row.originalEmployeeName || row.workerId} appears more than once in this payroll import.`);
    if (row.workerId) workerIds.add(row.workerId);
    if (row.laborContext.type === "PROJECT" && (!row.laborContext.projectId || row.projectMatchStatus !== "MATCHED" || row.laborContext.needsReview)) issues.push(`${row.originalEmployeeName || `Source row ${row.sourceRow}`} needs a confirmed project before commit.`);
    if (row.laborContext.type === "UNALLOCATED_REVIEW" && !row.laborContext.needsReview) issues.push(`${row.originalEmployeeName || `Source row ${row.sourceRow}`} must remain marked for review when unallocated.`);
  }
  return { valid: issues.length === 0, issues, readyRows };
}

function importedAmounts(row: PayrollImportRow) {
  const data = row.canonicalData;
  const regularPay = data.regularPayImported ?? (data.dailyRate !== undefined && data.daysWorked !== undefined ? data.dailyRate * data.daysWorked : data.hourlyRate !== undefined && data.regularHours !== undefined ? data.hourlyRate * data.regularHours : data.monthlyRate ?? 0);
  const overtimePay = data.overtimePayImported ?? 0;
  const grossPay = data.grossPayImported ?? regularPay + overtimePay;
  return { regularPay: Math.round(regularPay * 100) / 100, overtimePay: Math.round(overtimePay * 100) / 100, grossPay: Math.round(grossPay * 100) / 100 };
}

export function buildDraftPayrollFromImport(input: PayrollImportCommitInput): PayrollImportDraft {
  const validation = validatePayrollImportCommit(input);
  if (!validation.valid) throw new Error(validation.issues.join(" "));
  const timestamp = now();
  const period = input.existingPeriod || {
    id: id("payroll-period"),
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    payDate: input.payDate,
    status: "DRAFT" as const,
    notes: `Imported from ${input.batch.originalFileName}`,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const run: PayrollRun = { id: id("payroll-run"), periodId: period.id, importBatchId: input.batch.id, status: "DRAFT", createdAt: timestamp, notes: `Imported from ${input.batch.originalFileName}` };
  const entries: PayrollEntry[] = [];
  const allocations: PayrollProjectAllocation[] = [];
  const committedRowIds: string[] = [];
  for (const row of validation.readyRows) {
    const amounts = importedAmounts(row);
    const projectLabor = row.laborContext.type === "PROJECT" && row.laborContext.projectId && !row.laborContext.needsReview;
    const entry: PayrollEntry = {
      id: id("payroll-entry"),
      payrollRunId: run.id,
      workerId: row.workerId!,
      basePay: amounts.regularPay,
      regularPay: amounts.regularPay,
      overtimePay: amounts.overtimePay,
      allowances: 0,
      grossPay: amounts.grossPay,
      deductions: 0,
      netPay: amounts.grossPay,
      projectAllocatedCost: projectLabor ? amounts.grossPay : 0,
      costContext: { type: payrollType(row.laborContext.type), projectId: row.laborContext.projectId, costCenterId: row.laborContext.costCenterId, label: row.laborContext.label, needsReview: row.laborContext.needsReview },
      importRowId: row.id,
      calculationSnapshot: {
        version: "PAYROLL_IMPORT_V1",
        source: "PAYROLL_SPREADSHEET_IMPORT",
        importBatchId: input.batch.id,
        importRowId: row.id,
        sourceSheet: row.sourceSheet,
        sourceRow: row.sourceRow,
        importedAmounts: amounts,
        reconciliation: row.canonicalData.reconciliation,
        originalEmployeeName: row.originalEmployeeName,
        costContext: row.laborContext,
      },
      createdAt: timestamp,
    };
    entries.push(entry);
    if (projectLabor) allocations.push({ id: id("payroll-allocation"), payrollEntryId: entry.id, projectId: row.laborContext.projectId!, allocationAmount: amounts.grossPay, allocationPercentage: 100, source: "IMPORT" });
    committedRowIds.push(row.id);
  }
  return { period, run, entries, allocations, committedRowIds, skippedRowIds: input.rows.filter((row) => row.status === "SKIPPED").map((row) => row.id) };
}
