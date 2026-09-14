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

test("project-asset collections cannot be attached to a weaker non-project source context", () => {
  const projectAssetSection = {
    key: "assets",
    label: "Project assets",
    source: "PROJECT_ASSETS" as const,
    fields: [
      { key: "item", label: "Item", type: "TEXT" as const, required: true, source: "PROJECT_ASSET" as const, sourceKey: "item" as const },
      { key: "checked", label: "Checked", type: "BOOLEAN" as const, required: false, source: "INPUT" as const },
    ],
  };
  assert.equal(validateDocumentTemplateTypeDefinition({ ...validDefinition(), sourceContext: "PROJECT", repeatSections: [projectAssetSection] }).ok, true);
  assert.equal(validateDocumentTemplateTypeDefinition({ ...validDefinition(), sourceContext: "GENERAL", repeatSections: [projectAssetSection] }).ok, false);
});

test("financial source adapters reserve their authoritative lines collection", () => {
  for (const sourceContext of ["PURCHASE_ORDER", "CLIENT_INVOICE"] as const) {
    const result = validateDocumentTemplateTypeDefinition({
      ...validDefinition(`custom-${sourceContext.toLowerCase()}`),
      sourceContext,
      repeatSections: [{ key: "lines", label: "Replacement lines", source: "INPUT", fields: [{ key: "item", label: "Item", type: "TEXT", required: true, source: "INPUT" }] }],
    });
    assert.equal(result.ok, false);
  }
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

test("custom financial template types inherit authoritative source fields without hardcoded registration", () => {
  const customPo = validateDocumentTemplateTypeDefinition({ ...validDefinition("supplier-order-cover"), sourceContext: "PURCHASE_ORDER", repeatSections: [] });
  const customInvoice = validateDocumentTemplateTypeDefinition({ ...validDefinition("client-billing-certificate"), sourceContext: "CLIENT_INVOICE", repeatSections: [] });
  assert.equal(customPo.ok, true);
  assert.equal(customInvoice.ok, true);
  if (customPo.ok) {
    const keys = getRegistryFieldCatalog(customPo.definition.key, customPo.definition).map((field) => field.key);
    assert.ok(keys.includes("purchaseOrder.totalAmount"));
    assert.ok(keys.includes("supplier.name"));
    assert.ok(keys.includes("custom.certificate_number"));
  }
  if (customInvoice.ok) {
    const keys = getRegistryFieldCatalog(customInvoice.definition.key, customInvoice.definition).map((field) => field.key);
    assert.ok(keys.includes("invoice.totalAmount"));
    assert.ok(keys.includes("billTo.name"));
    assert.ok(keys.includes("custom.certificate_number"));
  }
});
