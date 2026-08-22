import { InvoiceData, GmailImportedMessage, StoredEmailRecord, StoredSourceDocument, ReviewEvent } from "../types";
import { supabase } from "./supabase";

const INVOICE_BUCKET = "invoice-originals";
const EMAIL_BUCKET = "email-originals";

function requireSupabase() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

async function requireUserId() {
  const client = requireSupabase();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Sign in with Google before saving workspace data.");
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
    .select("id,current_data,source_document_id,source_email_id,review_status,verified_at,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const results: InvoiceData[] = [];
  for (const row of data || []) {
    const invoice = { ...(row.current_data || {}), id: row.id } as InvoiceData;
    invoice.sourceDocumentId = row.source_document_id || invoice.sourceDocumentId;
    invoice.sourceEmailId = row.source_email_id || invoice.sourceEmailId;
    invoice.reviewStatus = row.review_status || invoice.reviewStatus;
    invoice.verifiedAt = row.verified_at || invoice.verifiedAt;
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
      gmail_thread_id: message.threadId,
      gmail_history_id: message.historyId || null,
      subject: message.subject || "",
      sender: message.sender || "",
      recipients: message.to || [],
      cc: message.cc || [],
      received_at: message.receivedAt || null,
      body_text: message.bodyText || "",
      body_html: message.bodyHtml || "",
      snippet: message.snippet || "",
      labels: message.labels || [],
      raw_storage_path: rawStoragePath || null,
      processing_status: "IMPORTED",
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,gmail_message_id" })
    .select("id")
    .single();
  if (emailError) throw emailError;

  const documents: StoredSourceDocument[] = [];
  for (const attachment of message.attachments || []) {
    const bytes = decodeBase64(attachment.dataBase64);
    const hash = await sha256(bytes);
    const storagePath = `${userId}/${year}/${month}/${message.id}/${hash.slice(0, 12)}-${safeName(attachment.filename)}`;
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
        gmail_attachment_id: attachment.attachmentId,
        filename: attachment.filename,
        mime_type: attachment.mimeType,
        file_size: bytes.byteLength,
        storage_path: storagePath,
        sha256: hash,
        processing_status: "STORED",
      })
      .select("id")
      .single();
    if (error) throw error;
    documents.push({ id: row.id, emailMessageId: emailRow.id, filename: attachment.filename, mimeType: attachment.mimeType, size: bytes.byteLength, storagePath, sha256: hash, previewUrl: await signedUrl(INVOICE_BUCKET, storagePath) });
  }

  return {
    email: {
      id: emailRow.id,
      gmailMessageId: message.id,
      gmailThreadId: message.threadId,
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
  return (invoice.vendor?.companyName || invoice.vendor?.name || "Unknown vendor").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function ensureVendor(invoice: InvoiceData) {
  const client = requireSupabase();
  const userId = await requireUserId();
  const name = invoice.vendor?.companyName || invoice.vendor?.name || "Unknown vendor";
  const normalized = normalizedVendorName(invoice) || "unknown vendor";
  const { data, error } = await client
    .from("vendors")
    .upsert({
      user_id: userId,
      name,
      normalized_name: normalized,
      email: invoice.vendor?.email || null,
      phone: invoice.vendor?.phone || null,
      tax_id: invoice.vendor?.taxId || null,
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
  const vendorId = await ensureVendor(invoice);

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
      review_status: invoice.reviewStatus || "NEEDS_REVIEW",
      document_type: invoice.documentType || "INVOICE",
      current_data: invoice,
      verified_at: invoice.verifiedAt || null,
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
      model: invoice.modelUsed || "unknown",
      raw_result: invoice.rawJson || null,
      structured_result: invoice,
      confidence: invoice.confidenceScore ?? null,
      validation_result: invoice.validation || {},
    })
    .select("id")
    .single();
  if (extractionError) throw extractionError;

  const saved = { ...invoice, extractionId: extraction.id, aiSnapshot: JSON.parse(JSON.stringify(invoice)) };
  const { error: updateError } = await client.from("invoices").update({ current_data: saved }).eq("id", row.id);
  if (updateError) throw updateError;

  await client.from("invoice_review_events").insert({ user_id: userId, invoice_id: row.id, event_type: "AI_EXTRACTION_CREATED", new_value: { model: invoice.modelUsed, confidence: invoice.confidenceScore } });
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
    category: invoice.category,
    notes: invoice.notes,
  };
}

export async function updateInvoiceInSupabase(previous: InvoiceData, updated: InvoiceData, eventType = "HUMAN_EDIT"): Promise<void> {
  const client = requireSupabase();
  const userId = await requireUserId();
  const vendorId = await ensureVendor(updated);
  const { error } = await client.from("invoices").update({
    vendor_id: vendorId,
    invoice_number: updated.invoiceNumber || null,
    invoice_date: updated.invoiceDate || null,
    due_date: updated.dueDate || null,
    currency: updated.currency || null,
    grand_total: updated.grandTotal || 0,
    payment_status: updated.status || "UNPAID",
    review_status: updated.reviewStatus || "NEEDS_REVIEW",
    document_type: updated.documentType || "INVOICE",
    current_data: updated,
    verified_at: updated.verifiedAt || null,
    updated_at: new Date().toISOString(),
  }).eq("id", updated.id);
  if (error) throw error;
  await replaceLineItems(updated.id, updated.items);

  const before = comparableSnapshot(previous);
  const after = comparableSnapshot(updated);
  if (JSON.stringify(before) !== JSON.stringify(after) || eventType !== "HUMAN_EDIT") {
    const { error: eventError } = await client.from("invoice_review_events").insert({
      user_id: userId,
      invoice_id: updated.id,
      event_type: eventType,
      previous_value: before,
      new_value: after,
    });
    if (eventError) throw eventError;
  }
}

export async function deleteInvoiceFromSupabase(invoiceId: string) {
  const client = requireSupabase();
  await requireUserId();
  const { error } = await client.from("invoices").delete().eq("id", invoiceId);
  if (error) throw error;
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

export async function saveGmailSyncState(historyId?: string) {
  const client = requireSupabase();
  const userId = await requireUserId();
  const { error } = await client.from("gmail_sync_state").upsert({
    user_id: userId,
    last_history_id: historyId || null,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
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
  const { error } = await client.from("email_messages").update({ ai_classification: classification, updated_at: new Date().toISOString() }).eq("id", emailId);
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
