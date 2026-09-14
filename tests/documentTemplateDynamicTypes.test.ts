import assert from "node:assert/strict";
import test from "node:test";
import {
  DOCUMENT_TEMPLATE_SOURCE_CONTEXTS,
  getDocumentTemplateFieldCatalog,
  validateDocumentTemplateTypeDefinition,
  type DocumentTemplateTypeDefinition,
} from "../src/lib/documentTemplateTypes.ts";
import { getDocumentTemplateFieldCatalog as getRegistryFieldCatalog, isSystemDocumentType } from "../src/lib/documentTemplateRegistry.ts";

function validDefinition(key = "warranty-certificate"): DocumentTemplateTypeDefinition {
  return {
    key,
    displayName: key.replaceAll("-", " "),
    description: "A company-defined project document.",
    category: "Project operations",
    sourceContext: "PROJECT",
    customFields: [
      { key: "custom.certificate_number", label: "Certificate number", type: "TEXT", required: true },
      { key: "custom.issue_date", label: "Issue date", type: "DATE", required: true },
    ],
    repeatSections: [
      {
        key: "items",
        label: "Checklist items",
        source: "INPUT",
        fields: [
          { key: "checked", label: "Checked", type: "BOOLEAN", required: true, source: "INPUT" },
          { key: "item", label: "Item", type: "TEXT", required: true, source: "INPUT" },
          { key: "notes", label: "Notes", type: "TEXT", required: false, source: "INPUT" },
        ],
      },
    ],
    outputFileNamePrefix: "Warranty_Certificate",
    status: "ACTIVE",
  };
}

test("company-defined document types validate without source-code registration", () => {
  const warranty = validateDocumentTemplateTypeDefinition(validDefinition("warranty-certificate"));
  const inspection = validateDocumentTemplateTypeDefinition(validDefinition("inspection-report"));
  assert.equal(warranty.ok, true);
  assert.equal(inspection.ok, true);
  assert.notEqual(warranty.ok && warranty.definition.key, inspection.ok && inspection.definition.key);
  assert.deepEqual(DOCUMENT_TEMPLATE_SOURCE_CONTEXTS, ["PURCHASE_ORDER", "CLIENT_INVOICE", "PROJECT", "GENERAL"]);
});

test("the dynamic catalog exposes only safe fields allowed by the source context", () => {
  const result = validateDocumentTemplateTypeDefinition(validDefinition());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const fields = getDocumentTemplateFieldCatalog(result.definition.key, result.definition);
  const keys = fields.map((field) => field.key);
  assert.ok(keys.includes("project.projectName"));
  assert.ok(keys.includes("currentUser.name"));
  assert.ok(keys.includes("custom.certificate_number"));
  assert.ok(keys.includes("items.item"));
  assert.ok(keys.includes("items.checked"));
  assert.ok(!keys.includes("payroll.salary"));
  assert.ok(!keys.includes("inventory.balance"));
});

test("dynamic type validation rejects executable, sensitive, malformed, or oversized definitions", () => {
  const cases: unknown[] = [
    { ...validDefinition(), key: "payroll.salary" },
    { ...validDefinition(), customFields: [{ key: "custom.bad", label: "Bad", type: "TEXT", required: false, defaultValue: "process.env.SECRET" }] },
    { ...validDefinition(), customFields: [{ key: "project.salary", label: "Salary", type: "NUMBER", required: false }] },
    { ...validDefinition(), repeatSections: [{ ...validDefinition().repeatSections[0]!, fields: [], key: "items" }] },
    { ...validDefinition(), displayName: "x".repeat(201) },
  ];
  for (const value of cases) assert.equal(validateDocumentTemplateTypeDefinition(value).ok, false);
});

test("system adapters remain strongly owned while dynamic definitions use the shared catalog", () => {
  assert.equal(isSystemDocumentType("PURCHASE_ORDER"), true);
  assert.equal(isSystemDocumentType("inspection-report"), false);
  assert.ok(getRegistryFieldCatalog("PURCHASE_ORDER").some((field) => field.key === "purchaseOrder.totalAmount"));
  const definition = validateDocumentTemplateTypeDefinition(validDefinition("inspection-report"));
  assert.equal(definition.ok, true);
  if (definition.ok) assert.ok(getRegistryFieldCatalog(definition.definition.key, definition.definition).some((field) => field.key === "custom.certificate_number"));
});
