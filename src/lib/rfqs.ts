import type {
  RFQ,
  RFQLine,
  RFQInvitedVendor,
  RFQStatus,
  SupplierQuotation,
  SupplierQuotationLine,
  SupplierQuotationStatus,
  PurchaseOrder,
  PurchaseOrderLine,
} from "../types.ts";
import { supabase } from "./supabase.ts";
import { getActiveCompanyId } from "./companyContext.ts";
import {
  purchaseOrderFromRow,
  readPurchaseOrdersFromLocal,
  writePurchaseOrdersToLocal,
} from "./purchaseOrders.ts";

export const RFQ_STORAGE_KEY = "engineering_rfqs";
export const QUOTATION_STORAGE_KEY = "engineering_supplier_quotations";

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

export function clearRFQMemoryStore(): void {
  memoryStore.clear();
}

function text(value: unknown): string | undefined {
  return value === null || value === undefined || value === "" ? undefined : String(value);
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// ---------------------------------------------------------------------------
// Row Mappers
// ---------------------------------------------------------------------------

export function rfqLineFromRow(row: Row): RFQLine {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    rfqId: String(row.rfq_id),
    lineNumber: numberValue(row.line_number, 1),
    description: String(row.description || ""),
    quantity: numberValue(row.quantity, 1),
    unit: String(row.unit || "pcs"),
    projectCostCodeId: text(row.project_cost_code_id) || null,
    requestedDeliveryDate: text(row.requested_delivery_date) || null,
    notes: text(row.notes) || null,
    createdAt: text(row.created_at) || new Date().toISOString(),
    updatedAt: text(row.updated_at) || new Date().toISOString(),
  };
}

export function rfqInvitedVendorFromRow(row: Row): RFQInvitedVendor {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    rfqId: String(row.rfq_id),
    vendorId: String(row.vendor_id),
    invitedAt: String(row.invited_at || new Date().toISOString()),
    notes: text(row.notes) || null,
    createdAt: text(row.created_at) || new Date().toISOString(),
  };
}

export function rfqFromRow(
  row: Row,
  lineRows: Row[] = [],
  invitedVendorRows: Row[] = [],
): RFQ {
  const lines = lineRows
    .map(rfqLineFromRow)
    .sort((a, b) => a.lineNumber - b.lineNumber);
  const invitedVendors = invitedVendorRows.map(rfqInvitedVendorFromRow);
  const invitedVendorIds = invitedVendors.map((v) => v.vendorId);

  return {
    id: String(row.id),
    companyId: text(row.company_id),
    rfqNumber: String(row.rfq_number || "").toUpperCase(),
    title: String(row.title || ""),
    description: text(row.description) || null,
    projectId: text(row.project_id) || null,
    currency: String(row.currency || "PHP").toUpperCase(),
    status: (String(row.status || "DRAFT").toUpperCase() as RFQStatus) || "DRAFT",
    issueDate: text(row.issue_date) || null,
    dueDate: text(row.due_date) || null,
    notes: text(row.notes) || null,
    cancellationReason: text(row.cancellation_reason) || null,
    selectedQuotationId: text(row.selected_quotation_id) || null,
    lines,
    invitedVendorIds,
    invitedVendors,
    createdByUserId: text(row.created_by_user_id) || null,
    updatedByUserId: text(row.updated_by_user_id) || null,
    issuedByUserId: text(row.issued_by_user_id) || null,
    closedByUserId: text(row.closed_by_user_id) || null,
    cancelledByUserId: text(row.cancelled_by_user_id) || null,
    createdAt: text(row.created_at) || new Date().toISOString(),
    updatedAt: text(row.updated_at) || new Date().toISOString(),
    issuedAt: text(row.issued_at) || null,
    closedAt: text(row.closed_at) || null,
    cancelledAt: text(row.cancelled_at) || null,
  };
}

export function supplierQuotationLineFromRow(row: Row): SupplierQuotationLine {
  const qty = numberValue(row.quantity, 0);
  const unitPrice = numberValue(row.unit_price, 0);
  const isNoBid = Boolean(row.is_no_bid);
  const amount = isNoBid ? 0 : (row.amount != null ? numberValue(row.amount) : Math.round(qty * unitPrice * 100) / 100);

  return {
    id: String(row.id),
    companyId: text(row.company_id),
    quotationId: String(row.quotation_id),
    rfqLineId: text(row.rfq_line_id) || null,
    lineNumber: numberValue(row.line_number, 1),
    description: String(row.description || ""),
    quantity: qty,
    unit: String(row.unit || "pcs"),
    unitPrice,
    amount,
    leadTimeDays: row.lead_time_days != null ? numberValue(row.lead_time_days) : null,
    isNoBid,
    notes: text(row.notes) || null,
    createdAt: text(row.created_at) || new Date().toISOString(),
    updatedAt: text(row.updated_at) || new Date().toISOString(),
  };
}

export function supplierQuotationFromRow(
  row: Row,
  lineRows: Row[] = [],
): SupplierQuotation {
  const lines = lineRows
    .map(supplierQuotationLineFromRow)
    .sort((a, b) => a.lineNumber - b.lineNumber);
  const totalAmount = lines.length > 0
    ? lines.reduce((sum, l) => sum + (l.isNoBid ? 0 : l.amount), 0)
    : numberValue(row.total_amount, 0);

  return {
    id: String(row.id),
    companyId: text(row.company_id),
    rfqId: String(row.rfq_id),
    vendorId: String(row.vendor_id),
    quotationNumber: String(row.quotation_number || ""),
    quotationDate: String(row.quotation_date || new Date().toISOString().slice(0, 10)),
    validUntil: text(row.valid_until) || null,
    currency: String(row.currency || "PHP").toUpperCase(),
    paymentTerms: text(row.payment_terms) || null,
    deliveryTerms: text(row.delivery_terms) || null,
    leadTimeDays: row.lead_time_days != null ? numberValue(row.lead_time_days) : null,
    notes: text(row.notes) || null,
    totalAmount: Math.round(totalAmount * 100) / 100,
    status: (String(row.status || "SUBMITTED").toUpperCase() as SupplierQuotationStatus) || "SUBMITTED",
    selectedAt: text(row.selected_at) || null,
    selectedByUserId: text(row.selected_by_user_id) || null,
    selectionReason: text(row.selection_reason) || null,
    deselectedAt: text(row.deselected_at) || null,
    deselectedByUserId: text(row.deselected_by_user_id) || null,
    deselectionReason: text(row.deselection_reason) || null,
    lines,
    createdByUserId: text(row.created_by_user_id) || null,
    createdAt: text(row.created_at) || new Date().toISOString(),
    updatedAt: text(row.updated_at) || new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// LocalStorage Persistence
// ---------------------------------------------------------------------------

export function readRFQsFromLocal(storage?: Storage): RFQ[] {
  const target = getStorage(storage);
  if (!target) return [];
  try {
    const value = JSON.parse(target.getItem(RFQ_STORAGE_KEY) || "[]");
    return Array.isArray(value) ? (value as RFQ[]) : [];
  } catch {
    return [];
  }
}

export function writeRFQsToLocal(rfqs: RFQ[], storage?: Storage): void {
  const target = getStorage(storage);
  if (!target) return;
  try {
    target.setItem(RFQ_STORAGE_KEY, JSON.stringify(rfqs));
  } catch {
    /* ignore */
  }
}

export function readSupplierQuotationsFromLocal(storage?: Storage): SupplierQuotation[] {
  const target = getStorage(storage);
  if (!target) return [];
  try {
    const value = JSON.parse(target.getItem(QUOTATION_STORAGE_KEY) || "[]");
    return Array.isArray(value) ? (value as SupplierQuotation[]) : [];
  } catch {
    return [];
  }
}

export function writeSupplierQuotationsToLocal(quotes: SupplierQuotation[], storage?: Storage): void {
  const target = getStorage(storage);
  if (!target) return;
  try {
    target.setItem(QUOTATION_STORAGE_KEY, JSON.stringify(quotes));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// CRUD & RPC Client Functions with Local Fallback
// ---------------------------------------------------------------------------

export async function fetchRFQs(projectId?: string): Promise<RFQ[]> {
  const companyId = getActiveCompanyId();
  if (!supabase || !companyId) {
    const local = readRFQsFromLocal();
    return projectId ? local.filter((r) => r.projectId === projectId) : local;
  }

  let query = supabase
    .from("rfqs")
    .select("*, rfq_lines(*), rfq_invited_vendors(*)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((row) => {
    const lines = Array.isArray(row.rfq_lines) ? row.rfq_lines : [];
    const invitedVendors = Array.isArray(row.rfq_invited_vendors) ? row.rfq_invited_vendors : [];
    return rfqFromRow(row as Row, lines as Row[], invitedVendors as Row[]);
  });
}

export async function fetchRFQ(id: string): Promise<RFQ | null> {
  const companyId = getActiveCompanyId();
  if (!supabase || !companyId) {
    const local = readRFQsFromLocal();
    return local.find((r) => r.id === id) || null;
  }

  const { data, error } = await supabase
    .from("rfqs")
    .select("*, rfq_lines(*), rfq_invited_vendors(*)")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const lines = Array.isArray(data.rfq_lines) ? data.rfq_lines : [];
  const invitedVendors = Array.isArray(data.rfq_invited_vendors) ? data.rfq_invited_vendors : [];
  return rfqFromRow(data as Row, lines as Row[], invitedVendors as Row[]);
}

export async function saveRFQ(
  rfq: Partial<RFQ> & { rfqNumber: string; title: string },
  lines: Array<Partial<RFQLine> & { description: string; quantity: number }>,
  invitedVendorIds?: string[],
): Promise<RFQ> {
  const companyId = getActiveCompanyId();

  if (!supabase || !companyId) {
    const local = readRFQsFromLocal();
    const existingIdx = rfq.id ? local.findIndex((r) => r.id === rfq.id) : -1;

    if (existingIdx >= 0 && local[existingIdx].status !== "DRAFT") {
      throw new Error("Only draft RFQs may be modified");
    }

    const rfqNumber = (rfq.rfqNumber || "").trim().toUpperCase();
    if (rfqNumber.length < 1 || rfqNumber.length > 60) {
      throw new Error("Valid RFQ number is required (1-60 characters)");
    }

    const title = (rfq.title || "").trim();
    if (title.length < 1 || title.length > 200) {
      throw new Error("Valid RFQ title is required (1-200 characters)");
    }

    const currency = (rfq.currency || "PHP").trim().toUpperCase();
    if (currency.length !== 3) {
      throw new Error("Currency must be a 3-letter ISO code");
    }

    const rfqId = rfq.id || globalThis.crypto?.randomUUID?.() || `rfq-${Date.now()}`;
    const now = new Date().toISOString();

    const mappedLines: RFQLine[] = lines.map((line, idx) => {
      const desc = (line.description || "").trim();
      if (desc.length < 1) {
        throw new Error(`Line ${idx + 1} description is required`);
      }
      const qty = Number(line.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error(`Line ${idx + 1} quantity must be positive`);
      }
      return {
        id: line.id || globalThis.crypto?.randomUUID?.() || `line-${rfqId}-${idx + 1}`,
        companyId: companyId || undefined,
        rfqId,
        lineNumber: idx + 1,
        description: desc,
        quantity: qty,
        unit: (line.unit || "pcs").trim(),
        projectCostCodeId: line.projectCostCodeId || null,
        requestedDeliveryDate: line.requestedDeliveryDate || null,
        notes: line.notes || null,
        createdAt: line.createdAt || now,
        updatedAt: now,
      };
    });

    const vendorIds = invitedVendorIds || (rfq.invitedVendorIds ?? (existingIdx >= 0 ? local[existingIdx].invitedVendorIds : [])) || [];
    const mappedVendors: RFQInvitedVendor[] = vendorIds.map((vendorId) => ({
      id: `iv-${rfqId}-${vendorId}`,
      companyId: companyId || undefined,
      rfqId,
      vendorId,
      invitedAt: now,
      createdAt: now,
    }));

    const saved: RFQ = {
      id: rfqId,
      companyId: companyId || undefined,
      rfqNumber,
      title,
      description: rfq.description || null,
      projectId: rfq.projectId || null,
      currency,
      status: "DRAFT",
      issueDate: rfq.issueDate || null,
      dueDate: rfq.dueDate || null,
      notes: rfq.notes || null,
      cancellationReason: null,
      selectedQuotationId: existingIdx >= 0 ? local[existingIdx].selectedQuotationId : null,
      lines: mappedLines,
      invitedVendorIds: vendorIds,
      invitedVendors: mappedVendors,
      createdAt: existingIdx >= 0 ? local[existingIdx].createdAt : now,
      updatedAt: now,
    };

    if (existingIdx >= 0) {
      local[existingIdx] = saved;
    } else {
      local.unshift(saved);
    }
    writeRFQsToLocal(local);
    return saved;
  }

  const { data, error } = await supabase.rpc("save_rfq", {
    p_rfq: {
      id: rfq.id || null,
      companyId,
      rfqNumber: rfq.rfqNumber.trim().toUpperCase(),
      title: rfq.title.trim(),
      description: rfq.description || null,
      projectId: rfq.projectId || null,
      currency: (rfq.currency || "PHP").trim().toUpperCase(),
      issueDate: rfq.issueDate || null,
      dueDate: rfq.dueDate || null,
      notes: rfq.notes || null,
    },
    p_lines: lines.map((l) => ({
      description: l.description.trim(),
      quantity: Number(l.quantity),
      unit: (l.unit || "pcs").trim(),
      projectCostCodeId: l.projectCostCodeId || null,
      requestedDeliveryDate: l.requestedDeliveryDate || null,
      notes: l.notes || null,
    })),
    p_invited_vendor_ids: invitedVendorIds && invitedVendorIds.length > 0 ? invitedVendorIds : null,
  });

  if (error) throw error;
  const result = data as { rfq: Row; lines: Row[] };
  return rfqFromRow(result.rfq, result.lines || []);
}

export async function transitionRFQStatus(
  rfqId: string,
  targetStatus: RFQStatus,
  reason?: string,
): Promise<RFQ> {
  const companyId = getActiveCompanyId();

  if (!supabase || !companyId) {
    const local = readRFQsFromLocal();
    const idx = local.findIndex((r) => r.id === rfqId);
    if (idx < 0) throw new Error("RFQ not found");
    const existing = local[idx];

    if (existing.status === "CLOSED" || existing.status === "CANCELLED") {
      throw new Error("Closed or cancelled RFQs cannot undergo further transitions");
    }

    const now = new Date().toISOString();

    if (targetStatus === "ISSUED") {
      if (existing.status !== "DRAFT") {
        throw new Error("Only draft RFQs may be issued");
      }
      if (!existing.lines || existing.lines.length < 1) {
        throw new Error("Cannot issue an RFQ without line items");
      }
      existing.status = "ISSUED";
      existing.issuedAt = now;
      existing.issueDate = existing.issueDate || now.slice(0, 10);
      existing.updatedAt = now;
    } else if (targetStatus === "CLOSED") {
      if (existing.status !== "ISSUED") {
        throw new Error("Only issued RFQs may be closed");
      }
      existing.status = "CLOSED";
      existing.closedAt = now;
      existing.updatedAt = now;
    } else if (targetStatus === "CANCELLED") {
      const trimmedReason = (reason || "").trim();
      if (trimmedReason.length < 3) {
        throw new Error("Cancellation reason is required (at least 3 characters)");
      }
      existing.status = "CANCELLED";
      existing.cancellationReason = trimmedReason;
      existing.cancelledAt = now;
      existing.updatedAt = now;
    } else {
      throw new Error(`Invalid target status for RFQ: ${targetStatus}`);
    }

    local[idx] = existing;
    writeRFQsToLocal(local);
    return existing;
  }

  const { data, error } = await supabase.rpc("transition_rfq_status", {
    p_rfq_id: rfqId,
    p_target_status: targetStatus,
    p_reason: reason || null,
  });

  if (error) throw error;
  return rfqFromRow(data as Row);
}

export async function deleteDraftRFQ(rfqId: string): Promise<void> {
  const companyId = getActiveCompanyId();

  if (!supabase || !companyId) {
    const local = readRFQsFromLocal();
    const existing = local.find((r) => r.id === rfqId);
    if (!existing) return;

    if (existing.status !== "DRAFT") {
      throw new Error("Only draft RFQs may be deleted");
    }

    const quotes = readSupplierQuotationsFromLocal();
    if (quotes.some((q) => q.rfqId === rfqId)) {
      throw new Error("Cannot delete RFQ with existing supplier quotations");
    }

    const filtered = local.filter((r) => r.id !== rfqId);
    writeRFQsToLocal(filtered);
    return;
  }

  const { error } = await supabase.rpc("delete_draft_rfq", {
    p_rfq_id: rfqId,
  });

  if (error) throw error;
}

export async function fetchSupplierQuotations(rfqId?: string): Promise<SupplierQuotation[]> {
  const companyId = getActiveCompanyId();
  if (!supabase || !companyId) {
    const local = readSupplierQuotationsFromLocal();
    return rfqId ? local.filter((q) => q.rfqId === rfqId) : local;
  }

  let query = supabase
    .from("supplier_quotations")
    .select("*, supplier_quotation_lines(*)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (rfqId) {
    query = query.eq("rfq_id", rfqId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((row) => {
    const lines = Array.isArray(row.supplier_quotation_lines) ? row.supplier_quotation_lines : [];
    return supplierQuotationFromRow(row as Row, lines as Row[]);
  });
}

export async function fetchSupplierQuotation(id: string): Promise<SupplierQuotation | null> {
  const companyId = getActiveCompanyId();
  if (!supabase || !companyId) {
    const local = readSupplierQuotationsFromLocal();
    return local.find((q) => q.id === id) || null;
  }

  const { data, error } = await supabase
    .from("supplier_quotations")
    .select("*, supplier_quotation_lines(*)")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const lines = Array.isArray(data.supplier_quotation_lines) ? data.supplier_quotation_lines : [];
  return supplierQuotationFromRow(data as Row, lines as Row[]);
}

export async function saveSupplierQuotation(
  quotation: Partial<SupplierQuotation> & { rfqId: string; vendorId: string; quotationNumber: string },
  lines: Array<Partial<SupplierQuotationLine> & { description: string; quantity: number; unitPrice: number }>,
): Promise<SupplierQuotation> {
  const companyId = getActiveCompanyId();

  if (!supabase || !companyId) {
    const rfqs = readRFQsFromLocal();
    const rfq = rfqs.find((r) => r.id === quotation.rfqId);
    if (!rfq) {
      throw new Error("RFQ not found in company");
    }
    if (rfq.status === "CLOSED" || rfq.status === "CANCELLED") {
      throw new Error("Cannot submit quotations for closed or cancelled RFQs");
    }

    const quotationNumber = (quotation.quotationNumber || "").trim();
    if (quotationNumber.length < 1 || quotationNumber.length > 60) {
      throw new Error("Quotation reference number is required (1-60 characters)");
    }

    const local = readSupplierQuotationsFromLocal();
    const existingIdx = quotation.id ? local.findIndex((q) => q.id === quotation.id) : -1;
    if (existingIdx >= 0 && local[existingIdx].status === "CANCELLED") {
      throw new Error("Cancelled quotations cannot be modified");
    }

    const quoteId = quotation.id || globalThis.crypto?.randomUUID?.() || `quote-${Date.now()}`;
    const now = new Date().toISOString();
    let totalAmount = 0;

    const mappedLines: SupplierQuotationLine[] = lines.map((line, idx) => {
      const isNoBid = Boolean(line.isNoBid);
      const qty = Math.max(0, Number(line.quantity) || 0);
      const unitPrice = Math.max(0, Number(line.unitPrice) || 0);
      const amount = isNoBid ? 0 : Math.round(qty * unitPrice * 100) / 100;
      if (!isNoBid) {
        totalAmount += amount;
      }
      return {
        id: line.id || globalThis.crypto?.randomUUID?.() || `quote-line-${quoteId}-${idx + 1}`,
        companyId: companyId || undefined,
        quotationId: quoteId,
        rfqLineId: line.rfqLineId || null,
        lineNumber: idx + 1,
        description: (line.description || "").trim(),
        quantity: qty,
        unit: (line.unit || "pcs").trim(),
        unitPrice,
        amount,
        leadTimeDays: line.leadTimeDays != null ? Number(line.leadTimeDays) : null,
        isNoBid,
        notes: line.notes || null,
        createdAt: line.createdAt || now,
        updatedAt: now,
      };
    });

    const saved: SupplierQuotation = {
      id: quoteId,
      companyId: companyId || undefined,
      rfqId: quotation.rfqId,
      vendorId: quotation.vendorId,
      quotationNumber,
      quotationDate: quotation.quotationDate || now.slice(0, 10),
      validUntil: quotation.validUntil || null,
      currency: (quotation.currency || rfq.currency || "PHP").trim().toUpperCase(),
      paymentTerms: quotation.paymentTerms || null,
      deliveryTerms: quotation.deliveryTerms || null,
      leadTimeDays: quotation.leadTimeDays != null ? Number(quotation.leadTimeDays) : null,
      notes: quotation.notes || null,
      totalAmount: Math.round(totalAmount * 100) / 100,
      status: quotation.status || (existingIdx >= 0 ? local[existingIdx].status : "SUBMITTED"),
      selectedAt: existingIdx >= 0 ? local[existingIdx].selectedAt : null,
      selectedByUserId: existingIdx >= 0 ? local[existingIdx].selectedByUserId : null,
      selectionReason: existingIdx >= 0 ? local[existingIdx].selectionReason : null,
      deselectedAt: existingIdx >= 0 ? local[existingIdx].deselectedAt : null,
      deselectedByUserId: existingIdx >= 0 ? local[existingIdx].deselectedByUserId : null,
      deselectionReason: existingIdx >= 0 ? local[existingIdx].deselectionReason : null,
      lines: mappedLines,
      createdAt: existingIdx >= 0 ? local[existingIdx].createdAt : now,
      updatedAt: now,
    };

    if (existingIdx >= 0) {
      local[existingIdx] = saved;
    } else {
      local.unshift(saved);
    }
    writeSupplierQuotationsToLocal(local);
    return saved;
  }

  const { data, error } = await supabase.rpc("save_supplier_quotation", {
    p_quotation: {
      id: quotation.id || null,
      companyId,
      rfqId: quotation.rfqId,
      vendorId: quotation.vendorId,
      quotationNumber: quotation.quotationNumber.trim(),
      quotationDate: quotation.quotationDate || null,
      validUntil: quotation.validUntil || null,
      currency: (quotation.currency || "PHP").trim().toUpperCase(),
      paymentTerms: quotation.paymentTerms || null,
      deliveryTerms: quotation.deliveryTerms || null,
      leadTimeDays: quotation.leadTimeDays != null ? Number(quotation.leadTimeDays) : null,
      notes: quotation.notes || null,
    },
    p_lines: lines.map((l) => ({
      rfqLineId: l.rfqLineId || null,
      description: l.description.trim(),
      quantity: Number(l.quantity) || 0,
      unit: (l.unit || "pcs").trim(),
      unitPrice: Number(l.unitPrice) || 0,
      leadTimeDays: l.leadTimeDays != null ? Number(l.leadTimeDays) : null,
      isNoBid: Boolean(l.isNoBid),
      notes: l.notes || null,
    })),
  });

  if (error) throw error;
  const result = data as { quotation: Row; lines: Row[] };
  return supplierQuotationFromRow(result.quotation, result.lines || []);
}

export async function selectSupplierQuotation(
  quotationId: string,
  reason: string,
): Promise<SupplierQuotation> {
  const companyId = getActiveCompanyId();

  if (!supabase || !companyId) {
    const quotes = readSupplierQuotationsFromLocal();
    const quoteIdx = quotes.findIndex((q) => q.id === quotationId);
    if (quoteIdx < 0) throw new Error("Quotation not found");
    const quote = quotes[quoteIdx];

    const rfqs = readRFQsFromLocal();
    const rfqIdx = rfqs.findIndex((r) => r.id === quote.rfqId);
    if (rfqIdx < 0) throw new Error("Associated RFQ not found");
    const rfq = rfqs[rfqIdx];

    if (rfq.status === "CANCELLED") {
      throw new Error("Cannot select quotation for cancelled RFQ");
    }

    const now = new Date().toISOString();

    // Deselect any other selected quotation for this RFQ
    quotes.forEach((q, idx) => {
      if (q.rfqId === quote.rfqId && q.id !== quotationId && q.status === "SELECTED") {
        quotes[idx] = {
          ...q,
          status: "SUBMITTED",
          deselectedAt: now,
          deselectedByUserId: null,
          deselectionReason: `Replaced by selection of quotation ${quote.quotationNumber}`,
          updatedAt: now,
        };
      }
    });

    const updatedQuote: SupplierQuotation = {
      ...quote,
      status: "SELECTED",
      selectedAt: now,
      selectedByUserId: null,
      selectionReason: reason.trim() || "Selected preferred supplier",
      updatedAt: now,
    };
    quotes[quoteIdx] = updatedQuote;
    writeSupplierQuotationsToLocal(quotes);

    rfqs[rfqIdx] = {
      ...rfq,
      selectedQuotationId: quotationId,
      updatedAt: now,
    };
    writeRFQsToLocal(rfqs);

    return updatedQuote;
  }

  const { data, error } = await supabase.rpc("select_supplier_quotation", {
    p_quotation_id: quotationId,
    p_reason: reason,
  });

  if (error) throw error;
  return supplierQuotationFromRow(data as Row);
}

export async function revertSupplierQuotationSelection(
  rfqId: string,
  reason: string,
): Promise<RFQ> {
  const companyId = getActiveCompanyId();

  if (!supabase || !companyId) {
    const rfqs = readRFQsFromLocal();
    const rfqIdx = rfqs.findIndex((r) => r.id === rfqId);
    if (rfqIdx < 0) throw new Error("RFQ not found");
    const rfq = rfqs[rfqIdx];

    const now = new Date().toISOString();

    if (rfq.selectedQuotationId) {
      const quotes = readSupplierQuotationsFromLocal();
      const quoteIdx = quotes.findIndex((q) => q.id === rfq.selectedQuotationId);
      if (quoteIdx >= 0) {
        quotes[quoteIdx] = {
          ...quotes[quoteIdx],
          status: "SUBMITTED",
          deselectedAt: now,
          deselectedByUserId: null,
          deselectionReason: reason.trim() || "Selection reverted by user",
          updatedAt: now,
        };
        writeSupplierQuotationsToLocal(quotes);
      }
    }

    const updatedRFQ: RFQ = {
      ...rfq,
      selectedQuotationId: null,
      updatedAt: now,
    };
    rfqs[rfqIdx] = updatedRFQ;
    writeRFQsToLocal(rfqs);

    return updatedRFQ;
  }

  const { data, error } = await supabase.rpc("revert_supplier_quotation_selection", {
    p_rfq_id: rfqId,
    p_reason: reason,
  });

  if (error) throw error;
  return rfqFromRow(data as Row);
}

export async function convertQuotationToDraftPO(
  quotationId: string,
  poNumber: string,
  notes?: string,
): Promise<PurchaseOrder> {
  const companyId = getActiveCompanyId();

  if (!supabase || !companyId) {
    const quotes = readSupplierQuotationsFromLocal();
    const quote = quotes.find((q) => q.id === quotationId);
    if (!quote) throw new Error("Quotation not found");

    const rfqs = readRFQsFromLocal();
    const rfq = rfqs.find((r) => r.id === quote.rfqId);
    if (!rfq) throw new Error("Associated RFQ not found");

    if (!rfq.projectId) {
      throw new Error("RFQ must be associated with a Project before converting to Purchase Order");
    }

    const normalizedPoNumber = (poNumber || "").trim().toUpperCase();
    if (normalizedPoNumber.length < 1 || normalizedPoNumber.length > 60) {
      throw new Error("Valid PO number is required (1-60 characters)");
    }

    const poId = globalThis.crypto?.randomUUID?.() || `po-${Date.now()}`;
    const now = new Date().toISOString();

    const poLines: PurchaseOrderLine[] = [];
    let totalAmount = 0;
    let lineIdx = 1;

    for (const qLine of quote.lines || []) {
      if (!qLine.isNoBid && qLine.quantity > 0) {
        const matchingRfqLine = rfq.lines?.find((rl) => rl.id === qLine.rfqLineId);
        const projectCostCodeId = matchingRfqLine?.projectCostCodeId || null;
        const lineAmount = Math.round(qLine.quantity * qLine.unitPrice * 100) / 100;
        totalAmount += lineAmount;

        poLines.push({
          id: globalThis.crypto?.randomUUID?.() || `line-${poId}-${lineIdx}`,
          companyId: quote.companyId || rfq.companyId,
          purchaseOrderId: poId,
          lineNumber: lineIdx,
          description: qLine.description,
          quantity: qLine.quantity,
          unit: qLine.unit || "pcs",
          unitPrice: qLine.unitPrice,
          amount: lineAmount,
          projectCostCodeId,
          createdAt: now,
          updatedAt: now,
        });
        lineIdx++;
      }
    }

    const draftPO: PurchaseOrder = {
      id: poId,
      companyId: quote.companyId || rfq.companyId,
      poNumber: normalizedPoNumber,
      vendorId: quote.vendorId,
      projectId: rfq.projectId,
      currency: quote.currency,
      status: "DRAFT", // CRITICAL: NEVER APPROVED OR ISSUED!
      description: `Generated from RFQ ${rfq.rfqNumber} / Quotation ${quote.quotationNumber}`,
      notes: notes || quote.notes || null,
      rfqId: rfq.id,
      supplierQuotationId: quote.id,
      totalAmount: Math.round(totalAmount * 100) / 100,
      lines: poLines,
      createdAt: now,
      updatedAt: now,
    };

    const existingPOs = readPurchaseOrdersFromLocal();
    existingPOs.unshift(draftPO);
    writePurchaseOrdersToLocal(existingPOs);

    return draftPO;
  }

  const { data, error } = await supabase.rpc("convert_quotation_to_draft_po", {
    p_quotation_id: quotationId,
    p_po_number: poNumber.trim().toUpperCase(),
    p_notes: notes || null,
  });

  if (error) throw error;
  const result = data as { purchaseOrder: Row; lines: Row[] };
  return purchaseOrderFromRow(result.purchaseOrder, result.lines || []);
}
