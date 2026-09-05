import type {
  Subcontract,
  SubcontractLine,
  SubcontractProgressClaim,
  SubcontractVariation,
  SubcontractVariationLine,
  SubcontractVariationStatus,
} from "../types.ts";
import { supabase } from "./supabase.ts";
import { getActiveCompanyId } from "./companyContext.ts";
import { BRAND } from "../config/brand.ts";

export const SUBCONTRACT_VARIATION_STORAGE_KEY = "engineering_subcontract_variations";

export function roundMoney(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

export function calculateNetApprovedVariations(variations: SubcontractVariation[]): number {
  return roundMoney(
    variations
      .filter((v) => v.status === "APPROVED")
      .reduce((sum, v) => sum + roundMoney(Number(v.netAmount || 0)), 0),
  );
}

export function calculateRevisedSubcontractValue(
  subcontractOriginalAmount: number,
  variations: SubcontractVariation[],
): number {
  return roundMoney(subcontractOriginalAmount + calculateNetApprovedVariations(variations));
}

export function calculateRemainingSubcontractCommitment(
  revisedSubcontractValue: number,
  cumulativeApprovedClaimsGross: number,
): number {
  return roundMoney(Math.max(0, revisedSubcontractValue - roundMoney(cumulativeApprovedClaimsGross)));
}

type Row = Record<string, unknown>;

const VARIATION_STATUSES: readonly SubcontractVariationStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
];

const VARIATION_NUMBER_MAX_LENGTH = 60;
const VARIATION_TITLE_MAX_LENGTH = 255;
const VARIATION_LINE_DESC_MAX_LENGTH = 500;
const VARIATION_LINE_UNIT_MAX_LENGTH = 50;

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

export function clearSubcontractVariationMemoryStore(): void {
  memoryStore.clear();
}

function text(value: unknown): string | undefined {
  return value === null || value === undefined || value === "" ? undefined : String(value);
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeVariationStatus(value: unknown): SubcontractVariationStatus {
  const status = String(value || "DRAFT").trim().toUpperCase();
  if (!VARIATION_STATUSES.includes(status as SubcontractVariationStatus)) {
    throw new Error(`Invalid subcontract variation status: ${status}`);
  }
  return status as SubcontractVariationStatus;
}

function assertPersistenceContext(companyId: string | null, operation: string): void {
  if (supabase && !companyId) {
    throw new Error(`Resolve the ${BRAND.productName} deployment company before ${operation}.`);
  }
}

function localRecordsForCompany(companyId: string | null): {
  all: SubcontractVariation[];
  scoped: SubcontractVariation[];
} {
  const all = readSubcontractVariationsFromLocal();
  return {
    all,
    scoped: companyId ? all.filter((v) => v.companyId === companyId) : all,
  };
}

function writeScopedLocalRecords(
  variations: SubcontractVariation[],
  companyId: string | null,
  allRecords: SubcontractVariation[],
): void {
  if (!companyId) {
    writeSubcontractVariationsToLocal(variations);
    return;
  }
  const otherCompanyRecords = allRecords.filter((v) => v.companyId !== companyId);
  writeSubcontractVariationsToLocal([...variations, ...otherCompanyRecords]);
}

export interface NormalizedVariationLineInput {
  id?: string;
  description: string;
  amount: number;
  quantity?: number | null;
  unit?: string | null;
  unitRate?: number | null;
  subcontractLineId?: string | null;
  projectCostCodeId?: string | null;
  notes?: string | null;
}

export function normalizeVariationDraftInput(
  variation: Partial<SubcontractVariation> & {
    subcontractId: string;
    projectId: string;
    variationNumber: string;
    title: string;
    currency?: string;
  },
  lines: Array<Partial<SubcontractVariationLine> & { description: string; amount: number }>,
): {
  subcontractId: string;
  projectId: string;
  variationNumber: string;
  title: string;
  description: string | null;
  reason: string | null;
  variationDate: string;
  currency: string;
  notes: string | null;
  lines: NormalizedVariationLineInput[];
} {
  const subcontractId = String(variation.subcontractId || "").trim();
  if (!subcontractId) throw new Error("Subcontract reference is required");

  const projectId = String(variation.projectId || "").trim();
  if (!projectId) throw new Error("Project reference is required");

  const variationNumber = String(variation.variationNumber || "").trim().toUpperCase();
  if (!variationNumber) throw new Error("Variation number is required");
  if (variationNumber.length > VARIATION_NUMBER_MAX_LENGTH) {
    throw new Error(`Variation number must be ${VARIATION_NUMBER_MAX_LENGTH} characters or fewer`);
  }

  const title = String(variation.title || "").trim();
  if (!title) throw new Error("Variation title is required");
  if (title.length > VARIATION_TITLE_MAX_LENGTH) {
    throw new Error(`Variation title must be ${VARIATION_TITLE_MAX_LENGTH} characters or fewer`);
  }

  const rawDate = variation.variationDate == null ? "" : String(variation.variationDate).trim();
  const variationDate = rawDate || new Date().toISOString().split("T")[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(variationDate) || Number.isNaN(new Date(`${variationDate}T00:00:00Z`).getTime())) {
    throw new Error("Variation date must be a valid date");
  }

  const currency = String(variation.currency || "PHP").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Currency must be a 3-letter ISO code");
  }

  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("At least one variation line item is required");
  }

  const normalizedLines = lines.map((line, index): NormalizedVariationLineInput => {
    const desc = String(line.description || "").trim();
    if (!desc) throw new Error(`Line ${index + 1}: Description is required`);
    if (desc.length > VARIATION_LINE_DESC_MAX_LENGTH) {
      throw new Error(`Line ${index + 1}: Description must be ${VARIATION_LINE_DESC_MAX_LENGTH} characters or fewer`);
    }

    const rawAmount: unknown = line.amount;
    if (rawAmount === null || rawAmount === undefined || (typeof rawAmount === "string" && !rawAmount.trim())) {
      throw new Error(`Line ${index + 1}: Amount is required`);
    }
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount)) {
      throw new Error(`Line ${index + 1}: Amount must be a finite number`);
    }
    if (amount === 0) {
      throw new Error(`Line ${index + 1}: Amount cannot be zero`);
    }

    const rawQty: unknown = line.quantity;
    const quantity = rawQty === null || rawQty === undefined || (typeof rawQty === "string" && !rawQty.trim())
      ? null
      : Number(rawQty);
    if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) {
      throw new Error(`Line ${index + 1}: Quantity must be positive when provided`);
    }

    const rawRate: unknown = line.unitRate;
    const unitRate = rawRate === null || rawRate === undefined || (typeof rawRate === "string" && !rawRate.trim())
      ? null
      : Number(rawRate);
    if (unitRate !== null && (!Number.isFinite(unitRate) || unitRate < 0)) {
      throw new Error(`Line ${index + 1}: Unit rate must be non-negative when provided`);
    }

    const unit = line.unit == null || !String(line.unit).trim() ? null : String(line.unit).trim();
    if (unit && unit.length > VARIATION_LINE_UNIT_MAX_LENGTH) {
      throw new Error(`Line ${index + 1}: Unit must be ${VARIATION_LINE_UNIT_MAX_LENGTH} characters or fewer`);
    }

    return {
      id: line.id || undefined,
      description: desc,
      amount: roundMoney(amount),
      quantity,
      unit,
      unitRate,
      subcontractLineId: line.subcontractLineId ? String(line.subcontractLineId).trim() : null,
      projectCostCodeId: line.projectCostCodeId ? String(line.projectCostCodeId).trim() : null,
      notes: line.notes ? String(line.notes).trim() : null,
    };
  });

  return {
    subcontractId,
    projectId,
    variationNumber,
    title,
    description: variation.description ? String(variation.description).trim() : null,
    reason: variation.reason ? String(variation.reason).trim() : null,
    variationDate,
    currency,
    notes: variation.notes ? String(variation.notes).trim() : null,
    lines: normalizedLines,
  };
}

/** Build a validated local/demo variation draft without persisting it. */
export function buildLocalSubcontractVariation(
  variation: Partial<SubcontractVariation> & {
    subcontractId: string;
    projectId: string;
    variationNumber: string;
    title: string;
    currency?: string;
  },
  lines: Array<Partial<SubcontractVariationLine> & { description: string; amount: number }>,
  existing?: SubcontractVariation,
  companyId: string | null = null,
  now = new Date().toISOString(),
): SubcontractVariation {
  const normalized = normalizeVariationDraftInput(variation, lines);
  if (variation.status && variation.status !== "DRAFT") {
    throw new Error("Variations must be saved as DRAFT and transitioned through the guarded lifecycle");
  }

  const id = variation.id || globalThis.crypto?.randomUUID?.() || `scv-${Date.now()}`;
  const existingLinesById = new Map((existing?.lines || []).map((l) => [l.id, l]));

  const mappedLines: SubcontractVariationLine[] = normalized.lines.map((line, idx) => ({
    id: line.id || globalThis.crypto?.randomUUID?.() || `scvl-${id}-${idx + 1}`,
    companyId: companyId || existing?.companyId || undefined,
    projectId: normalized.projectId,
    variationId: id,
    subcontractId: normalized.subcontractId,
    lineNumber: idx + 1,
    description: line.description,
    amount: line.amount,
    quantity: line.quantity,
    unit: line.unit,
    unitRate: line.unitRate,
    subcontractLineId: line.subcontractLineId,
    projectCostCodeId: line.projectCostCodeId,
    notes: line.notes,
    createdAt: existingLinesById.get(line.id || "")?.createdAt || now,
    updatedAt: now,
  }));

  const netAmount = roundMoney(mappedLines.reduce((sum, l) => sum + l.amount, 0));

  return {
    id,
    companyId: companyId || existing?.companyId,
    subcontractId: normalized.subcontractId,
    projectId: normalized.projectId,
    variationNumber: normalized.variationNumber,
    title: normalized.title,
    description: normalized.description,
    reason: normalized.reason,
    variationDate: normalized.variationDate,
    status: "DRAFT",
    netAmount,
    currency: normalized.currency,
    notes: normalized.notes,
    rejectionReason: existing?.rejectionReason || null,
    cancellationReason: existing?.cancellationReason || null,
    lines: mappedLines,
    createdByUserId: existing?.createdByUserId || null,
    updatedByUserId: null,
    submittedByUserId: existing?.submittedByUserId || null,
    approvedByUserId: existing?.approvedByUserId || null,
    rejectedByUserId: existing?.rejectedByUserId || null,
    cancelledByUserId: existing?.cancelledByUserId || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    submittedAt: existing?.submittedAt || null,
    approvedAt: existing?.approvedAt || null,
    rejectedAt: existing?.rejectedAt || null,
    cancelledAt: existing?.cancelledAt || null,
  };
}

/** Apply the guarded lifecycle and over-claim rules to a local variation. */
export function applySubcontractVariationTransition(
  existing: SubcontractVariation,
  targetStatus: SubcontractVariationStatus,
  reason?: string,
  subcontract?: Subcontract,
  otherApprovedVariations: SubcontractVariation[] = [],
  approvedClaims: SubcontractProgressClaim[] = [],
  now = new Date().toISOString(),
): SubcontractVariation {
  const currentStatus = normalizeVariationStatus(existing.status);
  const normalizedTarget = normalizeVariationStatus(targetStatus);

  if (currentStatus === "APPROVED" || currentStatus === "REJECTED" || currentStatus === "CANCELLED") {
    throw new Error("Terminal variation cannot undergo further transitions");
  }

  const trimmedReason = reason?.trim() || "";

  if (currentStatus === "DRAFT") {
    if (normalizedTarget !== "SUBMITTED" && normalizedTarget !== "CANCELLED") {
      throw new Error("Draft variations can only be submitted or cancelled");
    }
    if (normalizedTarget === "CANCELLED" && !trimmedReason) {
      throw new Error("Cancellation reason is required when cancelling a variation");
    }
    return {
      ...existing,
      status: normalizedTarget,
      updatedAt: now,
      ...(normalizedTarget === "SUBMITTED" ? { submittedAt: now } : {}),
      ...(normalizedTarget === "CANCELLED" ? { cancelledAt: now, cancellationReason: trimmedReason } : {}),
    };
  }

  if (currentStatus === "SUBMITTED") {
    if (normalizedTarget !== "APPROVED" && normalizedTarget !== "REJECTED" && normalizedTarget !== "CANCELLED") {
      throw new Error("Submitted variations can only be approved, rejected, or cancelled");
    }
    if (normalizedTarget === "REJECTED" && !trimmedReason) {
      throw new Error("Rejection reason is required when rejecting a variation");
    }
    if (normalizedTarget === "CANCELLED" && !trimmedReason) {
      throw new Error("Cancellation reason is required when cancelling a variation");
    }

    if (normalizedTarget === "APPROVED") {
      if (subcontract && subcontract.status !== "APPROVED" && subcontract.status !== "ACTIVE") {
        throw new Error("Parent subcontract must be approved or active to approve variations");
      }

      // Check 1: Contract-level over-claim guard
      if (subcontract) {
        const otherApprovedTotal = otherApprovedVariations
          .filter((v) => v.id !== existing.id && v.status === "APPROVED")
          .reduce((sum, v) => sum + roundMoney(Number(v.netAmount || 0)), 0);

        const revisedValue = roundMoney(
          Number(subcontract.originalAmount || 0) + otherApprovedTotal + Number(existing.netAmount || 0),
        );

        const totalCertifiedGross = approvedClaims
          .filter((c) => c.status === "APPROVED")
          .reduce((sum, c) => sum + roundMoney(Number(c.approvedGrossAmount ?? c.claimedGrossAmount ?? 0)), 0);

        if (revisedValue < totalCertifiedGross) {
          throw new Error(
            `Cannot approve negative variation: revised subcontract value (${revisedValue}) would be less than certified claims gross (${totalCertifiedGross})`,
          );
        }
      }

      // Check 2: Line-level over-claim guard for negative variation lines referencing subcontract lines
      if (subcontract && existing.lines) {
        const scLinesById = new Map((subcontract.lines || []).map((l) => [l.id, l]));

        for (const vLine of existing.lines) {
          if (vLine.subcontractLineId && vLine.amount < 0) {
            const scLine = scLinesById.get(vLine.subcontractLineId);
            if (scLine) {
              // Approved claims on this line
              const lineClaims = approvedClaims
                .filter((c) => c.status === "APPROVED")
                .reduce((sum, c) => {
                  const matching = (c.lines || []).find((l) => l.subcontractLineId === vLine.subcontractLineId);
                  return sum + (matching ? roundMoney(Number(matching.approvedAmount)) : 0);
                }, 0);

              // Other approved variation lines on this line
              const otherVarAdjustments = otherApprovedVariations
                .filter((v) => v.id !== existing.id && v.status === "APPROVED")
                .reduce((sum, v) => {
                  const matchingLines = (v.lines || []).filter((l) => l.subcontractLineId === vLine.subcontractLineId);
                  return sum + matchingLines.reduce((s, l) => s + roundMoney(Number(l.amount)), 0);
                }, 0);

              const revisedLineScope = roundMoney(
                Number(scLine.amount) + otherVarAdjustments + Number(vLine.amount),
              );

              if (revisedLineScope < lineClaims) {
                throw new Error(
                  `Cannot approve negative variation: revised scope for subcontract line ${scLine.lineNumber} (${revisedLineScope}) would be less than certified amount (${lineClaims})`,
                );
              }
            }
          }
        }
      }

      return {
        ...existing,
        status: "APPROVED",
        approvedAt: now,
        updatedAt: now,
      };
    }

    if (normalizedTarget === "REJECTED") {
      return {
        ...existing,
        status: "REJECTED",
        rejectedAt: now,
        rejectionReason: trimmedReason,
        updatedAt: now,
      };
    }

    if (normalizedTarget === "CANCELLED") {
      return {
        ...existing,
        status: "CANCELLED",
        cancelledAt: now,
        cancellationReason: trimmedReason,
        updatedAt: now,
      };
    }
  }

  throw new Error(`Invalid subcontract variation transition from ${currentStatus} to ${normalizedTarget}`);
}

export function subcontractVariationLineFromRow(row: Row): SubcontractVariationLine {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    projectId: text(row.project_id) || undefined,
    variationId: String(row.variation_id),
    subcontractId: String(row.subcontract_id),
    lineNumber: numberValue(row.line_number, 1),
    description: String(row.description || ""),
    amount: numberValue(row.amount, 0),
    quantity: row.quantity != null ? numberValue(row.quantity) : null,
    unit: text(row.unit) || null,
    unitRate: row.unit_rate != null ? numberValue(row.unit_rate) : null,
    subcontractLineId: text(row.subcontract_line_id) || null,
    projectCostCodeId: text(row.project_cost_code_id) || null,
    notes: text(row.notes) || null,
    createdAt: text(row.created_at) || new Date().toISOString(),
    updatedAt: text(row.updated_at) || new Date().toISOString(),
  };
}

export function subcontractVariationFromRow(row: Row, lineRows: Row[] = []): SubcontractVariation {
  const lines = lineRows
    .map(subcontractVariationLineFromRow)
    .sort((a, b) => a.lineNumber - b.lineNumber);

  const netAmount = lines.length > 0
    ? roundMoney(lines.reduce((sum, l) => sum + roundMoney(Number(l.amount)), 0))
    : numberValue(row.net_amount, 0);

  return {
    id: String(row.id),
    companyId: text(row.company_id),
    subcontractId: String(row.subcontract_id || ""),
    projectId: String(row.project_id || ""),
    variationNumber: String(row.variation_number || "").toUpperCase(),
    title: String(row.title || ""),
    description: text(row.description) || null,
    reason: text(row.reason) || null,
    variationDate: text(row.variation_date) || new Date().toISOString().split("T")[0],
    status: normalizeVariationStatus(row.status),
    netAmount: roundMoney(netAmount),
    currency: String(row.currency || "PHP").toUpperCase(),
    notes: text(row.notes) || null,
    rejectionReason: text(row.rejection_reason) || null,
    cancellationReason: text(row.cancellation_reason) || null,
    lines,
    createdByUserId: text(row.created_by_user_id) || null,
    updatedByUserId: text(row.updated_by_user_id) || null,
    submittedByUserId: text(row.submitted_by_user_id) || null,
    approvedByUserId: text(row.approved_by_user_id) || null,
    rejectedByUserId: text(row.rejected_by_user_id) || null,
    cancelledByUserId: text(row.cancelled_by_user_id) || null,
    createdAt: text(row.created_at) || new Date().toISOString(),
    updatedAt: text(row.updated_at) || new Date().toISOString(),
    submittedAt: text(row.submitted_at) || null,
    approvedAt: text(row.approved_at) || null,
    rejectedAt: text(row.rejected_at) || null,
    cancelledAt: text(row.cancelled_at) || null,
  };
}

export function readSubcontractVariationsFromLocal(storage?: Storage): SubcontractVariation[] {
  const target = getStorage(storage);
  if (!target) return [];
  try {
    const raw = target.getItem(SUBCONTRACT_VARIATION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SubcontractVariation[]) : [];
  } catch {
    return [];
  }
}

export function writeSubcontractVariationsToLocal(variations: SubcontractVariation[], storage?: Storage): void {
  const target = getStorage(storage);
  if (!target) return;
  try {
    target.setItem(SUBCONTRACT_VARIATION_STORAGE_KEY, JSON.stringify(variations));
  } catch {
    /* ignore */
  }
}

export async function fetchSubcontractVariations(
  subcontractId?: string,
  projectId?: string,
): Promise<SubcontractVariation[]> {
  const companyId = getActiveCompanyId();

  if (!supabase) {
    const local = localRecordsForCompany(companyId).scoped;
    let filtered = local;
    if (subcontractId) filtered = filtered.filter((v) => v.subcontractId === subcontractId);
    if (projectId) filtered = filtered.filter((v) => v.projectId === projectId);
    return filtered;
  }
  assertPersistenceContext(companyId, "loading subcontract variations");

  let query = supabase
    .from("subcontract_variations")
    .select("*, subcontract_variation_lines(*)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (subcontractId) {
    query = query.eq("subcontract_id", subcontractId);
  }
  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((row) => {
    const lines = Array.isArray(row.subcontract_variation_lines) ? row.subcontract_variation_lines : [];
    return subcontractVariationFromRow(row as Row, lines as Row[]);
  });
}

export async function fetchSubcontractVariation(id: string): Promise<SubcontractVariation | null> {
  const companyId = getActiveCompanyId();

  if (!supabase) {
    const local = localRecordsForCompany(companyId).scoped;
    return local.find((v) => v.id === id) || null;
  }
  assertPersistenceContext(companyId, "loading a subcontract variation");

  const { data, error } = await supabase
    .from("subcontract_variations")
    .select("*, subcontract_variation_lines(*)")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const lines = Array.isArray(data.subcontract_variation_lines) ? data.subcontract_variation_lines : [];
  return subcontractVariationFromRow(data as Row, lines as Row[]);
}

export async function saveSubcontractVariation(
  variation: Partial<SubcontractVariation> & {
    subcontractId: string;
    projectId: string;
    variationNumber: string;
    title: string;
    currency?: string;
  },
  lines: Array<Partial<SubcontractVariationLine> & { description: string; amount: number }>,
): Promise<SubcontractVariation> {
  const companyId = getActiveCompanyId();
  const normalized = normalizeVariationDraftInput(variation, lines);
  assertPersistenceContext(companyId, "saving subcontract variations");

  if (!supabase) {
    const { all, scoped: local } = localRecordsForCompany(companyId);
    const existingIdx = variation.id ? local.findIndex((v) => v.id === variation.id) : -1;
    if (variation.id && existingIdx < 0) {
      throw new Error("Variation not found in company");
    }
    const existing = existingIdx >= 0 ? local[existingIdx] : undefined;
    if (existing && existing.status !== "DRAFT") {
      throw new Error("Only draft variations can be modified");
    }
    if (variation.status && variation.status !== "DRAFT") {
      throw new Error("Variations must be saved as DRAFT and transitioned through the guarded lifecycle");
    }
    if (
      local.some(
        (v) =>
          v.id !== variation.id &&
          v.subcontractId === normalized.subcontractId &&
          String(v.variationNumber || "").trim().toUpperCase() === normalized.variationNumber,
      )
    ) {
      throw new Error("Variation number already exists for this subcontract");
    }

    const saved = buildLocalSubcontractVariation(variation, lines, existing, companyId);

    if (existingIdx >= 0) {
      local[existingIdx] = saved;
    } else {
      local.unshift(saved);
    }
    writeScopedLocalRecords(local, companyId, all);
    return saved;
  }

  const { data, error } = await supabase.rpc("create_or_update_subcontract_variation", {
    p_variation: {
      id: variation.id || null,
      company_id: companyId,
      subcontract_id: normalized.subcontractId,
      variation_number: normalized.variationNumber,
      title: normalized.title,
      description: normalized.description,
      reason: normalized.reason,
      variation_date: normalized.variationDate,
      currency: normalized.currency,
      notes: normalized.notes,
    },
    p_lines: normalized.lines.map((l, idx) => ({
      id: l.id || null,
      line_number: idx + 1,
      description: l.description,
      amount: l.amount,
      quantity: l.quantity ?? null,
      unit: l.unit ?? null,
      unit_rate: l.unitRate ?? null,
      subcontract_line_id: l.subcontractLineId ?? null,
      project_cost_code_id: l.projectCostCodeId ?? null,
      notes: l.notes ?? null,
    })),
  });

  if (error) throw error;
  const result = data as { variation: Row; lines: Row[] };
  return subcontractVariationFromRow(result.variation, result.lines || []);
}

export async function transitionSubcontractVariation(
  id: string,
  targetStatus: SubcontractVariationStatus,
  reason?: string,
  subcontract?: Subcontract,
  otherApprovedVariations: SubcontractVariation[] = [],
  approvedClaims: SubcontractProgressClaim[] = [],
): Promise<SubcontractVariation> {
  const companyId = getActiveCompanyId();
  assertPersistenceContext(companyId, "transitioning subcontract variation lifecycle");

  if (!supabase) {
    const { all, scoped: local } = localRecordsForCompany(companyId);
    const idx = local.findIndex((v) => v.id === id);
    if (idx < 0) throw new Error("Variation not found");
    const existing = local[idx];

    const updated = applySubcontractVariationTransition(
      existing,
      targetStatus,
      reason,
      subcontract,
      otherApprovedVariations,
      approvedClaims,
    );

    local[idx] = updated;
    writeScopedLocalRecords(local, companyId, all);
    return updated;
  }

  const { data, error } = await supabase.rpc("transition_subcontract_variation", {
    p_variation_id: id,
    p_target_status: targetStatus,
    p_reason: reason?.trim() || null,
  });

  if (error) throw error;
  const result = data as { variation: Row; lines: Row[] };
  return subcontractVariationFromRow(result.variation, result.lines || []);
}

export async function deleteDraftSubcontractVariation(id: string): Promise<void> {
  const companyId = getActiveCompanyId();
  assertPersistenceContext(companyId, "deleting a draft variation");

  if (!supabase) {
    const { all, scoped: local } = localRecordsForCompany(companyId);
    const existing = local.find((v) => v.id === id);
    if (!existing) return;
    if (existing.status !== "DRAFT") {
      throw new Error("Only draft variations may be deleted");
    }
    const filtered = local.filter((v) => v.id !== id);
    writeScopedLocalRecords(filtered, companyId, all);
    return;
  }

  const { error } = await supabase.rpc("delete_draft_subcontract_variation", {
    p_variation_id: id,
  });

  if (error) throw error;
}
