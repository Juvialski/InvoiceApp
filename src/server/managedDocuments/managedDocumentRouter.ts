import express, { type Request, type Response, type Router } from "express";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createStorageProvider,
  getPrimaryStorageProvider,
  StorageError,
  StorageIntegrityError,
  type DocumentStorageProvider,
  type StorageProviderId,
} from "../../lib/storage/index.ts";
import { calculateSha256Hex } from "../../lib/storage/dedup.ts";
import { buildManagedDocumentStoragePath, sanitizeStorageFileName } from "../../lib/storage/keys.ts";
import { decodeBase64Payload, MAX_MANAGED_DOCUMENT_BYTES, validateManagedDocumentBytes } from "../../lib/fileSecurity.ts";
import {
  authorizeStorageRequest,
  StorageApiError,
  type StorageAuthContext,
  type StoragePermissionKey,
} from "../storage/storageRouter.ts";
import { getStorageServerServiceRoleClient } from "../storage/storageCompensation.ts";

export const MANAGED_DOCUMENTS_BUCKET = "company-managed-documents";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const READ_PERMISSIONS: readonly StoragePermissionKey[] = [
  "documents.read",
  "documents.manage",
  "procurement.read",
  "projects.read",
  "reports.financial.read",
  "reports.payroll.read",
  "company.settings.read",
  "engineering.documents.read",
];

export interface ManagedDocumentRouterOptions {
  readonly authorizer?: (req: Request, permission: StoragePermissionKey) => Promise<StorageAuthContext>;
  readonly providerSupplier?: (providerId: StorageProviderId, supabaseClientGetter?: () => SupabaseClient) => DocumentStorageProvider;
  readonly primaryProviderSupplier?: (environment?: NodeJS.ProcessEnv, supabaseClientGetter?: () => SupabaseClient) => DocumentStorageProvider;
  readonly serverSupabaseSupplier?: () => SupabaseClient;
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function requestedUuid(value: unknown, label: string): string {
  const candidate = String(value || "").trim();
  if (!UUID_PATTERN.test(candidate)) throw new StorageApiError(400, "INVALID_ID", `${label} is invalid.`);
  return candidate;
}

function apiStatus(error: any): number {
  if (error instanceof StorageApiError || error instanceof StorageError) return Number(error.status) || 503;
  if (Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599) return Number(error.status);
  if (["22023", "22P02"].includes(String(error?.code || ""))) return 400;
  if (["40001", "23505", "40900"].includes(String(error?.code || ""))) return 409;
  if (String(error?.code || "") === "40400") return 404;
  return 503;
}

function apiMessage(error: any, fallback: string): string {
  const code = String(error?.code || "");
  if (code === "42501") return "You do not have permission for this Documents operation.";
  if (code === "40001" || error?.message === "EXPECTED_VERSION_MISMATCH") return "This document changed in another session. Refresh it before retrying.";
  if (code === "40400") return "The managed document was not found in this company.";
  if (error instanceof StorageError) return "Document Storage is unavailable. Check the server-side Storage configuration.";
  return error instanceof StorageApiError ? error.message : fallback;
}

function apiErrorPayload(error: any, fallback: string) {
  return { success: false, code: String(error?.code || "MANAGED_DOCUMENT_OPERATION_FAILED"), error: apiMessage(error, fallback) };
}

function versionApi(row: Record<string, any>): Record<string, unknown> {
  return {
    id: String(row.id || ""),
    documentId: String(row.document_id || ""),
    versionNumber: Number(row.version_number || 0),
    sourceOrigin: String(row.source_origin || "MANUAL_UPLOAD"),
    originalFilename: String(row.original_filename || "document"),
    mimeType: String(row.mime_type || "application/octet-stream"),
    sizeBytes: Number(row.size_bytes || 0),
    sha256: String(row.sha256 || ""),
    ...(row.template_version_id ? { templateVersionId: String(row.template_version_id) } : {}),
    ...(row.uploaded_by_user_id ? { uploadedByUserId: String(row.uploaded_by_user_id) } : {}),
    createdAt: String(row.created_at || ""),
  };
}

function artifactApi(row?: Record<string, any>): Record<string, unknown> | undefined {
  if (!row) return undefined;
  return {
    id: String(row.id || ""),
    managedDocumentId: String(row.managed_document_id || ""),
    managedVersionId: String(row.managed_version_id || ""),
    sourceDomain: String(row.source_domain || ""),
    sourceType: String(row.source_type || ""),
    ...(row.source_record_id ? { sourceRecordId: String(row.source_record_id) } : {}),
    ...(row.source_record_reference ? { sourceRecordReference: String(row.source_record_reference) } : {}),
    artifactType: String(row.artifact_type || "OTHER"),
    displayName: String(row.display_name || "Generated artifact"),
    ...(row.template_version_id ? { templateVersionId: String(row.template_version_id) } : {}),
    ...(row.template_content_sha256 ? { templateContentSha256: String(row.template_content_sha256) } : {}),
    ...(row.source_artifact_version_id ? { sourceArtifactVersionId: String(row.source_artifact_version_id) } : {}),
    ...(row.created_by_user_id ? { createdByUserId: String(row.created_by_user_id) } : {}),
    createdAt: String(row.created_at || ""),
  };
}

function summaryApi(row: Record<string, any>, current?: Record<string, any>, artifact?: Record<string, any>): Record<string, unknown> {
  return {
    id: String(row.id || ""),
    title: String(row.title || "Managed document"),
    ...(row.description ? { description: String(row.description) } : {}),
    category: String(row.category || "GENERAL_UPLOAD"),
    origin: String(row.origin || "MANUAL_UPLOAD"),
    status: String(row.status || "ACTIVE"),
    ...(row.project_id ? { projectId: String(row.project_id) } : {}),
    ...(row.current_version_id ? { currentVersionId: String(row.current_version_id) } : {}),
    ...(current ? {
      currentVersionNumber: Number(current.version_number || 0),
      currentFileName: String(current.original_filename || ""),
      currentMimeType: String(current.mime_type || ""),
      currentSizeBytes: Number(current.size_bytes || 0),
      currentSha256: String(current.sha256 || ""),
    } : {}),
    ...(row.created_by_user_id ? { createdByUserId: String(row.created_by_user_id) } : {}),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
    ...(row.archived_at ? { archivedAt: String(row.archived_at) } : {}),
    ...(artifact ? { artifact: artifactApi(artifact) } : {}),
  };
}

async function authorizeAnyRead(req: Request, authorizer: (req: Request, permission: StoragePermissionKey) => Promise<StorageAuthContext>): Promise<StorageAuthContext> {
  let lastError: unknown;
  for (const permission of READ_PERMISSIONS) {
    try {
      return await authorizer(req, permission);
    } catch (error) {
      lastError = error;
      if (!(error instanceof StorageApiError) || error.status !== 403) throw error;
    }
  }
  if (lastError) throw lastError;
  throw new StorageApiError(403, "FORBIDDEN", "You do not have permission to read company Documents.");
}

function privilegedClient(auth: StorageAuthContext, options: ManagedDocumentRouterOptions): SupabaseClient {
  if (options.serverSupabaseSupplier) return options.serverSupabaseSupplier();
  try {
    return getStorageServerServiceRoleClient();
  } catch {
    throw new StorageApiError(503, "SERVER_STORAGE_UNAVAILABLE", "Server-side Storage authority is not configured for managed Documents.");
  }
}

function providerForRow(row: Record<string, any>, auth: StorageAuthContext, options: ManagedDocumentRouterOptions, serviceClient: SupabaseClient): DocumentStorageProvider {
  const providerId = String(row.storage_provider || "supabase") as StorageProviderId;
  return options.providerSupplier
    ? options.providerSupplier(providerId, () => serviceClient)
    : createStorageProvider(providerId, undefined, () => serviceClient);
}

function primaryProvider(auth: StorageAuthContext, options: ManagedDocumentRouterOptions, serviceClient: SupabaseClient): DocumentStorageProvider {
  return options.primaryProviderSupplier
    ? options.primaryProviderSupplier(process.env, () => serviceClient)
    : getPrimaryStorageProvider(process.env, () => serviceClient);
}

async function cleanup(provider: DocumentStorageProvider, companyId: string, bucket: string, key: string): Promise<boolean> {
  try {
    await provider.deleteObject({ companyId, bucket, key });
    return true;
  } catch {
    return false;
  }
}

async function readRows(auth: StorageAuthContext, documentId: string) {
  const documentResult = await auth.supabase
    .from("managed_documents")
    .select("id,company_id,project_id,title,description,category,origin,status,current_version_id,created_by_user_id,created_at,updated_at,archived_at")
    .eq("company_id", auth.companyId)
    .eq("id", documentId)
    .maybeSingle();
  if (documentResult.error) throw new StorageApiError(503, "DATABASE_ERROR", "Managed document metadata is temporarily unavailable.");
  if (!documentResult.data) throw new StorageApiError(404, "DOCUMENT_NOT_FOUND", "The managed document was not found in this company.");
  const versionsResult = await auth.supabase
    .from("managed_document_versions")
    .select("id,document_id,version_number,source_origin,original_filename,mime_type,size_bytes,sha256,template_version_id,uploaded_by_user_id,created_at")
    .eq("company_id", auth.companyId)
    .eq("document_id", documentId)
    .order("version_number", { ascending: false });
  if (versionsResult.error) throw new StorageApiError(503, "DATABASE_ERROR", "Managed document version history is temporarily unavailable.");
  const artifactResult = await auth.supabase
    .from("document_artifact_registrations")
    .select("id,managed_document_id,managed_version_id,source_domain,source_type,source_record_id,source_record_reference,artifact_type,display_name,template_version_id,template_content_sha256,source_artifact_version_id,created_by_user_id,created_at")
    .eq("company_id", auth.companyId)
    .eq("managed_document_id", documentId)
    .maybeSingle();
  if (artifactResult.error) throw new StorageApiError(503, "DATABASE_ERROR", "Retained artifact provenance is temporarily unavailable.");
  return { document: record(documentResult.data), versions: (versionsResult.data || []).map(record), artifact: artifactResult.data ? record(artifactResult.data) : undefined };
}

function detailApi(rows: { document: Record<string, any>; versions: Record<string, any>[]; artifact?: Record<string, any> }): Record<string, unknown> {
  const current = rows.versions.find((version) => String(version.id) === String(rows.document.current_version_id)) || rows.versions[0];
  return {
    ...summaryApi(rows.document, current, rows.artifact),
    versions: rows.versions.map(versionApi),
  };
}

export function createManagedDocumentRouter(options: ManagedDocumentRouterOptions = {}): Router {
  const router = express.Router();
  const authorizer = options.authorizer || authorizeStorageRequest;

  router.get("/", async (req: Request, res: Response) => {
    try {
      const auth = await authorizeAnyRead(req, authorizer);
      const documentsResult = await auth.supabase
        .from("managed_documents")
        .select("id,company_id,project_id,title,description,category,origin,status,current_version_id,created_by_user_id,created_at,updated_at,archived_at")
        .eq("company_id", auth.companyId)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (documentsResult.error) throw new StorageApiError(503, "DATABASE_ERROR", "Managed Documents are temporarily unavailable.");
      const rows = (documentsResult.data || []).map(record);
      const ids = rows.map((row) => String(row.id));
      if (!ids.length) return res.json({ success: true, data: { documents: [] } });
      const versionsResult = await auth.supabase
        .from("managed_document_versions")
        .select("id,document_id,version_number,original_filename,mime_type,size_bytes,sha256")
        .eq("company_id", auth.companyId)
        .in("document_id", ids)
        .order("version_number", { ascending: false });
      const artifactsResult = await auth.supabase
        .from("document_artifact_registrations")
        .select("id,managed_document_id,managed_version_id,source_domain,source_type,source_record_id,source_record_reference,artifact_type,display_name,template_version_id,template_content_sha256,source_artifact_version_id,created_by_user_id,created_at")
        .eq("company_id", auth.companyId)
        .in("managed_document_id", ids);
      if (versionsResult.error || artifactsResult.error) throw new StorageApiError(503, "DATABASE_ERROR", "Managed Document index metadata is temporarily unavailable.");
      const versionsByDocument = new Map<string, Record<string, any>>();
      for (const version of versionsResult.data || []) {
        const row = record(version);
        const documentId = String(row.document_id || "");
        if (!versionsByDocument.has(documentId)) versionsByDocument.set(documentId, row);
      }
      const artifactsByDocument = new Map((artifactsResult.data || []).map((artifact) => [String(artifact.managed_document_id), record(artifact)]));
      return res.json({ success: true, data: { documents: rows.map((row) => summaryApi(row, versionsByDocument.get(String(row.id)), artifactsByDocument.get(String(row.id)))) } });
    } catch (error: any) {
      return res.status(apiStatus(error)).json(apiErrorPayload(error, "Managed Documents could not be loaded safely."));
    }
  });

  router.get("/:documentId", async (req: Request, res: Response) => {
    try {
      const auth = await authorizeAnyRead(req, authorizer);
      const documentId = requestedUuid(req.params.documentId, "Managed document ID");
      return res.json({ success: true, data: detailApi(await readRows(auth, documentId)) });
    } catch (error: any) {
      return res.status(apiStatus(error)).json(apiErrorPayload(error, "The managed document could not be loaded safely."));
    }
  });

  router.get("/:documentId/versions/:versionId/url", async (req: Request, res: Response) => {
    try {
      const auth = await authorizeAnyRead(req, authorizer);
      const documentId = requestedUuid(req.params.documentId, "Managed document ID");
      const versionId = requestedUuid(req.params.versionId, "Managed document version ID");
      const rows = await readRows(auth, documentId);
      const version = rows.versions.find((candidate) => String(candidate.id) === versionId);
      if (!version) throw new StorageApiError(404, "VERSION_NOT_FOUND", "The managed document version was not found in this company.");
      const serviceClient = privilegedClient(auth, options);
      const storageVersionResult = await serviceClient
        .from("managed_document_versions")
        .select("id,company_id,document_id,original_filename,storage_provider,storage_bucket,storage_path")
        .eq("company_id", auth.companyId)
        .eq("document_id", documentId)
        .eq("id", versionId)
        .maybeSingle();
      if (storageVersionResult.error) throw new StorageApiError(503, "DATABASE_ERROR", "Managed document Storage metadata is temporarily unavailable.");
      if (!storageVersionResult.data) throw new StorageApiError(404, "VERSION_NOT_FOUND", "The managed document version was not found in this company.");
      const storageVersion = record(storageVersionResult.data);
      const provider = providerForRow(storageVersion, auth, options, serviceClient);
      const url = await provider.getSignedUrl({ companyId: auth.companyId, bucket: String(storageVersion.storage_bucket || ""), key: String(storageVersion.storage_path || "") }, { expiresInSeconds: 300, disposition: req.query.download === "1" ? "attachment" : "inline", downloadFilename: String(version.original_filename || "document") });
      return res.json({ success: true, data: { url } });
    } catch (error: any) {
      return res.status(apiStatus(error)).json(apiErrorPayload(error, "The managed document version could not be opened safely."));
    }
  });

  router.post("/", async (req: Request, res: Response) => {
    let auth: StorageAuthContext | null = null;
    let provider: DocumentStorageProvider | null = null;
    let bucket = "";
    let storagePath = "";
    try {
      auth = await authorizer(req, "documents.manage");
      const fileData = typeof req.body?.fileData === "string" ? req.body.fileData : "";
      const fileName = typeof req.body?.fileName === "string" ? req.body.fileName.trim() : "";
      const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType.trim() : "";
      const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
      const category = typeof req.body?.category === "string" ? req.body.category.trim().toUpperCase() : "GENERAL_UPLOAD";
      if (!fileData || !fileName || !mimeType || !title) throw new StorageApiError(400, "INVALID_DOCUMENT", "A file, title, MIME type, and category are required.");
      const bytes = decodeBase64Payload(fileData, MAX_MANAGED_DOCUMENT_BYTES, "Managed document");
      validateManagedDocumentBytes(bytes, mimeType, fileName);
      const documentId = randomUUID();
      const versionId = randomUUID();
      const safeFileName = sanitizeStorageFileName(fileName);
      storagePath = buildManagedDocumentStoragePath(auth.companyId, documentId, versionId, safeFileName);
      const serviceClient = privilegedClient(auth, options);
      provider = primaryProvider(auth, options, serviceClient);
      bucket = provider.id === "s3" ? "" : MANAGED_DOCUMENTS_BUCKET;
      const put = await provider.putObject({ companyId: auth.companyId, ...(bucket ? { bucket } : {}), key: storagePath, bytes, contentType: mimeType, sha256: await calculateSha256Hex(bytes), upsert: false });
      bucket = put.ref.bucket || bucket;
      const { data, error } = await serviceClient.rpc("server_create_managed_document_with_version", {
        p_payload: {
          companyId: auth.companyId, documentId, versionId, title, category,
          description: typeof req.body?.description === "string" ? req.body.description : null,
          projectId: typeof req.body?.projectId === "string" && req.body.projectId ? req.body.projectId : null,
          fileName: safeFileName, mimeType, sizeBytes: bytes.byteLength,
          storageProvider: provider.id, storageBucket: bucket, storagePath, sha256: put.ref.sha256,
        },
        p_actor_user_id: auth.user.id,
      });
      if (error || !data) throw error || new StorageApiError(503, "DATABASE_ERROR", "Managed document metadata could not be committed safely.");
      return res.status(201).json({ success: true, data: detailApi({ document: record(data.document), versions: [record(data.version)] }) });
    } catch (error: any) {
      const cleanupFailed = provider && auth && storagePath ? !(await cleanup(provider, auth.companyId, bucket, storagePath)) : false;
      const finalError = cleanupFailed ? new StorageApiError(503, "METADATA_INSERT_FAILED", "Managed document metadata persistence failed and the uncommitted Storage object could not be cleaned up safely.") : error;
      return res.status(apiStatus(finalError)).json(apiErrorPayload(finalError, "The managed document could not be uploaded safely."));
    }
  });

  router.post("/:documentId/versions", async (req: Request, res: Response) => {
    let auth: StorageAuthContext | null = null;
    let provider: DocumentStorageProvider | null = null;
    let bucket = "";
    let storagePath = "";
    try {
      auth = await authorizer(req, "documents.manage");
      const documentId = requestedUuid(req.params.documentId, "Managed document ID");
      const fileData = typeof req.body?.fileData === "string" ? req.body.fileData : "";
      const fileName = typeof req.body?.fileName === "string" ? req.body.fileName.trim() : "";
      const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType.trim() : "";
      const expectedUpdatedAt = typeof req.body?.expectedUpdatedAt === "string" ? req.body.expectedUpdatedAt : "";
      if (!fileData || !fileName || !mimeType || !expectedUpdatedAt) throw new StorageApiError(400, "INVALID_DOCUMENT", "A file, MIME type, filename, and current document version are required.");
      const bytes = decodeBase64Payload(fileData, MAX_MANAGED_DOCUMENT_BYTES, "Managed document version");
      validateManagedDocumentBytes(bytes, mimeType, fileName);
      const versionId = randomUUID();
      const safeFileName = sanitizeStorageFileName(fileName);
      storagePath = buildManagedDocumentStoragePath(auth.companyId, documentId, versionId, safeFileName);
      const serviceClient = privilegedClient(auth, options);
      provider = primaryProvider(auth, options, serviceClient);
      bucket = provider.id === "s3" ? "" : MANAGED_DOCUMENTS_BUCKET;
      const put = await provider.putObject({ companyId: auth.companyId, ...(bucket ? { bucket } : {}), key: storagePath, bytes, contentType: mimeType, sha256: await calculateSha256Hex(bytes), upsert: false });
      bucket = put.ref.bucket || bucket;
      const { data, error } = await serviceClient.rpc("server_create_managed_document_version", {
        p_payload: { companyId: auth.companyId, documentId, versionId, expectedUpdatedAt, fileName: safeFileName, mimeType, sizeBytes: bytes.byteLength, storageProvider: provider.id, storageBucket: bucket, storagePath, sha256: put.ref.sha256 },
        p_actor_user_id: auth.user.id,
      });
      if (error || !data) throw error || new StorageApiError(503, "DATABASE_ERROR", "Managed document version metadata could not be committed safely.");
      return res.status(201).json({ success: true, data: detailApi(await readRows(auth, documentId)) });
    } catch (error: any) {
      const cleanupFailed = provider && auth && storagePath ? !(await cleanup(provider, auth.companyId, bucket, storagePath)) : false;
      const finalError = cleanupFailed ? new StorageApiError(503, "METADATA_INSERT_FAILED", "Managed document version persistence failed and the uncommitted Storage object could not be cleaned up safely.") : error;
      return res.status(apiStatus(finalError)).json(apiErrorPayload(finalError, "The managed document version could not be uploaded safely."));
    }
  });

  router.post("/:documentId/archive", async (req: Request, res: Response) => {
    try {
      const auth = await authorizer(req, "documents.manage");
      const documentId = requestedUuid(req.params.documentId, "Managed document ID");
      const expectedUpdatedAt = typeof req.body?.expectedUpdatedAt === "string" ? req.body.expectedUpdatedAt : "";
      if (!expectedUpdatedAt) throw new StorageApiError(400, "INVALID_VERSION", "The current document version is required before archive.");
      const serviceClient = privilegedClient(auth, options);
      const { data, error } = await serviceClient.rpc("server_archive_managed_document", { p_document_id: documentId, p_expected_updated_at: expectedUpdatedAt, p_reason: typeof req.body?.reason === "string" ? req.body.reason : null, p_actor_user_id: auth.user.id });
      if (error || !data) throw error || new StorageApiError(503, "DATABASE_ERROR", "The managed document archive could not be committed safely.");
      return res.json({ success: true, data: summaryApi(record(data)) });
    } catch (error: any) {
      return res.status(apiStatus(error)).json(apiErrorPayload(error, "The managed document could not be archived safely."));
    }
  });

  return router;
}
