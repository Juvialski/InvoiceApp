import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const procurementPagePath = new URL("../src/components/procurement/ProcurementPage.tsx", import.meta.url);
const purchaseOrderSectionPath = new URL("../src/components/procurement/PurchaseOrderRegisterSection.tsx", import.meta.url);
const rfqSectionPath = new URL("../src/components/procurement/RfqRegisterSection.tsx", import.meta.url);

function readIfPresent(path: URL): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

test("procurement register presentation has explicit ownership boundaries", () => {
  const procurementPage = readIfPresent(procurementPagePath);
  const purchaseOrderSection = readIfPresent(purchaseOrderSectionPath);
  const rfqSection = readIfPresent(rfqSectionPath);

  assert.match(procurementPage, /import\s+\{\s*PurchaseOrderRegisterSection\s*\}\s+from\s+"\.\/PurchaseOrderRegisterSection\.tsx"/);
  assert.match(procurementPage, /import\s+\{\s*RfqRegisterSection\s*\}\s+from\s+"\.\/RfqRegisterSection\.tsx"/);
  assert.match(purchaseOrderSection, /function\s+PurchaseOrderRegisterCard\b/);
  assert.match(rfqSection, /function\s+RfqRegisterCard\b/);

  assert.match(procurementPage, /import\s+\{\s*PurchaseOrderEditorModal\s*\}/);
  assert.match(procurementPage, /import\s+\{\s*RFQEditorModal\s*\}/);
  assert.match(procurementPage, /import\s+\{\s*SupplierQuotationModal\s*\}/);
  assert.match(procurementPage, /import\s+\{\s*RFQComparisonModal\s*\}/);
  assert.match(procurementPage, /<SubcontractEditorModal\b/);
  assert.match(procurementPage, /<SubcontractClaimsDrawer\b/);
  assert.match(procurementPage, /<SubcontractVariationsDrawer\b/);
});
