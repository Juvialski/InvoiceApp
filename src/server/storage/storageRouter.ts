/**
 * Storage API router handling authenticated document operations,
 * provider-neutral manual invoice source uploads, and secure signed previews.
 */

import express, { type Request, type Response, type Router } from "express";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import {
  type DocumentStorageProvider,
  type StorageProviderId,
  createStorageProvider,
  getPrimaryStorageProvider,
  StorageIntegrityError,
  StorageError,
} from "../../lib/storage/index.ts";
import { calculateSha256Hex } from "../../lib/storage/dedup.ts";
import { sanitizeStorageFileName } from "../../lib/storage/keys.ts";
import { validateInvoiceDocumentBytes } from "../../lib/fileSecurity.ts";
import { compensateFailedUpload, type CompensationInput } from "./storageCompensation.ts";
import type { StoredSourceDocument } from "../../types.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INVOICE_BUCKET = "invoice-originals";

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

export interface StorageRouterOptions {
  authorizer?: (req: Request, permission: "invoices.manage" | "invoices.read") => Promise<StorageAuthContext>;
  primaryProviderSupplier?: (env?: any, supabaseClientGetter?: () => SupabaseClient) => DocumentStorageProvider;
  providerSupplier?: (providerId: StorageProviderId, supabaseClientGetter?: () => SupabaseClient) => DocumentStorageProvider;
  compensator?: (input: CompensationInput) => Promise<{ compensated: boolean; reason?: string }>;
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
  permission: "invoices.read" | "invoices.manage",
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

  // Upload manual invoice source document
  // Authoritative permission: invoices.manage (required for creating source_documents)
  router.post("/manual-source", async (req: Request, res: Response) => {
    try {
      const auth = await authorizer(req, "invoices.manage");
      const { fileData, mimeType, fileName, emailMessageId, sourceType } = req.body || {};

      if (!fileData || typeof fileData !== "string") {
        return res.status(400).json({ error: "fileData (base64) is required." });
      }
      if (!mimeType || typeof mimeType !== "string") {
        return res.status(400).json({ error: "mimeType is required." });
      }
      if (!fileName || typeof fileName !== "string") {
        return res.status(400).json({ error: "fileName is required." });
      }

      const bytes = new Uint8Array(Buffer.from(fileData, "base64"));
      validateInvoiceDocumentBytes(bytes, mimeType, fileName);
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
          bucket: row.storage_bucket || INVOICE_BUCKET,
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
          storageBucket: row.storage_bucket || INVOICE_BUCKET,
          sha256: row.sha256,
          processingStatus: row.processing_status || undefined,
          documentType: row.document_type || undefined,
          previewUrl,
        };
        return res.json(existingDoc);
      }

      // Store new object via active primary provider
      const provider = options?.primaryProviderSupplier
        ? options.primaryProviderSupplier(process.env, () => auth.supabase)
        : getPrimaryStorageProvider(process.env, () => auth.supabase);

      const now = new Date();
      const year = String(now.getUTCFullYear());
      const month = String(now.getUTCMonth() + 1).padStart(2, "0");
      const safeName = sanitizeStorageFileName(fileName);
      const storagePath = `companies/${auth.companyId}/invoices/manual/${year}/${month}/${hash.slice(0, 12)}-${randomUUID().slice(0, 8)}-${safeName}`;

      await provider.putObject({
        companyId: auth.companyId,
        bucket: INVOICE_BUCKET,
        key: storagePath,
        bytes,
        contentType: mimeType,
        sha256: hash,
      });

      // Insert DB metadata
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
          storage_provider: provider.id,
          storage_bucket: INVOICE_BUCKET,
          sha256: hash,
          processing_status: "STORED",
        })
        .select("id")
        .single();

      if (insertError) {
        // Compensate: safely delete the uploaded object on database failure
        const compensatorFn = options?.compensator || compensateFailedUpload;
        try {
          await compensatorFn({
            companyId: auth.companyId,
            bucket: INVOICE_BUCKET,
            key: storagePath,
            providerId: provider.id,
            supabase: auth.supabase,
          });
        } catch (compErr) {
          console.error("[Storage Compensation Failure]", compErr);
        }
        throw new StorageApiError(500, "METADATA_INSERT_FAILED", `Document metadata persistence failed: ${insertError.message}`);
      }

      const previewUrl = await provider.getSignedUrl({
        companyId: auth.companyId,
        bucket: INVOICE_BUCKET,
        key: storagePath,
      });

      const responseDoc: StoredSourceDocument = {
        id: inserted.id,
        emailMessageId,
        filename: fileName,
        mimeType,
        size: bytes.byteLength,
        storagePath,
        storageProvider: provider.id,
        storageBucket: INVOICE_BUCKET,
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
        bucket: row.storage_bucket || INVOICE_BUCKET,
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

  // Get source payload for retry / extraction
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
        bucket: row.storage_bucket || INVOICE_BUCKET,
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

  return router;
}
