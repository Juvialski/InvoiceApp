import type {
  InvoiceData,
  PurchasedMaterialIntake,
  PurchasedMaterialIntakeLine,
  PurchaseOrder,
  PurchaseOrderInvoiceMatch,
  PurchaseOrderReceipt,
} from "../types.ts";
import type { InventoryItem } from "./inventory.ts";
import { calculateLineReceiptProgress } from "../utils/purchaseOrderReceipts.ts";

export function normalizeMaterialUnit(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeMaterialDescription(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function buildPurchasedMaterialIntake(invoice: InvoiceData): PurchasedMaterialIntake {
  const existing = invoice.purchasedMaterialIntake;
  const existingByLine = new Map((existing?.lines || []).map((line) => [line.invoiceLineId, line]));
  const lines = (invoice.items || []).map((item, index): PurchasedMaterialIntakeLine => {
    const invoiceLineId = item.id || `invoice-line-${index + 1}`;
    const prior = existingByLine.get(invoiceLineId);
    return {
      invoiceLineId,
      purchaseOrderLineId: prior?.purchaseOrderLineId,
      inventoryItemId: prior?.inventoryItemId,
      status: prior?.status || "UNRESOLVED",
      quantity: item.quantity ?? null,
      unit: item.unitOfMeasure || null,
      note: prior?.note,
    };
  });
  return {
    meaning: existing?.meaning || "UNRESOLVED",
    lines,
    procurementReceiptId: existing?.procurementReceiptId,
  };
}

export interface InventoryMatchSuggestion {
  item?: InventoryItem;
  reason?: string;
  ambiguous: boolean;
}

/** Deterministic suggestions only. The caller must still human-confirm the item. */
export function suggestInventoryItemForMaterialLine(
  invoiceLine: Pick<NonNullable<InvoiceData["items"]>[number], "sku" | "description" | "unitOfMeasure">,
  items: readonly InventoryItem[],
): InventoryMatchSuggestion {
  const unit = normalizeMaterialUnit(invoiceLine.unitOfMeasure);
  const active = items.filter((item) => item.status === "ACTIVE" && (!unit || normalizeMaterialUnit(item.stockUnit) === unit));
  const sku = String(invoiceLine.sku || "").trim().toUpperCase();
  if (sku) {
    const matches = active.filter((item) => String(item.itemCode || "").trim().toUpperCase() === sku);
    if (matches.length === 1) return { item: matches[0], reason: "Exact item code and unit", ambiguous: false };
    if (matches.length > 1) return { reason: "More than one active item has the same item code", ambiguous: true };
  }
  const description = normalizeMaterialDescription(invoiceLine.description);
  if (description) {
    const matches = active.filter((item) => normalizeMaterialDescription(item.itemName) === description);
    if (matches.length === 1) return { item: matches[0], reason: "Normalized exact description and unit", ambiguous: false };
    if (matches.length > 1) return { reason: "More than one active item has the same description and unit", ambiguous: true };
  }
  return { ambiguous: false };
}

export interface PurchasedMaterialReceiptPlan {
  valid: boolean;
  errors: string[];
  purchaseOrderId?: string;
  lines: Array<{
    invoiceLineId: string;
    purchaseOrderLineId: string;
    inventoryItemId: string;
    receivedQuantity: number;
    unit: string;
  }>;
}

export function buildPurchasedMaterialReceiptPlan(
  invoice: InvoiceData,
  intake: PurchasedMaterialIntake,
  purchaseOrders: readonly PurchaseOrder[],
  receipts: readonly PurchaseOrderReceipt[],
  matches: readonly PurchaseOrderInvoiceMatch[],
): PurchasedMaterialReceiptPlan {
  const errors: string[] = [];
  const lines: PurchasedMaterialReceiptPlan["lines"] = [];
  if (intake.meaning !== "DELIVERY_EVIDENCE" && intake.meaning !== "BOTH") {
    return { valid: true, errors: [], lines: [] };
  }
  const confirmedMatch = matches.find((match) => match.invoiceId === invoice.id && match.status === "CONFIRMED");
  if (!confirmedMatch) errors.push("Confirm one Purchase Order match before creating a Procurement receipt.");
  const purchaseOrder = confirmedMatch ? purchaseOrders.find((candidate) => candidate.id === confirmedMatch.purchaseOrderId) : undefined;
  if (confirmedMatch && !purchaseOrder) errors.push("The confirmed Purchase Order is unavailable in this company.");
  const matchLineByInvoiceLine = new Map((confirmedMatch?.lines || []).map((line) => [line.invoiceLineId, line]));
  const receiptHistory = purchaseOrder ? receipts.filter((receipt) => receipt.purchaseOrderId === purchaseOrder.id) : [];

  for (const [index, sourceLine] of (invoice.items || []).entries()) {
    const invoiceLineId = sourceLine.id || `invoice-line-${index + 1}`;
    const reviewLine = intake.lines.find((line) => line.invoiceLineId === invoiceLineId);
    const quantity = sourceLine.quantity;
    const unit = normalizeMaterialUnit(sourceLine.unitOfMeasure);
    if (!reviewLine || reviewLine.status !== "CONFIRMED" || !reviewLine.inventoryItemId) {
      errors.push(`Material line ${index + 1} needs a human-confirmed canonical Inventory Item.`);
      continue;
    }
    if (quantity === null || quantity === undefined || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
      errors.push(`Material line ${index + 1} has no confirmed positive quantity; Warehouse receipt is blocked.`);
      continue;
    }
    if (!unit) {
      errors.push(`Material line ${index + 1} has no confirmed unit; Warehouse receipt is blocked.`);
      continue;
    }
    const matchedLine = reviewLine.purchaseOrderLineId ? { purchaseOrderLineId: reviewLine.purchaseOrderLineId } : matchLineByInvoiceLine.get(invoiceLineId);
    const purchaseOrderLine = purchaseOrder?.lines?.find((line) => line.id === matchedLine?.purchaseOrderLineId);
    if (!matchedLine?.purchaseOrderLineId || !purchaseOrderLine) {
      errors.push(`Material line ${index + 1} needs a confirmed Purchase Order line.`);
      continue;
    }
    if (normalizeMaterialUnit(purchaseOrderLine.unit) !== unit) {
      errors.push(`Material line ${index + 1} unit does not exactly match the Purchase Order line; no conversion is applied.`);
      continue;
    }
    const progress = calculateLineReceiptProgress(purchaseOrderLine, receiptHistory);
    if (Number(quantity) > progress.remainingQuantity + 0.0001) {
      errors.push(`Material line ${index + 1} exceeds the remaining Purchase Order quantity.`);
      continue;
    }
    lines.push({ invoiceLineId, purchaseOrderLineId: matchedLine.purchaseOrderLineId, inventoryItemId: reviewLine.inventoryItemId, receivedQuantity: Number(quantity), unit });
  }
  if (!invoice.items?.length) errors.push("No material lines were extracted; keep the document unresolved or financial-only.");
  return { valid: errors.length === 0 && lines.length > 0, errors, purchaseOrderId: purchaseOrder?.id, lines };
}

export function purchasedMaterialMeaningLabel(value: PurchasedMaterialIntake["meaning"]) {
  switch (value) {
    case "FINANCIAL_ONLY": return "Financial supplier invoice only";
    case "DELIVERY_EVIDENCE": return "Procurement / delivery evidence";
    case "BOTH": return "Both financial and delivery evidence";
    default: return "Unresolved — needs document review";
  }
}
