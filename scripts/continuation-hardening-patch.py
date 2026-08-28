from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, value: str) -> None:
    Path(path).write_text(value)


def replace_once(text: str, before: str, after: str, label: str) -> str:
    if before not in text:
        raise RuntimeError(f"Patch anchor missing: {label}")
    return text.replace(before, after, 1)


def replace_block(text: str, start: str, end: str, replacement: str, label: str) -> str:
    start_index = text.find(start)
    end_index = text.find(end, start_index + len(start))
    if start_index < 0 or end_index < 0:
        raise RuntimeError(f"Patch block missing: {label}")
    return text[:start_index] + replacement.rstrip() + "\n\n" + text[end_index:]


# Persistence and Gmail source hardening.
path = "src/lib/persistence.ts"
text = read(path)
text = replace_once(
    text,
    'import { companyStoragePath, requireActiveCompanyId } from "./companyContext";\n',
    'import { companyStoragePath, requireActiveCompanyId } from "./companyContext";\nimport { MAX_GMAIL_ATTACHMENT_TOTAL_BYTES, validateGmailAttachmentBytes, validateGmailAttachmentEnvelope, validateGmailRawMessage, validateInvoiceDocumentBytes } from "./fileSecurity";\n',
    "persistence file-security import",
)

signed_url = '''async function signedUrl(bucket: string, storagePath?: string | null) {
  if (!storagePath) return undefined;
  const client = requireSupabase();
  const { data } = await client.storage.from(bucket).createSignedUrl(storagePath, 60 * 60);
  return data?.signedUrl || undefined;
}
'''
signed_url_hardened = '''async function signedUrl(bucket: string, storagePath?: string | null) {
  if (!storagePath) return undefined;
  const client = requireSupabase();
  const { data } = await client.storage.from(bucket).createSignedUrl(storagePath, 60 * 60);
  return data?.signedUrl || undefined;
}

function storageErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message || "unknown error");
  return String(error || "unknown error");
}

async function cleanupUploadedObject(bucket: string, storagePath: string, originalError: unknown): Promise<never> {
  const client = requireSupabase();
  const { error: cleanupError } = await client.storage.from(bucket).remove([storagePath]);
  if (cleanupError) {
    throw new Error(`Persistence failed (${storageErrorMessage(originalError)}), and the uploaded object could not be cleaned up (${storageErrorMessage(cleanupError)}).`);
  }
  throw originalError;
}

async function storageTokenForOpaqueId(value: string, label: string) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${label} is required.`);
  const digest = await sha256(new TextEncoder().encode(normalized));
  const prefix = safeName(normalized).slice(0, 32) || "id";
  return `${prefix}-${digest.slice(0, 16)}`;
}
'''
text = replace_once(text, signed_url, signed_url_hardened, "persistence cleanup helpers")

manual = '''export async function saveManualSourceDocument(input: { fileData: string; mimeType: string; fileName: string; emailMessageId?: string; sourceType?: "UPLOAD" | "EMAIL" }): Promise<StoredSourceDocument> {
  const client = requireSupabase();
  const userId = await requireUserId();
  const companyId = requireActiveCompanyId();
  const bytes = decodeBase64(input.fileData);
  validateInvoiceDocumentBytes(bytes, input.mimeType, input.fileName);
  const hash = await sha256(bytes);

  const { data: existingRows, error: existingError } = await client
    .from("source_documents")
    .select("id,email_message_id,gmail_attachment_id,gmail_part_id,attachment_index,filename,mime_type,file_size,storage_path,sha256,processing_status,document_type,created_at")
    .eq("company_id", companyId)
    .eq("sha256", hash)
    .order("created_at", { ascending: false })
    .limit(1);
  if (existingError) throw existingError;
  if (existingRows?.[0]) return sourceDocumentFromRow(existingRows[0]);

  const now = new Date();
  const storagePath = `${companyStoragePath("invoices", "manual", String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, "0"))}/${hash.slice(0, 12)}-${crypto.randomUUID().slice(0, 8)}-${safeName(input.fileName)}`;
  const { error: uploadError } = await client.storage.from(INVOICE_BUCKET).upload(storagePath, bytes, {
    contentType: input.mimeType,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data, error } = await client
    .from("source_documents")
    .insert({
      user_id: userId,
      company_id: companyId,
      source_type: input.sourceType || "UPLOAD",
      email_message_id: input.emailMessageId || null,
      filename: input.fileName,
      mime_type: input.mimeType,
      file_size: bytes.byteLength,
      storage_path: storagePath,
      sha256: hash,
      processing_status: "STORED",
    })
    .select("id")
    .single();
  if (error) return cleanupUploadedObject(INVOICE_BUCKET, storagePath, error);

  return { id: data.id, emailMessageId: input.emailMessageId, filename: input.fileName, mimeType: input.mimeType, size: bytes.byteLength, storagePath, sha256: hash, processingStatus: "STORED", previewUrl: await signedUrl(INVOICE_BUCKET, storagePath) };
}'''
text = replace_block(text, "export async function saveManualSourceDocument", "export async function loadSourcePayloadForRetry", manual, "manual source persistence")

gmail = '''export async function saveGmailMessageSource(message: GmailImportedMessage): Promise<{ email: StoredEmailRecord; documents: StoredSourceDocument[] }> {
  const client = requireSupabase();
  const userId = await requireUserId();
  const companyId = requireActiveCompanyId();
  const messageStorageToken = await storageTokenForOpaqueId(message.id, "Gmail message ID");
  const attachments = message.attachments || [];
  validateGmailAttachmentEnvelope(attachments);
  const received = message.receivedAt ? new Date(message.receivedAt) : new Date();
  const year = received.getUTCFullYear();
  const month = String(received.getUTCMonth() + 1).padStart(2, "0");
  let rawStoragePath: string | undefined;
  let rawWasCreated = false;

  const { data: previousEmail, error: previousEmailError } = await client
    .from("email_messages")
    .select("id,raw_storage_path")
    .eq("company_id", companyId)
    .eq("gmail_message_id", message.id)
    .maybeSingle();
  if (previousEmailError) throw previousEmailError;

  if (message.rawBase64Url) {
    if (previousEmail?.raw_storage_path) {
      rawStoragePath = previousEmail.raw_storage_path;
    } else {
      const rawBytes = base64UrlToBytes(message.rawBase64Url);
      validateGmailRawMessage(rawBytes);
      rawStoragePath = `${companyStoragePath("emails", String(year), month, messageStorageToken)}/message.eml`;
      const { error } = await client.storage.from(EMAIL_BUCKET).upload(rawStoragePath, rawBytes, { contentType: "message/rfc822", upsert: false });
      if (error) throw error;
      rawWasCreated = true;
    }
  }

  const { data: emailRow, error: emailError } = await client
    .from("email_messages")
    .upsert({
      user_id: userId,
      company_id: companyId,
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
      has_attachments: Boolean(attachments.length),
      attachment_count: attachments.length,
      ...(rawStoragePath ? { raw_storage_path: rawStoragePath } : {}),
      processing_status: "IMPORTED",
      updated_at: new Date().toISOString(),
    }, { onConflict: "company_id,gmail_message_id" })
    .select("id")
    .single();
  if (emailError) {
    if (rawWasCreated && rawStoragePath) return cleanupUploadedObject(EMAIL_BUCKET, rawStoragePath, emailError);
    throw emailError;
  }

  const documents: StoredSourceDocument[] = [];
  let actualAttachmentBytes = 0;
  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index];
    const attachmentId = attachment.attachmentId || attachment.partId || `part-${index}`;
    const attachmentStorageToken = await storageTokenForOpaqueId(attachmentId, "Gmail attachment ID");
    const { data: existingDocument, error: existingError } = await client
      .from("source_documents")
      .select("id,email_message_id,gmail_attachment_id,gmail_part_id,attachment_index,filename,mime_type,file_size,storage_path,sha256,processing_status,document_type")
      .eq("company_id", companyId)
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
    validateGmailAttachmentBytes(bytes, attachment.mimeType, attachment.filename);
    actualAttachmentBytes += bytes.byteLength;
    if (actualAttachmentBytes > MAX_GMAIL_ATTACHMENT_TOTAL_BYTES) throw new Error("Gmail attachment payload exceeds the 25 MB aggregate limit.");
    const hash = await sha256(bytes);
    const storagePath = `${companyStoragePath("invoices", String(year), month, messageStorageToken)}/${attachmentStorageToken}-${hash.slice(0, 12)}-${safeName(attachment.filename)}`;
    const { error: uploadError } = await client.storage.from(INVOICE_BUCKET).upload(storagePath, bytes, {
      contentType: attachment.mimeType,
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const { data: row, error } = await client
      .from("source_documents")
      .insert({
        user_id: userId,
        company_id: companyId,
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
      const { error: cleanupError } = await client.storage.from(INVOICE_BUCKET).remove([storagePath]);
      if (cleanupError) throw new Error(`Gmail attachment persistence failed (${storageErrorMessage(error)}), and Storage cleanup also failed (${storageErrorMessage(cleanupError)}).`);
      if (error.code !== "23505") throw error;
      const { data: racedDocument, error: racedError } = await client
        .from("source_documents")
        .select("id,email_message_id,gmail_attachment_id,gmail_part_id,attachment_index,filename,mime_type,file_size,storage_path,sha256,processing_status,document_type")
        .eq("company_id", companyId)
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
}'''
text = replace_block(text, "export async function saveGmailMessageSource", "function normalizedVendorName", gmail, "gmail persistence")

text = replace_once(
    text,
    '''    .from("source_documents")
    .select("id,filename,mime_type,storage_path")
    .eq("email_message_id", emailId)
    .order("attachment_index", { ascending: true });''',
    '''    .from("source_documents")
    .select("id,filename,mime_type,storage_path")
    .eq("company_id", requireActiveCompanyId())
    .eq("email_message_id", emailId)
    .order("attachment_index", { ascending: true });''',
    "email attachment company filter",
)
write(path, text)

# Engineering document Storage path segment validation.
path = "src/lib/engineeringDocumentsPersistence.ts"
text = read(path)
text = replace_once(
    text,
    'import { getActiveCompanyId, requireActiveCompanyId } from "./companyContext.ts";\n',
    'import { getActiveCompanyId, requireActiveCompanyId } from "./companyContext.ts";\nimport { safeStorageSegment } from "./fileSecurity.ts";\n',
    "engineering safe path import",
)
text = replace_once(
    text,
    '''  const normalizedCompanyId = companyId.trim();
  const normalizedDocumentId = documentId.trim();
  const normalizedRevisionId = revisionId.trim();
  if (!normalizedCompanyId || !normalizedDocumentId || !normalizedRevisionId) throw new Error("Company, document, and revision IDs are required for Storage uploads.");''',
    '''  const normalizedCompanyId = safeStorageSegment(companyId, "Company ID");
  const normalizedDocumentId = safeStorageSegment(documentId, "Engineering document ID");
  const normalizedRevisionId = safeStorageSegment(revisionId, "Engineering revision ID");''',
    "engineering storage path validation",
)
text = replace_once(
    text,
    '''  const parts = filePath.trim().split("/");
  const normalizedCompanyId = companyId.trim();
  const normalizedDocumentId = documentId.trim();
  const normalizedRevisionId = revisionId.trim();
  return parts.length === 7''',
    '''  const parts = filePath.trim().split("/");
  let normalizedCompanyId: string;
  let normalizedDocumentId: string;
  let normalizedRevisionId: string;
  try {
    normalizedCompanyId = safeStorageSegment(companyId, "Company ID");
    normalizedDocumentId = safeStorageSegment(documentId, "Engineering document ID");
    normalizedRevisionId = safeStorageSegment(revisionId, "Engineering revision ID");
  } catch {
    return false;
  }
  return parts.length === 7''',
    "engineering path predicate validation",
)
write(path, text)

# Payroll import source validation and path hardening.
path = "src/lib/payrollImportPersistence.ts"
text = read(path)
text = replace_once(
    text,
    'import { companyStoragePath, requireActiveCompanyId } from "./companyContext.ts";\n',
    'import { companyStoragePath, requireActiveCompanyId } from "./companyContext.ts";\nimport { safeStorageSegment, validatePayrollImportBytes } from "./fileSecurity.ts";\n',
    "payroll import security import",
)
text = replace_once(
    text,
    '''export async function uploadPayrollImportSourceToSupabase(input: { batchId: string; fileName: string; mimeType?: string; bytes: Uint8Array }) {
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before uploading payroll source files.");
  const storagePath = `${companyStoragePath("payroll-imports", input.batchId)}/${safeName(input.fileName)}`;
  const { error } = await supabase.storage.from(PAYROLL_IMPORT_BUCKET).upload(storagePath, input.bytes, { contentType: input.mimeType, upsert: false });
  if (error) throw error;''',
    '''export async function uploadPayrollImportSourceToSupabase(input: { batchId: string; fileName: string; mimeType?: string; bytes: Uint8Array }) {
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before uploading payroll source files.");
  validatePayrollImportBytes(input.bytes, input.fileName, input.mimeType);
  const batchId = safeStorageSegment(input.batchId, "Payroll import batch ID");
  const storagePath = `${companyStoragePath("payroll-imports", batchId)}/${safeName(input.fileName)}`;
  const { error } = await supabase.storage.from(PAYROLL_IMPORT_BUCKET).upload(storagePath, input.bytes, { contentType: input.mimeType, upsert: false });
  if (error) throw error;''',
    "payroll source validation",
)
write(path, text)

# Disable formula interpretation for untrusted spreadsheets.
path = "src/lib/payrollImport.ts"
text = read(path)
if "cellFormula: true" not in text:
    raise RuntimeError("Patch anchor missing: payroll formula parsing")
text = text.replace("cellFormula: true", "cellFormula: false")
write(path, text)

# Bind server requests to the deployment company and reduce global body limits.
path = "server.ts"
text = read(path)
text = replace_once(
    text,
    '''  const companyId = firstHeaderValue(req.headers["x-company-id"]).trim();
  if (!companyId || !UUID_PATTERN.test(companyId)) {
    throw new ApiAuthorizationError(400, "COMPANY_REQUIRED", "A valid company context is required for this operation.");
  }

  const { data: allowed, error: permissionError } = await client.rpc("has_company_permission", {''',
    '''  const companyId = firstHeaderValue(req.headers["x-company-id"]).trim();
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

  const { data: allowed, error: permissionError } = await client.rpc("has_company_permission", {''',
    "normal server deployment binding",
)
text = replace_once(
    text,
    '''async function authorizePlatformCompanyRequest(req: express.Request, companyId: string): Promise<CompanyRequestAuthorization> {
  if (!UUID_PATTERN.test(companyId)) throw new ApiAuthorizationError(400, "COMPANY_REQUIRED", "A valid company context is required for this operation.");
  const auth = await authenticateServerRequest(req);
  const { data, error } = await auth.supabase.rpc("is_platform_admin");''',
    '''async function authorizePlatformCompanyRequest(req: express.Request, companyId: string): Promise<CompanyRequestAuthorization> {
  if (!UUID_PATTERN.test(companyId)) throw new ApiAuthorizationError(400, "COMPANY_REQUIRED", "A valid company context is required for this operation.");
  const auth = await authenticateServerRequest(req);
  const { data: deploymentCompanyId, error: deploymentError } = await auth.supabase.rpc("get_deployment_company_id");
  if (deploymentError || deploymentCompanyId !== companyId) {
    throw new ApiAuthorizationError(deploymentError ? 503 : 403, deploymentError ? "SERVER_AUTH_UNAVAILABLE" : "FORBIDDEN", deploymentError ? "Deployment company authorization is temporarily unavailable." : "Platform maintenance cannot target another Engoryx deployment company.");
  }
  const { data, error } = await auth.supabase.rpc("is_platform_admin");''',
    "platform server deployment binding",
)
text = replace_once(
    text,
    '''app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));''',
    '''// Binary sources are validated before Storage persistence. Keep the global
// JSON ceiling large enough for the documented 10 MB invoice source after
// base64 expansion, while rejecting the previous unrestricted 50 MB envelope.
app.use(express.json({ limit: "16mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));''',
    "global request body limits",
)
write(path, text)

# Assistant requests must be deployment-bound and require ordinary membership.
path = "src/server/assistant/assistantHandler.ts"
text = read(path)
text = replace_once(
    text,
    '''  const companyId = firstHeader(req.headers["x-company-id"]).trim();
  if (!UUID_HEADER_PATTERN.test(companyId)) throw new AssistantBackendError("COMPANY_REQUIRED", "A valid company context is required.", 400);
  const [membership, platform] = await Promise.all([
    supabase.rpc("is_active_company_member", { p_company_id: companyId }),
    supabase.rpc("is_platform_admin"),
  ]);
  if (membership.error || platform.error) throw new AssistantBackendError("AUTHORIZATION_UNAVAILABLE", "Company authorization is temporarily unavailable.", 503);
  if (membership.data !== true && platform.data !== true) throw new AssistantBackendError("FORBIDDEN", "You do not have access to this company.", 403);
  return { accessToken, companyId, supabase, user: data.user };''',
    '''  const companyId = firstHeader(req.headers["x-company-id"]).trim();
  if (!UUID_HEADER_PATTERN.test(companyId)) throw new AssistantBackendError("COMPANY_REQUIRED", "A valid company context is required.", 400);
  const deployment = await supabase.rpc("get_deployment_company_id");
  if (deployment.error || typeof deployment.data !== "string" || !UUID_HEADER_PATTERN.test(deployment.data)) {
    throw new AssistantBackendError("AUTHORIZATION_UNAVAILABLE", "Deployment company authorization is temporarily unavailable.", 503);
  }
  if (deployment.data !== companyId) throw new AssistantBackendError("FORBIDDEN", "The Assistant cannot target another Engoryx deployment company.", 403);
  const membership = await supabase.rpc("is_active_company_member", { p_company_id: companyId });
  if (membership.error) throw new AssistantBackendError("AUTHORIZATION_UNAVAILABLE", "Company authorization is temporarily unavailable.", 503);
  if (membership.data !== true) throw new AssistantBackendError("FORBIDDEN", "You do not have active access to this Engoryx deployment company.", 403);
  return { accessToken, companyId, supabase, user: data.user };''',
    "assistant deployment binding",
)
write(path, text)

# Workflow map: deployment -> configured company -> membership -> RBAC.
path = "scripts/workflow-map/graph.ts"
text = read(path)
text = replace_once(
    text,
    '''  node({
    id: "production-mode",
    label: "Authenticated production mode",
    domain: "platform-tenancy",
    type: "workflow",
    scope: "company",
    description: "Mounts CompanyAccessProvider and the production App/route shell for an authenticated, company-scoped workspace.",
    sourceClassification: "mixed",
    fileRefs: ["src/main.tsx", "src/App.tsx", "src/app/AppProviders.tsx", "src/context/CompanyAccessContext.tsx"],
    testRefs: ["tests/auth.test.ts", "tests/companyAccess.test.ts"],
    invariantIds: ["company-rbac-is-authoritative"],
  }),''',
    '''  node({
    id: "production-mode",
    label: "Authenticated production mode",
    domain: "platform-tenancy",
    type: "workflow",
    scope: "company",
    description: "Mounts the production application for the one company configured to this Engoryx deployment; users do not choose or switch unrelated companies.",
    sourceClassification: "mixed",
    fileRefs: ["src/main.tsx", "src/App.tsx", "src/app/AppProviders.tsx", "src/context/CompanyAccessContext.tsx", "src/lib/deploymentCompany.ts"],
    testRefs: ["tests/auth.test.ts", "tests/companyAccess.test.ts", "tests/singleCompanyDeployment.test.ts"],
    invariantIds: ["company-rbac-is-authoritative"],
  }),
  node({
    id: "deployment-company",
    label: "Deployment configured company",
    domain: "platform-tenancy",
    type: "data",
    scope: "company",
    description: "A singleton deployment configuration resolves exactly one client company before membership and role permissions are evaluated.",
    sourceClassification: "mixed",
    fileRefs: ["src/lib/deploymentCompany.ts", "src/context/CompanyAccessContext.tsx", "supabase/migrations/20260828150000_single_company_deployment.sql"],
    testRefs: ["tests/singleCompanyDeployment.test.ts"],
    invariantIds: ["company-rbac-is-authoritative"],
    tags: ["single-company-deployment"],
  }),''',
    "workflow deployment company node",
)
text = replace_once(text, '    id: "company-context",\n    label: "Active company context",', '    id: "company-context",\n    label: "Deployment company context",', "workflow company label")
text = replace_once(
    text,
    '    description: "Selected active company, company summaries, membership state, and current permission set used by production workspace loaders.",',
    '    description: "The deployment-resolved company plus the authenticated user membership and permission snapshot; no tenant picker or unrelated company selection is authoritative.",',
    "workflow company description",
)
text = replace_once(text, '    id: "company-membership",\n    label: "Company membership and access snapshot",', '    id: "company-membership",\n    label: "User membership and role permissions",', "workflow membership label")
text = replace_once(
    text,
    '''  edge({ id: "production-to-company-context", source: "production-mode", target: "company-context", type: "reads", kind: "context", label: "loads access context", invariantIds: ["company-rbac-is-authoritative"] }),
  edge({ id: "company-membership-to-company-context", source: "company-membership", target: "company-context", type: "feeds", kind: "context", label: "resolves active company", invariantIds: ["company-rbac-is-authoritative"] }),''',
    '''  edge({ id: "production-to-deployment-company", source: "production-mode", target: "deployment-company", type: "reads", kind: "context", label: "resolves configured company", invariantIds: ["company-rbac-is-authoritative"] }),
  edge({ id: "deployment-company-to-membership", source: "deployment-company", target: "company-membership", type: "guards", kind: "guard", label: "deployment membership only", invariantIds: ["company-rbac-is-authoritative"] }),
  edge({ id: "company-membership-to-company-context", source: "company-membership", target: "company-context", type: "feeds", kind: "context", label: "membership and permissions", invariantIds: ["company-rbac-is-authoritative"] }),''',
    "workflow single-company edge chain",
)
write(path, text)

# Pin database CI to a CLI that understands the current Supabase config schema.
path = ".github/workflows/database-tests.yml"
text = read(path)
if "version: 2.76.8" not in text:
    raise RuntimeError("Patch anchor missing: Supabase CLI pin")
text = text.replace("version: 2.76.8", "version: 2.115.0")
write(path, text)

# Focused security regression coverage.
write(
    "tests/fileSecurity.test.ts",
    '''import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_GMAIL_ATTACHMENT_COUNT,
  safeStorageSegment,
  validateGmailAttachmentEnvelope,
  validateGmailRawMessage,
  validateInvoiceDocumentBytes,
  validatePayrollImportBytes,
} from "../src/lib/fileSecurity.ts";

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

test("persisted document validation rejects MIME/signature confusion", () => {
  assert.doesNotThrow(() => validateInvoiceDocumentBytes(pdf, "application/pdf", "invoice.pdf"));
  assert.throws(() => validateInvoiceDocumentBytes(png, "application/pdf", "invoice.pdf"), /valid PDF/i);
  assert.throws(() => validateInvoiceDocumentBytes(pdf, "image/png", "invoice.png"), /valid PDF|JPEG|PNG|WebP/i);
});

test("Storage path segments reject traversal and separators", () => {
  assert.equal(safeStorageSegment("abc-123", "id"), "abc-123");
  assert.throws(() => safeStorageSegment("../other", "id"), /unsafe path/i);
  assert.throws(() => safeStorageSegment("a/b", "id"), /unsafe path/i);
});

test("Gmail envelope and raw message limits fail closed", () => {
  assert.throws(() => validateGmailAttachmentEnvelope(Array.from({ length: MAX_GMAIL_ATTACHMENT_COUNT + 1 }, () => ({ dataBase64: "AA==" }))), /at most/i);
  assert.doesNotThrow(() => validateGmailRawMessage(new TextEncoder().encode("From: sender@example.com\\r\\nSubject: Invoice\\r\\n\\r\\nBody")));
  assert.throws(() => validateGmailRawMessage(new Uint8Array([0, 1, 2, 3])), /RFC-style/i);
});

test("payroll imports require supported signatures", () => {
  const xlsx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);
  assert.doesNotThrow(() => validatePayrollImportBytes(xlsx, "payroll.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
  assert.throws(() => validatePayrollImportBytes(pdf, "payroll.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), /signature/i);
});
''',
)

print("Continuation hardening patch applied.")
