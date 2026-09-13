import assert from "node:assert/strict";
import test from "node:test";
import PizZip from "pizzip";
import { buildStarterDocxTemplate, extractDocxStructure, mergeDocxTemplate } from "../src/server/documentTemplates/documentTemplateEngine.ts";
import { extractDocumentTemplateAnchorInventory, prepareDocxTemplate, validateTemplateMappingAnalysisAgainstInventory, type DocumentTemplatePreparationPlan } from "../src/server/documentTemplates/documentTemplateAutoTagger.ts";
import { validateTemplateMappingAnalysis } from "../src/lib/documentTemplateRegistry.ts";

const WORD_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

async function taglessPurchaseOrderFixture(options: { duplicateLineTable?: boolean } = {}) {
  const built = await buildStarterDocxTemplate("PURCHASE_ORDER");
  const zip = new PizZip(built.bytes);
  const documentFile = zip.file("word/document.xml");
  assert.ok(documentFile);
  let documentXml = documentFile.asText();
  const replacements: Record<string, string> = {
    "company.legalName": "HYDROQUALISENSE SOLUTIONS CORP",
    "company.address": "01 Pasong Tulo, Santa Rita Bata",
    "company.contactNumber": "09760721144",
    "company.email": "accounts@example.com",
    "company.vatTin": "000-000-000-000",
    "purchaseOrder.documentNumber": "PO-2026-0000",
    "purchaseOrder.currency": "PHP",
    "purchaseOrder.totalAmount": "PHP 3900.00",
    "purchaseOrder.amountInWords": "three thousand nine hundred PHP only",
    "supplier.name": "ABC SUPPLY CO.",
    "supplier.address": "Supplier address",
    "supplier.attention": "Purchasing Department",
    "project.projectCode": "PRJ-001",
    "project.projectName": "Riverside Office",
    "project.deliverTo": "Riverside site",
    "processor.name": "Authorized User",
    "processor.title": "Coordinator",
    "#lines": "",
    "/lines": "",
    lineNumber: "1",
    description: "Concrete materials",
    quantity: "12",
    unit: "bags",
    unitPrice: "PHP 125.00",
    amount: "PHP 1500.00",
  };
  for (const [tag, value] of Object.entries(replacements)) documentXml = documentXml.replaceAll(`{{${tag}}}`, value);
  if (options.duplicateLineTable) {
    const table = documentXml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/i)?.[0];
    assert.ok(table);
    documentXml = documentXml.replace("</w:body>", `${table}</w:body>`);
  }
  zip.file("word/document.xml", documentXml);
  zip.file("word/header1.xml", `<w:hdr xmlns:w="${WORD_NAMESPACE}"><w:p><w:r><w:t>HSC Header</w:t></w:r></w:p></w:hdr>`);
  zip.file("word/footer1.xml", `<w:ftr xmlns:w="${WORD_NAMESPACE}"><w:p><w:r><w:t>HSC Footer</w:t></w:r></w:p></w:ftr>`);
  zip.file("word/media/logo.png", new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
  return new Uint8Array(zip.generate({ type: "uint8array" }));
}

test("anchor discovery returns deterministic scalar, header/footer, and unique line-table locations", async () => {
  const bytes = await taglessPurchaseOrderFixture();
  const first = extractDocumentTemplateAnchorInventory(bytes, "HSC P.O.Template.docx");
  const second = extractDocumentTemplateAnchorInventory(bytes, "HSC P.O.Template.docx");

  assert.deepEqual(first, second);
  assert.ok(first.anchors.some((anchor) => anchor.text.includes("HYDROQUALISENSE SOLUTIONS CORP")));
  assert.ok(first.anchors.some((anchor) => anchor.partKind === "HEADER" && anchor.text === "HSC Header"));
  assert.ok(first.anchors.some((anchor) => anchor.partKind === "FOOTER" && anchor.text === "HSC Footer"));
  assert.ok(first.lineTableCandidates.length >= 1);
  assert.equal(first.lineTable?.status, "UNIQUE");
  assert.ok(first.lineTable?.columns.some((column) => column.suggestedFieldKey === "lines.description"));
  assert.ok(first.lineTable?.columns.some((column) => column.suggestedFieldKey === "lines.amount"));
  assert.ok(first.anchors.every((anchor) => anchor.id && anchor.occurrence >= 1));
  assert.ok(first.anchors.some((anchor) => anchor.targetText === "PO-2026-0000"));
});

test("duplicate line-table candidates remain unresolved instead of selecting by position", async () => {
  const bytes = await taglessPurchaseOrderFixture({ duplicateLineTable: true });
  const inventory = extractDocumentTemplateAnchorInventory(bytes, "duplicate.docx");

  assert.equal(inventory.lineTable, undefined);
  assert.ok(inventory.lineTableCandidates.length >= 2);
  assert.ok(inventory.warnings.some((warning) => /ambiguous|multiple/i.test(warning)));
});

test("anchored mapping validation rejects stale, unknown, and duplicate source locations", async () => {
  const built = await buildStarterDocxTemplate("PURCHASE_ORDER");
  const inventory = extractDocumentTemplateAnchorInventory(built.bytes, "starter.docx");
  const companyAnchor = inventory.anchors.find((anchor) => anchor.text.includes("{{company.legalName}}"));
  assert.ok(companyAnchor);
  const analysis = {
    confidence: 0.95,
    mappings: [{
      fieldKey: "company.legalName",
      sourceLabel: "Company legal name",
      location: "document paragraph",
      anchorId: companyAnchor.id,
      targetText: companyAnchor.targetText,
      confidence: 0.95,
      reason: "The source text is the company identity field.",
      unresolved: false,
    }],
    unresolved: [],
    warnings: [],
  };
  const valid = validateTemplateMappingAnalysis(analysis, "PURCHASE_ORDER");
  assert.equal(valid.ok, true);
  if (valid.ok === false) return;
  assert.equal(validateTemplateMappingAnalysisAgainstInventory(valid.analysis, inventory, "PURCHASE_ORDER").ok, true);

  const stale = validateTemplateMappingAnalysisAgainstInventory({
    ...valid.analysis,
    mappings: [{ ...valid.analysis.mappings[0]!, targetText: "not the uploaded text" }],
  }, inventory, "PURCHASE_ORDER");
  assert.equal(stale.ok, false);
  assert.match(JSON.stringify(stale), /target|source/i);

  const unknown = validateTemplateMappingAnalysisAgainstInventory({
    ...valid.analysis,
    mappings: [{ ...valid.analysis.mappings[0]!, anchorId: "word/document.xml:paragraph:999:occurrence:1" }],
  }, inventory, "PURCHASE_ORDER");
  assert.equal(unknown.ok, false);
  assert.match(JSON.stringify(unknown), /anchor/i);

  const duplicate = validateTemplateMappingAnalysisAgainstInventory({
    ...valid.analysis,
    mappings: [valid.analysis.mappings[0]!, valid.analysis.mappings[0]!],
  }, inventory, "PURCHASE_ORDER");
  assert.equal(duplicate.ok, false);
  assert.match(JSON.stringify(duplicate), /duplicate/i);
});

test("anchored line-table validation requires an existing candidate and allowlisted line fields", async () => {
  const built = await buildStarterDocxTemplate("PURCHASE_ORDER");
  const inventory = extractDocumentTemplateAnchorInventory(built.bytes, "starter.docx");
  assert.ok(inventory.lineTable);
  const lineTable = inventory.lineTable!;
  const analysis = validateTemplateMappingAnalysis({
    confidence: 0.9,
    mappings: [],
    lineTable: {
      location: "document table",
      candidateId: lineTable.id,
      confidence: 0.9,
      fieldKeys: ["lines.lineNumber", "lines.description", "lines.amount"],
      columns: [
        { columnIndex: 0, fieldKey: "lines.lineNumber" },
        { columnIndex: 3, fieldKey: "lines.description" },
        { columnIndex: 5, fieldKey: "lines.amount" },
      ],
    },
    unresolved: [],
    warnings: [],
  }, "PURCHASE_ORDER");
  assert.equal(analysis.ok, true);
  if (analysis.ok === false) return;
  assert.equal(validateTemplateMappingAnalysisAgainstInventory(analysis.analysis, inventory, "PURCHASE_ORDER").ok, true);

  const invalid = validateTemplateMappingAnalysisAgainstInventory({
    ...analysis.analysis,
    lineTable: {
      ...analysis.analysis.lineTable!,
      candidateId: "word/document.xml:table:99:header:0",
      columns: [{ columnIndex: 0, fieldKey: "invoice.totalAmount" }],
    },
  }, inventory, "PURCHASE_ORDER");
  assert.equal(invalid.ok, false);
  assert.match(JSON.stringify(invalid), /candidate|field|line/i);
});

function purchaseOrderPreparationPlan(bytes: Uint8Array): DocumentTemplatePreparationPlan {
  const inventory = extractDocumentTemplateAnchorInventory(bytes, "HSC P.O.Template.docx");
  const anchorFor = (predicate: (text: string) => boolean) => {
    const anchor = inventory.anchors.find((candidate) => predicate(candidate.text) && candidate.targetText);
    assert.ok(anchor);
    return anchor;
  };
  const mappings = [
    ["company.legalName", anchorFor((text) => text.includes("HYDROQUALISENSE SOLUTIONS CORP"))],
    ["purchaseOrder.documentNumber", anchorFor((text) => text.startsWith("No.:"))],
    ["purchaseOrder.currency", anchorFor((text) => text.startsWith("Currency:"))],
    ["purchaseOrder.totalAmount", anchorFor((text) => text.includes("PHP 3900.00"))],
    ["supplier.name", anchorFor((text) => text.startsWith("Supplier name:"))],
  ].map(([fieldKey, anchor]) => ({ fieldKey, anchorId: anchor.id, targetText: anchor.targetText, confirmed: true }));
  assert.ok(inventory.lineTable);
  return {
    documentType: "PURCHASE_ORDER",
    mappings,
    lineTable: {
      candidateId: inventory.lineTable!.id,
      columns: inventory.lineTable!.columns.flatMap((column) => column.suggestedFieldKey ? [{ columnIndex: column.columnIndex, fieldKey: column.suggestedFieldKey }] : []),
    },
  };
}

function purchaseOrderMergeSnapshot() {
  return {
    documentType: "PURCHASE_ORDER" as const,
    documentId: "prepared-po",
    documentNumber: "PO-PREPARED-001",
    status: "ISSUED" as const,
    issueDate: "2026-09-13",
    currency: "PHP",
    description: "Prepared test order",
    notes: "Synthetic test",
    termsAndConditions: "Net 30",
    company: { legalName: "Prepared Company", address: "Prepared address", contactNumber: "09000000000", email: "company@example.com" },
    supplier: { name: "Prepared Supplier", address: "Supplier address", email: "supplier@example.com", phone: "09170000000", vatTin: "000", attention: "Purchasing" },
    project: { projectCode: "PREP-001", projectName: "Prepared Project", deliverTo: "Prepared site" },
    lines: [{ lineNumber: 1, description: "First prepared line", quantity: 2, unit: "pcs", unitPrice: 100, amount: 200 }, { lineNumber: 2, description: "Second prepared line", quantity: 3, unit: "bags", unitPrice: 50, amount: 150 }],
    totalAmount: 350,
    amountInWords: "three hundred fifty PHP only",
    processor: { name: "Prepared User", title: "Coordinator" },
    templateVersion: "prepared",
  };
}

test("preparation inserts allowlisted scalar and repeating tags while preserving unrelated package parts", async () => {
  const original = await taglessPurchaseOrderFixture();
  const originalZip = new PizZip(original);
  const plan = purchaseOrderPreparationPlan(original);
  const prepared = prepareDocxTemplate(original, "HSC P.O.Template.docx", "PURCHASE_ORDER", plan);
  const structure = extractDocxStructure(prepared.bytes, "prepared.docx");

  assert.equal(prepared.report.state, "VALID", JSON.stringify(prepared.report.issues));
  assert.ok(structure.tags.includes("company.legalName"));
  assert.ok(structure.tags.includes("purchaseOrder.documentNumber"));
  assert.ok(structure.tags.includes("supplier.name"));
  assert.ok(structure.tags.includes("#lines"));
  assert.ok(structure.tags.includes("/lines"));
  assert.ok(structure.tags.includes("lineNumber"));
  assert.ok(structure.tags.includes("description"));
  assert.ok(structure.tags.includes("amount"));
  assert.match(new PizZip(prepared.bytes).file("word/document.xml")?.asText() || "", /w:tbl/);
  assert.deepEqual([...new PizZip(prepared.bytes).file("word/media/logo.png")!.asUint8Array()], [...originalZip.file("word/media/logo.png")!.asUint8Array()]);
  assert.equal(new PizZip(prepared.bytes).file("word/header1.xml")?.asText(), originalZip.file("word/header1.xml")?.asText());
  assert.equal(new PizZip(prepared.bytes).file("word/footer1.xml")?.asText(), originalZip.file("word/footer1.xml")?.asText());

  const merged = mergeDocxTemplate(prepared.bytes, "prepared.docx", purchaseOrderMergeSnapshot(), prepared.bindings);
  const mergedStructure = extractDocxStructure(merged, "merged.docx");
  assert.match(mergedStructure.text, /Prepared Company/);
  assert.match(mergedStructure.text, /First prepared line/);
  assert.match(mergedStructure.text, /Second prepared line/);
});

test("preparation refuses an ambiguous line table without creating transformed bytes", async () => {
  const original = await taglessPurchaseOrderFixture({ duplicateLineTable: true });
  const inventory = extractDocumentTemplateAnchorInventory(original, "duplicate.docx");
  assert.equal(inventory.lineTable, undefined);
  const firstCandidate = inventory.lineTableCandidates[0];
  assert.ok(firstCandidate);
  const plan: DocumentTemplatePreparationPlan = {
    documentType: "PURCHASE_ORDER",
    mappings: [],
    lineTable: { candidateId: firstCandidate.id, columns: [{ columnIndex: 0, fieldKey: "lines.lineNumber" }, { columnIndex: 3, fieldKey: "lines.description" }, { columnIndex: 5, fieldKey: "lines.amount" }] },
  };
  assert.throws(() => prepareDocxTemplate(original, "duplicate.docx", "PURCHASE_ORDER", plan), /unknown or ambiguous|uniquely identified/i);
});
