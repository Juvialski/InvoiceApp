import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { randomUUID } from "crypto";
import type { InvoiceData } from "./src/types.ts";
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
const PRIMARY_MODEL = "gemini-3.5-flash-lite";
const ACCURACY_MODEL = "gemini-3.7-flash";
const EXTRACTION_TIMEOUT_MS = 60_000;

function selectModel(requestedModel?: unknown) {
  return requestedModel === ACCURACY_MODEL ? ACCURACY_MODEL : PRIMARY_MODEL;
}

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured in server environment.");
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });
}

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

function numeric(value: any, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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
    const expected = roundMoney(numeric(item.quantity) * numeric(item.unitPrice) - numeric(item.discount));
    if (Math.abs(expected - numeric(item.total)) > 0.05) {
      issues.push({
        id: `item-total-${index}`,
        severity: "warning",
        field: `items.${index}.total`,
        message: `Line ${index + 1} total does not match quantity × unit price − discount.`,
        expected,
        actual: numeric(item.total),
      });
    }
  });
  const calculatedSubtotal = roundMoney(items.reduce((sum, item) => sum + numeric(item.total), 0));
  const subtotal = data.subtotal === undefined ? calculatedSubtotal : numeric(data.subtotal);
  if (items.length && Math.abs(calculatedSubtotal - subtotal) > 0.05) {
    issues.push({ id: "subtotal-mismatch", severity: "warning", field: "subtotal", message: "Subtotal does not match extracted line items.", expected: calculatedSubtotal, actual: subtotal });
  }
  const calculatedGrandTotal = roundMoney(subtotal - numeric(data.totalDiscount) + numeric(data.totalTax) + numeric(data.shippingFee) + numeric(data.otherFees));
  const grandTotal = numeric(data.grandTotal, calculatedGrandTotal);
  if (grandTotal > 0 && Math.abs(calculatedGrandTotal - grandTotal) > 0.05) {
    issues.push({ id: "grand-total-mismatch", severity: "warning", field: "grandTotal", message: "Grand total does not reconcile with extracted components.", expected: calculatedGrandTotal, actual: grandTotal });
  }
  const calculatedBalanceDue = roundMoney(Math.max(0, grandTotal - numeric(data.amountPaid)));
  if (data.balanceDue !== undefined && Math.abs(calculatedBalanceDue - numeric(data.balanceDue)) > 0.05) {
    issues.push({ id: "balance-mismatch", severity: "warning", field: "balanceDue", message: "Balance due does not match grand total minus amount paid.", expected: calculatedBalanceDue, actual: numeric(data.balanceDue) });
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
  if (phVatInvoice && phTax.vatableSales !== undefined && (phTax.vatAmount !== undefined || data.totalTax !== undefined)) {
    const expectedVat = roundMoney(numeric(phTax.vatableSales) * 0.12);
    const documentVat = phTax.vatAmount === undefined ? numeric(data.totalTax) : numeric(phTax.vatAmount);
    if (Math.abs(expectedVat - documentVat) > 0.05) {
      issues.push({ id: "ph-vat-rate-mismatch", severity: "warning", field: "philippineTaxDetails.vatAmount", message: "Philippine VAT does not reconcile to 12% of VATable Sales.", expected: expectedVat, actual: documentVat });
    }
  }

  return {
    status: (issues.length ? "REVIEW" : "PASS") as "REVIEW" | "PASS",
    issues,
    calculatedSubtotal,
    calculatedGrandTotal,
    calculatedBalanceDue,
  };
}

async function generateContentWithTimeout(ai: GoogleGenAI, model: string, contents: any, config: any) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS);
  try {
    return await ai.models.generateContent({ model, contents, config: { ...config, abortSignal: controller.signal } });
  } finally {
    clearTimeout(timeout);
  }
}

async function generateStructured(ai: GoogleGenAI, requestedModel: unknown, contents: any, systemInstruction: string, responseSchema: any) {
  const primary = selectModel(requestedModel);
  try {
    const response = await generateContentWithTimeout(ai, primary, contents, { systemInstruction, responseMimeType: "application/json", responseSchema });
    return { response, modelUsed: primary };
  } catch (error: any) {
    if (primary === ACCURACY_MODEL) throw error;
    console.warn(`${primary} failed; retrying with ${ACCURACY_MODEL}:`, error?.message);
    const response = await generateContentWithTimeout(ai, ACCURACY_MODEL, contents, { systemInstruction, responseMimeType: "application/json", responseSchema });
    return { response, modelUsed: ACCURACY_MODEL };
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", primaryModel: PRIMARY_MODEL, accuracyModel: ACCURACY_MODEL, timestamp: new Date().toISOString() });
});

app.post("/api/classify-email", async (req, res) => {
  try {
    const { sender = "", subject = "", body = "", attachmentNames = [], model = PRIMARY_MODEL } = req.body || {};
    if (!subject && !body && !attachmentNames.length) return res.status(400).json({ success: false, error: "Email content is required." });
    const ai = getGeminiClient();
    const prompt = `Classify whether this email is related to an invoice or adjacent financial document. Use the email subject, sender, body, and attachment names. Do not assume an attachment is an invoice only because it is a PDF. Recognize Philippine terms including invoice, sales invoice, service invoice, VAT invoice, billing, statement of account, SOA, BIR, VAT, TIN, and amount due. Treat "Official Receipt", "SOA", and "Billing Statement" as candidate finance documents, not automatically as a principal invoice. For current Philippine workflow, an Official Receipt may be RECEIPT or SUPPLEMENTARY_DOCUMENT; preserve uncertainty and route it to human review.\n\nSender: ${sender}\nSubject: ${subject}\nAttachments: ${attachmentNames.join(", ") || "None"}\n\nBody:\n${body}`;
    const { response, modelUsed } = await generateStructured(
      ai,
      model,
      { parts: [{ text: prompt }] },
      "You classify finance emails for an invoice operations workspace. Return conservative structured JSON. Never invent a legal conclusion from a title alone. Keep documentType broad and use invoiceSubtype only when the source supports it. A receipt is not automatically an invoice.",
      emailClassificationSchema
    );
    const data = JSON.parse(response.text || "{}");
    res.json({ success: true, data, modelUsed });
  } catch (error: any) {
    console.error("Error in /api/classify-email:", error);
    res.status(500).json({ success: false, error: error?.message || "Email classification failed." });
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
  const items = rawItems.map((item: any, index: number) => {
    const quantity = numeric(item?.quantity);
    const unitPrice = numeric(item?.unitPrice);
    const discount = numeric(item?.discount);
    const deterministicTotal = roundMoney(quantity * unitPrice - discount);
    const total = item?.total === undefined || item?.total === null ? deterministicTotal : numeric(item.total);
    return {
      id: randomUUID(),
      itemNumber: index + 1,
      sku: item?.sku || "",
      description: item?.description || "",
      quantity,
      unitOfMeasure: item?.unitOfMeasure || item?.uom || item?.unit || "",
      unitPrice,
      discount,
      taxRate: numeric(item?.taxRate),
      taxAmount: numeric(item?.taxAmount),
      taxTreatment: item?.taxTreatment || "UNKNOWN",
      total,
    };
  });
  const validation = validateExtractedInvoice(extracted || {}, items);
  const subtotal = extracted?.subtotal === undefined || extracted?.subtotal === null ? validation.calculatedSubtotal : numeric(extracted.subtotal);
  const phTax = normalizeTaxDetails(extracted?.philippineTaxDetails);
  const totalTax = extracted?.totalTax === undefined || extracted?.totalTax === null
    ? numeric(phTax?.vatAmount)
    : numeric(extracted.totalTax);
  const grandTotal = extracted?.grandTotal === undefined || extracted?.grandTotal === null ? validation.calculatedGrandTotal : numeric(extracted.grandTotal);
  const amountPaid = numeric(extracted?.amountPaid);
  const balanceDue = extracted?.balanceDue === undefined || extracted?.balanceDue === null ? Math.max(0, grandTotal - amountPaid) : numeric(extracted.balanceDue);
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
    status: deriveStatus(grandTotal, amountPaid, balanceDue, extracted?.dueDate),
    vendor: compactParty(extracted?.vendor),
    customer: compactParty(extracted?.customer),
    shippingAddress: extracted?.shippingAddress ? compactParty(extracted.shippingAddress) : undefined,
    items,
    subtotal,
    totalDiscount: numeric(extracted?.totalDiscount),
    taxBreakdown: Array.isArray(extracted?.taxBreakdown) ? extracted.taxBreakdown : [],
    totalTax,
    shippingFee: numeric(extracted?.shippingFee),
    otherFees: numeric(extracted?.otherFees),
    grandTotal,
    amountPaid,
    balanceDue,
    withholdingTaxRate: extracted?.withholdingTaxRate === undefined || extracted?.withholdingTaxRate === null ? undefined : numeric(extracted.withholdingTaxRate),
    withholdingTaxAmount: extracted?.withholdingTaxAmount === undefined || extracted?.withholdingTaxAmount === null ? undefined : numeric(extracted.withholdingTaxAmount),
    netAmountPayable: extracted?.netAmountPayable === undefined || extracted?.netAmountPayable === null ? undefined : numeric(extracted.netAmountPayable),
    philippineTaxDetails: phTax,
    notes: extracted?.notes || "",
    termsAndConditions: extracted?.termsAndConditions || "",
    category: extracted?.category || "",
    extractedAt: new Date().toISOString(),
    modelUsed,
    confidenceScore,
    fieldConfidence: extracted?.fieldConfidence || {},
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
  try {
    const {
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

    const ai = getGeminiClient();
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
        const response = await generateContentWithTimeout(ai, requested, contents, { systemInstruction: systemPrompt, responseMimeType: "application/json", responseSchema: invoiceSchema });
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
          error: error?.message || "unknown",
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
    if (shouldRunAutomaticRetry(firstModel, first?.quality)) {
      const reason = first ? `quality:${retryFocusForQuality(first.quality).join(",")}` : "request-or-parse-failure";
      const retryContents = { parts: [...parts, { text: enhancedRetryInstruction(first?.quality || evaluateExtractionQuality({}, sourceText)) }] };
      try {
        await runAttempt(ACCURACY_MODEL, 2, retryContents, reason);
      } catch (error: any) {
        if (!firstFailure) firstFailure = error;
      }
    }

    if (!attempts.length) {
      console.error("Error in /api/extract-invoice:", firstFailure?.message || "No usable extraction candidate.");
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
    console.error("Error in /api/extract-invoice:", error?.message || "unknown");
    return res.status(500).json({ success: false, error: "Invoice extraction failed. Please retry the document." });
  }
});



function getGoogleAccessToken(req: express.Request) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error("Gmail access token is missing. Reconnect Gmail and try again.");
  return match[1];
}

function decodeBase64UrlText(value?: string) {
  if (!value) return "";
  try {
    return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return "";
  }
}

function toStandardBase64(value?: string) {
  if (!value) return "";
  try {
    return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("base64");
  } catch {
    return "";
  }
}

async function gmailFetch(accessToken: string, pathName: string, init?: RequestInit) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${pathName}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error: any = new Error(payload?.error?.message || `Gmail API request failed (${response.status}).`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
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
    for (const child of part.parts || []) walk(child);
  };

  walk(payload);
  return {
    bodyText: bodyText.join("\n\n").trim(),
    bodyHtml: bodyHtml.join("\n").trim(),
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
    hasAttachments: parsed.attachments.length > 0,
    attachments: parsed.attachments.map(({ inlineDataBase64, ...attachment }) => attachment),
  };
}

async function getGmailMessageFull(accessToken: string, messageId: string) {
  return gmailFetch(accessToken, `messages/${encodeURIComponent(messageId)}?format=full`);
}

app.get("/api/gmail/profile", async (req, res) => {
  try {
    const accessToken = getGoogleAccessToken(req);
    const profile = await gmailFetch(accessToken, "profile");
    res.json({ success: true, data: profile });
  } catch (error: any) {
    res.status(error?.status || 500).json({ success: false, error: error?.message || "Could not read Gmail profile." });
  }
});

app.post("/api/gmail/scan", async (req, res) => {
  try {
    const accessToken = getGoogleAccessToken(req);
    const maxResults = Math.max(1, Math.min(50, Number(req.body?.maxResults || 25)));
    const query = String(req.body?.query || "newer_than:30d {subject:invoice subject:\"sales invoice\" subject:\"service invoice\" subject:\"VAT invoice\" subject:billing subject:SOA \"statement of account\" \"credit note\" \"tax invoice\" BIR VAT TIN \"amount due\" filename:pdf filename:png filename:jpg filename:jpeg}");
    const ids: string[] = [];
    let pageToken = "";
    let resultSizeEstimate = 0;
    do {
      const params = new URLSearchParams({ maxResults: String(Math.min(100, maxResults - ids.length)), q: query });
      if (pageToken) params.set("pageToken", pageToken);
      const list = await gmailFetch(accessToken, `messages?${params.toString()}`);
      resultSizeEstimate = Number(list.resultSizeEstimate || resultSizeEstimate);
      ids.push(...(list.messages || []).map((entry: any) => entry.id).filter(Boolean));
      pageToken = String(list.nextPageToken || "");
    } while (pageToken && ids.length < maxResults);
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
  try {
    const accessToken = getGoogleAccessToken(req);
    const startHistoryId = String(req.body?.startHistoryId || "");
    if (!startHistoryId) return res.status(400).json({ success: false, error: "No previous Gmail history ID is available. Run an initial scan first." });
    const ids = new Set<string>();
    let pageToken = "";
    do {
      const params = new URLSearchParams({ startHistoryId, historyTypes: "messageAdded", maxResults: "100" });
      if (pageToken) params.set("pageToken", pageToken);
      const history = await gmailFetch(accessToken, `history?${params.toString()}`);
      for (const event of history.history || []) {
        for (const added of event.messagesAdded || []) if (added?.message?.id) ids.add(added.message.id);
      }
      pageToken = String(history.nextPageToken || "");
    } while (pageToken);
    const messages: any[] = [];
    const idList = Array.from(ids);
    for (let i = 0; i < idList.length; i += 6) {
      const batch = idList.slice(i, i + 6);
      const loaded = await Promise.all(batch.map((id) => getGmailMessageFull(accessToken, id)));
      messages.push(...loaded.map(summarizeGmailMessage));
    }
    const profile = await gmailFetch(accessToken, "profile");
    res.json({ success: true, data: { messages, historyId: profile.historyId, emailAddress: profile.emailAddress } });
  } catch (error: any) {
    const status = error?.status === 404 ? 409 : (error?.status || 500);
    res.status(status).json({ success: false, code: error?.status === 404 ? "HISTORY_EXPIRED" : undefined, error: error?.status === 404 ? "Gmail history cursor expired. Run a fresh scan to rebuild sync state." : (error?.message || "Gmail incremental sync failed.") });
  }
});

app.post("/api/gmail/import", async (req, res) => {
  try {
    const accessToken = getGoogleAccessToken(req);
    const messageId = String(req.body?.messageId || "");
    if (!messageId) return res.status(400).json({ success: false, error: "messageId is required." });
    const full = await getGmailMessageFull(accessToken, messageId);
    const summary: any = summarizeGmailMessage(full);
    const parsed = collectMimeParts(full.payload || {});
    const attachments: any[] = [];
    for (const attachment of parsed.attachments) {
      let dataBase64 = attachment.inlineDataBase64 || "";
      if (!dataBase64 && attachment.attachmentId && !attachment.attachmentId.startsWith("inline-")) {
        const payload = await gmailFetch(accessToken, `messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachment.attachmentId)}`);
        dataBase64 = toStandardBase64(payload.data || "");
      }
      attachments.push({
        attachmentId: attachment.attachmentId,
        partId: attachment.partId,
        attachmentIndex: attachment.attachmentIndex,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size || (dataBase64 ? Buffer.from(dataBase64, "base64").byteLength : 0),
        dataBase64,
      });
    }
    const raw = await gmailFetch(accessToken, `messages/${encodeURIComponent(messageId)}?format=raw`);
    res.json({ success: true, data: { ...summary, attachments, rawBase64Url: raw.raw || "" } });
  } catch (error: any) {
    res.status(error?.status || 500).json({ success: false, error: error?.message || "Could not import Gmail message." });
  }
});

async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Sales Invoice Workspace running at http://0.0.0.0:${PORT}`);
  });
}

start();
