import type { InvoiceProjectAllocation } from "../types.ts";

export type InvoiceProjectAllocationInput = Pick<InvoiceProjectAllocation, "projectId" | "allocationType"> &
  Partial<Pick<InvoiceProjectAllocation, "id" | "invoiceId" | "projectCostCodeId" | "allocationPercentage" | "allocationAmount" | "notes" | "createdAt" | "updatedAt">>;

export interface InvoiceProjectAllocationValidation {
  valid: boolean;
  total: number;
  remaining: number;
  exceedsBy: number;
  percentageTotal: number;
  duplicateProjectIds: string[];
  issues: string[];
  message?: string;
}

export interface InvoiceProjectAllocationPersistenceRow {
  id?: string;
  project_id: string;
  project_cost_code_id?: string | null;
  allocation_type: InvoiceProjectAllocation["allocationType"];
  allocation_percentage: number | null;
  allocation_amount: number | null;
  notes: string | null;
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}

function cents(value: number) {
  return Math.round(value * 100);
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function hasAtMostScale(value: number, scale: number) {
  return Math.abs(value - Math.round(value * 10 ** scale) / 10 ** scale) <= 1e-8;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Stable for the same invoice/project pair and safe for local-storage rows. */
export function deterministicLocalInvoiceAllocationId(invoiceId: string, projectId: string) {
  return `local-allocation-${stableHash(`${invoiceId}\u0000${projectId}`)}`;
}

export function validateInvoiceProjectAllocationSet(invoiceTotal: number, allocations: InvoiceProjectAllocationInput[]): InvoiceProjectAllocationValidation {
  const issues: string[] = [];
  const seenProjects = new Set<string>();
  const duplicateProjectIds = new Set<string>();
  const invoiceAmount = Number(invoiceTotal);
  let allocatedCents = 0;
  let percentageTotal = 0;

  if (!Number.isFinite(invoiceAmount) || invoiceAmount < 0 || !hasAtMostScale(invoiceAmount, 2)) {
    issues.push("Invoice total must be a finite, non-negative amount with at most two decimal places.");
  }

  allocations.forEach((allocation, index) => {
    const label = `Allocation ${index + 1}`;
    const projectId = typeof allocation?.projectId === "string" ? allocation.projectId.trim() : "";
    if (!projectId) issues.push(`${label} must reference a project.`);
    if (seenProjects.has(projectId) && projectId) duplicateProjectIds.add(projectId);
    seenProjects.add(projectId);

    if (allocation?.allocationType !== "AMOUNT" && allocation?.allocationType !== "PERCENTAGE") {
      issues.push(`${label} must use AMOUNT or PERCENTAGE.`);
      return;
    }

    if (allocation.allocationType === "PERCENTAGE") {
      const percentage = Number(allocation.allocationPercentage);
      if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100 || !hasAtMostScale(percentage, 4)) {
        issues.push(`${label} percentage must be between 0 and 100 with at most four decimal places.`);
        return;
      }
      percentageTotal += percentage;
      if (Number.isFinite(invoiceAmount) && invoiceAmount >= 0) allocatedCents += cents(invoiceAmount * percentage / 100);
      return;
    }

    const amount = Number(allocation.allocationAmount);
    if (!Number.isFinite(amount) || amount < 0 || !hasAtMostScale(amount, 2)) {
      issues.push(`${label} amount must be a finite, non-negative amount with at most two decimal places.`);
      return;
    }
    allocatedCents += cents(amount);
  });

  const duplicates = [...duplicateProjectIds].sort(compareText);
  if (duplicates.length) issues.push(`Each project may appear only once per invoice (${duplicates.join(", ")}).`);
  if (percentageTotal > 100 + 1e-8) issues.push("Project allocation percentages cannot exceed 100% in total.");

  const invoiceCents = Number.isFinite(invoiceAmount) && invoiceAmount >= 0 ? cents(invoiceAmount) : 0;
  const total = money(allocatedCents / 100);
  const exceedsBy = money(Math.max(0, allocatedCents - invoiceCents) / 100);
  const remaining = money(Math.max(0, invoiceCents - allocatedCents) / 100);
  if (exceedsBy > 0.01) issues.push(`Allocation exceeds invoice total by ${exceedsBy.toFixed(2)}.`);

  return {
    valid: issues.length === 0,
    total,
    remaining,
    exceedsBy,
    percentageTotal: money(percentageTotal),
    duplicateProjectIds: duplicates,
    issues,
    message: issues[0],
  };
}

export function remainingInvoiceAllocatableAmount(invoiceTotal: number, allocations: InvoiceProjectAllocationInput[]) {
  return validateInvoiceProjectAllocationSet(invoiceTotal, allocations).remaining;
}

export function normalizeInvoiceProjectAllocations(invoiceId: string, invoiceTotal: number, allocations: InvoiceProjectAllocationInput[]): InvoiceProjectAllocation[] {
  const validation = validateInvoiceProjectAllocationSet(invoiceTotal, allocations);
  if (!validation.valid) throw new Error(validation.message || "Invoice project allocations are invalid.");

  return allocations
    .map((allocation) => {
      const projectId = allocation.projectId.trim();
      const percentage = allocation.allocationType === "PERCENTAGE" ? money(Number(allocation.allocationPercentage)) : undefined;
      const amount = allocation.allocationType === "PERCENTAGE"
        ? money(Number(invoiceTotal) * (percentage || 0) / 100)
        : money(Number(allocation.allocationAmount));
      return {
        ...allocation,
        id: allocation.id || deterministicLocalInvoiceAllocationId(invoiceId, projectId),
        invoiceId,
        projectId,
        projectCostCodeId: allocation.projectCostCodeId || undefined,
        allocationPercentage: percentage,
        allocationAmount: amount,
      };
    })
    .sort((left, right) => compareText(left.projectId, right.projectId) || compareText(left.id, right.id));
}

export function toInvoiceProjectAllocationPersistenceRows(invoiceId: string, invoiceTotal: number, allocations: InvoiceProjectAllocationInput[]): InvoiceProjectAllocationPersistenceRow[] {
  return normalizeInvoiceProjectAllocations(invoiceId, invoiceTotal, allocations).map((allocation) => ({
    ...(allocation.id && !allocation.id.startsWith("local-") ? { id: allocation.id } : {}),
    project_id: allocation.projectId,
    project_cost_code_id: allocation.projectCostCodeId || null,
    allocation_type: allocation.allocationType,
    allocation_percentage: allocation.allocationType === "PERCENTAGE" ? allocation.allocationPercentage ?? null : null,
    allocation_amount: allocation.allocationType === "AMOUNT" ? allocation.allocationAmount : null,
    notes: allocation.notes || null,
  }));
}

export function replaceInvoiceProjectAllocationsLocally(
  invoiceId: string,
  invoiceTotal: number,
  currentAllocations: InvoiceProjectAllocation[],
  nextAllocations: InvoiceProjectAllocationInput[],
) {
  const replacement = normalizeInvoiceProjectAllocations(invoiceId, invoiceTotal, nextAllocations);
  return [...currentAllocations.filter((allocation) => allocation.invoiceId !== invoiceId), ...replacement];
}
