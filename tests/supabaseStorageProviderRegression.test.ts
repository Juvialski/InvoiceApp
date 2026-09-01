import test from "node:test";
import assert from "node:assert/strict";
import { SupabaseStorageProvider } from "../src/lib/storage/providers/supabaseProvider.ts";

test("SupabaseStorageProvider defaults manual invoice writes to invoice-originals when bucket is omitted", async () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const key = `companies/${companyId}/invoices/manual/2026/09/default-bucket.pdf`;
  const bytes = new TextEncoder().encode("%PDF-1.4 default bucket regression");
  const requestedBuckets: string[] = [];

  const mockSupabase: any = {
    storage: {
      from: (bucket: string) => {
        requestedBuckets.push(bucket);
        return {
          upload: async () => ({ error: null }),
        };
      },
    },
  };

  const provider = new SupabaseStorageProvider(() => mockSupabase);
  const result = await provider.putObject({
    companyId,
    key,
    bytes,
    contentType: "application/pdf",
  });

  assert.deepEqual(requestedBuckets, ["invoice-originals"]);
  assert.equal(result.ref.bucket, "invoice-originals");
  assert.equal(result.metadata.bucket, "invoice-originals");
});
