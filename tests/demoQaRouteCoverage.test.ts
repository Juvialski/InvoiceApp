import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEMO_QA_SCENARIOS } from "../scripts/qa/demoScenarios.ts";
import { ROUTE_DEFINITIONS } from "../src/utils/routes.ts";

test("every canonical active application route has demo browser smoke coverage", () => {
  const coveredRouteIds = new Set(DEMO_QA_SCENARIOS.map((scenario) => scenario.route.id));
  const missing = ROUTE_DEFINITIONS
    .map((route) => route.id)
    .filter((routeId) => !coveredRouteIds.has(routeId));

  assert.deepEqual(missing, []);
});

test("settings QA verifies the client settings surface without internal roadmap content", () => {
  const scenario = DEMO_QA_SCENARIOS.find((candidate) => candidate.route.id === "settings");
  assert.ok(scenario);
  assert.equal(scenario.interactionState, "settings product surface verified");
  assert.equal(typeof scenario.action, "function");
});

test("demo settings does not mount production company access management", () => {
  const demoWorkspace = readFileSync(new URL("../src/demo/DemoWorkspace.tsx", import.meta.url), "utf8");
  const settings = readFileSync(new URL("../src/components/Settings.tsx", import.meta.url), "utf8");
  assert.match(demoWorkspace, /showDeploymentAccessManagement=\{false\}/);
  assert.match(settings, /showDeploymentAccessManagement && <DeploymentAccessManagement \/>/);
});

test("demo Documents coverage includes the three Document Center views", () => {
  const states = DEMO_QA_SCENARIOS
    .filter((scenario) => scenario.route.id === "documents")
    .map((scenario) => scenario.interactionState);
  assert.ok(states.includes("unified document Library rendered"));
  assert.ok(states.includes("Document Center Create rendered"));
  assert.ok(states.includes("Document Center Templates rendered"));
});

test("Projects attention-filter QA follows the card-first default instead of requiring the optional compact list", () => {
  const scenariosSource = readFileSync(new URL("../scripts/qa/demoScenarios.ts", import.meta.url), "utf8");
  const attentionActionStart = scenariosSource.indexOf("const verifyPortfolioAttention");
  const attentionActionEnd = scenariosSource.indexOf("const verifyProjectAttentionAndEngineering", attentionActionStart);
  assert.ok(attentionActionStart >= 0 && attentionActionEnd > attentionActionStart);
  const attentionAction = scenariosSource.slice(attentionActionStart, attentionActionEnd);
  assert.match(attentionAction, /Projects list cards/);
  assert.match(attentionAction, /data-project-id/);
  assert.doesNotMatch(attentionAction, /Projects table/);
});

test("Procurement draft QA keeps approval hidden until the new PO is persisted", () => {
  const scenariosSource = readFileSync(new URL("../scripts/qa/demoScenarios.ts", import.meta.url), "utf8");
  const procurementActionStart = scenariosSource.indexOf("const verifyProcurementDraftWorksheets");
  const procurementActionEnd = scenariosSource.indexOf("const verifyClientInvoiceDocumentDeliverySurface", procurementActionStart);
  assert.ok(procurementActionStart >= 0 && procurementActionEnd > procurementActionStart);
  const procurementAction = scenariosSource.slice(procurementActionStart, procurementActionEnd);
  assert.match(procurementAction, /const approval = await page\.getByRole\("button", \{ name: "Approve PO", exact: true \}\)\.count\(\);/);
  assert.match(procurementAction, /approval === 0/);
  assert.match(procurementAction, /Save this draft before approval/);\n  assert.match(procurementAction, /page\\.locator\\(\"text=Save this draft before approval becomes available\\.\"\\)/);\n  assert.doesNotMatch(procurementAction, /getByText/);
  assert.match(procurementAction, /const issueConfirmation = await page\.getByRole\("button", \{ name: "Confirm Issue", exact: true \}\)\.count\(\);/);
  assert.match(procurementAction, /issueConfirmation === 1/);
});

test("demo Procurement route receives the seeded RFQ and quotation evidence", () => {
  const demoWorkspace = readFileSync(new URL("../src/demo/DemoWorkspace.tsx", import.meta.url), "utf8");
  assert.match(demoWorkspace, /rfqs=\{data\.rfqs \|\| \[\]\}/);
  assert.match(demoWorkspace, /supplierQuotations=\{data\.supplierQuotations \|\| \[\]\}/);
});
