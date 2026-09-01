import type { PayrollEntry, PayrollPeriod, PayrollProjectAllocation, PayrollRun } from "../types.ts";
import { supabase } from "./supabase.ts";
import { companyStoragePath, requireActiveCompanyId } from "./companyContext.ts";
import { safeStorageSegment, validatePayrollImportBytes } from "./fileSecurity.ts";

export type PayrollImportBatchStatus = "UPLOADED" | "MAPPED" | "VALIDATED" | "COMMITTED" | "FAILED" | "VOIDED";
export type PayrollImportRowStatus = "STAGED" | "READY" | "SKIPPED" | "COMMITTED" | "ERROR";
export type PayrollImportConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";
export type PayrollImportMatchStatus = "MATCHED" | "NEW_WORKER_SUGGESTED" | "AMBIGUOUS" | "UNMATCHED";
export type PayrollProjectMatchStatus = "MATCHED" | "SUGGESTED" | "AMBIGUOUS" | "UNMATCHED" | "NOT_APPLICABLE";
export type LaborContextType = "PROJECT" | "ADMIN_OFFICE" | "GENERAL_OVERHEAD" | "UNALLOCATED_REVIEW";
export type LaborCostCenterType = "ADMIN_OFFICE" | "GENERAL_OVERHEAD" | "EQUIPMENT_WORKSHOP" | "WAREHOUSE" | "OTHER";

export type CanonicalPayrollImportField =
  | "employeeCode"
  | "employeeName"
  | "position"
  | "payType"
  | "dailyRate"
  | "hourlyRate"
  | "monthlyRate"
  | "daysWorked"
  | "regularHours"
  | "overtimeHours"
  | "overtimeRate"
  | "regularPayImported"
  | "overtimePayImported"
  | "grossPayImported"
  | "periodStart"
  | "periodEnd"
  | "payDate"
  | "projectCode"
  | "projectName"
  | "costContext";

export interface LaborCostContext {
  type: LaborContextType;
  projectId?: string;
  costCenterId?: string;
  label?: string;
  needsReview: boolean;
}

export interface LaborCostCenter {
  id: string;
  userId?: string;
  code: string;
  name: string;
  type: LaborCostCenterType;
  description?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface CanonicalPayrollImportRow {
  sourceSheet: string;
  sourceRow: number;
  employeeCode?: string;
  employeeName?: string;
  position?: string;
  payType?: "MONTHLY" | "DAILY" | "HOURLY";
  dailyRate?: number;
  hourlyRate?: number;
  monthlyRate?: number;
  daysWorked?: number;
  regularHours?: number;
  overtimeHours?: number;
  overtimeRate?: number;
  regularPayImported?: number;
  overtimePayImported?: number;
  grossPayImported?: number;
  periodStart?: string;
  periodEnd?: string;
  payDate?: string;
  projectCode?: string;
  projectName?: string;
  costContext: LaborContextType;
  rawRow: unknown[];
  reconciliation?: unknown;
  warnings: string[];
  confidence: {
    level: PayrollImportConfidenceLevel;
    score: number;
    reasons: string[];
  };
}

export interface PayrollImportColumnMappingSnapshot {
  columnIndex: number;
  sourceHeader: string;
  normalizedHeader?: string;
  canonicalField: CanonicalPayrollImportField | "IGNORE";
  confidence?: number;
}

export interface PayrollImportMappingSnapshot {
  sourceSheet: string;
  headerRow: number;
  dataStartRow?: number;
  dataEndRow?: number;
  columns: PayrollImportColumnMappingSnapshot[];
  metadataMappings?: Record<string, unknown>;
}

export interface PayrollImportBatch {
  id: string;
  userId?: string;
  originalFileName: string;
  fileSha256: string;
  fileSize?: number;
  mimeType?: string;
  storagePath: string;
  storageProvider?: string;
  storageBucket?: string;
  sheetNames: string[];
  detectedTemplateId?: string;
  duplicateOfBatchId?: string;
  status: PayrollImportBatchStatus;
  mappingSnapshot: Record<string, unknown>;
  rawMetadata: Record<string, unknown>;
  warnings: string[];
  errors: string[];
  committedPayrollPeriodId?: string;
  committedPayrollRunId?: string;
  createdAt: string;
  updatedAt: string;
  committedAt?: string;
  voidedAt?: string;
}


export interface PayrollImportRow {
  id: string;
  userId?: string;
  batchId: string;
  sourceSheet: string;
  sourceRow: number;
  originalEmployeeName?: string;
  canonicalData: CanonicalPayrollImportRow;
  rawRow: unknown[];
  warnings: string[];
  errors: string[];
  confidenceLevel: PayrollImportConfidenceLevel;
  confidenceScore: number;
  status: PayrollImportRowStatus;
  workerMatchStatus: PayrollImportMatchStatus;
  workerId?: string;
  projectMatchStatus: PayrollProjectMatchStatus;
  laborContext: LaborCostContext;
  committedWorkEntryId?: string;
  committedPayrollEntryId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollImportTemplate {
  id: string;
  userId?: string;
  name: string;
  structureSignature: string;
  fieldMappings: PayrollImportColumnMappingSnapshot[];
  headerConfiguration: Record<string, unknown>;
  metadataMappings: Record<string, unknown>;
  contextRules: Record<string, unknown>;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface PayrollImportWorkspaceData {
  costCenters: LaborCostCenter[];
  batches: PayrollImportBatch[];
  rows: PayrollImportRow[];
  templates: PayrollImportTemplate[];
}

export interface PayrollImportPersistence {
  load(): Promise<PayrollImportWorkspaceData>;
  findDuplicates(fileSha256: string): Promise<PayrollImportBatch[]>;
  saveCostCenter(costCenter: LaborCostCenter): Promise<LaborCostCenter>;
  saveBatch(batch: PayrollImportBatch): Promise<PayrollImportBatch>;
  saveRows(rows: PayrollImportRow[]): Promise<PayrollImportRow[]>;
  saveTemplate(template: PayrollImportTemplate): Promise<PayrollImportTemplate>;
}

const COST_CENTERS_STORAGE_KEY = "engineering_labor_cost_centers";
const IMPORT_BATCHES_STORAGE_KEY = "engineering_payroll_import_batches";
const IMPORT_ROWS_STORAGE_KEY = "engineering_payroll_import_rows";
const IMPORT_TEMPLATES_STORAGE_KEY = "engineering_payroll_import_templates";
const PAYROLL_IMPORT_BUCKET = "payroll-import-sources";
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

const BATCH_TRANSITIONS: Readonly<Record<PayrollImportBatchStatus, readonly PayrollImportBatchStatus[]>> = {
  UPLOADED: ["MAPPED", "FAILED", "VOIDED"],
  MAPPED: ["VALIDATED", "FAILED", "VOIDED"],
  VALIDATED: ["MAPPED", "COMMITTED", "FAILED", "VOIDED"],
  COMMITTED: ["VOIDED"],
  FAILED: ["UPLOADED", "MAPPED", "VOIDED"],
  VOIDED: [],
};

function id(prefix: string) {
  return globalThis.crypto?.randomUUID?.() || `local-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function persistedId(value: string | undefined, prefix: string) {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : id(prefix);
}

function text(value: unknown) {
  return value === null || value === undefined ? undefined : String(value);
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function bool(value: unknown, fallback = true) {
  return value === null || value === undefined ? fallback : Boolean(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function localJson<T>(key: string, storage: Storage | undefined): T[] {
  if (!storage) return [];
  try { return JSON.parse(storage.getItem(key) || "[]") as T[]; } catch { return []; }
}

function writeJson<T>(key: string, value: T[], storage: Storage | undefined) {
  try { storage?.setItem(key, JSON.stringify(value)); } catch { /* local demo storage can be full */ }
}

function normalizeSha256(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) throw new Error("Payroll import file hash must be a lowercase SHA-256 value.");
  return normalized;
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "payroll-source";
}

export function validateLaborCostContext(context: LaborCostContext): string[] {
  const issues: string[] = [];
  if (context.type === "PROJECT") {
    if (!context.needsReview && !context.projectId) issues.push("Project labor requires a confirmed project.");
    if (context.costCenterId) issues.push("Project labor cannot also target a non-project cost center.");

  } else if (context.type === "UNALLOCATED_REVIEW") {
    if (context.projectId || context.costCenterId) issues.push("Unallocated labor cannot carry a project or cost center assignment.");
    if (!context.needsReview) issues.push("Unallocated labor must remain marked for review.");
  } else {
    if (context.projectId) issues.push("Non-project labor cannot carry a project assignment.");
  }
  return issues;
}

export function canTransitionPayrollImportBatch(from: PayrollImportBatchStatus, to: PayrollImportBatchStatus) {
  return from === to || BATCH_TRANSITIONS[from].includes(to);
}

export function findDuplicatePayrollImportBatches(batches: PayrollImportBatch[], fileSha256: string) {
  const normalized = normalizeSha256(fileSha256);
  return batches.filter((batch) => batch.status !== "VOIDED" && batch.fileSha256.toLowerCase() === normalized);
}

export function validatePayrollImportRow(row: PayrollImportRow): string[] {
  const issues = validateLaborCostContext(row.laborContext);
  if (!row.sourceSheet.trim()) issues.push("Payroll import row requires a source sheet.");
  if (!Number.isInteger(row.sourceRow) || row.sourceRow < 1) issues.push("Payroll import source row must be a positive integer.");
  if (row.confidenceScore < 0 || row.confidenceScore > 1) issues.push("Payroll import confidence must be between 0 and 1.");
  if ((row.status === "READY" || row.status === "COMMITTED") && !row.workerId) issues.push("Ready payroll import rows require a confirmed worker.");
  if ((row.status === "READY" || row.status === "COMMITTED") && row.laborContext.type === "PROJECT" && (row.laborContext.needsReview || !row.laborContext.projectId)) issues.push("Ready project labor requires a confirmed project.");
  if (row.status === "COMMITTED" && !row.committedWorkEntryId && !row.committedPayrollEntryId) issues.push("Committed payroll import rows require a created payroll or work record.");
  return issues;
}

export function readPayrollImportWorkspaceFromLocal(storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage): PayrollImportWorkspaceData {
  return {
    costCenters: localJson<LaborCostCenter>(COST_CENTERS_STORAGE_KEY, storage),
    batches: localJson<PayrollImportBatch>(IMPORT_BATCHES_STORAGE_KEY, storage),
    rows: localJson<PayrollImportRow>(IMPORT_ROWS_STORAGE_KEY, storage),
    templates: localJson<PayrollImportTemplate>(IMPORT_TEMPLATES_STORAGE_KEY, storage),
  };
}

export function writePayrollImportWorkspaceToLocal(data: PayrollImportWorkspaceData, storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage) {
  writeJson(COST_CENTERS_STORAGE_KEY, data.costCenters, storage);
  writeJson(IMPORT_BATCHES_STORAGE_KEY, data.batches, storage);
  writeJson(IMPORT_ROWS_STORAGE_KEY, data.rows, storage);
  writeJson(IMPORT_TEMPLATES_STORAGE_KEY, data.templates, storage);
}

export function createLocalLaborCostCenter(input: Omit<LaborCostCenter, "id" | "createdAt" | "updatedAt">): LaborCostCenter {
  const now = new Date().toISOString();
  return { ...input, id: id("cost-center"), createdAt: now, updatedAt: now };
}

export function createLocalPayrollImportBatch(input: Omit<PayrollImportBatch, "id" | "createdAt" | "updatedAt" | "fileSha256"> & { fileSha256: string }): PayrollImportBatch {
  const now = new Date().toISOString();
  return { ...input, fileSha256: normalizeSha256(input.fileSha256), id: id("payroll-import"), createdAt: now, updatedAt: now };
}

export function createLocalPayrollImportRow(input: Omit<PayrollImportRow, "id" | "createdAt" | "updatedAt">): PayrollImportRow {
  const issues = validatePayrollImportRow({ ...input, id: "pending", createdAt: "", updatedAt: "" });
  if (issues.length) throw new Error(issues.join(" "));
  const now = new Date().toISOString();
  return { ...input, id: id("payroll-import-row"), createdAt: now, updatedAt: now };
}

export function createLocalPayrollImportTemplate(input: Omit<PayrollImportTemplate, "id" | "createdAt" | "updatedAt">): PayrollImportTemplate {
  const now = new Date().toISOString();
  return { ...input, id: id("payroll-import-template"), createdAt: now, updatedAt: now };
}

function costCenterFromRow(row: Record<string, unknown>): LaborCostCenter {
  return {
    id: String(row.id), userId: text(row.user_id), code: String(row.code || ""), name: String(row.name || ""),
    type: String(row.cost_center_type || "OTHER") as LaborCostCenterType, description: text(row.description), active: bool(row.active),
    createdAt: String(row.created_at || new Date().toISOString()), updatedAt: String(row.updated_at || new Date().toISOString()), archivedAt: text(row.archived_at),
  };
}

function batchFromRow(row: Record<string, unknown>): PayrollImportBatch {
  return {
    id: String(row.id), userId: text(row.user_id), originalFileName: String(row.original_filename || ""), fileSha256: String(row.file_sha256 || ""),
    fileSize: row.file_size === null ? undefined : numberValue(row.file_size), mimeType: text(row.mime_type), storagePath: String(row.storage_path || ""),
    storageProvider: text(row.storage_provider) || "supabase", storageBucket: text(row.storage_bucket) || "payroll-import-sources",
    sheetNames: stringArray(row.sheet_names),
    detectedTemplateId: text(row.detected_template_id), duplicateOfBatchId: text(row.duplicate_of_batch_id), status: String(row.status || "UPLOADED") as PayrollImportBatchStatus,
    mappingSnapshot: objectValue(row.mapping_snapshot), rawMetadata: objectValue(row.raw_metadata), warnings: stringArray(row.warnings), errors: stringArray(row.errors),
    committedPayrollPeriodId: text(row.committed_payroll_period_id), committedPayrollRunId: text(row.committed_payroll_run_id),
    createdAt: String(row.created_at || new Date().toISOString()), updatedAt: String(row.updated_at || new Date().toISOString()), committedAt: text(row.committed_at), voidedAt: text(row.voided_at),
  };
}


function templateFromRow(row: Record<string, unknown>): PayrollImportTemplate {
  return {
    id: String(row.id), userId: text(row.user_id), name: String(row.name || ""), structureSignature: String(row.structure_signature || ""),
    fieldMappings: Array.isArray(row.field_mappings) ? row.field_mappings as PayrollImportColumnMappingSnapshot[] : [],
    headerConfiguration: objectValue(row.header_configuration), metadataMappings: objectValue(row.metadata_mappings), contextRules: objectValue(row.context_rules),
    active: bool(row.active), createdAt: String(row.created_at || new Date().toISOString()), updatedAt: String(row.updated_at || new Date().toISOString()), archivedAt: text(row.archived_at),
  };
}

function rowFromRow(row: Record<string, unknown>): PayrollImportRow {
  const canonical = objectValue(row.canonical_data) as unknown as CanonicalPayrollImportRow;
  const context: LaborCostContext = {
    type: String(row.labor_context_type || "UNALLOCATED_REVIEW") as LaborContextType,
    projectId: text(row.project_id), costCenterId: text(row.cost_center_id), label: text(row.labor_context_label), needsReview: bool(row.needs_review, true),
  };
  return {
    id: String(row.id), userId: text(row.user_id), batchId: String(row.batch_id), sourceSheet: String(row.source_sheet || ""), sourceRow: numberValue(row.source_row),
    originalEmployeeName: text(row.original_employee_name), canonicalData: canonical, rawRow: Array.isArray(row.raw_row) ? row.raw_row : [], warnings: stringArray(row.warnings), errors: stringArray(row.errors),
    confidenceLevel: String(row.confidence_level || "LOW") as PayrollImportConfidenceLevel, confidenceScore: numberValue(row.confidence_score), status: String(row.status || "STAGED") as PayrollImportRowStatus,
    workerMatchStatus: String(row.worker_match_status || "UNMATCHED") as PayrollImportMatchStatus, workerId: text(row.worker_id), projectMatchStatus: String(row.project_match_status || "UNMATCHED") as PayrollProjectMatchStatus,
    laborContext: context, committedWorkEntryId: text(row.committed_work_entry_id), committedPayrollEntryId: text(row.committed_payroll_entry_id),
    createdAt: String(row.created_at || new Date().toISOString()), updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

async function currentUserId() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
}

export async function loadPayrollImportWorkspaceFromSupabase(): Promise<PayrollImportWorkspaceData> {
  const userId = await currentUserId();
  if (!supabase || !userId) return { costCenters: [], batches: [], rows: [], templates: [] };
  const companyId = requireActiveCompanyId();
  const [costCenters, batches, rows, templates] = await Promise.all([
    supabase.from("labor_cost_centers").select("*").eq("company_id", companyId).is("archived_at", null).order("name"),
    supabase.from("payroll_import_batches").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    supabase.from("payroll_import_rows").select("*").eq("company_id", companyId).order("source_sheet").order("source_row"),
    supabase.from("payroll_import_templates").select("*").eq("company_id", companyId).is("archived_at", null).order("name"),
  ]);
  for (const result of [costCenters, batches, rows, templates]) if (result.error) throw result.error;
  return {
    costCenters: (costCenters.data || []).map((row) => costCenterFromRow(row as Record<string, unknown>)),
    batches: (batches.data || []).map((row) => batchFromRow(row as Record<string, unknown>)),
    rows: (rows.data || []).map((row) => rowFromRow(row as Record<string, unknown>)),
    templates: (templates.data || []).map((row) => templateFromRow(row as Record<string, unknown>)),
  };
}

export async function findDuplicatePayrollImportBatchesFromSupabase(fileSha256: string) {
  const userId = await currentUserId();
  if (!supabase || !userId) return [];
  const { data, error } = await supabase.from("payroll_import_batches").select("*").eq("company_id", requireActiveCompanyId()).eq("file_sha256", normalizeSha256(fileSha256)).neq("status", "VOIDED").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => batchFromRow(row as Record<string, unknown>));
}

export async function saveLaborCostCenterToSupabase(costCenter: LaborCostCenter) {
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before saving labor cost centers.");
  const { data, error } = await supabase.from("labor_cost_centers").upsert({
    id: persistedId(costCenter.id, "cost-center"), user_id: userId, code: costCenter.code.trim(), name: costCenter.name.trim(), cost_center_type: costCenter.type,
    company_id: requireActiveCompanyId(),
    description: costCenter.description || null, active: costCenter.active, archived_at: costCenter.archivedAt || null, updated_at: new Date().toISOString(),
  }).select("*").single();
  if (error) throw error;
  return costCenterFromRow(data as Record<string, unknown>);
}

export async function savePayrollImportBatchToSupabase(batch: PayrollImportBatch) {
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before saving payroll imports.");
  const { data, error } = await supabase.from("payroll_import_batches").upsert({
    id: persistedId(batch.id, "payroll-import"), user_id: userId, original_filename: batch.originalFileName, file_sha256: normalizeSha256(batch.fileSha256),
    company_id: requireActiveCompanyId(),
    file_size: batch.fileSize ?? null, mime_type: batch.mimeType || null, storage_path: batch.storagePath, sheet_names: batch.sheetNames,
    detected_template_id: batch.detectedTemplateId || null, duplicate_of_batch_id: batch.duplicateOfBatchId || null, status: batch.status,
    mapping_snapshot: batch.mappingSnapshot, raw_metadata: batch.rawMetadata, warnings: batch.warnings, errors: batch.errors,
    committed_payroll_period_id: batch.committedPayrollPeriodId || null, committed_payroll_run_id: batch.committedPayrollRunId || null,
    committed_at: batch.committedAt || null, voided_at: batch.voidedAt || null, updated_at: new Date().toISOString(),
  }).select("*").single();
  if (error) throw error;
  return batchFromRow(data as Record<string, unknown>);
}

export async function savePayrollImportRowsToSupabase(rows: PayrollImportRow[]) {
  if (!rows.length) return [];
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before saving payroll import rows.");
  for (const row of rows) {
    const issues = validatePayrollImportRow(row);
    if (issues.length) throw new Error(issues.join(" "));
  }
  const payload = rows.map((row) => ({
    id: persistedId(row.id, "payroll-import-row"), user_id: userId, batch_id: row.batchId, source_sheet: row.sourceSheet, source_row: row.sourceRow,
    company_id: requireActiveCompanyId(),
    original_employee_name: row.originalEmployeeName || null, canonical_data: row.canonicalData, raw_row: row.rawRow, warnings: row.warnings, errors: row.errors,
    confidence_level: row.confidenceLevel, confidence_score: row.confidenceScore, status: row.status, worker_match_status: row.workerMatchStatus, worker_id: row.workerId || null,
    project_match_status: row.projectMatchStatus, labor_context_type: row.laborContext.type, project_id: row.laborContext.projectId || null, cost_center_id: row.laborContext.costCenterId || null,
    labor_context_label: row.laborContext.label || null, needs_review: row.laborContext.needsReview, committed_work_entry_id: row.committedWorkEntryId || null,
    committed_payroll_entry_id: row.committedPayrollEntryId || null, updated_at: new Date().toISOString(),
  }));
  const { data, error } = await supabase.from("payroll_import_rows").upsert(payload).select("*");
  if (error) throw error;
  return (data || []).map((row) => rowFromRow(row as Record<string, unknown>));
}

export async function savePayrollImportTemplateToSupabase(template: PayrollImportTemplate) {
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before saving payroll import templates.");
  const { data, error } = await supabase.from("payroll_import_templates").upsert({
    id: persistedId(template.id, "payroll-import-template"), user_id: userId, name: template.name.trim(), structure_signature: template.structureSignature,
    company_id: requireActiveCompanyId(),
    field_mappings: template.fieldMappings, header_configuration: template.headerConfiguration, metadata_mappings: template.metadataMappings, context_rules: template.contextRules,
    active: template.active, archived_at: template.archivedAt || null, updated_at: new Date().toISOString(),
  }).select("*").single();
  if (error) throw error;
  return templateFromRow(data as Record<string, unknown>);
}

export async function uploadPayrollImportSourceToSupabase(input: { batchId: string; fileName: string; mimeType?: string; bytes: Uint8Array }) {
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before uploading payroll source files.");
  validatePayrollImportBytes(input.bytes, input.fileName, input.mimeType);
  const batchId = safeStorageSegment(input.batchId, "Payroll import batch ID");
  const storagePath = `${companyStoragePath("payroll-imports", batchId)}/${safeName(input.fileName)}`;
  const { error } = await supabase.storage.from(PAYROLL_IMPORT_BUCKET).upload(storagePath, input.bytes, { contentType: input.mimeType, upsert: false });
  if (error) throw error;
  return storagePath;
}

export async function createPayrollImportSourceSignedUrl(storagePath: string, expiresInSeconds = 60 * 60) {
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before opening payroll source files.");
  if (!storagePath.startsWith(`${companyStoragePath("payroll-imports")}/`)) throw new Error("Payroll source path is outside the current company.");
  const { data, error } = await supabase.storage.from(PAYROLL_IMPORT_BUCKET).createSignedUrl(storagePath, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function commitPayrollImportToSupabase(input: {
  batchId: string;
  period: PayrollPeriod;
  run: PayrollRun;
  entries: PayrollEntry[];
  allocations: PayrollProjectAllocation[];
  rows: PayrollImportRow[];
}) {
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before committing payroll imports.");
  const { error } = await supabase.rpc("commit_payroll_import", {
    p_batch_id: input.batchId,
    p_period: { id: input.period.id, periodStart: input.period.periodStart, periodEnd: input.period.periodEnd, payDate: input.period.payDate || null, status: input.period.status, notes: input.period.notes || null },
    p_run: { id: input.run.id, notes: input.run.notes || null },
    p_entries: input.entries,
    p_allocations: input.allocations,
    p_rows: input.rows.map((row) => ({ id: row.id, status: row.status, committedPayrollEntryId: row.committedPayrollEntryId || null })),
  });
  if (error) throw error;
  return { period: input.period, run: input.run, entries: input.entries, allocations: input.allocations };
}
export function createSupabasePayrollImportPersistence(): PayrollImportPersistence {
  return {
    load: loadPayrollImportWorkspaceFromSupabase,
    findDuplicates: findDuplicatePayrollImportBatchesFromSupabase,
    saveCostCenter: saveLaborCostCenterToSupabase,
    saveBatch: savePayrollImportBatchToSupabase,
    saveRows: savePayrollImportRowsToSupabase,
    saveTemplate: savePayrollImportTemplateToSupabase,
  };
}
