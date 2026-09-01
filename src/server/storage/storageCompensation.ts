/**
 * Narrowly scoped, server-controlled compensation for failed storage uploads.
 * Ensures unreferenced objects are safely cleaned up while strictly forbidding
 * deletion of any committed, auditable, or referenced business documents.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isCompanyScopedPath } from "../../lib/storage/keys.ts";
import { type StorageProviderId, StorageError } from "../../lib/storage/types.ts";
import { createStorageProvider } from "../../lib/storage/config.ts";

export interface CompensationInput {
  companyId: string;
  bucket: string;
  key: string;
  providerId: StorageProviderId;
  supabase: SupabaseClient;
  serverSupabaseSupplier?: () => SupabaseClient;
}

/**
 * Creates a server-only privileged Supabase client for storage compensation cleanup.
 * Strictly uses server-side service-role key and rejects public/publishable keys.
 */
export function getStorageServerServiceRoleClient(): SupabaseClient {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const serviceKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_STORAGE_SERVER_KEY ||
    ""
  ).trim();

  if (!url || !serviceKey) {
    throw new StorageError(
      "Privileged Supabase storage cleanup client is not configured on the server (missing server service role key).",
      "SERVER_CLEANUP_UNAVAILABLE",
      503,
    );
  }

  // Reject public/publishable/anon keys from being misused as service keys
  if (/^pk_|^anon_|_anon_|publishable/i.test(serviceKey)) {
    throw new StorageError(
      "Invalid storage server key: cannot use publishable/anon key for privileged storage compensation.",
      "INVALID_SERVER_KEY",
      500,
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Execute safe compensation for a failed document upload attempt.
 */
export async function compensateFailedUpload(input: CompensationInput): Promise<{ compensated: boolean; reason?: string }> {
  const { companyId, bucket, key, providerId, supabase } = input;

  if (!companyId) {
    throw new StorageError("Company ID is required for storage compensation.");
  }

  if (!isCompanyScopedPath(key, companyId)) {
    throw new StorageError(`Compensation rejected: key "${key}" violates company boundary for "${companyId}".`);
  }

  // 1. Authoritative Invariant: Check whether this object is referenced in source_documents
  const { data: sourceDocRows, error: docError } = await supabase
    .from("source_documents")
    .select("id")
    .eq("company_id", companyId)
    .eq("storage_path", key)
    .limit(1);

  if (docError) {
    console.error("[Storage Compensation] DB check error on source_documents:", docError);
    throw new StorageError(`Compensation aborted: could not verify source document provenance (${docError.message}).`);
  }

  if (sourceDocRows && sourceDocRows.length > 0) {
    throw new StorageError(
      `Compensation rejected: object "${key}" is referenced by committed source document "${sourceDocRows[0].id}".`,
    );
  }

  // 2. The object is proven uncommitted/orphaned. Execute deletion using server authority.
  if (providerId === "s3") {
    const s3Provider = createStorageProvider("s3");
    await s3Provider.deleteObject({ companyId, bucket, key });
    return { compensated: true };
  }

  if (providerId === "supabase") {
    const client = input.serverSupabaseSupplier ? input.serverSupabaseSupplier() : getStorageServerServiceRoleClient();
    const { error: removeError } = await client.storage.from(bucket).remove([key]);
    if (removeError) {
      console.error("[Storage Compensation] Supabase object removal failed:", removeError);
      throw new StorageError(`Failed to delete uncommitted Supabase object during compensation: ${removeError.message}`);
    }
    return { compensated: true };
  }

  if (providerId === "memory") {
    const memProvider = createStorageProvider("memory");
    await memProvider.deleteObject({ companyId, bucket, key });
    return { compensated: true };
  }

  throw new StorageError(`Compensation unsupported for provider: "${providerId}"`);
}
