import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { normalizeDocumentTemplatePreparationResult } from "../src/lib/documentTemplates.ts";

test("prepared-template client normalization preserves the flat server version payload", () => {
  const flatPayload = {
    id: "prepared-version",
    templateId: "template-root",
    companyId: "company-a",
    documentType: "PURCHASE_ORDER",
    displayName: "Prepared PO",
    origin: "DUPLICATED",
    versionNumber: 4,
    sourceStoragePath: "company-a/template.docx",
    contentStoragePath: "company-a/template.docx",
    storageProvider: "supabase",
    storageBucket: "company-document-templates",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    contentSize: 123,
    contentSha256: "a".repeat(64),
    mappingSchemaVersion: "1",
    bindings: [{ tag: "company.legalName", fieldKey: "company.legalName", confirmed: true }],
    validationState: "VALID",
    validationReport: {},
    status: "DRAFT",
    preparation: "AI_AUTO_TAGGED",
    report: { state: "VALID", issues: [], tags: ["company.legalName"] },
    structure: { paragraphs: [], tables: [], text: "", tags: ["company.legalName"] },
  } as const;

  const normalized = normalizeDocumentTemplatePreparationResult(flatPayload as any);
  assert.equal(normalized.version.id, "prepared-version");
  assert.equal(normalized.version.bindings[0]?.fieldKey, "company.legalName");
  assert.equal(normalized.preparation, "AI_AUTO_TAGGED");
});

test("prepareDocumentTemplate uses the normalization boundary before Settings reads result.version.bindings", () => {
  const source = readFileSync(new URL("../src/lib/documentTemplates.ts", import.meta.url), "utf8");
  assert.match(source, /prepareDocumentTemplate[\s\S]*normalizeDocumentTemplatePreparationResult/);
});
