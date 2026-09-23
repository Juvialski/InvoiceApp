import express, { type Request, type Response, type Router } from "express";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createStorageProvider,
  getPrimaryStorageProvider,
  loadStorageConfig,
  ObjectNotFoundError,
  StorageError,
  type DocumentStorageProvider,
  type StorageProviderId,
} from "../../lib/storage/index.ts";
import { calculateSha256Hex } from "../../lib/storage/dedup.ts";
import { buildEntityMediaStoragePath, sanitizeStorageFileName, type EntityMediaEntityType } from "../../lib/storage/keys.ts";
import { decodeBase64Payload, MAX_ENTITY_MEDIA_BYTES, validateEntityMediaBytes } from "../../lib/fileSecurity.ts";
import type { EntityMedia } from "../../lib/entityMediaTypes.ts";
import {
  authorizeStorageRequest,
  StorageApiError,
  type StorageAuthContext,
  type StoragePermissionKey,
} from "./storageRouter.ts";
import { getStorageServerServiceRoleClient } from "./storageCompensation.ts";

export const ENTITY_MEDIA_BUCKET = "entity-media";
const SIGNED_URL_SECONDS = 900;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENTITY_CONFIG: Record<EntityMediaEntityType, {
  table: string;
  column: "project_id" | "equipment_id" | "inventory_item_id";
  readPermission: StoragePermissionKey;
  managePermission: StoragePermissionKey;
  purpose: "COVER" | "PRIMARY";
}> = {
  PROJECT: { table: "projects", column: "project_id", readPermission: "projects.read", managePermission: "projects.manage", purpose: "COVER" },
  EQUIPMENT: { table: "engineering_equipment_registry", column: "equipment_id", readPermission: "equipment.read", managePermission: "equipment.manage", purpose: "PRIMARY" },
  MATERIAL: { table: "inventory_items", column: "inventory_item_id", readPermission: "inventory.read", managePermission: "inventory.manage", purpose: "PRIMARY" },
};

export interface EntityMediaRouterOptions {
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
  return candidate.toLowerCase();
}

function requestedEntityType(value: unknown): EntityMediaEntityType {
  const candidate = String(value || "").trim().toUpperCase() as EntityMediaEntityType;
  if (!Object.hasOwn(ENTITY_CONFIG, candidate)) throw new StorageApiError(400, "INVALID_ENTITY_TYPE", "Choose a supported Project, Equipment, or Material image target.");
  return candidate;
}

function apiStatus(error: any): number {
  if (error instanceof StorageApiError || error instanceof StorageError) return Number(error.status) || 503;
  if (Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599) return Number(error.status);
  const code = String(error?.code || "");
  if (["22023", "22P02"].includes(code)) return 400;
  if (["40001", "23505"].includes(code)) return 409;
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  return 503;
}

function apiMessage(error: any, fallback: string): string {
  const code = String(error?.code || "");
  if (code === "42501") return "You do not have permission for this entity image operation.";
  if (code === "40001" || error?.message === "EXPECTED_MEDIA_MISMATCH") return "This image changed in another session. Refresh it before retrying.";
  if (code === "P0002") return "The requested entity image is unavailable in this company.";
  if (error instanceof StorageError) return "Private image Storage is unavailable. Check the server-side Storage configuration.";
  return error instanceof StorageApiError ? error.message : fallback;
}

function apiErrorPayload(error: any, fallback: string) {
  return { success: false, code: String(error?.code || "ENTITY_MEDIA_OPERATION_FAILED"), error: apiMessage(error, fallback) };
}

function serviceClient(options: EntityMediaRouterOptions): SupabaseClient {
  if (options.serverSupabaseSupplier) return options.serverSupabaseSupplier();
  try {
    return getStorageServerServiceRoleClient();
  } catch {
    throw new StorageApiError(503, "SERVER_STORAGE_UNAVAILABLE", "Server-side private Storage authority is not configured for entity images.");
  }
}

function primaryProvider(options: EntityMediaRouterOptions, server: SupabaseClient): DocumentStorageProvider {
  let provider: DocumentStorageProvider;
  if (options.primaryProviderSupplier) {
    provider = options.primaryProviderSupplier(process.env, () => server);
  } else {
    const config = loadStorageConfig(process.env);
    if (config.primaryProvider === "s3") {
      const bucket = (process.env.STORAGE_ENTITY_MEDIA_BUCKET || ENTITY_MEDIA_BUCKET).trim();
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(bucket) || !config.s3) {
        throw new StorageApiError(503, "ENTITY_MEDIA_BUCKET_UNAVAILABLE", "A dedicated private entity-media bucket is not configured for the object Storage provider.");
      }
      provider = createStorageProvider("s3", { ...config, s3: { ...config.s3, bucket } }, () => server);
    } else {
      provider = getPrimaryStorageProvider(process.env, () => server);
    }
  }
  if (provider.id === "memory") {
    throw new StorageApiError(503, "DURABLE_STORAGE_UNAVAILABLE", "Entity images require a durable private Storage provider.");
  }
  return provider;
}

function providerForRow(row: Record<string, any>, options: EntityMediaRouterOptions, server: SupabaseClient): DocumentStorageProvider {
  const providerId = String(row.storage_provider || "") as StorageProviderId;
  if (providerId !== "supabase" && providerId !== "s3") throw new StorageApiError(503, "STORAGE_PROVIDER_UNAVAILABLE", "The saved entity image uses an unsupported Storage provider.");
  return options.providerSupplier
    ? options.providerSupplier(providerId, () => server)
    : createStorageProvider(providerId, undefined, () => server);
}

function bucketForProvider(provider: DocumentStorageProvider): string {
  if (provider.id === "supabase") return ENTITY_MEDIA_BUCKET;
  if (provider.id === "s3") return (process.env.STORAGE_ENTITY_MEDIA_BUCKET || ENTITY_MEDIA_BUCKET).trim();
  throw new StorageApiError(503, "DURABLE_STORAGE_UNAVAILABLE", "Entity images require a durable private Storage provider.");
}

async function assertEntityExists(server: SupabaseClient, companyId: string, entityType: EntityMediaEntityType, entityId: string): Promise<void> {
  const config = ENTITY_CONFIG[entityType];
  const { data, error } = await server.from(config.table).select("id").eq("company_id", companyId).eq("id", entityId).maybeSingle();
  if (error) throw new StorageApiError(503, "ENTITY_LOOKUP_UNAVAILABLE", "The entity image target could not be verified safely.");
  if (!data) throw new StorageApiError(404, "ENTITY_NOT_FOUND", "The requested entity is unavailable in this company.");
}

function currentMediaQuery(server: SupabaseClient, companyId: string, entityType: EntityMediaEntityType, entityId: string) {
  const column = ENTITY_CONFIG[entityType].column;
  return server.from("entity_media").select("*").eq("company_id", companyId).eq(column, entityId).maybeSingle();
}

function mediaApi(row: Record<string, any>, entityType: EntityMediaEntityType, entityId: string, url: string): EntityMedia {
  return {
    id: String(row.id || ""),
    entityType,
    entityId,
    purpose: String(row.purpose || ENTITY_CONFIG[entityType].purpose) as EntityMedia["purpose"],
    url,
    contentType: String(row.content_type || "image/png") as EntityMedia["contentType"],
    sizeBytes: Number(row.size_bytes || 0),
    sha256: String(row.sha256 || ""),
    ...(row.alt_text ? { altText: String(row.alt_text) } : {}),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

async function deleteObjectIfPresent(provider: DocumentStorageProvider, query: { companyId: string; bucket: string; key: string }): Promise<boolean> {
  try {
    await provider.deleteObject(query);
    return true;
  } catch {
    try {
      await provider.getObject(query);
      return false;
    } catch (readError) { return readError instanceof ObjectNotFoundError; }
  }
}

async function signMedia(row: Record<string, any>, entityType: EntityMediaEntityType, entityId: string, options: EntityMediaRouterOptions, server: SupabaseClient): Promise<EntityMedia> {
  const provider = providerForRow(row, options, server);
  const url = await provider.getSignedUrl({ companyId: String(row.company_id), bucket: String(row.storage_bucket), key: String(row.storage_key) }, { expiresInSeconds: SIGNED_URL_SECONDS, disposition: "inline" });
  return mediaApi(row, entityType, entityId, url);
}

async function processPendingCleanup(companyId: string, options: EntityMediaRouterOptions, server: SupabaseClient): Promise<{ pendingCount: number }> {
  const result = await server.from("entity_media_cleanup_queue")
    .select("id,company_id,storage_provider,storage_bucket,storage_key,attempt_count")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true })
    .limit(20);
  if (result.error) return { pendingCount: 1 };

  for (const cleanupRow of (result.data || []) as Record<string, any>[]) {
    try {
      const provider = providerForRow(cleanupRow, options, server);
      const query = { companyId, bucket: String(cleanupRow.storage_bucket), key: String(cleanupRow.storage_key) };
      if (!(await deleteObjectIfPresent(provider, query))) throw new Error("Storage cleanup could not be confirmed.");
      const removeResult = await server.from("entity_media_cleanup_queue").delete().eq("company_id", companyId).eq("id", cleanupRow.id);
      if (removeResult.error) throw removeResult.error;
    } catch {
      await server.from("entity_media_cleanup_queue").update({ attempt_count: Number(cleanupRow.attempt_count || 0) + 1, last_attempt_at: new Date().toISOString() })
        .eq("company_id", companyId).eq("id", cleanupRow.id);
    }
  }

  const remaining = await server.from("entity_media_cleanup_queue").select("id").eq("company_id", companyId).limit(1);
  return { pendingCount: remaining.error ? 1 : (remaining.data || []).length };
}

async function compensateFailedUpload(
  provider: DocumentStorageProvider,
  server: SupabaseClient,
  companyId: string,
  bucket: string,
  key: string,
  actorUserId: string,
): Promise<boolean> {
  const reference = await server.from("entity_media").select("id").eq("company_id", companyId).eq("storage_key", key).maybeSingle();
  if (reference.error || reference.data) return false;
  if (await deleteObjectIfPresent(provider, { companyId, bucket, key })) return true;
  try {
    const queued = await server.from("entity_media_cleanup_queue").insert({
      company_id: companyId,
      storage_provider: provider.id,
      storage_bucket: bucket,
      storage_key: key,
      cleanup_reason: "FAILED_UPLOAD",
      requested_by_user_id: actorUserId,
    });
    return !queued.error;
  } catch {
    return false;
  }
}

function altText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").trim();
  if (cleaned.length > 240) throw new StorageApiError(400, "INVALID_ALT_TEXT", "Image alt text must be 240 characters or fewer.");
  return cleaned || null;
}

export function createEntityMediaRouter(options: EntityMediaRouterOptions = {}): Router {
  const router = express.Router();
  const authorizer = options.authorizer || authorizeStorageRequest;

  router.get("/:entityType", async (req: Request, res: Response) => {
    try {
      const entityType = requestedEntityType(req.params.entityType);
      const auth = await authorizer(req, ENTITY_CONFIG[entityType].readPermission);
      const idsRaw = typeof req.query.ids === "string" ? req.query.ids : "";
      const entityIds = [...new Set(idsRaw.split(",").map((id) => id.trim()).filter(Boolean))].map((id) => requestedUuid(id, "Entity ID"));
      if (!entityIds.length || entityIds.length > 100) throw new StorageApiError(400, "INVALID_ENTITY_IDS", "Request between 1 and 100 entity IDs for image previews.");
      const server = serviceClient(options);
      const config = ENTITY_CONFIG[entityType];
      const entities = await server.from(config.table).select("id").eq("company_id", auth.companyId).in("id", entityIds);
      if (entities.error) throw new StorageApiError(503, "ENTITY_LOOKUP_UNAVAILABLE", "Entity image targets could not be verified safely.");
      const visibleIds = (entities.data || []).map((row: Record<string, any>) => String(row.id));
      if (!visibleIds.length) return res.json({ success: true, data: { byEntityId: {} } });
      await processPendingCleanup(auth.companyId, options, server);
      const mediaResult = await server.from("entity_media").select("*").eq("company_id", auth.companyId).in(config.column, visibleIds);
      if (mediaResult.error) throw new StorageApiError(503, "ENTITY_MEDIA_UNAVAILABLE", "Entity image metadata is temporarily unavailable.");
      const entries = await Promise.all(((mediaResult.data || []) as Record<string, any>[]).map(async (row) => {
        const entityId = String(row[config.column] || "");
        return [entityId, await signMedia(row, entityType, entityId, options, server)] as const;
      }));
      return res.json({ success: true, data: { byEntityId: Object.fromEntries(entries) } });
    } catch (error: any) {
      return res.status(apiStatus(error)).json(apiErrorPayload(error, "Entity images could not be loaded safely."));
    }
  });

  router.get("/:entityType/:entityId", async (req: Request, res: Response) => {
    try {
      const entityType = requestedEntityType(req.params.entityType);
      const entityId = requestedUuid(req.params.entityId, "Entity ID");
      const auth = await authorizer(req, ENTITY_CONFIG[entityType].readPermission);
      const server = serviceClient(options);
      await assertEntityExists(server, auth.companyId, entityType, entityId);
      await processPendingCleanup(auth.companyId, options, server);
      const { data, error } = await currentMediaQuery(server, auth.companyId, entityType, entityId);
      if (error) throw new StorageApiError(503, "ENTITY_MEDIA_UNAVAILABLE", "Entity image metadata is temporarily unavailable.");
      const media = data ? await signMedia(record(data), entityType, entityId, options, server) : null;
      return res.json({ success: true, data: { media } });
    } catch (error: any) {
      return res.status(apiStatus(error)).json(apiErrorPayload(error, "Entity image could not be opened safely."));
    }
  });

  router.post("/:entityType/:entityId", async (req: Request, res: Response) => {
    let auth: StorageAuthContext | null = null;
    let server: SupabaseClient | null = null;
    let provider: DocumentStorageProvider | null = null;
    let bucket = "";
    let storageKey = "";
    let uploadAttempted = false;
    try {
      const entityType = requestedEntityType(req.params.entityType);
      const entityId = requestedUuid(req.params.entityId, "Entity ID");
      auth = await authorizer(req, ENTITY_CONFIG[entityType].managePermission);
      server = serviceClient(options);
      await assertEntityExists(server, auth.companyId, entityType, entityId);

      if (!Object.hasOwn(req.body || {}, "expectedMediaId")) throw new StorageApiError(400, "EXPECTED_MEDIA_REQUIRED", "Refresh the current image before uploading or replacing it.");
      const expectedMediaId = req.body.expectedMediaId === null ? null : requestedUuid(req.body.expectedMediaId, "Current media ID");
      const { data: current, error: currentError } = await currentMediaQuery(server, auth.companyId, entityType, entityId);
      if (currentError) throw new StorageApiError(503, "ENTITY_MEDIA_UNAVAILABLE", "Current image state could not be checked safely.");
      if ((current?.id || null) !== expectedMediaId) throw new StorageApiError(409, "EXPECTED_MEDIA_MISMATCH", "This image changed in another session. Refresh it before retrying.");

      const fileData = typeof req.body?.fileData === "string" ? req.body.fileData : "";
      const fileName = typeof req.body?.fileName === "string" ? req.body.fileName : "";
      const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType : "";
      if (!fileData || !fileName || !mimeType) throw new StorageApiError(400, "INVALID_ENTITY_IMAGE", "Choose a JPEG, PNG, or WebP image to upload.");
      let bytes: Uint8Array;
      const contentType = mimeType.split(";", 1)[0].trim().toLowerCase();
      try {
        bytes = decodeBase64Payload(fileData, MAX_ENTITY_MEDIA_BYTES, "Entity image");
        validateEntityMediaBytes(bytes, contentType, fileName);
      } catch (error: any) {
        throw new StorageApiError(400, "INVALID_ENTITY_IMAGE", error?.message || "Choose a JPEG, PNG, or WebP image up to 5 MiB.");
      }
      const safeAltText = altText(req.body?.altText);
      const safeFileName = sanitizeStorageFileName(fileName, "entity-image.png");
      const mediaId = randomUUID();
      storageKey = buildEntityMediaStoragePath({ companyId: auth.companyId, entityType, entityId, mediaId, contentType });
      provider = primaryProvider(options, server);
      bucket = bucketForProvider(provider);
      const sha256 = await calculateSha256Hex(bytes);
      uploadAttempted = true;
      const stored = await provider.putObject({
        companyId: auth.companyId,
        bucket,
        key: storageKey,
        bytes,
        contentType,
        sha256,
        upsert: false,
        customMetadata: { entityType, entityId, fileName: safeFileName },
      });
      if (stored.ref.providerId !== provider.id
        || stored.ref.companyId !== auth.companyId
        || stored.ref.bucket !== bucket
        || stored.ref.key !== storageKey
        || stored.ref.sizeBytes !== bytes.byteLength
        || stored.ref.contentType !== contentType
        || stored.ref.sha256 !== sha256) {
        throw new StorageApiError(503, "STORAGE_INTEGRITY_ERROR", "Uploaded entity image did not match its verified Storage metadata.");
      }

      const { data, error } = await server.rpc("server_replace_entity_media", {
        p_company_id: auth.companyId,
        p_actor_user_id: auth.user.id,
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_media_id: mediaId,
        p_storage_provider: provider.id,
        p_storage_bucket: bucket,
        p_storage_key: storageKey,
        p_content_type: contentType,
        p_size_bytes: bytes.byteLength,
        p_sha256: sha256,
        p_alt_text: safeAltText,
        p_expected_media_id: expectedMediaId,
      });
      if (error || !data) {
        const persisted = await server.from("entity_media").select("*").eq("company_id", auth.companyId).eq("storage_key", storageKey).maybeSingle();
        if (persisted.error) throw new StorageApiError(503, "UPLOAD_STATE_UNVERIFIED", "Image persistence could not be confirmed; the uploaded object was retained safely for reconciliation.");
        if (!persisted.data) {
          const compensated = await compensateFailedUpload(provider, server, auth.companyId, bucket, storageKey, auth.user.id);
          uploadAttempted = false;
          if (!compensated) throw new StorageApiError(503, "UPLOAD_CLEANUP_PENDING", "The image could not be committed; safe Storage cleanup could not be confirmed. Retry after Storage recovers.");
          throw error || new StorageApiError(503, "ENTITY_MEDIA_COMMIT_FAILED", "The image could not be committed safely.");
        }
        uploadAttempted = false;
        const committed = record(persisted.data);
        const url = await provider.getSignedUrl({ companyId: auth.companyId, bucket: String(committed.storage_bucket), key: String(committed.storage_key) }, { expiresInSeconds: SIGNED_URL_SECONDS, disposition: "inline" });
        const cleanup = await processPendingCleanup(auth.companyId, options, server);
        return res.status(201).json({ success: true, data: { media: mediaApi(committed, entityType, entityId, url), cleanupPending: cleanup.pendingCount > 0 } });
      }

      uploadAttempted = false;
      const mediaRow = record(data);
      const url = await provider.getSignedUrl({ companyId: auth.companyId, bucket, key: storageKey }, { expiresInSeconds: SIGNED_URL_SECONDS, disposition: "inline" });
      const cleanup = await processPendingCleanup(auth.companyId, options, server);
      return res.status(201).json({ success: true, data: { media: mediaApi(mediaRow, entityType, entityId, url), cleanupPending: cleanup.pendingCount > 0 } });
    } catch (error: any) {
      if (uploadAttempted && auth && server && provider && storageKey && bucket) {
        const compensated = await compensateFailedUpload(provider, server, auth.companyId, bucket, storageKey, auth.user.id);
        if (!compensated) {
          const pendingError = new StorageApiError(503, "UPLOAD_CLEANUP_PENDING", "The image could not be committed; safe Storage cleanup could not be confirmed. Retry after Storage recovers.");
          return res.status(apiStatus(pendingError)).json(apiErrorPayload(pendingError, "The image upload failed safely."));
        }
      }
      return res.status(apiStatus(error)).json(apiErrorPayload(error, "The entity image could not be uploaded safely."));
    }
  });

  router.delete("/:entityType/:entityId/:mediaId", async (req: Request, res: Response) => {
    try {
      const entityType = requestedEntityType(req.params.entityType);
      const entityId = requestedUuid(req.params.entityId, "Entity ID");
      const mediaId = requestedUuid(req.params.mediaId, "Media ID");
      const auth = await authorizer(req, ENTITY_CONFIG[entityType].managePermission);
      const server = serviceClient(options);
      await assertEntityExists(server, auth.companyId, entityType, entityId);
      const { data: current, error: currentError } = await currentMediaQuery(server, auth.companyId, entityType, entityId);
      if (currentError) throw new StorageApiError(503, "ENTITY_MEDIA_UNAVAILABLE", "Current image state could not be checked safely.");
      if (!current || current.id !== mediaId) throw new StorageApiError(409, "EXPECTED_MEDIA_MISMATCH", "This image changed in another session. Refresh it before retrying.");

      const { data, error } = await server.rpc("server_remove_entity_media", {
        p_company_id: auth.companyId,
        p_actor_user_id: auth.user.id,
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_expected_media_id: mediaId,
      });
      if (error || !data) {
        const stillCurrent = await currentMediaQuery(server, auth.companyId, entityType, entityId);
        if (stillCurrent.error) throw new StorageApiError(503, "REMOVE_STATE_UNVERIFIED", "Image removal state could not be confirmed safely.");
        if (stillCurrent.data) throw error || new StorageApiError(503, "ENTITY_MEDIA_REMOVE_FAILED", "The current image could not be removed safely.");
      }
      const cleanup = await processPendingCleanup(auth.companyId, options, server);
      return res.json({ success: true, data: { media: null, cleanupPending: cleanup.pendingCount > 0 } });
    } catch (error: any) {
      return res.status(apiStatus(error)).json(apiErrorPayload(error, "The entity image could not be removed safely."));
    }
  });

  return router;
}
