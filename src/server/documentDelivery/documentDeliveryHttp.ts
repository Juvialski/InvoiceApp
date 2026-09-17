import {
  buildClientInvoicePdf,
  buildPurchaseOrderPdf,
  type ClientInvoiceDocumentSnapshot,
  type PurchaseOrderDocumentSnapshot,
} from "../../lib/documentGeneration.ts";
import { loadServerPdfLogo } from "../documentPdfLogo.ts";
import {
  ApiAuthorizationError,
  type CompanyRequestAuthorization,
} from "../auth/serverAuthorization.ts";

export type IssuedDocumentType = "PURCHASE_ORDER" | "CLIENT_INVOICE";
export type DocumentAttachmentSource = "COMPANY_TEMPLATE_PDF" | "PROGRAMMATIC_PDF_FALLBACK";

export function issuedDocumentType(value: unknown): IssuedDocumentType | null {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized === "PURCHASE_ORDER" || normalized === "CLIENT_INVOICE" ? normalized : null;
}

export function documentReadPermission(documentType: IssuedDocumentType): "procurement.read" | "projects.read" {
  return documentType === "PURCHASE_ORDER" ? "procurement.read" : "projects.read";
}

export async function assertIssuedDocumentDeliveryLifecycle(
  auth: CompanyRequestAuthorization,
  documentType: IssuedDocumentType,
  documentId: string,
) {
  const table = documentType === "PURCHASE_ORDER" ? "purchase_orders" : "client_billings";
  const { data, error } = await auth.supabase
    .from(table)
    .select("status")
    .eq("company_id", auth.companyId)
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw error;
  const status = String(data?.status || "").toUpperCase();
  const allowed = documentType === "PURCHASE_ORDER"
    ? status === "ISSUED" || status === "CLOSED"
    : status === "ISSUED";
  if (!allowed) {
    throw new ApiAuthorizationError(
      409,
      "COMPANY_REQUIRED",
      documentType === "PURCHASE_ORDER"
        ? "Only issued or closed purchase orders can be sent. Cancelled and draft orders remain unavailable for delivery."
        : "Only issued client invoices can be sent. Cancelled and voided invoices remain unavailable for delivery.",
    );
  }
}

export function documentSendResponseData(intent: Record<string, any>, extras: Record<string, unknown> = {}) {
  const source = String(intent.attachment_source || "").toUpperCase();
  const attachmentSource: DocumentAttachmentSource | undefined = source === "COMPANY_TEMPLATE_PDF"
    ? "COMPANY_TEMPLATE_PDF"
    : source === "PROGRAMMATIC_PDF_FALLBACK" ? "PROGRAMMATIC_PDF_FALLBACK" : undefined;
  const trustedSha256 = String(intent.trusted_sha256 || "").toLowerCase();
  return {
    status: String(extras.status || intent.status || "UNKNOWN").toUpperCase(),
    ...(intent.provider_id ? { providerId: String(intent.provider_id) } : {}),
    ...(intent.provider_message_id ? { providerMessageId: String(intent.provider_message_id) } : {}),
    ...(intent.provider_status ? { providerStatus: String(intent.provider_status) } : {}),
    ...(intent.reconciliation_required ? { reconciliationRequired: true } : {}),
    ...(intent.attachment_name ? { attachmentName: String(intent.attachment_name).slice(0, 180) } : {}),
    ...(attachmentSource ? { attachmentSource } : {}),
    ...(/^[0-9a-f]{64}$/.test(trustedSha256) ? { attachmentSha256: trustedSha256 } : {}),
    ...(intent.template_version ? { templateVersion: String(intent.template_version).slice(0, 200) } : {}),
    ...extras,
  };
}

export async function renderTrustedIssuedPdf(row: { id: string; document_type: string; document_id: string; document_number: string; template_version: string; snapshot: unknown }, documentType: "PURCHASE_ORDER" | "CLIENT_INVOICE") {
  if (!row.snapshot || typeof row.snapshot !== "object" || Array.isArray(row.snapshot)) {
    throw new ApiAuthorizationError(409, "COMPANY_REQUIRED", "The immutable issued snapshot cannot be rendered for sending.");
  }
  const snapshot = {
    ...(row.snapshot as Record<string, unknown>),
    snapshotId: row.id,
    documentId: row.document_id,
    documentType,
    documentNumber: row.document_number,
    templateVersion: row.template_version,
    status: "ISSUED",
  };
  const image = await loadServerPdfLogo((snapshot as any).company?.logoPath);
  const bytes = documentType === "PURCHASE_ORDER"
    ? buildPurchaseOrderPdf(snapshot as PurchaseOrderDocumentSnapshot, image)
    : buildClientInvoicePdf(snapshot as ClientInvoiceDocumentSnapshot, image);
  const pdfBytes = Buffer.from(bytes);
  if (pdfBytes.length === 0 || pdfBytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new ApiAuthorizationError(503, "SERVER_AUTH_UNAVAILABLE", "The immutable issued document could not be rendered safely.");
  }
  return pdfBytes;
}
