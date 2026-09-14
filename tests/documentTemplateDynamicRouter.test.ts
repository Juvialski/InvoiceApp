import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateDocumentTemplateTypeDefinition } from "../src/lib/documentTemplateTypes.ts";
import { validateManagedDocumentInputs } from "../src/server/documentTemplates/documentTemplateContext.ts";

const routerSource = readFileSync(new URL("../src/server/documentTemplates/documentTemplateRouter.ts", import.meta.url), "utf8");

function definition() {
  const result = validateDocumentTemplateTypeDefinition({
    key: "inspection-report",
    displayName: "Inspection Report",
    sourceContext: "PROJECT",
    customFields: [
      { key: "custom.issue_date", label: "Issue date", type: "DATE", required: true },
      { key: "custom.remarks", label: "Remarks", type: "TEXT", required: false },
    ],
    repeatSections: [{
      key: "items",
      label: "Items",
      source: "INPUT",
      fields: [{ key: "item", label: "Item", type: "TEXT", required: true, source: "INPUT" }],
    }],
    status: "ACTIVE",
  });
  if (result.ok === false) throw new Error(result.errors.join(" "));
  return result.definition;
}

test("router exposes dynamic type administration and available/generate operations", () => {
  assert.match(routerSource, /router\.get\("\/types"/);
  assert.match(routerSource, /router\.post\("\/types"/);
  assert.match(routerSource, /router\.put\("\/types\/:typeKey"/);
  assert.match(routerSource, /router\.post\("\/types\/:typeKey\/retire"/);
  assert.match(routerSource, /router\.get\("\/available"/);
  assert.match(routerSource, /router\.post\("\/managed-generate"/);
  assert.doesNotMatch(routerSource, /PROJECT_EQUIPMENT_MATERIALS_CHECKLIST/);
  assert.doesNotMatch(routerSource, /PROJECT_WARRANTY_CERTIFICATE/);
});

test("managed input validation accepts declared values and rejects guessed sensitive fields", () => {
  const result = validateManagedDocumentInputs(definition(), {
    fields: { "custom.issue_date": "2026-09-14", "custom.remarks": "Ready" },
    repeats: { items: [{ item: "Concrete" }] },
  });
  assert.equal(result.ok, true);
  const rejected = validateManagedDocumentInputs(definition(), {
    fields: { "custom.issue_date": "2026-09-14", "payroll.salary": 999999 },
    repeats: { items: [{ item: "Concrete" }] },
  });
  assert.equal(rejected.ok, false);
});
