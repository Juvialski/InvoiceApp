import express from "express";
import type { InvoiceData } from "../../types.ts";
import {
  decodeBase64Payload,
  validateInvoiceDocumentBytes,
} from "../../lib/fileSecurity.ts";
import {
  AiRequestBudgetError,
  claimAiRequest,
  releaseAiRequest,
} from "../ai/aiRequestBudget.ts";
import {
  companyAiProviderError,
  invalidateCompanyAiRuntime,
  isCompanyAiAuthenticationError,
  isCompanyAiFallbackEligible,
  logCompanyAiFailure,
  resolveCompanyAiRuntime,
} from "../ai/companyAiRuntime.ts";
import { CompanyAiError } from "../ai/companyAiTypes.ts";
import {
  ApiAuthorizationError,
  authorizeCompanyRequest,
  authorizationErrorMessage,
  authorizationErrorStatus,
  type CompanyRequestAuthorization,
} from "../auth/serverAuthorization.ts";
import {
  ACCURACY_MODEL,
  AI_TEXT_MAX_CHARS,
  buildInvoiceCandidate,
  enhancedRetryInstruction,
  generateContentWithTimeout,
  parseStructuredResponse,
  PRIMARY_MODEL,
  selectModel,
} from "./invoiceExtractionService.ts";
import { expenseSchema, invoiceSchema } from "./invoiceExtractionSchema.ts";
import {
  chooseBestExtractionCandidate,
  evaluateExtractionQuality,
  retryFocusForQuality,
  shouldRunAutomaticRetry,
  type ExtractionQuality,
} from "../../utils/extractionQuality.ts";

function extractionErrorStatus(error: unknown) {
  if (error instanceof CompanyAiError) return error.status;
  if (error instanceof AiRequestBudgetError) return error.status;
  return authorizationErrorStatus(error);
}

function extractionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof CompanyAiError) return error.message;
  if (error instanceof AiRequestBudgetError) return error.message;
  return authorizationErrorMessage(error, fallback);
}

function extractionErrorDetails(error: unknown) {
  return error instanceof CompanyAiError ? { code: error.code, reference: error.correlationRef } : {};
}

export function createInvoiceExtractionRouter() {
  const router = express.Router();
  router.post("/extract-invoice", async (req, res) => {
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
      const status = extractionErrorStatus(normalizedError);
      if (normalizedError instanceof CompanyAiError) logCompanyAiFailure(normalizedError, { companyId: extractionCompanyId, stage: "invoice-extraction" });
      if (!(normalizedError instanceof ApiAuthorizationError) && !(normalizedError instanceof CompanyAiError)) console.error("Error in /api/extract-invoice: request failed.");
        return res.status(status).json({ success: false, error: extractionErrorMessage(normalizedError, "Invoice extraction failed. Please retry the document."), ...extractionErrorDetails(normalizedError) });
    } finally {
      if (aiBudgetClaimed && budgetAuth) await releaseAiRequest(budgetAuth.supabase, budgetAuth.companyId, "INVOICE_EXTRACTION");
    }
  });


  router.post("/extract-expense", async (req, res) => {
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
      const status = extractionErrorStatus(normalizedError);
      if (normalizedError instanceof CompanyAiError) logCompanyAiFailure(normalizedError, { companyId: extractionCompanyId, stage: "expense-extraction" });
      if (!(normalizedError instanceof ApiAuthorizationError) && !(normalizedError instanceof CompanyAiError)) console.error("Error in /api/extract-expense: request failed.");
      return res.status(status).json({ success: false, error: extractionErrorMessage(normalizedError, "Receipt extraction failed. Please retry the document."), ...extractionErrorDetails(normalizedError) });
    } finally {
      if (aiBudgetClaimed && budgetAuth) await releaseAiRequest(budgetAuth.supabase, budgetAuth.companyId, "EXPENSE_EXTRACTION");
    }
  });
  return router;
}
