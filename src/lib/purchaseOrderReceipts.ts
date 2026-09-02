import type { PurchaseOrderReceipt, PurchaseOrderReceiptLine, PurchaseOrderReceiptStatus } from "../types.ts";
import { supabase } from "./supabase.ts";
import { requireActiveCompanyId } from "./companyContext.ts";
import { readPurchaseOrdersFromLocal } from "./purchaseOrders.ts";
import { calculateLineReceiptProgress } from "../utils/purchaseOrderReceipts.ts";
import { createDemoPurchaseOrderReceipts } from "../demo/data/procurement.ts";

const RECEIPT_STORAGE_KEY = "engineering_purchase_order_receipts";
type Row = Record<string, unknown>;

function text(value: unknown) {
  return value === null || value === undefined || value === "" ? undefined : String(value);
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function purchaseOrderReceiptLineFromRow(row: Row): PurchaseOrderReceiptLine {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    purchaseOrderReceiptId: String(row.purchase_order_receipt_id),
    purchaseOrderLineId: String(row.purchase_order_line_id),
    lineNumber: numberValue(row.line_number, 1),
    receivedQuantity: numberValue(row.received_quantity, 0),
    notes: text(row.notes) || null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

export function purchaseOrderReceiptFromRow(row: Row, lineRows: Row[] = []): PurchaseOrderReceipt {
  const lines = lineRows.map(purchaseOrderReceiptLineFromRow);

  return {
    id: String(row.id),
    companyId: text(row.company_id),
    purchaseOrderId: String(row.purchase_order_id),
    receiptNumber: String(row.receipt_number || "").toUpperCase(),
    receiptDate: String(row.receipt_date || new Date().toISOString().split("T")[0]),
    supplierDeliveryReference: text(row.supplier_delivery_reference) || null,
    notes: text(row.notes) || null,
    status: (String(row.status || "RECEIVED").toUpperCase() as PurchaseOrderReceiptStatus) || "RECEIVED",
    voidReason: text(row.void_reason) || null,
    voidedByUserId: text(row.voided_by_user_id) || null,
    voidedAt: text(row.voided_at) || null,
    createdByUserId: text(row.created_by_user_id) || null,
    updatedByUserId: text(row.updated_by_user_id) || null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
    lines,
  };
}

export function readPurchaseOrderReceiptsFromLocal(storage?: Storage): PurchaseOrderReceipt[] {
  const target = storage || (typeof localStorage === "undefined" ? undefined : localStorage);
  if (!target) return [];
  try {
    const raw = target.getItem(RECEIPT_STORAGE_KEY);
    if (!raw) {
      const demo = createDemoPurchaseOrderReceipts(new Date().toISOString().slice(0, 10));
      writePurchaseOrderReceiptsToLocal(demo, target);
      return demo;
    }
    const value = JSON.parse(raw);
    return Array.isArray(value) ? (value as PurchaseOrderReceipt[]) : [];
  } catch {
    return [];
  }
}

export function writePurchaseOrderReceiptsToLocal(receipts: PurchaseOrderReceipt[], storage?: Storage) {
  const target = storage || (typeof localStorage === "undefined" ? undefined : localStorage);
  if (!target) return;
  try {
    target.setItem(RECEIPT_STORAGE_KEY, JSON.stringify(receipts));
  } catch {
    /* ignore */
  }
}

export async function fetchPurchaseOrderReceipts(purchaseOrderId?: string): Promise<PurchaseOrderReceipt[]> {
  if (!supabase) {
    const local = readPurchaseOrderReceiptsFromLocal();
    return purchaseOrderId ? local.filter((r) => r.purchaseOrderId === purchaseOrderId) : local;
  }
  const companyId = requireActiveCompanyId();
  if (!companyId) {
    const local = readPurchaseOrderReceiptsFromLocal();
    return purchaseOrderId ? local.filter((r) => r.purchaseOrderId === purchaseOrderId) : local;
  }

  let query = supabase
    .from("purchase_order_receipts")
    .select("*, purchase_order_receipt_lines(*)")
    .eq("company_id", companyId)
    .order("receipt_date", { ascending: false });

  if (purchaseOrderId) {
    query = query.eq("purchase_order_id", purchaseOrderId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((row) => {
    const lines = Array.isArray(row.purchase_order_receipt_lines) ? row.purchase_order_receipt_lines : [];
    return purchaseOrderReceiptFromRow(row as Row, lines as Row[]);
  });
}

export async function recordPurchaseOrderReceipt(
  receipt: Partial<PurchaseOrderReceipt> & { purchaseOrderId: string; receiptNumber: string },
  lines: Array<{ purchaseOrderLineId: string; receivedQuantity: number; notes?: string }>,
  storage?: Storage,
): Promise<PurchaseOrderReceipt> {
  const companyId = requireActiveCompanyId();

  if (!supabase || !companyId || storage) {
    const localReceipts = readPurchaseOrderReceiptsFromLocal(storage);
    const localPOs = readPurchaseOrdersFromLocal(storage);
    const po = localPOs.find((p) => p.id === receipt.purchaseOrderId);

    if (!po) {
      throw new Error("Purchase order not found");
    }
    if (po.status !== "ISSUED") {
      throw new Error(`Receipts can only be recorded against ISSUED purchase orders (current status: ${po.status})`);
    }

    const filteredLines = lines.filter((l) => Number(l.receivedQuantity) > 0);
    if (filteredLines.length === 0) {
      throw new Error("Receipt must contain at least one line with positive received quantity");
    }

    // Over-receipt validation
    for (const inputLine of filteredLines) {
      const poLine = (po.lines || []).find((l) => l.id === inputLine.purchaseOrderLineId);
      if (!poLine) {
        throw new Error("Purchase order line not found on order");
      }
      const progress = calculateLineReceiptProgress(poLine, localReceipts);
      if (Number(inputLine.receivedQuantity) > progress.remainingQuantity) {
        throw new Error(
          `Over-receipt is not permitted: ordered ${progress.orderedQuantity}, previously received ${progress.receivedQuantity}, attempting to receive ${inputLine.receivedQuantity}`,
        );
      }
    }

    const now = new Date().toISOString();
    const receiptId = receipt.id || globalThis.crypto?.randomUUID?.() || `rec-${Date.now()}`;

    const mappedLines: PurchaseOrderReceiptLine[] = filteredLines.map((l, idx) => ({
      id: globalThis.crypto?.randomUUID?.() || `rec-line-${receiptId}-${idx + 1}`,
      companyId,
      purchaseOrderReceiptId: receiptId,
      purchaseOrderLineId: l.purchaseOrderLineId,
      lineNumber: idx + 1,
      receivedQuantity: Number(l.receivedQuantity),
      notes: l.notes || null,
      createdAt: now,
      updatedAt: now,
    }));

    const saved: PurchaseOrderReceipt = {
      id: receiptId,
      companyId,
      purchaseOrderId: receipt.purchaseOrderId,
      receiptNumber: receipt.receiptNumber.trim().toUpperCase(),
      receiptDate: receipt.receiptDate || now.split("T")[0],
      supplierDeliveryReference: receipt.supplierDeliveryReference?.trim() || null,
      notes: receipt.notes?.trim() || null,
      status: "RECEIVED",
      voidReason: null,
      voidedByUserId: null,
      voidedAt: null,
      createdByUserId: null,
      updatedByUserId: null,
      createdAt: now,
      updatedAt: now,
      lines: mappedLines,
    };

    localReceipts.unshift(saved);
    writePurchaseOrderReceiptsToLocal(localReceipts, storage);
    return saved;
  }

  const { data, error } = await supabase.rpc("record_purchase_order_receipt", {
    p_receipt: {
      id: receipt.id || null,
      companyId,
      purchaseOrderId: receipt.purchaseOrderId,
      receiptNumber: receipt.receiptNumber.trim().toUpperCase(),
      receiptDate: receipt.receiptDate || null,
      supplierDeliveryReference: receipt.supplierDeliveryReference?.trim() || null,
      notes: receipt.notes?.trim() || null,
    },
    p_lines: lines.map((l) => ({
      purchaseOrderLineId: l.purchaseOrderLineId,
      receivedQuantity: Number(l.receivedQuantity) || 0,
      notes: l.notes?.trim() || null,
    })),
  });

  if (error) throw error;
  const result = data as { receipt: Row; lines: Row[] };
  return purchaseOrderReceiptFromRow(result.receipt, result.lines || []);
}

export async function voidPurchaseOrderReceipt(
  receiptId: string,
  reason: string,
  storage?: Storage,
): Promise<PurchaseOrderReceipt> {
  const companyId = requireActiveCompanyId();

  if (!reason || reason.trim().length < 3) {
    throw new Error("Void reason must contain at least 3 characters");
  }

  if (!supabase || !companyId || storage) {
    const local = readPurchaseOrderReceiptsFromLocal(storage);
    const idx = local.findIndex((r) => r.id === receiptId);
    if (idx < 0) throw new Error("Purchase order receipt not found");
    const existing = local[idx];

    if (existing.status === "VOIDED") {
      throw new Error("Receipt is already voided");
    }

    const now = new Date().toISOString();
    const updated: PurchaseOrderReceipt = {
      ...existing,
      status: "VOIDED",
      voidReason: reason.trim(),
      voidedAt: now,
      updatedAt: now,
    };

    local[idx] = updated;
    writePurchaseOrderReceiptsToLocal(local, storage);
    return updated;
  }

  const { data, error } = await supabase.rpc("void_purchase_order_receipt", {
    p_receipt_id: receiptId,
    p_reason: reason.trim(),
  });

  if (error) throw error;
  const result = data as { receipt: Row; lines: Row[] };
  return purchaseOrderReceiptFromRow(result.receipt, result.lines || []);
}
