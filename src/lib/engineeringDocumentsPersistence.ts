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
import { companyScopedRow, requireActiveCompanyId } from "./companyContext.ts";
import { supabase } from "./supabase.ts";

export const ENGINEERING_WORKSPACE_STORAGE_KEY = "invoice_engineering_documents_workspace_v1";
export const ENGINEERING_DOCUMENTS_BUCKET = "engineering-documents";

type Row = Record<string, unknown>;

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
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
}

function requireRemoteUser(userId: string | null): string {
  if (!supabase || !userId) throw new Error("Authentication required for Engineering Documents.");
  return userId;
}

function resolveCompanyId(companyId?: string): string {
  return companyId || requireActiveCompanyId();
}

export async function loadEngineeringDocumentsWorkspaceFromSupabase(
  explicitCompanyId?: string
): Promise<EngineeringDocumentsWorkspaceData> {
  const userId = await currentUserId();
  if (!supabase || !userId) {
    return readEngineeringDocumentsWorkspaceFromLocal();
  }
  const companyId = resolveCompanyId(explicitCompanyId);

  const [docsResult, revsResult, annsResult] = await Promise.all([
    supabase
      .from("engineering_documents")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
    supabase
      .from("engineering_document_revisions")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
    supabase
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

  writeEngineeringDocumentsWorkspaceToLocal(data);
  return data;
}

function documentRow(doc: EngineeringDocument, userId: string, companyId: string) {
  return companyScopedRow({
    id: persistedId(doc.id, "doc"),
    company_id: companyId,
    project_id: doc.projectId || null,
    document_number: doc.documentNumber.trim(),
    title: doc.title.trim(),
    description: doc.description || null,
    discipline: doc.discipline,
    document_type: doc.documentType,
    status: doc.status,
    current_revision_id: doc.currentRevisionId || null,
    current_revision_number: doc.currentRevisionNumber || "0",
    tags: doc.tags || [],
    metadata: doc.metadata || {},
    created_by_user_id: doc.createdByUserId || userId,
    updated_at: new Date().toISOString(),
    archived_at: doc.archivedAt || null,
  });
}

export async function saveEngineeringDocumentToSupabase(
  doc: EngineeringDocument,
  explicitCompanyId?: string
): Promise<EngineeringDocument> {
  const userId = requireRemoteUser(await currentUserId());
  const companyId = resolveCompanyId(explicitCompanyId);

  const row = documentRow(doc, userId, companyId);
  const { data, error } = await supabase!
    .from("engineering_documents")
    .upsert(row)
    .select("*")
    .single();

  if (error) throw error;
  return documentFromRow(data as Row);
}

export async function archiveEngineeringDocumentInSupabase(
  documentId: string,
  explicitCompanyId?: string
): Promise<EngineeringDocument> {
  const userId = requireRemoteUser(await currentUserId());
  const companyId = resolveCompanyId(explicitCompanyId);

  const now = new Date().toISOString();
  const { data, error } = await supabase!
    .from("engineering_documents")
    .update({
      status: "ARCHIVED",
      archived_at: now,
      updated_at: now,
    })
    .eq("id", documentId)
    .eq("company_id", companyId)
    .select("*")
    .single();

  if (error) throw error;
  void userId;
  return documentFromRow(data as Row);
}

function revisionRow(revision: EngineeringDocumentRevision, userId: string, companyId: string) {
  return companyScopedRow({
    id: persistedId(revision.id, "rev"),
    company_id: companyId,
    document_id: revision.documentId,
    revision_number: revision.revisionNumber.trim(),
    revision_label: revision.revisionLabel || null,
    file_name: revision.fileName.trim(),
    file_path: revision.filePath.trim(),
    file_size_bytes: revision.fileSizeBytes,
    file_type: revision.fileType.trim(),
    file_fingerprint: revision.fileFingerprint.trim(),
    page_count: revision.pageCount ?? null,
    sheet_size: revision.sheetSize || null,
    scale: revision.scale || null,
    change_summary: revision.changeSummary || null,
    status: revision.status,
    created_by_user_id: revision.createdByUserId || userId,
    updated_at: new Date().toISOString(),
  });
}

export async function saveEngineeringRevisionToSupabase(
  revision: EngineeringDocumentRevision,
  explicitCompanyId?: string
): Promise<EngineeringDocumentRevision> {
  const userId = requireRemoteUser(await currentUserId());
  const companyId = resolveCompanyId(explicitCompanyId);

  const row = revisionRow(revision, userId, companyId);
  const { data, error } = await supabase!
    .from("engineering_document_revisions")
    .upsert(row)
    .select("*")
    .single();

  if (error) throw error;

  // Also update document current_revision if this revision is the latest
  await supabase!
    .from("engineering_documents")
    .update({
      current_revision_id: data.id,
      current_revision_number: data.revision_number,
      updated_at: new Date().toISOString(),
    })
    .eq("id", revision.documentId)
    .eq("company_id", companyId);

  return revisionFromRow(data as Row);
}

function annotationRow(annotation: DrawingAnnotation, userId: string, companyId: string) {
  return companyScopedRow({
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
  });
}

export async function saveDrawingAnnotationToSupabase(
  annotation: DrawingAnnotation,
  explicitCompanyId?: string
): Promise<DrawingAnnotation> {
  const userId = requireRemoteUser(await currentUserId());
  const companyId = resolveCompanyId(explicitCompanyId);

  const row = annotationRow(annotation, userId, companyId);
  const { data, error } = await supabase!
    .from("drawing_annotations")
    .upsert(row)
    .select("*")
    .single();

  if (error) throw error;
  return annotationFromRow(data as Row);
}

export async function deleteDrawingAnnotationInSupabase(
  annotationId: string,
  explicitCompanyId?: string
): Promise<void> {
  const userId = requireRemoteUser(await currentUserId());
  const companyId = resolveCompanyId(explicitCompanyId);

  const { error } = await supabase!
    .from("drawing_annotations")
    .delete()
    .eq("id", annotationId)
    .eq("company_id", companyId);

  if (error) throw error;
  void userId;
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
  if (!supabase) throw new Error("Supabase is not configured.");
  const sanitizedFileName = options.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `companies/${options.companyId}/${options.documentId}/${options.revisionId}_${sanitizedFileName}`;

  const { data, error } = await supabase.storage
    .from(ENGINEERING_DOCUMENTS_BUCKET)
    .upload(storagePath, file, {
      contentType: options.contentType || "application/pdf",
      upsert: true,
    });

  if (error) throw error;
  return {
    path: storagePath,
    fullPath: data.fullPath,
  };
}

export async function getEngineeringDocumentFileUrl(
  filePath: string,
  explicitCompanyId?: string,
  expiresInSeconds = 3600
): Promise<string> {
  if (!supabase) throw new Error("Supabase is not configured.");
  void explicitCompanyId;

  const { data, error } = await supabase.storage
    .from(ENGINEERING_DOCUMENTS_BUCKET)
    .createSignedUrl(filePath, expiresInSeconds);

  if (error) throw error;
  return data.signedUrl;
}

export async function deleteEngineeringDocumentFile(filePath: string): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.storage
    .from(ENGINEERING_DOCUMENTS_BUCKET)
    .remove([filePath]);

  if (error) throw error;
}
