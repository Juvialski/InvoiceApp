import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import PizZip from "pizzip";
import test from "node:test";
import {
  getDocumentTemplateFieldCatalog,
  validateDocumentTemplateTypeDefinition,
  type DocumentTemplateTypeDefinition,
} from "../src/lib/documentTemplateTypes.ts";
import {
  mergeDocumentTemplate,
  validateDocxTemplateBytes,
} from "../src/server/documentTemplates/documentTemplateEngine.ts";
import { extractDocumentTemplateAnchorInventory as getAnchorInventory } from "../src/server/documentTemplates/documentTemplateAutoTagger.ts";
import { prepareDocxTemplate, type DocumentTemplatePreparationPlan } from "../src/server/documentTemplates/documentTemplateAutoTagger.ts";
import type { DocumentTemplateRenderContext } from "../src/server/documentTemplates/documentTemplateContext.ts";

const WORD_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function definition(): DocumentTemplateTypeDefinition {
  const result = validateDocumentTemplateTypeDefinition({
    key: "inspection-report",
    displayName: "Inspection Report",
    sourceContext: "PROJECT",
    customFields: [
      { key: "custom.issue_date", label: "Issue date", type: "DATE", required: true },
    ],
    repeatSections: [
      {
        key: "items",
        label: "Inspection items",
        source: "INPUT",
        fields: [
          { key: "checked", label: "Checked", type: "BOOLEAN", required: false, source: "INPUT" },
          { key: "item", label: "Item", type: "TEXT", required: true, source: "INPUT" },
          { key: "notes", label: "Notes", type: "TEXT", required: false, source: "INPUT" },
        ],
      },
    ],
    status: "ACTIVE",
  });
  if (result.ok === false) throw new Error(result.errors.join(" "));
  return result.definition;
}

function minimalDocx(): Uint8Array {
  const zip = new PizZip();
  zip.file("[Content_Types].xml", "<?xml version=\"1.0\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>");
  zip.file("_rels/.rels", "<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"></Relationships>");
  zip.file("word/document.xml", "<w:document xmlns:w=\"" + WORD_NAMESPACE + "\"><w:body><w:p><w:r><w:t>Project: {{project.projectName}}</w:t></w:r></w:p><w:p><w:r><w:t>Date: {{custom.issue_date}}</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Item</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Notes</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>{{#items}}{{items.checked}} {{items.item}}{{/items}}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{{items.notes}}</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr/></w:body></w:document>");
  return new Uint8Array(zip.generate({ type: "uint8array" }));
}

test("generic managed render context merges scalar and repeating custom fields deterministically", () => {
  const typeDefinition = definition();
  const context: DocumentTemplateRenderContext = {
    typeKey: typeDefinition.key,
    scalarValues: {
      "project.projectName": "Riverside Project",
      "custom.issue_date": "14.09.2026",
    },
    collections: {
      items: [
        { "items.checked": "☑", "items.item": "Concrete inspection", "items.notes": "Passed" },
        { "items.checked": "☐", "items.item": "Steel inspection", "items.notes": "Review required" },
      ],
    },
  };
  const fields = getDocumentTemplateFieldCatalog(typeDefinition.key, typeDefinition);
  const bindings = fields.filter((field) => ["project.projectName", "custom.issue_date", "items.checked", "items.item", "items.notes"].includes(field.key)).map((field) => ({ tag: field.key, fieldKey: field.key, confirmed: true }));
  const source = minimalDocx();
  validateDocxTemplateBytes(source, "inspection.docx");
  const first = mergeDocumentTemplate(source, "inspection.docx", context, bindings, typeDefinition);
  const second = mergeDocumentTemplate(source, "inspection.docx", context, bindings, typeDefinition);
  assert.deepEqual([...first], [...second]);
  const zip = new PizZip(first);
  const xml = zip.file("word/document.xml")?.asText() || "";
  assert.match(xml, /Riverside Project/);
  assert.match(xml, /14\.09\.2026/);
  assert.match(xml, /Concrete inspection/);
  assert.match(xml, /Steel inspection/);
  assert.doesNotMatch(xml, /\\{\\{/);
});

test("production template code does not hardcode the HSC warranty wording or permanent HSC types", () => {
  const paths = [
    "src/lib/documentTemplateRegistry.ts",
    "src/lib/documentTemplateTypes.ts",
    "src/server/documentTemplates/documentTemplateEngine.ts",
    "src/server/documentTemplates/documentTemplateAutoTagger.ts",
  ];
  for (const path of paths) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /HYDROQUALISENSE SOLUTIONS CORP provides a one/);
    assert.doesNotMatch(source, /PROJECT_EQUIPMENT_MATERIALS_CHECKLIST/);
    assert.doesNotMatch(source, /PROJECT_WARRANTY_CERTIFICATE/);
  }
});

test("the HSC checklist and warranty fixtures expose generic definition-driven anchors", () => {
  const checklist = validateDocumentTemplateTypeDefinition({
    key: "materials-checklist",
    displayName: "Materials Checklist",
    sourceContext: "PROJECT",
    customFields: [
      { key: "custom.others", label: "Others", type: "TEXT", required: false },
      { key: "custom.remarks", label: "Remarks", type: "TEXT", required: false },
    ],
    repeatSections: [
      {
        key: "items",
        label: "Checklist items",
        source: "PROJECT_ASSETS",
        fields: [
          { key: "checked", label: "Checked", type: "BOOLEAN", required: true, source: "INPUT" },
          { key: "item", label: "Item", type: "TEXT", required: true, source: "PROJECT_ASSET", sourceKey: "item" },
          { key: "notes", label: "Notes", type: "TEXT", required: false, source: "PROJECT_ASSET", sourceKey: "notes" },
        ],
      },
    ],
    status: "ACTIVE",
  });
  const warranty = validateDocumentTemplateTypeDefinition({
    key: "warranty-certificate",
    displayName: "Warranty Certificate",
    sourceContext: "PROJECT",
    customFields: [
      { key: "custom.issue_date", label: "Issue date", type: "DATE", required: true },
      { key: "custom.issuer_name", label: "Issuer name", type: "TEXT", required: true },
      { key: "custom.issuer_title", label: "Issuer title", type: "TEXT", required: false },
    ],
    repeatSections: [],
    status: "ACTIVE",
  });
  assert.equal(checklist.ok, true);
  assert.equal(warranty.ok, true);
  if (!checklist.ok || !warranty.ok) return;
  const checklistBytes = new Uint8Array(readFileSync("tests/fixtures/document-templates/hsc/HSC Checklist Template - Revised.docx"));
  const warrantyBytes = new Uint8Array(readFileSync("tests/fixtures/document-templates/hsc/Warranty Certificate Template - Revised.docx"));
  const checklistInventory = getAnchorInventory(checklistBytes, "HSC Checklist Template - Revised.docx", checklist.definition);
  const warrantyInventory = getAnchorInventory(warrantyBytes, "Warranty Certificate Template - Revised.docx", warranty.definition);
  assert.ok(checklistInventory.lineTable?.columns.some((column) => column.suggestedFieldKey === "items.item"));
  assert.ok(checklistInventory.anchors.some((anchor) => anchor.insertionMode === "ADJACENT_CELL" && anchor.text === "PROJECT NAME"));
  assert.ok(warrantyInventory.anchors.some((anchor) => anchor.targetText === "20th day of September, 2023"));
  assert.ok(warrantyInventory.anchors.some((anchor) => anchor.targetText === "Engr. MITZIE C. SALVADOR"));
});

test("generic preparation tags the HSC checklist and warranty without permanent HSC mappings", () => {
  const checklistDefinitionResult = validateDocumentTemplateTypeDefinition({
    key: "materials-checklist",
    displayName: "Materials Checklist",
    sourceContext: "PROJECT",
    customFields: [
      { key: "custom.others", label: "Others", type: "TEXT", required: false },
      { key: "custom.remarks", label: "Remarks", type: "TEXT", required: false },
    ],
    repeatSections: [
      {
        key: "items",
        label: "Checklist items",
        source: "PROJECT_ASSETS",
        fields: [
          { key: "checked", label: "Checked", type: "BOOLEAN", required: false, source: "INPUT" },
          { key: "item", label: "Item", type: "TEXT", required: true, source: "PROJECT_ASSET", sourceKey: "item" },
          { key: "notes", label: "Notes", type: "TEXT", required: false, source: "PROJECT_ASSET", sourceKey: "notes" },
        ],
      },
    ],
    status: "ACTIVE",
  });
  const warrantyDefinitionResult = validateDocumentTemplateTypeDefinition({
    key: "warranty-certificate",
    displayName: "Warranty Certificate",
    sourceContext: "PROJECT",
    customFields: [
      { key: "custom.issue_date", label: "Issue date", type: "DATE", required: true },
      { key: "custom.issuer_name", label: "Issuer name", type: "TEXT", required: true },
    ],
    repeatSections: [],
    status: "ACTIVE",
  });
  if (checklistDefinitionResult.ok === false || warrantyDefinitionResult.ok === false) return;
  assert.equal(checklistDefinitionResult.ok, true);
  assert.equal(warrantyDefinitionResult.ok, true);

  const checklistBytes = new Uint8Array(readFileSync("tests/fixtures/document-templates/hsc/HSC Checklist Template - Revised.docx"));
  const checklistInventory = getAnchorInventory(checklistBytes, "HSC Checklist Template - Revised.docx", checklistDefinitionResult.definition);
  const checklistProject = checklistInventory.anchors.find((anchor) => anchor.text === "PROJECT NAME" && anchor.insertionMode === "ADJACENT_CELL");
  const checklistLocation = checklistInventory.anchors.find((anchor) => anchor.text === "PROJECT LOCATION" && anchor.insertionMode === "ADJACENT_CELL");
  const checklistRemarks = checklistInventory.anchors.find((anchor) => anchor.text === "Remarks:");
  assert.ok(checklistProject && checklistLocation && checklistRemarks && checklistInventory.lineTable);
  const checklistPlan: DocumentTemplatePreparationPlan = {
    documentType: checklistDefinitionResult.definition.key,
    mappings: [
      { fieldKey: "project.projectName", anchorId: checklistProject!.id, targetText: checklistProject!.targetText!, confirmed: true },
      { fieldKey: "project.location", anchorId: checklistLocation!.id, targetText: checklistLocation!.targetText!, confirmed: true },
      { fieldKey: "custom.remarks", anchorId: checklistRemarks!.id, targetText: checklistRemarks!.targetText!, confirmed: true },
    ],
    lineTable: {
      candidateId: checklistInventory.lineTable!.id,
      columns: checklistInventory.lineTable!.columns.flatMap((column) => column.suggestedFieldKey ? [{ columnIndex: column.columnIndex, fieldKey: column.suggestedFieldKey }] : []),
    },
  };
  const preparedChecklist = prepareDocxTemplate(checklistBytes, "HSC Checklist Template - Revised.docx", checklistDefinitionResult.definition.key, checklistPlan, checklistDefinitionResult.definition);
  assert.equal(preparedChecklist.report.state, "VALID", JSON.stringify(preparedChecklist.report.issues));
  assert.ok(preparedChecklist.inventory.anchors.length > 0);

  const warrantyBytes = new Uint8Array(readFileSync("tests/fixtures/document-templates/hsc/Warranty Certificate Template - Revised.docx"));
  const warrantyInventory = getAnchorInventory(warrantyBytes, "Warranty Certificate Template - Revised.docx", warrantyDefinitionResult.definition);
  const projectName = warrantyInventory.anchors.find((anchor) => anchor.text === "PROJECT NAME" && anchor.insertionMode === "ADJACENT_CELL");
  const projectLocation = warrantyInventory.anchors.find((anchor) => anchor.text === "PROJECT LOCATION" && anchor.insertionMode === "ADJACENT_CELL");
  const issueDate = warrantyInventory.anchors.find((anchor) => anchor.targetText === "20th day of September, 2023");
  const issuerName = warrantyInventory.anchors.find((anchor) => anchor.targetText === "Engr. MITZIE C. SALVADOR");
  assert.ok(projectName && projectLocation && issueDate && issuerName);
  const warrantyPlan: DocumentTemplatePreparationPlan = {
    documentType: warrantyDefinitionResult.definition.key,
    mappings: [
      { fieldKey: "project.projectName", anchorId: projectName!.id, targetText: projectName!.targetText!, confirmed: true },
      { fieldKey: "project.location", anchorId: projectLocation!.id, targetText: projectLocation!.targetText!, confirmed: true },
      { fieldKey: "custom.issue_date", anchorId: issueDate!.id, targetText: issueDate!.targetText!, confirmed: true },
      { fieldKey: "custom.issuer_name", anchorId: issuerName!.id, targetText: issuerName!.targetText!, confirmed: true },
    ],
  };
  const preparedWarranty = prepareDocxTemplate(warrantyBytes, "Warranty Certificate Template - Revised.docx", warrantyDefinitionResult.definition.key, warrantyPlan, warrantyDefinitionResult.definition);
  assert.equal(preparedWarranty.report.state, "VALID", JSON.stringify(preparedWarranty.report.issues));
  assert.equal(new PizZip(preparedWarranty.bytes).file("word/media/image2.jpeg")?.asUint8Array().byteLength, new PizZip(warrantyBytes).file("word/media/image2.jpeg")?.asUint8Array().byteLength);
});
