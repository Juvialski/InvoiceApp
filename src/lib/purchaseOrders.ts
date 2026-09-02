import type { PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatus } from "../types.ts";
import { supabase } from "./supabase.ts";
import { companyScopedRow, requireActiveCompanyId } from "./companyContext.ts";
import { isCommittedPurchaseOrder, purchaseOrderTotal } from "../utils/projectCosting.ts";

const PO_STORAGE_KEY = "engineering_purchase_orders";
type Row = Record<string, unknown>;

function text(value: unknown) {
  return value === null || value === undefined || value === "" ? undefined : String(value);
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function purchaseOrderLineFromRow(row: Row): PurchaseOrderLine {
  const qty = numberValue(row.quantity, 1);
  const unitPrice = numberValue(row.unit_price, 0);
  const amount = row.amount != null ? numberValue(row.amount) : Math.round(qty * unitPrice * 100) / 100;

  return {
    id: String(row.id),
    companyId: text(row.company_id),
    purchaseOrderId: String(row.purchase_order_id),
    lineNumber: numberValue(row.line_number, 1),
    description: String(row.description || ""),
    quantity: qty,
    unit: String(row.unit || "pcs"),
    unitPrice,
    amount,
    projectCostCodeId: text(row.project_cost_code_id) || null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

export function purchaseOrderFromRow(row: Row, lineRows: Row[] = []): PurchaseOrder {
  const lines = lineRows.map(purchaseOrderLineFromRow);
  const totalAmount = lines.length > 0
    ? lines.reduce((sum, l) => sum + l.amount, 0)
    : numberValue(row.total_amount, 0);

  return {
    id: String(row.id),
    companyId: text(row.company_id),
    poNumber: String(row.po_number || "").toUpperCase(),
    vendorId: String(row.vendor_id || ""),
    projectId: String(row.project_id || ""),
    currency: String(row.currency || "PHP").toUpperCase(),
    status: (String(row.status || "DRAFT").toUpperCase() as PurchaseOrderStatus) || "DRAFT",
    issueDate: text(row.issue_date) || null,
    description: text(row.description) || null,
    notes: text(row.notes) || null,
    cancellationReason: text(row.cancellation_reason) || null,
    totalAmount: Math.round(totalAmount * 100) / 100,
    lines,
    createdByUserId: text(row.created_by_user_id) || null,
    updatedByUserId: text(row.updated_by_user_id) || null,
    approvedByUserId: text(row.approved_by_user_id) || null,
    issuedByUserId: text(row.issued_by_user_id) || null,
    cancelledByUserId: text(row.cancelled_by_user_id) || null,
    closedByUserId: text(row.closed_by_user_id) || null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
    approvedAt: text(row.approved_at) || null,
    issuedAt: text(row.issued_at) || null,
    cancelledAt: text(row.cancelled_at) || null,
    closedAt: text(row.closed_at) || null,
  };
}

export function readPurchaseOrdersFromLocal(storage?: Storage): PurchaseOrder[] {
  const target = storage || (typeof localStorage === "undefined" ? undefined : localStorage);
  if (!target) return [];
  try {
    const value = JSON.parse(target.getItem(PO_STORAGE_KEY) || "[]");
    return Array.isArray(value) ? (value as PurchaseOrder[]) : [];
  } catch {
    return [];
  }
}

export function writePurchaseOrdersToLocal(orders: PurchaseOrder[], storage?: Storage) {
  const target = storage || (typeof localStorage === "undefined" ? undefined : localStorage);
  if (!target) return;
  try {
    target.setItem(PO_STORAGE_KEY, JSON.stringify(orders));
  } catch {
    /* ignore */
  }
}

export async function fetchPurchaseOrders(projectId?: string): Promise<PurchaseOrder[]> {
  if (!supabase) {
    const local = readPurchaseOrdersFromLocal();
    return projectId ? local.filter((po) => po.projectId === projectId) : local;
  }
  const companyId = requireActiveCompanyId();
  if (!companyId) {
    const local = readPurchaseOrdersFromLocal();
    return projectId ? local.filter((po) => po.projectId === projectId) : local;
  }

  let query = supabase
    .from("purchase_orders")
    .select("*, purchase_order_lines(*)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((row) => {
    const lines = Array.isArray(row.purchase_order_lines) ? row.purchase_order_lines : [];
    return purchaseOrderFromRow(row as Row, lines as Row[]);
  });
}

export async function fetchPurchaseOrder(id: string): Promise<PurchaseOrder | null> {
  if (!supabase) {
    const local = readPurchaseOrdersFromLocal();
    return local.find((po) => po.id === id) || null;
  }
  const companyId = requireActiveCompanyId();
  if (!companyId) {
    const local = readPurchaseOrdersFromLocal();
    return local.find((po) => po.id === id) || null;
  }

  const { data, error } = await supabase
    .from("purchase_orders")
    .select("*, purchase_order_lines(*)")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const lines = Array.isArray(data.purchase_order_lines) ? data.purchase_order_lines : [];
  return purchaseOrderFromRow(data as Row, lines as Row[]);
}

export async function savePurchaseOrder(
  po: Partial<PurchaseOrder> & { poNumber: string; vendorId: string; projectId: string },
  lines: Array<Partial<PurchaseOrderLine> & { description: string; quantity: number; unitPrice: number }>,
): Promise<PurchaseOrder> {
  const companyId = requireActiveCompanyId();

  if (!supabase || !companyId) {
    const local = readPurchaseOrdersFromLocal();
    const existingIdx = po.id ? local.findIndex((p) => p.id === po.id) : -1;
    const poId = po.id || globalThis.crypto?.randomUUID?.() || `po-${Date.now()}`;
    const now = new Date().toISOString();

    const mappedLines: PurchaseOrderLine[] = lines.map((line, idx) => {
      const qty = Math.max(0.0001, Number(line.quantity) || 1);
      const unitPrice = Math.max(0, Number(line.unitPrice) || 0);
      const amount = Math.round(qty * unitPrice * 100) / 100;
      return {
        id: line.id || globalThis.crypto?.randomUUID?.() || `line-${poId}-${idx + 1}`,
        companyId,
        purchaseOrderId: poId,
        lineNumber: idx + 1,
        description: line.description.trim(),
        quantity: qty,
        unit: (line.unit || "pcs").trim(),
        unitPrice,
        amount,
        projectCostCodeId: line.projectCostCodeId || null,
        createdAt: now,
        updatedAt: now,
      };
    });

    const totalAmount = Math.round(mappedLines.reduce((sum, l) => sum + l.amount, 0) * 100) / 100;

    const saved: PurchaseOrder = {
      id: poId,
      companyId,
      poNumber: po.poNumber.trim().toUpperCase(),
      vendorId: po.vendorId,
      projectId: po.projectId,
      currency: (po.currency || "PHP").trim().toUpperCase(),
      status: po.status || (existingIdx >= 0 ? local[existingIdx].status : "DRAFT"),
      issueDate: po.issueDate || null,
      description: po.description || null,
      notes: po.notes || null,
      cancellationReason: po.cancellationReason || null,
      totalAmount,
      lines: mappedLines,
      createdAt: existingIdx >= 0 ? local[existingIdx].createdAt : now,
      updatedAt: now,
      approvedAt: po.approvedAt || (existingIdx >= 0 ? local[existingIdx].approvedAt : null),
      issuedAt: po.issuedAt || (existingIdx >= 0 ? local[existingIdx].issuedAt : null),
      cancelledAt: po.cancelledAt || (existingIdx >= 0 ? local[existingIdx].cancelledAt : null),
      closedAt: po.closedAt || (existingIdx >= 0 ? local[existingIdx].closedAt : null),
    };

    if (existingIdx >= 0) {
      local[existingIdx] = saved;
    } else {
      local.unshift(saved);
    }
    writePurchaseOrdersToLocal(local);
    return saved;
  }

  const { data, error } = await supabase.rpc("save_purchase_order", {
    p_po: {
      id: po.id || null,
      companyId,
      poNumber: po.poNumber.trim().toUpperCase(),
      vendorId: po.vendorId,
      projectId: po.projectId,
      currency: (po.currency || "PHP").trim().toUpperCase(),
      issueDate: po.issueDate || null,
      description: po.description || null,
      notes: po.notes || null,
    },
    p_lines: lines.map((l, idx) => ({
      id: l.id || null,
      description: l.description.trim(),
      quantity: Number(l.quantity) || 1,
      unit: (l.unit || "pcs").trim(),
      unitPrice: Number(l.unitPrice) || 0,
      projectCostCodeId: l.projectCostCodeId || null,
    })),
  });

  if (error) throw error;
  const result = data as { purchaseOrder: Row; lines: Row[] };
  return purchaseOrderFromRow(result.purchaseOrder, result.lines || []);
}

export async function transitionPurchaseOrderStatus(
  poId: string,
  targetStatus: PurchaseOrderStatus,
  reason?: string,
): Promise<PurchaseOrder> {
  const companyId = requireActiveCompanyId();

  if (!supabase || !companyId) {
    const local = readPurchaseOrdersFromLocal();
    const idx = local.findIndex((p) => p.id === poId);
    if (idx < 0) throw new Error("Purchase order not found");
    const existing = local[idx];

    if (existing.status === "CLOSED" || existing.status === "CANCELLED") {
      throw new Error("Closed or cancelled purchase orders cannot undergo further transitions");
    }

    const now = new Date().toISOString();
    const updated: PurchaseOrder = {
      ...existing,
      status: targetStatus,
      updatedAt: now,
      ...(targetStatus === "APPROVED" ? { approvedAt: now } : {}),
      ...(targetStatus === "ISSUED" ? { issuedAt: now } : {}),
      ...(targetStatus === "CLOSED" ? { closedAt: now } : {}),
      ...(targetStatus === "CANCELLED" ? { cancelledAt: now, cancellationReason: reason || null } : {}),
    };
    local[idx] = updated;
    writePurchaseOrdersToLocal(local);
    return updated;
  }

  const { data, error } = await supabase.rpc("transition_purchase_order_status", {
    p_po_id: poId,
    p_target_status: targetStatus,
    p_reason: reason || null,
  });

  if (error) throw error;
  const result = data as { purchaseOrder: Row; lines: Row[] };
  return purchaseOrderFromRow(result.purchaseOrder, result.lines || []);
}

export async function deleteDraftPurchaseOrder(poId: string): Promise<void> {
  const companyId = requireActiveCompanyId();

  if (!supabase || !companyId) {
    const local = readPurchaseOrdersFromLocal();
    const existing = local.find((p) => p.id === poId);
    if (!existing) return;
    if (existing.status !== "DRAFT") {
      throw new Error("Only draft purchase orders may be deleted");
    }
    const filtered = local.filter((p) => p.id !== poId);
    writePurchaseOrdersToLocal(filtered);
    return;
  }

  const { error } = await supabase.rpc("delete_draft_purchase_order", {
    p_po_id: poId,
  });

  if (error) throw error;
}
