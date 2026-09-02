import type { PurchaseOrder, PurchaseOrderLine, PurchaseOrderReceipt } from "../types.ts";

export interface LineReceiptProgress {
  purchaseOrderLineId: string;
  orderedQuantity: number;
  receivedQuantity: number;
  remainingQuantity: number;
  progressPercent: number;
  isFullyReceived: boolean;
  isPartiallyReceived: boolean;
}

export type PODeliveryStatus = "NOT_RECEIVED" | "PARTIALLY_RECEIVED" | "FULLY_RECEIVED";

export interface POReceiptProgress {
  purchaseOrderId: string;
  /** True only when every PO line uses the same normalized unit. */
  quantitiesComparable: boolean;
  /** Shared display unit when quantitiesComparable is true; otherwise null. */
  aggregateUnit: string | null;
  /** Aggregate quantities are meaningful only when quantitiesComparable is true. */
  totalOrderedQuantity: number;
  totalReceivedQuantity: number;
  totalRemainingQuantity: number;
  /** Quantity-weighted for one-unit POs; average per-line completion for mixed-unit POs. */
  overallProgressPercent: number;
  deliveryStatus: PODeliveryStatus;
  lines: Record<string, LineReceiptProgress>;
  activeReceiptsCount: number;
}

export function roundQuantity(qty: number, decimals = 4): number {
  const factor = Math.pow(10, decimals);
  return Math.round(qty * factor) / factor;
}

export function isValidReceipt(receipt: PurchaseOrderReceipt): boolean {
  return receipt.status === "RECEIVED";
}

export function getReceiptsForPO(
  purchaseOrderId: string,
  receipts: readonly PurchaseOrderReceipt[] = [],
): PurchaseOrderReceipt[] {
  return receipts
    .filter((r) => r.purchaseOrderId === purchaseOrderId)
    .sort((a, b) => {
      const dateA = a.receiptDate || a.createdAt || "";
      const dateB = b.receiptDate || b.createdAt || "";
      return dateB.localeCompare(dateA);
    });
}

export function calculateLineReceiptProgress(
  line: PurchaseOrderLine,
  receipts: readonly PurchaseOrderReceipt[] = [],
): LineReceiptProgress {
  const orderedQuantity = Math.max(0, Number(line.quantity) || 0);

  // Filter only active, non-voided receipts belonging to this PO.
  const relevantReceipts = receipts.filter(
    (r) => r.purchaseOrderId === line.purchaseOrderId && isValidReceipt(r),
  );

  let receivedQuantity = 0;
  for (const receipt of relevantReceipts) {
    if (receipt.lines && receipt.lines.length > 0) {
      for (const rLine of receipt.lines) {
        if (rLine.purchaseOrderLineId === line.id) {
          receivedQuantity += Math.max(0, Number(rLine.receivedQuantity) || 0);
        }
      }
    }
  }

  receivedQuantity = roundQuantity(receivedQuantity);
  const remainingQuantity = roundQuantity(Math.max(0, orderedQuantity - receivedQuantity));
  const progressPercent = orderedQuantity > 0
    ? Math.min(100, Math.round((receivedQuantity / orderedQuantity) * 100))
    : 0;

  return {
    purchaseOrderLineId: line.id,
    orderedQuantity,
    receivedQuantity,
    remainingQuantity,
    progressPercent,
    isFullyReceived: remainingQuantity === 0 && orderedQuantity > 0,
    isPartiallyReceived: receivedQuantity > 0 && remainingQuantity > 0,
  };
}

function normalizedUnit(line: PurchaseOrderLine): string {
  return String(line.unit || "").trim().toLowerCase();
}

export function calculatePOReceiptProgress(
  po: PurchaseOrder,
  receipts: readonly PurchaseOrderReceipt[] = [],
): POReceiptProgress {
  const poLines = po.lines || [];
  const linesMap: Record<string, LineReceiptProgress> = {};
  const unitKeys = new Set(poLines.map(normalizedUnit));
  const quantitiesComparable = unitKeys.size <= 1;
  const aggregateUnit = quantitiesComparable && poLines.length > 0
    ? String(poLines[0].unit || "").trim() || null
    : null;

  let totalOrderedQuantity = 0;
  let totalReceivedQuantity = 0;
  let totalRemainingQuantity = 0;
  let lineProgressPercentTotal = 0;
  let hasAnyReceived = false;
  let allFullyReceived = poLines.length > 0;

  const relevantReceipts = receipts.filter(
    (r) => r.purchaseOrderId === po.id && isValidReceipt(r),
  );

  for (const line of poLines) {
    const lineProgress = calculateLineReceiptProgress(line, relevantReceipts);
    linesMap[line.id] = lineProgress;
    lineProgressPercentTotal += lineProgress.progressPercent;
    hasAnyReceived ||= lineProgress.receivedQuantity > 0;
    allFullyReceived &&= lineProgress.isFullyReceived;

    if (quantitiesComparable) {
      totalOrderedQuantity += lineProgress.orderedQuantity;
      totalReceivedQuantity += lineProgress.receivedQuantity;
      totalRemainingQuantity += lineProgress.remainingQuantity;
    }
  }

  totalOrderedQuantity = quantitiesComparable ? roundQuantity(totalOrderedQuantity) : 0;
  totalReceivedQuantity = quantitiesComparable ? roundQuantity(totalReceivedQuantity) : 0;
  totalRemainingQuantity = quantitiesComparable ? roundQuantity(totalRemainingQuantity) : 0;

  // Unlike quantities (for example cu.m and days) must never be numerically added.
  // For mixed-unit POs, use a dimensionless average of each line's completion.
  const overallProgressPercent = quantitiesComparable
    ? (totalOrderedQuantity > 0
        ? Math.min(100, Math.round((totalReceivedQuantity / totalOrderedQuantity) * 100))
        : 0)
    : (poLines.length > 0
        ? Math.min(100, Math.round(lineProgressPercentTotal / poLines.length))
        : 0);

  let deliveryStatus: PODeliveryStatus = "NOT_RECEIVED";
  if (allFullyReceived) {
    deliveryStatus = "FULLY_RECEIVED";
  } else if (hasAnyReceived) {
    deliveryStatus = "PARTIALLY_RECEIVED";
  }

  return {
    purchaseOrderId: po.id,
    quantitiesComparable,
    aggregateUnit,
    totalOrderedQuantity,
    totalReceivedQuantity,
    totalRemainingQuantity,
    overallProgressPercent,
    deliveryStatus,
    lines: linesMap,
    activeReceiptsCount: relevantReceipts.length,
  };
}

export function validateReceiptLineInput(
  line: PurchaseOrderLine,
  inputQty: number,
  existingReceipts: readonly PurchaseOrderReceipt[] = [],
): { valid: boolean; message?: string; remaining: number } {
  const progress = calculateLineReceiptProgress(line, existingReceipts);
  const qty = Number(inputQty);

  if (isNaN(qty) || qty <= 0) {
    return {
      valid: false,
      message: `Invalid quantity for line "${line.description}". Quantity must be greater than zero.`,
      remaining: progress.remainingQuantity,
    };
  }

  if (qty > progress.remainingQuantity) {
    return {
      valid: false,
      message: `Over-receipt rejected: Attempting to receive ${qty} ${line.unit}, but only ${progress.remainingQuantity} ${line.unit} remain outstanding for line "${line.description}".`,
      remaining: progress.remainingQuantity,
    };
  }

  return {
    valid: true,
    remaining: progress.remainingQuantity,
  };
}
