import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { randomUUID } from "crypto";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PRIMARY_MODEL = "gemini-3.5-flash-lite";
const ACCURACY_MODEL = "gemini-3.7-flash";

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
    name: { type: Type.STRING },
    companyName: { type: Type.STRING },
    taxId: { type: Type.STRING },
    address: { type: Type.STRING },
    city: { type: Type.STRING },
    state: { type: Type.STRING },
    postalCode: { type: Type.STRING },
    country: { type: Type.STRING },
    email: { type: Type.STRING },
    phone: { type: Type.STRING },
    website: { type: Type.STRING },
  },
};

const invoiceSchema = {
  type: Type.OBJECT,
  properties: {
    documentType: { type: Type.STRING, description: "INVOICE, CREDIT_NOTE, RECEIPT, STATEMENT, PURCHASE_ORDER, or OTHER" },
    invoiceNumber: { type: Type.STRING },
    invoiceDate: { type: Type.STRING, description: "YYYY-MM-DD when visible" },
    dueDate: { type: Type.STRING, description: "YYYY-MM-DD when visible" },
    purchaseOrderNumber: { type: Type.STRING },
    currency: { type: Type.STRING, description: "ISO currency code" },
    currencySymbol: { type: Type.STRING },
    paymentTerms: { type: Type.STRING },
    vendor: partySchema,
    customer: partySchema,
    shippingAddress: partySchema,
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          sku: { type: Type.STRING },
          description: { type: Type.STRING },
          quantity: { type: Type.NUMBER },
          unitPrice: { type: Type.NUMBER },
          discount: { type: Type.NUMBER },
          taxRate: { type: Type.NUMBER },
          taxAmount: { type: Type.NUMBER },
          total: { type: Type.NUMBER },
        },
        required: ["description"],
      },
    },
    subtotal: { type: Type.NUMBER },
    totalDiscount: { type: Type.NUMBER },
    taxBreakdown: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          rate: { type: Type.NUMBER },
          amount: { type: Type.NUMBER },
        },
        required: ["name", "amount"],
      },
    },
    totalTax: { type: Type.NUMBER },
    shippingFee: { type: Type.NUMBER },
    otherFees: { type: Type.NUMBER },
    grandTotal: { type: Type.NUMBER },
    amountPaid: { type: Type.NUMBER },
    balanceDue: { type: Type.NUMBER },
    notes: { type: Type.STRING },
    termsAndConditions: { type: Type.STRING },
    category: { type: Type.STRING, description: "Short business/accounting category suggestion" },
    confidenceScore: { type: Type.NUMBER, description: "Overall extraction confidence from 0 to 100. Do not invent a high score." },
    fieldConfidence: {
      type: Type.OBJECT,
      properties: {
        invoiceNumber: { type: Type.NUMBER },
        invoiceDate: { type: Type.NUMBER },
        vendorName: { type: Type.NUMBER },
        customerName: { type: Type.NUMBER },
        lineItems: { type: Type.NUMBER },
        grandTotal: { type: Type.NUMBER },
      },
    },
  },
};

const emailClassificationSchema = {
  type: Type.OBJECT,
  properties: {
    isInvoiceLike: { type: Type.BOOLEAN },
    documentType: { type: Type.STRING },
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
    const due = new Date(`${dueDate}T23:59:59`);
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

  return {
    status: issues.length ? "REVIEW" : "PASS",
    issues,
    calculatedSubtotal,
    calculatedGrandTotal,
    calculatedBalanceDue,
  };
}

async function generateStructured(ai: GoogleGenAI, requestedModel: unknown, contents: any, systemInstruction: string, responseSchema: any) {
  const primary = selectModel(requestedModel);
  try {
    const response = await ai.models.generateContent({
      model: primary,
      contents,
      config: { systemInstruction, responseMimeType: "application/json", responseSchema },
    });
    return { response, modelUsed: primary };
  } catch (error: any) {
    if (primary === ACCURACY_MODEL) throw error;
    console.warn(`${primary} failed; retrying with ${ACCURACY_MODEL}:`, error?.message);
    const response = await ai.models.generateContent({
      model: ACCURACY_MODEL,
      contents,
      config: { systemInstruction, responseMimeType: "application/json", responseSchema },
    });
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
    const prompt = `Classify whether this email is related to an invoice or adjacent financial document. Use the email subject, sender, body, and attachment names. Do not assume an attachment is an invoice only because it is a PDF.\n\nSender: ${sender}\nSubject: ${subject}\nAttachments: ${attachmentNames.join(", ") || "None"}\n\nBody:\n${body}`;
    const { response, modelUsed } = await generateStructured(
      ai,
      model,
      { parts: [{ text: prompt }] },
      "You classify finance emails for an invoice operations workspace. Return conservative structured JSON.",
      emailClassificationSchema
    );
    const data = JSON.parse(response.text || "{}");
    res.json({ success: true, data, modelUsed });
  } catch (error: any) {
    console.error("Error in /api/classify-email:", error);
    res.status(500).json({ success: false, error: error?.message || "Email classification failed." });
  }
});

app.post("/api/extract-invoice", async (req, res) => {
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

    if (!fileData && !textData && !emailContext?.body) {
      return res.status(400).json({ success: false, error: "No invoice file, text, or email content provided." });
    }

    const ai = getGeminiClient();
    const parts: any[] = [];
    if (fileData && mimeType) parts.push({ inlineData: { mimeType, data: fileData } });

    const emailBlock = emailContext
      ? `\nEMAIL CONTEXT\nSender: ${emailContext.sender || "Unknown"}\nSubject: ${emailContext.subject || ""}\nReceived: ${emailContext.receivedAt || ""}\nAttachment: ${emailContext.attachmentName || fileName || ""}\nEmail body:\n${emailContext.body || ""}\n`
      : "";

    parts.push({
      text: `${emailBlock}\n${textData ? `DOCUMENT TEXT:\n${textData}` : "Analyze the attached document."}\n\nExtract the financial document into the requested structured schema.`,
    });

    const systemPrompt = `You are a high-precision financial document extraction system for invoices, tax invoices, receipts, credit notes, statements, and purchase orders.
Rules:
1. Extract values that are explicitly visible in the document or email context.
2. Never guess, estimate, or invent missing financial values, dates, invoice numbers, tax IDs, contact details, or parties.
3. You may calculate a value only when it is mathematically deterministic from clearly extracted values. Otherwise leave it absent/empty.
4. Prefer document values over email-body hints when they conflict. Email context may fill a field only when the email clearly states it.
5. Numbers must be raw numeric values without currency symbols.
6. Use ISO currency codes where possible and YYYY-MM-DD dates where unambiguous.
7. Extract every visible line item. Preserve descriptions faithfully.
8. confidenceScore and fieldConfidence must reflect actual uncertainty; do not default to a high score.
9. category is only a short suggested classification (e.g. Software, Office Supplies, Professional Services, Utilities, Logistics).
10. Return only JSON matching the schema.`;

    const { response, modelUsed } = await generateStructured(
      ai,
      model,
      { parts },
      systemPrompt,
      invoiceSchema
    );

    const responseText = response.text || "{}";
    let extracted: any;
    try {
      extracted = JSON.parse(responseText);
    } catch {
      return res.status(500).json({ success: false, error: "Gemini returned an unreadable structured response." });
    }

    const items = (extracted.items || []).map((item: any, index: number) => {
      const quantity = numeric(item.quantity, item.unitPrice !== undefined ? 1 : 0);
      const unitPrice = numeric(item.unitPrice);
      const discount = numeric(item.discount);
      const deterministicTotal = roundMoney(quantity * unitPrice - discount);
      const total = item.total === undefined ? deterministicTotal : numeric(item.total);
      return {
        id: randomUUID(),
        itemNumber: index + 1,
        sku: item.sku || "",
        description: item.description || `Item ${index + 1}`,
        quantity,
        unitPrice,
        discount,
        taxRate: numeric(item.taxRate),
        taxAmount: numeric(item.taxAmount),
        total,
      };
    });

    const validation = validateExtractedInvoice(extracted, items);
    const subtotal = extracted.subtotal === undefined ? validation.calculatedSubtotal : numeric(extracted.subtotal);
    const grandTotal = extracted.grandTotal === undefined ? validation.calculatedGrandTotal : numeric(extracted.grandTotal);
    const amountPaid = numeric(extracted.amountPaid);
    const balanceDue = extracted.balanceDue === undefined ? Math.max(0, grandTotal - amountPaid) : numeric(extracted.balanceDue);
    const confidenceScore = extracted.confidenceScore === undefined ? undefined : numeric(extracted.confidenceScore);
    // Passing arithmetic and confidence checks only makes the extraction review-ready.
    // Verification is an explicit human action.
    const reviewStatus = "NEEDS_REVIEW";

    const invoiceData = {
      id: randomUUID(),
      fileName: fileName || emailContext?.attachmentName || "invoice",
      documentType: extracted.documentType || "OTHER",
      sourceType,
      sourceMetadata: emailContext
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
        : { attachmentName: fileName || "" },
      processingStatus: "EXTRACTED",
      reviewStatus,
      duplicateStatus: "UNIQUE",
      invoiceNumber: extracted.invoiceNumber || "",
      invoiceDate: extracted.invoiceDate || "",
      dueDate: extracted.dueDate || "",
      purchaseOrderNumber: extracted.purchaseOrderNumber || "",
      currency: extracted.currency || "",
      currencySymbol: extracted.currencySymbol || "",
      paymentTerms: extracted.paymentTerms || "",
      status: deriveStatus(grandTotal, amountPaid, balanceDue, extracted.dueDate),
      vendor: {
        name: extracted.vendor?.name || "",
        companyName: extracted.vendor?.companyName || extracted.vendor?.name || "",
        taxId: extracted.vendor?.taxId || "",
        address: extracted.vendor?.address || "",
        city: extracted.vendor?.city || "",
        state: extracted.vendor?.state || "",
        postalCode: extracted.vendor?.postalCode || "",
        country: extracted.vendor?.country || "",
        email: extracted.vendor?.email || "",
        phone: extracted.vendor?.phone || "",
        website: extracted.vendor?.website || "",
      },
      customer: {
        name: extracted.customer?.name || "",
        companyName: extracted.customer?.companyName || extracted.customer?.name || "",
        taxId: extracted.customer?.taxId || "",
        address: extracted.customer?.address || "",
        city: extracted.customer?.city || "",
        state: extracted.customer?.state || "",
        postalCode: extracted.customer?.postalCode || "",
        country: extracted.customer?.country || "",
        email: extracted.customer?.email || "",
        phone: extracted.customer?.phone || "",
      },
      shippingAddress: extracted.shippingAddress || undefined,
      items,
      subtotal,
      totalDiscount: numeric(extracted.totalDiscount),
      taxBreakdown: extracted.taxBreakdown || [],
      totalTax: numeric(extracted.totalTax),
      shippingFee: numeric(extracted.shippingFee),
      otherFees: numeric(extracted.otherFees),
      grandTotal,
      amountPaid,
      balanceDue,
      notes: extracted.notes || "",
      termsAndConditions: extracted.termsAndConditions || "",
      category: extracted.category || "",
      extractedAt: new Date().toISOString(),
      modelUsed,
      confidenceScore,
      fieldConfidence: extracted.fieldConfidence || {},
      validation,
      rawJson: responseText,
    };

    res.json({ success: true, data: invoiceData });
  } catch (error: any) {
    console.error("Error in /api/extract-invoice:", error);
    res.status(500).json({ success: false, error: error?.message || "Invoice extraction failed." });
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
    const query = String(req.body?.query || "newer_than:30d {subject:invoice subject:receipt subject:statement \"credit note\" \"tax invoice\" filename:pdf filename:png filename:jpg filename:jpeg}");
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
