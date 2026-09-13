import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import http from "node:http";
import { readFileSync } from "node:fs";
import PizZip from "pizzip";
import { MemoryStorageProvider } from "../src/lib/storage/providers/memoryProvider.ts";
import { type StorageAuthContext } from "../src/server/storage/storageRouter.ts";
import {
  buildDocxTemplateFromBlueprint,
  buildStarterDocxTemplate,
  classifyExternalRelationship,
  DOCX_EXTERNAL_RESOURCE_MESSAGE,
  extractDocxStructure,
  mergeDocxTemplate,
  validateDocxTemplateBytes,
  DocumentTemplateValidationError,
} from "../src/server/documentTemplates/documentTemplateEngine.ts";
import { starterTemplateBlueprint, validateDocumentTemplateBindings } from "../src/lib/documentTemplateRegistry.ts";
import { createDocumentTemplateRouter } from "../src/server/documentTemplates/documentTemplateRouter.ts";

const COMPANY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const HYPERLINK_RELATIONSHIP_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink";
const IMAGE_RELATIONSHIP_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
const ATTACHED_TEMPLATE_RELATIONSHIP_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate";
const OLE_RELATIONSHIP_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject";
const EXTERNAL_LINK_RELATIONSHIP_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLink";
const UNKNOWN_RELATIONSHIP_TYPE = "http://example.test/relationships/unknown-resource";
const RELATIONSHIPS_NAMESPACE = "http://schemas.openxmlformats.org/package/2006/relationships";
const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function xmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function relationshipXml(input: { type: string; target: string; targetMode?: string }, id = "rIdSynthetic"): string {
  return `<Relationship Id="${id}" Type="${xmlText(input.type)}" Target="${xmlText(input.target)}"${input.targetMode ? ` TargetMode="${xmlText(input.targetMode)}"` : ""}/>`;
}

async function starterBytes(documentType: "PURCHASE_ORDER" | "CLIENT_INVOICE"): Promise<Uint8Array> {
  return (await buildStarterDocxTemplate(documentType)).bytes;
}

function withDocxParts(
  base: Uint8Array,
  options: {
    relationship?: { type: string; target: string; targetMode?: string };
    hyperlinkText?: string;
    fieldCodePieces?: readonly string[];
    simpleFieldCode?: string;
    directResourceTarget?: string;
    externalLinksPart?: boolean;
  },
): Uint8Array {
  const zip = new PizZip(base);
  const documentFile = zip.file("word/document.xml");
  assert.ok(documentFile);
  const nodes: string[] = [];
  if (options.hyperlinkText) {
    nodes.push(`<w:p><w:hyperlink r:id="rIdSynthetic"><w:r><w:t>${xmlText(options.hyperlinkText)}</w:t></w:r></w:hyperlink></w:p>`);
  }
  if (options.fieldCodePieces) {
    nodes.push(`<w:p>${options.fieldCodePieces.map((piece) => `<w:r><w:instrText xml:space="preserve">${xmlText(piece)}</w:instrText></w:r>`).join("")}</w:p>`);
  }
  if (options.simpleFieldCode) {
    nodes.push(`<w:p><w:fldSimple w:instr="${xmlText(options.simpleFieldCode)}"><w:r><w:t>Company link</w:t></w:r></w:fldSimple></w:p>`);
  }
  if (options.directResourceTarget) {
    nodes.push(`<w:p><w:r><w:t src="${xmlText(options.directResourceTarget)}">Synthetic resource</w:t></w:r></w:p>`);
  }
  if (nodes.length) zip.file("word/document.xml", documentFile!.asText().replace("</w:body>", `${nodes.join("")}</w:body>`));
  if (options.relationship) {
    const existing = zip.file("word/_rels/document.xml.rels")?.asText() || `<Relationships xmlns="${RELATIONSHIPS_NAMESPACE}"></Relationships>`;
    const next = existing.replace(/<\/Relationships>\s*$/i, `${relationshipXml(options.relationship)}</Relationships>`);
    assert.notEqual(next, existing);
    zip.file("word/_rels/document.xml.rels", next);
  }
  if (options.externalLinksPart) zip.file("word/externalLinks/externalLink1.xml", "<externalLink/> ");
  return new Uint8Array(zip.generate({ type: "uint8array" }));
}

function purchaseOrderSnapshot(): any {
  return {
    documentType: "PURCHASE_ORDER",
    documentId: "po-compatibility",
    documentNumber: "PO-COMPAT-001",
    status: "ISSUED",
    issueDate: "2026-09-12",
    currency: "PHP",
    description: "Synthetic compatibility order",
    notes: "Synthetic test only",
    termsAndConditions: "Net 30",
    company: { legalName: "Synthetic Construction", address: "Test address", contactNumber: "09000000000", email: "test@example.com" },
    supplier: { name: "Synthetic Supplier", address: "Supplier address", email: "supplier@example.com", phone: "09170000000", vatTin: "000" },
    project: { projectCode: "TEST-001", projectName: "Synthetic Project", deliverTo: "Test site" },
    lines: [{ lineNumber: 1, description: "Synthetic material", quantity: 2, unit: "pcs", unitPrice: 100, amount: 200 }],
    totalAmount: 200,
    amountInWords: "two hundred PHP only",
    processor: { name: "Synthetic User", title: "Coordinator" },
    templateVersion: "compatibility",
  };
}

function clientInvoiceSnapshot(): any {
  return {
    documentType: "CLIENT_INVOICE",
    documentId: "invoice-compatibility",
    documentNumber: "INV-COMPAT-001",
    status: "ISSUED",
    invoiceDate: "2026-09-12",
    dueDate: "2026-10-12",
    paymentTerms: "30 days",
    currency: "PHP",
    taxTreatment: "NON_VAT",
    company: { legalName: "Synthetic Construction", address: "Test address", contactNumber: "09000000000", email: "test@example.com", paymentInstructions: "Synthetic instructions" },
    project: { projectCode: "TEST-001", projectName: "Synthetic Project" },
    billTo: { name: "Synthetic Client", contactName: "Accounts Payable", email: "client@example.com", address: "Client address", reference: "Synthetic contract" },
    lines: [{ lineNumber: 1, description: "Synthetic service", amount: 200 }],
    subtotal: 200,
    taxAmount: 0,
    totalAmount: 200,
    amountInWords: "two hundred PHP only",
    notes: "Synthetic test only",
    termsAndConditions: "Net 30",
    processor: { name: "Synthetic User", title: "Coordinator" },
    templateVersion: "compatibility",
  };
}

function snapshotFor(documentType: "PURCHASE_ORDER" | "CLIENT_INVOICE") {
  return documentType === "PURCHASE_ORDER" ? purchaseOrderSnapshot() : clientInvoiceSnapshot();
}

function assertBlocked(bytes: Uint8Array, label: string) {
  assert.throws(
    () => validateDocxTemplateBytes(bytes, `${label}.docx`, DOCX_MIME_TYPE),
    (error: unknown) => error instanceof DocumentTemplateValidationError && error.message === DOCX_EXTERNAL_RESOURCE_MESSAGE,
    label,
  );
}

test("relationship classification permits only inert official mailto/http(s) hyperlinks", () => {
  assert.deepEqual(
    classifyExternalRelationship({ type: HYPERLINK_RELATIONSHIP_TYPE, target: "mailto:test@example.com", targetMode: "External" }),
    { kind: "INERT_HYPERLINK", scheme: "mailto" },
  );
  assert.deepEqual(
    classifyExternalRelationship({ type: HYPERLINK_RELATIONSHIP_TYPE, target: "https://example.test/company", targetMode: "External" }),
    { kind: "INERT_HYPERLINK", scheme: "https" },
  );
  assert.deepEqual(
    classifyExternalRelationship({ type: IMAGE_RELATIONSHIP_TYPE, target: "../media/image1.png" }),
    { kind: "INTERNAL", reason: "package-target" },
  );
  for (const input of [
    { type: IMAGE_RELATIONSHIP_TYPE, target: "https://example.test/image.png", targetMode: "External" },
    { type: IMAGE_RELATIONSHIP_TYPE, target: "file:///tmp/image.png", targetMode: "External" },
    { type: IMAGE_RELATIONSHIP_TYPE, target: "ftp://example.test/image.png", targetMode: "External" },
    { type: IMAGE_RELATIONSHIP_TYPE, target: "//example.test/image.png", targetMode: "External" },
    { type: UNKNOWN_RELATIONSHIP_TYPE, target: "resource.dat", targetMode: "External" },
    { type: OLE_RELATIONSHIP_TYPE, target: "oleObject1.bin" },
  ]) {
    assert.equal(classifyExternalRelationship(input).kind, "BLOCKED_EXTERNAL_RESOURCE");
  }
});

test("Purchase Order and Client Invoice preserve safe mailto hyperlinks through extraction and merge", async () => {
  for (const documentType of ["PURCHASE_ORDER", "CLIENT_INVOICE"] as const) {
    const built = await buildStarterDocxTemplate(documentType);
    const bytes = withDocxParts(built.bytes, {
      relationship: { type: HYPERLINK_RELATIONSHIP_TYPE, target: "mailto:test@example.com", targetMode: "External" },
      hyperlinkText: "Company email",
    });
    const structure = extractDocxStructure(bytes, `${documentType}.docx`);
    assert.match(structure.text, /Company email/);
    const merged = mergeDocxTemplate(bytes, `${documentType}.docx`, snapshotFor(documentType), built.bindings);
    const mergedZip = new PizZip(merged);
    assert.match(mergedZip.file("word/_rels/document.xml.rels")?.asText() || "", /mailto:test@example\.com/);
    assert.match(extractDocxStructure(merged, "merged.docx").text, /Company email/);
  }
});

test("safe HTTP field-code hyperlinks, including split w:instrText and w:fldSimple forms, remain inert", async () => {
  const built = await buildStarterDocxTemplate("PURCHASE_ORDER");
  const bytes = withDocxParts(built.bytes, {
    fieldCodePieces: [" HYPER", "LINK \"https://example.test/company\" ", " DATE \\@ \"HH:mm\" "],
    simpleFieldCode: "HYPERLINK \"mailto:test@example.com\"",
  });
  const merged = mergeDocxTemplate(bytes, "field-code.docx", purchaseOrderSnapshot(), built.bindings);
  const mergedZip = new PizZip(merged);
  const xml = mergedZip.file("word/document.xml")?.asText() || "";
  assert.match(xml, /HYPERLINK/);
  assert.match(xml, /https:\/\/example\.test\/company/);
  assert.match(xml, /mailto:test@example\.com/);
});

test("linked resources, unsafe paths, external objects, unknown relationships, and external-link parts fail closed", async () => {
  const cases = [
    { name: "linked HTTPS image", relationship: { type: IMAGE_RELATIONSHIP_TYPE, target: "https://example.test/image.png", targetMode: "External" } },
    { name: "file URI", relationship: { type: IMAGE_RELATIONSHIP_TYPE, target: "file:///tmp/image.png", targetMode: "External" } },
    { name: "UNC path", relationship: { type: IMAGE_RELATIONSHIP_TYPE, target: String.raw`\\server\share\image.png`, targetMode: "External" } },
    { name: "FTP resource", relationship: { type: IMAGE_RELATIONSHIP_TYPE, target: "ftp://example.test/image.png", targetMode: "External" } },
    { name: "protocol-relative resource", relationship: { type: IMAGE_RELATIONSHIP_TYPE, target: "//example.test/image.png", targetMode: "External" } },
    { name: "attached template", relationship: { type: ATTACHED_TEMPLATE_RELATIONSHIP_TYPE, target: "attachedTemplate.dotx" } },
    { name: "OLE object", relationship: { type: OLE_RELATIONSHIP_TYPE, target: "oleObject1.bin" } },
    { name: "external data link", relationship: { type: EXTERNAL_LINK_RELATIONSHIP_TYPE, target: "externalLink1.xml" } },
    { name: "unknown external relationship", relationship: { type: UNKNOWN_RELATIONSHIP_TYPE, target: "https://example.test/resource", targetMode: "External" } },
  ];
  for (const item of cases) assertBlocked(await starterBytes("PURCHASE_ORDER").then((bytes) => withDocxParts(bytes, { relationship: item.relationship })), item.name);
  assertBlocked(await starterBytes("PURCHASE_ORDER").then((bytes) => withDocxParts(bytes, { externalLinksPart: true })), "externalLinks part");

  for (const item of [
    ["file HYPERLINK field", " HYPERLINK \"file:///tmp/source.docx\" "],
    ["FTP HYPERLINK field", " HYPERLINK \"ftp://example.test/source.docx\" "],
    ["UNC HYPERLINK field", String.raw` HYPERLINK "\\server\share\source.docx" `],
    ["linked image field", " INCLUDEPICTURE \"https://example.test/image.png\" "],
    ["unknown external field", " UNKNOWNFIELD \"https://example.test/resource\" "],
  ] as const) {
    const bytes = withDocxParts(await starterBytes("CLIENT_INVOICE"), { fieldCodePieces: [item[1]] });
    assertBlocked(bytes, item[0]);
  }
  assertBlocked(withDocxParts(await starterBytes("CLIENT_INVOICE"), { directResourceTarget: "https://example.test/image.png" }), "direct resource attribute");
});

test("starter and AI-generated DOCX origins for both document types pass the centralized validator", async () => {
  for (const documentType of ["PURCHASE_ORDER", "CLIENT_INVOICE"] as const) {
    const starter = await buildStarterDocxTemplate(documentType);
    assert.doesNotThrow(() => validateDocxTemplateBytes(starter.bytes, `starter-${documentType}.docx`, DOCX_MIME_TYPE));
    const aiDraft = await buildDocxTemplateFromBlueprint({ ...starterTemplateBlueprint(documentType), title: `Synthetic AI ${documentType}` }, documentType);
    assert.doesNotThrow(() => validateDocxTemplateBytes(aiDraft.bytes, `ai-${documentType}.docx`, DOCX_MIME_TYPE));
  }
});

test("starter DOCX bindings match every emitted tag for both document types", async () => {
  for (const documentType of ["PURCHASE_ORDER", "CLIENT_INVOICE"] as const) {
    const built = await buildStarterDocxTemplate(documentType);
    const structure = extractDocxStructure(built.bytes, `starter-${documentType}.docx`);
    const report = validateDocumentTemplateBindings(documentType, structure.tags, built.bindings);
    assert.equal(report.state, "VALID", `${documentType} starter issues: ${JSON.stringify(report.issues)}`);
    assert.ok(report.tags.includes("company.vatTin"), `${documentType} starter should emit the company VAT/TIN tag.`);
  }
});

function emptyQuery() {
  const query: any = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: null, error: null }),
  };
  return query;
}

async function startUploadServer(options: { metadataError?: boolean } = {}) {
  const storage = new MemoryStorageProvider();
  const authSupabase: any = { from: () => emptyQuery() };
  const serverSupabase: any = {
    rpc: async (name: string, args: any) => {
      if (name !== "server_create_document_template_version") return { data: null, error: null };
      if (options.metadataError) return { data: null, error: { code: "42501", message: "synthetic metadata rejection" } };
      const payload = args.p_payload;
      return {
        data: {
          id: payload.versionId,
          template_id: payload.templateId,
          company_id: payload.companyId,
          document_type: payload.documentType,
          display_name: payload.displayName,
          origin: payload.origin,
          version_number: 1,
          source_filename: payload.sourceFilename,
          source_storage_path: payload.sourceStoragePath,
          content_storage_path: payload.contentStoragePath,
          storage_provider: payload.storageProvider,
          storage_bucket: payload.storageBucket,
          mime_type: payload.mimeType,
          content_size: payload.contentSize,
          content_sha256: payload.contentSha256,
          source_sha256: payload.sourceSha256,
          bindings: payload.bindings,
          validation_state: payload.validationState,
          validation_report: payload.validationReport,
          status: "DRAFT",
        },
        error: null,
      };
    },
  };
  const authorizer = async (): Promise<StorageAuthContext> => ({
    accessToken: "synthetic-token",
    companyId: COMPANY_ID,
    user: { id: USER_ID } as any,
    supabase: authSupabase,
  });
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/document-templates", createDocumentTemplateRouter({
    authorizer,
    providerSupplier: () => storage,
    primaryProviderSupplier: () => storage,
    serverSupabaseSupplier: () => serverSupabase,
  }));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  return { server, storage, url: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server: http.Server) {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

test("safe hyperlinks upload for Purchase Order and Client Invoice, while metadata failure cleans storage", async () => {
  for (const documentType of ["PURCHASE_ORDER", "CLIENT_INVOICE"] as const) {
    const fixture = await startUploadServer();
    try {
      const bytes = withDocxParts(await starterBytes(documentType), {
        relationship: { type: HYPERLINK_RELATIONSHIP_TYPE, target: "mailto:test@example.com", targetMode: "External" },
        hyperlinkText: "Contact company",
      });
      const response = await fetch(`${fixture.url}/api/document-templates/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer synthetic-token" },
        body: JSON.stringify({ documentType, fileName: `${documentType}.docx`, fileData: Buffer.from(bytes).toString("base64") }),
      });
      const responseBody = await response.text();
      assert.equal(response.status, 201, `${documentType}: ${responseBody}`);
      const payload = JSON.parse(responseBody);
      assert.match(payload.data.structure.text, /Contact company/);
      assert.equal(fixture.storage.size(), 1);
    } finally {
      await closeServer(fixture.server);
    }
  }

  const failed = await startUploadServer({ metadataError: true });
  try {
    const bytes = withDocxParts(await starterBytes("PURCHASE_ORDER"), {
      relationship: { type: HYPERLINK_RELATIONSHIP_TYPE, target: "mailto:test@example.com", targetMode: "External" },
      hyperlinkText: "Contact company",
    });
    const response = await fetch(`${failed.url}/api/document-templates/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer synthetic-token" },
      body: JSON.stringify({ documentType: "PURCHASE_ORDER", fileName: "failed.docx", fileData: Buffer.from(bytes).toString("base64") }),
    });
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /permission/i);
    assert.equal(failed.storage.size(), 0);
  } finally {
    await closeServer(failed.server);
  }
});

test("template download, analysis, binding update, duplicate, generation, and finalization share read-time validation", () => {
  const router = readFileSync(new URL("../src/server/documentTemplates/documentTemplateRouter.ts", import.meta.url), "utf8");
  assert.match(router, /async function readTemplateBytes[\s\S]*validateDocxTemplateBytes\(bytes/);
  assert.match(router, /router\.get\("\/:versionId\/content"[\s\S]*readTemplateBytes/);
  assert.match(router, /router\.post\("\/:versionId\/analyze"[\s\S]*readTemplateBytes/);
  assert.match(router, /router\.put\("\/:versionId\/bindings"[\s\S]*readTemplateBytes/);
  assert.match(router, /router\.post\("\/:versionId\/duplicate"[\s\S]*readTemplateBytes/);
  assert.match(router, /router\.post\("\/:versionId\/activate"[\s\S]*readTemplateBytes/);
  assert.match(router, /router\.post\("\/:versionId\/generate"[\s\S]*readTemplateBytes/);
  assert.match(router, /router\.post\("\/:versionId\/finalize-pdf"[\s\S]*readTemplateBytes/);
});
