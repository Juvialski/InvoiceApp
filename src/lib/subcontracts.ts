import type { Subcontract, SubcontractLine, SubcontractStatus } from "../types.ts";
import { supabase } from "./supabase.ts";
import { getActiveCompanyId } from "./companyContext.ts";
import { BRAND } from "../config/brand.ts";

export const SUBCONTRACT_STORAGE_KEY = "engineering_subcontracts";

export function roundMoney(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

type Row = Record<string, unknown>;

const SUBCONTRACT_STATUSES: readonly SubcontractStatus[] = ["DRAFT", "APPROVED", "ACTIVE", "CLOSED", "CANCELLED"];
const SUBCONTRACT_NUMBER_MAX_LENGTH = 60;
const SUBCONTRACT_TITLE_MAX_LENGTH = 255;
const SUBCONTRACT_LINE_DESCRIPTION_MAX_LENGTH = 500;
const SUBCONTRACT_LINE_UNIT_MAX_LENGTH = 50;

const memoryStore = new Map<string, string>();

function getStorage(storage?: Storage): {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
} | null {
  if (storage) return storage;
  if (typeof localStorage !== "undefined") return localStorage;
  return {
    getItem: (key: string) => memoryStore.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memoryStore.set(key, String(value));
    },
    removeItem: (key: string) => {
      memoryStore.delete(key);
    },
  };
}

export function clearSubcontractMemoryStore(): void {
  memoryStore.clear();
}

function text(value: unknown): string | undefined {
  return value === null || value === undefined || value === "" ? undefined : String(value);
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeStatus(value: unknown): SubcontractStatus {
  const status = String(value || "DRAFT").trim().toUpperCase();
  if (!SUBCONTRACT_STATUSES.includes(status as SubcontractStatus)) {
    throw new Error(`Invalid subcontract status: ${status}`);
  }
  return status as SubcontractStatus;
}

function assertPersistenceContext(companyId: string | null, operation: string): void {
  if (supabase && !companyId) {
    throw new Error(`Resolve the ${BRAND.productName} deployment company before ${operation}.`);
  }
}

function localRecordsForCompany(companyId: string | null): { all: Subcontract[]; scoped: Subcontract[] } {
  const all = readSubcontractsFromLocal();
  return {
    all,
    scoped: companyId ? all.filter((subcontract) => subcontract.companyId === companyId) : all,
  };
}

function writeScopedLocalRecords(subcontracts: Subcontract[], companyId: string | null, allRecords: Subcontract[]): void {
  if (!companyId) {
    writeSubcontractsToLocal(subcontracts);
    return;
  }
  const otherCompanyRecords = allRecords.filter((subcontract) => subcontract.companyId !== companyId);
  writeSubcontractsToLocal([...subcontracts, ...otherCompanyRecords]);
}

interface NormalizedLineInput {
  id?: string;
  description: string;
  amount: number;
  quantity: number | null;
  unit: string | null;
  unitRate: number | null;
  projectCostCodeId: string | null;
  notes: string | null;
}

function normalizeDraftInput(
  subcontract: Partial<Subcontract> & { subcontractNumber: string; vendorId: string; projectId: string; title: string },
  lines: Array<Partial<SubcontractLine> & { description: string; amount: number }>,
): {
  subcontractNumber: string;
  vendorId: string;
  projectId: string;
  title: string;
  currency: string;
  startDate: string | null;
  targetCompletionDate: string | null;
  notes: string | null;
  lines: NormalizedLineInput[];
} {
  const subcontractNumber = String(subcontract.subcontractNumber || "").trim().toUpperCase();
  if (!subcontractNumber) throw new Error("Subcontract number is required");
  if (subcontractNumber.length > SUBCONTRACT_NUMBER_MAX_LENGTH) {
    throw new Error(`Subcontract number must be ${SUBCONTRACT_NUMBER_MAX_LENGTH} characters or fewer`);
  }

  const vendorId = String(subcontract.vendorId || "").trim();
  if (!vendorId) throw new Error("Vendor is required");

  const projectId = String(subcontract.projectId || "").trim();
  if (!projectId) throw new Error("Project is required");

  const title = String(subcontract.title || "").trim();
  if (!title) throw new Error("Scope title is required");
  if (title.length > SUBCONTRACT_TITLE_MAX_LENGTH) {
    throw new Error(`Scope title must be ${SUBCONTRACT_TITLE_MAX_LENGTH} characters or fewer`);
  }

  const currency = String(subcontract.currency || "PHP").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Currency must be a 3-letter ISO code");
  }

  const normalizeDate = (value: unknown, label: string): string | null => {
    const normalized = value == null ? "" : String(value).trim();
    if (!normalized) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(new Date(`${normalized}T00:00:00Z`).getTime())) {
      throw new Error(`${label} must be a valid date`);
    }
    return normalized;
  };
  const startDate = normalizeDate(subcontract.startDate, "Start date");
  const targetCompletionDate = normalizeDate(subcontract.targetCompletionDate, "Target completion date");
  if (startDate && targetCompletionDate && targetCompletionDate < startDate) {
    throw new Error("Target completion date cannot be before the start date");
  }

  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("At least one scope line item is required");
  }

  const normalizedLines = lines.map((line, index): NormalizedLineInput => {
    const description = String(line.description || "").trim();
    if (!description) throw new Error(`Line ${index + 1}: Description is required`);
    if (description.length > SUBCONTRACT_LINE_DESCRIPTION_MAX_LENGTH) {
      throw new Error(`Line ${index + 1}: Description must be ${SUBCONTRACT_LINE_DESCRIPTION_MAX_LENGTH} characters or fewer`);
    }

    const rawAmount: unknown = line.amount;
    if (rawAmount === null || rawAmount === undefined || (typeof rawAmount === "string" && !rawAmount.trim())) {
      throw new Error(`Line ${index + 1}: Amount must be a non-negative number`);
    }
    const suppliedAmount = Number(rawAmount);
    if (!Number.isFinite(suppliedAmount) || suppliedAmount < 0) {
      throw new Error(`Line ${index + 1}: Amount must be a non-negative number`);
    }

    const rawQuantity: unknown = line.quantity;
    const quantity = rawQuantity === null || rawQuantity === undefined || (typeof rawQuantity === "string" && !rawQuantity.trim())
      ? null
      : Number(rawQuantity);
    if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) {
      throw new Error(`Line ${index + 1}: Quantity must be positive when provided`);
    }

    const rawUnitRate: unknown = line.unitRate;
    const unitRate = rawUnitRate === null || rawUnitRate === undefined || (typeof rawUnitRate === "string" && !rawUnitRate.trim())
      ? null
      : Number(rawUnitRate);
    if (unitRate !== null && (!Number.isFinite(unitRate) || unitRate < 0)) {
      throw new Error(`Line ${index + 1}: Unit rate must be non-negative when provided`);
    }

    const unit = line.unit == null || !String(line.unit).trim() ? null : String(line.unit).trim();
    if (unit && unit.length > SUBCONTRACT_LINE_UNIT_MAX_LENGTH) {
      throw new Error(`Line ${index + 1}: Unit must be ${SUBCONTRACT_LINE_UNIT_MAX_LENGTH} characters or fewer`);
    }

    const amount = suppliedAmount === 0 && quantity !== null && unitRate !== null
      ? roundMoney(quantity * unitRate)
      : roundMoney(suppliedAmount);

    return {
      id: line.id || undefined,
      description,
      amount,
      quantity,
      unit,
      unitRate,
      projectCostCodeId: line.projectCostCodeId == null || !String(line.projectCostCodeId).trim() ? null : String(line.projectCostCodeId).trim(),
      notes: line.notes == null || !String(line.notes).trim() ? null : String(line.notes).trim(),
    };
  });

  return {
    subcontractNumber,
    vendorId,
    projectId,
    title,
    currency,
    startDate,
    targetCompletionDate,
    notes: subcontract.notes == null || !String(subcontract.notes).trim() ? null : String(subcontract.notes).trim(),
    lines: normalizedLines,
  };
}

function localSubcontractTotal(subcontract: Pick<Subcontract, "originalAmount" | "lines">): number {
  if (subcontract.lines && subcontract.lines.length > 0) {
    return roundMoney(subcontract.lines.reduce((sum, line) => sum + roundMoney(Number(line.amount)), 0));
  }
  return roundMoney(Number(subcontract.originalAmount));
}

/** Build a validated local/demo draft without persisting it. */
export function buildLocalSubcontract(
  subcontract: Partial<Subcontract> & { subcontractNumber: string; vendorId: string; projectId: string; title: string },
  lines: Array<Partial<SubcontractLine> & { description: string; amount: number }>,
  existing?: Subcontract,
  companyId: string | null = null,
  now = new Date().toISOString(),
): Subcontract {
  const normalized = normalizeDraftInput(subcontract, lines);
  if (subcontract.status && subcontract.status !== "DRAFT") {
    throw new Error("Subcontracts must be saved as DRAFT and transitioned through the guarded lifecycle");
  }

  const id = subcontract.id || globalThis.crypto?.randomUUID?.() || `sc-${Date.now()}`;
  const existingLinesById = new Map((existing?.lines || []).map((line) => [line.id, line]));
  const mappedLines: SubcontractLine[] = normalized.lines.map((line, idx) => ({
    id: line.id || globalThis.crypto?.randomUUID?.() || `scl-${id}-${idx + 1}`,
    companyId: companyId || existing?.companyId || undefined,
    subcontractId: id,
    lineNumber: idx + 1,
    description: line.description,
    amount: line.amount,
    quantity: line.quantity,
    unit: line.unit,
    unitRate: line.unitRate,
    projectCostCodeId: line.projectCostCodeId,
    notes: line.notes,
    createdAt: existingLinesById.get(line.id || "")?.createdAt || now,
    updatedAt: now,
  }));

  return {
    id,
    companyId: companyId || existing?.companyId,
    subcontractNumber: normalized.subcontractNumber,
    vendorId: normalized.vendorId,
    projectId: normalized.projectId,
    title: normalized.title,
    currency: normalized.currency,
    status: "DRAFT",
    originalAmount: roundMoney(mappedLines.reduce((sum, line) => sum + line.amount, 0)),
    startDate: normalized.startDate,
    targetCompletionDate: normalized.targetCompletionDate,
    notes: normalized.notes,
    cancellationReason: existing?.cancellationReason || null,
    lines: mappedLines,
    createdByUserId: existing?.createdByUserId || null,
    updatedByUserId: null,
    approvedByUserId: existing?.approvedByUserId || null,
    activatedByUserId: existing?.activatedByUserId || null,
    closedByUserId: existing?.closedByUserId || null,
    cancelledByUserId: existing?.cancelledByUserId || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    approvedAt: existing?.approvedAt || null,
    activatedAt: existing?.activatedAt || null,
    closedAt: existing?.closedAt || null,
    cancelledAt: existing?.cancelledAt || null,
  };
}

function allowedTransition(currentStatus: SubcontractStatus, targetStatus: SubcontractStatus): boolean {
  if (currentStatus === "DRAFT") return targetStatus === "APPROVED" || targetStatus === "CANCELLED";
  if (currentStatus === "APPROVED") return targetStatus === "ACTIVE" || targetStatus === "CANCELLED";
  if (currentStatus === "ACTIVE") return targetStatus === "CLOSED" || targetStatus === "CANCELLED";
  return false;
}

/** Apply the same guarded lifecycle rules used by the subcontract RPC to a local/demo record. */
export function applySubcontractTransition(
  existing: Subcontract,
  targetStatus: SubcontractStatus,
  reason?: string,
  now = new Date().toISOString(),
  variations?: Array<{ subcontractId: string; status: string }>,
): Subcontract {
  const currentStatus = normalizeStatus(existing.status);
  const normalizedTarget = normalizeStatus(targetStatus);

  if (currentStatus === "CLOSED" || currentStatus === "CANCELLED") {
    throw new Error("Closed or cancelled subcontracts cannot undergo further transitions");
  }
  if (!allowedTransition(currentStatus, normalizedTarget)) {
    if (currentStatus === "DRAFT") throw new Error("Draft subcontracts can only be approved or cancelled");
    if (currentStatus === "APPROVED") throw new Error("Approved subcontracts can only be activated or cancelled");
    if (currentStatus === "ACTIVE") throw new Error("Active subcontracts can only be closed or cancelled");
    throw new Error(`Invalid subcontract transition from ${currentStatus} to ${normalizedTarget}`);
  }
  if (normalizedTarget === "APPROVED") {
    if (!existing.lines || existing.lines.length === 0) {
      throw new Error("A subcontract requires at least one line item before approval");
    }
    if (localSubcontractTotal(existing) <= 0) {
      throw new Error("Subcontract original amount must be positive before approval");
    }
  }
  if (normalizedTarget === "CLOSED" || normalizedTarget === "CANCELLED") {
    if (variations && variations.length > 0) {
      const unresolved = variations.filter(
        (v) => v.subcontractId === existing.id && (v.status === "DRAFT" || v.status === "SUBMITTED"),
      );
      if (unresolved.length > 0) {
        throw new Error(
          `Resolve ${unresolved.length} draft/submitted variation(s) before closing or cancelling the subcontract`,
        );
      }
    }
  }

  const trimmedReason = reason?.trim() || "";
  if (normalizedTarget === "CANCELLED" && !trimmedReason) {
    throw new Error("Cancellation reason is required");
  }

  return {
    ...existing,
    status: normalizedTarget,
    updatedAt: now,
    ...(normalizedTarget === "APPROVED" ? { approvedAt: now, cancellationReason: null } : {}),
    ...(normalizedTarget === "ACTIVE" ? { activatedAt: now } : {}),
    ...(normalizedTarget === "CLOSED" ? { closedAt: now } : {}),
    ...(normalizedTarget === "CANCELLED" ? { cancelledAt: now, cancellationReason: trimmedReason } : {}),
  };
}

export function subcontractLineFromRow(row: Row): SubcontractLine {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    subcontractId: String(row.subcontract_id),
    lineNumber: numberValue(row.line_number, 1),
    description: String(row.description || ""),
    amount: numberValue(row.amount, 0),
    quantity: row.quantity != null ? numberValue(row.quantity) : null,
    unit: text(row.unit) || null,
    unitRate: row.unit_rate != null ? numberValue(row.unit_rate) : null,
    projectCostCodeId: text(row.project_cost_code_id) || null,
    notes: text(row.notes) || null,
    createdAt: text(row.created_at) || new Date().toISOString(),
    updatedAt: text(row.updated_at) || new Date().toISOString(),
  };
}

export function subcontractFromRow(row: Row, lineRows: Row[] = []): Subcontract {
  const lines = lineRows
    .map(subcontractLineFromRow)
    .sort((a, b) => a.lineNumber - b.lineNumber);

  const originalAmount = lines.length > 0
    ? roundMoney(lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0))
    : numberValue(row.original_amount, 0);

  return {
    id: String(row.id),
    companyId: text(row.company_id),
    subcontractNumber: String(row.subcontract_number || "").toUpperCase(),
    vendorId: String(row.vendor_id || ""),
    projectId: String(row.project_id || ""),
    title: String(row.title || ""),
    currency: String(row.currency || "PHP").toUpperCase(),
    status: normalizeStatus(row.status),
    originalAmount: roundMoney(originalAmount),
    startDate: text(row.start_date) || null,
    targetCompletionDate: text(row.target_completion_date) || null,
    notes: text(row.notes) || null,
    cancellationReason: text(row.cancellation_reason) || null,
    lines,
    createdByUserId: text(row.created_by_user_id) || null,
    updatedByUserId: text(row.updated_by_user_id) || null,
    approvedByUserId: text(row.approved_by_user_id) || null,
    activatedByUserId: text(row.activated_by_user_id) || null,
    closedByUserId: text(row.closed_by_user_id) || null,
    cancelledByUserId: text(row.cancelled_by_user_id) || null,
    createdAt: text(row.created_at) || new Date().toISOString(),
    updatedAt: text(row.updated_at) || new Date().toISOString(),
    approvedAt: text(row.approved_at) || null,
    activatedAt: text(row.activated_at) || null,
    closedAt: text(row.closed_at) || null,
    cancelledAt: text(row.cancelled_at) || null,
  };
}

export function readSubcontractsFromLocal(storage?: Storage): Subcontract[] {
  const target = getStorage(storage);
  if (!target) return [];
  try {
    const raw = target.getItem(SUBCONTRACT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Subcontract[]) : [];
  } catch {
    return [];
  }
}

export function writeSubcontractsToLocal(subcontracts: Subcontract[], storage?: Storage): void {
  const target = getStorage(storage);
  if (!target) return;
  try {
    target.setItem(SUBCONTRACT_STORAGE_KEY, JSON.stringify(subcontracts));
  } catch {
    /* ignore */
  }
}

export async function fetchSubcontracts(projectId?: string): Promise<Subcontract[]> {
  const companyId = getActiveCompanyId();

  if (!supabase) {
    const local = localRecordsForCompany(companyId).scoped;
    return projectId ? local.filter((sc) => sc.projectId === projectId) : local;
  }
  assertPersistenceContext(companyId, "loading subcontracts");

  let query = supabase
    .from("subcontracts")
    .select("*, subcontract_lines(*)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((row) => {
    const lines = Array.isArray(row.subcontract_lines) ? row.subcontract_lines : [];
    return subcontractFromRow(row as Row, lines as Row[]);
  });
}

export async function fetchSubcontract(id: string): Promise<Subcontract | null> {
  const companyId = getActiveCompanyId();

  if (!supabase) {
    const local = localRecordsForCompany(companyId).scoped;
    return local.find((sc) => sc.id === id) || null;
  }
  assertPersistenceContext(companyId, "loading a subcontract");

  const { data, error } = await supabase
    .from("subcontracts")
    .select("*, subcontract_lines(*)")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const lines = Array.isArray(data.subcontract_lines) ? data.subcontract_lines : [];
  return subcontractFromRow(data as Row, lines as Row[]);
}

export async function saveSubcontract(
  subcontract: Partial<Subcontract> & { subcontractNumber: string; vendorId: string; projectId: string; title: string },
  lines: Array<Partial<SubcontractLine> & { description: string; amount: number }>,
): Promise<Subcontract> {
  const companyId = getActiveCompanyId();
  const normalized = normalizeDraftInput(subcontract, lines);
  assertPersistenceContext(companyId, "saving subcontracts");

  if (!supabase) {
    const { all, scoped: local } = localRecordsForCompany(companyId);
    const existingIdx = subcontract.id ? local.findIndex((s) => s.id === subcontract.id) : -1;
    if (subcontract.id && existingIdx < 0) {
      throw new Error("Subcontract not found in company");
    }
    const existing = existingIdx >= 0 ? local[existingIdx] : undefined;
    if (existing && existing.status !== "DRAFT") {
      throw new Error("Only draft subcontracts can be modified");
    }
    if (subcontract.status && subcontract.status !== "DRAFT") {
      throw new Error("Subcontracts must be saved as DRAFT and transitioned through the guarded lifecycle");
    }
    if (local.some((s) => s.id !== subcontract.id && String(s.subcontractNumber || "").trim().toUpperCase() === normalized.subcontractNumber)) {
      throw new Error("Subcontract number already exists in company");
    }

    const saved = buildLocalSubcontract(subcontract, lines, existing, companyId);

    if (existingIdx >= 0) {
      local[existingIdx] = saved;
    } else {
      local.unshift(saved);
    }
    writeScopedLocalRecords(local, companyId, all);
    return saved;
  }

  const { data, error } = await supabase.rpc("create_or_update_subcontract", {
    p_subcontract: {
      id: subcontract.id || null,
      company_id: companyId,
      subcontract_number: normalized.subcontractNumber,
      vendor_id: normalized.vendorId,
      project_id: normalized.projectId,
      title: normalized.title,
      currency: normalized.currency,
      start_date: normalized.startDate,
      target_completion_date: normalized.targetCompletionDate,
      notes: normalized.notes,
    },
    p_lines: normalized.lines.map((l, idx) => ({
      id: l.id || null,
      line_number: idx + 1,
      description: l.description,
      amount: l.amount,
      quantity: l.quantity,
      unit: l.unit,
      unit_rate: l.unitRate,
      project_cost_code_id: l.projectCostCodeId,
      notes: l.notes,
    })),
  });

  if (error) throw error;
  const result = data as { subcontract: Row; lines: Row[] };
  return subcontractFromRow(result.subcontract, result.lines || []);
}

export async function transitionSubcontract(
  id: string,
  targetStatus: SubcontractStatus,
  reason?: string,
): Promise<Subcontract> {
  const companyId = getActiveCompanyId();

  assertPersistenceContext(companyId, "transitioning subcontract lifecycle status");
  if (!supabase) {
    const { all, scoped: local } = localRecordsForCompany(companyId);
    const idx = local.findIndex((s) => s.id === id);
    if (idx < 0) throw new Error("Subcontract not found");
    const existing = local[idx];

    const updated = applySubcontractTransition(existing, targetStatus, reason);

    local[idx] = updated;
    writeScopedLocalRecords(local, companyId, all);
    return updated;
  }

  const { data, error } = await supabase.rpc("transition_subcontract", {
    p_subcontract_id: id,
    p_target_status: targetStatus,
    p_reason: reason?.trim() || null,
  });

  if (error) throw error;
  const result = data as { subcontract: Row; lines: Row[] };
  return subcontractFromRow(result.subcontract, result.lines || []);
}

export async function deleteDraftSubcontract(id: string): Promise<void> {
  const companyId = getActiveCompanyId();

  assertPersistenceContext(companyId, "deleting a draft subcontract");
  if (!supabase) {
    const { all, scoped: local } = localRecordsForCompany(companyId);
    const existing = local.find((s) => s.id === id);
    if (!existing) return;
    if (existing.status !== "DRAFT") {
      throw new Error("Only draft subcontracts may be deleted");
    }
    const filtered = local.filter((s) => s.id !== id);
    writeScopedLocalRecords(filtered, companyId, all);
    return;
  }

  const { error } = await supabase.rpc("delete_draft_subcontract", {
    p_subcontract_id: id,
  });

  if (error) throw error;
}
