import express from "express";
import { createHash } from "node:crypto";
import { finalizeIssuedDocumentTemplatePdfForDelivery } from "../documentTemplates/documentTemplateRouter.ts";
import {
  ApiAuthorizationError,
  authorizeCompanyRequest,
  UUID_PATTERN,
} from "../auth/serverAuthorization.ts";
import {
  assertIssuedDocumentDeliveryLifecycle,
  documentReadPermission,
  issuedDocumentType,
  renderTrustedIssuedPdf,
} from "./documentDeliveryHttp.ts";

export function createIssuedDocumentRouter() {
  const router = express.Router();
  router.get("/issued-documents/:documentType/:documentId/pdf", async (req, res) => {
    try {
      const documentType = issuedDocumentType(req.params.documentType);
      const documentId = String(req.params.documentId || "").trim();
      const snapshotId = String(req.query.snapshotId || "").trim();
      if (!documentType || !UUID_PATTERN.test(documentId) || !UUID_PATTERN.test(snapshotId)) {
        return res.status(400).json({ success: false, error: "An issued document type, document ID, and immutable snapshot ID are required." });
      }
      const auth = await authorizeCompanyRequest(req, documentReadPermission(documentType));
      await assertIssuedDocumentDeliveryLifecycle(auth, documentType, documentId);
      const { data: snapshot, error } = await auth.supabase
        .from("issued_document_snapshots")
        .select("id,document_type,document_id,document_number,template_version,template_version_id,template_sha256,snapshot")
        .eq("company_id", auth.companyId)
        .eq("id", snapshotId)
        .eq("document_type", documentType)
        .eq("document_id", documentId)
        .maybeSingle();
      if (error) throw error;
      if (!snapshot) return res.status(409).json({ success: false, error: "The immutable issued document snapshot is unavailable." });

      const templatePdf = await finalizeIssuedDocumentTemplatePdfForDelivery(
        { accessToken: auth.accessToken, companyId: auth.companyId, supabase: auth.supabase, user: auth.user },
        {},
        { snapshotId, documentType, documentId },
      );
      const source = templatePdf ? "COMPANY_TEMPLATE_PDF" : "PROGRAMMATIC_PDF_FALLBACK";
      const pdfBytes = templatePdf ? Buffer.from(templatePdf.bytes) : await renderTrustedIssuedPdf(snapshot as any, documentType);
      const sha256 = createHash("sha256").update(pdfBytes).digest("hex");
      const fileName = `${documentType === "PURCHASE_ORDER" ? "Purchase_Order" : "Client_Invoice"}_${String(snapshot.document_number || "document").replace(/[^A-Za-z0-9._-]+/g, "_")}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
      res.setHeader("X-Document-Pdf-Source", source);
      res.setHeader("X-Document-Pdf-Sha256", sha256);
      res.setHeader("Cache-Control", "private, no-store");
      return res.send(pdfBytes);
    } catch (error: any) {
      const status = error instanceof ApiAuthorizationError ? error.status : 503;
      return res.status(status).json({ success: false, error: error instanceof Error ? error.message : "The issued document PDF could not be rendered safely." });
    }
  });
  return router;
}
