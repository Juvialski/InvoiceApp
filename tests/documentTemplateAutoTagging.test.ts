import assert from "node:assert/strict";
import test from "node:test";
import PizZip from "pizzip";
import { buildStarterDocxTemplate } from "../src/server/documentTemplates/documentTemplateEngine.ts";
import { extractDocumentTemplateAnchorInventory, validateTemplateMappingAnalysisAgainstInventory } from "../src/server/documentTemplates/documentTemplateAutoTagger.ts";
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
