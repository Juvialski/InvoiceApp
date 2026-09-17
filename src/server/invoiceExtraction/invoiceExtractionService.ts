import type { InvoiceData } from "../../types.ts";
import { MAX_EXTRACTION_TEXT_CHARS } from "../../lib/fileSecurity.ts";
import { COMPANY_AI_FALLBACK_MODEL, COMPANY_AI_PRIMARY_MODEL } from "../ai/companyAiTypes.ts";
import {
  companyAiProviderError,
  isCompanyAiFallbackEligible,
} from "../ai/companyAiRuntime.ts";
import {
  evaluateExtractionQuality,
  normalizeCurrency,
  retryFocusForQuality,
  type ExtractionQuality,
} from "../../utils/extractionQuality.ts";
import {
  explicitInvoiceTaxAmount,
  reconcileInvoiceMonetarySemantics,
  resolveInvoiceMonetarySemantics,
} from "../../utils/invoiceMonetarySemantics.ts";
import { businessDateForTimeZone } from "../../utils/businessDate.ts";
import { randomUUID } from "node:crypto";

export const EXTRACTION_TIMEOUT_MS = 60_000;
export const AI_TEXT_MAX_CHARS = MAX_EXTRACTION_TEXT_CHARS;
export const PRIMARY_MODEL = COMPANY_AI_PRIMARY_MODEL;
export const ACCURACY_MODEL = COMPANY_AI_FALLBACK_MODEL;

export function selectModel(requestedModel?: unknown) {
  return requestedModel === ACCURACY_MODEL ? ACCURACY_MODEL : PRIMARY_MODEL;
}



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

export async function generateContentWithTimeout(ai: GeminiClientLike, model: string, contents: any, config: any) {
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

export async function generateStructured(ai: GeminiClientLike, requestedModel: unknown, contents: any, systemInstruction: string, responseSchema: any) {
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

export function buildInvoiceCandidate(extracted: any, responseText: string, modelUsed: string, fileName: string | undefined, sourceType: string, emailContext: any, sourceText: string): InvoiceData {
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

export function parseStructuredResponse(response: any) {
  const responseText = response?.text || "";
  const extracted = JSON.parse(responseText || "{}");
  if (!extracted || typeof extracted !== "object" || Array.isArray(extracted)) throw new Error("Structured response was not an object.");
  return { extracted, responseText };
}

export function enhancedRetryInstruction(quality: ExtractionQuality) {
  const focus = retryFocusForQuality(quality);
  return `SECOND EXTRACTION PASS. Re-read the original source document that is attached or included above. Do not use a previous JSON result as evidence and do not invent corrections. Focus especially on: ${focus.join(", ")}.
- For line-items, inspect the table row by row. Recognize headers such as Item, SKU, Code, Description, Qty, Quantity, Unit, UOM, Unit Price, Price, Amount, and Total. Preserve every visible row independently; do not summarize or merge rows. Preserve SKU, description, quantity, unit of measure, unit price, and amount.
- For currency, inspect explicit labels and symbols such as Currency: PHP, PHP, Php, Philippine Peso, ₱, USD, US$, $, EUR, SGD, JPY, and preserve the source currency without inferring it from an address.
- For supplier identity, inspect FROM, SELLER, registered/trade-name, and supplier TIN sections. Buyer/customer identity is optional source evidence and is not a retry target or posting blocker.
- For totals, inspect the financial summary near the bottom, including Subtotal, VATable Sales, VAT Amount, Zero-Rated Sales, VAT-Exempt Sales, Discount, Total Amount, Amount Due, Amount Paid, and Balance Due. Preserve whether displayed line amounts/subtotal are pre-tax or VAT-inclusive.
Return the complete invoice schema again. Unknown source values must remain null.`;
}
