import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Type } from "@google/genai";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { createHash, randomUUID } from "crypto";
import type { InvoiceData } from "./src/types.ts";
import { buildClientInvoicePdf, buildPurchaseOrderPdf, type ClientInvoiceDocumentSnapshot, type PurchaseOrderDocumentSnapshot } from "./src/lib/documentGeneration.ts";
import { decodeBase64Payload, MAX_EXTRACTION_TEXT_CHARS, validateInvoiceDocumentBytes } from "./src/lib/fileSecurity.ts";
import { AiRequestBudgetError, claimAiRequest, releaseAiRequest } from "./src/server/ai/aiRequestBudget.ts";
import { createAssistantRouter } from "./src/server/assistant/assistantHandler.ts";
import { createStorageRouter } from "./src/server/storage/storageRouter.ts";
import { createDocumentTemplateRouter, finalizeIssuedDocumentTemplatePdfForDelivery } from "./src/server/documentTemplates/documentTemplateRouter.ts";
import { mapDocumentDeliveryHistory } from "./src/server/documentDelivery/documentDeliveryHistory.ts";
import { getStorageHealth } from "./src/lib/storage/index.ts";
import { encryptCompanyGeminiCredential, credentialLast4 } from "./src/server/ai/companyAiEncryption.ts";
import { companyAiServerSupabase } from "./src/server/ai/companyAiServerSupabase.ts";
import { bootstrapDeploymentCompanyAiCredential, canBootstrapDeploymentCompanyAiCredential, disableCompanyAi, enableCompanyAi, loadCompanyAiConfig, loadServerCompanyAiConfig, markCompanyAiCredentialInvalid, recordCompanyAiTest, recordServerCompanyAiTest, removeCompanyAiCredential, storeCompanyAiCredential } from "./src/server/ai/companyAiCredentials.ts";
import { companyAiProviderError, invalidateCompanyAiRuntime, isCompanyAiAuthenticationError, isCompanyAiFallbackEligible, logCompanyAiFailure, resolveCompanyAiRuntime, resolveCompanyAiRuntimeCapability, testCompanyAiConnection, withCompanyAiRuntime } from "./src/server/ai/companyAiRuntime.ts";
import { COMPANY_AI_FALLBACK_MODEL, COMPANY_AI_PRIMARY_MODEL, CompanyAiError } from "./src/server/ai/companyAiTypes.ts";
import { validatePublicProspectSubmission } from "./src/lib/publicProspect.ts";
import { releaseMetadataFromEnv } from "./src/server/releaseMetadata.ts";
import { loadServerPdfLogo } from "./src/server/documentPdfLogo.ts";
import { DOCUMENT_PDF_UNAVAILABLE_MESSAGE, getDocumentPdfFinalizationHealth } from "./src/server/documentTemplates/documentPdfFinalizer.ts";
import { checkSmsProviderOverview, getSmsProviderStatus, resolveSmsProvider } from "./src/server/messaging/smsProvider.ts";
import { checkBrevoEmailProvider, createBrevoEmailProvider } from "./src/server/messaging/brevoEmailProvider.ts";
import { normalizePhilippineMobileNumber, SMS_MAX_MESSAGE_LENGTH } from "./src/lib/smsNumber.ts";
import {
  chooseBestExtractionCandidate,
  evaluateExtractionQuality,
  normalizeCurrency,
  retryFocusForQuality,
  shouldRunAutomaticRetry,
  type ExtractionQuality,
} from "./src/utils/extractionQuality.ts";
import {
  explicitInvoiceTaxAmount,
  reconcileInvoiceMonetarySemantics,
  resolveInvoiceMonetarySemantics,
} from "./src/utils/invoiceMonetarySemantics.ts";
import { businessDateForTimeZone } from "./src/utils/businessDate.ts";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PRIMARY_MODEL = COMPANY_AI_PRIMARY_MODEL;
const ACCURACY_MODEL = COMPANY_AI_FALLBACK_MODEL;
type CompanyPermission =
  | "invoices.extract"
  | "expenses.manage"
  | "company.settings.read"
  | "company.members.manage"
  | "company.settings.manage"
  | "storage.read"
  | "documents.send"
  | "procurement.read"
  | "projects.read";

interface CompanyRequestAuthorization {
  accessToken: string;
  companyId: string;
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
    throw new ApiAuthorizationError(401, "UNAUTHENTICATED", "A valid Hydroqualisense session is required.");
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

function publicSupabaseClient() {
  const { supabaseUrl, publishableKey } = serverSupabaseConfiguration();
  return createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function authorizeCompanyRequest(req: express.Request, permission: CompanyPermission): Promise<CompanyRequestAuthorization> {
  const accessToken = requestBearerToken(req);
  const client = requestSupabaseClient(accessToken);
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new ApiAuthorizationError(401, "UNAUTHENTICATED", "A valid Hydroqualisense session is required.");
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
    throw new ApiAuthorizationError(403, "FORBIDDEN", "This request cannot target another Hydroqualisense deployment company.");
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

  return { accessToken, companyId, supabase: client, user: data.user };
}

async function authenticateServerRequest(req: express.Request) {
  const accessToken = requestBearerToken(req);
  const client = requestSupabaseClient(accessToken);
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) throw new ApiAuthorizationError(401, "UNAUTHENTICATED", "A valid Hydroqualisense session is required.");
  return { accessToken, supabase: client, user: data.user };
}

async function authorizePlatformCompanyRequest(req: express.Request, companyId: string): Promise<CompanyRequestAuthorization> {
  if (!UUID_PATTERN.test(companyId)) throw new ApiAuthorizationError(400, "COMPANY_REQUIRED", "A valid company context is required for this operation.");
  const auth = await authenticateServerRequest(req);
  const headerCompanyId = firstHeaderValue(req.headers["x-company-id"]).trim();
  if (headerCompanyId && (!UUID_PATTERN.test(headerCompanyId) || headerCompanyId !== companyId)) {
    throw new ApiAuthorizationError(403, "FORBIDDEN", "This request cannot target another Hydroqualisense deployment company.");
  }
  const { data: deploymentCompanyId, error: deploymentError } = await auth.supabase.rpc("get_deployment_company_id");
  if (deploymentError || deploymentCompanyId !== companyId) {
    throw new ApiAuthorizationError(deploymentError ? 503 : 403, deploymentError ? "SERVER_AUTH_UNAVAILABLE" : "FORBIDDEN", deploymentError ? "Deployment company authorization is temporarily unavailable." : "Platform maintenance cannot target another Hydroqualisense deployment company.");
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


const EXTRACTION_TIMEOUT_MS = 60_000;
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
      "https://generativelanguage.googleapis.com",
      "wss:",
    ].filter(Boolean).join(" ");
    res.setHeader("Content-Security-Policy", `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; connect-src ${connectSources}`);
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

const publicProspectRateLimit = new Map<string, { windowStartedAt: number; count: number }>();
const PUBLIC_PROSPECT_RATE_WINDOW_MS = 15 * 60_000;
const PUBLIC_PROSPECT_RATE_LIMIT = 5;

function publicProspectAddress(req: express.Request) {
  // Express does not trust forwarded headers by default, so a caller cannot
  // choose a different bucket by sending X-Forwarded-For to this process.
  return String(req.ip || req.socket.remoteAddress || "unknown");
}

function allowPublicProspectRequest(req: express.Request) {
  const now = Date.now();
  if (publicProspectRateLimit.size > 10_000) {
    for (const [key, value] of publicProspectRateLimit) {
      if (now - value.windowStartedAt >= PUBLIC_PROSPECT_RATE_WINDOW_MS) publicProspectRateLimit.delete(key);
    }
  }
  const key = publicProspectAddress(req);
  const current = publicProspectRateLimit.get(key);
  const windowStartedAt = current && now - current.windowStartedAt < PUBLIC_PROSPECT_RATE_WINDOW_MS ? current.windowStartedAt : now;
  const count = current && windowStartedAt === current.windowStartedAt ? current.count + 1 : 1;
  publicProspectRateLimit.set(key, { windowStartedAt, count });
  return count <= PUBLIC_PROSPECT_RATE_LIMIT;
}

function parsePublicProspectJson(req: express.Request, res: express.Response, next: express.NextFunction) {
  express.json({ limit: "32kb", strict: true })(req, res, (error: unknown) => {
    if (!error) return next();
    const status = typeof error === "object" && error && "type" in error && (error as { type?: unknown }).type === "entity.too.large" ? 413 : 400;
    return res.status(status).json({ success: false, error: status === 413 ? "The requirements request is too large." : "The requirements request payload is invalid." });
  });
}

app.post("/api/public/prospects", parsePublicProspectJson, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  if (!allowPublicProspectRequest(req)) {
    res.setHeader("Retry-After", String(Math.ceil(PUBLIC_PROSPECT_RATE_WINDOW_MS / 1000)));
    return res.status(429).json({ success: false, code: "RATE_LIMITED", error: "The public requirements form is temporarily rate limited. Try again later." });
  }

  // A non-empty honeypot is accepted without persistence so automated callers
  // cannot use this endpoint to probe validation or database behavior.
  if (typeof req.body?.website === "string" && req.body.website.trim()) {
    return res.status(202).json({ success: true, data: { accepted: true } });
  }

  const validation = validatePublicProspectSubmission(req.body);
  if (validation.ok === false) return res.status(400).json({ success: false, error: "Please correct the highlighted requirements fields.", fields: validation.fields });

  try {
    const { value } = validation;
    const { data, error } = await publicSupabaseClient().rpc("submit_public_prospect", {
      p_company_name: value.companyName,
      p_contact_name: value.contactName,
      p_contact_email: value.contactEmail,
      p_contact_phone: value.contactPhone,
      p_modules: value.modules,
      p_workforce_scale: value.workforceScale,
      p_project_scale: value.projectScale,
      p_pain_points: value.painPoints,
      p_integration_needs: value.integrationNeeds,
      p_desired_timeline: value.desiredTimeline,
      p_request_type: value.requestType,
      p_consent_confirmed: true,
    });
    if (error || data !== true) return res.status(503).json({ success: false, error: "The public requirements intake is temporarily unavailable. No deployment or account was created." });
    return res.status(201).json({ success: true, data: { accepted: true } });
  } catch {
    return res.status(503).json({ success: false, error: "The public requirements intake is temporarily unavailable. No deployment or account was created." });
  }
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
    // Buyer/customer is optional source evidence for supplier invoices. The
    // deployment company is fixed and is not an extracted posting identity.
    customer: { ...partySchema, nullable: true },
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
    amountDue: { type: Type.NUMBER, nullable: true, description: "Source-stated amount due; preserve separately from gross invoice total" },
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
    monetarySemantics: {
      type: Type.OBJECT,
      properties: {
        unitPriceBasis: { type: Type.STRING, nullable: true, description: "PRE_TAX, TAX_INCLUSIVE, or UNKNOWN for the source-displayed unit price" },
        lineTotalBasis: { type: Type.STRING, nullable: true, description: "PRE_TAX, TAX_INCLUSIVE, or UNKNOWN for source-displayed line amounts" },
        subtotalBasis: { type: Type.STRING, nullable: true, description: "PRE_TAX, TAX_INCLUSIVE, or UNKNOWN for the source subtotal" },
        taxInclusion: { type: Type.STRING, nullable: true, description: "ADDED_TO_TOTAL, INCLUDED_IN_TOTAL, NOT_APPLICABLE, or UNKNOWN" },
        discountIncludedInSubtotal: { type: Type.BOOLEAN, nullable: true, description: "True only when the source clearly includes the invoice discount in subtotal" },
        payableBasis: { type: Type.STRING, nullable: true, description: "GROSS_INVOICE unless the source explicitly identifies a net-after-withholding payable" },
        determination: { type: Type.STRING, nullable: true, description: "EXPLICIT, INFERRED, or UNKNOWN" },
      },
      required: ["unitPriceBasis", "lineTotalBasis", "subtotalBasis", "taxInclusion", "discountIncludedInSubtotal", "payableBasis", "determination"],
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
        currency: { type: Type.NUMBER, nullable: true },
        lineItems: { type: Type.NUMBER, nullable: true },
        subtotal: { type: Type.NUMBER, nullable: true },
        vatAmount: { type: Type.NUMBER, nullable: true },
        grandTotal: { type: Type.NUMBER, nullable: true },
        amountDue: { type: Type.NUMBER, nullable: true },
      },
      required: ["invoiceNumber", "invoiceDate", "dueDate", "vendorName", "vendorTin", "currency", "lineItems", "subtotal", "vatAmount", "grandTotal", "amountDue"],
      nullable: true,
    },
  },
  required: ["documentType", "invoiceSubtype", "invoiceNumber", "invoiceDate", "dueDate", "purchaseOrderNumber", "projectReference", "currency", "currencySymbol", "paymentTerms", "vendor", "shippingAddress", "items", "subtotal", "totalDiscount", "taxBreakdown", "totalTax", "shippingFee", "otherFees", "grandTotal", "amountPaid", "amountDue", "balanceDue", "withholdingTaxRate", "withholdingTaxAmount", "netAmountPayable", "philippineTaxDetails", "monetarySemantics", "notes", "termsAndConditions", "category", "confidenceScore", "fieldConfidence"],
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

function deriveStatus(grandTotal: number | undefined, amountPaid: number | undefined, balanceDue: number | undefined, dueDate?: string) {
  if (grandTotal !== undefined && grandTotal > 0 && balanceDue !== undefined && balanceDue <= 0.01) return "PAID";
  if (amountPaid !== undefined && amountPaid > 0 && balanceDue !== undefined && balanceDue > 0.01) return "PARTIALLY_PAID";
  if (dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) && dueDate < businessDateForTimeZone() && balanceDue > 0.01) return "OVERDUE";
  return "UNPAID";
}

function validateExtractedInvoice(data: any, items: any[]) {
  const issues: any[] = [];
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

  items.forEach((item, index) => {
    if (sourceNumeric(item.quantity) === undefined) issues.push({ id: "missing-item-quantity-" + index, severity: "warning", field: "items." + index + ".quantity", message: "Line " + (index + 1) + " quantity is unresolved." });
    if (sourceNumeric(item.unitPrice) === undefined) issues.push({ id: "missing-item-unit-price-" + index, severity: "warning", field: "items." + index + ".unitPrice", message: "Line " + (index + 1) + " unit price is unresolved." });
    if (sourceNumeric(item.total) === undefined) issues.push({ id: "missing-item-total-" + index, severity: "warning", field: "items." + index + ".total", message: "Line " + (index + 1) + " amount is unresolved." });
  });

  const monetary = reconcileInvoiceMonetarySemantics({ ...data, items });
  issues.push(...monetary.issues);

  const phTax = data.philippineTaxDetails || {};
  const phVatInvoice = Boolean(
    data.invoiceSubtype === "VAT_INVOICE" ||
    phTax.invoiceKind === "VAT_INVOICE" ||
    phTax.sellerRegistration === "VAT" ||
    data.vendor?.taxRegistration === "VAT"
  );
  if (phVatInvoice && explicitInvoiceTaxAmount({ ...data, items }) !== undefined) {
    issues.push({ id: "ph-vat-rate-not-evaluated", severity: "info", field: "philippineTaxDetails.vatAmount", message: "VAT rate consistency was not evaluated because no authoritative VAT rate is configured." });
  }

  return {
    status: (issues.some((issue) => issue.severity === "warning" || issue.severity === "error") ? "REVIEW" : "PASS") as "REVIEW" | "PASS",
    issues,
    calculatedSubtotal: monetary.calculatedSubtotal,
    calculatedTax: monetary.calculatedTax,
    calculatedGrandTotal: monetary.calculatedGrandTotal,
    calculatedBalanceDue: monetary.calculatedBalanceDue,
    monetarySemantics: monetary.semantics,
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

app.get("/api/health", async (_req, res) => {
  const release = releaseMetadataFromEnv(process.env);
  let documentPdfFinalization;
  try {
    documentPdfFinalization = await getDocumentPdfFinalizationHealth(process.env);
  } catch {
    documentPdfFinalization = { status: "UNAVAILABLE", message: DOCUMENT_PDF_UNAVAILABLE_MESSAGE } as const;
  }
  res.json({
    status: "ok",
    product: "Hydroqualisense",
    timestamp: new Date().toISOString(),
    release,
    documentPdfFinalization,
  });
});


function platformCompanyAiPath(req: express.Request) {
  return String(req.params.companyId || "").trim();
}

app.get("/api/deployment/company-ai", async (req, res) => {
  try {
    const auth = await authorizeCompanyRequest(req, "company.settings.read");
    const serverClient = companyAiServerSupabase();
    const data = await loadServerCompanyAiConfig(serverClient, auth.companyId);
    const runtimeCapability = await resolveCompanyAiRuntimeCapability({ supabase: auth.supabase, credentialSupabase: serverClient, companyId: auth.companyId });
    const bootstrapAuthorized = !data.credentialConfigured || data.status === "INVALID"
      ? await canBootstrapDeploymentCompanyAiCredential(serverClient, auth.companyId, auth.user.id, data)
      : false;
    return res.json({ success: true, data: { ...data, bootstrapAuthorized, runtimeCapability } });
  } catch (error) {
    return res.status(apiErrorStatus(error)).json({ success: false, error: apiErrorMessage(error, "Deployment AI configuration could not be loaded safely."), ...apiAiErrorDetails(error) });
  }
});

app.put("/api/deployment/company-ai/gemini/bootstrap", async (req, res) => {
  try {
    const auth = await authorizeCompanyRequest(req, "company.settings.manage");
    const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
    if (!apiKey || apiKey.length > 4096) return res.status(400).json({ success: false, error: "A valid Gemini API key is required." });

    // The authenticated initial Company Admin is only an operator identity for
    // this one-time, exact-deployment bootstrap. The server encrypts the key
    // before any Supabase call and never returns or logs the plaintext.
    const serverClient = companyAiServerSupabase();
    const encrypted = encryptCompanyGeminiCredential(apiKey, auth.companyId);
    const stored = await bootstrapDeploymentCompanyAiCredential(serverClient, auth.companyId, auth.user.id, encrypted, credentialLast4(apiKey));
    invalidateCompanyAiRuntime(auth.companyId);

    if (stored.idempotent || req.body?.validate === false) {
      return res.json({ success: true, data: { ...stored, bootstrap: true, validation: "NOT_RUN" } });
    }

    const tested = await testCompanyAiConnection({
      supabase: serverClient,
      companyId: auth.companyId,
      recordTest: (status) => recordServerCompanyAiTest(serverClient, auth.companyId, status),
    });
    invalidateCompanyAiRuntime(auth.companyId);
    const bootstrapAuthorized = tested.metadata.status === "INVALID"
      ? await canBootstrapDeploymentCompanyAiCredential(serverClient, auth.companyId, auth.user.id, tested.metadata)
      : false;
    return res.json({ success: true, data: { ...tested.metadata, bootstrapAuthorized, bootstrap: true, validation: tested.status, ...(tested.errorCode ? { testErrorCode: tested.errorCode } : {}), ...(tested.reference ? { reference: tested.reference } : {}) } });
  } catch (error) {
    return res.status(apiErrorStatus(error)).json({ success: false, error: apiErrorMessage(error, "The deployment AI credential could not be configured safely."), ...apiAiErrorDetails(error) });
  }
});

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
app.use("/api/document-templates", createDocumentTemplateRouter());
app.use("/api/documents", createStorageRouter());

const smsSendRateLimit = new Map<string, { windowStartedAt: number; count: number }>();
const SMS_RATE_WINDOW_MS = 60_000;
const SMS_RATE_LIMIT = 10;
app.use("/api/messaging/sms/send", (req, res, next) => {
  if (req.method !== "POST") return next();
  const now = Date.now();
  if (smsSendRateLimit.size > 10_000) {
    for (const [key, value] of smsSendRateLimit) if (now - value.windowStartedAt >= SMS_RATE_WINDOW_MS) smsSendRateLimit.delete(key);
  }
  const company = firstHeaderValue(req.headers["x-company-id"]).trim();
  const key = `${String(req.ip || req.socket.remoteAddress || "unknown")}:${company}`;
  const current = smsSendRateLimit.get(key);
  const windowStartedAt = current && now - current.windowStartedAt < SMS_RATE_WINDOW_MS ? current.windowStartedAt : now;
  const count = current && windowStartedAt === current.windowStartedAt ? current.count + 1 : 1;
  smsSendRateLimit.set(key, { windowStartedAt, count });
  if (count > SMS_RATE_LIMIT) return res.status(429).json({ success: false, code: "SMS_RATE_LIMITED", error: "SMS sending is temporarily rate limited. Try again later." });
  return next();
});
app.get("/api/document-delivery-history", async (req, res) => {
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
app.get("/api/messaging/status", async (req, res) => {
  try {
    const auth = await authorizeCompanyRequest(req, "documents.send");
    let email;
    try { email = await checkBrevoEmailProvider(process.env); }
    catch { email = { status: "CONNECTION_PROBLEM", message: "Email provider status could not be checked safely." } as const; }
    let sms;
    try { sms = await checkSmsProviderOverview(process.env); }
    catch { sms = getSmsProviderStatus(process.env); }
    return res.json({ success: true, data: { companyId: auth.companyId, email, sms } });
  } catch (error) {
    const status = error instanceof ApiAuthorizationError ? error.status : 503;
    return res.status(status).json({ success: false, error: error instanceof Error ? error.message : "Messaging provider status is unavailable." });
  }
});

function smsIntentResponse(intent: Record<string, any>, result: { providerId?: string; providerMessageId?: string; providerStatus?: string; status?: string; reconciliationRequired?: boolean }, extras: Record<string, unknown> = {}) {
  return {
    intentId: String(intent.id || ""),
    status: String(result.status || intent.status || "UNKNOWN").toUpperCase(),
    ...(String(result.providerId || intent.provider_id || "") ? { providerId: String(result.providerId || intent.provider_id) } : {}),
    ...(String(result.providerMessageId || intent.provider_message_id || "") ? { providerMessageId: String(result.providerMessageId || intent.provider_message_id) } : {}),
    ...(String(result.providerStatus || intent.provider_status || "") ? { providerStatus: String(result.providerStatus || intent.provider_status) } : {}),
    reconciliationRequired: result.reconciliationRequired === true || intent.reconciliation_required === true || String(result.status || intent.status || "").toUpperCase() === "UNKNOWN",
    ...extras,
  };
}

function smsRouteError(error: unknown, fallback: string) {
  if (error instanceof ApiAuthorizationError) return { status: error.status, code: error.code, message: error.message };
  const providerCode = error && typeof error === "object" && "code" in error ? String((error as Record<string, unknown>).code || "") : "";
  if (providerCode === "23514" || providerCode === "22023" || providerCode === "22P02") return { status: 400, code: "SMS_REQUEST_INVALID", message: "The SMS request is invalid." };
  if (providerCode === "42501") return { status: 403, code: "FORBIDDEN", message: "You do not have permission for this company messaging operation." };
  return { status: 503, code: "SMS_SEND_RECONCILE_REQUIRED", message: fallback };
}

app.post("/api/messaging/sms/send", async (req, res) => {
  let auth: CompanyRequestAuthorization | null = null;
  let sendIntentId = "";
  try {
    auth = await authorizeCompanyRequest(req, "documents.send");
    const contentLength = Number(req.headers["content-length"] || 0);
    if (Number.isFinite(contentLength) && contentLength > 32 * 1024) return res.status(413).json({ success: false, code: "SMS_REQUEST_TOO_LARGE", error: "The SMS request is too large." });
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) return res.status(400).json({ success: false, code: "SMS_REQUEST_INVALID", error: "The SMS request payload is invalid." });
    if (JSON.stringify(req.body).length > 32 * 1024) return res.status(413).json({ success: false, code: "SMS_REQUEST_TOO_LARGE", error: "The SMS request is too large." });
    if (req.body?.confirmed !== true) return res.status(400).json({ success: false, code: "SMS_HUMAN_CONFIRMATION_REQUIRED", error: "Review the SMS and confirm it before sending." });
    let destination: string;
    try { destination = normalizePhilippineMobileNumber(req.body?.destination); }
    catch (error) { return res.status(400).json({ success: false, code: "SMS_DESTINATION_INVALID", error: error instanceof Error ? error.message : "A valid Philippine mobile recipient is required." }); }
    const message = typeof req.body?.message === "string" ? req.body.message.replace(/[\u0000]/g, "").trim() : "";
    if (!message) return res.status(400).json({ success: false, code: "SMS_MESSAGE_REQUIRED", error: "A non-empty SMS message is required." });
    if (message.length > SMS_MAX_MESSAGE_LENGTH) return res.status(413).json({ success: false, code: "SMS_MESSAGE_TOO_LONG", error: `SMS messages are limited to ${SMS_MAX_MESSAGE_LENGTH} characters.` });
    const idempotencyKey = typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey.trim() : "";
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(idempotencyKey)) return res.status(400).json({ success: false, code: "SMS_IDEMPOTENCY_REQUIRED", error: "A valid SMS send identity is required." });
    const provider = resolveSmsProvider(process.env);
    if (!provider) return res.status(503).json({ success: false, code: "SMS_NOT_CONFIGURED", error: "No complete SMS provider configuration is available on this deployment." });
    const messageBodySha256 = createHash("sha256").update(message, "utf8").digest("hex");
    const claimResult = await auth.supabase.rpc("claim_sms_send_intent", {
      p_provider_id: provider.id,
      p_destination: destination,
      p_idempotency_key: idempotencyKey,
      p_message_body_sha256: messageBodySha256,
    });
    if (claimResult.error) throw claimResult.error;
    const claim = rpcRow(claimResult.data);
    const intent = claim?.intent && typeof claim.intent === "object" ? claim.intent as Record<string, any> : null;
    if (!intent?.id) throw new Error("The SMS delivery intent was not returned.");
    sendIntentId = String(intent.id);
    if (claim?.idempotent === true) return res.json({ success: true, data: smsIntentResponse(intent, { status: intent.status }, { idempotent: true }) });
    if (claim?.claimed !== true) return res.status(409).json({ success: false, code: "SMS_SEND_RECONCILE_REQUIRED", error: "This SMS send is already in progress or requires reconciliation. Check Sent / Delivery History before retrying." });

    const providerResult = await provider.send({ destination, message, idempotencyKey });
    const completion = await auth.supabase.rpc("complete_sms_delivery_intent", {
      p_intent_id: sendIntentId,
      p_status: providerResult.status,
      p_provider_message_id: providerResult.providerMessageId || null,
      p_provider_status: providerResult.providerStatus || null,
      p_error_message: providerResult.status === "FAILED" ? providerResult.safeMessage : null,
      p_reconciliation_required: providerResult.reconciliationRequired,
    });
    if (completion.error) return res.status(503).json({ success: false, code: "SMS_SEND_RECONCILE_REQUIRED", error: "The provider response was received, but durable SMS history could not be completed. Do not resend until history is reconciled." });
    const completionRow = rpcRow(completion.data);
    const completedIntent = completionRow?.intent && typeof completionRow.intent === "object" ? completionRow.intent as Record<string, any> : intent;
    const data = smsIntentResponse(completedIntent, providerResult);
    if (providerResult.reconciliationRequired || providerResult.status === "UNKNOWN") return res.status(503).json({ success: false, code: "SMS_SEND_RECONCILE_REQUIRED", error: providerResult.safeMessage, data });
    if (providerResult.status === "FAILED") return res.status(502).json({ success: false, code: "SMS_SEND_FAILED", error: providerResult.safeMessage, data });
    return res.status(providerResult.status === "ACCEPTED" || providerResult.status === "PENDING" ? 202 : 200).json({ success: true, data });
  } catch (error) {
    const mapped = smsRouteError(error, sendIntentId ? "The SMS send could not be completed safely. Check Sent / Delivery History before retrying." : "The SMS could not be sent safely.");
    return res.status(mapped.status).json({ success: false, code: mapped.code, error: mapped.message });
  }
});

app.post("/api/messaging/sms/reconcile", async (req, res) => {
  try {
    const auth = await authorizeCompanyRequest(req, "documents.send");
    const intentId = String(req.body?.intentId || "").trim();
    if (!UUID_PATTERN.test(intentId)) return res.status(400).json({ success: false, code: "SMS_INTENT_INVALID", error: "A valid SMS delivery intent is required." });
    const { data: intent, error: intentError } = await auth.supabase
      .from("document_send_intents")
      .select("id,delivery_channel,delivery_kind,provider_id,provider_message_id,status")
      .eq("company_id", auth.companyId)
      .eq("id", intentId)
      .maybeSingle();
    if (intentError) throw intentError;
    if (!intent || intent.delivery_channel !== "SMS" || intent.delivery_kind !== "GENERAL_SMS") return res.status(404).json({ success: false, code: "SMS_INTENT_NOT_FOUND", error: "The SMS delivery history entry was not found." });
    const provider = resolveSmsProvider(process.env);
    if (!provider || String(intent.provider_id || "") !== provider.id) return res.status(503).json({ success: false, code: "SMS_SEND_RECONCILE_REQUIRED", error: "The original SMS provider configuration is not available for reconciliation." });
    const providerMessageId = String(intent.provider_message_id || "").trim();
    if (!providerMessageId) return res.status(409).json({ success: false, code: "SMS_SEND_RECONCILE_REQUIRED", error: "This SMS has no provider reference to reconcile safely." });
    const providerResult = await provider.lookupStatus(providerMessageId);
    const completion = await auth.supabase.rpc("complete_sms_delivery_intent", {
      p_intent_id: intentId,
      p_status: providerResult.status,
      p_provider_message_id: providerResult.providerMessageId || providerMessageId,
      p_provider_status: providerResult.providerStatus || null,
      p_error_message: providerResult.status === "FAILED" ? providerResult.safeMessage : null,
      p_reconciliation_required: providerResult.reconciliationRequired,
    });
    if (completion.error) return res.status(503).json({ success: false, code: "SMS_SEND_RECONCILE_REQUIRED", error: "The provider status was received, but durable SMS history could not be updated safely." });
    const completionRow = rpcRow(completion.data);
    const updatedIntent = completionRow?.intent && typeof completionRow.intent === "object" ? completionRow.intent as Record<string, any> : intent as Record<string, any>;
    const data = smsIntentResponse(updatedIntent, providerResult);
    if (providerResult.reconciliationRequired || providerResult.status === "UNKNOWN") return res.status(503).json({ success: false, code: "SMS_SEND_RECONCILE_REQUIRED", error: providerResult.safeMessage, data });
    return res.json({ success: true, data });
  } catch (error) {
    const mapped = smsRouteError(error, "SMS status could not be reconciled safely.");
    return res.status(mapped.status).json({ success: false, code: mapped.code, error: mapped.message });
  }
});
app.get("/api/storage/health", async (req, res) => {
  try {
    const auth = await authorizeCompanyRequest(req, "storage.read");
    return res.json({ success: true, data: { companyId: auth.companyId, ...getStorageHealth(process.env) } });
  } catch (error) {
    return res.status(authorizationErrorStatus(error)).json({ success: false, error: authorizationErrorMessage(error, "Storage health is unavailable.") });
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
  const phTax = normalizeTaxDetails(extracted?.philippineTaxDetails);
  const extractedSemantics = extracted?.monetarySemantics || extracted?.financialSemantics;
  const preliminary = { ...extracted, philippineTaxDetails: phTax, financialSemantics: extractedSemantics };
  const preliminarySemantics = resolveInvoiceMonetarySemantics(preliminary);
  const items = rawItems.map((item: any, index: number) => {
    const quantity = sourceNumeric(item?.quantity);
    const unitPrice = sourceNumeric(item?.unitPrice);
    const discount = sourceNumeric(item?.discount);
    const sourceTotal = sourceNumeric(item?.total);
    // A missing line amount is derived only when the source basis is known.
    // Otherwise preserve UNKNOWN: quantity × unit price can be incomparable
    // with a displayed tax-inclusive or post-discount amount.
    const deterministicTotal = quantity !== undefined && unitPrice !== undefined && discount !== undefined && preliminarySemantics.lineTotalBasis !== "UNKNOWN"
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
  const validationInput = { ...preliminary, items };
  const validation = validateExtractedInvoice(validationInput, items);
  const sourceSubtotal = sourceNumeric(extracted?.subtotal);
  const subtotal = sourceSubtotal ?? validation.calculatedSubtotal ?? null;
  const sourceTotalTax = sourceNumeric(extracted?.totalTax);
  const sourceVatAmount = sourceNumeric(phTax?.vatAmount);
  const totalTax = sourceTotalTax ?? sourceVatAmount ?? validation.calculatedTax ?? null;
  const sourceGrandTotal = sourceNumeric(extracted?.grandTotal);
  const grandTotal = sourceGrandTotal ?? validation.calculatedGrandTotal ?? null;
  const sourceAmountPaid = sourceNumeric(extracted?.amountPaid);
  const amountPaid = sourceAmountPaid ?? null;
  const sourceAmountDue = sourceNumeric(extracted?.amountDue);
  const sourceBalanceDue = sourceNumeric(extracted?.balanceDue);
  const calculatedBalanceDue = grandTotal !== null && amountPaid !== null ? Math.max(0, grandTotal - amountPaid) : null;
  const balanceDue = sourceBalanceDue ?? calculatedBalanceDue;
  const finalSemantics = resolveInvoiceMonetarySemantics({
    ...validationInput,
    subtotal,
    totalTax,
    grandTotal,
    amountDue: sourceAmountDue,
    balanceDue,
    financialSemantics: validation.monetarySemantics || preliminarySemantics,
  });
  const finalValidation = validateExtractedInvoice({
    ...validationInput,
    subtotal,
    totalTax,
    grandTotal,
    amountDue: sourceAmountDue,
    balanceDue,
    financialSemantics: finalSemantics,
  }, items);
  financialFieldStatus.subtotal = sourceSubtotal !== undefined ? "KNOWN" : validation.calculatedSubtotal !== undefined ? "CALCULATED" : "UNKNOWN";
  financialFieldStatus.totalTax = sourceTotalTax !== undefined || sourceVatAmount !== undefined ? "KNOWN" : validation.calculatedTax !== undefined ? "CALCULATED" : "UNKNOWN";
  financialFieldStatus.grandTotal = sourceGrandTotal !== undefined ? "KNOWN" : validation.calculatedGrandTotal !== undefined ? "CALCULATED" : "UNKNOWN";
  financialFieldStatus.amountPaid = sourceAmountPaid !== undefined ? "KNOWN" : "UNKNOWN";
  financialFieldStatus.amountDue = sourceAmountDue !== undefined ? "KNOWN" : "UNKNOWN";
  financialFieldStatus.balanceDue = sourceBalanceDue !== undefined ? "KNOWN" : calculatedBalanceDue !== null ? "CALCULATED" : "UNKNOWN";
  financialFieldStatus.totalDiscount = sourceNumeric(extracted?.totalDiscount) === undefined ? "UNKNOWN" : "KNOWN";
  financialFieldStatus.shippingFee = sourceNumeric(extracted?.shippingFee) === undefined ? "UNKNOWN" : "KNOWN";
  financialFieldStatus.otherFees = sourceNumeric(extracted?.otherFees) === undefined ? "UNKNOWN" : "KNOWN";
  const sourceWithholdingTax = sourceNumeric(extracted?.withholdingTaxAmount) ?? sourceNumeric(phTax?.withholdingTaxAmount);
  const sourceNetAmountPayable = sourceNumeric(extracted?.netAmountPayable) ?? sourceNumeric(phTax?.netAmountPayable);
  financialFieldStatus.withholdingTaxAmount = sourceWithholdingTax === undefined ? "UNKNOWN" : "KNOWN";
  financialFieldStatus.netAmountPayable = sourceNetAmountPayable !== undefined ? "KNOWN" : sourceWithholdingTax !== undefined && grandTotal !== null ? "CALCULATED" : "UNKNOWN";
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
    status: deriveStatus(grandTotal ?? undefined, amountPaid ?? undefined, balanceDue ?? undefined, extracted?.dueDate),
    vendor: compactParty(extracted?.vendor),
    customer: extracted?.customer ? compactParty(extracted.customer) : undefined,
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
    amountDue: sourceAmountDue ?? null,
    balanceDue,
    withholdingTaxRate: sourceNumeric(extracted?.withholdingTaxRate) ?? null,
    withholdingTaxAmount: sourceWithholdingTax ?? null,
    netAmountPayable: sourceNetAmountPayable ?? null,
    philippineTaxDetails: phTax,
    notes: extracted?.notes || "",
    termsAndConditions: extracted?.termsAndConditions || "",
    category: extracted?.category || "",
    extractedAt: new Date().toISOString(),
    modelUsed,
    confidenceScore,
    fieldConfidence: extracted?.fieldConfidence || {},
    financialFieldStatus,
    financialSemantics: finalSemantics,
    validation: finalValidation,
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
- For supplier identity, inspect FROM, SELLER, registered/trade-name, and supplier TIN sections. Buyer/customer identity is optional source evidence and is not a retry target or posting blocker.
- For totals, inspect the financial summary near the bottom, including Subtotal, VATable Sales, VAT Amount, Zero-Rated Sales, VAT-Exempt Sales, Discount, Total Amount, Amount Due, Amount Paid, and Balance Due. Preserve whether displayed line amounts/subtotal are pre-tax or VAT-inclusive.
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
    let aiRuntime = await resolveCompanyAiRuntime({ supabase: auth.supabase, companyId: auth.companyId });
    await claimAiRequest(auth.supabase, auth.companyId, "INVOICE_EXTRACTION", { maxRequests: 20, maxConcurrency: 2 });
    aiBudgetClaimed = true;
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
12. For Philippine fields look for Registered Name, Business/Trade Name, VAT REG TIN, TIN, Branch Code, Registered Business Address, invoice/serial number, transaction date, description/nature of service, quantity, unit, unit price/cost, amount, VATable Sales, VAT Amount, VAT on Local Sales, Zero-Rated Sales, VAT-Exempt Sales, Discount, Total Amount, Amount Paid, Amount Due, Balance Due, ATP, OCN, Permit to Use/BIR Permit, and approved invoice serial ranges. These are optional for foreign invoices. This supplier workflow is buyer-fixed to the deployment company: buyer/customer identity is optional source evidence only and must never be required for extraction or posting.
13. Preserve each source-displayed line total exactly when visible. Do not replace it with quantity × unit price. A source line may include VAT, discounts, or source rounding. Capture quantity, unit price, line discount, tax amount, and source total independently.
14. Recognize ₱, PHP, Php, PhP, and Philippine Peso as PHP. Preserve explicit USD, US$, $, EUR, SGD, JPY, and other foreign currencies. Never infer PHP only from a Philippine address. If currency is unclear, return null and lower confidence.
15. Keep withholding tax/EWT/CWT separate from VAT. Never subtract withholding from grandTotal; capture a source-stated netAmountPayable or amountDue separately. Do not infer a withholding rate.
16. Set monetarySemantics.unitPriceBasis, lineTotalBasis, and subtotalBasis to PRE_TAX or TAX_INCLUSIVE only when the source labels or unambiguous totals establish each basis. They may differ when a source shows a pre-tax unit price and a tax-inclusive line amount. Set taxInclusion to ADDED_TO_TOTAL only when tax is added to the subtotal/base, INCLUDED_IN_TOTAL when the gross total already includes it, NOT_APPLICABLE for explicit zero/non-VAT treatment, and UNKNOWN otherwise. Set discountIncludedInSubtotal only when the source makes that relationship clear. Do not invent a VAT rate or a tax policy.
17. subtotal is the source-labeled subtotal in its recorded basis. Do not substitute VATable Sales, the sum of lines, or grandTotal for a missing source subtotal; the application may record a calculated value separately when it is deterministic. grandTotal is the source-stated gross invoice total. amountDue is source-stated due amount and may differ from gross because of payment or withholding.
18. For VAT-inclusive wording, set philippineTaxDetails.vatInclusive=true only when clearly stated; otherwise leave it null rather than guessing.
19. Return every schema property, using null for an unknown scalar or object and [] for an unknown array. Return only JSON matching the schema.`;

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
    let aiRuntime = await resolveCompanyAiRuntime({ supabase: auth.supabase, companyId: auth.companyId });
    await claimAiRequest(auth.supabase, auth.companyId, "EXPENSE_EXTRACTION", { maxRequests: 30, maxConcurrency: 2 });
    aiBudgetClaimed = true;
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
5. Category MUST be selected from the standard Hydroqualisense categories: Fuel, Transportation, Meals, Materials, Equipment Rental, Equipment, Utilities, Communication, Office / Site Supplies, Permits, Professional Fees, Subcontractor, Miscellaneous.
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
      notes: `Staged from email document AI extraction: ${emailContext?.subject || fileName || "Receipt"}${payee ? ` from ${payee}` : ""}`,
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




interface NormalizedEmailRecipient {
  email: string;
  name?: string;
}

function normalizedEmailList(value: unknown, label: string): NormalizedEmailRecipient[] {
  const raw: unknown[] = Array.isArray(value) ? value : value === undefined || value === null ? [] : String(value).split(",");
  const present = raw.filter((item) => {
    const row = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : { email: item };
    return String(row.email || "").trim().length > 0;
  });
  const values = present.map((item) => {
    const row = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : { email: item };
    const email = String(row.email || "").trim().toLowerCase();
    const name = String(row.name || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120);
    if (!/^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(email) || email.length > 320) {
      throw new ApiAuthorizationError(400, "COMPANY_REQUIRED", `${label} contains an invalid email address.`);
    }
    return { email, ...(name ? { name } : {}) };
  }).filter((item) => item.email);
  if (values.length > 20) throw new ApiAuthorizationError(400, "COMPANY_REQUIRED", `${label} has too many recipients.`);
  return values;
}

function safeMailHeader(value: unknown, fallback: string) {
  const normalized = String(value || fallback).replace(/[\r\n]+/g, " ").trim();
  return normalized.slice(0, 500) || fallback;
}

type IssuedDocumentType = "PURCHASE_ORDER" | "CLIENT_INVOICE";
type DocumentAttachmentSource = "COMPANY_TEMPLATE_PDF" | "PROGRAMMATIC_PDF_FALLBACK";

function issuedDocumentType(value: unknown): IssuedDocumentType | null {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized === "PURCHASE_ORDER" || normalized === "CLIENT_INVOICE" ? normalized : null;
}

function documentReadPermission(documentType: IssuedDocumentType): "procurement.read" | "projects.read" {
  return documentType === "PURCHASE_ORDER" ? "procurement.read" : "projects.read";
}

async function assertIssuedDocumentDeliveryLifecycle(
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

function documentSendResponseData(intent: Record<string, any>, extras: Record<string, unknown> = {}) {
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

async function renderTrustedIssuedPdf(row: { id: string; document_type: string; document_id: string; document_number: string; template_version: string; snapshot: unknown }, documentType: "PURCHASE_ORDER" | "CLIENT_INVOICE") {
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

function emailRouteError(error: unknown, fallback: string) {
  if (error instanceof ApiAuthorizationError) return { status: error.status, code: error.code, message: error.message };
  const providerCode = error && typeof error === "object" && "code" in error ? String((error as Record<string, unknown>).code || "") : "";
  if (providerCode === "23514" || providerCode === "22023" || providerCode === "22P02") return { status: 400, code: "EMAIL_REQUEST_INVALID", message: "The email request is invalid." };
  if (providerCode === "42501") return { status: 403, code: "FORBIDDEN", message: "You do not have permission for this company email operation." };
  return { status: 503, code: "EMAIL_SEND_RECONCILE_REQUIRED", message: fallback };
}

app.post("/api/messaging/email/send", async (req, res) => {
  let auth: CompanyRequestAuthorization | null = null;
  let sendIntentId = "";
  let intentStateCompleted = false;
  try {
    auth = await authorizeCompanyRequest(req, "documents.send");
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) return res.status(400).json({ success: false, code: "EMAIL_REQUEST_INVALID", error: "The email request payload is invalid." });
    if (req.body.confirmed !== true) return res.status(400).json({ success: false, code: "EMAIL_HUMAN_CONFIRMATION_REQUIRED", error: "Review the email and confirm it before sending." });
    const requestedType = String(req.body.documentType || "").trim().toUpperCase();
    const documentType = issuedDocumentType(requestedType);
    const generalEmail = requestedType === "GENERAL_EMAIL";
    if (!documentType && !generalEmail) return res.status(400).json({ success: false, code: "EMAIL_REQUEST_INVALID", error: "A supported email or issued document type is required." });
    const documentId = String(req.body.documentId || "").trim();
    const snapshotId = String(req.body.snapshotId || "").trim();
    let snapshot: { id: string; document_type: string; document_id: string; document_number: string; template_version: string; template_version_id?: string | null; template_sha256?: string | null; snapshot: unknown } | null = null;
    if (documentType) {
      if (!UUID_PATTERN.test(documentId) || !UUID_PATTERN.test(snapshotId)) return res.status(400).json({ success: false, code: "EMAIL_REQUEST_INVALID", error: "An issued document snapshot is required before sending." });
      const { data: allowed, error: permissionError } = await auth.supabase.rpc("has_company_permission", { p_company_id: auth.companyId, p_permission_key: documentReadPermission(documentType) });
      if (permissionError || allowed !== true) throw new ApiAuthorizationError(403, "FORBIDDEN", "You do not have permission to send this document type.");
      await assertIssuedDocumentDeliveryLifecycle(auth, documentType, documentId);
      const { data: loadedSnapshot, error: snapshotError } = await auth.supabase
        .from("issued_document_snapshots")
        .select("id,document_type,document_id,document_number,template_version,template_version_id,template_sha256,snapshot")
        .eq("company_id", auth.companyId)
        .eq("id", snapshotId)
        .eq("document_type", documentType)
        .eq("document_id", documentId)
        .maybeSingle();
      if (snapshotError) throw snapshotError;
      if (!loadedSnapshot) throw new ApiAuthorizationError(409, "COMPANY_REQUIRED", "The issued document snapshot is unavailable. Generate the document again before sending.");
      snapshot = loadedSnapshot as typeof snapshot;
    } else if (documentId || snapshotId) {
      throw new ApiAuthorizationError(400, "COMPANY_REQUIRED", "An ordinary email cannot include issued-document identifiers.");
    }

    const recipients = normalizedEmailList(req.body.to, "To");
    const cc = normalizedEmailList(req.body.cc, "CC");
    if (!recipients.length) throw new ApiAuthorizationError(400, "COMPANY_REQUIRED", "At least one To recipient is required.");
    const subject = safeMailHeader(req.body.subject, documentType && snapshot ? (documentType === "PURCHASE_ORDER" ? "Purchase Order " : "Client Invoice ") + snapshot.document_number : "New message");
    const message = typeof req.body.message === "string" ? req.body.message.replace(/[\u0000]/g, "").trim().slice(0, 20_000) : "";
    if (!message) throw new ApiAuthorizationError(400, "COMPANY_REQUIRED", "A message body is required.");
    const attachmentName = documentType && snapshot
      ? safeMailHeader(req.body.attachmentName, String(snapshot.document_number) + ".pdf").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 180) || String(snapshot.document_number) + ".pdf"
      : undefined;
    let attachmentSource: DocumentAttachmentSource | "NONE" = "NONE";
    let pdfBytes: Buffer | undefined;
    if (documentType && snapshot) {
      const templatePdf = await finalizeIssuedDocumentTemplatePdfForDelivery(
        { accessToken: auth.accessToken, companyId: auth.companyId, supabase: auth.supabase, user: auth.user },
        {},
        { snapshotId, documentType, documentId },
      );
      attachmentSource = templatePdf ? "COMPANY_TEMPLATE_PDF" : "PROGRAMMATIC_PDF_FALLBACK";
      pdfBytes = templatePdf ? Buffer.from(templatePdf.bytes) : await renderTrustedIssuedPdf(snapshot, documentType);
    }

    const provider = createBrevoEmailProvider(process.env);
    if (!provider) return res.status(503).json({ success: false, code: "EMAIL_NOT_CONFIGURED", error: "Brevo email is not configured on this deployment." });
    const providerStatus = await provider.checkStatus();
    if (providerStatus.status !== "READY") {
      const code = providerStatus.status === "SENDER_SETUP_REQUIRED" ? "EMAIL_SENDER_SETUP_REQUIRED" : providerStatus.status === "NOT_CONFIGURED" ? "EMAIL_NOT_CONFIGURED" : "EMAIL_PROVIDER_UNAVAILABLE";
      return res.status(503).json({ success: false, code, error: providerStatus.message });
    }

    const trustedSha256 = pdfBytes ? createHash("sha256").update(pdfBytes).digest("hex") : null;
    const messageBodySha256 = createHash("sha256").update(message, "utf8").digest("hex");
    const requestedKey = String(req.body.idempotencyKey || "").trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(requestedKey)) throw new ApiAuthorizationError(400, "COMPANY_REQUIRED", "A valid email send identity is required.");
    const claimResult = await auth.supabase.rpc("claim_document_send_intent", {
      p_snapshot_id: snapshotId || null,
      p_document_type: documentType || "GENERAL_EMAIL",
      p_document_id: documentId || null,
      p_idempotency_key: requestedKey,
      p_trusted_sha256: trustedSha256,
      p_recipients: recipients.map((item) => item.email),
      p_cc: cc.map((item) => item.email),
      p_subject: subject,
      p_attachment_name: attachmentName || null,
      p_message_body_sha256: messageBodySha256,
    });
    if (claimResult.error) throw claimResult.error;
    const claim = rpcRow(claimResult.data);
    const intent = claim?.intent && typeof claim.intent === "object" ? claim.intent as Record<string, any> : null;
    if (!intent?.id) throw new Error("The email delivery intent was not returned.");
    if (String(intent.attachment_source || "").toUpperCase() !== attachmentSource) throw new ApiAuthorizationError(409, "COMPANY_REQUIRED", "The issued PDF provenance changed while preparing this send. Check delivery history before retrying.");
    if (claim?.idempotent === true) return res.json({ success: true, data: documentSendResponseData(intent, { status: intent.status, idempotent: true }) });
    if (claim?.claimed !== true) return res.status(409).json({ success: false, code: "EMAIL_SEND_RECONCILE_REQUIRED", error: "This email send is already in progress or requires reconciliation. Check Sent / Delivery History before retrying." });
    sendIntentId = String(intent.id);

    const providerResult = await provider.send({
      to: recipients,
      cc,
      subject,
      textContent: message,
      ...(pdfBytes && attachmentName ? { attachment: { name: attachmentName, contentBase64: pdfBytes.toString("base64") } } : {}),
      idempotencyKey: requestedKey,
    });
    const completion = await auth.supabase.rpc("complete_email_delivery_intent", {
      p_intent_id: sendIntentId,
      p_status: providerResult.status,
      p_provider_message_id: providerResult.providerMessageId || null,
      p_provider_status: providerResult.providerStatus || null,
      p_error_message: providerResult.status === "FAILED" ? providerResult.safeMessage : null,
      p_reconciliation_required: providerResult.reconciliationRequired,
    });
    if (completion.error) return res.status(503).json({ success: false, code: "EMAIL_SEND_RECONCILE_REQUIRED", error: "The provider response was received, but durable email history could not be completed. Do not resend until history is reconciled." });
    intentStateCompleted = true;
    const completedRow = rpcRow(completion.data);
    const completedIntent = completedRow?.intent && typeof completedRow.intent === "object" ? completedRow.intent as Record<string, any> : intent;
    const data = documentSendResponseData(completedIntent, {
      status: providerResult.status,
      providerId: providerResult.providerId,
      providerMessageId: providerResult.providerMessageId,
      providerStatus: providerResult.providerStatus,
      reconciliationRequired: providerResult.reconciliationRequired,
      idempotent: false,
    });
    if (providerResult.status === "UNKNOWN" || providerResult.reconciliationRequired) return res.status(503).json({ success: false, code: "EMAIL_SEND_RECONCILE_REQUIRED", error: providerResult.safeMessage, data });
    if (providerResult.status === "FAILED") return res.status(502).json({ success: false, code: "EMAIL_SEND_FAILED", error: providerResult.safeMessage, data });
    return res.status(202).json({ success: true, data });
  } catch (error) {
    if (sendIntentId && auth && !intentStateCompleted) {
      const completion = await auth.supabase.rpc("complete_email_delivery_intent", {
        p_intent_id: sendIntentId,
        p_status: "UNKNOWN",
        p_provider_status: "unhandled-error",
        p_error_message: "Email delivery could not be confirmed.",
        p_reconciliation_required: true,
      });
      if (completion.error) return res.status(503).json({ success: false, code: "EMAIL_SEND_RECONCILE_REQUIRED", error: "The email send could not be reconciled safely. Check Sent / Delivery History before retrying." });
    }
    const mapped = emailRouteError(error, sendIntentId ? "The email send could not be completed safely. Check Sent / Delivery History before retrying." : "The email could not be sent safely.");
    return res.status(mapped.status).json({ success: false, code: mapped.code, error: mapped.message });
  }
});

app.get("/api/issued-documents/:documentType/:documentId/pdf", async (req, res) => {
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
