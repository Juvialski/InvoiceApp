/**
 * Narrowly scoped, server-controlled compensation for failed storage uploads.
 * Ensures unreferenced objects are safely cleaned up while strictly forbidding
 * deletion of any committed, auditable, or referenced business documents.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
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

  // 1. Invariant: Check whether this object is referenced in source_documents
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

  // 2. Invariant: Check whether this object is referenced in invoices
  const { data: invoiceRows, error: invoiceError } = await supabase
    .from("invoices")
    .select("id")
    .eq("company_id", companyId)
    .eq("source_storage_path", key)
    .limit(1);

  if (invoiceError) {
    console.error("[Storage Compensation] DB check error on invoices:", invoiceError);
    throw new StorageError(`Compensation aborted: could not verify invoice provenance (${invoiceError.message}).`);
  }

  if (invoiceRows && invoiceRows.length > 0) {
    throw new StorageError(
      `Compensation rejected: object "${key}" is referenced by committed invoice "${invoiceRows[0].id}".`,
    );
  }

  // 3. The object is proven uncommitted/orphaned. Delete from the target provider.
  if (providerId === "s3") {
    const s3Provider = createStorageProvider("s3");
    await s3Provider.deleteObject({ companyId, bucket, key });
    return { compensated: true };
  }

  if (providerId === "supabase") {
    const client = input.serverSupabaseSupplier ? input.serverSupabaseSupplier() : supabase;
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
