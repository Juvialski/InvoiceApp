import assert from "node:assert/strict";
import test from "node:test";
import PizZip from "pizzip";
import { buildStarterDocxTemplate } from "../src/server/documentTemplates/documentTemplateEngine.ts";
import { extractDocumentTemplateAnchorInventory } from "../src/server/documentTemplates/documentTemplateAutoTagger.ts";

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
