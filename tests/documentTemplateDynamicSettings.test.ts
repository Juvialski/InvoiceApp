import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const settingsSource = readFileSync(new URL("../src/components/access/CompanyDocumentTemplatesSettings.tsx", import.meta.url), "utf8");
const clientSource = readFileSync(new URL("../src/lib/documentTemplates.ts", import.meta.url), "utf8");

test("Templates administration discovers company-defined types instead of hardcoded HSC cards", () => {
  assert.match(settingsSource, /listDocumentTemplateTypes/);
  assert.match(settingsSource, /New template type|New document type/);
  assert.match(settingsSource, /customFields|repeatSections/);
  assert.doesNotMatch(settingsSource, /PROJECT_EQUIPMENT_MATERIALS_CHECKLIST/);
  assert.doesNotMatch(settingsSource, /PROJECT_WARRANTY_CERTIFICATE/);
  assert.doesNotMatch(settingsSource, /DOCUMENT_TEMPLATE_TYPES\.map/);
});

test("client API exposes dynamic type lifecycle and available-generation operations", () => {
  assert.match(clientSource, /listDocumentTemplateTypes/);
  assert.match(clientSource, /createDocumentTemplateType/);
  assert.match(clientSource, /updateDocumentTemplateType/);
  assert.match(clientSource, /retireDocumentTemplateType/);
  assert.match(clientSource, /listAvailableDocumentTemplates/);
  assert.match(clientSource, /generateManagedDocument/);
});
