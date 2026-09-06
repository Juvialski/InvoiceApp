import { requireActiveCompanyId } from "./companyContext.ts";
import { supabase } from "./supabase.ts";
import type { ClientBilling } from "./clientBilling.ts";
import type { CompanyDocumentProfile } from "./companyDocumentProfile.ts";
import type { Project, PurchaseOrder, Vendor } from "../types.ts";
import {
  buildClientInvoiceDocumentSnapshot,
  buildPurchaseOrderDocumentSnapshot,
  type ClientInvoiceDocumentSnapshot,
  type PurchaseOrderDocumentSnapshot,
} from "./documentGeneration.ts";

export type IssuedDocumentSnapshot = PurchaseOrderDocumentSnapshot | ClientInvoiceDocumentSnapshot;

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

export function snapshotFromRpc(value: unknown): IssuedDocumentSnapshot {
  const row = record(value);
  const snapshot = record(row.snapshot);
  if (snapshot.documentType === "CLIENT_INVOICE") return { ...snapshot, documentId: String(row.documentId || ""), snapshotId: String(row.id || "") } as ClientInvoiceDocumentSnapshot;
  return { ...snapshot, documentId: String(row.documentId || ""), snapshotId: String(row.id || "") } as PurchaseOrderDocumentSnapshot;
}

export async function ensurePurchaseOrderDocumentSnapshot(
  purchaseOrderId: string,
  processor?: { name?: string; title?: string },
) {
  if (!supabase) return null;
  requireActiveCompanyId();
  const { data, error } = await supabase.rpc("create_purchase_order_document_snapshot", {
    p_purchase_order_id: purchaseOrderId,
    p_processor_name: processor?.name || null,
    p_processor_title: processor?.title || null,
  });
  if (error) throw error;
  return snapshotFromRpc(data);
}

export async function ensureClientInvoiceDocumentSnapshot(
  clientBillingId: string,
  processor?: { name?: string; title?: string },
) {
  if (!supabase) return null;
  requireActiveCompanyId();
  const { data, error } = await supabase.rpc("create_client_invoice_document_snapshot", {
    p_client_billing_id: clientBillingId,
    p_processor_name: processor?.name || null,
    p_processor_title: processor?.title || null,
  });
  if (error) throw error;
  return snapshotFromRpc(data);
}

export function buildLocalPurchaseOrderSnapshot(
  purchaseOrder: PurchaseOrder,
  vendor: Vendor | undefined,
  project: Project | undefined,
  profile: CompanyDocumentProfile,
  processor?: { name?: string; title?: string },
) {
  return buildPurchaseOrderDocumentSnapshot(purchaseOrder, vendor, project, profile, processor);
}

export function buildLocalClientInvoiceSnapshot(
  billing: ClientBilling,
  project: Project | undefined,
  profile: CompanyDocumentProfile,
  processor?: { name?: string; title?: string },
) {
  return buildClientInvoiceDocumentSnapshot(billing, project, profile, processor);
}
