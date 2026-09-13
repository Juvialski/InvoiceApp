import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ROUTE_DEFINITIONS } from "../src/utils/routes.ts";
import { getLocalQaScenarioDefinitions, LOCAL_QA_VIEWPORTS } from "../scripts/qa/localQaScenarios.ts";

const localQaSource = readFileSync(new URL("../scripts/qa/localQa.ts", import.meta.url), "utf8");

test("authenticated Local-QA scenario catalog covers every canonical route at required viewports", () => {
  const definitions = getLocalQaScenarioDefinitions();
  const requiredRouteIds = new Set(ROUTE_DEFINITIONS.map((route) => route.id));
  const coveredRouteIds = new Set(definitions.map((scenario) => scenario.path === "/email-sms" ? "inbox" : ROUTE_DEFINITIONS.find((route) => route.path === scenario.path)?.id));
  assert.deepEqual(coveredRouteIds, requiredRouteIds);
  assert.equal(definitions.length, ROUTE_DEFINITIONS.length * LOCAL_QA_VIEWPORTS.length);
  assert.deepEqual(new Set(definitions.map((scenario) => scenario.viewport.name)), new Set(["desktop-1440", "tablet-768", "mobile-390"]));
  assert.ok(definitions.some((scenario) => scenario.id === "route-projects-mobile-390"));
  assert.ok(definitions.some((scenario) => scenario.id === "route-procurement-tablet-768"));
});

test("Local-QA runner waits for delayed authentication and does not persist the raw QA email", () => {
  assert.match(localQaSource, /waitForAuthenticationOrWorkspace/);
  assert.match(localQaSource, /userMatchesExpected/);
  assert.doesNotMatch(localQaSource, /email:\s*EXPECTED_EMAIL/);
  assert.match(localQaSource, /schemaVersion:\s*2/);
  assert.match(localQaSource, /ROUTE_DEFINITIONS\.map\(\(route\) => route\.path\)/);
  assert.match(localQaSource, /cleanUnsafeScreenshotArtifacts/);
  assert.match(localQaSource, /desktop\|tablet/);
  assert.match(localQaSource, /runLocalQaScenarios/);
});

test("Local-QA comprehensive gate refuses blocked, untested, or unavailable scenario coverage", () => {
  assert.match(localQaSource, /const coverageGaps = scenarioRun\.scenarios\.filter/);
  assert.match(localQaSource, /scenario\.status !== "PASS"/);
  assert.match(localQaSource, /item\.id\.endsWith\("-available"\)/);
  assert.match(localQaSource, /Authenticated Local-QA coverage incomplete/);
});

test("Local-QA PDF evidence captures preview screenshots and exact rendered page counts", () => {
  assert.match(localQaSource, /preview\.screenshot\(\{ path: previewScreenshotPath \}\)/);
  assert.match(localQaSource, /renderedPages !== pageCount/);
  assert.match(localQaSource, /previewScreenshotPath/);
  assert.match(localQaSource, /downloadedPdfPath/);
  assert.match(localQaSource, /evidence\.pdfChecks = await pdfEvidence\(session\.page\)/);
});

test("Local-QA scenario evidence keeps AI-unconfigured responses explicit and SMS non-mutating", () => {
  const scenarios = readFileSync(new URL("../scripts/qa/localQaScenarios.ts", import.meta.url), "utf8");
  assert.match(scenarios, /api\/deployment\/company-ai/);
  assert.match(scenarios, /ERR_ABORTED|aborted/);
  assert.match(scenarios, /interactiveOverflowCount/);
  assert.match(scenarios, /details:not\(\[open\]\)/);
  assert.match(scenarios, /No SMS provider or send action is used/);
  assert.match(scenarios, /Prepared by \/ Processed by name/);
  assert.doesNotMatch(scenarios, /sendEmailMessageByGmail|sendSms/i);
});

test("Procurement Local-QA opens the RFQ action from the RFQ tab and fails closed when required controls are absent", () => {
  const scenarios = readFileSync(new URL("../scripts/qa/localQaScenarios.ts", import.meta.url), "utf8");
  assert.match(scenarios, /const rfqTab = page\.getByRole\("button", \{ name: \/Requests for Quotation \\\(RFQs\\\)\/ \}\);[\s\S]*?rfqTab\.first\(\)\.click\(\);[\s\S]*?new-rfq-dialog/);
  assert.match(scenarios, /assertion\(`\$\{actionId\}-available`, false,/);
  assert.match(scenarios, /assertion\("rfq-tab-present", true,/);
  assert.match(scenarios, /assertion\("rfq-tab-available", false,/);
});

test("Local-QA runner includes the broader functional sweep and keeps its failure gate explicit", () => {
  assert.match(localQaSource, /runLocalQaFunctionalSweep/);
  assert.match(localQaSource, /evidence\.functionalSweep = functionalSweep/);
  assert.match(localQaSource, /functionalGaps = functionalSweep\.workflows\.filter/);
  const functional = readFileSync(new URL("../scripts/qa/localQaFunctionalSweep.ts", import.meta.url), "utf8");
  assert.match(functional, /functional-procurement-rfq-quotation/);
  assert.match(functional, /functional-po-receipt-warehouse/);
  assert.match(functional, /functional-supplier-invoice-expense-cash/);
  assert.match(functional, /functional-client-invoice-collection-cash/);
  assert.match(functional, /functional-payroll-approval-settlement/);
  assert.match(functional, /functional-documents-email-review/);
  assert.match(functional, /functional-deep-link-recovery/);
  assert.match(functional, /functional-document-template-storage/);
  assert.match(functional, /template-storage-capability/);
  assert.match(functional, /waitForTemplateCapability/);
  assert.match(functional, /setInputFiles/);
  assert.match(functional, /NOT_CERTIFIED|not certified/i);
  const documentsWorkflow = functional.slice(functional.indexOf("async function runDocumentsEmailWorkflow"), functional.indexOf("type TemplateDocumentType"));
  assert.doesNotMatch(documentsWorkflow, /Confirm & Send[\s\S]*?click\(\)/);
});

test("Projects Local-QA accepts the disclosed portfolio summary semantics", () => {
  const scenarios = readFileSync(new URL("../scripts/qa/localQaScenarios.ts", import.meta.url), "utf8");
  assert.match(scenarios, /page\.locator\("\[aria-label='Portfolio Management Summary'\]"\)/);
  assert.doesNotMatch(scenarios, /getByRole\("region", \{ name: "Portfolio Management Summary" \}\)/);
});

test("supplier payable Local-QA preserves verified supplier-derived DRAFT settlement eligibility", () => {
  const functional = readFileSync(new URL("../scripts/qa/localQaFunctionalSweep.ts", import.meta.url), "utf8");
  assert.match(functional, /verified supplier-derived DRAFT remains payable through Cash & Banking/);
  assert.match(functional, /Record Payment/);
  assert.doesNotMatch(functional, /if \(!\/Payment settlement is unavailable while this expense is DRAFT\/i\.test\(expenseBody\)\)/);
});

test("document-template AI Local-QA covers both Purchase Order and Client Invoice", () => {
  const functional = readFileSync(new URL("../scripts/qa/localQaFunctionalSweep.ts", import.meta.url), "utf8");
  const start = functional.indexOf("async function runDocumentTemplateAiWorkflow");
  const end = functional.indexOf("async function runDeepLinkWorkflow", start);
  assert.ok(start >= 0 && end > start, "AI template workflow should remain an isolated functional step.");
  const aiWorkflow = functional.slice(start, end);
  assert.match(aiWorkflow, /for \(const documentType of \["PURCHASE_ORDER", "CLIENT_INVOICE"\] as const\)/);
  assert.match(aiWorkflow, /selectTemplateType\(page, documentType\)/);
});
