import { requireActiveCompanyId } from "./companyContext.ts";
import { companyApiRequest } from "./companyApi.ts";
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

export interface IssuedDocumentPdfResult {
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly source: "COMPANY_TEMPLATE_PDF" | "PROGRAMMATIC_PDF_FALLBACK";
  readonly sha256?: string;
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

export function snapshotFromRpc(value: unknown): IssuedDocumentSnapshot {
  const row = record(value);
  const snapshot = record(row.snapshot);
  const templateVersionId = String(row.templateVersionId || row.template_version_id || snapshot.templateVersionId || "").trim() || undefined;
  const templateContentSha256 = String(row.templateContentSha256 || row.template_sha256 || snapshot.templateContentSha256 || "").trim() || undefined;
  const shared = {
    ...snapshot,
    documentId: String(row.documentId || row.document_id || ""),
    snapshotId: String(row.id || ""),
    ...(templateVersionId ? { templateVersionId } : {}),
    ...(templateContentSha256 ? { templateContentSha256 } : {}),
  };
  if (snapshot.documentType === "CLIENT_INVOICE") return shared as ClientInvoiceDocumentSnapshot;
  return shared as PurchaseOrderDocumentSnapshot;
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

/** Fetch the exact server-rendered bytes used for an issued-document preview/download. */
export async function loadIssuedDocumentPdf(snapshot: IssuedDocumentSnapshot): Promise<IssuedDocumentPdfResult> {
  if (!snapshot.documentId || !snapshot.snapshotId) throw new Error("An immutable issued snapshot is required before loading its PDF.");
  const companyId = requireActiveCompanyId();
  const response = await companyApiRequest(
    `/api/issued-documents/${encodeURIComponent(snapshot.documentType)}/${encodeURIComponent(snapshot.documentId)}/pdf?snapshotId=${encodeURIComponent(snapshot.snapshotId)}`,
    { companyId },
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "The issued document PDF could not be rendered safely.");
  }
  const disposition = response.headers.get("Content-Disposition") || "";
  const fileName = /filename="([^"]+)"/i.exec(disposition)?.[1] || "HydroQualiSense_Document.pdf";
  const source = response.headers.get("X-Document-Pdf-Source") === "COMPANY_TEMPLATE_PDF"
    ? "COMPANY_TEMPLATE_PDF"
    : "PROGRAMMATIC_PDF_FALLBACK";
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    fileName,
    source,
    sha256: response.headers.get("X-Document-Pdf-Sha256") || undefined,
  };
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
