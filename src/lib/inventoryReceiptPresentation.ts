import type { PurchaseOrder, PurchaseOrderReceipt } from "../types.ts";

export interface WarehouseReceiptPresentationSources {
  purchaseOrders: PurchaseOrder[];
  receipts: PurchaseOrderReceipt[];
}

/**
 * Warehouse posting is based on the quantity actually received, not the PO's
 * ordered quantity. Give each receipt its own presentation-only PO identity so
 * multiple partial receipts of the same PO line keep their individual received
 * quantities without mutating Procurement's authoritative PO data.
 */
export function buildWarehouseReceiptPresentationSources(
  purchaseOrders: readonly PurchaseOrder[],
  receipts: readonly PurchaseOrderReceipt[],
): WarehouseReceiptPresentationSources {
  const purchaseOrderById = new Map(purchaseOrders.map((purchaseOrder) => [purchaseOrder.id, purchaseOrder]));
  const adaptedPurchaseOrders: PurchaseOrder[] = [];
  const adaptedReceipts: PurchaseOrderReceipt[] = [];

  for (const receipt of receipts) {
    const purchaseOrder = purchaseOrderById.get(receipt.purchaseOrderId);
    if (!purchaseOrder) continue;

    const receivedQuantityByLineId = new Map(
      (receipt.lines || []).map((line) => [line.purchaseOrderLineId, line.receivedQuantity]),
    );
    const receiptScopedPurchaseOrderId = `${purchaseOrder.id}::warehouse-receipt::${receipt.id}`;

    adaptedPurchaseOrders.push({
      ...purchaseOrder,
      id: receiptScopedPurchaseOrderId,
      lines: (purchaseOrder.lines || []).map((line) => receivedQuantityByLineId.has(line.id)
        ? { ...line, quantity: receivedQuantityByLineId.get(line.id)! }
        : line),
    });
    adaptedReceipts.push({
      ...receipt,
      purchaseOrderId: receiptScopedPurchaseOrderId,
    });
  }

  return { purchaseOrders: adaptedPurchaseOrders, receipts: adaptedReceipts };
}
