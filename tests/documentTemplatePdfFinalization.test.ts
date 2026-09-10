import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import http from "node:http";
import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { buildClientInvoicePdf, buildPurchaseOrderPdf, type ClientInvoiceDocumentSnapshot, type PurchaseOrderDocumentSnapshot } from "../src/lib/documentGeneration.ts";
import { calculateSha256Hex } from "../src/lib/storage/dedup.ts";
import { MemoryStorageProvider } from "../src/lib/storage/providers/memoryProvider.ts";
import { StorageApiError, type StorageAuthContext } from "../src/server/storage/storageRouter.ts";
import { createDocumentTemplateRouter, finalizeIssuedDocumentTemplatePdfForDelivery } from "../src/server/documentTemplates/documentTemplateRouter.ts";
import {
  buildStarterDocxTemplate,
  extractDocxStructure,
  mergeDocxTemplate,
} from "../src/server/documentTemplates/documentTemplateEngine.ts";
import {
  clearDocumentPdfFinalizationHealthCache,
  createDocumentPdfConverter,
  DocumentPdfFinalizationError,
  finalizeMergedDocxToPdf,
  getDocumentPdfFinalizationHealth,
  isValidPdfBytes,
  LibreOfficePdfConverter,
  DOCUMENT_PDF_TEMP_PREFIX,
} from "../src/server/documentTemplates/documentPdfFinalizer.ts";

const COMPANY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_COMPANY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const VERSION_ID = "11111111-1111-4111-8111-111111111111";
const TEMPLATE_ID = "22222222-2222-4222-8222-222222222222";
const SNAPSHOT_ID = "33333333-3333-4333-8333-333333333333";
const DOCUMENT_ID = "44444444-4444-4444-8444-444444444444";
const TEMPLATE_BUCKET = "test-bucket";

function purchaseOrderSnapshot(): PurchaseOrderDocumentSnapshot {
  return {
    snapshotId: SNAPSHOT_ID,
    documentId: DOCUMENT_ID,
    documentType: "PURCHASE_ORDER",
    documentNumber: "PO-2026-001",
    status: "ISSUED",
    issueDate: "2026-09-10",
    currency: "PHP",
    description: "Materials",
    notes: "Deliver to site",
    termsAndConditions: "Net 30",
    company: { legalName: "Acme Construction", address: "Bulacan", contactNumber: "09000000000", email: "accounts@acme.test" },
    supplier: { name: "Supplier One", address: "Supplier address", email: "supplier@test.local", phone: "09170000000", vatTin: "000", attention: "Purchasing" },
    project: { projectCode: "PRJ-1", projectName: "Project One", deliverTo: "Project site" },
    lines: [
      { lineNumber: 1, description: "Cement", quantity: 2, unit: "bags", unitPrice: 100, amount: 200 },
      { lineNumber: 2, description: "Steel", quantity: 3, unit: "pcs", unitPrice: 50, amount: 150 },
    ],
    totalAmount: 350,
    amountInWords: "three hundred fifty PHP only",
    processor: { name: "Authorized User", title: "Coordinator" },
    templateVersion: "Acme v1",
    templateVersionId: VERSION_ID,
  };
}

function clientInvoiceSnapshot(): ClientInvoiceDocumentSnapshot {
  return {
    snapshotId: SNAPSHOT_ID,
    documentId: DOCUMENT_ID,
    documentType: "CLIENT_INVOICE",
    documentNumber: "INV-2026-001",
    status: "ISSUED",
    invoiceDate: "2026-09-10",
    dueDate: "2026-10-10",
    paymentTerms: "30 days",
    currency: "PHP",
    taxTreatment: "VAT",
    company: { legalName: "Acme Construction", address: "Bulacan", contactNumber: "09000000000", email: "accounts@acme.test", paymentInstructions: "Pay by bank transfer." },
    project: { projectCode: "PRJ-1", projectName: "Project One" },
    billTo: { name: "Client One", contactName: "Accounts Payable", email: "client@test.local", address: "Manila", reference: "Contract 1" },
    lines: [
      { lineNumber: 1, description: "Progress billing", amount: 1_000, notes: "Milestone 1" },
      { lineNumber: 2, description: "Site coordination", amount: 250 },
    ],
    subtotal: 1_250,
    taxAmount: 0,
    totalAmount: 1_250,
    amountInWords: "one thousand two hundred fifty PHP only",
    notes: "Thank you.",
    termsAndConditions: "Net 30",
    processor: { name: "Authorized User", title: "Coordinator" },
    templateVersion: "Acme v1",
    templateVersionId: VERSION_ID,
  };
}

function bucketedMemoryProvider() {
  const provider = new MemoryStorageProvider();
  return {
    provider: {
      id: "memory" as const,
      putObject: (input: any) => provider.putObject({ ...input, bucket: input.bucket || TEMPLATE_BUCKET }),
      getObject: (input: any) => provider.getObject({ ...input, bucket: input.bucket || TEMPLATE_BUCKET }),
      getSignedUrl: (input: any, options: any) => provider.getSignedUrl({ ...input, bucket: input.bucket || TEMPLATE_BUCKET }, options),
      deleteObject: (input: any) => provider.deleteObject({ ...input, bucket: input.bucket || TEMPLATE_BUCKET }),
      headObject: (input: any) => provider.headObject({ ...input, bucket: input.bucket || TEMPLATE_BUCKET }),
    },
    raw: provider,
  };
}

function queryFor(row: Record<string, unknown> | null) {
  const filters = new Map<string, string>();
  const query: any = {
    select: () => query,
    eq: (key: string, value: unknown) => { filters.set(key, String(value)); return query; },
    order: () => query,
    maybeSingle: async () => {
      if (!row) return { data: null, error: null };
      const matches = [...filters].every(([key, value]) => String(row[key] ?? "") === value);
      return { data: matches ? row : null, error: null };
    },
  };
  return query;
}

async function setupRouterServer(options: {
  readonly versionCompanyId?: string;
  readonly snapshotTemplateHash?: string | null;
  readonly permissionAllowed?: boolean;
  readonly snapshotPinned?: boolean;
  readonly snapshotStatus?: "CANCELLED" | "VOIDED";
  readonly converter?: { id: "test"; version: string; convert(input: { docxBytes: Uint8Array }): Promise<Uint8Array> };
}) {
  const built = await buildStarterDocxTemplate("PURCHASE_ORDER");
  const templatePath = `companies/${options.versionCompanyId || COMPANY_ID}/document-templates/${TEMPLATE_ID}/PURCHASE_ORDER/${VERSION_ID}/template.docx`;
  const templateHash = await calculateSha256Hex(built.bytes);
  const storage = bucketedMemoryProvider();
  await storage.provider.putObject({ companyId: options.versionCompanyId || COMPANY_ID, bucket: TEMPLATE_BUCKET, key: templatePath, bytes: built.bytes, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sha256: templateHash });
  const snapshot = purchaseOrderSnapshot();
  const snapshotRow: Record<string, unknown> = {
    id: SNAPSHOT_ID,
    company_id: COMPANY_ID,
    document_type: "PURCHASE_ORDER",
    document_id: DOCUMENT_ID,
    document_number: snapshot.documentNumber,
    template_version: snapshot.templateVersion,
    template_version_id: options.snapshotPinned === false ? null : VERSION_ID,
    template_sha256: options.snapshotTemplateHash === undefined ? templateHash : options.snapshotTemplateHash,
    snapshot: { ...snapshot, snapshotId: undefined, documentId: undefined, ...(options.snapshotStatus ? { status: options.snapshotStatus } : {}) },
  };
  const versionRow: Record<string, unknown> = {
    id: VERSION_ID,
    template_id: TEMPLATE_ID,
    company_id: options.versionCompanyId || COMPANY_ID,
    document_type: "PURCHASE_ORDER",
    display_name: "Acme Purchase Order",
    origin: "STARTER",
    version_number: 1,
    source_filename: "template.docx",
    source_storage_path: templatePath,
    content_storage_path: templatePath,
    storage_provider: "memory",
    storage_bucket: TEMPLATE_BUCKET,
    mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    content_size: built.bytes.byteLength,
    content_sha256: templateHash,
    bindings: built.bindings,
    validation_state: "VALID",
    validation_report: {},
    status: "ACTIVE",
  };
  const authSupabase: any = {
    from: (table: string) => table === "document_template_versions" ? queryFor(versionRow) : queryFor(snapshotRow),
  };
  const evidencePayloads: any[] = [];
  const serverSupabase: any = {
    rpc: async (name: string, args: any) => {
      if (name === "record_document_generation_evidence") evidencePayloads.push(args.p_payload);
      return { data: { id: "55555555-5555-4555-8555-555555555555" }, error: null };
    },
  };
  const requestedPermissions: string[] = [];
  const authorizer = async (_req: any, permission: any): Promise<StorageAuthContext> => {
    requestedPermissions.push(permission);
    if (options.permissionAllowed === false) throw new StorageApiError(403, "FORBIDDEN", "Permission denied.");
    return { accessToken: "test-token", companyId: COMPANY_ID, user: { id: USER_ID } as any, supabase: authSupabase };
  };
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/document-templates", createDocumentTemplateRouter({
    authorizer,
    providerSupplier: () => storage.provider,
    primaryProviderSupplier: () => storage.provider,
    serverSupabaseSupplier: () => serverSupabase,
    pdfConverterSupplier: options.converter ? () => options.converter! : undefined,
    pdfCapabilitySupplier: () => ({ status: "UNAVAILABLE", message: "High-fidelity PDF conversion is unavailable on this deployment." }),
  }));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  return { server, url: `http://127.0.0.1:${address.port}`, built, templateHash, evidencePayloads, requestedPermissions, storage, authSupabase };
}

async function closeServer(server: http.Server) {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

test("finalization converts the exact merged DOCX and preserves scalar and variable line-item values", async () => {
  const built = await buildStarterDocxTemplate("PURCHASE_ORDER");
  const snapshot = purchaseOrderSnapshot();
  const merged = mergeDocxTemplate(built.bytes, "template.docx", snapshot, built.bindings);
  let converterInput: Uint8Array | undefined;
  const pdf = await finalizeMergedDocxToPdf(merged, {
    id: "test",
    version: "fixture-1",
    convert: async ({ docxBytes }) => {
      converterInput = docxBytes;
      const mergedStructure = extractDocxStructure(docxBytes, "merged.docx");
      assert.equal(mergedStructure.tags.length, 0);
      assert.match(mergedStructure.text, /Cement/);
      assert.match(mergedStructure.text, /Steel/);
      return buildPurchaseOrderPdf(snapshot);
    },
  });
  assert.equal(converterInput, merged);
  assert.equal(isValidPdfBytes(pdf), true);
  const pdfText = new TextDecoder().decode(pdf);
  assert.match(pdfText, /PO-2026-001/);
  assert.match(pdfText, /Cement/);
  assert.match(pdfText, /Steel/);
  assert.match(pdfText, /PHP 350\.00/);
});

test("client invoice finalization preserves authoritative invoice scalars and line items", async () => {
  const built = await buildStarterDocxTemplate("CLIENT_INVOICE");
  const snapshot = clientInvoiceSnapshot();
  const merged = mergeDocxTemplate(built.bytes, "template.docx", snapshot, built.bindings);
  const pdf = await finalizeMergedDocxToPdf(merged, {
    id: "test",
    version: "fixture-1",
    convert: async ({ docxBytes }) => {
      const mergedStructure = extractDocxStructure(docxBytes, "merged.docx");
      assert.equal(mergedStructure.tags.length, 0);
      assert.match(mergedStructure.text, /Progress billing/);
      assert.match(mergedStructure.text, /Site coordination/);
      return buildClientInvoicePdf(snapshot);
    },
  });
  assert.equal(isValidPdfBytes(pdf), true);
  const pdfText = new TextDecoder().decode(pdf);
  assert.match(pdfText, /INV-2026-001/);
  assert.match(pdfText, /Client One/);
  assert.match(pdfText, /PHP 1250\.00/);
});

test("finalization fails closed for unresolved tags and invalid converter output", async () => {
  const built = await buildStarterDocxTemplate("PURCHASE_ORDER");
  const snapshot = purchaseOrderSnapshot();
  let calls = 0;
  await assert.rejects(
    finalizeMergedDocxToPdf(built.bytes, { id: "test", version: "fixture-1", convert: async () => { calls += 1; return buildPurchaseOrderPdf(snapshot); } }),
    (error: any) => error instanceof DocumentPdfFinalizationError && error.code === "UNRESOLVED_MERGE_TAGS",
  );
  assert.equal(calls, 0);
  const merged = mergeDocxTemplate(built.bytes, "template.docx", snapshot, built.bindings);
  await assert.rejects(
    finalizeMergedDocxToPdf(merged, { id: "test", version: "fixture-1", convert: async () => new TextEncoder().encode("%PDF-1.4\nnot complete") }),
    (error: any) => error instanceof DocumentPdfFinalizationError && error.code === "PDF_OUTPUT_INVALID",
  );
});

test("converter capability is unavailable without an operational LibreOffice executable", async () => {
  clearDocumentPdfFinalizationHealthCache();
  const env = { DOCUMENT_PDF_CONVERTER_PATH: "/definitely/not/a/converter" };
  const health = await getDocumentPdfFinalizationHealth(env);
  assert.equal(health.status, "UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(health), /definitely|soffice|libreoffice/i);
  await assert.rejects(createDocumentPdfConverter(env), (error: any) => error instanceof DocumentPdfFinalizationError && error.code === "PDF_CONVERTER_UNAVAILABLE");
});

test("failed LibreOffice conversion cleans its random temporary working directory", async () => {
  const before = (await readdir(tmpdir())).filter((name) => name.startsWith(DOCUMENT_PDF_TEMP_PREFIX));
  const built = await buildStarterDocxTemplate("PURCHASE_ORDER");
  const merged = mergeDocxTemplate(built.bytes, "template.docx", purchaseOrderSnapshot(), built.bindings);
  const converter = new LibreOfficePdfConverter(process.execPath, "fixture-1", 1_000);
  await assert.rejects(converter.convert({ docxBytes: merged }), /could not be finalized|invalid document/i);
  const after = (await readdir(tmpdir())).filter((name) => name.startsWith(DOCUMENT_PDF_TEMP_PREFIX));
  assert.deepEqual(after.filter((name) => !before.includes(name)), []);
});

test("issued PDF route binds company, exact template version/hash, source DOCX evidence, and PDF evidence", async () => {
  const fixture = await setupRouterServer({
    converter: { id: "test", version: "fixture-1", convert: async () => buildPurchaseOrderPdf(purchaseOrderSnapshot()) },
  });
  try {
    const response = await fetch(`${fixture.url}/api/document-templates/${VERSION_ID}/finalize-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-token", "x-company-id": COMPANY_ID },
      body: JSON.stringify({ documentType: "PURCHASE_ORDER", snapshotId: SNAPSHOT_ID }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(response.headers.get("x-document-template-version-id"), VERSION_ID);
    assert.equal(response.headers.get("x-document-template-sha256"), fixture.templateHash);
    assert.equal(fixture.evidencePayloads.length, 2);
    const docxEvidence = fixture.evidencePayloads.find((payload) => payload.artifactType === "DOCX");
    const pdfEvidence = fixture.evidencePayloads.find((payload) => payload.artifactType === "PDF");
    assert.ok(docxEvidence);
    assert.ok(pdfEvidence);
    assert.equal(pdfEvidence.sourceArtifactType, "DOCX");
    assert.equal(pdfEvidence.sourceArtifactSha256, docxEvidence.artifactSha256);
    assert.equal(pdfEvidence.sourceArtifactStoragePath, docxEvidence.artifactStoragePath);
    assert.equal(pdfEvidence.converterId, "test");
    assert.equal(pdfEvidence.converterVersion, "fixture-1");
    assert.match(pdfEvidence.artifactStoragePath, /\.pdf$/);
    assert.match(docxEvidence.artifactStoragePath, /\.docx$/);
  } finally {
    await closeServer(fixture.server);
  }
});

test("outbound delivery finalization reuses the exact company-template PDF pipeline and returns provenance", async () => {
  const fixture = await setupRouterServer({
    converter: { id: "test", version: "fixture-1", convert: async () => buildPurchaseOrderPdf(purchaseOrderSnapshot()) },
  });
  try {
    const delivery = await finalizeIssuedDocumentTemplatePdfForDelivery(
      { accessToken: "test-token", companyId: COMPANY_ID, user: { id: USER_ID } as any, supabase: fixture.authSupabase },
      {
        providerSupplier: () => fixture.storage.provider,
        primaryProviderSupplier: () => fixture.storage.provider,
        serverSupabaseSupplier: () => ({ rpc: async (name: string, args: any) => {
          if (name === "record_document_generation_evidence") fixture.evidencePayloads.push(args.p_payload);
          return { data: { id: "55555555-5555-4555-8555-555555555555" }, error: null };
        } }) as any,
        pdfConverterSupplier: () => ({ id: "test", version: "fixture-1", convert: async () => buildPurchaseOrderPdf(purchaseOrderSnapshot()) }),
      },
      { snapshotId: SNAPSHOT_ID, documentType: "PURCHASE_ORDER", documentId: DOCUMENT_ID },
    );
    assert.ok(delivery);
    assert.equal(delivery.attachmentSource, "COMPANY_TEMPLATE_PDF");
    assert.equal(delivery.templateVersionId, VERSION_ID);
    assert.equal(delivery.converterId, "test");
    assert.equal(delivery.converterVersion, "fixture-1");
    assert.equal(await calculateSha256Hex(delivery.bytes), delivery.artifact.artifactSha256);
    assert.equal(delivery.artifact.artifactType, "PDF");
    assert.equal(delivery.sourceArtifact.artifactType, "DOCX");
  } finally {
    await closeServer(fixture.server);
  }
});

test("issued PDF route rejects template hash mismatch, unpinned history, cross-company versions, and insufficient permission", async () => {
  const cases = [
    { name: "hash mismatch", options: { snapshotTemplateHash: "f".repeat(64), converter: { id: "test" as const, version: "fixture-1", convert: async () => buildPurchaseOrderPdf(purchaseOrderSnapshot()) } }, status: 409, message: /template hash/i },
    { name: "historical unpinned", options: { snapshotPinned: false, converter: { id: "test" as const, version: "fixture-1", convert: async () => buildPurchaseOrderPdf(purchaseOrderSnapshot()) } }, status: 409, message: /predates company-template pinning/i },
    { name: "voided snapshot", options: { snapshotStatus: "VOIDED" as const, converter: { id: "test" as const, version: "fixture-1", convert: async () => buildPurchaseOrderPdf(purchaseOrderSnapshot()) } }, status: 422, message: /voided/i },
    { name: "cross-company template", options: { versionCompanyId: OTHER_COMPANY_ID, converter: { id: "test" as const, version: "fixture-1", convert: async () => buildPurchaseOrderPdf(purchaseOrderSnapshot()) } }, status: 404, message: /not found/i },
    { name: "insufficient permission", options: { permissionAllowed: false, converter: { id: "test" as const, version: "fixture-1", convert: async () => buildPurchaseOrderPdf(purchaseOrderSnapshot()) } }, status: 403, message: /permission denied/i },
    { name: "converter timeout", options: { converter: { id: "test" as const, version: "fixture-1", convert: async () => { throw new DocumentPdfFinalizationError("PDF_CONVERSION_TIMEOUT", "The company-template PDF conversion timed out safely.", 504); } } }, status: 504, message: /timed out safely/i },
    { name: "converter unavailable", options: { converter: { id: "test" as const, version: "fixture-1", convert: async () => { throw new DocumentPdfFinalizationError("PDF_CONVERTER_UNAVAILABLE", "High-fidelity PDF conversion is unavailable on this deployment. Use the existing PDF fallback."); } } }, status: 503, message: /unavailable on this deployment/i },
  ];
  for (const item of cases) {
    const fixture = await setupRouterServer(item.options);
    try {
      const response = await fetch(`${fixture.url}/api/document-templates/${VERSION_ID}/finalize-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer test-token", "x-company-id": COMPANY_ID },
        body: JSON.stringify({ documentType: "PURCHASE_ORDER", snapshotId: SNAPSHOT_ID }),
      });
      assert.equal(response.status, item.status, item.name);
      assert.match((await response.json()).error, item.message, item.name);
      assert.equal(fixture.evidencePayloads.length, 0, item.name);
    } finally {
      await closeServer(fixture.server);
    }
  }
});

test("PDF capability endpoint reports unavailable without claiming availability", async () => {
  const fixture = await setupRouterServer({});
  try {
    const response = await fetch(`${fixture.url}/api/document-templates/capability`, { headers: { Authorization: "Bearer test-token", "x-company-id": COMPANY_ID } });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.data.status, "UNAVAILABLE");
    assert.doesNotMatch(JSON.stringify(payload.data), /\bAvailable\b/i);
  } finally {
    await closeServer(fixture.server);
  }
});

test("PDF route uses the trusted server evidence boundary and keeps delivery separate", () => {
  const router = readFileSync(new URL("../src/server/documentTemplates/documentTemplateRouter.ts", import.meta.url), "utf8");
  const preview = readFileSync(new URL("../src/components/DocumentPreviewModal.tsx", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/20260910081451_document_template_pdf_finalization.sql", import.meta.url), "utf8");
  const dockerfile = readFileSync(new URL("../Dockerfile.document-pdf", import.meta.url), "utf8");
  assert.match(router, /router\.post\("\/:versionId\/finalize-pdf"/);
  assert.match(router, /const evidenceClient = serverSupabase\(options\)/);
  assert.match(router, /TEMPLATE_HASH_MISMATCH/);
  assert.match(router, /sourceArtifactSha256/);
  assert.match(preview, /Company-template PDF/);
  assert.match(preview, /existing PDF fallback/i);
  assert.match(migration, /artifact_type in \('DOCX', 'PDF'\)/);
  assert.match(migration, /document_generation_evidence_pdf_provenance_check/);
  assert.match(migration, /grant execute on function public\.record_document_generation_evidence\(jsonb\) to service_role/);
  assert.doesNotMatch(migration, /grant execute on function public\.record_document_generation_evidence\(jsonb\) to authenticated/);
  assert.match(dockerfile, /libreoffice-writer/);
  assert.match(dockerfile, /DOCUMENT_PDF_CONVERTER_PATH=\/usr\/bin\/soffice/);
  assert.match(dockerfile, /USER node/);
});
