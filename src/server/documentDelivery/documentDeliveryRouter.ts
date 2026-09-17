import express from "express";
import { mapDocumentDeliveryHistory } from "./documentDeliveryHistory.ts";
import {
  ApiAuthorizationError,
  authorizeCompanyRequest,
  UUID_PATTERN,
} from "../auth/serverAuthorization.ts";
import {
  documentReadPermission,
  issuedDocumentType,
} from "./documentDeliveryHttp.ts";

export function createDocumentDeliveryRouter() {
  const router = express.Router();
  router.get("/document-delivery-history", async (req, res) => {
    try {
      const requestedType = String(req.query.documentType || "").trim().toUpperCase();
      const documentType = issuedDocumentType(requestedType);
      const isGeneralEmail = requestedType === "GENERAL_EMAIL";
      const isGeneralSms = requestedType === "GENERAL_SMS";
      const documentId = String(req.query.documentId || "").trim();
      if ((!documentType && !isGeneralEmail && !isGeneralSms && requestedType) || (documentType && !UUID_PATTERN.test(documentId)) || ((isGeneralEmail || isGeneralSms) && documentId)) {
        return res.status(400).json({ success: false, error: "A supported document type and valid document are required." });
      }
      const auth = documentType
        ? await authorizeCompanyRequest(req, documentReadPermission(documentType))
        : await authorizeCompanyRequest(req, "documents.send");
      const intentSelect = "id,delivery_channel,delivery_kind,document_type,document_id,sender_user_id,recipients,cc,subject,attachment_name,trusted_sha256,message_body_sha256,status,attempt_count,created_at,updated_at,attachment_source,attachment_size,template_version,destination,provider_id,provider_message_id,provider_status,reconciliation_required";
      const auditSelect = "id,send_intent_id,delivery_channel,delivery_kind,document_type,document_id,sender_user_id,recipients,cc,subject,attachment_name,status,created_at,attachment_source,attachment_size,template_version,attachment_sha256,message_body_sha256,destination,provider_id,provider_message_id,provider_status,reconciliation_required";
      let intentsQuery = auth.supabase
        .from("document_send_intents")
        .select(intentSelect)
        .eq("company_id", auth.companyId)
        .order("created_at", { ascending: false })
        .limit(100);
      let auditsQuery = auth.supabase
        .from("document_send_audits")
        .select(auditSelect)
        .eq("company_id", auth.companyId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (documentType) {
        intentsQuery = intentsQuery.eq("document_type", documentType).eq("document_id", documentId);
        auditsQuery = auditsQuery.eq("document_type", documentType).eq("document_id", documentId);
      } else if (isGeneralEmail) {
        intentsQuery = intentsQuery.eq("document_type", "GENERAL_EMAIL");
        auditsQuery = auditsQuery.eq("document_type", "GENERAL_EMAIL");
      } else if (isGeneralSms) {
        intentsQuery = intentsQuery.eq("document_type", "GENERAL_SMS");
        auditsQuery = auditsQuery.eq("document_type", "GENERAL_SMS");
      }
      const [intentsResult, auditsResult] = await Promise.all([
        intentsQuery,
        auditsQuery,
      ]);
      if (intentsResult.error || auditsResult.error) throw intentsResult.error || auditsResult.error;
      const deliveries = mapDocumentDeliveryHistory(
        (intentsResult.data || []) as Array<Record<string, unknown>>,
        (auditsResult.data || []) as Array<Record<string, unknown>>,
        auth.user.id,
      );
      return res.json({ success: true, data: { deliveries } });
    } catch (error: any) {
      const status = error instanceof ApiAuthorizationError ? error.status : Number(error?.status) || 503;
      const message = error instanceof ApiAuthorizationError ? error.message : "Document delivery history is temporarily unavailable.";
      return res.status(status).json({ success: false, error: message });
    }
  });
  return router;
}
