/**
 * Storage API router handling authenticated document operations,
 * provider-neutral manual invoice source uploads, secure signed previews,
 * asynchronous backup replication, operator reconciliation, and incremental document migrations.
 */

import express, { type Request, type Response, type Router } from "express";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import {
  type DocumentStorageProvider,
  type StorageProviderId,
  createStorageProvider,
  getPrimaryStorageProvider,
  getBackupStorageDescriptor,
  StorageIntegrityError,
  StorageError,
} from "../../lib/storage/index.ts";
import { calculateSha256Hex } from "../../lib/storage/dedup.ts";
import { sanitizeStorageFileName } from "../../lib/storage/keys.ts";
import { validateInvoiceDocumentBytes } from "../../lib/fileSecurity.ts";
import {
  compensateFailedUpload,
  getStorageServerServiceRoleClient,
  type CompensationInput,
} from "./storageCompensation.ts";
import { BackupService } from "./backupService.ts";
import { MigrationService, type MigrationSupportedDomain } from "./migrationService.ts";
import type { StoredSourceDocument } from "../../types.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_MIGRATION_DOMAINS: MigrationSupportedDomain[] = [
  "INVOICES",
  "EMAIL_INTAKE",
  "CASH_BANKING",
  "PAYROLL",
  "ENGINEERING",
  "SOURCE_DOCUMENTS",
];

export class StorageApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "StorageApiError";
    this.status = status;
    this.code = code;
  }
}

export interface StorageAuthContext {
  accessToken: string;
  companyId: string;
  supabase: SupabaseClient;
  user: User;
}

export type StoragePermissionKey =
  | "invoices.manage"
  | "invoices.read"
  | "storage.manage"
  | "storage.read"
  | "expenses.manage"
  | "expenses.read"
  | "engineering.documents.read"
  | "payroll.import";

export interface StorageRouterOptions {
  authorizer?: (req: Request, permission: StoragePermissionKey) => Promise<StorageAuthContext>;
  primaryProviderSupplier?: (env?: any, supabaseClientGetter?: () => SupabaseClient) => DocumentStorageProvider;
  backupProviderSupplier?: (env?: any, supabaseClientGetter?: () => SupabaseClient) => DocumentStorageProvider | null;
  providerSupplier?: (providerId: StorageProviderId, supabaseClientGetter?: () => SupabaseClient) => DocumentStorageProvider;
  compensator?: (input: CompensationInput) => Promise<{ compensated: boolean; reason?: string }>;
  serverSupabaseSupplier?: () => SupabaseClient;
  backupService?: BackupService;
  migrationService?: MigrationService;
}

function firstHeader(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function getBearerToken(req: Request): string {
  const authorization = firstHeader(req.headers.authorization);
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) {
    throw new StorageApiError(401, "UNAUTHENTICATED", "A valid Engoryx session is required.");
  }
  return match[1];
}

function getServerSupabaseClient(accessToken: string): SupabaseClient {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const publishableKey = (
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ""
  ).trim();

  if (!url || !publishableKey || /service[_-]?role|secret/i.test(publishableKey)) {
    throw new StorageApiError(503, "SERVER_AUTH_UNAVAILABLE", "Company authorization is not configured on the server.");
  }

  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export async function authorizeStorageRequest(
  req: Request,
  permission: StoragePermissionKey,
): Promise<StorageAuthContext> {
  const accessToken = getBearerToken(req);
  const client = getServerSupabaseClient(accessToken);

  const { data: userData, error: userError } = await client.auth.getUser(accessToken);
  if (userError || !userData.user) {
    throw new StorageApiError(401, "UNAUTHENTICATED", "A valid Engoryx session is required.");
  }

  const companyId = firstHeader(req.headers["x-company-id"]).trim();
  if (!companyId || !UUID_PATTERN.test(companyId)) {
    throw new StorageApiError(400, "COMPANY_REQUIRED", "A valid company context is required for this operation.");
  }

  const { data: deploymentCompanyId, error: deploymentError } = await client.rpc("get_deployment_company_id");
  if (deploymentError || typeof deploymentCompanyId !== "string" || !UUID_PATTERN.test(deploymentCompanyId)) {
    throw new StorageApiError(503, "SERVER_AUTH_UNAVAILABLE", "Deployment company authorization is temporarily unavailable.");
  }
  if (deploymentCompanyId !== companyId) {
    throw new StorageApiError(403, "FORBIDDEN", "This request cannot target another Engoryx deployment company.");
  }

  const { data: allowed, error: permissionError } = await client.rpc("has_company_permission", {
    p_company_id: companyId,
    p_permission_key: permission,
  });

  if (permissionError) {
    throw new StorageApiError(503, "SERVER_AUTH_UNAVAILABLE", "Company authorization is temporarily unavailable.");
  }
  if (allowed !== true) {
    throw new StorageApiError(403, "FORBIDDEN", "You do not have permission for this company storage operation.");
  }

  return {
    accessToken,
    companyId,
    supabase: client,
    user: userData.user,
  };
}

export function createStorageRouter(options?: StorageRouterOptions): Router {
  const router = express.Router();
  const authorizer = options?.authorizer || authorizeStorageRequest;

  // Helper to obtain server-only privileged Supabase client for internal manifest registration
  const getPrivilegedClient = (auth: StorageAuthContext): SupabaseClient => {
    if (options?.serverSupabaseSupplier) {
      return options.serverSupabaseSupplier();
    }
    try {
      return getStorageServerServiceRoleClient();
    } catch {
      return auth.supabase;
    }
  };

  // Upload manual invoice source document
  // Authoritative permission: invoices.manage (required for creating source_documents)
  router.post("/manual-source", async (req: Request, res: Response) => {
    try {
      const auth = await authorizer(req, "invoices.manage");
      const { fileData, mimeType, fileName, emailMessageId, sourceType } = req.body || {};

      if (!fileData || typeof fileData !== "string") {
        return res.status(400).json({ code: "INVALID_DOCUMENT", error: "fileData (base64) is required." });
      }
      if (!mimeType || typeof mimeType !== "string") {
        return res.status(400).json({ code: "INVALID_DOCUMENT", error: "mimeType is required." });
      }
      if (!fileName || typeof fileName !== "string") {
        return res.status(400).json({ code: "INVALID_DOCUMENT", error: "fileName is required." });
      }

      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(Buffer.from(fileData, "base64"));
        validateInvoiceDocumentBytes(bytes, mimeType, fileName);
      } catch (valErr: any) {
        return res.status(400).json({ code: "INVALID_DOCUMENT", error: valErr.message || "Invalid document payload." });
      }

      const hash = await calculateSha256Hex(bytes);

      // Check existing document in company
      const { data: existingRows, error: existingError } = await auth.supabase
        .from("source_documents")
        .select("id,email_message_id,gmail_attachment_id,gmail_part_id,attachment_index,filename,mime_type,file_size,storage_path,storage_provider,storage_bucket,sha256,processing_status,document_type,created_at")
        .eq("company_id", auth.companyId)
        .eq("sha256", hash)
        .order("created_at", { ascending: false })
        .limit(1);

      if (existingError) {
        throw new StorageApiError(500, "DATABASE_ERROR", existingError.message);
      }

      if (existingRows?.[0]) {
        const row = existingRows[0];
        const rowProviderId = (row.storage_provider as StorageProviderId) || "supabase";
        const provider = options?.providerSupplier
          ? options.providerSupplier(rowProviderId, () => auth.supabase)
          : createStorageProvider(rowProviderId, undefined, () => auth.supabase);

        const previewUrl = await provider.getSignedUrl({
          companyId: auth.companyId,
          bucket: row.storage_bucket,
          key: row.storage_path,
        });

        const existingDoc: StoredSourceDocument = {
          id: row.id,
          emailMessageId: row.email_message_id || undefined,
          gmailAttachmentId: row.gmail_attachment_id || undefined,
          gmailPartId: row.gmail_part_id || undefined,
          attachmentIndex: row.attachment_index ?? undefined,
          filename: row.filename,
          mimeType: row.mime_type,
          size: Number(row.file_size || 0),
          storagePath: row.storage_path,
          storageProvider: rowProviderId,
          storageBucket: row.storage_bucket,
          sha256: row.sha256,
          processingStatus: row.processing_status || undefined,
          documentType: row.document_type || undefined,
          previewUrl,
        };
        return res.json(existingDoc);
      }

      // Store new object via active primary provider (allows provider to resolve its native bucket)
      const provider = options?.primaryProviderSupplier
        ? options.primaryProviderSupplier(process.env, () => auth.supabase)
        : getPrimaryStorageProvider(process.env, () => auth.supabase);

      const now = new Date();
      const year = String(now.getUTCFullYear());
      const month = String(now.getUTCMonth() + 1).padStart(2, "0");
      const safeName = sanitizeStorageFileName(fileName);
      const storagePath = `companies/${auth.companyId}/invoices/manual/${year}/${month}/${hash.slice(0, 12)}-${randomUUID().slice(0, 8)}-${safeName}`;

      const putResult = await provider.putObject({
        companyId: auth.companyId,
        key: storagePath,
        bytes,
        contentType: mimeType,
        sha256: hash,
      });

      const actualProvider = putResult.ref.providerId;
      const actualBucket = putResult.ref.bucket;

      // Insert DB metadata with actual physical provider and bucket
      const { data: inserted, error: insertError } = await auth.supabase
        .from("source_documents")
        .insert({
          user_id: auth.user.id,
          company_id: auth.companyId,
          source_type: sourceType || "UPLOAD",
          email_message_id: emailMessageId || null,
          filename: fileName,
          mime_type: mimeType,
          file_size: bytes.byteLength,
          storage_path: storagePath,
          storage_provider: actualProvider,
          storage_bucket: actualBucket,
          sha256: hash,
          processing_status: "STORED",
        })
        .select("id")
        .single();

      if (insertError) {
        // Compensate: safely delete the uncommitted object on database failure
        const compensatorFn = options?.compensator || compensateFailedUpload;
        try {
          await compensatorFn({
            companyId: auth.companyId,
            bucket: actualBucket,
            key: storagePath,
            providerId: actualProvider,
            supabase: auth.supabase,
            serverSupabaseSupplier: options?.serverSupabaseSupplier || getStorageServerServiceRoleClient,
          });
        } catch (compErr) {
          console.error("[Storage Compensation Failure]", compErr);
        }
        throw new StorageApiError(500, "METADATA_INSERT_FAILED", `Document metadata persistence failed: ${insertError.message}`);
      }

      // Durably register backup intent using server-only authority before returning (replication stays async)
      const serverSupabase = getPrivilegedClient(auth);
      const backupSvc = options?.backupService || new BackupService({
        supabaseClientSupplier: () => auth.supabase,
        privilegedClientSupplier: () => serverSupabase,
        primaryProviderSupplier: options?.primaryProviderSupplier,
        backupProviderSupplier: options?.backupProviderSupplier,
        providerSupplier: options?.providerSupplier,
      });

      const backupDesc = getBackupStorageDescriptor(process.env);
      if (backupDesc) {
        await backupSvc.registerBackupIntent({
          companyId: auth.companyId,
          documentDomain: "INVOICES",
          documentId: inserted.id,
          sourceProvider: actualProvider,
          sourceBucket: actualBucket,
          sourceKey: storagePath,
          sha256: hash,
          sizeBytes: bytes.byteLength,
          replicaProvider: backupDesc.providerId === "memory" ? "memory" : "s3",
          replicaBucket: backupDesc.bucket,
        });
      }

      const previewUrl = await provider.getSignedUrl({
        companyId: auth.companyId,
        bucket: actualBucket,
        key: storagePath,
      });

      const responseDoc: StoredSourceDocument = {
        id: inserted.id,
        emailMessageId,
        filename: fileName,
        mimeType,
        size: bytes.byteLength,
        storagePath,
        storageProvider: actualProvider,
        storageBucket: actualBucket,
        sha256: hash,
        processingStatus: "STORED",
        previewUrl,
      };

      return res.json(responseDoc);
    } catch (err: any) {
      if (err instanceof StorageApiError) {
        return res.status(err.status).json({ code: err.code, error: err.message });
      }
      if (err instanceof StorageIntegrityError) {
        return res.status(422).json({ code: "STORAGE_INTEGRITY_ERROR", error: err.message });
      }
      if (err instanceof StorageError) {
        return res.status(err.status || 500).json({ code: err.code, error: err.message });
      }
      return res.status(500).json({ error: err?.message || "Storage operation failed" });
    }
  });

  // Get signed preview URL for an existing source document
  router.get("/:id/preview-url", async (req: Request, res: Response) => {
    try {
      const auth = await authorizer(req, "invoices.read");
      const docId = req.params.id;

      if (!UUID_PATTERN.test(docId)) {
        return res.status(400).json({ error: "Invalid document ID." });
      }

      const { data: row, error: rowError } = await auth.supabase
        .from("source_documents")
        .select("id,company_id,storage_path,storage_provider,storage_bucket,filename,mime_type")
        .eq("id", docId)
        .eq("company_id", auth.companyId)
        .maybeSingle();

      if (rowError) throw new StorageApiError(500, "DATABASE_ERROR", rowError.message);
      if (!row) return res.status(404).json({ error: "Document not found." });

      const providerId = (row.storage_provider as StorageProviderId) || "supabase";
      const provider = options?.providerSupplier
        ? options.providerSupplier(providerId, () => auth.supabase)
        : createStorageProvider(providerId, undefined, () => auth.supabase);

      const previewUrl = await provider.getSignedUrl({
        companyId: auth.companyId,
        bucket: row.storage_bucket,
        key: row.storage_path,
      });

      return res.json({ previewUrl });
    } catch (err: any) {
      if (err instanceof StorageApiError) {
        return res.status(err.status).json({ code: err.code, error: err.message });
      }
      return res.status(500).json({ error: err?.message || "Failed to generate preview URL" });
    }
  });

  // Get source payload for retry / extraction (Dual-read compatible)
  router.get("/:id/content", async (req: Request, res: Response) => {
    try {
      const auth = await authorizer(req, "invoices.read");
      const docId = req.params.id;

      if (!UUID_PATTERN.test(docId)) {
        return res.status(400).json({ error: "Invalid document ID." });
      }

      const { data: row, error: rowError } = await auth.supabase
        .from("source_documents")
        .select("id,company_id,source_type,storage_path,storage_provider,storage_bucket,sha256,filename,mime_type")
        .eq("id", docId)
        .eq("company_id", auth.companyId)
        .maybeSingle();

      if (rowError) throw new StorageApiError(500, "DATABASE_ERROR", rowError.message);
      if (!row) return res.status(404).json({ error: "Document not found." });

      const providerId = (row.storage_provider as StorageProviderId) || "supabase";
      const provider = options?.providerSupplier
        ? options.providerSupplier(providerId, () => auth.supabase)
        : createStorageProvider(providerId, undefined, () => auth.supabase);

      const { bytes } = await provider.getObject({
        companyId: auth.companyId,
        bucket: row.storage_bucket,
        key: row.storage_path,
      });

      const actualHash = await calculateSha256Hex(bytes);
      if (row.sha256 && actualHash !== row.sha256) {
        throw new StorageIntegrityError("The preserved source document failed its integrity check.");
      }

      const isText = row.mime_type === "text/plain";
      return res.json({
        id: row.id,
        fileName: row.filename,
        mimeType: row.mime_type,
        sourceType: row.source_type,
        sizeBytes: bytes.byteLength,
        sha256: actualHash,
        textData: isText ? new TextDecoder().decode(bytes) : undefined,
        fileData: !isText ? Buffer.from(bytes).toString("base64") : undefined,
      });
    } catch (err: any) {
      if (err instanceof StorageApiError) {
        return res.status(err.status).json({ code: err.code, error: err.message });
      }
      if (err instanceof StorageIntegrityError) {
        return res.status(422).json({ code: "STORAGE_INTEGRITY_ERROR", error: err.message });
      }
      return res.status(500).json({ error: err?.message || "Failed to load document content" });
    }
  });

  // Execute backup replication batch for company (Strictly storage.manage)
  router.post("/replicate-backup", async (req: Request, res: Response) => {
    try {
      const auth = await authorizer(req, "storage.manage");
      const limit = Math.max(1, Math.min(Number(req.body?.limit) || 10, 100));

      const serverSupabase = getPrivilegedClient(auth);
      const backupSvc = options?.backupService || new BackupService({
        supabaseClientSupplier: () => auth.supabase,
        privilegedClientSupplier: () => serverSupabase,
        primaryProviderSupplier: options?.primaryProviderSupplier,
        backupProviderSupplier: options?.backupProviderSupplier,
        providerSupplier: options?.providerSupplier,
      });

      const summary = await backupSvc.processPendingReplications(auth.companyId, limit);
      return res.json(summary);
    } catch (err: any) {
      if (err instanceof StorageApiError) {
        return res.status(err.status).json({ code: err.code, error: err.message });
      }
      return res.status(500).json({ error: err?.message || "Backup replication processing failed." });
    }
  });

  // Reconcile unbacked primary documents for company (Strictly storage.manage)
  router.post("/reconcile-backups", async (req: Request, res: Response) => {
    try {
      const auth = await authorizer(req, "storage.manage");
      const limit = Math.max(1, Math.min(Number(req.body?.limit) || 50, 100));

      const serverSupabase = getPrivilegedClient(auth);
      const backupSvc = options?.backupService || new BackupService({
        supabaseClientSupplier: () => auth.supabase,
        privilegedClientSupplier: () => serverSupabase,
        primaryProviderSupplier: options?.primaryProviderSupplier,
        backupProviderSupplier: options?.backupProviderSupplier,
        providerSupplier: options?.providerSupplier,
      });

      const records = await backupSvc.discoverUnbackedObjects(auth.companyId, limit);
      return res.json({ reconciled: records.length, records });
    } catch (err: any) {
      if (err instanceof StorageApiError) {
        return res.status(err.status).json({ code: err.code, error: err.message });
      }
      return res.status(500).json({ error: err?.message || "Backup reconciliation failed." });
    }
  });

  // Execute restore verification drill (Strictly storage.manage; non-production only)
  router.post("/restore-drill", async (req: Request, res: Response) => {
    try {
      const auth = await authorizer(req, "storage.manage");
      const { manifestId, testTargetKey } = req.body || {};

      if (!manifestId || typeof manifestId !== "string") {
        return res.status(400).json({ error: "manifestId is required for restore drill." });
      }
      if (!testTargetKey || typeof testTargetKey !== "string" || (!testTargetKey.includes("/restore/") && !testTargetKey.includes("/test/"))) {
        return res.status(400).json({ error: "testTargetKey must contain '/restore/' or '/test/' to protect production." });
      }

      const serverSupabase = getPrivilegedClient(auth);
      const backupSvc = options?.backupService || new BackupService({
        supabaseClientSupplier: () => auth.supabase,
        privilegedClientSupplier: () => serverSupabase,
        primaryProviderSupplier: options?.primaryProviderSupplier,
        backupProviderSupplier: options?.backupProviderSupplier,
        providerSupplier: options?.providerSupplier,
      });

      const drillResult = await backupSvc.runRestoreDrill(auth.companyId, manifestId, testTargetKey);
      return res.json(drillResult);
    } catch (err: any) {
      if (err instanceof StorageApiError) {
        return res.status(err.status).json({ code: err.code, error: err.message });
      }
      if (err instanceof StorageIntegrityError) {
        return res.status(422).json({ code: "STORAGE_INTEGRITY_ERROR", error: err.message });
      }
      if (err instanceof StorageError) {
        return res.status(err.status || 500).json({ code: err.code, error: err.message });
      }
      return res.status(500).json({ error: err?.message || "Restore drill execution failed." });
    }
  });

  // Query backup replicas for company (Strictly storage.read)
  router.get("/backups", async (req: Request, res: Response) => {
    try {
      const auth = await authorizer(req, "storage.read");
      const domain = req.query.domain ? String(req.query.domain) : undefined;
      const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 100));

      let query = auth.supabase
        .from("document_backup_replicas")
        .select("*")
        .eq("company_id", auth.companyId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (domain) {
        query = query.eq("document_domain", domain);
      }

      const { data, error } = await query;
      if (error) throw new StorageApiError(500, "DATABASE_ERROR", error.message);

      return res.json({ backups: data || [] });
    } catch (err: any) {
      if (err instanceof StorageApiError) {
        return res.status(err.status).json({ code: err.code, error: err.message });
      }
      return res.status(500).json({ error: err?.message || "Failed to load backup replicas." });
    }
  });

  // Execute incremental document migration batch for company (Strictly storage.manage)
  router.post("/migrate", async (req: Request, res: Response) => {
    try {
      const auth = await authorizer(req, "storage.manage");
      const { domain = "INVOICES", limit = 10, autoDiscover = true } = req.body || {};

      if (!ALLOWED_MIGRATION_DOMAINS.includes(domain)) {
        return res.status(400).json({
          code: "INVALID_DOMAIN",
          error: `Domain must be one of: ${ALLOWED_MIGRATION_DOMAINS.join(", ")}`,
        });
      }

      const clampedLimit = Math.max(1, Math.min(Number(limit) || 10, 100));
      const serverSupabase = getPrivilegedClient(auth);

      const backupSvc = options?.backupService || new BackupService({
        supabaseClientSupplier: () => auth.supabase,
        privilegedClientSupplier: () => serverSupabase,
        primaryProviderSupplier: options?.primaryProviderSupplier,
        backupProviderSupplier: options?.backupProviderSupplier,
        providerSupplier: options?.providerSupplier,
      });

      const migrationSvc = options?.migrationService || new MigrationService({
        supabaseClientSupplier: () => auth.supabase,
        primaryProviderSupplier: options?.primaryProviderSupplier,
        providerSupplier: options?.providerSupplier,
        backupService: backupSvc,
      });

      if (autoDiscover) {
        await migrationSvc.discoverEligibleDocuments(auth.companyId, domain, clampedLimit);
      }

      const result = await migrationSvc.processPendingMigrations(auth.companyId, domain, clampedLimit);
      return res.json(result);
    } catch (err: any) {
      if (err instanceof StorageApiError) {
        return res.status(err.status).json({ code: err.code, error: err.message });
      }
      if (err instanceof StorageError) {
        return res.status(err.status || 500).json({ code: err.code, error: err.message });
      }
      return res.status(500).json({ error: err?.message || "Document migration failed." });
    }
  });

  // Query migration records for company (Strictly storage.read)
  router.get("/migrations", async (req: Request, res: Response) => {
    try {
      const auth = await authorizer(req, "storage.read");
      const domain = req.query.domain ? String(req.query.domain) : undefined;
      const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 100));

      if (domain && !ALLOWED_MIGRATION_DOMAINS.includes(domain as any)) {
        return res.status(400).json({
          code: "INVALID_DOMAIN",
          error: `Domain must be one of: ${ALLOWED_MIGRATION_DOMAINS.join(", ")}`,
        });
      }

      let query = auth.supabase
        .from("document_migration_records")
        .select("*")
        .eq("company_id", auth.companyId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (domain) {
        query = query.eq("document_domain", domain);
      }

      const { data, error } = await query;
      if (error) throw new StorageApiError(500, "DATABASE_ERROR", error.message);

      return res.json({ migrations: data || [] });
    } catch (err: any) {
      if (err instanceof StorageApiError) {
        return res.status(err.status).json({ code: err.code, error: err.message });
      }
      return res.status(500).json({ error: err?.message || "Failed to load migration records." });
    }
  });

  return router;
}
