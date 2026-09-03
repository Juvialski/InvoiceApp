import type { Subcontract, SubcontractLine, SubcontractStatus } from "../types.ts";
import { supabase } from "./supabase.ts";
import { getActiveCompanyId } from "./companyContext.ts";

export const SUBCONTRACT_STORAGE_KEY = "engineering_subcontracts";

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

type Row = Record<string, unknown>;

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
    status: (String(row.status || "DRAFT").toUpperCase() as SubcontractStatus) || "DRAFT",
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

  if (!supabase || !companyId) {
    const local = readSubcontractsFromLocal();
    return projectId ? local.filter((sc) => sc.projectId === projectId) : local;
  }

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

  if (!supabase || !companyId) {
    const local = readSubcontractsFromLocal();
    return local.find((sc) => sc.id === id) || null;
  }

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

  const subcontractNumber = (subcontract.subcontractNumber || "").trim().toUpperCase();
  if (!subcontractNumber) {
    throw new Error("Subcontract number is required");
  }

  const vendorId = (subcontract.vendorId || "").trim();
  if (!vendorId) {
    throw new Error("Vendor is required");
  }

  const projectId = (subcontract.projectId || "").trim();
  if (!projectId) {
    throw new Error("Project is required");
  }

  const title = (subcontract.title || "").trim();
  if (!title) {
    throw new Error("Scope title is required");
  }

  if (!lines || lines.length === 0) {
    throw new Error("At least one scope line item is required");
  }

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.description || !l.description.trim()) {
      throw new Error(`Line ${i + 1}: Description is required`);
    }
    if (l.amount == null || isNaN(Number(l.amount)) || Number(l.amount) < 0) {
      throw new Error(`Line ${i + 1}: Amount must be a non-negative number`);
    }
  }

  if (!supabase || !companyId) {
    const local = readSubcontractsFromLocal();
    const existingIdx = subcontract.id ? local.findIndex((s) => s.id === subcontract.id) : -1;

    if (existingIdx >= 0 && local[existingIdx].status !== "DRAFT") {
      throw new Error("Only draft subcontracts can be modified");
    }

    const scId = subcontract.id || globalThis.crypto?.randomUUID?.() || `sc-${Date.now()}`;
    const now = new Date().toISOString();

    const mappedLines: SubcontractLine[] = lines.map((line, idx) => {
      const lineAmount = roundMoney(Math.max(0, Number(line.amount) || 0));
      return {
        id: line.id || globalThis.crypto?.randomUUID?.() || `scl-${scId}-${idx + 1}`,
        companyId: companyId || undefined,
        subcontractId: scId,
        lineNumber: idx + 1,
        description: line.description.trim(),
        amount: lineAmount,
        quantity: line.quantity != null && !isNaN(Number(line.quantity)) ? Number(line.quantity) : null,
        unit: line.unit ? line.unit.trim() : null,
        unitRate: line.unitRate != null && !isNaN(Number(line.unitRate)) ? Number(line.unitRate) : null,
        projectCostCodeId: line.projectCostCodeId || null,
        notes: line.notes ? line.notes.trim() : null,
        createdAt: line.createdAt || now,
        updatedAt: now,
      };
    });

    const originalAmount = roundMoney(mappedLines.reduce((sum, l) => sum + l.amount, 0));

    const saved: Subcontract = {
      id: scId,
      companyId: companyId || undefined,
      subcontractNumber,
      vendorId,
      projectId,
      title,
      currency: (subcontract.currency || "PHP").trim().toUpperCase(),
      status: subcontract.status || (existingIdx >= 0 ? local[existingIdx].status : "DRAFT"),
      originalAmount,
      startDate: subcontract.startDate || null,
      targetCompletionDate: subcontract.targetCompletionDate || null,
      notes: subcontract.notes ? subcontract.notes.trim() : null,
      cancellationReason: subcontract.cancellationReason || null,
      lines: mappedLines,
      createdByUserId: subcontract.createdByUserId || (existingIdx >= 0 ? local[existingIdx].createdByUserId : null),
      updatedByUserId: subcontract.updatedByUserId || null,
      approvedByUserId: subcontract.approvedByUserId || (existingIdx >= 0 ? local[existingIdx].approvedByUserId : null),
      activatedByUserId: subcontract.activatedByUserId || (existingIdx >= 0 ? local[existingIdx].activatedByUserId : null),
      closedByUserId: subcontract.closedByUserId || (existingIdx >= 0 ? local[existingIdx].closedByUserId : null),
      cancelledByUserId: subcontract.cancelledByUserId || (existingIdx >= 0 ? local[existingIdx].cancelledByUserId : null),
      createdAt: existingIdx >= 0 ? local[existingIdx].createdAt : now,
      updatedAt: now,
      approvedAt: subcontract.approvedAt || (existingIdx >= 0 ? local[existingIdx].approvedAt : null),
      activatedAt: subcontract.activatedAt || (existingIdx >= 0 ? local[existingIdx].activatedAt : null),
      closedAt: subcontract.closedAt || (existingIdx >= 0 ? local[existingIdx].closedAt : null),
      cancelledAt: subcontract.cancelledAt || (existingIdx >= 0 ? local[existingIdx].cancelledAt : null),
    };

    if (existingIdx >= 0) {
      local[existingIdx] = saved;
    } else {
      local.unshift(saved);
    }
    writeSubcontractsToLocal(local);
    return saved;
  }

  const { data, error } = await supabase.rpc("create_or_update_subcontract", {
    p_subcontract: {
      id: subcontract.id || null,
      company_id: companyId,
      subcontract_number: subcontractNumber,
      vendor_id: vendorId,
      project_id: projectId,
      title,
      currency: (subcontract.currency || "PHP").trim().toUpperCase(),
      start_date: subcontract.startDate || null,
      target_completion_date: subcontract.targetCompletionDate || null,
      notes: subcontract.notes || null,
    },
    p_lines: lines.map((l, idx) => ({
      id: l.id || null,
      line_number: idx + 1,
      description: l.description.trim(),
      amount: Number(l.amount) || 0,
      quantity: l.quantity != null ? Number(l.quantity) : null,
      unit: l.unit || null,
      unit_rate: l.unitRate != null ? Number(l.unitRate) : null,
      project_cost_code_id: l.projectCostCodeId || null,
      notes: l.notes || null,
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

  if (!supabase || !companyId) {
    const local = readSubcontractsFromLocal();
    const idx = local.findIndex((s) => s.id === id);
    if (idx < 0) throw new Error("Subcontract not found");
    const existing = local[idx];

    if (existing.status === "CLOSED" || existing.status === "CANCELLED") {
      throw new Error("Closed or cancelled subcontracts cannot undergo further transitions");
    }

    if (targetStatus === "CANCELLED" && (!reason || !reason.trim())) {
      throw new Error("Cancellation reason is required");
    }

    const now = new Date().toISOString();
    const updated: Subcontract = {
      ...existing,
      status: targetStatus,
      updatedAt: now,
      ...(targetStatus === "APPROVED" ? { approvedAt: now } : {}),
      ...(targetStatus === "ACTIVE" ? { activatedAt: now } : {}),
      ...(targetStatus === "CLOSED" ? { closedAt: now } : {}),
      ...(targetStatus === "CANCELLED" ? { cancelledAt: now, cancellationReason: reason?.trim() || null } : {}),
    };

    local[idx] = updated;
    writeSubcontractsToLocal(local);
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

  if (!supabase || !companyId) {
    const local = readSubcontractsFromLocal();
    const existing = local.find((s) => s.id === id);
    if (!existing) return;
    if (existing.status !== "DRAFT") {
      throw new Error("Only draft subcontracts may be deleted");
    }
    const filtered = local.filter((s) => s.id !== id);
    writeSubcontractsToLocal(filtered);
    return;
  }

  const { error } = await supabase.rpc("delete_draft_subcontract", {
    p_subcontract_id: id,
  });

  if (error) throw error;
}
