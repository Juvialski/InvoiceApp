import {
  createInitialEngineeringDocumentsWorkspaceData,
  engineeringId,
  type AnnotationGeometry,
  type AnnotationStyle,
  type AnnotationType,
  type DisciplineType,
  type DrawingAnnotation,
  type EngineeringDocument,
  type EngineeringDocumentRevision,
  type EngineeringDocumentsWorkspaceData,
  type EngineeringDocumentType,
} from "./engineeringDocuments.ts";
import { getActiveCompanyId, requireActiveCompanyId } from "./companyContext.ts";
import { safeStorageSegment } from "./fileSecurity.ts";
import { supabase } from "./supabase.ts";
import {
  parseEngineeringLifecyclePreview,
  parseEngineeringLifecycleResult,
  type EngineeringLifecyclePreview,
  type EngineeringLifecycleResult,
} from "./engineeringLifecycle.ts";

export const ENGINEERING_WORKSPACE_STORAGE_KEY = "invoice_engineering_documents_workspace_v1";
export const ENGINEERING_DOCUMENTS_BUCKET = "engineering-documents";
export const ENGINEERING_DOCUMENT_MAX_FILE_BYTES = 50 * 1024 * 1024;

const PDF_SIGNATURE = "%PDF-";

type Row = Record<string, unknown>;

export interface PreparedEngineeringPdf {
  bytes: Uint8Array;
  fileName: string;
  contentType: "application/pdf";
  fileSizeBytes: number;
  fileFingerprint: string;
}

function safeFileName(fileName: string): string {
  const normalized = fileName.trim().split(/[\\/]/).pop() || "drawing.pdf";
  return normalized.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "drawing.pdf";
}

async function bytesFromFile(file: Blob | ArrayBuffer | Uint8Array | File): Promise<Uint8Array> {
  if (file instanceof Uint8Array) return new Uint8Array(file);
  if (file instanceof ArrayBuffer) return new Uint8Array(file);
  if (typeof Blob !== "undefined" && file instanceof Blob) return new Uint8Array(await file.arrayBuffer());
  if ("arrayBuffer" in file && typeof file.arrayBuffer === "function") {
    return new Uint8Array(await file.arrayBuffer());
  }
  throw new Error("The selected engineering file could not be read.");
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("This browser cannot calculate a SHA-256 file fingerprint.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function calculateEngineeringFileFingerprint(file: Blob | ArrayBuffer | Uint8Array | File): Promise<string> {
  return `sha256:${await sha256Hex(await bytesFromFile(file))}`;
}

export async function prepareEngineeringPdf(
  file: Blob | ArrayBuffer | Uint8Array | File,
  options: { fileName?: string; contentType?: string } = {},
): Promise<PreparedEngineeringPdf> {
  const bytes = await bytesFromFile(file);
  const fileName = safeFileName(options.fileName || ("name" in file ? String(file.name || "drawing.pdf") : "drawing.pdf"));
  const suppliedContentType = options.contentType || ("type" in file ? file.type : "");
  const contentType = String(suppliedContentType || "").trim().toLowerCase();

  if (bytes.byteLength <= 0) throw new Error("Select a non-empty PDF file.");
  if (bytes.byteLength > ENGINEERING_DOCUMENT_MAX_FILE_BYTES) {
    throw new Error(`Engineering PDF files must be ${Math.round(ENGINEERING_DOCUMENT_MAX_FILE_BYTES / (1024 * 1024))} MB or smaller.`);
  }
  const signature = new TextDecoder().decode(bytes.slice(0, PDF_SIGNATURE.length));
  if (!fileName.toLowerCase().endsWith(".pdf") || (contentType && contentType !== "application/pdf")) {
    throw new Error("Engineering document uploads must be PDF files.");
  }
  if (signature !== PDF_SIGNATURE) throw new Error("The selected file is not a valid PDF source.");

  return {
    bytes,
    fileName,
    contentType: "application/pdf",
    fileSizeBytes: bytes.byteLength,
    fileFingerprint: `sha256:${await sha256Hex(bytes)}`,
  };
}

export function getEngineeringDocumentStoragePath(companyId: string, documentId: string, revisionId: string, fileName: string): string {
  const normalizedCompanyId = safeStorageSegment(companyId, "Company ID");
  const normalizedDocumentId = safeStorageSegment(documentId, "Engineering document ID");
  const normalizedRevisionId = safeStorageSegment(revisionId, "Engineering revision ID");
  return `companies/${normalizedCompanyId}/documents/${normalizedDocumentId}/revisions/${normalizedRevisionId}/${safeFileName(fileName)}`;
}

export function isEngineeringDocumentStoragePathForRevision(
  filePath: string,
  companyId: string,
  documentId: string,
  revisionId: string,
): boolean {
  const parts = filePath.trim().split("/");
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
  return parts.length === 7
    && parts[0] === "companies"
    && parts[1] === normalizedCompanyId
    && parts[2] === "documents"
    && parts[3] === normalizedDocumentId
    && parts[4] === "revisions"
    && parts[5] === normalizedRevisionId
    && Boolean(normalizedCompanyId && normalizedDocumentId && normalizedRevisionId)
    && /^[a-zA-Z0-9._-]+\.pdf$/i.test(parts[6]);
}

function parseEngineeringRpcResult(value: unknown, expectedCompanyId?: string): { document: EngineeringDocument; revision: EngineeringDocumentRevision } {
  if (!value || typeof value !== "object") throw new Error("Engineering document persistence returned an invalid result.");
  const result = value as Record<string, unknown>;
  if (!result.document || !result.revision) throw new Error("Engineering document persistence did not return the committed document and revision.");
  const document = documentFromRow(result.document as Row);
  const revision = revisionFromRow(result.revision as Row);
  const normalizedExpectedCompanyId = expectedCompanyId?.trim().toLowerCase();
  const documentCompanyId = document.companyId?.trim().toLowerCase();
  const revisionCompanyId = revision.companyId?.trim().toLowerCase();
  if (revision.documentId !== document.id || document.currentRevisionId !== revision.id || (normalizedExpectedCompanyId && (documentCompanyId !== normalizedExpectedCompanyId || revisionCompanyId !== normalizedExpectedCompanyId))) {
    throw new Error("Engineering document persistence returned a mismatched document revision.");
  }
  return {
    document,
    revision,
  };
}

function text(value: unknown): string | undefined {
  return value === null || value === undefined || value === "" ? undefined : String(value);
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isUuid(value: string | undefined): boolean {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function persistedId(value: string | undefined, prefix: string): string {
  return isUuid(value) ? value! : engineeringId(prefix);
}

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") return value as T;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export function documentFromRow(row: Row): EngineeringDocument {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    projectId: text(row.project_id),
    documentNumber: String(row.document_number || ""),
    title: String(row.title || ""),
    description: text(row.description),
    discipline: String(row.discipline || "GENERAL_ENGINEERING") as DisciplineType,
    documentType: String(row.document_type || "DRAWING") as EngineeringDocumentType,
    status: String(row.status || "DRAFT") as EngineeringDocument["status"],
    currentRevisionId: text(row.current_revision_id),
    currentRevisionNumber: String(row.current_revision_number || "0"),
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    metadata: parseJsonField<Record<string, unknown>>(row.metadata, {}),
    createdByUserId: text(row.created_by_user_id),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
    archivedAt: text(row.archived_at),
    lifecycleReason: text(row.lifecycle_reason),
    lifecycleActorUserId: text(row.lifecycle_actor_user_id),
    supersededAt: text(row.superseded_at),
    supersededByUserId: text(row.superseded_by_user_id),
  };
}

export function revisionFromRow(row: Row): EngineeringDocumentRevision {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    documentId: String(row.document_id),
    revisionNumber: String(row.revision_number || "0"),
    revisionLabel: text(row.revision_label),
    fileName: String(row.file_name || "drawing.pdf"),
    filePath: String(row.file_path || ""),
    fileSizeBytes: numberValue(row.file_size_bytes),
    fileType: String(row.file_type || "application/pdf"),
    fileFingerprint: String(row.file_fingerprint || ""),
    pageCount: row.page_count === null || row.page_count === undefined ? undefined : numberValue(row.page_count),
    sheetSize: text(row.sheet_size),
    scale: text(row.scale),
    changeSummary: text(row.change_summary),
    status: String(row.status || "PENDING_REVIEW") as EngineeringDocumentRevision["status"],
    storageProvider: text(row.storage_provider) || "supabase",
    storageBucket: text(row.storage_bucket) || "engineering-documents",
    createdByUserId: text(row.created_by_user_id),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}


export function annotationFromRow(row: Row): DrawingAnnotation {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    documentId: String(row.document_id),
    revisionId: String(row.revision_id),
    pageNumber: numberValue(row.page_number, 1),
    annotationType: String(row.annotation_type || "RECTANGLE") as AnnotationType,
    geometry: parseJsonField<AnnotationGeometry>(row.geometry, {}),
    style: parseJsonField<AnnotationStyle>(row.style, {}),
    content: text(row.content),
    measurementValue: row.measurement_value === null || row.measurement_value === undefined ? undefined : numberValue(row.measurement_value),
    measurementUnit: text(row.measurement_unit),
    status: String(row.status || "OPEN") as DrawingAnnotation["status"],
    resolvedByUserId: text(row.resolved_by_user_id),
    resolvedAt: text(row.resolved_at),
    createdByUserId: text(row.created_by_user_id),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

export function emptyEngineeringDocumentsWorkspaceData(): EngineeringDocumentsWorkspaceData {
  return {
    documents: [],
    revisions: [],
    annotations: [],
  };
}

export function readEngineeringDocumentsWorkspaceFromLocal(
  storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage
): EngineeringDocumentsWorkspaceData {
  if (!storage) return createInitialEngineeringDocumentsWorkspaceData();
  try {
    const raw = storage.getItem(ENGINEERING_WORKSPACE_STORAGE_KEY);
    if (!raw) return createInitialEngineeringDocumentsWorkspaceData();
    const parsed = JSON.parse(raw);
    return {
      documents: Array.isArray(parsed.documents) ? parsed.documents : [],
      revisions: Array.isArray(parsed.revisions) ? parsed.revisions : [],
      annotations: Array.isArray(parsed.annotations) ? parsed.annotations : [],
    };
  } catch {
    return createInitialEngineeringDocumentsWorkspaceData();
  }
}

export function writeEngineeringDocumentsWorkspaceToLocal(
  data: EngineeringDocumentsWorkspaceData,
  storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage
): void {
  try {
    storage?.setItem(ENGINEERING_WORKSPACE_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Local storage fallback is best-effort.
  }
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user?.id || null;
}

function requireRemoteUser(userId: string | null): string {
  if (!supabase || !userId) throw new Error("Authentication required for Engineering Documents.");
  return userId;
}

function resolveCompanyId(companyId?: string): string {
  const activeCompanyId = getActiveCompanyId();
  const resolved = companyId?.trim() || activeCompanyId || requireActiveCompanyId();
  if (activeCompanyId && activeCompanyId !== resolved) throw new Error("Deployment company access changed. Reload the engineering workspace and retry.");
  return resolved;
}

export async function loadEngineeringDocumentsWorkspaceFromSupabase(
  explicitCompanyId?: string
): Promise<EngineeringDocumentsWorkspaceData> {
  const userId = requireRemoteUser(await currentUserId());
  const companyId = resolveCompanyId(explicitCompanyId);

  const [docsResult, revsResult, annsResult] = await Promise.all([
    supabase!
      .from("engineering_documents")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
    supabase!
      .from("engineering_document_revisions")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
    supabase!
      .from("drawing_annotations")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true }),
  ]);

  if (docsResult.error) throw docsResult.error;
  if (revsResult.error) throw revsResult.error;
  if (annsResult.error) throw annsResult.error;

  const data: EngineeringDocumentsWorkspaceData = {
    documents: (docsResult.data || []).map((r) => documentFromRow(r as Row)),
    revisions: (revsResult.data || []).map((r) => revisionFromRow(r as Row)),
    annotations: (annsResult.data || []).map((r) => annotationFromRow(r as Row)),
  };

  void userId;
  return data;
}

export async function archiveEngineeringDocumentInSupabase(
  documentId: string,
  explicitCompanyId?: string
): Promise<EngineeringDocument> {
  const result = await applyEngineeringDocumentLifecycleInSupabase(
    documentId,
    "ARCHIVE",
    "Confirmed engineering document archive",
    explicitCompanyId,
  );
  if (!result.record) throw new Error("The document lifecycle action did not return the committed document.");
  return result.record;
}

export async function previewEngineeringDocumentLifecycleInSupabase(
  documentId: string,
  explicitCompanyId?: string,
): Promise<EngineeringLifecyclePreview> {
  requireRemoteUser(await currentUserId());
  resolveCompanyId(explicitCompanyId);
  const { data, error } = await supabase!.rpc("preview_engineering_document_lifecycle", { p_document_id: documentId });
  if (error) throw error;
  return parseEngineeringLifecyclePreview(data, "DOCUMENT");
}

export async function applyEngineeringDocumentLifecycleInSupabase(
  documentId: string,
  action: "DELETE_UNUSED" | "ARCHIVE" | "SUPERSEDE",
  reason?: string,
  explicitCompanyId?: string,
): Promise<Omit<EngineeringLifecycleResult, "record"> & { record?: EngineeringDocument }> {
  requireRemoteUser(await currentUserId());
  resolveCompanyId(explicitCompanyId);
  const { data, error } = await supabase!.rpc("apply_engineering_document_lifecycle", {
    p_document_id: documentId,
    p_action: action,
    p_reason: reason || null,
  });
  if (error) throw error;
  const result = parseEngineeringLifecycleResult(data, "DOCUMENT");
  const { record: rawRecord, ...resultWithoutRecord } = result;
  return {
    ...resultWithoutRecord,
    ...(rawRecord ? { record: documentFromRow(rawRecord) } : {}),
  };
}

export async function createEngineeringDocumentWithRevisionInSupabase(
  document: EngineeringDocument,
  revision: EngineeringDocumentRevision,
  explicitCompanyId?: string,
): Promise<{ document: EngineeringDocument; revision: EngineeringDocumentRevision }> {
  const userId = requireRemoteUser(await currentUserId());
  const companyId = resolveCompanyId(explicitCompanyId);
  const { data, error } = await supabase!.rpc("create_engineering_document_with_revision", {
    p_company_id: companyId,
    p_document_id: document.id,
    p_revision_id: revision.id,
    p_project_id: document.projectId || null,
    p_document_number: document.documentNumber,
    p_title: document.title,
    p_description: document.description || null,
    p_discipline: document.discipline,
    p_document_type: document.documentType,
    p_tags: document.tags || [],
    p_metadata: document.metadata || {},
    p_revision_number: revision.revisionNumber,
    p_revision_label: revision.revisionLabel || null,
    p_file_name: revision.fileName,
    p_file_path: revision.filePath,
    p_file_size_bytes: revision.fileSizeBytes,
    p_file_type: revision.fileType,
    p_file_fingerprint: revision.fileFingerprint,
    p_page_count: revision.pageCount ?? null,
    p_sheet_size: revision.sheetSize || null,
    p_scale: revision.scale || null,
    p_change_summary: revision.changeSummary || null,
  });
  if (error) throw error;
  void userId;
  return parseEngineeringRpcResult(data, companyId);
}

export async function createEngineeringRevisionInSupabase(
  documentId: string,
  revision: EngineeringDocumentRevision,
  explicitCompanyId?: string,
): Promise<{ document: EngineeringDocument; revision: EngineeringDocumentRevision }> {
  const userId = requireRemoteUser(await currentUserId());
  const companyId = resolveCompanyId(explicitCompanyId);
  const { data, error } = await supabase!.rpc("create_engineering_revision", {
    p_company_id: companyId,
    p_document_id: documentId,
    p_revision_id: revision.id,
    p_revision_number: revision.revisionNumber,
    p_revision_label: revision.revisionLabel || null,
    p_file_name: revision.fileName,
    p_file_path: revision.filePath,
    p_file_size_bytes: revision.fileSizeBytes,
    p_file_type: revision.fileType,
    p_file_fingerprint: revision.fileFingerprint,
    p_page_count: revision.pageCount ?? null,
    p_sheet_size: revision.sheetSize || null,
    p_scale: revision.scale || null,
    p_change_summary: revision.changeSummary || null,
    p_document_status: "UNDER_REVIEW",
    p_revision_status: revision.status,
  });
  if (error) throw error;
  void userId;
  return parseEngineeringRpcResult(data, companyId);
}

function annotationRow(annotation: DrawingAnnotation, userId: string, companyId: string) {
  return {
    id: persistedId(annotation.id, "ann"),
    company_id: companyId,
    document_id: annotation.documentId,
    revision_id: annotation.revisionId,
    page_number: annotation.pageNumber,
    annotation_type: annotation.annotationType,
    geometry: annotation.geometry || {},
    style: annotation.style || {},
    content: annotation.content || null,
    measurement_value: annotation.measurementValue ?? null,
    measurement_unit: annotation.measurementUnit || null,
    status: annotation.status,
    resolved_by_user_id: annotation.resolvedByUserId || null,
    resolved_at: annotation.resolvedAt || null,
    created_by_user_id: annotation.createdByUserId || userId,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Persist a complete revision annotation snapshot in one upsert.  Deleted
 * annotations are represented by status=DELETED so the historical redline
 * record remains auditable; callers never need a partial delete loop.
 */
export async function saveDrawingAnnotationsBatchToSupabase(
  annotations: DrawingAnnotation[],
  explicitCompanyId?: string,
): Promise<DrawingAnnotation[]> {
  if (annotations.length === 0) return [];
  const userId = requireRemoteUser(await currentUserId());
  const companyId = resolveCompanyId(explicitCompanyId);
  const rows = annotations.map((annotation) => annotationRow(annotation, userId, companyId));
  const { data, error } = await supabase!
    .from("drawing_annotations")
    .upsert(rows, { onConflict: "id" })
    .select("*");
  if (error) throw error;
  if (!data || data.length !== rows.length) {
    throw new Error("The server did not confirm every engineering annotation mutation.");
  }
  return data.map((row) => annotationFromRow(row as Row));
}

export async function uploadEngineeringDocumentFile(
  file: Blob | ArrayBuffer | Uint8Array | File,
  options: {
    companyId: string;
    documentId: string;
    revisionId: string;
    fileName: string;
    contentType?: string;
  }
): Promise<{ path: string; fullPath: string }> {
  requireRemoteUser(await currentUserId());
  const companyId = resolveCompanyId(options.companyId);
  const prepared = await prepareEngineeringPdf(file, { fileName: options.fileName, contentType: options.contentType });
  const storagePath = getEngineeringDocumentStoragePath(companyId, options.documentId, options.revisionId, options.fileName);

  const { data, error } = await supabase!.storage
    .from(ENGINEERING_DOCUMENTS_BUCKET)
    .upload(storagePath, prepared.bytes, {
      contentType: prepared.contentType,
      upsert: false,
    });

  if (error) throw error;
  return {
    path: storagePath,
    fullPath: data?.fullPath || storagePath,
  };
}

export async function getEngineeringDocumentFileUrl(
  filePath: string,
  explicitCompanyId?: string,
  expectedDocumentId?: string,
  expectedRevisionId?: string,
  expiresInSeconds = 3600
): Promise<string> {
  requireRemoteUser(await currentUserId());
  const companyId = resolveCompanyId(explicitCompanyId);
  const normalizedFilePath = filePath.trim();
  if (!expectedDocumentId || !expectedRevisionId || !isEngineeringDocumentStoragePathForRevision(normalizedFilePath, companyId, expectedDocumentId, expectedRevisionId)) {
    throw new Error("The engineering revision source is outside the deployment company.");
  }

  const { data, error } = await supabase!.storage
    .from(ENGINEERING_DOCUMENTS_BUCKET)
    .createSignedUrl(normalizedFilePath, Math.max(60, Math.min(expiresInSeconds, 3600)));

  if (error) throw error;
  if (!data?.signedUrl) throw new Error("The engineering revision source did not produce a signed URL.");
  return data.signedUrl;
}

/**
 * Best-effort compensation for an upload that has not been linked to a
 * committed database revision.  This is intentionally not exposed as a normal
 * document action and is called only after the atomic metadata RPC fails.
 */
export async function compensateUnprovenancedEngineeringDocumentUpload(
  filePath: string,
  expectedDocumentId: string,
  expectedRevisionId: string,
  explicitCompanyId?: string,
): Promise<void> {
  requireRemoteUser(await currentUserId());
  const companyId = resolveCompanyId(explicitCompanyId);
  const normalizedFilePath = filePath.trim();
  if (!isEngineeringDocumentStoragePathForRevision(normalizedFilePath, companyId, expectedDocumentId, expectedRevisionId)) {
    throw new Error("Refusing to compensate an engineering upload outside the deployment company.");
  }
  const { error } = await supabase!.storage
    .from(ENGINEERING_DOCUMENTS_BUCKET)
    .remove([normalizedFilePath]);

  if (error) throw error;
}
