import type {
  InvoiceData,
  LineItem,
  LineItemComparison,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderMatchCandidate,
  PurchaseOrderReceipt,
  PurchaseOrderInvoiceMatchLine,
} from "../types.ts";
import { calculateLineReceiptProgress } from "./purchaseOrderReceipts.ts";

export interface MatchCandidateOptions {
  vendors?: Array<{ id: string; name: string; taxId?: string }>;
  receipts?: readonly PurchaseOrderReceipt[];
}

export interface LineValidationInput {
  purchaseOrderLineId: string;
  invoiceLineId: string;
  matchedQuantity?: number | null;
  matchedAmount?: number | null;
  notes?: string | null;
}

export function resolvedInvoiceVendorId(invoice: InvoiceData): string | undefined {
  const legacyInvoice = invoice as InvoiceData & {
    vendorId?: string;
    vendor_id?: string;
    vendor: InvoiceData["vendor"] & { id?: string };
  };
  return invoice.vendor?.vendorId || legacyInvoice.vendor?.id || legacyInvoice.vendorId || legacyInvoice.vendor_id;
}

/**
 * Normalizes a purchase order number for strict, whitespace/punctuation-insensitive comparison.
 * e.g., "PO-2026-001" -> "PO2026001", " #po 2026 001 " -> "PO2026001"
 */
export function normalizePoNumber(value?: string | null): string {
  if (!value) return "";
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/**
 * Normalizes text for loose similarity comparison.
 */
function normalizeText(value?: string | null): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Evaluates line items from an invoice against purchase order lines,
 * incorporating receipt progress and generating standard warning signals.
 */
export function buildLineItemComparisons(
  invoice: InvoiceData,
  po: PurchaseOrder,
  receipts: readonly PurchaseOrderReceipt[] = [],
): LineItemComparison[] {
  const invoiceItems = invoice.items || [];
  const poLines = po.lines || [];

  const matchedPoLineIds = new Set<string>();

  return invoiceItems.map((invItem, idx) => {
    const invDescNorm = normalizeText(invItem.description);
    const invQty = Math.max(0, Number(invItem.quantity) || 0);
    const invPrice = Math.max(0, Number(invItem.unitPrice) || 0);
    const invAmt = Math.max(0, Number(invItem.total) || invQty * invPrice);

    // 1. Attempt best match on PO lines:
    // Priority a: matching line number / item number
    // Priority b: exact/substring description match
    let bestPoLine: PurchaseOrderLine | undefined;

    // Check by description match first
    if (invDescNorm) {
      bestPoLine = poLines.find((pol) => {
        if (matchedPoLineIds.has(pol.id)) return false;
        const polDescNorm = normalizeText(pol.description);
        return (
          polDescNorm === invDescNorm ||
          polDescNorm.includes(invDescNorm) ||
          invDescNorm.includes(polDescNorm)
        );
      });
    }

    // Fallback: match by index if descriptions don't clearly match and line count aligns
    if (!bestPoLine) {
      const candidateByIndex = poLines[idx];
      if (candidateByIndex && !matchedPoLineIds.has(candidateByIndex.id)) {
        bestPoLine = candidateByIndex;
      }
    }

    // Fallback: any unmatched PO line
    if (!bestPoLine) {
      bestPoLine = poLines.find((pol) => !matchedPoLineIds.has(pol.id));
    }

    if (bestPoLine) {
      matchedPoLineIds.add(bestPoLine.id);
    }

    const warnings: string[] = [];

    if (!bestPoLine) {
      return {
        invoiceLineId: invItem.id || `inv-line-${idx + 1}`,
        invoiceLineIndex: invItem.itemNumber ?? idx + 1,
        invoiceDescription: invItem.description || "",
        invoiceQuantity: invQty,
        invoiceUnitPrice: invPrice,
        invoiceAmount: invAmt,
        warnings: ["No matching purchase order line found"],
      };
    }

    const progress = calculateLineReceiptProgress(bestPoLine, receipts);
    const poQty = Number(bestPoLine.quantity) || 0;
    const poPrice = Number(bestPoLine.unitPrice) || 0;
    const poAmt = Number(bestPoLine.amount) || poQty * poPrice;

    // Quantity vs receipt comparisons
    if (invQty > progress.receivedQuantity) {
      warnings.push("Invoice quantity exceeds recorded receipts");
    }

    // Quantity vs PO ordered comparisons
    if (invQty > poQty) {
      warnings.push("Invoice quantity exceeds PO ordered quantity");
    }

    // Amount vs PO amount comparisons
    if (invAmt > poAmt) {
      warnings.push("Invoice line amount exceeds PO line amount");
    }

    // Delivery progress warnings
    if (progress.receivedQuantity === 0) {
      warnings.push("Missing receipts (no goods received yet)");
    } else if (progress.isPartiallyReceived) {
      warnings.push("Partially received");
    } else if (progress.isFullyReceived) {
      warnings.push("Fully received");
    }

    return {
      invoiceLineId: invItem.id || `inv-line-${idx + 1}`,
      invoiceLineIndex: invItem.itemNumber ?? idx + 1,
      invoiceDescription: invItem.description || "",
      invoiceQuantity: invQty,
      invoiceUnitPrice: invPrice,
      invoiceAmount: invAmt,
      purchaseOrderLineId: bestPoLine.id,
      purchaseOrderDescription: bestPoLine.description,
      purchaseOrderOrderedQuantity: poQty,
      purchaseOrderUnitPrice: poPrice,
      purchaseOrderAmount: poAmt,
      receivedQuantity: progress.receivedQuantity,
      remainingReceiptQuantity: progress.remainingQuantity,
      isFullyReceived: progress.isFullyReceived,
      isPartiallyReceived: progress.isPartiallyReceived,
      warnings,
    };
  });
}

/**
 * Evaluates a single purchase order candidate for matching against an invoice.
 */
export function evaluatePurchaseOrderMatch(
  invoice: InvoiceData,
  po: PurchaseOrder,
  options?: MatchCandidateOptions,
): PurchaseOrderMatchCandidate {
  let score = 0;
  const matchReasons: string[] = [];
  const warnings: string[] = [];
  let isEligibleForConfirmation = true;
  let ineligibilityReason: string | undefined;

  // 1. Lifecycle and validity checks
  if (invoice.lifecycleStatus === "VOID" || invoice.voidedAt) {
    isEligibleForConfirmation = false;
    ineligibilityReason = "Cannot match a void invoice";
    warnings.push("Cannot match a void invoice");
  }

  const validStatuses = ["ISSUED", "CLOSED"];
  if (!validStatuses.includes(po.status)) {
    isEligibleForConfirmation = false;
    ineligibilityReason = ineligibilityReason || `Ineligible purchase order status (${po.status})`;
    warnings.push(`Ineligible purchase order status (${po.status})`);
  }

  // 2. Signal 1: PO Number match (+60)
  const invPoNumberNorm = normalizePoNumber(invoice.purchaseOrderNumber);
  const poNumberNorm = normalizePoNumber(po.poNumber);

  if (invPoNumberNorm && poNumberNorm && invPoNumberNorm === poNumberNorm) {
    score += 60;
    matchReasons.push(`Exact purchase order number match (${po.poNumber})`);
  }

  // 3. Signal 2: Vendor match (+25 / +15 / conflict)
  const invoiceVendorId = resolvedInvoiceVendorId(invoice);
  const poVendorId = po.vendorId;

  let vendorMatch: "EXACT" | "NAME_ONLY" | "UNRESOLVED" | "MISMATCH" = "UNRESOLVED";

  if (invoiceVendorId) {
    if (invoiceVendorId === poVendorId) {
      vendorMatch = "EXACT";
      score += 25;
      matchReasons.push("Authoritative vendor match");
    } else {
      vendorMatch = "MISMATCH";
      warnings.push("Vendor mismatch: invoice vendor does not match purchase order vendor");
      isEligibleForConfirmation = false;
      ineligibilityReason = ineligibilityReason || "Vendor mismatch";
    }
  } else {
    // Unresolved vendor on invoice: check name match against vendor catalog or PO vendor
    const invoiceVendorName = normalizeText(
      invoice.vendor?.name || invoice.vendor?.companyName || invoice.vendor?.tradeName,
    );
    const poVendor = (options?.vendors || []).find((v) => v.id === poVendorId);
    const poVendorName = normalizeText(poVendor?.name);

    if (invoiceVendorName && poVendorName && (invoiceVendorName === poVendorName || invoiceVendorName.includes(poVendorName) || poVendorName.includes(invoiceVendorName))) {
      vendorMatch = "NAME_ONLY";
      score += 15;
      matchReasons.push("Vendor name matches purchase order vendor");
    } else {
      vendorMatch = "UNRESOLVED";
    }

    // Database RPC requires invoice.vendor_id to match po.vendor_id, so an unresolved vendor blocks confirmation
    isEligibleForConfirmation = false;
    ineligibilityReason =
      ineligibilityReason || "Invoice vendor must be resolved to match purchase order vendor before confirmation";
    warnings.push("Invoice vendor must be resolved to match purchase order vendor");
  }

  // 4. Signal 3: Currency match (Required)
  const invoiceCurrency = (invoice.currency || "").trim().toUpperCase();
  const poCurrency = (po.currency || "").trim().toUpperCase();
  const currencyMatch = invoiceCurrency === poCurrency;

  if (currencyMatch && invoiceCurrency !== "") {
    matchReasons.push(`Currency matches (${invoiceCurrency})`);
  } else {
    warnings.push("Currency mismatch");
    isEligibleForConfirmation = false;
    ineligibilityReason =
      ineligibilityReason || `Currency mismatch: invoice is ${invoiceCurrency} but purchase order is ${poCurrency}`;
  }

  // 5. Signal 4: Amount compatibility (+15 for exact, +10 for within total)
  const invTotal = Number(invoice.grandTotal) || 0;
  const poTotal =
    Number(po.totalAmount) ||
    (po.lines || []).reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

  if (poTotal > 0 && invTotal > 0) {
    if (Math.abs(invTotal - poTotal) < 0.01) {
      score += 15;
      matchReasons.push("Exact grand total amount match");
    } else if (invTotal <= poTotal) {
      score += 10;
      matchReasons.push("Invoice amount is within purchase order total");
    } else {
      warnings.push("Invoice grand total exceeds purchase order total");
    }
  }

  // 6. Signal 5: Project reference (+10)
  const invProj = normalizeText(invoice.projectReference);
  const poProjId = normalizeText(po.projectId);
  if (invProj && poProjId && (invProj === poProjId || poProjId.includes(invProj) || invProj.includes(poProjId))) {
    score += 10;
    matchReasons.push("Project reference matches");
  }

  // 7. Line item comparisons & Signal 6: Line similarity (+10)
  const lineComparisons = buildLineItemComparisons(invoice, po, options?.receipts || []);
  const matchingLineCount = lineComparisons.filter((c) => Boolean(c.purchaseOrderLineId)).length;

  if (matchingLineCount > 0) {
    score += 10;
    matchReasons.push(`${matchingLineCount} line item(s) mapped to purchase order`);
  }

  // Collect unique line-level warnings into candidate warnings
  for (const comp of lineComparisons) {
    for (const w of comp.warnings) {
      if (!warnings.includes(w)) {
        warnings.push(w);
      }
    }
  }

  // Cap score at 100
  const finalScore = Math.min(100, Math.max(0, score));

  // Determine confidence level
  let confidence: "HIGH" | "MEDIUM" | "LOW" = "LOW";
  if (finalScore >= 75) {
    confidence = "HIGH";
  } else if (finalScore >= 45) {
    confidence = "MEDIUM";
  }

  return {
    purchaseOrder: po,
    score: finalScore,
    confidence,
    matchReasons,
    warnings,
    isEligibleForConfirmation,
    ineligibilityReason,
    vendorMatch,
    currencyMatch,
    lineComparisons,
  };
}

/**
 * Evaluates and scores all purchase orders for an invoice, returning sorted candidates.
 */
export function evaluatePurchaseOrderMatchCandidates(
  invoice: InvoiceData,
  purchaseOrders: PurchaseOrder[],
  options?: MatchCandidateOptions,
): PurchaseOrderMatchCandidate[] {
  const candidates = (purchaseOrders || []).map((po) =>
    evaluatePurchaseOrderMatch(invoice, po, options),
  );

  return candidates.sort((a, b) => {
    // 1. Sort by eligibility first
    if (a.isEligibleForConfirmation !== b.isEligibleForConfirmation) {
      return a.isEligibleForConfirmation ? -1 : 1;
    }
    // 2. Sort by score descending
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // 3. Tie-breaker by issue date or creation date descending
    const dateA = a.purchaseOrder.issueDate || a.purchaseOrder.createdAt || "";
    const dateB = b.purchaseOrder.issueDate || b.purchaseOrder.createdAt || "";
    return dateB.localeCompare(dateA);
  });
}

/**
 * Validates match line associations before confirmation.
 */
export function validateMatchLineAssociations(
  invoice: InvoiceData,
  po: PurchaseOrder,
  lines?: LineValidationInput[] | PurchaseOrderInvoiceMatchLine[] | null,
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!lines || lines.length === 0) {
    // Whole-order match without explicit line-by-line breakdown is acceptable
    return { isValid: true, errors: [] };
  }

  const invoiceItems = invoice.items || [];
  const poLines = po.lines || [];

  const invoiceItemIds = new Set(invoiceItems.map((item, idx) => item.id || `inv-line-${idx + 1}`));
  const poLineIds = new Set(poLines.map((l) => l.id));

  const seenInvoiceLines = new Set<string>();
  let totalMatchedAmount = 0;

  lines.forEach((line, idx) => {
    const invLineId = String(line.invoiceLineId || "").trim();
    const poLineId = String(line.purchaseOrderLineId || "").trim();

    if (!invLineId) {
      errors.push(`Line ${idx + 1}: Invoice line ID is required`);
      return;
    }

    if (!poLineId) {
      errors.push(`Line ${idx + 1}: Purchase order line ID is required`);
      return;
    }

    if (seenInvoiceLines.has(invLineId)) {
      errors.push(`Duplicate invoice line ID: ${invLineId}`);
    }
    seenInvoiceLines.add(invLineId);

    if (!invoiceItemIds.has(invLineId)) {
      errors.push(`Invoice line ID ${invLineId} not found in invoice items`);
    }

    if (!poLineIds.has(poLineId)) {
      errors.push(`Purchase order line ID ${poLineId} not found on purchase order`);
    }

    if (line.matchedQuantity !== null && line.matchedQuantity !== undefined) {
      const qty = Number(line.matchedQuantity);
      if (Number.isNaN(qty) || qty < 0) {
        errors.push(`Line ${idx + 1}: Matched quantity cannot be negative`);
      }
    }

    if (line.matchedAmount !== null && line.matchedAmount !== undefined) {
      const amt = Number(line.matchedAmount);
      if (Number.isNaN(amt) || amt < 0) {
        errors.push(`Line ${idx + 1}: Matched amount cannot be negative`);
      } else {
        totalMatchedAmount += amt;
      }
    }
  });

  const invoiceGrandTotal = Math.max(0, Number(invoice.grandTotal) || 0);
  if (totalMatchedAmount > invoiceGrandTotal + 0.001) {
    errors.push(
      `Total matched lines amount (${totalMatchedAmount.toFixed(2)}) exceeds invoice grand total (${invoiceGrandTotal.toFixed(2)})`,
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export const findPurchaseOrderMatchCandidates = evaluatePurchaseOrderMatchCandidates;