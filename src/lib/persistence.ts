import { InvoiceData, GmailImportedMessage, StoredEmailRecord, StoredSourceDocument, ReviewEvent } from "../types";
import { supabase } from "./supabase";

const INVOICE_BUCKET = "invoice-originals";
const EMAIL_BUCKET = "email-originals";

function requireSupabase() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function compareHistoryIds(left?: string | null, right?: string | null) {
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  try {
    const a = BigInt(left);
    const b = BigInt(right);
    return a === b ? 0 : a > b ? 1 : -1;
  } catch {
    return left === right ? 0 : left > right ? 1 : -1;
  }
}

async function requireUserId() {
  const client = requireSupabase();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Sign in with Google before saving workspace data.");
  return data.user.id;
}

export async function ensureWorkspaceProfile() {
  const client = requireSupabase();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Sign in with Google before loading workspace data.");
  const metadata = data.user.user_metadata || {};
  const { error: profileError } = await client.from("profiles").upsert({
    id: data.user.id,
    email: data.user.email || null,
    full_name: metadata.full_name || metadata.name || null,
    avatar_url: metadata.avatar_url || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (profileError) throw profileError;
  return data.user.id;
}

function safeName(name: string) {
  return (name || "document").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 120);
}

function decodeBase64(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return decodeBase64(base64);
}

async function sha256(bytes: Uint8Array) {
  const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function signedUrl(bucket: string, storagePath?: string | null) {
  if (!storagePath) return undefined;
  const client = requireSupabase();
  const { data } = await client.storage.from(bucket).createSignedUrl(storagePath, 60 * 60);
  return data?.signedUrl || undefined;
}

export async function loadInvoicesFromSupabase(): Promise<InvoiceData[]> {
  const client = requireSupabase();
  await requireUserId();
  const { data, error } = await client
    .from("invoices")
    .select("id,current_data,source_document_id,source_email_id,review_status,duplicate_status,duplicate_of_id,verified_at,archived_at,created_at")
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const extractionByInvoice = new Map<string, { id: string; structuredResult: Partial<InvoiceData> }>();
  const invoiceIds = (data || []).map((row) => row.id);
  if (invoiceIds.length) {
    const { data: extractions, error: extractionError } = await client
      .from("invoice_extractions")
      .select("id,invoice_id,structured_result,created_at")
      .in("invoice_id", invoiceIds)
      .order("created_at", { ascending: false });
    if (extractionError) throw extractionError;
    for (const row of extractions || []) {
      if (!extractionByInvoice.has(row.invoice_id)) {
        extractionByInvoice.set(row.invoice_id, { id: row.id, structuredResult: row.structured_result || {} });
      }
    }
  }

  const results: InvoiceData[] = [];
  for (const row of data || []) {
    const invoice = { ...(row.current_data || {}), id: row.id } as InvoiceData;
    const extraction = extractionByInvoice.get(row.id);
    invoice.extractionId = invoice.extractionId || extraction?.id;
    invoice.aiSnapshot = invoice.aiSnapshot || extraction?.structuredResult;
    invoice.sourceDocumentId = row.source_document_id || invoice.sourceDocumentId;
    invoice.sourceEmailId = row.source_email_id || invoice.sourceEmailId;
    invoice.reviewStatus = row.review_status || invoice.reviewStatus;
    invoice.duplicateStatus = row.duplicate_status || invoice.duplicateStatus;
    invoice.duplicateOfId = row.duplicate_of_id || invoice.duplicateOfId;
    invoice.verifiedAt = row.verified_at || invoice.verifiedAt;
    invoice.archivedAt = row.archived_at || invoice.archivedAt;
    if (invoice.sourceStoragePath) invoice.previewUrl = await signedUrl(INVOICE_BUCKET, invoice.sourceStoragePath);
    results.push(invoice);
  }
  return results;
}

export async function saveManualSourceDocument(input: { fileData: string; mimeType: string; fileName: string; emailMessageId?: string; sourceType?: "UPLOAD" | "EMAIL" }): Promise<StoredSourceDocument> {
  const client = requireSupabase();
  const userId = await requireUserId();
  const bytes = decodeBase64(input.fileData);
  const hash = await sha256(bytes);

  const now = new Date();
  const path = `${userId}/manual/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${hash.slice(0, 12)}-${crypto.randomUUID().slice(0, 8)}-${safeName(input.fileName)}`;
  const { error: uploadError } = await client.storage.from(INVOICE_BUCKET).upload(path, bytes, {
    contentType: input.mimeType || "application/octet-stream",
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data, error } = await client
    .from("source_documents")
    .insert({
      user_id: userId,
      source_type: input.sourceType || "UPLOAD",
      email_message_id: input.emailMessageId || null,
      filename: input.fileName,
      mime_type: input.mimeType,
      file_size: bytes.byteLength,
      storage_path: path,
      sha256: hash,
      processing_status: "STORED",
    })
    .select("id")
    .single();
  if (error) throw error;

  return { id: data.id, filename: input.fileName, mimeType: input.mimeType, size: bytes.byteLength, storagePath: path, sha256: hash, previewUrl: await signedUrl(INVOICE_BUCKET, path) };
}


export async function saveManualEmailRecord(input: { sender: string; subject: string; receivedAt?: string; body: string }) {
  const client = requireSupabase();
  const userId = await requireUserId();
  const syntheticId = `manual-${crypto.randomUUID()}`;
  const { data, error } = await client.from("email_messages").insert({
    user_id: userId,
    gmail_message_id: syntheticId,
    subject: input.subject || "Manual email",
    sender: input.sender || "",
    recipients: [],
    cc: [],
    received_at: input.receivedAt || new Date().toISOString(),
    body_text: input.body || "",
    body_html: "",
    snippet: (input.body || "").slice(0, 240),
    labels: [],
    processing_status: "IMPORTED",
  }).select("id").single();
  if (error) throw error;
  return { id: data.id as string, gmailMessageId: syntheticId };
}

export async function saveGmailMessageSource(message: GmailImportedMessage): Promise<{ email: StoredEmailRecord; documents: StoredSourceDocument[] }> {
  const client = requireSupabase();
  const userId = await requireUserId();
  const received = message.receivedAt ? new Date(message.receivedAt) : new Date();
  const year = received.getUTCFullYear();
  const month = String(received.getUTCMonth() + 1).padStart(2, "0");
  let rawStoragePath: string | undefined;

  if (message.rawBase64Url) {
    const rawBytes = base64UrlToBytes(message.rawBase64Url);
    rawStoragePath = `${userId}/${year}/${month}/${message.id}/message.eml`;
    const { error } = await client.storage.from(EMAIL_BUCKET).upload(rawStoragePath, rawBytes, { contentType: "message/rfc822", upsert: true });
    if (error) throw error;
  }

  const { data: emailRow, error: emailError } = await client
    .from("email_messages")
    .upsert({
      user_id: userId,
      gmail_message_id: message.id,
      gmail_thread_id: message.threadId || null,
      gmail_history_id: message.historyId || undefined,
      subject: message.subject || "",
      sender: message.sender || "",
      sender_name: message.senderName || null,
      sender_email: message.senderEmail || null,
      recipients: message.to || [],
      cc: message.cc || [],
      received_at: message.receivedAt || null,
      body_text: message.bodyText || "",
      body_html: message.bodyHtml || "",
      snippet: message.snippet || "",
      labels: message.labels || [],
      has_attachments: Boolean(message.attachments?.length),
      attachment_count: message.attachments?.length || 0,
      ...(rawStoragePath ? { raw_storage_path: rawStoragePath } : {}),
      processing_status: "IMPORTED",
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,gmail_message_id" })
    .select("id")
    .single();
  if (emailError) throw emailError;

  const documents: StoredSourceDocument[] = [];
  for (let index = 0; index < (message.attachments || []).length; index += 1) {
    const attachment = message.attachments[index];
    const attachmentId = attachment.attachmentId || attachment.partId || `part-${index}`;
    const { data: existingDocument, error: existingError } = await client
      .from("source_documents")
      .select("id,email_message_id,gmail_attachment_id,gmail_part_id,attachment_index,filename,mime_type,file_size,storage_path,sha256,processing_status,document_type")
      .eq("user_id", userId)
      .eq("email_message_id", emailRow.id)
      .eq("gmail_attachment_id", attachmentId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existingDocument) {
      documents.push({
        id: existingDocument.id,
        emailMessageId: existingDocument.email_message_id || undefined,
        gmailAttachmentId: existingDocument.gmail_attachment_id || undefined,
        gmailPartId: existingDocument.gmail_part_id || undefined,
        attachmentIndex: existingDocument.attachment_index ?? undefined,
        filename: existingDocument.filename,
        mimeType: existingDocument.mime_type,
        size: Number(existingDocument.file_size || 0),
        storagePath: existingDocument.storage_path,
        sha256: existingDocument.sha256,
        processingStatus: existingDocument.processing_status || undefined,
        documentType: existingDocument.document_type || undefined,
        previewUrl: await signedUrl(INVOICE_BUCKET, existingDocument.storage_path),
      });
      continue;
    }

    if (!attachment.dataBase64) throw new Error(`Gmail attachment data is missing for ${attachment.filename || attachmentId}.`);
    const bytes = decodeBase64(attachment.dataBase64);
    const hash = await sha256(bytes);
    const storagePath = `${userId}/${year}/${month}/${message.id}/${safeName(attachmentId)}-${hash.slice(0, 12)}-${safeName(attachment.filename)}`;
    const { error: uploadError } = await client.storage.from(INVOICE_BUCKET).upload(storagePath, bytes, {
      contentType: attachment.mimeType || "application/octet-stream",
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const { data: row, error } = await client
      .from("source_documents")
      .insert({
        user_id: userId,
        email_message_id: emailRow.id,
        source_type: "EMAIL",
        gmail_attachment_id: attachmentId,
        gmail_part_id: attachment.partId || null,
        attachment_index: attachment.attachmentIndex ?? index,
        filename: attachment.filename,
        mime_type: attachment.mimeType,
        file_size: bytes.byteLength,
        storage_path: storagePath,
        sha256: hash,
        processing_status: "STORED",
      })
      .select("id")
      .single();
    if (error) {
      if (error.code !== "23505") throw error;
      const { data: racedDocument, error: racedError } = await client
        .from("source_documents")
        .select("id,email_message_id,gmail_attachment_id,gmail_part_id,attachment_index,filename,mime_type,file_size,storage_path,sha256,processing_status,document_type")
        .eq("user_id", userId)
        .eq("email_message_id", emailRow.id)
        .eq("gmail_attachment_id", attachmentId)
        .single();
      if (racedError || !racedDocument) throw racedError || new Error("Could not load the existing Gmail attachment record.");
      documents.push({ id: racedDocument.id, emailMessageId: racedDocument.email_message_id || undefined, gmailAttachmentId: racedDocument.gmail_attachment_id || undefined, gmailPartId: racedDocument.gmail_part_id || undefined, attachmentIndex: racedDocument.attachment_index ?? undefined, filename: racedDocument.filename, mimeType: racedDocument.mime_type, size: Number(racedDocument.file_size || 0), storagePath: racedDocument.storage_path, sha256: racedDocument.sha256, processingStatus: racedDocument.processing_status || undefined, documentType: racedDocument.document_type || undefined, previewUrl: await signedUrl(INVOICE_BUCKET, racedDocument.storage_path) });
    } else {
      documents.push({ id: row.id, emailMessageId: emailRow.id, gmailAttachmentId: attachmentId, gmailPartId: attachment.partId, attachmentIndex: attachment.attachmentIndex ?? index, filename: attachment.filename, mimeType: attachment.mimeType, size: bytes.byteLength, storagePath, sha256: hash, processingStatus: "STORED", previewUrl: await signedUrl(INVOICE_BUCKET, storagePath) });
    }
  }

  return {
    email: {
      id: emailRow.id,
      gmailMessageId: message.id,
      gmailThreadId: message.threadId,
      senderName: message.senderName,
      senderEmail: message.senderEmail,
      subject: message.subject,
      sender: message.sender,
      receivedAt: message.receivedAt,
      bodyText: message.bodyText,
      bodyHtml: message.bodyHtml,
      rawStoragePath,
    },
    documents,
  };
}

function normalizedVendorName(invoice: InvoiceData) {
  return (invoice.vendor?.registeredName || invoice.vendor?.companyName || invoice.vendor?.name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizedTaxId(value?: string) {
  return (value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

async function ensureVendor(invoice: InvoiceData) {
  const client = requireSupabase();
  const userId = await requireUserId();
  const name = (invoice.vendor?.registeredName || invoice.vendor?.companyName || invoice.vendor?.name || "").trim();
  const normalized = normalizedVendorName(invoice);
  const taxId = (invoice.vendor?.taxId || "").trim();
  // Do not merge every uncertain extraction into a fake "Unknown vendor" row.
  if (!name || !normalized) return null;
  if (taxId) {
    const { data: taxMatch, error: taxMatchError } = await client
      .from("vendors")
      .select("id")
      .eq("user_id", userId)
      .eq("tax_id", taxId)
      .maybeSingle();
    if (taxMatchError) throw taxMatchError;
    if (taxMatch?.id) return taxMatch.id as string;
  }
  // A TIN-qualified key keeps same-named businesses with different TINs separate.
  const normalizedKey = taxId ? `${normalized} tin ${normalizedTaxId(taxId)}` : normalized;
  const { data, error } = await client
    .from("vendors")
    .upsert({
      user_id: userId,
      name,
      normalized_name: normalizedKey,
      email: invoice.vendor?.email || null,
      phone: invoice.vendor?.phone || null,
      tax_id: taxId || null,
      address: invoice.vendor?.address || null,
      default_currency: invoice.currency || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,normalized_name" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function persistNewInvoice(invoice: InvoiceData): Promise<InvoiceData> {
  const client = requireSupabase();
  const userId = await requireUserId();

  if (invoice.sourceDocumentId) {
    const { data: existing, error: existingError } = await client
      .from("invoices")
      .select("id,current_data,source_document_id,source_email_id,review_status,duplicate_status,duplicate_of_id,verified_at")
      .eq("source_document_id", invoice.sourceDocumentId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      return {
        ...(existing.current_data || {}),
        ...invoice,
        ...(existing.current_data || {}),
        id: existing.id,
        sourceDocumentId: existing.source_document_id || invoice.sourceDocumentId,
        sourceEmailId: existing.source_email_id || invoice.sourceEmailId,
        reviewStatus: existing.review_status || existing.current_data?.reviewStatus || "NEEDS_REVIEW",
        duplicateStatus: existing.duplicate_status || existing.current_data?.duplicateStatus || "UNIQUE",
        duplicateOfId: existing.duplicate_of_id || existing.current_data?.duplicateOfId,
        verifiedAt: existing.verified_at || existing.current_data?.verifiedAt,
      } as InvoiceData;
    }
  }

  const vendorId = await ensureVendor(invoice);
  const aiSnapshot = clone(invoice);
  delete (aiSnapshot as any).aiSnapshot;
  const persistedInvoice: InvoiceData = {
    ...invoice,
    reviewStatus: "NEEDS_REVIEW",
    verifiedAt: undefined,
  };

  const { data: possibleDuplicates, error: duplicateError } = await client
    .from("invoices")
    .select("id,current_data,invoice_number,invoice_date,currency,grand_total,vendor_id")
    .eq("user_id", userId)
    .neq("id", invoice.id)
    .limit(500);
  if (duplicateError) throw duplicateError;
  const normalizedInvoiceVendor = normalizedVendorName(invoice);
  const normalizedInvoiceTaxId = normalizedTaxId(invoice.vendor?.taxId);
  const duplicate = (possibleDuplicates || []).find((candidate: any) => {
    const candidateData = candidate.current_data || {};
    const candidateVendor = normalizedVendorName(candidateData as InvoiceData);
    const candidateTaxId = normalizedTaxId(candidateData?.vendor?.taxId);
    const sameVendor = Boolean(
      (vendorId && candidate.vendor_id === vendorId) ||
      (normalizedInvoiceVendor && candidateVendor === normalizedInvoiceVendor && (!normalizedInvoiceTaxId || !candidateTaxId || normalizedInvoiceTaxId === candidateTaxId))
    );
    const sameNumber = Boolean(invoice.invoiceNumber && candidate.invoice_number && String(candidate.invoice_number).trim().toLowerCase() === invoice.invoiceNumber.trim().toLowerCase());
    const sameDate = Boolean(invoice.invoiceDate && candidate.invoice_date && String(candidate.invoice_date).slice(0, 10) === invoice.invoiceDate);
    const sameCurrency = Boolean(invoice.currency && candidate.currency && String(candidate.currency).toUpperCase() === invoice.currency.toUpperCase());
    const sameTotal = Math.abs(Number(candidate.grand_total || 0) - Number(invoice.grandTotal || 0)) <= 0.05;
    const sameFile = Boolean(invoice.sourceSha256 && candidateData.sourceSha256 && invoice.sourceSha256 === candidateData.sourceSha256);
    return sameFile || (sameVendor && sameNumber && sameCurrency && sameTotal) || (sameVendor && sameDate && sameCurrency && sameTotal);
  });
  if (duplicate) {
    persistedInvoice.duplicateStatus = "POSSIBLE_DUPLICATE";
    persistedInvoice.duplicateOfId = duplicate.id;
  }

  const { data: row, error } = await client
    .from("invoices")
    .insert({
      id: invoice.id,
      user_id: userId,
      source_document_id: invoice.sourceDocumentId || null,
      source_email_id: invoice.sourceEmailId || null,
      vendor_id: vendorId,
      invoice_number: invoice.invoiceNumber || null,
      invoice_date: invoice.invoiceDate || null,
      due_date: invoice.dueDate || null,
      currency: invoice.currency || null,
      grand_total: invoice.grandTotal || 0,
      payment_status: invoice.status || "UNPAID",
      review_status: persistedInvoice.reviewStatus,
      duplicate_status: persistedInvoice.duplicateStatus || "UNIQUE",
      duplicate_of_id: persistedInvoice.duplicateOfId || null,
      document_type: persistedInvoice.documentType || "OTHER",
      current_data: { ...persistedInvoice, aiSnapshot },
      verified_at: null,
    })
    .select("id")
    .single();
  if (error) throw error;

  await replaceLineItems(row.id, invoice.items);

  const { data: extraction, error: extractionError } = await client
    .from("invoice_extractions")
    .insert({
      user_id: userId,
      invoice_id: row.id,
      model: persistedInvoice.modelUsed || "unknown",
      raw_result: persistedInvoice.rawJson || null,
      structured_result: aiSnapshot,
      confidence: persistedInvoice.confidenceScore ?? null,
      validation_result: persistedInvoice.validation || {},
    })
    .select("id")
    .single();
  if (extractionError) throw extractionError;

  const saved = { ...persistedInvoice, extractionId: extraction.id, aiSnapshot: clone(aiSnapshot) };
  const { error: updateError } = await client.from("invoices").update({ current_data: saved }).eq("id", row.id);
  if (updateError) throw updateError;

  const { error: eventError } = await client.from("invoice_review_events").insert({ user_id: userId, invoice_id: row.id, event_type: "AI_EXTRACTION_CREATED", new_value: { model: persistedInvoice.modelUsed, confidence: persistedInvoice.confidenceScore } });
  if (eventError) throw eventError;
  return saved;
}

async function replaceLineItems(invoiceId: string, items: InvoiceData["items"]) {
  const client = requireSupabase();
  const userId = await requireUserId();
  const { error: deleteError } = await client.from("invoice_line_items").delete().eq("invoice_id", invoiceId);
  if (deleteError) throw deleteError;
  if (!items.length) return;
  const rows = items.map((item, index) => ({
    user_id: userId,
    invoice_id: invoiceId,
    item_index: index,
    description: item.description,
    sku: item.sku || null,
    quantity: item.quantity || 0,
    unit_price: item.unitPrice || 0,
    line_total: item.total || 0,
    item_data: item,
  }));
  const { error } = await client.from("invoice_line_items").insert(rows);
  if (error) throw error;
}

function comparableSnapshot(invoice: InvoiceData) {
  return {
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    purchaseOrderNumber: invoice.purchaseOrderNumber,
    currency: invoice.currency,
    status: invoice.status,
    vendor: invoice.vendor,
    customer: invoice.customer,
    items: invoice.items,
    subtotal: invoice.subtotal,
    totalDiscount: invoice.totalDiscount,
    totalTax: invoice.totalTax,
    shippingFee: invoice.shippingFee,
    otherFees: invoice.otherFees,
    grandTotal: invoice.grandTotal,
    amountPaid: invoice.amountPaid,
    balanceDue: invoice.balanceDue,
    invoiceSubtype: invoice.invoiceSubtype,
    philippineTaxDetails: invoice.philippineTaxDetails,
    withholdingTaxRate: invoice.withholdingTaxRate,
    withholdingTaxAmount: invoice.withholdingTaxAmount,
    netAmountPayable: invoice.netAmountPayable,
    philippineInvoiceCompleteness: invoice.philippineInvoiceCompleteness,
    category: invoice.category,
    notes: invoice.notes,
  };
}

export async function updateInvoiceInSupabase(previous: InvoiceData, updated: InvoiceData, eventType = "HUMAN_EDIT"): Promise<void> {
  const client = requireSupabase();
  const userId = await requireUserId();
  const vendorId = await ensureVendor(updated);
  const { data: existingRow, error: existingError } = await client
    .from("invoices")
    .select("current_data,duplicate_status,duplicate_of_id")
    .eq("id", updated.id)
    .single();
  if (existingError) throw existingError;
  const durableAiSnapshot = existingRow?.current_data?.aiSnapshot || previous.aiSnapshot || updated.aiSnapshot;
  const currentData = {
    ...updated,
    ...(durableAiSnapshot ? { aiSnapshot: clone(durableAiSnapshot) } : {}),
  };
  const { error } = await client.from("invoices").update({
    vendor_id: vendorId,
    invoice_number: updated.invoiceNumber || null,
    invoice_date: updated.invoiceDate || null,
    due_date: updated.dueDate || null,
    currency: updated.currency || null,
    grand_total: updated.grandTotal || 0,
    payment_status: updated.status || "UNPAID",
    review_status: updated.reviewStatus || "NEEDS_REVIEW",
    duplicate_status: updated.duplicateStatus || existingRow?.duplicate_status || "UNIQUE",
    duplicate_of_id: updated.duplicateOfId || existingRow?.duplicate_of_id || null,
    document_type: updated.documentType || "OTHER",
    current_data: currentData,
    verified_at: updated.verifiedAt || null,
    updated_at: new Date().toISOString(),
  }).eq("id", updated.id);
  if (error) throw error;
  await replaceLineItems(updated.id, updated.items);

  const before = comparableSnapshot(previous);
  const after = comparableSnapshot(updated);
  const fields = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter((field) => JSON.stringify((before as any)[field] ?? null) !== JSON.stringify((after as any)[field] ?? null));
  if (fields.length || eventType !== "HUMAN_EDIT") {
    const events = (fields.length ? fields : [undefined]).map((field) => ({
      user_id: userId,
      invoice_id: updated.id,
      event_type: eventType,
      field_name: field || null,
      previous_value: field ? (before as any)[field] ?? null : before,
      new_value: field ? (after as any)[field] ?? null : after,
    }));
    const { error: eventError } = await client.from("invoice_review_events").insert(events);
    if (eventError) throw eventError;
  }
}

export async function deleteInvoiceFromSupabase(invoiceId: string) {
  const client = requireSupabase();
  const userId = await requireUserId();
  const archivedAt = new Date().toISOString();
  const { error } = await client.from("invoices").update({ archived_at: archivedAt, updated_at: archivedAt }).eq("id", invoiceId).eq("user_id", userId);
  if (error) throw error;
  const { error: eventError } = await client.from("invoice_review_events").insert({ user_id: userId, invoice_id: invoiceId, event_type: "INVOICE_ARCHIVED", new_value: { archivedAt } });
  if (eventError) throw eventError;
}

export async function loadReviewEvents(invoiceId: string): Promise<ReviewEvent[]> {
  const client = requireSupabase();
  await requireUserId();
  const { data, error } = await client
    .from("invoice_review_events")
    .select("id,invoice_id,event_type,field_name,previous_value,new_value,created_at")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    invoiceId: row.invoice_id,
    eventType: row.event_type,
    fieldName: row.field_name || undefined,
    previousValue: row.previous_value,
    newValue: row.new_value,
    createdAt: row.created_at,
  }));
}

export async function saveGmailSyncState(historyId?: string, emailAddress?: string) {
  const client = requireSupabase();
  const userId = await requireUserId();
  const { data: current, error: currentError } = await client
    .from("gmail_sync_state")
    .select("last_history_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (currentError) throw currentError;
  const incomingIsOlder = Boolean(historyId && current?.last_history_id && compareHistoryIds(historyId, current.last_history_id) < 0);
  const durableHistoryId = incomingIsOlder ? current?.last_history_id : (historyId || current?.last_history_id || null);
  const syncedAt = new Date().toISOString();
  const { error } = await client.from("gmail_sync_state").upsert({
    user_id: userId,
    last_history_id: durableHistoryId,
    last_synced_at: syncedAt,
    updated_at: syncedAt,
  });
  if (error) throw error;

  if (emailAddress) {
    const { error: connectionError } = await client.from("gmail_connections").upsert({
      user_id: userId,
      provider: "google",
      email: emailAddress,
      scopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.readonly"],
      last_history_id: durableHistoryId,
      last_synced_at: syncedAt,
      updated_at: syncedAt,
    }, { onConflict: "user_id,provider,email" });
    if (connectionError) throw connectionError;
  }
  return { lastHistoryId: durableHistoryId || undefined, lastSyncedAt: syncedAt };
}

export async function loadGmailSyncState() {
  const client = requireSupabase();
  const userId = await requireUserId();
  const { data, error } = await client.from("gmail_sync_state").select("last_history_id,last_synced_at").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return { lastHistoryId: data?.last_history_id || undefined, lastSyncedAt: data?.last_synced_at || undefined };
}

export async function markEmailClassification(emailId: string, classification: unknown) {
  const client = requireSupabase();
  await requireUserId();
  const { error } = await client.from("email_messages").update({ ai_classification: classification, processing_status: "CLASSIFIED", updated_at: new Date().toISOString() }).eq("id", emailId);
  if (error) throw error;
}

export async function markSourceDocumentStatus(sourceDocumentId: string, status: string, documentType?: string) {
  const client = requireSupabase();
  await requireUserId();
  const { error } = await client.from("source_documents").update({ processing_status: status, ...(documentType ? { document_type: documentType } : {}) }).eq("id", sourceDocumentId);
  if (error) throw error;
}

export async function loadEmailSource(emailId: string): Promise<{
  id: string;
  gmailMessageId?: string;
  sender: string;
  subject: string;
  receivedAt?: string;
  bodyText: string;
  bodyHtml?: string;
  rawStoragePath?: string;
  rawSignedUrl?: string;
} | null> {
  const client = requireSupabase();
  await requireUserId();
  const { data, error } = await client
    .from("email_messages")
    .select("id,gmail_message_id,sender,subject,received_at,body_text,body_html,raw_storage_path")
    .eq("id", emailId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    gmailMessageId: data.gmail_message_id || undefined,
    sender: data.sender || "",
    subject: data.subject || "",
    receivedAt: data.received_at || undefined,
    bodyText: data.body_text || "",
    bodyHtml: data.body_html || undefined,
    rawStoragePath: data.raw_storage_path || undefined,
    rawSignedUrl: data.raw_storage_path ? await signedUrl(EMAIL_BUCKET, data.raw_storage_path) : undefined,
  };
}
