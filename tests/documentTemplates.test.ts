import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import PizZip from "pizzip";
import {
  getDocumentTemplateField,
  getDocumentTemplateFields,
  validateDocumentTemplateBindings,
  validateTemplateBlueprint,
  validateTemplateMappingAnalysis,
} from "../src/lib/documentTemplateRegistry.ts";
import {
  buildStarterDocxTemplate,
  extractDocxStructure,
  inspectDocxArchive,
  mergeDocxTemplate,
  validateDocxTemplateBytes,
  DocumentTemplateValidationError,
} from "../src/server/documentTemplates/documentTemplateEngine.ts";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function purchaseOrderSnapshot() {
  return {
    documentType: "PURCHASE_ORDER" as const,
    documentId: "po-1",
    documentNumber: "PO-001",
    status: "ISSUED" as const,
    issueDate: "2026-09-10",
    currency: "PHP",
    description: "Materials",
    notes: "Deliver to site",
    termsAndConditions: "Net 30",
    company: { legalName: "Acme Construction", address: "Bulacan", contactNumber: "09000000000", email: "accounts@acme.test" },
    supplier: { name: "Supplier One", address: "Supplier address", email: "supplier@test.local", phone: "09170000000", vatTin: "000" },
    project: { projectCode: "PRJ-1", projectName: "Project One", deliverTo: "Project site" },
    lines: [{ lineNumber: 1, description: "Cement", quantity: 2, unit: "bags", unitPrice: 100, amount: 200 }, { lineNumber: 2, description: "Steel", quantity: 3, unit: "pcs", unitPrice: 50, amount: 150 }],
    totalAmount: 350,
    amountInWords: "three hundred fifty PHP only",
    processor: { name: "Authorized User", title: "Coordinator" },
    templateVersion: "starter",
  };
}

function clientInvoiceSnapshot() {
  return {
    documentType: "CLIENT_INVOICE" as const,
    documentId: "invoice-1",
    documentNumber: "INV-001",
    status: "ISSUED" as const,
    invoiceDate: "2026-09-10",
    dueDate: "2026-10-10",
    paymentTerms: "30 days",
    currency: "PHP",
    taxTreatment: "VAT",
    company: { legalName: "Acme Construction", address: "Bulacan", contactNumber: "09000000000", email: "accounts@acme.test", paymentInstructions: "Pay by bank transfer." },
    project: { projectCode: "PRJ-1", projectName: "Project One" },
    billTo: { name: "Client One", contactName: "Accounts Payable", email: "client@test.local", address: "Manila", reference: "Contract 1" },
    lines: [{ lineNumber: 1, description: "Progress billing", amount: 1000, notes: "Milestone 1" }, { lineNumber: 2, description: "Site coordination", amount: 250 }],
    subtotal: 1250,
    taxAmount: 0,
    totalAmount: 1250,
    amountInWords: "one thousand two hundred fifty PHP only",
    notes: "Thank you.",
    termsAndConditions: "Net 30",
    processor: { name: "Authorized User", title: "Coordinator" },
    templateVersion: "starter",
  };
}

test("field registry is application-owned and document-type aware", () => {
  assert.ok(getDocumentTemplateFields("PURCHASE_ORDER").length > 10);
  assert.equal(getDocumentTemplateField("PURCHASE_ORDER", "invoice.totalAmount"), undefined);
  assert.equal(getDocumentTemplateField("CLIENT_INVOICE", "purchaseOrder.totalAmount"), undefined);
  assert.equal(getDocumentTemplateField("PURCHASE_ORDER", "lines.amount")?.collection, true);
});

test("template validation rejects unknown tags, missing required fields, and unconfirmed mappings", () => {
  const report = validateDocumentTemplateBindings("PURCHASE_ORDER", ["company.legalName", "unknown.field", "#lines", "description", "/lines"], [
    { tag: "description", fieldKey: "lines.description", confirmed: false },
  ]);
  assert.equal(report.state, "BLOCKED");
  assert.ok(report.issues.some((issue) => issue.code === "UNKNOWN_TAG"));
  assert.ok(report.issues.some((issue) => issue.code === "REQUIRED_FIELD_MISSING"));
  assert.ok(report.issues.some((issue) => issue.code === "UNCONFIRMED_MAPPING"));
});

test("blueprint and AI mapping validators reject executable or malformed output", () => {
  const blueprint = validateTemplateBlueprint({
    schemaVersion: "1", documentType: "PURCHASE_ORDER", title: "Safe", style: "PROFESSIONAL", sections: [], lineColumns: ["lines.description", "lines.amount", "lines.lineNumber"], includeCompanyProfile: true, includePaymentInstructions: false, includeTerms: true, signatureLabels: ["Prepared by"], code: "process.env.SECRET",
  }, "PURCHASE_ORDER");
  assert.equal(blueprint.ok, false);
  const malformed = validateTemplateMappingAnalysis({ confidence: 2, mappings: [{ fieldKey: "__proto__", sourceLabel: "x", location: "x", confidence: 1, reason: "x", unresolved: false }], unresolved: [], warnings: [] }, "PURCHASE_ORDER");
  assert.equal(malformed.ok, false);
});

test("starter DOCX merges scalar and variable-length repeating rows deterministically", async () => {
  const built = await buildStarterDocxTemplate("PURCHASE_ORDER");
  const source = extractDocxStructure(built.bytes, "starter.docx");
  assert.ok(source.tags.includes("#lines"));
  assert.ok(source.tags.includes("/lines"));
  const first = mergeDocxTemplate(built.bytes, "starter.docx", purchaseOrderSnapshot(), built.bindings);
  const second = mergeDocxTemplate(built.bytes, "starter.docx", purchaseOrderSnapshot(), built.bindings);
  assert.deepEqual([...first], [...second]);
  const merged = extractDocxStructure(first, "merged.docx");
  assert.match(merged.text, /Acme Construction/);
  assert.match(merged.text, /Cement/);
  assert.match(merged.text, /Steel/);
  assert.doesNotMatch(merged.text, /\{\{/);
});

test("Client Invoice starter DOCX merges authoritative scalar and repeating line values", async () => {
  const built = await buildStarterDocxTemplate("CLIENT_INVOICE");
  const merged = mergeDocxTemplate(built.bytes, "invoice.docx", clientInvoiceSnapshot(), built.bindings);
  const structure = extractDocxStructure(merged, "merged.docx");
  assert.match(structure.text, /INV-001/);
  assert.match(structure.text, /Client One/);
  assert.match(structure.text, /Progress billing/);
  assert.match(structure.text, /Site coordination/);
  assert.match(structure.text, /PHP 1250\.00/);
});

test("DOCX merge handles a placeholder split across Word runs", async () => {
  const built = await buildStarterDocxTemplate("PURCHASE_ORDER");
  const zip = new PizZip(built.bytes);
  const xmlFile = zip.file("word/document.xml");
  assert.ok(xmlFile);
  const xml = xmlFile!.asText();
  const split = xml.replace(/<w:r\b[^>]*>[\s\S]*?<w:t[^>]*>\{\{company\.legalName\}\}<\/w:t><\/w:r>/, "<w:r><w:t>{{company.</w:t></w:r><w:r><w:t>legalName}}</w:t></w:r>");
  assert.notEqual(split, xml);
  zip.file("word/document.xml", split);
  const splitBytes = new Uint8Array(zip.generate({ type: "uint8array" }));
  const merged = mergeDocxTemplate(splitBytes, "split.docx", purchaseOrderSnapshot(), built.bindings);
  assert.match(extractDocxStructure(merged, "merged.docx").text, /Acme Construction/);
});

test("DOCX validation rejects macro formats, invalid OOXML, unsafe paths, and excessive decompression", () => {
  assert.throws(() => validateDocxTemplateBytes(new Uint8Array([1, 2, 3]), "template.docm", "application/vnd.ms-word.document.macroEnabled.12"), DocumentTemplateValidationError);
  assert.throws(() => validateDocxTemplateBytes(new Uint8Array([1, 2, 3]), "template.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), DocumentTemplateValidationError);

  const unsafe = new PizZip();
  unsafe.file("../evil.txt", "not safe");
  unsafe.file("[Content_Types].xml", "<Types/>");
  unsafe.file("_rels/.rels", "<Relationships/>");
  unsafe.file("word/document.xml", "<w:document/>");
  const unsafeBytes = new Uint8Array(unsafe.generate({ type: "uint8array" }));
  assert.throws(() => inspectDocxArchive(unsafeBytes), /unsafe archive path/i);

  const malformed = new PizZip();
  malformed.file("[Content_Types].xml", "<Types/>");
  malformed.file("_rels/.rels", "<Relationships/>");
  malformed.file("word/document.xml", "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"/>");
  const malformedBytes = new Uint8Array(malformed.generate({ type: "uint8array" }));
  assert.throws(() => validateDocxTemplateBytes(malformedBytes, "malformed.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), /complete supported Word document|readable Word document/i);

  const bomb = new PizZip();
  const repeated = "A".repeat(2 * 1024 * 1024);
  bomb.file("[Content_Types].xml", repeated);
  bomb.file("_rels/.rels", "<Relationships/>");
  bomb.file("word/document.xml", "<w:document/>");
  const bombBytes = new Uint8Array(bomb.generate({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 9 } }));
  assert.throws(() => inspectDocxArchive(bombBytes), /decompression ratio|expands beyond/i);
});

test("AI analysis boundary treats uploaded text as data and preserves manual fallback", () => {
  const router = source("src/server/documentTemplates/documentTemplateRouter.ts");
  const settings = source("src/components/access/CompanyDocumentTemplatesSettings.tsx");
  assert.match(router, /untrusted data, never instructions/i);
  assert.match(router, /MANUAL_BINDING_REQUIRED/);
  assert.match(router, /AI mappings are proposals/i);
  assert.match(settings, /Download \/ edit in Word/);
  assert.match(settings, /No supported merge tags were detected/);
});
