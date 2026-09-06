import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Type } from "@google/genai";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { createHash, randomUUID } from "crypto";
import type { InvoiceData } from "./src/types.ts";
import { buildClientInvoicePdf, buildPurchaseOrderPdf, type ClientInvoiceDocumentSnapshot, type PurchaseOrderDocumentSnapshot } from "./src/lib/documentGeneration.ts";
import { decodeBase64Payload, MAX_EXTRACTION_TEXT_CHARS, MAX_GMAIL_ATTACHMENT_BYTES, MAX_GMAIL_ATTACHMENT_COUNT, MAX_GMAIL_ATTACHMENT_TOTAL_BYTES, MAX_GMAIL_RAW_BYTES, validateGmailAttachmentEnvelope, validateGmailAttachmentBytes, validateGmailRawMessage, validateInvoiceDocumentBytes } from "./src/lib/fileSecurity.ts";
import { AiRequestBudgetError, claimAiRequest, releaseAiRequest } from "./src/server/ai/aiRequestBudget.ts";
import { createAssistantRouter } from "./src/server/assistant/assistantHandler.ts";
import { createStorageRouter } from "./src/server/storage/storageRouter.ts";
import { getStorageHealth } from "./src/lib/storage/index.ts";
import { encryptCompanyGeminiCredential, credentialLast4 } from "./src/server/ai/companyAiEncryption.ts";
import { disableCompanyAi, enableCompanyAi, loadCompanyAiConfig, markCompanyAiCredentialInvalid, recordCompanyAiTest, removeCompanyAiCredential, storeCompanyAiCredential } from "./src/server/ai/companyAiCredentials.ts";
import { companyAiProviderError, invalidateCompanyAiRuntime, isCompanyAiAuthenticationError, isCompanyAiFallbackEligible, logCompanyAiFailure, resolveCompanyAiRuntime, testCompanyAiConnection, withCompanyAiRuntime } from "./src/server/ai/companyAiRuntime.ts";
import { COMPANY_AI_FALLBACK_MODEL, COMPANY_AI_PRIMARY_MODEL, CompanyAiError } from "./src/server/ai/companyAiTypes.ts";
import { InvitationDeliveryError, createInvitationServerClient, deliverCompanyInvitationEmail, invitationRedirectUrl } from "./src/server/access/invitationDelivery.ts";
import {
  chooseBestExtractionCandidate,
  evaluateExtractionQuality,
  normalizeCurrency,
  retryFocusForQuality,
  shouldRunAutomaticRetry,
  type ExtractionQuality,
} from "./src/utils/extractionQuality.ts";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PRIMARY_MODEL = COMPANY_AI_PRIMARY_MODEL;
const ACCURACY_MODEL = COMPANY_AI_FALLBACK_MODEL;
type CompanyPermission =
  | "gmail.read"
  | "gmail.manage"
  | "invoices.extract"
  | "expenses.manage"
  | "company.members.manage"
  | "company.settings.manage"
  | "storage.read"
  | "documents.send";

interface CompanyRequestAuthorization {
  accessToken: string;
  companyId: string;
  googleAccessToken?: string;
  supabase: SupabaseClient;
  user: User;
}

class ApiAuthorizationError extends Error {
  status: number;
  code: "UNAUTHENTICATED" | "COMPANY_REQUIRED" | "FORBIDDEN" | "SERVER_AUTH_UNAVAILABLE";

  constructor(
    status: number,
    code: ApiAuthorizationError["code"],
    message: string,
  ) {
    super(message);
    this.name = "ApiAuthorizationError";
    this.code = code;
    this.status = status;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function firstHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function requestBearerToken(req: express.Request) {
  const authorization = firstHeaderValue(req.headers.authorization);
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) {
    throw new ApiAuthorizationError(401, "UNAUTHENTICATED", "A valid InvoiceApp session is required.");
  }
  return match[1];
}

function serverSupabaseConfiguration() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const publishableKey = (
    process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || ""
  ).trim();
  if (!supabaseUrl || !publishableKey) {
    throw new ApiAuthorizationError(503, "SERVER_AUTH_UNAVAILABLE", "Company authorization is not configured on the server.");
  }
  if (/service[_-]?role|secret/i.test(publishableKey)) {
    throw new ApiAuthorizationError(503, "SERVER_AUTH_UNAVAILABLE", "Company authorization is not configured on the server.");
  }
  return { supabaseUrl, publishableKey };
}

function requestSupabaseClient(accessToken: string) {
  const { supabaseUrl, publishableKey } = serverSupabaseConfiguration();
  return createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: "Bearer " + accessToken } },
  });
}

async function authorizeCompanyRequest(req: express.Request, permission: CompanyPermission): Promise<CompanyRequestAuthorization> {
  const accessToken = requestBearerToken(req);
  const client = requestSupabaseClient(accessToken);
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new ApiAuthorizationError(401, "UNAUTHENTICATED", "A valid InvoiceApp session is required.");
  }

  const companyId = firstHeaderValue(req.headers["x-company-id"]).trim();
  if (!companyId || !UUID_PATTERN.test(companyId)) {
    throw new ApiAuthorizationError(400, "COMPANY_REQUIRED", "A valid company context is required for this operation.");
  }

  const { data: deploymentCompanyId, error: deploymentError } = await client.rpc("get_deployment_company_id");
  if (deploymentError || typeof deploymentCompanyId !== "string" || !UUID_PATTERN.test(deploymentCompanyId)) {
    throw new ApiAuthorizationError(503, "SERVER_AUTH_UNAVAILABLE", "Deployment company authorization is temporarily unavailable.");
  }
  if (deploymentCompanyId !== companyId) {
    throw new ApiAuthorizationError(403, "FORBIDDEN", "This request cannot target another Engoryx deployment company.");
  }

  const { data: allowed, error: permissionError } = await client.rpc("has_company_permission", {
    p_company_id: companyId,
    p_permission_key: permission,
  });
  if (permissionError) {
    // Fail closed when the database authorization function is unavailable or
    // returns an unexpected error. Never fall back to a client role/email.
    throw new ApiAuthorizationError(503, "SERVER_AUTH_UNAVAILABLE", "Company authorization is temporarily unavailable.");
  }
  if (allowed !== true) {
    throw new ApiAuthorizationError(403, "FORBIDDEN", "You do not have permission for this company operation.");
  }

  const googleAccessToken = firstHeaderValue(req.headers["x-gmail-access-token"]).trim() || undefined;
  return { accessToken, companyId, googleAccessToken, supabase: client, user: data.user };
}

async function authenticateServerRequest(req: express.Request) {
  const accessToken = requestBearerToken(req);
  const client = requestSupabaseClient(accessToken);
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) throw new ApiAuthorizationError(401, "UNAUTHENTICATED", "A valid InvoiceApp session is required.");
  return { accessToken, supabase: client, user: data.user };
}

async function authorizePlatformCompanyRequest(req: express.Request, companyId: string): Promise<CompanyRequestAuthorization> {
  if (!UUID_PATTERN.test(companyId)) throw new ApiAuthorizationError(400, "COMPANY_REQUIRED", "A valid company context is required for this operation.");
  const auth = await authenticateServerRequest(req);
  const headerCompanyId = firstHeaderValue(req.headers["x-company-id"]).trim();
  if (headerCompanyId && (!UUID_PATTERN.test(headerCompanyId) || headerCompanyId !== companyId)) {
    throw new ApiAuthorizationError(403, "FORBIDDEN", "This request cannot target another Engoryx deployment company.");
  }
  const { data: deploymentCompanyId, error: deploymentError } = await auth.supabase.rpc("get_deployment_company_id");
  if (deploymentError || deploymentCompanyId !== companyId) {
    throw new ApiAuthorizationError(deploymentError ? 503 : 403, deploymentError ? "SERVER_AUTH_UNAVAILABLE" : "FORBIDDEN", deploymentError ? "Deployment company authorization is temporarily unavailable." : "Platform maintenance cannot target another Engoryx deployment company.");
  }
  const { data, error } = await auth.supabase.rpc("is_platform_admin");
  if (error) throw new ApiAuthorizationError(503, "SERVER_AUTH_UNAVAILABLE", "Company authorization is temporarily unavailable.");
  if (data !== true) throw new ApiAuthorizationError(403, "FORBIDDEN", "Platform administrator access is required.");
  return { ...auth, companyId };
}

function authorizationErrorStatus(error: unknown) {
  return error instanceof ApiAuthorizationError ? error.status : 500;
}

function authorizationErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiAuthorizationError ? error.message : fallback;
}

function apiErrorStatus(error: unknown) {
  if (error instanceof CompanyAiError) return error.status;
  if (error instanceof AiRequestBudgetError) return error.status;
  return authorizationErrorStatus(error);
}

function apiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof CompanyAiError) return error.message;
  if (error instanceof AiRequestBudgetError) return error.message;
  return authorizationErrorMessage(error, fallback);
}

function apiAiErrorDetails(error: unknown) {
  return error instanceof CompanyAiError ? { code: error.code, reference: error.correlationRef } : {};
}

function rpcRows(value: unknown): Record<string, any>[] {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, any> => Boolean(item && typeof item === "object"));
  return value && typeof value === "object" ? [value as Record<string, any>] : [];
}

function rpcRow(value: unknown) {
  return rpcRows(value)[0] || null;
}

function accessRpcStatus(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code || "") : "";
  if (code === "42501") return 403;
  if (code === "22023" || code === "22P02") return 400;
  if (code === "23505") return 409;
  return 503;
}

function accessRpcMessage(error: unknown, fallback: string) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code || "") : "";
  if (code === "42501") return "You do not have permission for this company access operation.";
  if (code === "23505") return "That email already has a pending invitation or company membership.";
  if (code === "22023" || code === "22P02") return "The company access request is invalid.";
  return fallback;
}

function invitationEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function invitationRole(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function normalizeInvitationOverrides(value: unknown) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;
  return value.map((item) => {
    if (!item || typeof item !== "object") return item;
    const row = item as Record<string, unknown>;
    return {
      permission_key: typeof row.permission_key === "string" ? row.permission_key.trim().toLowerCase() : typeof row.permissionKey === "string" ? row.permissionKey.trim().toLowerCase() : "",
      effect: typeof row.effect === "string" ? row.effect.trim().toUpperCase() : "",
    };
  });
}

class InvitationEmailRequestError extends Error {
  readonly invitation: Record<string, any>;

  constructor(invitation: Record<string, any>) {
    super("The invitation record was created, but the invitation email could not be sent.");
    this.name = "InvitationEmailRequestError";
    this.invitation = invitation;
  }
}

async function sendAndRecordInvitationEmail(
  admin: SupabaseClient,
  actorUserId: string,
  invitation: Record<string, any>,
) {
  const invitationId = typeof invitation.id === "string" ? invitation.id : "";
  const email = invitationEmail(invitation.normalized_email || invitation.email);
  if (!invitationId || !email) throw new InvitationEmailRequestError(invitation);
  try {
    await deliverCompanyInvitationEmail(
      { email, redirectTo: invitationRedirectUrl() },
      process.env,
      { admin },
    );
    const { data, error } = await admin.rpc("platform_mark_company_invitation_delivery", {
      p_actor_user_id: actorUserId,
      p_invitation_id: invitationId,
      p_delivery_status: "SENT",
    });
    if (error) throw new InvitationDeliveryError("PROVIDER_UNAVAILABLE");
    return rpcRow(data) || invitation;
  } catch {
    const { data } = await admin.rpc("platform_mark_company_invitation_delivery", {
      p_actor_user_id: actorUserId,
      p_invitation_id: invitationId,
      p_delivery_status: "FAILED",
      p_delivery_error: "Invitation email delivery failed.",
    });
    throw new InvitationEmailRequestError(rpcRow(data) || invitation);
  }
}

const EXTRACTION_TIMEOUT_MS = 60_000;
const GMAIL_HISTORY_MAX_PAGES = 20;
const GMAIL_HISTORY_MAX_MESSAGE_IDS = 500;
const GMAIL_HISTORY_MAX_LOADED_MESSAGES = 200;
const GMAIL_HISTORY_BUDGET_MS = 30_000;
const GMAIL_HISTORY_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const GMAIL_MAX_QUERY_CHARS = 2_000;
const GMAIL_IMPORT_MAX_TOTAL_BYTES = 30 * 1024 * 1024;
const GMAIL_MAX_API_RESPONSE_BYTES = 20 * 1024 * 1024;
const GMAIL_REQUEST_TIMEOUT_MS = 15_000;
const AI_TEXT_MAX_CHARS = MAX_EXTRACTION_TEXT_CHARS;

function selectModel(requestedModel?: unknown) {
  return requestedModel === ACCURACY_MODEL ? ACCURACY_MODEL : PRIMARY_MODEL;
}

function configuredOrigin(value: unknown) {
  try {
    const parsed = new URL(String(value || "").trim());
    return /^https?:$/.test(parsed.protocol) ? parsed.origin : "";
  } catch {
    return "";
  }
}

app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") {
    const connectSources = [
      "'self'",
      configuredOrigin(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL),
      "https://gmail.googleapis.com",
      "https://generativelanguage.googleapis.com",
      "wss:",
    ].filter(Boolean).join(" ");
    res.setHeader("Content-Security-Policy", `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; connect-src ${connectSources}`);
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

// Binary sources are validated before Storage persistence. Keep the global
// JSON ceiling large enough for the documented 10 MB invoice source after
// base64 expansion, while rejecting the previous unrestricted 50 MB envelope.
app.use(express.json({ limit: "16mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

const partySchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, nullable: true },
    companyName: { type: Type.STRING, nullable: true },
    registeredName: { type: Type.STRING, nullable: true, description: "Registered business name when visible" },
    tradeName: { type: Type.STRING, nullable: true, description: "Business or trade name when visible" },
    taxId: { type: Type.STRING, nullable: true },
    branchCode: { type: Type.STRING, nullable: true },
    taxRegistration: { type: Type.STRING, nullable: true, description: "VAT, NON_VAT, or UNKNOWN when explicitly stated" },
    address: { type: Type.STRING, nullable: true },
    city: { type: Type.STRING, nullable: true },
    cityMunicipality: { type: Type.STRING, nullable: true },
    state: { type: Type.STRING, nullable: true },
    province: { type: Type.STRING, nullable: true },
    barangay: { type: Type.STRING, nullable: true },
    region: { type: Type.STRING, nullable: true },
    postalCode: { type: Type.STRING, nullable: true },
    country: { type: Type.STRING, nullable: true },
    email: { type: Type.STRING, nullable: true },
    phone: { type: Type.STRING, nullable: true },
    website: { type: Type.STRING, nullable: true },
  },
  required: ["name", "companyName", "registeredName", "tradeName", "taxId", "branchCode", "taxRegistration", "address", "city", "cityMunicipality", "state", "province", "barangay", "region", "postalCode", "country", "email", "phone", "website"],
};

const invoiceSchema = {
  type: Type.OBJECT,
  properties: {
    documentType: { type: Type.STRING, nullable: true, description: "INVOICE, CREDIT_NOTE, RECEIPT, STATEMENT, PURCHASE_ORDER, or OTHER" },
    invoiceSubtype: { type: Type.STRING, nullable: true, description: "VAT_INVOICE, NON_VAT_INVOICE, SERVICE_INVOICE, SALES_INVOICE, COMMERCIAL_INVOICE, CASH_INVOICE, CHARGE_INVOICE, CREDIT_INVOICE, or UNKNOWN when visible" },
    invoiceNumber: { type: Type.STRING, nullable: true },
    invoiceDate: { type: Type.STRING, nullable: true, description: "YYYY-MM-DD when visible" },
    dueDate: { type: Type.STRING, nullable: true, description: "YYYY-MM-DD when visible" },
    purchaseOrderNumber: { type: Type.STRING, nullable: true },
    projectReference: { type: Type.STRING, nullable: true, description: "Explicit Project, Reference, Job, Contract, or Work Order text when printed" },
    currency: { type: Type.STRING, nullable: true, description: "ISO currency code; leave null when not explicit" },
    currencySymbol: { type: Type.STRING, nullable: true },
    paymentTerms: { type: Type.STRING, nullable: true },
    vendor: partySchema,
    customer: partySchema,
    shippingAddress: { ...partySchema, nullable: true },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          sku: { type: Type.STRING, nullable: true },
          description: { type: Type.STRING, nullable: true },
          quantity: { type: Type.NUMBER, nullable: true },
          unitOfMeasure: { type: Type.STRING, nullable: true, description: "Unit of measure such as bags, pcs, kg, m, sq.m., cu.m., liters, hours, days, sets, or lots" },
          unitPrice: { type: Type.NUMBER, nullable: true },
          discount: { type: Type.NUMBER, nullable: true },
          taxRate: { type: Type.NUMBER, nullable: true },
          taxAmount: { type: Type.NUMBER, nullable: true },
          taxTreatment: { type: Type.STRING, nullable: true },
          total: { type: Type.NUMBER, nullable: true },
        },
        required: ["sku", "description", "quantity", "unitOfMeasure", "unitPrice", "discount", "taxRate", "taxAmount", "taxTreatment", "total"],
      },
    },
    subtotal: { type: Type.NUMBER, nullable: true },
    totalDiscount: { type: Type.NUMBER, nullable: true },
    taxBreakdown: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, nullable: true },
          rate: { type: Type.NUMBER, nullable: true },
          amount: { type: Type.NUMBER, nullable: true },
        },
        required: ["name", "rate", "amount"],
      },
    },
    totalTax: { type: Type.NUMBER, nullable: true },
    shippingFee: { type: Type.NUMBER, nullable: true },
    otherFees: { type: Type.NUMBER, nullable: true },
    grandTotal: { type: Type.NUMBER, nullable: true },
    amountPaid: { type: Type.NUMBER, nullable: true },
    balanceDue: { type: Type.NUMBER, nullable: true },
    withholdingTaxRate: { type: Type.NUMBER, nullable: true, description: "Only when explicitly shown; do not infer a rate" },
    withholdingTaxAmount: { type: Type.NUMBER, nullable: true, description: "EWT/CWT/withholding amount when explicitly shown" },
    netAmountPayable: { type: Type.NUMBER, nullable: true, description: "Only when the source deterministically states or calculates it" },
    philippineTaxDetails: {
      type: Type.OBJECT,
      properties: {
        invoiceKind: { type: Type.STRING, nullable: true, description: "VAT_INVOICE, NON_VAT_INVOICE, or UNKNOWN" },
        sellerRegistration: { type: Type.STRING, nullable: true, description: "VAT, NON_VAT, or UNKNOWN" },
        vatableSales: { type: Type.NUMBER, nullable: true },
        vatAmount: { type: Type.NUMBER, nullable: true },
        zeroRatedSales: { type: Type.NUMBER, nullable: true },
        vatExemptSales: { type: Type.NUMBER, nullable: true },
        salesSubjectToPercentageTax: { type: Type.NUMBER, nullable: true },
        authorityToPrintNumber: { type: Type.STRING, nullable: true, description: "ATP when visible" },
        outboundCorrespondenceNumber: { type: Type.STRING, nullable: true, description: "OCN when visible" },
        permitToUseNumber: { type: Type.STRING, nullable: true },
        approvedSerialFrom: { type: Type.STRING, nullable: true },
        approvedSerialTo: { type: Type.STRING, nullable: true },
        birPermitDetailsRaw: { type: Type.STRING, nullable: true },
        withholdingTaxRate: { type: Type.NUMBER, nullable: true },
        withholdingTaxAmount: { type: Type.NUMBER, nullable: true },
        netAmountPayable: { type: Type.NUMBER, nullable: true },
        vatInclusive: { type: Type.BOOLEAN, nullable: true, description: "True only when the source clearly states prices/total are VAT-inclusive" },
      },
      required: ["invoiceKind", "sellerRegistration", "vatableSales", "vatAmount", "zeroRatedSales", "vatExemptSales", "salesSubjectToPercentageTax", "authorityToPrintNumber", "outboundCorrespondenceNumber", "permitToUseNumber", "approvedSerialFrom", "approvedSerialTo", "birPermitDetailsRaw", "withholdingTaxRate", "withholdingTaxAmount", "netAmountPayable", "vatInclusive"],
      nullable: true,
    },
    notes: { type: Type.STRING, nullable: true },
    termsAndConditions: { type: Type.STRING, nullable: true },
    category: { type: Type.STRING, nullable: true, description: "Short business/accounting category suggestion" },
    confidenceScore: { type: Type.NUMBER, nullable: true, description: "Overall extraction confidence from 0 to 100. Do not invent a high score." },
    fieldConfidence: {
      type: Type.OBJECT,
      properties: {
        invoiceNumber: { type: Type.NUMBER, nullable: true },
        invoiceDate: { type: Type.NUMBER, nullable: true },
        dueDate: { type: Type.NUMBER, nullable: true },
        vendorName: { type: Type.NUMBER, nullable: true },
        vendorTin: { type: Type.NUMBER, nullable: true },
        customerName: { type: Type.NUMBER, nullable: true },
        customerTin: { type: Type.NUMBER, nullable: true },
        currency: { type: Type.NUMBER, nullable: true },
        lineItems: { type: Type.NUMBER, nullable: true },
        subtotal: { type: Type.NUMBER, nullable: true },
        vatAmount: { type: Type.NUMBER, nullable: true },
        grandTotal: { type: Type.NUMBER, nullable: true },
      },
      required: ["invoiceNumber", "invoiceDate", "dueDate", "vendorName", "vendorTin", "customerName", "customerTin", "currency", "lineItems", "subtotal", "vatAmount", "grandTotal"],
      nullable: true,
    },
  },
  required: ["documentType", "invoiceSubtype", "invoiceNumber", "invoiceDate", "dueDate", "purchaseOrderNumber", "projectReference", "currency", "currencySymbol", "paymentTerms", "vendor", "customer", "shippingAddress", "items", "subtotal", "totalDiscount", "taxBreakdown", "totalTax", "shippingFee", "otherFees", "grandTotal", "amountPaid", "balanceDue", "withholdingTaxRate", "withholdingTaxAmount", "netAmountPayable", "philippineTaxDetails", "notes", "termsAndConditions", "category", "confidenceScore", "fieldConfidence"],
};

const emailClassificationSchema = {
  type: Type.OBJECT,
  properties: {
    isInvoiceLike: { type: Type.BOOLEAN },
    documentType: { type: Type.STRING },
    invoiceSubtype: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
    reason: { type: Type.STRING },
    suggestedVendor: { type: Type.STRING },
    invoiceNumberHint: { type: Type.STRING },
  },
  required: ["isInvoiceLike", "documentType", "confidence", "reason"],
};

const emailBatchClassificationSchema = {
  type: Type.OBJECT,
  properties: {
    classifications: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          messageId: { type: Type.STRING },
          suggestedDestination: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          reason: { type: Type.STRING },
        },
        required: ["messageId", "suggestedDestination", "confidence", "reason"],
      },
    },
  },
  required: ["classifications"],
};

function numeric(value: any, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sourceNumeric(value: unknown): number | undefined {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function deriveStatus(grandTotal: number, amountPaid: number, balanceDue: number, dueDate?: string) {
  if (grandTotal > 0 && balanceDue <= 0.01) return "PAID";
  if (amountPaid > 0 && balanceDue > 0.01) return "PARTIALLY_PAID";
  if (dueDate) {
    const due = new Date(`${dueDate}T23:59:59+08:00`);
    if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now() && balanceDue > 0.01) return "OVERDUE";
  }
  return "UNPAID";
}

function validateExtractedInvoice(data: any, items: any[]) {
  const issues: any[] = [];
  items.forEach((item, index) => {
    const quantity = sourceNumeric(item.quantity);
    const unitPrice = sourceNumeric(item.unitPrice);
    const discount = sourceNumeric(item.discount);
    const total = sourceNumeric(item.total);
    if (quantity === undefined) issues.push({ id: "missing-item-quantity-" + index, severity: "warning", field: "items." + index + ".quantity", message: "Line " + (index + 1) + " quantity is unresolved." });
    if (unitPrice === undefined) issues.push({ id: "missing-item-unit-price-" + index, severity: "warning", field: "items." + index + ".unitPrice", message: "Line " + (index + 1) + " unit price is unresolved." });
    if (total === undefined) issues.push({ id: "missing-item-total-" + index, severity: "warning", field: "items." + index + ".total", message: "Line " + (index + 1) + " amount is unresolved." });
    const expected = quantity !== undefined && unitPrice !== undefined && discount !== undefined
      ? roundMoney(quantity * unitPrice - discount)
      : undefined;
    if (expected !== undefined && total !== undefined && Math.abs(expected - total) > 0.05) {
      issues.push({
        id: "item-total-" + index,
        severity: "warning",
        field: "items." + index + ".total",
        message: "Line " + (index + 1) + " total does not match quantity × unit price − discount.",
        expected,
        actual: total,
      });
    }
  });
  const lineTotals = items.map((item) => sourceNumeric(item.total));
  const calculatedSubtotal = items.length && lineTotals.every((value) => value !== undefined)
    ? roundMoney(lineTotals.reduce((sum, value) => sum + (value || 0), 0))
    : undefined;
  const subtotal = sourceNumeric(data.subtotal);
  if (calculatedSubtotal !== undefined && subtotal !== undefined && Math.abs(calculatedSubtotal - subtotal) > 0.05) {
    issues.push({ id: "subtotal-mismatch", severity: "warning", field: "subtotal", message: "Subtotal does not match extracted line items.", expected: calculatedSubtotal, actual: subtotal });
  }
  const totalDiscount = sourceNumeric(data.totalDiscount);
  const totalTax = sourceNumeric(data.totalTax) ?? sourceNumeric(data.philippineTaxDetails?.vatAmount);
  const shippingFee = sourceNumeric(data.shippingFee);
  const otherFees = sourceNumeric(data.otherFees);
  const calculationSubtotal = subtotal ?? calculatedSubtotal;
  const calculatedGrandTotal = calculationSubtotal !== undefined && totalDiscount !== undefined && totalTax !== undefined && shippingFee !== undefined && otherFees !== undefined
    ? roundMoney(calculationSubtotal - totalDiscount + totalTax + shippingFee + otherFees)
    : undefined;
  const grandTotal = sourceNumeric(data.grandTotal);
  if (calculatedGrandTotal !== undefined && grandTotal !== undefined && Math.abs(calculatedGrandTotal - grandTotal) > 0.05) {
    issues.push({ id: "grand-total-mismatch", severity: "warning", field: "grandTotal", message: "Grand total does not reconcile with extracted components.", expected: calculatedGrandTotal, actual: grandTotal });
  }
  const amountPaid = sourceNumeric(data.amountPaid);
  const calculatedBalanceDue = grandTotal !== undefined && amountPaid !== undefined ? roundMoney(Math.max(0, grandTotal - amountPaid)) : undefined;
  const balanceDue = sourceNumeric(data.balanceDue);
  if (calculatedBalanceDue !== undefined && balanceDue !== undefined && Math.abs(calculatedBalanceDue - balanceDue) > 0.05) {
    issues.push({ id: "balance-mismatch", severity: "warning", field: "balanceDue", message: "Balance due does not match grand total minus amount paid.", expected: calculatedBalanceDue, actual: balanceDue });
  }
  if (!data.invoiceNumber) issues.push({ id: "missing-invoice-number", severity: "warning", field: "invoiceNumber", message: "Invoice number is missing." });
  if (!data.invoiceDate) issues.push({ id: "missing-invoice-date", severity: "warning", field: "invoiceDate", message: "Invoice date is missing." });
  if (!data.vendor?.name) issues.push({ id: "missing-vendor", severity: "warning", field: "vendor.name", message: "Vendor name is missing." });
  if (!data.currency) issues.push({ id: "missing-currency", severity: "warning", field: "currency", message: "Currency is missing." });
  const invoiceLike = String(data.documentType || "").toUpperCase().includes("INVOICE") || String(data.invoiceSubtype || "").toUpperCase().includes("INVOICE");
  if (items.length === 0 && invoiceLike && (numeric(data.subtotal) > 0 || numeric(data.grandTotal) > 0)) {
    issues.push({ id: "missing-line-items", severity: "warning", field: "items", message: "Invoice totals are present but no line items were extracted." });
  }
  if (items.length > 0 && numeric(data.grandTotal) > 0 && items.every((item) => numeric(item.quantity) === 0 && numeric(item.unitPrice) === 0 && numeric(item.total) === 0)) {
    issues.push({ id: "zero-value-line-items", severity: "warning", field: "items", message: "Extracted line items contain no usable quantities, prices, or amounts." });
  }

  const phTax = data.philippineTaxDetails || {};
  const phVatInvoice = Boolean(
    data.invoiceSubtype === "VAT_INVOICE" ||
    phTax.invoiceKind === "VAT_INVOICE" ||
    phTax.sellerRegistration === "VAT" ||
    data.vendor?.taxRegistration === "VAT"
  );
  if (phVatInvoice && sourceNumeric(phTax.vatableSales) !== undefined && (sourceNumeric(phTax.vatAmount) !== undefined || sourceNumeric(data.totalTax) !== undefined)) {
    issues.push({ id: "ph-vat-rate-not-evaluated", severity: "warning", field: "philippineTaxDetails.vatAmount", message: "VAT rate consistency was not evaluated because no authoritative VAT rate is configured." });
  }

  return {
    status: (issues.length ? "REVIEW" : "PASS") as "REVIEW" | "PASS",
    issues,
    calculatedSubtotal,
    calculatedGrandTotal,
    calculatedBalanceDue,
  };
}

type GeminiClientLike = { models: { generateContent: (parameters: any) => Promise<any> } };

async function generateContentWithTimeout(ai: GeminiClientLike, model: string, contents: any, config: any) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS);
  try {
    return await ai.models.generateContent({ model, contents, config: { ...config, abortSignal: controller.signal } });
  } catch (error) {
    if (controller.signal.aborted) {
      const timeoutError = new Error("AI request timed out.");
      Object.assign(timeoutError, { name: "CompanyAiTimeoutError", companyAiTimeout: true });
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateStructured(ai: GeminiClientLike, requestedModel: unknown, contents: any, systemInstruction: string, responseSchema: any) {
  const primary = selectModel(requestedModel);
  try {
    const response = await generateContentWithTimeout(ai, primary, contents, { systemInstruction, responseMimeType: "application/json", responseSchema });
    return { response, modelUsed: primary };
  } catch (error: any) {
    const normalized = companyAiProviderError(error, { assumeProviderError: true, model: primary, stage: "primary" }) || error;
    if (primary === ACCURACY_MODEL || !isCompanyAiFallbackEligible(normalized)) throw normalized;
    try {
      const response = await generateContentWithTimeout(ai, ACCURACY_MODEL, contents, { systemInstruction, responseMimeType: "application/json", responseSchema });
      return { response, modelUsed: ACCURACY_MODEL };
    } catch (fallbackError) {
      throw companyAiProviderError(fallbackError, { assumeProviderError: true, model: ACCURACY_MODEL, stage: "fallback" }) || fallbackError;
    }
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", product: "HydroQualiSense", timestamp: new Date().toISOString() });
});

// Legacy delivery compatibility only. The primary Company Access UI now uses
// authorize_company_member_email() directly with the authenticated browser
// session, so this SMTP/secret-dependent route is not required for access.
app.post("/api/company/invitations", async (req, res) => {
  let auth: CompanyRequestAuthorization;
  try {
    auth = await authorizeCompanyRequest(req, "company.members.manage");
  } catch (error) {
    return res.status(authorizationErrorStatus(error)).json({ success: false, error: authorizationErrorMessage(error, "Company invitation authorization failed.") });
  }

  const email = invitationEmail(req.body?.email);
  const roleKey = invitationRole(req.body?.roleKey);
  const overrides = normalizeInvitationOverrides(req.body?.permissionOverrides);
  const requestedExpiry = req.body?.expiresAt;
  if (!email || !roleKey || (overrides === null) || (requestedExpiry !== undefined && typeof requestedExpiry !== "string")) {
    return res.status(400).json({ success: false, error: "A valid invitation email, role, and optional expiry are required." });
  }
  if (requestedExpiry) {
    const parsedExpiry = new Date(requestedExpiry);
    if (Number.isNaN(parsedExpiry.getTime())) return res.status(400).json({ success: false, error: "The invitation expiry is invalid." });
  }

  let admin: SupabaseClient;
  try {
    admin = createInvitationServerClient();
  } catch (error) {
    const message = error instanceof InvitationDeliveryError && error.code === "NOT_CONFIGURED"
      ? "Invitation delivery is not configured on this deployment."
      : "Invitation delivery is temporarily unavailable.";
    return res.status(503).json({ success: false, code: "INVITATION_DELIVERY_UNAVAILABLE", error: message });
  }

  const createArgs: Record<string, unknown> = {
    p_actor_user_id: auth.user.id,
    p_company_id: auth.companyId,
    p_email: email,
    p_role_key: roleKey,
  };
  if (requestedExpiry) createArgs.p_expires_at = requestedExpiry;
  if (overrides !== undefined) createArgs.p_permission_overrides = overrides;

  let invitation: Record<string, any> | null;
  try {
    const { data, error } = await admin.rpc("platform_create_company_invitation", createArgs);
    if (error) return res.status(accessRpcStatus(error)).json({ success: false, error: accessRpcMessage(error, "The invitation could not be created.") });
    invitation = rpcRow(data);
    if (!invitation) return res.status(503).json({ success: false, error: "The invitation record was not returned." });
  } catch {
    return res.status(503).json({ success: false, error: "The invitation could not be created safely." });
  }

  try {
    const sentInvitation = await sendAndRecordInvitationEmail(admin, auth.user.id, invitation);
    return res.status(201).json({ success: true, status: "SENT", invitation: sentInvitation });
  } catch (error) {
    const failedInvitation = error instanceof InvitationEmailRequestError ? error.invitation : invitation;
    return res.status(502).json({
      success: false,
      code: "INVITATION_DELIVERY_FAILED",
      error: "The invitation record was created, but the invitation email could not be sent. Check the deployment email configuration and use Resend.",
      invitation: failedInvitation,
    });
  }
});

app.post("/api/company/invitations/:invitationId/resend", async (req, res) => {
  let auth: CompanyRequestAuthorization;
  try {
    auth = await authorizeCompanyRequest(req, "company.members.manage");
  } catch (error) {
    return res.status(authorizationErrorStatus(error)).json({ success: false, error: authorizationErrorMessage(error, "Company invitation authorization failed.") });
  }

  const invitationId = String(req.params.invitationId || "").trim();
  if (!UUID_PATTERN.test(invitationId)) return res.status(400).json({ success: false, error: "A valid invitation is required." });

  let admin: SupabaseClient;
  try {
    admin = createInvitationServerClient();
  } catch {
    return res.status(503).json({ success: false, code: "INVITATION_DELIVERY_UNAVAILABLE", error: "Invitation delivery is not configured on this deployment." });
  }

  const { data: listed, error: listError } = await auth.supabase.rpc("platform_list_company_invitations", { p_company_id: auth.companyId });
  if (listError) return res.status(accessRpcStatus(listError)).json({ success: false, error: accessRpcMessage(listError, "The invitation could not be loaded.") });
  const existing = rpcRows(listed).find((row) => row.id === invitationId);
  if (!existing) return res.status(404).json({ success: false, error: "The invitation was not found in this deployment company." });
  if (String(existing.status || "").toUpperCase() === "ACCEPTED") return res.status(409).json({ success: false, error: "Accepted invitations cannot be resent." });

  let invitation: Record<string, any> | null = null;
  const expiresAt = typeof existing.expires_at === "string" ? new Date(existing.expires_at).getTime() : 0;
  if (String(existing.status || "").toUpperCase() === "PENDING" && expiresAt > Date.now()) {
    const { data, error } = await admin.rpc("platform_reset_company_invitation_delivery", {
      p_actor_user_id: auth.user.id,
      p_invitation_id: invitationId,
    });
    if (error) return res.status(accessRpcStatus(error)).json({ success: false, error: accessRpcMessage(error, "The invitation could not be prepared for resend.") });
    invitation = rpcRow(data);
  } else {
    const email = invitationEmail(existing.normalized_email);
    const roleKey = invitationRole(existing.role_key);
    if (!email || !roleKey) return res.status(400).json({ success: false, error: "The existing invitation is missing valid delivery details." });
    const { data, error } = await admin.rpc("platform_create_company_invitation", {
      p_actor_user_id: auth.user.id,
      p_company_id: auth.companyId,
      p_email: email,
      p_role_key: roleKey,
    });
    if (error) return res.status(accessRpcStatus(error)).json({ success: false, error: accessRpcMessage(error, "A replacement invitation could not be created.") });
    invitation = rpcRow(data);
  }
  if (!invitation) return res.status(503).json({ success: false, error: "The invitation record was not returned." });

  try {
    const sentInvitation = await sendAndRecordInvitationEmail(admin, auth.user.id, invitation);
    return res.json({ success: true, status: "SENT", invitation: sentInvitation });
  } catch (error) {
    const failedInvitation = error instanceof InvitationEmailRequestError ? error.invitation : invitation;
    return res.status(502).json({
      success: false,
      code: "INVITATION_DELIVERY_FAILED",
      error: "The invitation record exists, but the invitation email could not be sent. Check the deployment email configuration and retry.",
      invitation: failedInvitation,
    });
  }
});

function platformCompanyAiPath(req: express.Request) {
  return String(req.params.companyId || "").trim();
}

app.get("/api/platform/companies/:companyId/ai-config", async (req, res) => {
  try {
    const auth = await authorizePlatformCompanyRequest(req, platformCompanyAiPath(req));
    const data = await loadCompanyAiConfig(auth.supabase, auth.companyId);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(apiErrorStatus(error)).json({ success: false, error: apiErrorMessage(error, "AI configuration could not be loaded safely."), ...apiAiErrorDetails(error) });
  }
});

app.put("/api/platform/companies/:companyId/ai-config/gemini", async (req, res) => {
  try {
    const auth = await authorizePlatformCompanyRequest(req, platformCompanyAiPath(req));
    const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
    if (!apiKey || apiKey.length > 4096) return res.status(400).json({ success: false, error: "A valid Gemini API key is required." });
    const encrypted = encryptCompanyGeminiCredential(apiKey, auth.companyId);
    const data = await storeCompanyAiCredential(auth.supabase, auth.companyId, encrypted, credentialLast4(apiKey));
    invalidateCompanyAiRuntime(auth.companyId);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(apiErrorStatus(error)).json({ success: false, error: apiErrorMessage(error, "The Gemini credential could not be saved safely."), ...apiAiErrorDetails(error) });
  }
});

app.post("/api/platform/companies/:companyId/ai-config/gemini/test", async (req, res) => {
  try {
    const auth = await authorizePlatformCompanyRequest(req, platformCompanyAiPath(req));
    const result = await testCompanyAiConnection({ supabase: auth.supabase, companyId: auth.companyId });
    // Provider outages, quota limits, and model availability are safe test
    // results, not transport failures. The metadata carries the precise safe
    // status without exposing provider response details.
    return res.json({ success: true, data: { ...result.metadata, testStatus: result.status, ...(result.errorCode ? { testErrorCode: result.errorCode } : {}), ...(result.reference ? { reference: result.reference } : {}) } });
  } catch (error) {
    const status = apiErrorStatus(error);
    return res.status(status).json({ success: false, error: apiErrorMessage(error, "The Gemini connection test failed safely."), ...apiAiErrorDetails(error) });
  }
});

app.post("/api/platform/companies/:companyId/ai-config/gemini/disable", async (req, res) => {
  try {
    const auth = await authorizePlatformCompanyRequest(req, platformCompanyAiPath(req));
    const data = await disableCompanyAi(auth.supabase, auth.companyId);
    invalidateCompanyAiRuntime(auth.companyId);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(apiErrorStatus(error)).json({ success: false, error: apiErrorMessage(error, "AI could not be disabled safely."), ...apiAiErrorDetails(error) });
  }
});

app.post("/api/platform/companies/:companyId/ai-config/gemini/enable", async (req, res) => {
  try {
    const auth = await authorizePlatformCompanyRequest(req, platformCompanyAiPath(req));
    const data = await enableCompanyAi(auth.supabase, auth.companyId);
    invalidateCompanyAiRuntime(auth.companyId);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(apiErrorStatus(error)).json({ success: false, error: apiErrorMessage(error, "AI could not be enabled safely."), ...apiAiErrorDetails(error) });
  }
});

app.delete("/api/platform/companies/:companyId/ai-config/gemini", async (req, res) => {
  try {
    const auth = await authorizePlatformCompanyRequest(req, platformCompanyAiPath(req));
    const data = await removeCompanyAiCredential(auth.supabase, auth.companyId);
    invalidateCompanyAiRuntime(auth.companyId);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(apiErrorStatus(error)).json({ success: false, error: apiErrorMessage(error, "The Gemini credential could not be removed safely."), ...apiAiErrorDetails(error) });
  }
});

const assistantRateLimit = new Map<string, { windowStartedAt: number; count: number }>();
app.use("/api/assistant", (req, res, next) => {
  if (req.method !== "POST") return next();
  const now = Date.now();
  const address = String(req.ip || req.socket.remoteAddress || "unknown");
  if (assistantRateLimit.size > 10_000) {
    for (const [key, value] of assistantRateLimit) if (now - value.windowStartedAt >= 60_000) assistantRateLimit.delete(key);
  }
  const current = assistantRateLimit.get(address);
  const windowStartedAt = current && now - current.windowStartedAt < 60_000 ? current.windowStartedAt : now;
  const count = current && windowStartedAt === current.windowStartedAt ? current.count + 1 : 1;
  assistantRateLimit.set(address, { windowStartedAt, count });
  if (count > 30) return res.status(429).json({ success: false, error: "Invoice Operations AI is temporarily rate limited. Try again shortly.", code: "RATE_LIMITED" });
  return next();
});
app.use("/api/assistant", createAssistantRouter());
app.use("/api/documents", createStorageRouter());
app.get("/api/storage/health", async (req, res) => {
  try {
    const auth = await authorizeCompanyRequest(req, "storage.read");
    return res.json({ success: true, data: { companyId: auth.companyId, ...getStorageHealth(process.env) } });
  } catch (error) {
    return res.status(authorizationErrorStatus(error)).json({ success: false, error: authorizationErrorMessage(error, "Storage health is unavailable.") });
  }
});

app.post("/api/classify-email", async (req, res) => {
  let budgetAuth: CompanyRequestAuthorization | null = null;
  let aiBudgetClaimed = false;
  try {
    const auth = await authorizeCompanyRequest(req, "invoices.extract");
    budgetAuth = auth;
    const { sender = "", subject = "", body = "", attachmentNames = [], model = PRIMARY_MODEL } = req.body || {};
    if (typeof sender !== "string" || typeof subject !== "string" || typeof body !== "string" || !Array.isArray(attachmentNames)) return res.status(400).json({ success: false, error: "Email content has an invalid shape." });
    if (!subject && !body && !attachmentNames.length) return res.status(400).json({ success: false, error: "Email content is required." });
    if (sender.length > 2_000 || subject.length > 2_000 || body.length > AI_TEXT_MAX_CHARS || attachmentNames.length > MAX_GMAIL_ATTACHMENT_COUNT || attachmentNames.some((item: unknown) => String(item || "").length > 300)) {
      return res.status(413).json({ success: false, error: "Email classification input exceeds the safe size limit." });
    }
    await claimAiRequest(auth.supabase, auth.companyId, "EMAIL_CLASSIFICATION", { maxRequests: 60, maxConcurrency: 4 });
    aiBudgetClaimed = true;
    const prompt = `Classify whether this email is related to an invoice or adjacent financial document. Use the email subject, sender, body, and attachment names. Do not assume an attachment is an invoice only because it is a PDF. Recognize Philippine terms including invoice, sales invoice, service invoice, VAT invoice, billing, statement of account, SOA, BIR, VAT, TIN, and amount due. Treat "Official Receipt", "SOA", and "Billing Statement" as candidate finance documents, not automatically as a principal invoice. For current Philippine workflow, an Official Receipt may be RECEIPT or SUPPLEMENTARY_DOCUMENT; preserve uncertainty and route it to human review.\n\nSender: ${sender}\nSubject: ${subject}\nAttachments: ${attachmentNames.join(", ") || "None"}\n\nBody:\n${body}`;
    const { response, modelUsed } = await withCompanyAiRuntime(
      { supabase: auth.supabase, companyId: auth.companyId },
      (runtime) => generateStructured(
        runtime.geminiClient,
        model,
        { parts: [{ text: prompt }] },
        "You classify finance emails for an invoice operations workspace. Return conservative structured JSON. Never invent a legal conclusion from a title alone. Keep documentType broad and use invoiceSubtype only when the source supports it. A receipt is not automatically an invoice.",
        emailClassificationSchema,
      ),
    );
    const data = JSON.parse(response.text || "{}");
    res.json({ success: true, data, modelUsed });
  } catch (error: any) {
    const status = apiErrorStatus(error);
    if (!(error instanceof ApiAuthorizationError) && !(error instanceof CompanyAiError)) console.error("Error in /api/classify-email: request failed.");
    res.status(status).json({ success: false, error: apiErrorMessage(error, "Email classification failed."), ...apiAiErrorDetails(error) });
  } finally {
    if (aiBudgetClaimed && budgetAuth) await releaseAiRequest(budgetAuth.supabase, budgetAuth.companyId, "EMAIL_CLASSIFICATION");
  }
});

app.post("/api/classify-email-batch", async (req, res) => {
  let budgetAuth: CompanyRequestAuthorization | null = null;
  let aiBudgetClaimed = false;
  try {
    const auth = await authorizeCompanyRequest(req, "gmail.read");
    budgetAuth = auth;
    const { items = [], model = PRIMARY_MODEL } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.json({ success: true, data: { classifications: [] } });
    }
    if (items.length > 10) return res.status(413).json({ success: false, error: "Email batch classification is limited to 10 messages per request." });

    const boundedItems = items.slice(0, 10).map((item: any) => ({
      messageId: String(item.messageId || "").trim(),
      sender: String(item.sender || "").trim(),
      subject: String(item.subject || "").trim(),
      snippet: String(item.snippet || "").trim().slice(0, 300),
      attachmentNames: Array.isArray(item.attachmentNames) ? item.attachmentNames.map((n: any) => String(n || "").trim()).slice(0, 5) : [],
    })).filter((item) => Boolean(item.messageId));

    if (boundedItems.length === 0) {
      return res.json({ success: true, data: { classifications: [] } });
    }
    if (boundedItems.some((item) => item.sender.length > 2_000 || item.subject.length > 2_000 || item.snippet.length > 2_000 || item.attachmentNames.some((name) => name.length > 300))) {
      return res.status(413).json({ success: false, error: "Email batch classification input exceeds the safe size limit." });
    }
    await claimAiRequest(auth.supabase, auth.companyId, "EMAIL_BATCH_CLASSIFICATION", { maxRequests: 30, maxConcurrency: 2 });
    aiBudgetClaimed = true;

    const prompt = `You are a financial email classifier for an operations workspace. Classify each email into one of these destinations:
- "INVOICE": for vendor bills, sales invoices, service invoices, VAT invoices, billing notices demanding payment.
- "BANK_STATEMENT": for official bank transaction records, monthly account statements, e-statements (usually with attached CSV or XLSX).
- "EXPENSE": for official receipts, cash receipts, payment proofs, reimbursements, petty cash slips, ride/food/fuel receipts.
- "UNSUPPORTED": for general correspondence, marketing, non-finance messages, or ambiguous cases.

CRITICAL INSTRUCTIONS:
1. Every classification object in the output MUST include its exact input messageId.
2. suggestedDestination must be exactly one of: "INVOICE", "BANK_STATEMENT", "EXPENSE", "UNSUPPORTED".
3. Confidence should be an integer between 0 and 100.
4. Reason should be a concise 1-sentence explanation.

Here are the candidate emails to classify:
${JSON.stringify(boundedItems, null, 2)}`;

    const { response, modelUsed } = await withCompanyAiRuntime(
      { supabase: auth.supabase, companyId: auth.companyId },
      (runtime) => generateStructured(
        runtime.geminiClient,
        model,
        { parts: [{ text: prompt }] },
        "Classify ambiguous finance email candidates conservatively. Always preserve exact messageIds and return structured JSON.",
        emailBatchClassificationSchema,
      ),
    );

    const parsed = JSON.parse(response.text || "{}");
    const rawClassifications: any[] = Array.isArray(parsed.classifications) ? parsed.classifications : [];

    const validMessageIds = new Set(boundedItems.map((item) => item.messageId));
    const seenMessageIds = new Set<string>();
    const classifications: Array<{ messageId: string; suggestedDestination: string; confidence: number; reason: string }> = [];

    for (const item of rawClassifications) {
      const msgId = String(item.messageId || "").trim();
      if (!msgId || !validMessageIds.has(msgId) || seenMessageIds.has(msgId)) continue;
      seenMessageIds.add(msgId);

      const dest = String(item.suggestedDestination || "UNSUPPORTED").toUpperCase();
      const validDest = ["INVOICE", "BANK_STATEMENT", "EXPENSE", "UNSUPPORTED"].includes(dest) ? dest : "UNSUPPORTED";
      const confidence = Math.max(0, Math.min(100, Math.round(Number(item.confidence) || 50)));
      const reason = String(item.reason || "").trim() || (validDest === "UNSUPPORTED" ? "Ambiguous email metadata." : `Classified as ${validDest}.`);

      classifications.push({
        messageId: msgId,
        suggestedDestination: validDest,
        confidence,
        reason,
      });
    }

    res.json({ success: true, data: { classifications }, modelUsed });
  } catch (error: any) {
    const status = apiErrorStatus(error);
    if (!(error instanceof ApiAuthorizationError) && !(error instanceof CompanyAiError)) console.error("Error in /api/classify-email-batch: request failed.");
    res.status(status).json({ success: false, error: apiErrorMessage(error, "Email batch classification failed."), ...apiAiErrorDetails(error) });
  } finally {
    if (aiBudgetClaimed && budgetAuth) await releaseAiRequest(budgetAuth.supabase, budgetAuth.companyId, "EMAIL_BATCH_CLASSIFICATION");
  }
});

function compactParty(party: any) {
  return {
    name: party?.name || party?.registeredName || "",
    companyName: party?.companyName || party?.registeredName || party?.name || "",
    registeredName: party?.registeredName || "",
    tradeName: party?.tradeName || "",
    taxId: party?.taxId || "",
    branchCode: party?.branchCode || "",
    taxRegistration: party?.taxRegistration || "UNKNOWN",
    address: party?.address || "",
    city: party?.city || "",
    cityMunicipality: party?.cityMunicipality || "",
    state: party?.state || "",
    province: party?.province || "",
    barangay: party?.barangay || "",
    region: party?.region || "",
    postalCode: party?.postalCode || "",
    country: party?.country || "",
    email: party?.email || "",
    phone: party?.phone || "",
    website: party?.website || "",
  };
}

function explicitCurrencyFromText(sourceText: string) {
  if (/₱|\bPHP\b|PHILIPPINE\s+PESO/i.test(sourceText)) return "PHP";
  if (/\bUSD\b|US\$/i.test(sourceText)) return "USD";
  if (/\bEUR\b|€/i.test(sourceText)) return "EUR";
  if (/\bSGD\b|S\$/i.test(sourceText)) return "SGD";
  if (/\bJPY\b|¥/i.test(sourceText)) return "JPY";
  return "";
}

function currencySymbolFor(currency: string) {
  return ({ PHP: "₱", USD: "$", EUR: "€", SGD: "S$", JPY: "¥", GBP: "£" } as Record<string, string>)[currency] || "";
}

function normalizeTaxDetails(details: any) {
  if (!details || typeof details !== "object") return undefined;
  const output = { ...details };
  for (const key of Object.keys(output)) if (output[key] === null || output[key] === undefined || output[key] === "") delete output[key];
  return Object.keys(output).length ? output : undefined;
}

function buildInvoiceCandidate(extracted: any, responseText: string, modelUsed: string, fileName: string | undefined, sourceType: string, emailContext: any, sourceText: string): InvoiceData {
  const rawItems = Array.isArray(extracted?.items) ? extracted.items : [];
  const financialFieldStatus: Record<string, "KNOWN" | "CALCULATED" | "UNKNOWN"> = {};
  const items = rawItems.map((item: any, index: number) => {
    const quantity = sourceNumeric(item?.quantity);
    const unitPrice = sourceNumeric(item?.unitPrice);
    const discount = sourceNumeric(item?.discount);
    const sourceTotal = sourceNumeric(item?.total);
    const deterministicTotal = quantity !== undefined && unitPrice !== undefined && discount !== undefined
      ? roundMoney(quantity * unitPrice - discount)
      : undefined;
    const total = sourceTotal ?? deterministicTotal;
    financialFieldStatus["items." + index + ".quantity"] = quantity === undefined ? "UNKNOWN" : "KNOWN";
    financialFieldStatus["items." + index + ".unitPrice"] = unitPrice === undefined ? "UNKNOWN" : "KNOWN";
    financialFieldStatus["items." + index + ".discount"] = discount === undefined ? "UNKNOWN" : "KNOWN";
    financialFieldStatus["items." + index + ".total"] = sourceTotal !== undefined ? "KNOWN" : deterministicTotal !== undefined ? "CALCULATED" : "UNKNOWN";
    return {
      id: randomUUID(),
      itemNumber: index + 1,
      sku: item?.sku || "",
      description: item?.description || "",
      quantity: quantity ?? null,
      unitOfMeasure: item?.unitOfMeasure || item?.uom || item?.unit || "",
      unitPrice: unitPrice ?? null,
      discount: discount ?? null,
      taxRate: sourceNumeric(item?.taxRate) ?? null,
      taxAmount: sourceNumeric(item?.taxAmount) ?? null,
      taxTreatment: item?.taxTreatment || "UNKNOWN",
      total: total ?? null,
    };
  });
  const validation = validateExtractedInvoice(extracted || {}, items);
  const phTax = normalizeTaxDetails(extracted?.philippineTaxDetails);
  const sourceSubtotal = sourceNumeric(extracted?.subtotal);
  const subtotal = sourceSubtotal ?? validation.calculatedSubtotal ?? null;
  const sourceTotalTax = sourceNumeric(extracted?.totalTax);
  const sourceVatAmount = sourceNumeric(phTax?.vatAmount);
  const totalTax = sourceTotalTax ?? sourceVatAmount ?? null;
  const sourceGrandTotal = sourceNumeric(extracted?.grandTotal);
  const grandTotal = sourceGrandTotal ?? validation.calculatedGrandTotal ?? null;
  const sourceAmountPaid = sourceNumeric(extracted?.amountPaid);
  const amountPaid = sourceAmountPaid ?? null;
  const sourceBalanceDue = sourceNumeric(extracted?.balanceDue);
  const calculatedBalanceDue = grandTotal !== null && amountPaid !== null ? Math.max(0, grandTotal - amountPaid) : null;
  const balanceDue = sourceBalanceDue ?? calculatedBalanceDue;
  financialFieldStatus.subtotal = sourceSubtotal !== undefined ? "KNOWN" : validation.calculatedSubtotal !== undefined ? "CALCULATED" : "UNKNOWN";
  financialFieldStatus.totalTax = sourceTotalTax !== undefined || sourceVatAmount !== undefined ? "KNOWN" : "UNKNOWN";
  financialFieldStatus.grandTotal = sourceGrandTotal !== undefined ? "KNOWN" : validation.calculatedGrandTotal !== undefined ? "CALCULATED" : "UNKNOWN";
  financialFieldStatus.amountPaid = sourceAmountPaid !== undefined ? "KNOWN" : "UNKNOWN";
  financialFieldStatus.balanceDue = sourceBalanceDue !== undefined ? "KNOWN" : calculatedBalanceDue !== null ? "CALCULATED" : "UNKNOWN";
  financialFieldStatus.totalDiscount = sourceNumeric(extracted?.totalDiscount) === undefined ? "UNKNOWN" : "KNOWN";
  financialFieldStatus.shippingFee = sourceNumeric(extracted?.shippingFee) === undefined ? "UNKNOWN" : "KNOWN";
  financialFieldStatus.otherFees = sourceNumeric(extracted?.otherFees) === undefined ? "UNKNOWN" : "KNOWN";
  const sourceCurrency = explicitCurrencyFromText(sourceText);
  const currency = normalizeCurrency(extracted?.currency, extracted?.currencySymbol) || sourceCurrency;
  const currencySymbol = currencySymbolFor(currency) || extracted?.currencySymbol || "";
  const confidenceScore = extracted?.confidenceScore === undefined || extracted?.confidenceScore === null ? undefined : numeric(extracted.confidenceScore);
  const sourceMetadata = emailContext
    ? {
        sender: emailContext.sender || "",
        subject: emailContext.subject || "",
        receivedAt: emailContext.receivedAt || "",
        attachmentName: emailContext.attachmentName || fileName || "",
        emailReference: emailContext.emailReference || "",
        gmailMessageId: emailContext.gmailMessageId || "",
        gmailThreadId: emailContext.gmailThreadId || "",
        gmailAttachmentId: emailContext.gmailAttachmentId || "",
        emailRecordId: emailContext.emailRecordId || "",
        sourceDocumentId: emailContext.sourceDocumentId || "",
        sourceStoragePath: emailContext.sourceStoragePath || "",
        rawEmailStoragePath: emailContext.rawEmailStoragePath || "",
      }
    : { attachmentName: fileName || "" };
  const invoiceData: InvoiceData = {
    id: randomUUID(),
    fileName: fileName || emailContext?.attachmentName || "invoice",
    documentType: extracted?.documentType || "OTHER",
    invoiceSubtype: extracted?.invoiceSubtype || "UNKNOWN",
    sourceType: sourceType as InvoiceData["sourceType"],
    sourceMetadata,
    processingStatus: "EXTRACTED",
    reviewStatus: "NEEDS_REVIEW",
    duplicateStatus: "UNIQUE",
    invoiceNumber: extracted?.invoiceNumber || "",
    invoiceDate: extracted?.invoiceDate || "",
    dueDate: extracted?.dueDate || "",
    purchaseOrderNumber: extracted?.purchaseOrderNumber || "",
    projectReference: extracted?.projectReference || extracted?.reference || "",
    currency,
    currencySymbol,
    paymentTerms: extracted?.paymentTerms || "",
    status: deriveStatus(numeric(grandTotal), numeric(amountPaid), numeric(balanceDue), extracted?.dueDate),
    vendor: compactParty(extracted?.vendor),
    customer: compactParty(extracted?.customer),
    shippingAddress: extracted?.shippingAddress ? compactParty(extracted.shippingAddress) : undefined,
    items,
    subtotal,
    totalDiscount: sourceNumeric(extracted?.totalDiscount) ?? null,
    taxBreakdown: Array.isArray(extracted?.taxBreakdown) ? extracted.taxBreakdown : [],
    totalTax,
    shippingFee: sourceNumeric(extracted?.shippingFee) ?? null,
    otherFees: sourceNumeric(extracted?.otherFees) ?? null,
    grandTotal,
    amountPaid,
    balanceDue,
    withholdingTaxRate: sourceNumeric(extracted?.withholdingTaxRate) ?? null,
    withholdingTaxAmount: sourceNumeric(extracted?.withholdingTaxAmount) ?? null,
    netAmountPayable: sourceNumeric(extracted?.netAmountPayable) ?? null,
    philippineTaxDetails: phTax,
    notes: extracted?.notes || "",
    termsAndConditions: extracted?.termsAndConditions || "",
    category: extracted?.category || "",
    extractedAt: new Date().toISOString(),
    modelUsed,
    confidenceScore,
    fieldConfidence: extracted?.fieldConfidence || {},
    financialFieldStatus,
    validation,
    rawJson: responseText,
  };
  invoiceData.extractionQuality = evaluateExtractionQuality(invoiceData, sourceText);
  return invoiceData;
}

function parseStructuredResponse(response: any) {
  const responseText = response?.text || "";
  const extracted = JSON.parse(responseText || "{}");
  if (!extracted || typeof extracted !== "object" || Array.isArray(extracted)) throw new Error("Structured response was not an object.");
  return { extracted, responseText };
}

function enhancedRetryInstruction(quality: ExtractionQuality) {
  const focus = retryFocusForQuality(quality);
  return `SECOND EXTRACTION PASS. Re-read the original source document that is attached or included above. Do not use a previous JSON result as evidence and do not invent corrections. Focus especially on: ${focus.join(", ")}.
- For line-items, inspect the table row by row. Recognize headers such as Item, SKU, Code, Description, Qty, Quantity, Unit, UOM, Unit Price, Price, Amount, and Total. Preserve every visible row independently; do not summarize or merge rows. Preserve SKU, description, quantity, unit of measure, unit price, and amount.
- For currency, inspect explicit labels and symbols such as Currency: PHP, PHP, Php, Philippine Peso, ₱, USD, US$, $, EUR, SGD, JPY, and preserve the source currency without inferring it from an address.
- For parties, inspect FROM, BILL TO, SELLER, BUYER, CUSTOMER, and registered/trade-name sections.
- For totals, inspect the financial summary near the bottom, including Subtotal, VATable Sales, VAT Amount, Zero-Rated Sales, VAT-Exempt Sales, Total Amount Due, Amount Paid, and Balance Due.
Return the complete invoice schema again. Unknown source values must remain null.`;
}

app.post("/api/extract-invoice", async (req, res) => {
  const startedAt = Date.now();
  let extractionCompanyId: string | undefined;
  let budgetAuth: CompanyRequestAuthorization | null = null;
  let aiBudgetClaimed = false;
  try {
    const auth = await authorizeCompanyRequest(req, "invoices.extract");
    budgetAuth = auth;
    extractionCompanyId = auth.companyId;
    let {
      fileData,
      mimeType,
      textData,
      fileName,
      model = PRIMARY_MODEL,
      sourceType = textData ? "PASTED_TEXT" : "UPLOAD",
      emailContext,
    } = req.body || {};

    if ((!fileData || !mimeType) && !textData && !emailContext?.body) {
      return res.status(400).json({ success: false, error: "No invoice file, text, or email content provided." });
    }
    if (fileData !== undefined && (typeof fileData !== "string" || typeof mimeType !== "string" || !mimeType.trim())) {
      return res.status(400).json({ success: false, error: "Invoice file data and MIME type are invalid." });
    }
    if (textData !== undefined && typeof textData !== "string") return res.status(400).json({ success: false, error: "Invoice text data is invalid." });
    if (typeof textData === "string" && textData.length > AI_TEXT_MAX_CHARS) return res.status(413).json({ success: false, error: "Invoice text exceeds the safe extraction limit." });
    if (emailContext !== undefined && (!emailContext || typeof emailContext !== "object" || Array.isArray(emailContext))) return res.status(400).json({ success: false, error: "Invoice email context is invalid." });
    if (emailContext?.body !== undefined && (typeof emailContext.body !== "string" || emailContext.body.length > AI_TEXT_MAX_CHARS)) return res.status(413).json({ success: false, error: "Invoice email content exceeds the safe extraction limit." });
    if (typeof fileData === "string" && fileData) {
      try {
        const bytes = decodeBase64Payload(fileData, 10 * 1024 * 1024, "Invoice source");
        validateInvoiceDocumentBytes(bytes, mimeType, fileName);
        fileData = Buffer.from(bytes).toString("base64");
      } catch (error: any) {
        return res.status(400).json({ success: false, error: error?.message || "Invoice source file is invalid." });
      }
    }
    await claimAiRequest(auth.supabase, auth.companyId, "INVOICE_EXTRACTION", { maxRequests: 20, maxConcurrency: 2 });
    aiBudgetClaimed = true;

    let aiRuntime = await resolveCompanyAiRuntime({ supabase: auth.supabase, companyId: auth.companyId });
    let authenticationRetryUsed = false;
    const parts: any[] = [];
    if (fileData && mimeType) parts.push({ inlineData: { mimeType, data: fileData } });
    const emailBlock = emailContext
      ? `\nEMAIL CONTEXT\nSender: ${emailContext.sender || "Unknown"}\nSubject: ${emailContext.subject || ""}\nReceived: ${emailContext.receivedAt || ""}\nAttachment: ${emailContext.attachmentName || fileName || ""}\nEmail body:\n${emailContext.body || ""}\n`
      : "";
    const sourceText = [textData, emailContext?.body].filter(Boolean).join("\n");
    parts.push({
      text: `${emailBlock}\n${textData ? `DOCUMENT TEXT:\n${textData}` : "Analyze the attached document."}\n\nExtract the financial document into the requested structured schema.`,
    });

    const systemPrompt = `You are a high-precision, internationally capable financial document extraction system for invoices, tax invoices, receipts, credit notes, statements, and purchase orders. Give special attention to Philippine invoice terminology while preserving the source's actual document type.
Rules:
1. Extract values that are explicitly visible in the document or email context.
2. Never guess, estimate, or invent missing financial values, dates, invoice numbers, tax IDs, contact details, parties, rows, quantities, or currency.
3. You may calculate a value only when it is mathematically deterministic from clearly extracted values. Otherwise return null.
4. Prefer document values over email-body hints when they conflict. Email context may fill a field only when the email clearly states it.
5. Numbers must be raw numeric values without currency symbols.
6. Use ISO currency codes where possible and YYYY-MM-DD dates where unambiguous.
7. Inspect every visible invoice table row independently. Recognize Item, SKU, Code, Description, Qty, Quantity, Unit, UOM, Unit Price, Price, Amount, and Total headers. Do not skip compact rows, summarize the table, or merge multiple visible rows. Preserve SKU/code, description, quantity, unit of measure, unit price, and amount. If three rows are visible, return three items. Do not infer rows that are not visible.
8. confidenceScore and fieldConfidence must reflect actual uncertainty; do not default to a high score.
9. category is only a short suggested classification (e.g. Software, Office Supplies, Professional Services, Utilities, Logistics).
10. Preserve explicit Project / Reference, Reference, Job, Contract, and Work Order text as projectReference when visible. Do not create project-management data.
11. For Philippine documents recognize INVOICE, VAT INVOICE, NON-VAT INVOICE, SALES INVOICE, SERVICE INVOICE, COMMERCIAL INVOICE, CASH INVOICE, CHARGE INVOICE, CREDIT INVOICE, and Official Receipt. Keep documentType=INVOICE for invoice documents and use invoiceSubtype for the more specific label. An Official Receipt is usually RECEIPT or SUPPLEMENTARY_DOCUMENT when the source does not clearly establish an invoice; do not invent a legal conclusion.
12. For Philippine fields look for Registered Name, Business/Trade Name, VAT REG TIN, TIN, Branch Code, Registered Business Address, invoice/serial number, transaction date, buyer registered name/TIN/address, description/nature of service, quantity, unit, unit price/cost, amount, VATable Sales, VAT Amount, VAT on Local Sales, Zero-Rated Sales, VAT-Exempt Sales, Discount, Total Amount, Amount Paid, Balance Due, ATP, OCN, Permit to Use/BIR Permit, and approved invoice serial ranges. These are optional for foreign invoices.
13. Recognize ₱, PHP, Php, PhP, and Philippine Peso as PHP. Preserve explicit USD, US$, $, EUR, SGD, JPY, and other foreign currencies. Never infer PHP only from a Philippine address. If currency is unclear, return null and lower confidence.
14. Keep withholding tax/EWT/CWT separate from VAT. Never subtract withholding from grandTotal unless the source explicitly provides netAmountPayable; do not infer a withholding rate.
15. For VAT-inclusive wording, set philippineTaxDetails.vatInclusive=true only when clearly stated; otherwise leave it null rather than guessing.
16. Return every schema property, using null for an unknown scalar or object and [] for an unknown array. Return only JSON matching the schema.`;

    const firstModel = selectModel(model);
    const attempts: Array<{ candidate: InvoiceData; quality: ExtractionQuality; modelUsed: string; attemptNumber: number }> = [];
    const attemptSummaries: Array<any> = [];
    let firstFailure: any;
    const runAttempt = async (requested: string, attemptNumber: number, contents: any, reason?: string) => {
      const attemptStarted = Date.now();
      try {
        let response;
        try {
          response = await generateContentWithTimeout(aiRuntime.geminiClient, requested, contents, { systemInstruction: systemPrompt, responseMimeType: "application/json", responseSchema: invoiceSchema });
        } catch (error) {
          if (!authenticationRetryUsed && isCompanyAiAuthenticationError(error)) {
            authenticationRetryUsed = true;
            invalidateCompanyAiRuntime(auth.companyId);
            aiRuntime = await resolveCompanyAiRuntime({ supabase: auth.supabase, companyId: auth.companyId, forceRefresh: true });
            try {
              response = await generateContentWithTimeout(aiRuntime.geminiClient, requested, contents, { systemInstruction: systemPrompt, responseMimeType: "application/json", responseSchema: invoiceSchema });
            } catch (retryError) {
              if (isCompanyAiAuthenticationError(retryError)) {
                try { await markCompanyAiCredentialInvalid({ companyId: auth.companyId }); } catch { /* preserve the safe provider error */ }
                invalidateCompanyAiRuntime(auth.companyId);
              }
              throw retryError;
            }
          } else {
            throw error;
          }
        }
        const { extracted, responseText } = parseStructuredResponse(response);
        const candidate = buildInvoiceCandidate(extracted, responseText, requested, fileName, sourceType, emailContext, sourceText);
        attempts.push({ candidate, quality: candidate.extractionQuality!, modelUsed: requested, attemptNumber });
        attemptSummaries.push({ attemptNumber, model: requested, responseParsed: true, qualityScore: candidate.extractionQuality?.score, completenessScore: candidate.extractionQuality?.completeness, lineItemCount: candidate.items.length, reason });
        console.info("invoice-extraction-attempt", {
          sourceType,
          mimeType: mimeType || "text",
          requestedProfile: firstModel,
          actualModel: requested,
          durationMs: Date.now() - attemptStarted,
          responseParsed: true,
          lineItemCount: candidate.items.length,
          currencyPresent: Boolean(candidate.currency),
          invoiceNumberPresent: Boolean(candidate.invoiceNumber),
          totalPresent: candidate.grandTotal > 0,
          qualityScore: candidate.extractionQuality?.score,
          completenessScore: candidate.extractionQuality?.completeness,
          fallbackTriggered: attemptNumber > 1,
          fallbackReason: reason || null,
        });
        return candidate;
      } catch (error: any) {
        attemptSummaries.push({ attemptNumber, model: requested, responseParsed: false, reason: reason || "request-or-parse-failure" });
        console.warn("invoice-extraction-attempt-failed", {
          sourceType,
          mimeType: mimeType || "text",
          requestedProfile: firstModel,
          actualModel: requested,
          durationMs: Date.now() - attemptStarted,
          responseParsed: false,
          fallbackTriggered: attemptNumber > 1,
          fallbackReason: reason || "request-or-parse-failure",
        });
        throw error;
      }
    };

    try {
      await runAttempt(firstModel, 1, { parts });
    } catch (error) {
      firstFailure = error;
    }

    const first = attempts[0];
    const firstProviderError = firstFailure ? companyAiProviderError(firstFailure) : null;
    const providerRetryAllowed = !firstProviderError || isCompanyAiFallbackEligible(firstProviderError);
    if (providerRetryAllowed && shouldRunAutomaticRetry(firstModel, first?.quality)) {
      const reason = first ? `quality:${retryFocusForQuality(first.quality).join(",")}` : "request-or-parse-failure";
      const retryContents = { parts: [...parts, { text: enhancedRetryInstruction(first?.quality || evaluateExtractionQuality({}, sourceText)) }] };
      try {
        await runAttempt(ACCURACY_MODEL, 2, retryContents, reason);
      } catch (error: any) {
        if (!firstFailure) firstFailure = error;
      }
    }

    if (!attempts.length) {
      const providerError = companyAiProviderError(firstFailure);
      if (providerError) throw providerError;
      console.error("Error in /api/extract-invoice: no usable extraction candidate.");
      return res.status(500).json({ success: false, error: "Invoice extraction failed. Please retry the document." });
    }

    const selected = chooseBestExtractionCandidate(attempts.map((attempt) => ({ candidate: attempt.candidate, quality: attempt.quality })));
    if (!selected) return res.status(500).json({ success: false, error: "Invoice extraction failed. Please retry the document." });
    const selectedAttempt = attempts.find((attempt) => attempt.candidate === selected.candidate)?.attemptNumber || 1;
    selected.candidate.extractionQuality = {
      ...selected.quality,
      attemptCount: attemptSummaries.length,
      fallbackUsed: attemptSummaries.length > 1,
      selectedAttempt,
      attempts: attemptSummaries.map((summary) => ({ ...summary, selected: summary.attemptNumber === selectedAttempt })),
    };
    console.info("invoice-extraction-selected", {
      sourceType,
      durationMs: Date.now() - startedAt,
      attemptCount: attemptSummaries.length,
      selectedAttempt,
      selectedModel: selected.candidate.modelUsed,
      selectedQualityScore: selected.candidate.extractionQuality.score,
      selectedCompletenessScore: selected.candidate.extractionQuality.completeness,
    });
    return res.json({ success: true, data: selected.candidate });
  } catch (error: any) {
    const normalizedError = error instanceof CompanyAiError ? error : companyAiProviderError(error) || error;
    const status = apiErrorStatus(normalizedError);
    if (normalizedError instanceof CompanyAiError) logCompanyAiFailure(normalizedError, { companyId: extractionCompanyId, stage: "invoice-extraction" });
    if (!(normalizedError instanceof ApiAuthorizationError) && !(normalizedError instanceof CompanyAiError)) console.error("Error in /api/extract-invoice: request failed.");
      return res.status(status).json({ success: false, error: apiErrorMessage(normalizedError, "Invoice extraction failed. Please retry the document."), ...apiAiErrorDetails(normalizedError) });
  } finally {
    if (aiBudgetClaimed && budgetAuth) await releaseAiRequest(budgetAuth.supabase, budgetAuth.companyId, "INVOICE_EXTRACTION");
  }
});

const expenseSchema = {
  type: "object",
  properties: {
    expenseDate: { type: "string", description: "Expense or receipt date in YYYY-MM-DD format" },
    category: {
      type: "string",
      description: "Category matching one of: Fuel, Transportation, Meals, Materials, Equipment Rental, Equipment, Utilities, Communication, Office / Site Supplies, Permits, Professional Fees, Subcontractor, Miscellaneous",
    },
    description: { type: "string", description: "Brief description of the expense or purchased items" },
    payee: { type: "string", description: "Merchant, store, supplier, or payee name" },
    amount: { type: "number", description: "Total expense amount paid or due as a positive number" },
    currency: { type: "string", description: "ISO currency code such as PHP, USD, EUR, SGD" },
    paymentMethod: { type: "string", description: "Payment method such as Cash, GCash, Maya, Credit Card, Debit Card, Bank Transfer, Check" },
    referenceNumber: { type: "string", description: "Official receipt number, transaction ID, reference number, or invoice number" },
    projectReference: { type: "string", description: "Project code hint (e.g. PRJ-0017) if explicitly visible" },
    merchantIdentity: {
      type: "object",
      properties: {
        taxId: { type: "string", description: "Merchant Tax ID / TIN if present" },
        address: { type: "string", description: "Merchant address if present" },
        email: { type: "string", description: "Merchant contact email if present" },
        phone: { type: "string", description: "Merchant phone number if present" },
      },
    },
    confidenceScore: { type: "number", description: "Extraction confidence from 0 to 100" },
  },
  required: ["category", "description"],
};

app.post("/api/extract-expense", async (req, res) => {
  const startedAt = Date.now();
  let extractionCompanyId: string | undefined;
  let budgetAuth: CompanyRequestAuthorization | null = null;
  let aiBudgetClaimed = false;
  try {
    const auth = await authorizeCompanyRequest(req, "expenses.manage");
    budgetAuth = auth;
    extractionCompanyId = auth.companyId;
    let {
      fileData,
      mimeType,
      textData,
      fileName,
      model = PRIMARY_MODEL,
      emailContext,
    } = req.body || {};

    if ((!fileData || !mimeType) && !textData && !emailContext?.body) {
      return res.status(400).json({ success: false, error: "No receipt file, text, or email content provided." });
    }
    if (fileData !== undefined && (typeof fileData !== "string" || typeof mimeType !== "string" || !mimeType.trim())) return res.status(400).json({ success: false, error: "Receipt file data and MIME type are invalid." });
    if (textData !== undefined && typeof textData !== "string") return res.status(400).json({ success: false, error: "Receipt text data is invalid." });
    if (typeof textData === "string" && textData.length > AI_TEXT_MAX_CHARS) return res.status(413).json({ success: false, error: "Receipt text exceeds the safe extraction limit." });
    if (emailContext !== undefined && (!emailContext || typeof emailContext !== "object" || Array.isArray(emailContext))) return res.status(400).json({ success: false, error: "Receipt email context is invalid." });
    if (emailContext?.body !== undefined && (typeof emailContext.body !== "string" || emailContext.body.length > AI_TEXT_MAX_CHARS)) return res.status(413).json({ success: false, error: "Receipt email content exceeds the safe extraction limit." });
    if (typeof fileData === "string" && fileData) {
      try {
        const bytes = decodeBase64Payload(fileData, 10 * 1024 * 1024, "Receipt source");
        validateInvoiceDocumentBytes(bytes, mimeType, fileName);
        fileData = Buffer.from(bytes).toString("base64");
      } catch (error: any) {
        return res.status(400).json({ success: false, error: error?.message || "Receipt source file is invalid." });
      }
    }
    await claimAiRequest(auth.supabase, auth.companyId, "EXPENSE_EXTRACTION", { maxRequests: 30, maxConcurrency: 2 });
    aiBudgetClaimed = true;

    let aiRuntime = await resolveCompanyAiRuntime({ supabase: auth.supabase, companyId: auth.companyId });
    let authenticationRetryUsed = false;
    const parts: any[] = [];
    if (fileData && mimeType) parts.push({ inlineData: { mimeType, data: fileData } });
    const emailBlock = emailContext
      ? `\nEMAIL CONTEXT\nSender: ${emailContext.sender || "Unknown"}\nSubject: ${emailContext.subject || ""}\nReceived: ${emailContext.receivedAt || ""}\nAttachment: ${emailContext.attachmentName || fileName || ""}\nEmail body:\n${emailContext.body || ""}\n`
      : "";
    parts.push({
      text: `${emailBlock}\n${textData ? `DOCUMENT TEXT:\n${textData}` : "Analyze the attached receipt/expense document."}\n\nExtract the receipt into the requested structured expense schema.`,
    });

    const expenseSystemPrompt = `You are a high-precision, internationally capable receipt and expense document extraction system.
Give special attention to Philippine receipts, official receipts (OR), fuel charge slips, transport receipts, store receipts, and utility bills.
Rules:
1. Extract values that are explicitly visible in the receipt document or email context.
2. Never guess, estimate, or invent missing financial amounts, dates, reference numbers, or currency.
3. If an amount is not visible, return null (do not return 0 unless the receipt explicitly states 0).
4. For currency: recognize ₱, PHP, Php as PHP; recognize USD, EUR, SGD, JPY, GBP, CAD, AUD. If currency is not explicitly stated or implied by unambiguous currency symbols, return null.
5. Category MUST be selected from the standard Engoryx categories: Fuel, Transportation, Meals, Materials, Equipment Rental, Equipment, Utilities, Communication, Office / Site Supplies, Permits, Professional Fees, Subcontractor, Miscellaneous.
6. Look for merchant / store name, official receipt (OR) number, transaction reference, date, payment method (Cash, GCash, Maya, Credit Card, etc.), and total paid amount.
7. Return only JSON matching the schema.`;

    const requestedModel = selectModel(model);
    let response: any;
    let modelUsed = requestedModel;

    try {
      response = await generateContentWithTimeout(aiRuntime.geminiClient, requestedModel, { parts }, {
        systemInstruction: expenseSystemPrompt,
        responseMimeType: "application/json",
        responseSchema: expenseSchema,
      });
    } catch (error) {
      if (!authenticationRetryUsed && isCompanyAiAuthenticationError(error)) {
        authenticationRetryUsed = true;
        invalidateCompanyAiRuntime(auth.companyId);
        aiRuntime = await resolveCompanyAiRuntime({ supabase: auth.supabase, companyId: auth.companyId, forceRefresh: true });
        response = await generateContentWithTimeout(aiRuntime.geminiClient, requestedModel, { parts }, {
          systemInstruction: expenseSystemPrompt,
          responseMimeType: "application/json",
          responseSchema: expenseSchema,
        });
      } else if (requestedModel !== ACCURACY_MODEL && isCompanyAiFallbackEligible(error)) {
        modelUsed = ACCURACY_MODEL;
        response = await generateContentWithTimeout(aiRuntime.geminiClient, ACCURACY_MODEL, { parts }, {
          systemInstruction: expenseSystemPrompt,
          responseMimeType: "application/json",
          responseSchema: expenseSchema,
        });
      } else {
        throw error;
      }
    }

    const { extracted, responseText } = parseStructuredResponse(response);

    const amount = typeof extracted?.amount === "number" && Number.isFinite(extracted.amount) && extracted.amount > 0
      ? Number(extracted.amount)
      : undefined;

    const currency = extracted?.currency && typeof extracted.currency === "string" && /^[A-Z]{3}$/i.test(extracted.currency.trim())
      ? extracted.currency.trim().toUpperCase()
      : undefined;

    const expenseDate = extracted?.expenseDate && typeof extracted.expenseDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(extracted.expenseDate.trim())
      ? extracted.expenseDate.trim()
      : undefined;

    const payee = extracted?.payee && typeof extracted.payee === "string" ? extracted.payee.trim() : undefined;
    const category = extracted?.category && typeof extracted.category === "string" && extracted.category.trim()
      ? extracted.category.trim()
      : "Miscellaneous";
    const description = extracted?.description && typeof extracted.description === "string" && extracted.description.trim()
      ? extracted.description.trim()
      : (payee ? `${category} expense - ${payee}` : `${category} expense`);

    const paymentMethod = extracted?.paymentMethod && typeof extracted.paymentMethod === "string" ? extracted.paymentMethod.trim() : undefined;
    const referenceNumber = extracted?.referenceNumber && typeof extracted.referenceNumber === "string" ? extracted.referenceNumber.trim() : undefined;
    const projectReference = extracted?.projectReference && typeof extracted.projectReference === "string" ? extracted.projectReference.trim() : undefined;

    const resultData = {
      expenseDate,
      category,
      description,
      payee,
      amount,
      currency,
      paymentMethod,
      referenceNumber,
      projectId: projectReference,
      notes: `Staged from Email Intake AI extraction: ${emailContext?.subject || fileName || "Receipt"}${payee ? ` from ${payee}` : ""}`,
      confidenceScore: typeof extracted?.confidenceScore === "number" && Number.isFinite(extracted.confidenceScore) ? Math.max(0, Math.min(100, extracted.confidenceScore)) : undefined,
      merchantIdentity: extracted?.merchantIdentity || {},
      rawJson: responseText,
      modelUsed,
    };

    console.info("expense-extraction-success", {
      durationMs: Date.now() - startedAt,
      modelUsed,
      amountPresent: amount !== undefined,
      currencyPresent: currency !== undefined,
      payeePresent: payee !== undefined,
      datePresent: expenseDate !== undefined,
    });

    return res.json({ success: true, data: resultData });
  } catch (error: any) {
    const normalizedError = error instanceof CompanyAiError ? error : companyAiProviderError(error) || error;
    const status = apiErrorStatus(normalizedError);
    if (normalizedError instanceof CompanyAiError) logCompanyAiFailure(normalizedError, { companyId: extractionCompanyId, stage: "expense-extraction" });
    if (!(normalizedError instanceof ApiAuthorizationError) && !(normalizedError instanceof CompanyAiError)) console.error("Error in /api/extract-expense: request failed.");
    return res.status(status).json({ success: false, error: apiErrorMessage(normalizedError, "Receipt extraction failed. Please retry the document."), ...apiAiErrorDetails(normalizedError) });
  } finally {
    if (aiBudgetClaimed && budgetAuth) await releaseAiRequest(budgetAuth.supabase, budgetAuth.companyId, "EXPENSE_EXTRACTION");
  }
});




function getGoogleAccessToken(req: express.Request) {
  const header = firstHeaderValue(req.headers["x-gmail-access-token"]);
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new ApiAuthorizationError(401, "UNAUTHENTICATED", "Gmail authorization is missing or expired.");
  return match[1];
}

function decodeBase64UrlText(value?: string) {
  if (!value) return "";
  try {
    const bytes = decodeBase64Payload(value, MAX_GMAIL_RAW_BYTES, "Gmail text");
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes).slice(0, AI_TEXT_MAX_CHARS);
  } catch {
    return "";
  }
}

function toStandardBase64(value?: string) {
  if (!value) return "";
  try {
    return Buffer.from(decodeBase64Payload(value, MAX_GMAIL_ATTACHMENT_BYTES, "Gmail attachment")).toString("base64");
  } catch {
    return "";
  }
}

async function gmailFetch(accessToken: string, pathName: string, init?: RequestInit, maxResponseBytes = GMAIL_MAX_API_RESPONSE_BYTES) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GMAIL_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/" + pathName, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: "Bearer " + accessToken,
        Accept: "application/json",
        ...(init?.headers || {}),
      },
    });
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > maxResponseBytes) {
      const error: any = new Error("Gmail response exceeded the safe server-side size limit.");
      error.status = 413;
      throw error;
    }
    const responseBytes = new Uint8Array(await response.arrayBuffer());
    if (responseBytes.byteLength > maxResponseBytes) {
      const error: any = new Error("Gmail response exceeded the safe server-side size limit.");
      error.status = 413;
      throw error;
    }
    const payload = JSON.parse(new TextDecoder("utf-8", { fatal: false }).decode(responseBytes) || "{}");
    if (!response.ok) {
      const error: any = new Error(payload?.error?.message || "Gmail API request failed (" + response.status + ").");
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      const timeoutError: any = new Error("Gmail API request timed out within the server safety budget.");
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function headerValue(payload: any, name: string) {
  const headers = payload?.headers || [];
  return headers.find((header: any) => String(header?.name || "").toLowerCase() === name.toLowerCase())?.value || "";
}

function splitAddresses(value: string) {
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseSender(value: string) {
  const match = value.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1].replace(/^"|"$/g, "").trim(), email: match[2].trim() };
  return { name: "", email: value.trim() };
}

function collectMimeParts(payload: any) {
  const bodyText: string[] = [];
  const bodyHtml: string[] = [];
  const attachments: Array<{ attachmentId: string; partId?: string; attachmentIndex: number; filename: string; mimeType: string; size: number; inlineDataBase64?: string }> = [];
  let attachmentIndex = 0;

  const walk = (part: any) => {
    if (!part) return;
    const mimeType = String(part.mimeType || "").toLowerCase();
    const filename = String(part.filename || "");
    const body = part.body || {};

    if (!filename && body.data && mimeType === "text/plain") bodyText.push(decodeBase64UrlText(body.data));
    if (!filename && body.data && mimeType === "text/html") bodyHtml.push(decodeBase64UrlText(body.data));

    if (filename) {
      const currentIndex = attachmentIndex;
      attachmentIndex += 1;
      if (attachments.length < MAX_GMAIL_ATTACHMENT_COUNT) {
        attachments.push({
          // Gmail's attachment id is stable. MIME part ids are the deterministic
          // fallback for inline/file parts that do not expose one.
          attachmentId: body.attachmentId || `inline-${part.partId || currentIndex}`,
          partId: part.partId,
          attachmentIndex: currentIndex,
          filename,
          mimeType: part.mimeType || "application/octet-stream",
          size: Number(body.size || 0),
          inlineDataBase64: body.data ? toStandardBase64(body.data) : undefined,
        });
      }
    }
    for (const child of part.parts || []) walk(child);
  };

  walk(payload);
  return {
    bodyText: bodyText.join("\n\n").trim().slice(0, AI_TEXT_MAX_CHARS),
    bodyHtml: bodyHtml.join("\n").trim().slice(0, AI_TEXT_MAX_CHARS),
    attachmentCount: attachmentIndex,
    attachments,
  };
}

function summarizeGmailMessage(message: any) {
  const parsed = collectMimeParts(message.payload || {});
  const receivedHeader = headerValue(message.payload, "Date");
  const receivedAt = message.internalDate
    ? new Date(Number(message.internalDate)).toISOString()
    : receivedHeader
      ? new Date(receivedHeader).toISOString()
      : new Date().toISOString();
  const sender = headerValue(message.payload, "From");
  const senderParts = parseSender(sender);
  return {
    id: message.id,
    threadId: message.threadId,
    historyId: message.historyId,
    internalDate: message.internalDate,
    sender,
    senderName: senderParts.name,
    senderEmail: senderParts.email,
    to: splitAddresses(headerValue(message.payload, "To")),
    cc: splitAddresses(headerValue(message.payload, "Cc")),
    subject: headerValue(message.payload, "Subject"),
    receivedAt,
    snippet: message.snippet || "",
    bodyText: parsed.bodyText || message.snippet || "",
    bodyHtml: parsed.bodyHtml || "",
    labels: message.labelIds || [],
    hasAttachments: parsed.attachmentCount > 0,
    attachments: parsed.attachments.map(({ inlineDataBase64, ...attachment }) => attachment),
  };
}

async function getGmailMessageFull(accessToken: string, messageId: string) {
  return gmailFetch(accessToken, `messages/${encodeURIComponent(messageId)}?format=full`);
}

app.get("/api/gmail/profile", async (req, res) => {
  try {
    await authorizeCompanyRequest(req, "gmail.read");
    const accessToken = getGoogleAccessToken(req);
    const profile = await gmailFetch(accessToken, "profile");
    res.json({ success: true, data: profile });
  } catch (error: any) {
    res.status(error?.status || 500).json({ success: false, error: error?.message || "Could not read Gmail profile." });
  }
});

app.post("/api/gmail/scan", async (req, res) => {
  try {
    await authorizeCompanyRequest(req, "gmail.read");
    const accessToken = getGoogleAccessToken(req);
    const maxResults = Math.max(1, Math.min(50, Number(req.body?.maxResults || 25)));
    const query = String(req.body?.query || "newer_than:30d {subject:invoice subject:\"sales invoice\" subject:\"service invoice\" subject:\"VAT invoice\" subject:billing subject:SOA \"statement of account\" \"credit note\" \"tax invoice\" BIR VAT TIN \"amount due\" filename:pdf filename:png filename:jpg filename:jpeg}");
    if (query.length > GMAIL_MAX_QUERY_CHARS) return res.status(400).json({ success: false, error: "Gmail search query is too long." });
    const ids: string[] = [];
    let pageToken = "";
    let resultSizeEstimate = 0;
    let pages = 0;
    do {
      pages += 1;
      const params = new URLSearchParams({ maxResults: String(Math.max(1, Math.min(100, maxResults - ids.length))), q: query });
      if (pageToken) params.set("pageToken", pageToken);
      const list = await gmailFetch(accessToken, `messages?${params.toString()}`);
      resultSizeEstimate = Number(list.resultSizeEstimate || resultSizeEstimate);
      ids.push(...(list.messages || []).map((entry: any) => entry.id).filter(Boolean));
      pageToken = String(list.nextPageToken || "");
    } while (pageToken && ids.length < maxResults && pages < 5);
    ids.splice(maxResults);
    const messages: any[] = [];
    for (let i = 0; i < ids.length; i += 6) {
      const batch = ids.slice(i, i + 6);
      const loaded = await Promise.all(batch.map((id: string) => getGmailMessageFull(accessToken, id)));
      messages.push(...loaded.map(summarizeGmailMessage));
    }
    const profile = await gmailFetch(accessToken, "profile");
    res.json({ success: true, data: { messages, resultSizeEstimate: resultSizeEstimate || messages.length, historyId: profile.historyId, emailAddress: profile.emailAddress } });
  } catch (error: any) {
    res.status(error?.status || 500).json({ success: false, error: error?.message || "Gmail scan failed." });
  }
});

app.post("/api/gmail/history", async (req, res) => {
  const startedAt = Date.now();
  try {
    await authorizeCompanyRequest(req, "gmail.read");
    const accessToken = getGoogleAccessToken(req);
    const startHistoryId = String(req.body?.startHistoryId || "").trim();
    if (!/^\d{1,100}$/.test(startHistoryId)) return res.status(400).json({ success: false, error: "A valid Gmail history ID is required. Run an initial scan first." });
    const ids = new Set<string>();
    let pageToken = "";
    let pagesFetched = 0;
    let truncated = false;
    let resyncRequired = false;
    do {
      if (Date.now() - startedAt > GMAIL_HISTORY_BUDGET_MS) { truncated = true; resyncRequired = true; break; }
      pagesFetched += 1;
      const params = new URLSearchParams({ startHistoryId, historyTypes: "messageAdded", maxResults: "100" });
      if (pageToken) params.set("pageToken", pageToken);
      const history = await gmailFetch(accessToken, "history?" + params.toString());
      for (const event of history.history || []) {
        for (const added of event.messagesAdded || []) {
          if (added?.message?.id) ids.add(String(added.message.id));
          if (ids.size >= GMAIL_HISTORY_MAX_MESSAGE_IDS) { truncated = true; resyncRequired = true; break; }
        }
        if (resyncRequired) break;
      }
      pageToken = String(history.nextPageToken || "");
      if (pagesFetched >= GMAIL_HISTORY_MAX_PAGES && pageToken) { truncated = true; resyncRequired = true; }
    } while (pageToken && !truncated);
    const idList = Array.from(ids).slice(0, GMAIL_HISTORY_MAX_LOADED_MESSAGES);
    if (ids.size > GMAIL_HISTORY_MAX_LOADED_MESSAGES) { truncated = true; resyncRequired = true; }
    const messages: any[] = [];
    let messageBytes = 0;
    for (let i = 0; i < idList.length; i += 6) {
      if (Date.now() - startedAt > GMAIL_HISTORY_BUDGET_MS) { truncated = true; resyncRequired = true; break; }
      const batch = idList.slice(i, i + 6);
      const loaded = await Promise.all(batch.map((id) => getGmailMessageFull(accessToken, id)));
      for (const message of loaded) {
        const summary = summarizeGmailMessage(message);
        messageBytes += Buffer.byteLength(JSON.stringify(summary), "utf8");
        if (messageBytes > GMAIL_HISTORY_MAX_RESPONSE_BYTES) { truncated = true; resyncRequired = true; break; }
        messages.push(summary);
      }
      if (messageBytes > GMAIL_HISTORY_MAX_RESPONSE_BYTES) break;
    }
    const profile = truncated && resyncRequired ? {} : await gmailFetch(accessToken, "profile");
    return res.json({ success: true, data: { messages, historyId: truncated ? startHistoryId : profile.historyId, emailAddress: profile.emailAddress, complete: !truncated, continuation: truncated ? { startHistoryId, pageToken: resyncRequired ? undefined : pageToken || undefined, pagesFetched, messageIdsReturned: messages.length, resyncRequired } : undefined } });
  } catch (error: any) {
    const status = error?.status === 404 ? 409 : (error?.status || 500);
    return res.status(status).json({ success: false, code: error?.status === 404 ? "HISTORY_EXPIRED" : undefined, error: error?.status === 404 ? "Gmail history cursor expired. Run a fresh scan to rebuild sync state." : (error?.message || "Gmail incremental sync failed.") });
  }
});

app.post("/api/gmail/import", async (req, res) => {
  try {
    await authorizeCompanyRequest(req, "gmail.manage");
    const accessToken = getGoogleAccessToken(req);
    const messageId = String(req.body?.messageId || "").trim();
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(messageId)) return res.status(400).json({ success: false, error: "A valid Gmail messageId is required." });
    const full = await getGmailMessageFull(accessToken, messageId);
    const summary: any = summarizeGmailMessage(full);
    const parsed = collectMimeParts(full.payload || {});
    if (parsed.attachmentCount > MAX_GMAIL_ATTACHMENT_COUNT) return res.status(413).json({ success: false, error: "Gmail message has too many attachments to import safely." });
    const attachments: any[] = [];
    let attachmentBytes = 0;
    for (const attachment of parsed.attachments) {
      if (attachment.size > MAX_GMAIL_ATTACHMENT_BYTES) return res.status(413).json({ success: false, error: "A Gmail attachment exceeds the safe size limit." });
      let dataBase64 = attachment.inlineDataBase64 || "";
      if (!dataBase64 && attachment.attachmentId && !attachment.attachmentId.startsWith("inline-")) {
        const payload = await gmailFetch(accessToken, "messages/" + encodeURIComponent(messageId) + "/attachments/" + encodeURIComponent(attachment.attachmentId));
        dataBase64 = toStandardBase64(payload.data || "");
      }
      if (!dataBase64) return res.status(413).json({ success: false, error: "A Gmail attachment could not be loaded within the safe import budget." });
      let bytes: Uint8Array;
      try { bytes = decodeBase64Payload(dataBase64, MAX_GMAIL_ATTACHMENT_BYTES, "Gmail attachment"); validateGmailAttachmentBytes(bytes, attachment.mimeType, attachment.filename); }
      catch (error: any) { return res.status(400).json({ success: false, error: error?.message || "A Gmail attachment is invalid." }); }
      attachmentBytes += bytes.byteLength;
      if (attachmentBytes > MAX_GMAIL_ATTACHMENT_TOTAL_BYTES) return res.status(413).json({ success: false, error: "Gmail attachment payload exceeds the 25 MB aggregate limit." });
      const normalizedData = Buffer.from(bytes).toString("base64");
      attachments.push({ attachmentId: attachment.attachmentId, partId: attachment.partId, attachmentIndex: attachment.attachmentIndex, filename: attachment.filename, mimeType: attachment.mimeType, size: bytes.byteLength, dataBase64: normalizedData });
    }
    validateGmailAttachmentEnvelope(attachments);
    const raw = await gmailFetch(accessToken, "messages/" + encodeURIComponent(messageId) + "?format=raw");
    let rawBytes: Uint8Array;
    try { rawBytes = decodeBase64Payload(String(raw.raw || ""), MAX_GMAIL_RAW_BYTES, "Gmail raw message"); validateGmailRawMessage(rawBytes); }
    catch (error: any) { return res.status(400).json({ success: false, error: error?.message || "Gmail raw message is invalid." }); }
    if (attachmentBytes + rawBytes.byteLength > GMAIL_IMPORT_MAX_TOTAL_BYTES) return res.status(413).json({ success: false, error: "Gmail attachment and raw-message payload exceeds the safe import limit." });
    return res.json({ success: true, data: { ...summary, attachments, rawBase64Url: raw.raw || "" } });
  } catch (error: any) {
    return res.status(error?.status || 500).json({ success: false, error: error?.message || "Could not import Gmail message." });
  }
});

function normalizedEmailList(value: unknown, label: string) {
  const raw = Array.isArray(value) ? value.map((item) => String(item || "")) : String(value || "").split(",");
  const values = raw.map((item) => item.trim()).filter(Boolean);
  if (values.length > 20) throw new ApiAuthorizationError(400, "COMPANY_REQUIRED", `${label} has too many recipients.`);
  for (const item of values) {
    if (!/^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(item)) {
      throw new ApiAuthorizationError(400, "COMPANY_REQUIRED", `${label} contains an invalid email address.`);
    }
  }
  return values;
}

function safeMailHeader(value: unknown, fallback: string) {
  const normalized = String(value || fallback).replace(/[\r\n]+/g, " ").trim();
  return normalized.slice(0, 500) || fallback;
}

function base64Url(value: Buffer) {
  return value.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function buildDocumentMimeMessage(input: { to: string[]; cc: string[]; subject: string; message: string; attachmentName: string; pdfBytes: Buffer }) {
  const boundary = `=_HydroQualiSense_${randomUUID()}`;
  const attachment = input.pdfBytes.toString("base64").replace(/(.{1,76})/g, "$1\r\n").trim();
  const headers = [
    `To: ${input.to.join(", ")}`,
    ...(input.cc.length ? [`Cc: ${input.cc.join(", ")}`] : []),
    `Subject: ${input.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ];
  const raw = [
    ...headers,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    input.message,
    `--${boundary}`,
    `Content-Type: application/pdf; name="${input.attachmentName}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${input.attachmentName}"`,
    "",
    attachment,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return Buffer.from(raw, "utf8");
}

function renderTrustedIssuedPdf(row: { id: string; document_type: string; document_id: string; document_number: string; template_version: string; snapshot: unknown }, documentType: "PURCHASE_ORDER" | "CLIENT_INVOICE") {
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
  const bytes = documentType === "PURCHASE_ORDER"
    ? buildPurchaseOrderPdf(snapshot as PurchaseOrderDocumentSnapshot)
    : buildClientInvoicePdf(snapshot as ClientInvoiceDocumentSnapshot);
  const pdfBytes = Buffer.from(bytes);
  if (pdfBytes.length === 0 || pdfBytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new ApiAuthorizationError(503, "SERVER_AUTH_UNAVAILABLE", "The immutable issued document could not be rendered safely.");
  }
  return pdfBytes;
}

async function recordDocumentSendAudit(auth: CompanyRequestAuthorization, input: {
  sendIntentId: string;
  status: "SENT" | "FAILED";
  gmailMessageId?: string;
  errorMessage?: string;
}) {
  if (!input.sendIntentId) throw new Error("The document send intent is required before recording delivery history.");
  const { data, error } = await auth.supabase.rpc("record_document_send_audit", {
    p_intent_id: input.sendIntentId,
    p_gmail_message_id: input.gmailMessageId || null,
    p_status: input.status,
    p_error_message: input.errorMessage || null,
  });
  if (error) throw error;
  const audit = rpcRow(data)?.audit;
  return String(audit && typeof audit === "object" ? (audit as Record<string, unknown>).id || "" : "");
}

app.post("/api/gmail/send", async (req, res) => {
  let auth: CompanyRequestAuthorization | null = null;
  let sendIntentId: string | null = null;
  let intentStateCompleted = false;
  let gmailDelivered = false;
  try {
    auth = await authorizeCompanyRequest(req, "documents.send");
    const documentType = String(req.body?.documentType || "").trim().toUpperCase();
    if (documentType !== "PURCHASE_ORDER" && documentType !== "CLIENT_INVOICE") return res.status(400).json({ success: false, error: "A supported issued document type is required." });
    const documentId = String(req.body?.documentId || "").trim();
    const snapshotId = String(req.body?.snapshotId || "").trim();
    if (!UUID_PATTERN.test(documentId) || !UUID_PATTERN.test(snapshotId)) return res.status(400).json({ success: false, error: "An issued document snapshot is required before sending." });
    const documentPermission = documentType === "PURCHASE_ORDER" ? "procurement.read" : "projects.read";
    const { data: allowed, error: permissionError } = await auth.supabase.rpc("has_company_permission", { p_company_id: auth.companyId, p_permission_key: documentPermission });
    if (permissionError || allowed !== true) throw new ApiAuthorizationError(403, "FORBIDDEN", "You do not have permission to send this document type.");
    const { data: snapshot, error: snapshotError } = await auth.supabase
      .from("issued_document_snapshots")
      .select("id,document_type,document_id,document_number,template_version,snapshot")
      .eq("company_id", auth.companyId)
      .eq("id", snapshotId)
      .eq("document_type", documentType)
      .eq("document_id", documentId)
      .maybeSingle();
    if (snapshotError) throw snapshotError;
    if (!snapshot) throw new ApiAuthorizationError(409, "COMPANY_REQUIRED", "The issued document snapshot is unavailable. Generate the document again before sending.");
    const recipients = normalizedEmailList(req.body?.to, "To");
    const cc = normalizedEmailList(req.body?.cc, "CC");
    if (!recipients.length) throw new ApiAuthorizationError(400, "COMPANY_REQUIRED", "At least one To recipient is required.");
    const subject = safeMailHeader(req.body?.subject, (documentType === "PURCHASE_ORDER" ? "Purchase Order " : "Client Invoice ") + snapshot.document_number);
    const message = String(req.body?.message || "").replace(/[\u0000]/g, "").slice(0, 20_000);
    const attachmentName = safeMailHeader(req.body?.attachmentName, String(snapshot.document_number) + ".pdf").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 180) || String(snapshot.document_number) + ".pdf";
    const pdfBytes = renderTrustedIssuedPdf(snapshot, documentType as "PURCHASE_ORDER" | "CLIENT_INVOICE");
    const trustedSha256 = createHash("sha256").update(pdfBytes).digest("hex");
    const requestedKey = String(req.body?.idempotencyKey || "").trim();
    if (requestedKey && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(requestedKey)) throw new ApiAuthorizationError(400, "COMPANY_REQUIRED", "Send idempotency key is invalid.");
    const idempotencyKey = requestedKey || "document:" + createHash("sha256").update(JSON.stringify({ snapshotId, documentType, documentId, recipients, cc, subject, message, attachmentName, trustedSha256 })).digest("hex");
    const claimResult = await auth.supabase.rpc("claim_document_send_intent", {
      p_snapshot_id: snapshotId, p_document_type: documentType, p_document_id: documentId, p_idempotency_key: idempotencyKey,
      p_trusted_sha256: trustedSha256, p_recipients: recipients, p_cc: cc, p_subject: subject, p_attachment_name: attachmentName,
    });
    if (claimResult.error) throw claimResult.error;
    const claim = rpcRow(claimResult.data);
    const intent = claim?.intent && typeof claim.intent === "object" ? claim.intent as Record<string, any> : null;
    if (!intent?.id) throw new Error("The document send intent was not returned.");
    if (String(intent.status) === "SENT") return res.json({ success: true, data: { status: "SENT", gmailMessageId: intent.gmail_message_id || undefined, idempotent: true } });
    if (claim?.claimed !== true) return res.status(409).json({ success: false, code: "DOCUMENT_SEND_RECONCILE_REQUIRED", error: "This issued document send is already in progress or requires reconciliation. Check send history before retrying." });
    sendIntentId = String(intent.id);
    const accessToken = getGoogleAccessToken(req);
    let sent: any;
    try {
      sent = await gmailFetch(accessToken, "messages/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raw: base64Url(buildDocumentMimeMessage({ to: recipients, cc, subject, message, attachmentName, pdfBytes })) }) });
      gmailDelivered = true;
    } catch (error: any) {
      const providerStatus = Number(error?.status || 0);
      const knownFailure = providerStatus >= 400 && providerStatus < 500;
      const completion = await auth.supabase.rpc("complete_document_send_intent", { p_intent_id: sendIntentId, p_status: knownFailure ? "FAILED" : "UNKNOWN", p_error_message: "Gmail delivery could not be confirmed." });
      if (!completion.error) intentStateCompleted = true;
      if (completion.error || !knownFailure) return res.status(503).json({ success: false, code: "DOCUMENT_SEND_RECONCILE_REQUIRED", error: "Gmail delivery could not be confirmed. Do not resend until this send intent is reconciled." });
      try {
        await recordDocumentSendAudit(auth, { sendIntentId, status: "FAILED", errorMessage: "Gmail rejected the issued document send." });
      } catch {
        return res.status(503).json({ success: false, code: "DOCUMENT_SEND_RECONCILE_REQUIRED", error: "Gmail rejected the document, but the durable send history could not be recorded. Check send history before retrying." });
      }
      return res.status(providerStatus || 502).json({ success: false, code: "DOCUMENT_SEND_FAILED", error: "Gmail rejected the issued document send. The failed attempt was recorded." });
    }
    const gmailMessageId = String(sent?.id || "");
    const completion = await auth.supabase.rpc("complete_document_send_intent", { p_intent_id: sendIntentId, p_status: "SENT", p_gmail_message_id: gmailMessageId, p_error_message: null });
    if (completion.error) return res.status(503).json({ success: false, code: "DOCUMENT_SEND_RECONCILE_REQUIRED", error: "Gmail accepted the document, but the durable send state could not be completed. Do not resend until send history is reconciled." });
    intentStateCompleted = true;
    const auditId = await recordDocumentSendAudit(auth, { sendIntentId, status: "SENT", gmailMessageId });
    return res.json({ success: true, data: { status: "SENT", gmailMessageId, auditId, idempotent: false } });
  } catch (error: any) {
    if (gmailDelivered) return res.status(503).json({ success: false, code: "DOCUMENT_SEND_RECONCILE_REQUIRED", error: "Gmail accepted the document, but durable send history could not be completed. Do not resend until send history is reconciled." });
    if (sendIntentId && auth && !intentStateCompleted) {
      const completion = await auth.supabase.rpc("complete_document_send_intent", { p_intent_id: sendIntentId, p_status: "FAILED", p_error_message: "The send was not accepted by Gmail." });
      if (completion.error) return res.status(503).json({ success: false, code: "DOCUMENT_SEND_RECONCILE_REQUIRED", error: "The send attempt could not be reconciled safely. Do not resend until send history is checked." });
    }
    const status = error instanceof ApiAuthorizationError ? error.status : Number(error?.status) || (error?.code === "42501" ? 403 : error?.code === "23514" ? 409 : 503);
    const safeMessage = error instanceof ApiAuthorizationError ? error.message : "The issued document could not be sent safely. Check the send intent and document history before retrying.";
    return res.status(status).json({ success: false, error: safeMessage });
  }
});

async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      // Only browser document routes should fall back to the SPA entrypoint.
      // Returning index.html for a mistyped API URL hides the real 404 and can
      // make callers fail later while trying to parse HTML as JSON.
      if (req.path === "/api" || req.path.startsWith("/api/")) {
        res.status(404).json({ success: false, error: "API endpoint not found." });
        return;
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Sales Invoice Workspace running at http://0.0.0.0:${PORT}`);
  });
}

start();
