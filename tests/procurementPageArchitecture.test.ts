import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const procurementPagePath = new URL("../src/components/procurement/ProcurementPage.tsx", import.meta.url);
const purchaseOrderSectionPath = new URL("../src/components/procurement/PurchaseOrderRegisterSection.tsx", import.meta.url);
const rfqSectionPath = new URL("../src/components/procurement/RfqRegisterSection.tsx", import.meta.url);
const subcontractSectionPath = new URL("../src/components/procurement/SubcontractRegisterSection.tsx", import.meta.url);

function readIfPresent(path: URL): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

test("procurement register presentation has explicit ownership boundaries", () => {
  const procurementPage = readIfPresent(procurementPagePath);
  const purchaseOrderSection = readIfPresent(purchaseOrderSectionPath);
  const rfqSection = readIfPresent(rfqSectionPath);
  const subcontractSection = readIfPresent(subcontractSectionPath);

  assert.match(procurementPage, /import\s+\{\s*PurchaseOrderRegisterSection\s*\}\s+from\s+"\.\/PurchaseOrderRegisterSection\.tsx"/);
  assert.match(procurementPage, /import\s+\{\s*RfqRegisterSection\s*\}\s+from\s+"\.\/RfqRegisterSection\.tsx"/);
  assert.match(procurementPage, /import\s+\{\s*SubcontractRegisterSection[\s\S]*?\}\s+from\s+"\.\/SubcontractRegisterSection\.tsx"/);
  assert.match(procurementPage, /<SubcontractRegisterSection\b/);
  assert.match(purchaseOrderSection, /function\s+PurchaseOrderRegisterCard\b/);
  assert.match(rfqSection, /function\s+RfqRegisterCard\b/);
  assert.match(subcontractSection, /function\s+SubcontractRegisterCard\b/);

  assert.doesNotMatch(subcontractSection, /from\s+["']\.\.\/\.\.\/lib\/(?:subcontracts|subcontractClaims|subcontractVariations)\.ts["']/);

  assert.match(procurementPage, /import\s+\{\s*PurchaseOrderEditorModal\s*\}/);
  assert.match(procurementPage, /import\s+\{\s*RFQEditorModal\s*\}/);
  assert.match(procurementPage, /import\s+\{\s*SupplierQuotationModal\s*\}/);
  assert.match(procurementPage, /import\s+\{\s*RFQComparisonModal\s*\}/);
  assert.match(procurementPage, /import\s+\{\s*SubcontractEditorModal\s*\}/);
  assert.match(procurementPage, /import\s+\{\s*SubcontractCancellationModal\s*\}/);
  assert.match(procurementPage, /import\s+\{\s*SubcontractClaimEditorModal\s*\}/);
  assert.match(procurementPage, /import\s+\{\s*SubcontractVariationModal\s*\}/);
  assert.match(procurementPage, /import\s+\{\s*SubcontractVariationDetailModal\s*\}/);
  assert.match(procurementPage, /<SubcontractEditorModal\b/);
  assert.match(procurementPage, /<SubcontractCancellationModal\b/);
  assert.match(procurementPage, /<SubcontractClaimEditorModal\b/);
  assert.match(procurementPage, /<SubcontractClaimsDrawer\b/);
  assert.match(procurementPage, /<SubcontractVariationModal\b/);
  assert.match(procurementPage, /<SubcontractVariationDetailModal\b/);
  assert.match(procurementPage, /<SubcontractVariationsDrawer\b/);
  assert.match(procurementPage, /const\s+handleSaveSubcontractInternal\s*=/);
  assert.match(procurementPage, /const\s+handleTransitionSubcontractInternal\s*=/);
  assert.match(procurementPage, /const\s+handleDeleteSubcontractInternal\s*=/);
  assert.match(procurementPage, /const\s+handleSaveClaimInternal\s*=/);
  assert.match(procurementPage, /const\s+handleTransitionClaimInternal\s*=/);
  assert.match(procurementPage, /const\s+handleSaveVariationInternal\s*=/);
  assert.match(procurementPage, /const\s+handleTransitionVariationInternal\s*=/);
});
