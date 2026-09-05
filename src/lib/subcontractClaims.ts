import type {
  Subcontract,
  SubcontractProgressClaim,
  SubcontractProgressClaimLine,
  SubcontractProgressClaimStatus,
  SubcontractVariation,
  SubcontractVariationLine,
} from "../types.ts";
import { supabase } from "./supabase.ts";
import { getActiveCompanyId } from "./companyContext.ts";
import { calculateNetApprovedVariations } from "./subcontractVariations.ts";
import { BRAND } from "../config/brand.ts";

export const SUBCONTRACT_CLAIM_STORAGE_KEY = "engineering_subcontract_progress_claims";

export function roundMoney(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

export function calculateRetention(
  approvedGross: number,
  retentionRate: number,
): { retentionAmount: number; netCertifiedAmount: number } {
  const safeGross = Math.max(0, roundMoney(approvedGross));
  const safeRate = Number.isFinite(retentionRate) ? Math.max(0, Math.min(1, retentionRate)) : 0;
  const retentionAmount = roundMoney(safeGross * safeRate);
  const netCertifiedAmount = roundMoney(Math.max(0, safeGross - retentionAmount));
  return { retentionAmount, netCertifiedAmount };
}

type Row = Record<string, unknown>;

const CLAIM_STATUSES: readonly SubcontractProgressClaimStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "VOIDED",
];

const CLAIM_NUMBER_MAX_LENGTH = 60;
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

export function clearSubcontractClaimMemoryStore(): void {
  memoryStore.clear();
}

function text(value: unknown): string | undefined {
  return value === null || value === undefined || value === "" ? undefined : String(value);
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeClaimStatus(value: unknown): SubcontractProgressClaimStatus {
  const status = String(value || "DRAFT").trim().toUpperCase();
  if (!CLAIM_STATUSES.includes(status as SubcontractProgressClaimStatus)) {
    throw new Error(`Invalid subcontract progress claim status: ${status}`);
  }
  return status as SubcontractProgressClaimStatus;
}

function assertPersistenceContext(companyId: string | null, operation: string): void {
  if (supabase && !companyId) {
    throw new Error(`Resolve the ${BRAND.productName} deployment company before ${operation}.`);
  }
}

function localRecordsForCompany(companyId: string | null): { all: SubcontractProgressClaim[]; scoped: SubcontractProgressClaim[] } {
  const all = readSubcontractClaimsFromLocal();
  return {
    all,
    scoped: companyId ? all.filter((claim) => claim.companyId === companyId) : all,
  };
}

function writeScopedLocalRecords(claims: SubcontractProgressClaim[], companyId: string | null, allRecords: SubcontractProgressClaim[]): void {
  if (!companyId) {
    writeSubcontractClaimsToLocal(claims);
    return;
  }
  const otherCompanyRecords = allRecords.filter((claim) => claim.companyId !== companyId);
  writeSubcontractClaimsToLocal([...claims, ...otherCompanyRecords]);
}

export interface NormalizedClaimLineInput {
  id?: string;
  subcontractLineId?: string | null;
  subcontractVariationLineId?: string | null;
  claimedAmount: number;
  approvedAmount?: number;
  notes?: string | null;
}

export function normalizeClaimDraftInput(
  claim: Partial<SubcontractProgressClaim> & {
    subcontractId: string;
    projectId: string;
    claimNumber: string;
    valuationDate: string;
  },
  lines: Array<Partial<SubcontractProgressClaimLine> & { claimedAmount: number }>,
): {
  subcontractId: string;
  projectId: string;
  claimNumber: string;
  valuationDate: string;
  periodStart: string | null;
  periodEnd: string | null;
  retentionRate: number;
  notes: string | null;
  lines: NormalizedClaimLineInput[];
} {
  const subcontractId = String(claim.subcontractId || "").trim();
  if (!subcontractId) throw new Error("Subcontract reference is required");

  const projectId = String(claim.projectId || "").trim();
  if (!projectId) throw new Error("Project reference is required");

  const claimNumber = String(claim.claimNumber || "").trim().toUpperCase();
  if (!claimNumber) throw new Error("Claim number is required");
  if (claimNumber.length > CLAIM_NUMBER_MAX_LENGTH) {
    throw new Error(`Claim number must be ${CLAIM_NUMBER_MAX_LENGTH} characters or fewer`);
  }

  const normalizeDate = (value: unknown, label: string): string => {
    const normalized = value == null ? "" : String(value).trim();
    if (!normalized) throw new Error(`${label} is required`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(new Date(`${normalized}T00:00:00Z`).getTime())) {
      throw new Error(`${label} must be a valid date`);
    }
    return normalized;
  };

  const normalizeOptionalDate = (value: unknown, label: string): string | null => {
    const normalized = value == null ? "" : String(value).trim();
    if (!normalized) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(new Date(`${normalized}T00:00:00Z`).getTime())) {
      throw new Error(`${label} must be a valid date`);
    }
    return normalized;
  };

  const valuationDate = normalizeDate(claim.valuationDate, "Valuation date");
  const periodStart = normalizeOptionalDate(claim.periodStart, "Period start date");
  const periodEnd = normalizeOptionalDate(claim.periodEnd, "Period end date");
  if (periodStart && periodEnd && periodEnd < periodStart) {
    throw new Error("Period end date cannot be before the period start date");
  }

  const rawRate = Number(claim.retentionRate ?? 0);
  if (!Number.isFinite(rawRate) || rawRate < 0 || rawRate > 1) {
    throw new Error("Retention rate must be between 0% and 100%");
  }
  const retentionRate = Math.round(rawRate * 10000) / 10000;

  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("At least one progress claim line is required");
  }

  const normalizedLines = lines.map((line, index): NormalizedClaimLineInput => {
    const sclId = line.subcontractLineId ? String(line.subcontractLineId).trim() : null;
    const scvlId = line.subcontractVariationLineId ? String(line.subcontractVariationLineId).trim() : null;

    if (!sclId && !scvlId) {
      throw new Error(`Line ${index + 1}: Either a subcontract scope line or a variation line reference is required`);
    }
    if (sclId && scvlId) {
      throw new Error(`Line ${index + 1}: Cannot specify both a subcontract line and a variation line`);
    }

    const rawAmount: unknown = line.claimedAmount;
    if (rawAmount === null || rawAmount === undefined || (typeof rawAmount === "string" && !rawAmount.trim())) {
      throw new Error(`Line ${index + 1}: Claimed amount must be a non-negative number`);
    }
    const claimedAmount = Number(rawAmount);
    if (!Number.isFinite(claimedAmount) || claimedAmount < 0) {
      throw new Error(`Line ${index + 1}: Claimed amount must be a non-negative number`);
    }

    return {
      id: line.id || undefined,
      subcontractLineId: sclId,
      subcontractVariationLineId: scvlId,
      claimedAmount: roundMoney(claimedAmount),
      approvedAmount: line.approvedAmount != null ? roundMoney(Number(line.approvedAmount)) : 0,
      notes: line.notes == null || !String(line.notes).trim() ? null : String(line.notes).trim(),
    };
  });

  return {
    subcontractId,
    projectId,
    claimNumber,
    valuationDate,
    periodStart,
    periodEnd,
    retentionRate,
    notes: claim.notes == null || !String(claim.notes).trim() ? null : String(claim.notes).trim(),
    lines: normalizedLines,
  };
}

/** Build a validated local/demo claim draft without persisting it. */
export function buildLocalSubcontractClaim(
  claim: Partial<SubcontractProgressClaim> & {
    subcontractId: string;
    projectId: string;
    claimNumber: string;
    valuationDate: string;
  },
  lines: Array<Partial<SubcontractProgressClaimLine> & { claimedAmount: number }>,
  existing?: SubcontractProgressClaim,
  companyId: string | null = null,
  now = new Date().toISOString(),
): SubcontractProgressClaim {
  const normalized = normalizeClaimDraftInput(claim, lines);
  if (claim.status && claim.status !== "DRAFT") {
    throw new Error("Progress claims must be saved as DRAFT and transitioned through the guarded lifecycle");
  }

  const id = claim.id || globalThis.crypto?.randomUUID?.() || `scc-${Date.now()}`;
  const existingLinesById = new Map((existing?.lines || []).map((l) => [l.id, l]));

  const mappedLines: SubcontractProgressClaimLine[] = normalized.lines.map((line, idx) => ({
    id: line.id || globalThis.crypto?.randomUUID?.() || `sccl-${id}-${idx + 1}`,
    companyId: companyId || existing?.companyId || undefined,
    claimId: id,
    subcontractLineId: line.subcontractLineId || null,
    subcontractVariationLineId: line.subcontractVariationLineId || null,
    lineNumber: idx + 1,
    claimedAmount: line.claimedAmount,
    approvedAmount: line.approvedAmount ?? 0,
    notes: line.notes || null,
    createdAt: existingLinesById.get(line.id || "")?.createdAt || now,
    updatedAt: now,
  }));

  const claimedGrossAmount = roundMoney(mappedLines.reduce((sum, l) => sum + l.claimedAmount, 0));
  const approvedGrossAmount = roundMoney(mappedLines.reduce((sum, l) => sum + (l.approvedAmount || 0), 0));
  const { retentionAmount, netCertifiedAmount } = calculateRetention(approvedGrossAmount, normalized.retentionRate);

  return {
    id,
    companyId: companyId || existing?.companyId,
    subcontractId: normalized.subcontractId,
    projectId: normalized.projectId,
    claimNumber: normalized.claimNumber,
    valuationDate: normalized.valuationDate,
    periodStart: normalized.periodStart,
    periodEnd: normalized.periodEnd,
    status: "DRAFT",
    retentionRate: normalized.retentionRate,
    claimedGrossAmount,
    approvedGrossAmount,
    retentionAmount,
    netCertifiedAmount,
    notes: normalized.notes,
    rejectionReason: existing?.rejectionReason || null,
    cancellationReason: existing?.cancellationReason || null,
    voidReason: existing?.voidReason || null,
    lines: mappedLines,
    createdByUserId: existing?.createdByUserId || null,
    updatedByUserId: null,
    submittedByUserId: existing?.submittedByUserId || null,
    approvedByUserId: existing?.approvedByUserId || null,
    rejectedByUserId: existing?.rejectedByUserId || null,
    cancelledByUserId: existing?.cancelledByUserId || null,
    voidedByUserId: existing?.voidedByUserId || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    submittedAt: existing?.submittedAt || null,
    approvedAt: existing?.approvedAt || null,
    rejectedAt: existing?.rejectedAt || null,
    cancelledAt: existing?.cancelledAt || null,
    voidedAt: existing?.voidedAt || null,
  };
}

export interface LineApprovalInput {
  claimLineId: string;
  approvedAmount: number;
}

/** Apply the same guarded lifecycle and over-claim rules used by the claim RPC to a local record. */
export function applySubcontractClaimTransition(
  existing: SubcontractProgressClaim,
  targetStatus: SubcontractProgressClaimStatus,
  reason?: string,
  lineApprovals?: LineApprovalInput[],
  subcontract?: Subcontract,
  otherApprovedClaims: SubcontractProgressClaim[] = [],
  approvedVariations: SubcontractVariation[] = [],
  now = new Date().toISOString(),
): SubcontractProgressClaim {
  const currentStatus = normalizeClaimStatus(existing.status);
  const normalizedTarget = normalizeClaimStatus(targetStatus);

  if (currentStatus === "REJECTED" || currentStatus === "CANCELLED" || currentStatus === "VOIDED") {
    throw new Error("Terminal claims cannot undergo further transitions");
  }

  const trimmedReason = reason?.trim() || "";

  if (currentStatus === "DRAFT") {
    if (normalizedTarget !== "SUBMITTED" && normalizedTarget !== "CANCELLED") {
      throw new Error("Draft claims can only be submitted or cancelled");
    }
    if (normalizedTarget === "CANCELLED" && !trimmedReason) {
      throw new Error("Cancellation reason is required when cancelling a claim");
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
      throw new Error("Submitted claims can only be approved, rejected, or cancelled");
    }
    if (normalizedTarget === "REJECTED" && !trimmedReason) {
      throw new Error("Rejection reason is required when rejecting a claim");
    }
    if (normalizedTarget === "CANCELLED" && !trimmedReason) {
      throw new Error("Cancellation reason is required when cancelling a claim");
    }

    if (normalizedTarget === "APPROVED") {
      const approvalMap = new Map((lineApprovals || []).map((la) => [la.claimLineId, roundMoney(Number(la.approvedAmount))]));
      const scLinesById = new Map((subcontract?.lines || []).map((l) => [l.id, l]));

      const updatedLines: SubcontractProgressClaimLine[] = (existing.lines || []).map((line) => {
        const approvedAmount = approvalMap.has(line.id)
          ? approvalMap.get(line.id)!
          : line.claimedAmount;

        if (approvedAmount < 0) {
          throw new Error(`Approved amount cannot be negative for line ${line.lineNumber}`);
        }
        if (approvedAmount > line.claimedAmount) {
          throw new Error(`Approved amount (${approvedAmount}) exceeds claimed amount (${line.claimedAmount}) for line ${line.lineNumber}`);
        }

        // Check cumulative approved across non-voided approved claims for this line
        if (line.subcontractLineId) {
          const scLine = scLinesById.get(line.subcontractLineId);
          if (scLine) {
            const prevApprovedForLine = otherApprovedClaims
              .filter((c) => c.status === "APPROVED" && c.id !== existing.id)
              .reduce((sum, c) => {
                const matchingLine = (c.lines || []).find((l) => l.subcontractLineId === line.subcontractLineId);
                return sum + (matchingLine ? roundMoney(Number(matchingLine.approvedAmount)) : 0);
              }, 0);

            const varAdjustmentsOnLine = approvedVariations
              .filter((v) => v.status === "APPROVED")
              .reduce((sum, v) => {
                const matching = (v.lines || []).filter((l) => l.subcontractLineId === line.subcontractLineId);
                return sum + matching.reduce((s, l) => s + roundMoney(Number(l.amount)), 0);
              }, 0);

            const effectiveScLineAmount = roundMoney(Number(scLine.amount) + varAdjustmentsOnLine);

            if (roundMoney(prevApprovedForLine + approvedAmount) > effectiveScLineAmount) {
              throw new Error(
                `Cumulative approved amount (${roundMoney(prevApprovedForLine + approvedAmount)}) exceeds subcontract line ${line.lineNumber} revised amount (${effectiveScLineAmount})`,
              );
            }
          }
        }

        if (line.subcontractVariationLineId) {
          let varLine: SubcontractVariationLine | undefined;
          for (const v of approvedVariations) {
            if (v.status === "APPROVED") {
              const found = (v.lines || []).find((l) => l.id === line.subcontractVariationLineId);
              if (found) {
                varLine = found;
                break;
              }
            }
          }

          if (!varLine) {
            throw new Error(`Line ${line.lineNumber}: Cannot claim unapproved variation scope`);
          }
          if (varLine.amount <= 0) {
            throw new Error(`Line ${line.lineNumber}: Cannot claim negative or zero variation line`);
          }

          const prevApprovedForVarLine = otherApprovedClaims
            .filter((c) => c.status === "APPROVED" && c.id !== existing.id)
            .reduce((sum, c) => {
              const matchingLine = (c.lines || []).find((l) => l.subcontractVariationLineId === line.subcontractVariationLineId);
              return sum + (matchingLine ? roundMoney(Number(matchingLine.approvedAmount)) : 0);
            }, 0);

          if (roundMoney(prevApprovedForVarLine + approvedAmount) > roundMoney(Number(varLine.amount))) {
            throw new Error(
              `Cumulative approved amount (${roundMoney(prevApprovedForVarLine + approvedAmount)}) exceeds variation line amount (${varLine.amount})`,
            );
          }
        }

        return {
          ...line,
          approvedAmount,
          updatedAt: now,
        };
      });

      const approvedGrossAmount = roundMoney(updatedLines.reduce((sum, l) => sum + l.approvedAmount, 0));

      // Check cumulative approved gross across whole subcontract
      if (subcontract) {
        const prevHeaderApproved = otherApprovedClaims
          .filter((c) => c.status === "APPROVED" && c.id !== existing.id)
          .reduce((sum, c) => sum + roundMoney(Number(c.approvedGrossAmount)), 0);

        const revisedSubcontractValue = roundMoney(
          Number(subcontract.originalAmount) + calculateNetApprovedVariations(approvedVariations),
        );

        if (roundMoney(prevHeaderApproved + approvedGrossAmount) > revisedSubcontractValue) {
          throw new Error(
            `Cumulative approved claims (${roundMoney(prevHeaderApproved + approvedGrossAmount)}) exceeds revised subcontract value (${revisedSubcontractValue})`,
          );
        }
      }

      const { retentionAmount, netCertifiedAmount } = calculateRetention(approvedGrossAmount, existing.retentionRate);

      return {
        ...existing,
        status: "APPROVED",
        approvedGrossAmount,
        retentionAmount,
        netCertifiedAmount,
        lines: updatedLines,
        approvedAt: now,
        updatedAt: now,
      };
    }

    return {
      ...existing,
      status: normalizedTarget,
      updatedAt: now,
      ...(normalizedTarget === "REJECTED" ? { rejectedAt: now, rejectionReason: trimmedReason } : {}),
      ...(normalizedTarget === "CANCELLED" ? { cancelledAt: now, cancellationReason: trimmedReason } : {}),
    };
  }

  if (currentStatus === "APPROVED") {
    if (normalizedTarget !== "VOIDED") {
      throw new Error("Approved claims can only be voided");
    }
    if (!trimmedReason) {
      throw new Error("Void reason is required when voiding an approved claim");
    }

    return {
      ...existing,
      status: "VOIDED",
      voidReason: trimmedReason,
      voidedAt: now,
      updatedAt: now,
    };
  }

  throw new Error(`Invalid subcontract claim transition from ${currentStatus} to ${normalizedTarget}`);
}

export function subcontractClaimLineFromRow(row: Row): SubcontractProgressClaimLine {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    claimId: String(row.claim_id),
    subcontractLineId: text(row.subcontract_line_id) || null,
    subcontractVariationLineId: text(row.subcontract_variation_line_id) || null,
    lineNumber: numberValue(row.line_number, 1),
    claimedAmount: numberValue(row.claimed_amount, 0),
    approvedAmount: numberValue(row.approved_amount, 0),
    notes: text(row.notes) || null,
    createdAt: text(row.created_at) || new Date().toISOString(),
    updatedAt: text(row.updated_at) || new Date().toISOString(),
  };
}

export function subcontractClaimFromRow(row: Row, lineRows: Row[] = []): SubcontractProgressClaim {
  const lines = lineRows
    .map(subcontractClaimLineFromRow)
    .sort((a, b) => a.lineNumber - b.lineNumber);

  const claimedGross = lines.length > 0
    ? roundMoney(lines.reduce((sum, l) => sum + l.claimedAmount, 0))
    : numberValue(row.claimed_gross_amount, 0);

  const approvedGross = lines.length > 0
    ? roundMoney(lines.reduce((sum, l) => sum + l.approvedAmount, 0))
    : numberValue(row.approved_gross_amount, 0);

  const retentionRate = numberValue(row.retention_rate, 0);
  const { retentionAmount, netCertifiedAmount } = calculateRetention(approvedGross, retentionRate);

  return {
    id: String(row.id),
    companyId: text(row.company_id),
    subcontractId: String(row.subcontract_id),
    projectId: String(row.project_id),
    claimNumber: String(row.claim_number || "").toUpperCase(),
    valuationDate: String(row.valuation_date || ""),
    periodStart: text(row.period_start) || null,
    periodEnd: text(row.period_end) || null,
    status: normalizeClaimStatus(row.status),
    retentionRate,
    claimedGrossAmount: roundMoney(claimedGross),
    approvedGrossAmount: roundMoney(approvedGross),
    retentionAmount: roundMoney(numberValue(row.retention_amount, retentionAmount)),
    netCertifiedAmount: roundMoney(numberValue(row.net_certified_amount, netCertifiedAmount)),
    notes: text(row.notes) || null,
    rejectionReason: text(row.rejection_reason) || null,
    cancellationReason: text(row.cancellation_reason) || null,
    voidReason: text(row.void_reason) || null,
    lines,
    createdByUserId: text(row.created_by_user_id) || null,
    updatedByUserId: text(row.updated_by_user_id) || null,
    submittedByUserId: text(row.submitted_by_user_id) || null,
    approvedByUserId: text(row.approved_by_user_id) || null,
    rejectedByUserId: text(row.rejected_by_user_id) || null,
    cancelledByUserId: text(row.cancelled_by_user_id) || null,
    voidedByUserId: text(row.voided_by_user_id) || null,
    createdAt: text(row.created_at) || new Date().toISOString(),
    updatedAt: text(row.updated_at) || new Date().toISOString(),
    submittedAt: text(row.submitted_at) || null,
    approvedAt: text(row.approved_at) || null,
    rejectedAt: text(row.rejected_at) || null,
    cancelledAt: text(row.cancelled_at) || null,
    voidedAt: text(row.voided_at) || null,
  };
}

export function readSubcontractClaimsFromLocal(storage?: Storage): SubcontractProgressClaim[] {
  const target = getStorage(storage);
  if (!target) return [];
  try {
    const raw = target.getItem(SUBCONTRACT_CLAIM_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SubcontractProgressClaim[]) : [];
  } catch {
    return [];
  }
}

export function writeSubcontractClaimsToLocal(claims: SubcontractProgressClaim[], storage?: Storage): void {
  const target = getStorage(storage);
  if (!target) return;
  try {
    target.setItem(SUBCONTRACT_CLAIM_STORAGE_KEY, JSON.stringify(claims));
  } catch {
    /* ignore */
  }
}

export interface SubcontractClaimMetrics {
  originalAmount: number;
  netApprovedVariations: number;
  revisedSubcontractValue: number;
  cumulativeApprovedGross: number;
  remainingCommitment: number;
  cumulativeRetentionHeld: number;
  cumulativeNetCertified: number;
  claimsCount: number;
  approvedClaimsCount: number;
  pendingClaimsCount: number;
  lines: Map<string, {
    subcontractLineId: string;
    lineAmount: number;
    variationAdjustment: number;
    revisedLineAmount: number;
    cumulativeApproved: number;
    remainingClaimable: number;
  }>;
  variationLines: Map<string, {
    variationLineId: string;
    variationNumber: string;
    lineAmount: number;
    cumulativeApproved: number;
    remainingClaimable: number;
  }>;
}

export function computeSubcontractClaimMetrics(
  subcontract: Subcontract,
  claims: SubcontractProgressClaim[] = [],
  variations: SubcontractVariation[] = [],
): SubcontractClaimMetrics {
  const scClaims = claims.filter((c) => c.subcontractId === subcontract.id);
  const approvedClaims = scClaims.filter((c) => c.status === "APPROVED");
  const pendingClaims = scClaims.filter((c) => c.status === "SUBMITTED");

  const scVariations = variations.filter((v) => v.subcontractId === subcontract.id);
  const approvedVariations = scVariations.filter((v) => v.status === "APPROVED");
  const netApprovedVariations = calculateNetApprovedVariations(approvedVariations);

  const originalAmount = roundMoney(Number(subcontract.originalAmount || 0));
  const revisedSubcontractValue = roundMoney(originalAmount + netApprovedVariations);
  const cumulativeApprovedGross = roundMoney(approvedClaims.reduce((sum, c) => sum + roundMoney(Number(c.approvedGrossAmount || 0)), 0));
  const remainingCommitment = roundMoney(Math.max(0, revisedSubcontractValue - cumulativeApprovedGross));
  const cumulativeRetentionHeld = roundMoney(approvedClaims.reduce((sum, c) => sum + roundMoney(Number(c.retentionAmount || 0)), 0));
  const cumulativeNetCertified = roundMoney(approvedClaims.reduce((sum, c) => sum + roundMoney(Number(c.netCertifiedAmount || 0)), 0));

  const lineMetrics = new Map<string, {
    subcontractLineId: string;
    lineAmount: number;
    variationAdjustment: number;
    revisedLineAmount: number;
    cumulativeApproved: number;
    remainingClaimable: number;
  }>();

  for (const line of subcontract.lines || []) {
    const lineAmount = roundMoney(Number(line.amount || 0));
    const variationAdjustment = roundMoney(
      approvedVariations.reduce((sum, v) => {
        const matchingLines = (v.lines || []).filter((vl) => vl.subcontractLineId === line.id);
        return sum + matchingLines.reduce((s, vl) => s + roundMoney(Number(vl.amount || 0)), 0);
      }, 0),
    );
    const revisedLineAmount = roundMoney(Math.max(0, lineAmount + variationAdjustment));

    const cumulativeApproved = roundMoney(
      approvedClaims.reduce((sum, c) => {
        const claimLine = (c.lines || []).find((cl) => cl.subcontractLineId === line.id);
        return sum + (claimLine ? roundMoney(Number(claimLine.approvedAmount || 0)) : 0);
      }, 0),
    );
    const remainingClaimable = roundMoney(Math.max(0, revisedLineAmount - cumulativeApproved));

    lineMetrics.set(line.id, {
      subcontractLineId: line.id,
      lineAmount,
      variationAdjustment,
      revisedLineAmount,
      cumulativeApproved,
      remainingClaimable,
    });
  }

  const variationLinesMetrics = new Map<string, {
    variationLineId: string;
    variationNumber: string;
    lineAmount: number;
    cumulativeApproved: number;
    remainingClaimable: number;
  }>();

  for (const v of approvedVariations) {
    for (const vl of v.lines || []) {
      // Standalone variation lines (not linked to an existing subcontract scope line)
      if (!vl.subcontractLineId && Number(vl.amount || 0) > 0) {
        const lineAmount = roundMoney(Number(vl.amount || 0));
        const cumulativeApproved = roundMoney(
          approvedClaims.reduce((sum, c) => {
            const claimLine = (c.lines || []).find((cl) => cl.subcontractVariationLineId === vl.id);
            return sum + (claimLine ? roundMoney(Number(claimLine.approvedAmount || 0)) : 0);
          }, 0),
        );
        const remainingClaimable = roundMoney(Math.max(0, lineAmount - cumulativeApproved));

        variationLinesMetrics.set(vl.id, {
          variationLineId: vl.id,
          variationNumber: v.variationNumber,
          lineAmount,
          cumulativeApproved,
          remainingClaimable,
        });
      }
    }
  }

  return {
    originalAmount,
    netApprovedVariations,
    revisedSubcontractValue,
    cumulativeApprovedGross,
    remainingCommitment,
    cumulativeRetentionHeld,
    cumulativeNetCertified,
    claimsCount: scClaims.length,
    approvedClaimsCount: approvedClaims.length,
    pendingClaimsCount: pendingClaims.length,
    lines: lineMetrics,
    variationLines: variationLinesMetrics,
  };
}

export async function fetchSubcontractClaims(subcontractId?: string, projectId?: string): Promise<SubcontractProgressClaim[]> {
  const companyId = getActiveCompanyId();

  if (!supabase) {
    const local = localRecordsForCompany(companyId).scoped;
    return local.filter((claim) => {
      if (subcontractId && claim.subcontractId !== subcontractId) return false;
      if (projectId && claim.projectId !== projectId) return false;
      return true;
    });
  }
  assertPersistenceContext(companyId, "loading subcontract progress claims");

  let query = supabase
    .from("subcontract_progress_claims")
    .select("*, subcontract_progress_claim_lines(*)")
    .eq("company_id", companyId)
    .order("valuation_date", { ascending: false });

  if (subcontractId) query = query.eq("subcontract_id", subcontractId);
  if (projectId) query = query.eq("project_id", projectId);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((row) => {
    const lines = Array.isArray(row.subcontract_progress_claim_lines) ? row.subcontract_progress_claim_lines : [];
    return subcontractClaimFromRow(row as Row, lines as Row[]);
  });
}

export async function fetchSubcontractClaim(id: string): Promise<SubcontractProgressClaim | null> {
  const companyId = getActiveCompanyId();

  if (!supabase) {
    const local = localRecordsForCompany(companyId).scoped;
    return local.find((claim) => claim.id === id) || null;
  }
  assertPersistenceContext(companyId, "loading a subcontract progress claim");

  const { data, error } = await supabase
    .from("subcontract_progress_claims")
    .select("*, subcontract_progress_claim_lines(*)")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const lines = Array.isArray(data.subcontract_progress_claim_lines) ? data.subcontract_progress_claim_lines : [];
  return subcontractClaimFromRow(data as Row, lines as Row[]);
}

export async function saveSubcontractClaim(
  claim: Partial<SubcontractProgressClaim> & {
    subcontractId: string;
    projectId: string;
    claimNumber: string;
    valuationDate: string;
  },
  lines: Array<Partial<SubcontractProgressClaimLine> & { subcontractLineId?: string; subcontractVariationLineId?: string; claimedAmount: number }>,
): Promise<SubcontractProgressClaim> {
  const companyId = getActiveCompanyId();
  const normalized = normalizeClaimDraftInput(claim, lines);
  assertPersistenceContext(companyId, "saving subcontract progress claims");

  if (!supabase) {
    const { all, scoped: local } = localRecordsForCompany(companyId);
    const existingIdx = claim.id ? local.findIndex((c) => c.id === claim.id) : -1;
    if (claim.id && existingIdx < 0) {
      throw new Error("Progress claim not found in company");
    }
    const existing = existingIdx >= 0 ? local[existingIdx] : undefined;
    if (existing && existing.status !== "DRAFT") {
      throw new Error("Only draft progress claims can be modified");
    }
    if (claim.status && claim.status !== "DRAFT") {
      throw new Error("Progress claims must be saved as DRAFT and transitioned through the guarded lifecycle");
    }
    if (
      local.some(
        (c) =>
          c.id !== claim.id &&
          c.subcontractId === normalized.subcontractId &&
          String(c.claimNumber || "").trim().toUpperCase() === normalized.claimNumber,
      )
    ) {
      throw new Error("Claim number already exists for this subcontract");
    }

    const saved = buildLocalSubcontractClaim(claim, lines, existing, companyId);
    if (existingIdx >= 0) {
      local[existingIdx] = saved;
    } else {
      local.unshift(saved);
    }
    writeScopedLocalRecords(local, companyId, all);
    return saved;
  }

  const { data, error } = await supabase.rpc("create_or_update_subcontract_claim", {
    p_claim: {
      id: claim.id || null,
      company_id: companyId,
      subcontract_id: normalized.subcontractId,
      project_id: normalized.projectId,
      claim_number: normalized.claimNumber,
      valuation_date: normalized.valuationDate,
      period_start: normalized.periodStart,
      period_end: normalized.periodEnd,
      retention_rate: normalized.retentionRate,
      notes: normalized.notes,
    },
    p_lines: normalized.lines.map((l) => ({
      id: l.id || null,
      subcontract_line_id: l.subcontractLineId || null,
      subcontract_variation_line_id: l.subcontractVariationLineId || null,
      claimed_amount: l.claimedAmount,
      notes: l.notes,
    })),
  });

  if (error) throw error;
  const result = data as { claim: Row; lines: Row[] };
  return subcontractClaimFromRow(result.claim, result.lines || []);
}

export async function transitionSubcontractClaim(
  id: string,
  targetStatus: SubcontractProgressClaimStatus,
  reason?: string,
  lineApprovals?: LineApprovalInput[],
  subcontract?: Subcontract,
  approvedVariations: SubcontractVariation[] = [],
): Promise<SubcontractProgressClaim> {
  const companyId = getActiveCompanyId();
  assertPersistenceContext(companyId, "transitioning progress claim lifecycle status");

  if (!supabase) {
    const { all, scoped: local } = localRecordsForCompany(companyId);
    const idx = local.findIndex((c) => c.id === id);
    if (idx < 0) throw new Error("Progress claim not found");
    const existing = local[idx];

    const otherClaims = local.filter((c) => c.subcontractId === existing.subcontractId && c.id !== existing.id);
    const updated = applySubcontractClaimTransition(
      existing,
      targetStatus,
      reason,
      lineApprovals,
      subcontract,
      otherClaims,
      approvedVariations,
    );

    local[idx] = updated;
    writeScopedLocalRecords(local, companyId, all);
    return updated;
  }

  const { data, error } = await supabase.rpc("transition_subcontract_claim", {
    p_claim_id: id,
    p_target_status: targetStatus,
    p_reason: reason?.trim() || null,
    p_line_approvals: lineApprovals
      ? lineApprovals.map((la) => ({
          claim_line_id: la.claimLineId,
          approved_amount: roundMoney(Number(la.approvedAmount)),
        }))
      : null,
  });

  if (error) throw error;
  const result = data as { claim: Row; lines: Row[] };
  return subcontractClaimFromRow(result.claim, result.lines || []);
}

export async function deleteDraftSubcontractClaim(id: string): Promise<void> {
  const companyId = getActiveCompanyId();
  assertPersistenceContext(companyId, "deleting a draft progress claim");

  if (!supabase) {
    const { all, scoped: local } = localRecordsForCompany(companyId);
    const existing = local.find((c) => c.id === id);
    if (!existing) return;
    if (existing.status !== "DRAFT") {
      throw new Error("Only draft progress claims may be deleted");
    }
    const filtered = local.filter((c) => c.id !== id);
    writeScopedLocalRecords(filtered, companyId, all);
    return;
  }

  const { error } = await supabase.rpc("delete_draft_subcontract_claim", {
    p_claim_id: id,
  });

  if (error) throw error;
}
