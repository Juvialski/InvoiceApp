import type {
  InvoiceData,
  PurchaseOrder,
  PurchaseOrderInvoiceMatch,
  PurchaseOrderInvoiceMatchLine,
  PurchaseOrderInvoiceMatchSource,
  PurchaseOrderInvoiceMatchStatus,
} from "../types.ts";
import { supabase } from "./supabase.ts";
import { requireActiveCompanyId } from "./companyContext.ts";
import { readPurchaseOrdersFromLocal } from "./purchaseOrders.ts";
import { resolvedInvoiceVendorId, validateMatchLineAssociations } from "../utils/purchaseOrderMatching.ts";

export const MATCH_STORAGE_KEY = "engineering_purchase_order_invoice_matches";
type Row = Record<string, unknown>;

function text(value: unknown): string | undefined {
  return value === null || value === undefined || value === "" ? undefined : String(value);
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function purchaseOrderInvoiceMatchLineFromRow(row: Row): PurchaseOrderInvoiceMatchLine {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    matchId: String(row.match_id),
    purchaseOrderLineId: String(row.purchase_order_line_id),
    invoiceLineId: String(row.invoice_line_id),
    lineNumber: Number(row.line_number) || 1,
    matchedQuantity: numberOrNull(row.matched_quantity),
    matchedAmount: numberOrNull(row.matched_amount),
    notes: text(row.notes) || null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

export function purchaseOrderInvoiceMatchFromRow(
  row: Row,
  lineRows: Row[] = [],
): PurchaseOrderInvoiceMatch {
  const lines = lineRows.map(purchaseOrderInvoiceMatchLineFromRow);

  return {
    id: String(row.id),
    companyId: text(row.company_id),
    invoiceId: String(row.invoice_id),
    purchaseOrderId: String(row.purchase_order_id),
    matchSource: (String(row.match_source || "MANUAL").toUpperCase() as PurchaseOrderInvoiceMatchSource) || "MANUAL",
    status: (String(row.status || "CONFIRMED").toUpperCase() as PurchaseOrderInvoiceMatchStatus) || "CONFIRMED",
    confirmedByUserId: text(row.confirmed_by_user_id) || null,
    confirmedAt: String(row.confirmed_at || new Date().toISOString()),
    unmatchedByUserId: text(row.unmatched_by_user_id) || null,
    unmatchedAt: text(row.unmatched_at) || null,
    unmatchReason: text(row.unmatch_reason) || null,
    notes: text(row.notes) || null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
    lines,
  };
}

export function readPurchaseOrderMatchesFromLocal(storage?: Storage): PurchaseOrderInvoiceMatch[] {
  const target = storage || (typeof localStorage === "undefined" ? undefined : localStorage);
  if (!target) return [];
  try {
    const raw = target.getItem(MATCH_STORAGE_KEY);
    if (!raw) return [];
    const value = JSON.parse(raw);
    return Array.isArray(value) ? (value as PurchaseOrderInvoiceMatch[]) : [];
  } catch {
    return [];
  }
}

export function writePurchaseOrderMatchesToLocal(
  matches: PurchaseOrderInvoiceMatch[],
  storage?: Storage,
): void {
  const target = storage || (typeof localStorage === "undefined" ? undefined : localStorage);
  if (!target) return;
  try {
    target.setItem(MATCH_STORAGE_KEY, JSON.stringify(matches));
  } catch {
    /* ignore */
  }
}

export async function fetchPurchaseOrderMatches(
  options?: { invoiceId?: string; purchaseOrderId?: string },
  storage?: Storage,
): Promise<PurchaseOrderInvoiceMatch[]> {
  const companyId = requireActiveCompanyId();

  if (!supabase || !companyId || storage) {
    const local = readPurchaseOrderMatchesFromLocal(storage);
    return local.filter((m) => {
      if (companyId && m.companyId && m.companyId !== companyId) return false;
      if (options?.invoiceId && m.invoiceId !== options.invoiceId) return false;
      if (options?.purchaseOrderId && m.purchaseOrderId !== options.purchaseOrderId) return false;
      return true;
    });
  }

  let query = supabase
    .from("purchase_order_invoice_matches")
    .select("*, purchase_order_invoice_match_lines(*)")
    .eq("company_id", companyId)
    .order("confirmed_at", { ascending: false });

  if (options?.invoiceId) {
    query = query.eq("invoice_id", options.invoiceId);
  }

  if (options?.purchaseOrderId) {
    query = query.eq("purchase_order_id", options.purchaseOrderId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((row) => {
    const lines = Array.isArray(row.purchase_order_invoice_match_lines)
      ? row.purchase_order_invoice_match_lines
      : [];
    return purchaseOrderInvoiceMatchFromRow(row as Row, lines as Row[]);
  });
}

export interface ConfirmPurchaseOrderMatchParams {
  invoiceId: string;
  purchaseOrderId: string;
  matchSource?: PurchaseOrderInvoiceMatchSource | string;
  notes?: string | null;
  lines?: Array<{
    purchaseOrderLineId: string;
    invoiceLineId: string;
    matchedQuantity?: number | null;
    matchedAmount?: number | null;
    notes?: string | null;
  }>;
  invoice?: InvoiceData;
  purchaseOrder?: PurchaseOrder;
  storage?: Storage;
}

export async function confirmPurchaseOrderMatch(
  params: ConfirmPurchaseOrderMatchParams,
): Promise<PurchaseOrderInvoiceMatch> {
  const companyId = requireActiveCompanyId();

  if (!supabase || !companyId || params.storage) {
    const localMatches = readPurchaseOrderMatchesFromLocal(params.storage);

    // 1. Check for active confirmed match on this invoice
    const existingActive = localMatches.find(
      (m) =>
        m.invoiceId === params.invoiceId &&
        m.status === "CONFIRMED" &&
        (!companyId || !m.companyId || m.companyId === companyId),
    );
    if (existingActive) {
      throw new Error("An active confirmed match already exists for this invoice");
    }

    // 2. Fetch or validate purchase order
    const localPOs = readPurchaseOrdersFromLocal(params.storage);
    const po = params.purchaseOrder || localPOs.find((p) => p.id === params.purchaseOrderId);

    if (!po) {
      throw new Error("Purchase order not found");
    }

    if (po.companyId && companyId && po.companyId !== companyId) {
      throw new Error("Cross-company purchase order match is not permitted");
    }

    if (po.status !== "ISSUED" && po.status !== "CLOSED") {
      throw new Error(
        `Purchase order must be ISSUED or CLOSED to match an invoice (current status: ${po.status})`,
      );
    }

    // 3. Validate invoice if provided
    const inv = params.invoice;
    if (inv) {
      if (inv.lifecycleStatus === "VOID" || inv.voidedAt) {
        throw new Error("Cannot match a void invoice");
      }

      if ((inv as any).companyId && companyId && (inv as any).companyId !== companyId) {
        throw new Error("Cross-company purchase order match is not permitted");
      }

      const invCurrency = (inv.currency || "").trim().toUpperCase();
      const poCurrency = (po.currency || "").trim().toUpperCase();
      if (invCurrency !== poCurrency) {
        throw new Error(
          `Currency mismatch: invoice currency (${invCurrency}) does not match purchase order currency (${poCurrency})`,
        );
      }

      const invVendorId = resolvedInvoiceVendorId(inv);
      if (!invVendorId) {
        throw new Error("Invoice vendor must be resolved before matching");
      }
      if (invVendorId !== po.vendorId) {
        throw new Error("Vendor mismatch: invoice vendor does not match purchase order vendor");
      }

      // Line validations
      const lineValidation = validateMatchLineAssociations(inv, po, params.lines);
      if (!lineValidation.isValid) {
        throw new Error(lineValidation.errors[0]);
      }
    }

    const now = new Date().toISOString();
    const matchId = globalThis.crypto?.randomUUID?.() || `match-${Date.now()}`;

    const mappedLines: PurchaseOrderInvoiceMatchLine[] = (params.lines || []).map((l, idx) => ({
      id: globalThis.crypto?.randomUUID?.() || `match-line-${matchId}-${idx + 1}`,
      companyId: companyId || undefined,
      matchId,
      purchaseOrderLineId: l.purchaseOrderLineId,
      invoiceLineId: l.invoiceLineId,
      lineNumber: idx + 1,
      matchedQuantity: l.matchedQuantity !== undefined ? l.matchedQuantity : null,
      matchedAmount: l.matchedAmount !== undefined ? l.matchedAmount : null,
      notes: l.notes?.trim() || null,
      createdAt: now,
      updatedAt: now,
    }));

    const newMatch: PurchaseOrderInvoiceMatch = {
      id: matchId,
      companyId: companyId || undefined,
      invoiceId: params.invoiceId,
      purchaseOrderId: params.purchaseOrderId,
      matchSource: (params.matchSource as PurchaseOrderInvoiceMatchSource) || "MANUAL",
      status: "CONFIRMED",
      confirmedByUserId: null,
      confirmedAt: now,
      unmatchedByUserId: null,
      unmatchedAt: null,
      unmatchReason: null,
      notes: params.notes?.trim() || null,
      createdAt: now,
      updatedAt: now,
      lines: mappedLines,
    };

    localMatches.unshift(newMatch);
    writePurchaseOrderMatchesToLocal(localMatches, params.storage);
    return newMatch;
  }

  const { data, error } = await supabase.rpc("confirm_purchase_order_invoice_match", {
    p_invoice_id: params.invoiceId,
    p_purchase_order_id: params.purchaseOrderId,
    p_match_source: params.matchSource || "MANUAL",
    p_notes: params.notes?.trim() || null,
    p_lines: (params.lines || []).map((l) => ({
      purchaseOrderLineId: l.purchaseOrderLineId,
      invoiceLineId: l.invoiceLineId,
      matchedQuantity: l.matchedQuantity ?? null,
      matchedAmount: l.matchedAmount ?? null,
      notes: l.notes?.trim() || null,
    })),
  });

  if (error) throw error;
  const result = data as { match: Row; lines: Row[] };
  return purchaseOrderInvoiceMatchFromRow(result.match, result.lines || []);
}

export async function unmatchPurchaseOrderMatch(
  matchId: string,
  reason: string,
  storage?: Storage,
): Promise<PurchaseOrderInvoiceMatch> {
  const companyId = requireActiveCompanyId();

  if (!reason || reason.trim().length < 3) {
    throw new Error("Unmatch reason must contain at least 3 characters");
  }

  if (!supabase || !companyId || storage) {
    const local = readPurchaseOrderMatchesFromLocal(storage);
    const idx = local.findIndex((m) => m.id === matchId);
    if (idx < 0) {
      throw new Error("Purchase order match not found");
    }

    const existing = local[idx];
    if (existing.status !== "CONFIRMED") {
      throw new Error(`Match is already ${existing.status}`);
    }

    const now = new Date().toISOString();
    const updated: PurchaseOrderInvoiceMatch = {
      ...existing,
      status: "UNMATCHED",
      unmatchedByUserId: null,
      unmatchedAt: now,
      unmatchReason: reason.trim(),
      updatedAt: now,
    };

    local[idx] = updated;
    writePurchaseOrderMatchesToLocal(local, storage);
    return updated;
  }

  const { data, error } = await supabase.rpc("unmatch_purchase_order_invoice", {
    p_match_id: matchId,
    p_reason: reason.trim(),
  });

  if (error) throw error;
  const result = data as { match: Row; lines: Row[] };
  return purchaseOrderInvoiceMatchFromRow(result.match, result.lines || []);
}