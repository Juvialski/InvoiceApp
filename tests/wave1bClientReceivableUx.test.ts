import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const billingPanel = readFileSync(new URL("../src/components/projects/ClientBillingPanel.tsx", import.meta.url), "utf8");
const collectionSettlementPanel = readFileSync(new URL("../src/components/projects/ClientCollectionSettlementPanel.tsx", import.meta.url), "utf8");
const cashWorkspace = readFileSync(new URL("../src/components/CashSettlementAllocationWorkspace.tsx", import.meta.url), "utf8");
const projectWorkspace = readFileSync(new URL("../src/components/projects/ProjectWorkspace.tsx", import.meta.url), "utf8");
const qaScenarios = readFileSync(new URL("../scripts/qa/demoScenarios.ts", import.meta.url), "utf8");

test("Wave 1B client invoice detail exposes derived collection position and guarded CTA", () => {
  assert.match(billingPanel, /calculateClientBillingCollectionSummary/);
  assert.match(billingPanel, /Invoice amount/);
  assert.match(billingPanel, /Amount collected/);
  assert.match(billingPanel, /Amount remaining/);
  assert.match(billingPanel, /data-testid="record-client-collection"/);
  assert.match(billingPanel, /selectedBilling\.status === "ISSUED"/);
  assert.match(billingPanel, /selectedBillingCollectionSummary\.remainingAmount/);
  assert.match(billingPanel, /client-invoice-collection-history/);
  assert.doesNotMatch(billingPanel, /Mark Collected|Mark collected/);
});

test("Wave 1B carries an exact recorded collection into Cash and back to the selected invoice", () => {
  assert.match(collectionSettlementPanel, /appPathForCashTarget\("CLIENT_COLLECTION", collection\.id, returnToPath\)/);
  assert.match(collectionSettlementPanel, /data-testid="continue-client-collection-to-cash"/);
  assert.match(collectionSettlementPanel, /returnToPath/);
  assert.match(cashWorkspace, /data-testid="cash-return-to-client-invoice"/);
  assert.match(cashWorkspace, /targetContext\.returnTo/);
  assert.match(cashWorkspace, /candidate\.billingId/);
  assert.match(projectWorkspace, /initialBillingId/);
  assert.match(qaScenarios, /verifyClientReceivableLifecycle/);
  assert.match(qaScenarios, /client invoice collection lifecycle verified/);
});
